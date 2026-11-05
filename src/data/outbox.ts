import { type ProgressChanges, isEmpty, mergeChanges } from './changes.ts';
import { operationId } from './sync/ids.ts';

/**
 * The write queue between the store and Supabase. The store changes immediately, as it always did; each change is
 * queued here as one operation with a stable id and sent in order, one request at a time, so the database applies
 * them in the order they happened.
 *
 * - With `sendOps` (the app), the oldest operations go in one request, each with its id. The server records which
 *   ids it has applied (`apply_progress_ops`), so a request whose answer was lost — a timeout after the write — is
 *   recognised when it is sent again and nothing is applied twice, a reset included.
 * - With `send` (older servers, and tests), operations waiting together are merged and sent as one transaction
 *   (`mergeChanges`); every write is idempotent, so a request that may or may not have arrived is simply sent again.
 * - Transient failures (offline, timeouts, 5xx) retry with backoff; the queue is saved — one row per operation in the
 *   local database (`store`), or as one document (`storage`) — so it survives a restart or the app being killed. It
 *   is a queue of pending writes, never a second copy of the progress: entries leave as soon as the server has them,
 *   and it belongs to one signed-in user.
 * - Operations the server refuses outright (invalid data, permission) are set aside and reported, so one bad write
 *   can't block everything after it.
 */

export type FailureKind = 'transient' | 'permanent';

export interface OutboxStatus {
  pending: number;
  state: 'idle' | 'saving' | 'retrying' | 'error';
  /** Plain-language reason for `retrying` / `error`. */
  message: string | null;
}

export interface OutboxEntry {
  id: string;
  changes: ProgressChanges;
}

/** The whole queue saved as one document (AsyncStorage-style). */
export interface OutboxStorage {
  load: () => Promise<string | null>;
  save: (value: string | null) => Promise<void>;
}

/** The queue saved one operation per row (the local database). Every call is scoped to one owner. */
export interface OutboxStore {
  load(owner: string): Promise<OutboxEntry[]>;
  append(owner: string, entry: OutboxEntry): Promise<void>;
  remove(owner: string, ids: readonly string[]): Promise<void>;
  /** Refused for good: set aside (not resent). */
  fail(owner: string, ids: readonly string[], message: string): Promise<void>;
  /** A failed attempt, for diagnosis (count, time, next retry). Optional. */
  note?(owner: string, ids: readonly string[], at: number, nextAt: number, message: string): Promise<void>;
  clear(owner: string): Promise<void>;
}

export interface OutboxOptions {
  /** Merged mode: one batch meaning "everything queued, in order". */
  send?: (changes: ProgressChanges) => Promise<void>;
  /** Per-operation mode: the oldest operations, in order, each with its id. Takes precedence over `send`. */
  sendOps?: (ops: readonly OutboxEntry[]) => Promise<void>;
  /** Most operations per request in per-operation mode (default 50). */
  maxOps?: number;
  classify: (error: unknown) => { kind: FailureKind; message: string };
  storage?: OutboxStorage;
  store?: OutboxStore;
  debounceMs?: number;
  /** Retry delays start here (default 1 s) and double up to `maxRetryMs` (default 30 s) — unless `retryDelay` is set. */
  retryBaseMs?: number;
  maxRetryMs?: number;
  retryDelay?: (failures: number) => number;
  newId?: () => string;
  onStatus?: (status: OutboxStatus) => void;
}

interface Persistence {
  load(owner: string): Promise<OutboxEntry[]>;
  added(owner: string, entry: OutboxEntry, all: readonly OutboxEntry[]): Promise<void>;
  removed(owner: string, ids: readonly string[], all: readonly OutboxEntry[]): Promise<void>;
  failed(owner: string, ids: readonly string[], message: string, all: readonly OutboxEntry[]): Promise<void>;
  attempted(owner: string, ids: readonly string[], nextAt: number, message: string): Promise<void>;
  cleared(owner: string | null): Promise<void>;
}

function documentPersistence(storage: OutboxStorage, newId: () => string): Persistence {
  const save = (owner: string, all: readonly OutboxEntry[]) => storage.save(all.length ? JSON.stringify({ owner, entries: all }) : null);
  return {
    async load(owner) {
      const raw = await storage.load();
      const saved = raw ? (JSON.parse(raw) as { owner?: string; entries?: OutboxEntry[]; queue?: ProgressChanges[] }) : null;
      if (!saved || saved.owner !== owner) return [];
      if (Array.isArray(saved.entries)) return saved.entries.filter((e) => e && typeof e.id === 'string' && e.changes);
      // Saved by a build before operation ids: give each batch one now.
      if (Array.isArray(saved.queue)) return saved.queue.map((changes) => ({ id: newId(), changes }));
      return [];
    },
    added: (owner, _e, all) => save(owner, all),
    removed: (owner, _ids, all) => save(owner, all),
    failed: (owner, _ids, _m, all) => save(owner, all),
    attempted: async () => undefined,
    cleared: () => storage.save(null),
  };
}

