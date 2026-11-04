import { type ArenaGameId, type Level, type MatchLength, type Outcome, isArenaId, isLength, isLevel } from '../arena/core.ts';
import { toDataError } from './errors.ts';
import type { Rpc } from './repositories.ts';

/**
 * Strategy Arena match summaries on the server (supabase/migrations/20261104120000_arena_match_summaries.sql).
 *
 * Arena matches still run entirely on the device and keep their full records there (src/features/arena/records.ts).
 * When a match finishes, a summary — the result screen's facts, nothing more — is queued here and uploaded:
 * no seed, no rounds, no hidden roles, no bot decisions.
 *
 * The queue is the outbox pattern again (src/data/outbox.ts), kept separate because its entries are inserts, not
 * progress diffs:
 * - Each summary has a device-made UUID; the server ignores ids it already has, so retrying is always safe.
 * - It belongs to one signed-in user (`owner`). A queue saved for anyone else is discarded on restore, so a summary
 *   can never be uploaded to another account.
 * - Transient failures (offline, timeouts) keep the batch and retry with backoff; a batch the server refuses outright
 *   is dropped, so one bad entry can't block the rest.
 * - Entries leave the queue only once the server has confirmed them.
 */

export interface ArenaSummary {
  /** UUID made on the device when the match finished. */
  id: string;
  game: ArenaGameId;
  opponent: string;
  level: Level;
  variant: string;
  length: MatchLength;
  outcome: Outcome;
  playerScore: number;
  rivalScore: number;
  rounds: number;
  /** ms since epoch. */
  playedAt: number;
}

export interface ArenaRepository {
  /** Uploads up to 50 summaries; resolves with how many were new to the server. */
  record(matches: ArenaSummary[]): Promise<number>;
  /** The caller's recent summaries, newest first. */
  mine(): Promise<ArenaSummary[]>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z][a-z-]{1,31}$/;
const isOutcome = (x: unknown): x is Outcome => x === 'win' || x === 'loss' || x === 'draw';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** A well-formed summary, or null. Everything read back (from storage or the server) passes through this. */
export function parseSummary(raw: unknown): ArenaSummary | null {
  const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!o) return null;
  if (typeof o.id !== 'string' || !UUID.test(o.id) || !isArenaId(o.game) || typeof o.opponent !== 'string' || !SLUG.test(o.opponent)) return null;
  if (!isLevel(o.level) || typeof o.variant !== 'string' || !SLUG.test(o.variant) || !isLength(o.length) || !isOutcome(o.outcome)) return null;
  if (!isNum(o.playerScore) || !isNum(o.rivalScore) || !isNum(o.rounds) || !isNum(o.playedAt)) return null;
  return { id: o.id, game: o.game, opponent: o.opponent, level: o.level, variant: o.variant, length: o.length, outcome: o.outcome, playerScore: Math.round(o.playerScore), rivalScore: Math.round(o.rivalScore), rounds: Math.round(o.rounds), playedAt: Math.round(o.playedAt) };
}

export function arenaRepository(rpc: Rpc): ArenaRepository {
  return {
    async record(matches) {
      if (!matches.length) return 0;
      try {
        const r = (await rpc.call('record_arena_matches', { request: { matches } })) as { recorded?: unknown } | null;
        return typeof r?.recorded === 'number' ? r.recorded : 0;
      } catch (e) {
        throw toDataError(e);
      }
    },
    async mine() {
      try {
        const r = await rpc.call('get_my_arena_matches');
        return (Array.isArray(r) ? r : []).map(parseSummary).filter((x): x is ArenaSummary => x !== null);
      } catch (e) {
        throw toDataError(e);
      }
    },
  };
}

export interface UploadStorage {
  load: () => Promise<string | null>;
  save: (value: string | null) => Promise<void>;
}