function rowPersistence(store: OutboxStore): Persistence {
  return {
    load: (owner) => store.load(owner),
    added: (owner, entry) => store.append(owner, entry),
    removed: (owner, ids) => store.remove(owner, ids),
    failed: (owner, ids, message) => store.fail(owner, ids, message),
    attempted: (owner, ids, nextAt, message) => store.note?.(owner, ids, Date.now(), nextAt, message) ?? Promise.resolve(),
    // Rows are per owner: clearing never touches another account's pending writes.
    cleared: (owner) => (owner ? store.clear(owner) : Promise.resolve()),
  };
}

export class Outbox {
  private queue: OutboxEntry[] = [];
  private owner: string | null = null;
  private inflight: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private status: OutboxStatus = { pending: 0, state: 'idle', message: null };
  private waiters: (() => void)[] = [];
  /** Bumped by restore() and clear(): a send still in flight for an earlier owner must not touch the new queue. */
  private generation = 0;
  /** Saves happen one at a time, in order, so a later save can never be overtaken by an earlier one. */
  private saving: Promise<void> = Promise.resolve();
  private paused = false;

  private readonly o: OutboxOptions;
  private readonly p: Persistence;
  private readonly newId: () => string;

  constructor(options: OutboxOptions) {
    if (!options.send && !options.sendOps) throw new Error('Outbox needs send or sendOps');
    this.o = options;
    this.newId = options.newId ?? operationId;
    if (options.store) this.p = rowPersistence(options.store);
    else if (options.storage) this.p = documentPersistence(options.storage, this.newId);
    else throw new Error('Outbox needs store or storage');
  }

  /** Load the saved queue for this user. Anything saved for anyone else is never loaded. */
  async restore(owner: string): Promise<void> {
    if (this.owner !== owner) {
      // Another account's changes in memory never carry over: they are theirs (and saved under their id).
      this.generation++;
      this.queue = [];
      this.failures = 0;
    }
    this.owner = owner;
    const generation = this.generation;
    try {
      const loaded = await this.p.load(owner);
      if (generation !== this.generation) return;
      // The same owner restored again: changes enqueued meanwhile stay, after what was saved earlier.
      const ids = new Set(loaded.map((e) => e.id));
      this.queue = [...loaded, ...this.queue.filter((e) => !ids.has(e.id))];
    } catch {
      // Unreadable storage: keep what is in memory; it still sends.
    }
    this.emit(this.queue.length ? 'saving' : 'idle', null);
  }

  /** Queue a change. The returned promise resolves once it is saved (await it before relying on a restart). */
  enqueue(changes: ProgressChanges): Promise<void> {
    if (isEmpty(changes)) return Promise.resolve();
    const entry = { id: this.newId(), changes };
    this.queue.push(entry);
    const saved = this.persist((owner, all) => this.p.added(owner, entry, all));
    this.emit(this.status.state === 'retrying' ? 'retrying' : 'saving', this.status.state === 'retrying' ? this.status.message : null);
    this.schedule(this.failures ? null : (this.o.debounceMs ?? 300));
    return saved;
  }

  /** Send everything now. Resolves true once the queue is empty, false if it couldn't be emptied (never rejects). */
  async drain(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.queue.length) {
      const ok = await this.sendOnce();
      if (!ok && this.status.state === 'retrying') return false;
    }
    return true;
  }

  /** The connection came back: send now instead of waiting out the backoff. Does nothing when idle or sending. */
  retryNow(): void {
    if (!this.queue.length || this.inflight || !this.owner) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.schedule(0);
  }

  /**
   * Hold scheduled sends (changes still queue and save) while the server's copy of the progress is being read, so an
   * operation can't be acknowledged — and leave `entries` — after the read started but before its result is shown.
   */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.queue.length && !this.timer && !this.inflight) this.schedule(this.failures ? null : 0);
  }

  /** Cancel any scheduled send (pending changes stay queued and saved). */
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Drop every pending change of the current owner and its saved copy, e.g. once their account has been deleted. */
  async clear(): Promise<void> {
    this.stop();
    this.generation++;
    const owner = this.owner;
    this.queue = [];
    this.owner = null;
    this.failures = 0;
    this.paused = false;
    await this.saving;
    await this.p.cleared(owner).catch(() => undefined);
    this.waiters.splice(0).forEach((w) => w());
    this.status = { pending: 0, state: 'idle', message: null };
    this.o.onStatus?.(this.status);
  }

  /** Forget the current owner in memory only: their saved operations stay for when they sign in again. */
  detach(): void {
    this.stop();
    this.generation++;
    this.queue = [];
    this.owner = null;
    this.failures = 0;
    this.paused = false;
    this.waiters.splice(0).forEach((w) => w());
    this.status = { pending: 0, state: 'idle', message: null };
    this.o.onStatus?.(this.status);
  }

  get pending(): number {
    return this.queue.length;
  }

  /** The changes still waiting, oldest first (re-applied on top of loaded progress so local work stays visible). */
  get entries(): readonly OutboxEntry[] {
    return this.queue;
  }

  get currentOwner(): string | null {
    return this.owner;
  }

  /** Resolves when the queue is next empty (for tests and orderly shutdown). */
  idle(): Promise<void> {
    return this.queue.length || this.inflight ? new Promise((r) => this.waiters.push(r)) : Promise.resolve();
  }

  private delay(): number {
    if (this.o.retryDelay) return this.o.retryDelay(this.failures);
    return Math.min((this.o.retryBaseMs ?? 1000) * 2 ** (this.failures - 1), this.o.maxRetryMs ?? 30000);
  }

  private schedule(delay: number | null): void {
    if (this.timer) {
      if (delay === null) return;
      clearTimeout(this.timer);
    }
    const ms = delay ?? this.delay();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.paused) return; // resume() reschedules
      void this.sendOnce().then(() => {
        if (this.queue.length && !this.timer) this.schedule(this.failures ? null : 0);
      });
    }, ms);
  }

  /** Send once. True when it was accepted (or refused outright and set aside). */
  private sendOnce(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    if (!this.queue.length) return Promise.resolve(true);
    this.inflight = this.attempt().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async attempt(): Promise<boolean> {
    const batch = this.o.sendOps ? this.queue.slice(0, this.o.maxOps ?? 50) : this.queue.slice();
    const ids = batch.map((e) => e.id);
    const generation = this.generation;
    const owner = this.owner;
    try {
      if (this.o.sendOps) await this.o.sendOps(batch);
      else await this.o.send!(batch.map((e) => e.changes).reduce(mergeChanges));
      // Signed out, deleted or switched account while this was in flight: the queue now belongs to someone else.
      if (generation !== this.generation || !owner) return true;
      this.drop(ids);
      this.failures = 0;
      await this.persist((o, all) => this.p.removed(o, ids, all));
      this.emit(this.queue.length ? 'saving' : 'idle', null);
      return true;
    } catch (e) {
      if (generation !== this.generation || !owner) return true;
      const { kind, message } = this.o.classify(e);
      if (kind === 'permanent') {
        this.drop(ids);
        this.failures = 0;
        await this.persist((o, all) => this.p.failed(o, ids, message, all));
        this.emit('error', message);
        return true;
      }
      this.failures++;
      const wait = this.delay();
      void this.p.attempted(owner, ids, Date.now() + wait, message).catch(() => undefined);
      this.emit('retrying', message);
      this.schedule(null);
      return false;
    } finally {
      if (generation === this.generation && !this.queue.length) this.waiters.splice(0).forEach((w) => w());
    }
  }

  private drop(ids: readonly string[]): void {
    const gone = new Set(ids);
    this.queue = this.queue.filter((e) => !gone.has(e.id));
  }

  private persist(write: (owner: string, all: readonly OutboxEntry[]) => Promise<void>): Promise<void> {
    const owner = this.owner;
    if (!owner) return Promise.resolve();
    const all = this.queue.slice();
    this.saving = this.saving
      .then(() => write(owner, all))
      // Storage is a safety net for restarts; the in-memory queue still sends.
      .catch(() => undefined);
    return this.saving;
  }

  private emit(state: OutboxStatus['state'], message: string | null): void {
    // An error stays visible until something is saved successfully.
    if (state === 'saving' && this.status.state === 'error') state = 'error';
    this.status = { pending: this.queue.length, state, message: state === 'error' && !message ? this.status.message : message };
    this.o.onStatus?.(this.status);
  }
}