export interface ArenaUploaderOptions {
  send: (batch: ArenaSummary[]) => Promise<unknown>;
  storage: UploadStorage;
  /** Whether an error is worth retrying (offline, timeout, 5xx) or a refusal to drop. */
  transient: (error: unknown) => boolean;
  retryBaseMs?: number;
  maxRetryMs?: number;
  batchSize?: number;
}

export const ARENA_BATCH = 50;

export class ArenaUploader {
  private queue: ArenaSummary[] = [];
  private owner: string | null = null;
  private inflight: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private stopped = false;
  private readonly o: ArenaUploaderOptions;

  constructor(options: ArenaUploaderOptions) {
    this.o = options;
  }

  /** Load the saved queue for this user; a queue saved for anyone else is discarded. Then try to send it. */
  async restore(owner: string): Promise<void> {
    this.owner = owner;
    this.stopped = false;
    try {
      const raw = await this.o.storage.load();
      const saved = raw ? (JSON.parse(raw) as { owner?: unknown; queue?: unknown }) : null;
      this.queue = saved && saved.owner === owner && Array.isArray(saved.queue) ? saved.queue.map(parseSummary).filter((x): x is ArenaSummary => x !== null) : [];
    } catch {
      this.queue = [];
    }
    await this.persist();
    if (this.queue.length) this.schedule(0);
  }

  /** Queue a finished match for upload. Ignored until a user is restored, and for an id already queued. */
  enqueue(summary: ArenaSummary): void {
    if (this.owner === null || this.stopped) return;
    const s = parseSummary(summary);
    if (!s || this.queue.some((q) => q.id === s.id)) return;
    this.queue.push(s);
    void this.persist();
    this.schedule(this.failures ? null : 0);
  }

  /** Send everything now. True once the queue is empty; false if a transient failure left entries waiting. */
  async drain(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.queue.length && !this.stopped) {
      const ok = await this.sendOnce();
      if (!ok) return false;
    }
    return this.queue.length === 0;
  }

  /** Pause: cancel any scheduled send and refuse new entries (pending ones stay saved). */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Forget every pending summary and the saved copy — once the account they belong to has been deleted. */
  async clear(): Promise<void> {
    this.stop();
    if (this.inflight) await this.inflight.catch(() => undefined);
    this.queue = [];
    this.owner = null;
    this.failures = 0;
    await this.o.storage.save(null).catch(() => undefined);
  }

  get pending(): number {
    return this.queue.length;
  }

  private async persist(): Promise<void> {
    if (this.owner === null) return;
    await this.o.storage.save(this.queue.length ? JSON.stringify({ owner: this.owner, queue: this.queue }) : null).catch(() => undefined);
  }

  private schedule(delay: number | null): void {
    if (this.stopped) return;
    if (this.timer) {
      if (delay === null) return;
      clearTimeout(this.timer);
    }
    const ms = delay ?? Math.min((this.o.retryBaseMs ?? 2000) * 2 ** (this.failures - 1), this.o.maxRetryMs ?? 60000);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sendOnce().then(() => {
        if (this.queue.length && !this.timer) this.schedule(this.failures ? null : 0);
      });
    }, ms);
  }

  private sendOnce(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    if (!this.queue.length || this.stopped) return Promise.resolve(true);
    this.inflight = this.attempt().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async attempt(): Promise<boolean> {
    const owner = this.owner;
    const batch = this.queue.slice(0, this.o.batchSize ?? ARENA_BATCH);
    try {
      await this.o.send(batch);
    } catch (e) {
      if (this.o.transient(e)) {
        this.failures += 1;
        return false;
      }
      // Refused outright: drop this batch so it can't block the rest.
    }
    // The account may have changed (deleted, signed out) while the request was in flight: don't touch its queue.
    if (this.owner !== owner) return true;
    const sent = new Set(batch.map((b) => b.id));
    this.queue = this.queue.filter((q) => !sent.has(q.id));
    this.failures = 0;
    await this.persist();
    return true;
  }
}
