import type { SqlDatabase } from './sql.ts';

/**
 * The app's local working store: what it needs to keep on the device to work without a network. Two implementations
 * share this interface — SQLite (sqlStore, the app on Android and iOS, and the tests) and a key-value fallback over
 * AsyncStorage / localStorage (kv-store.ts, used on web and if SQLite can't be opened).
 *
 * Every method that touches a person's data takes their user id and never reads or writes anyone else's.
 */

export type QueueKind = 'progress' | 'practice_game';

export interface QueuedOperation {
  /** Stable unique id (a UUID). The server deduplicates on it, so resending is always safe. */
  id: string;
  kind: QueueKind;
  /** What the operation is about (a game session id, …), for diagnosis. Null for progress batches. */
  entityId: string | null;
  /** The operation's JSON payload, exactly as it will be sent. */
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastAttemptAt: number | null;
  nextAttemptAt: number | null;
  lastError: string | null;
}

export interface NewOperation {
  id: string;
  kind: QueueKind;
  entityId?: string | null;
  payload: unknown;
  createdAt?: number;
}

export interface CachedContent {
  /** A hash of the stored document: equal versions mean equal documents. */
  version: string;
  /** The content's own revision counter (sum of lesson and scenario revisions), for telemetry and diagnosis. */
  revision: number;
  payload: unknown;
  fetchedAt: number;
}

export interface GameHistoryEntry {
  sessionId: string;
  game: string;
  payload: unknown;
  playedAt: number;
  synced: boolean;
}

export interface LocalStore {
  /** 'sqlite' or 'kv', for diagnosis. */
  readonly engine: 'sqlite' | 'kv';

  /** Pending operations of one kind for one user, oldest first. Failed operations are not returned. */
  pending(userId: string, kind: QueueKind): Promise<QueuedOperation[]>;
  /** Add an operation. An id already present is ignored (never duplicated, never reassigned to another user). */
  enqueue(userId: string, op: NewOperation): Promise<void>;
  /** The server has these: remove them. */
  acknowledge(userId: string, ids: readonly string[]): Promise<void>;
  /** A transient failure: count the attempt and when to try next. The operations stay pending. */
  noteAttempt(userId: string, ids: readonly string[], at: number, nextAt: number | null, error: string | null): Promise<void>;
  /** Refused for good: keep for diagnosis (never resent). Purged after a while by `purgeFailed`. */
  fail(userId: string, ids: readonly string[], error: string): Promise<void>;
  /** Drop every queued operation of a user (of one kind, or all). */
  clearQueue(userId: string, kind?: QueueKind): Promise<void>;
  /** Users with pending operations on this device, and how many (for diagnosis and the sign-out decision). */
  pendingCount(userId: string): Promise<number>;
  /** Remove failed operations older than `before`, and pending operations older than `stalePendingBefore`. */
  purge(before: number, stalePendingBefore: number): Promise<void>;

  loadSnapshot(userId: string): Promise<{ payload: unknown; savedAt: number; serverLoadedAt: number | null } | null>;
  saveSnapshot(userId: string, payload: unknown, opts?: { serverLoaded?: boolean }): Promise<void>;

  loadContent(key: string): Promise<CachedContent | null>;
  /** Replace the cached document atomically: either the old or the new one is stored, never a mix. */
  saveContent(key: string, content: CachedContent): Promise<void>;

  recordGame(userId: string, entry: GameHistoryEntry): Promise<void>;
  games(userId: string, limit: number): Promise<GameHistoryEntry[]>;
  markGamesSynced(userId: string, sessionIds: readonly string[]): Promise<void>;

  /**
   * Forget a person's account data on this device: snapshot and game history, and — when `queue` is true — their
   * queued operations too. With `queue: false` pending writes are kept (scoped to them, never shown or sent for
   * anyone else) so a session that ended by itself doesn't lose work they did.
   */
  clearUser(userId: string, opts: { queue: boolean }): Promise<void>;
  /** Forget the snapshots and game history of everyone except `keep` (who may be null for a guest). Queues stay. */
  clearOthers(keep: string | null): Promise<void>;
}

// ── SQLite ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface QueueRow {
  id: string;
  kind: QueueKind;
  entity_id: string | null;
  payload: string;
  created_at: number;
  attempts: number;
  last_attempt_at: number | null;
  next_attempt_at: number | null;
  last_error: string | null;
}

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ');

/** SQLite caps bound parameters per statement; chunk id lists well under it. */
function chunks<T>(xs: readonly T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function sqlStore(db: SqlDatabase, now: () => number = Date.now): LocalStore {
  return {
    engine: 'sqlite',

    async pending(userId, kind) {
      const rows = await db.all<QueueRow>(
        `select id, kind, entity_id, payload, created_at, attempts, last_attempt_at, next_attempt_at, last_error
         from sync_queue where user_id = ? and kind = ? and status = 'pending' order by seq`,
        [userId, kind],
      );
      const out: QueuedOperation[] = [];
      for (const r of rows) {
        const payload = parse(r.payload);
        // A row that no longer parses can never be sent correctly; it is set aside rather than blocking the queue.
        if (payload === null) {
          await db.run(`update sync_queue set status = 'failed', last_error = 'corrupt' where id = ? and user_id = ?`, [r.id, userId]);
          continue;
        }
        out.push({ id: r.id, kind: r.kind, entityId: r.entity_id, payload, createdAt: r.created_at, attempts: r.attempts, lastAttemptAt: r.last_attempt_at, nextAttemptAt: r.next_attempt_at, lastError: r.last_error });
      }
      return out;
    },

    async enqueue(userId, op) {
      await db.run(`insert into sync_queue (id, user_id, kind, entity_id, payload, created_at) values (?, ?, ?, ?, ?, ?) on conflict (id) do nothing`, [
        op.id,
        userId,
        op.kind,
        op.entityId ?? null,
        JSON.stringify(op.payload),
        op.createdAt ?? now(),
      ]);
    },

    async acknowledge(userId, ids) {
      if (!ids.length) return;
      await db.transaction(async (tx) => {
        for (const part of chunks(ids)) await tx.run(`delete from sync_queue where user_id = ? and id in (${placeholders(part.length)})`, [userId, ...part]);
      });
    },

    async noteAttempt(userId, ids, at, nextAt, error) {
      if (!ids.length) return;
      await db.transaction(async (tx) => {
        for (const part of chunks(ids))
          await tx.run(`update sync_queue set attempts = attempts + 1, last_attempt_at = ?, next_attempt_at = ?, last_error = ? where user_id = ? and status = 'pending' and id in (${placeholders(part.length)})`, [
            at,
            nextAt,
            error,
            userId,
            ...part,
          ]);
      });
    },

    async fail(userId, ids, error) {
      if (!ids.length) return;
      await db.transaction(async (tx) => {
        for (const part of chunks(ids))
          await tx.run(`update sync_queue set status = 'failed', last_error = ?, last_attempt_at = ? where user_id = ? and id in (${placeholders(part.length)})`, [error, now(), userId, ...part]);
      });
    },

    async clearQueue(userId, kind) {
      if (kind) await db.run('delete from sync_queue where user_id = ? and kind = ?', [userId, kind]);
      else await db.run('delete from sync_queue where user_id = ?', [userId]);
    },

    async pendingCount(userId) {
      const r = await db.first<{ n: number }>(`select count(*) as n from sync_queue where user_id = ? and status = 'pending'`, [userId]);
      return r?.n ?? 0;
    },

    async purge(before, stalePendingBefore) {
      await db.run(`delete from sync_queue where (status = 'failed' and coalesce(last_attempt_at, created_at) < ?) or (status = 'pending' and created_at < ?)`, [before, stalePendingBefore]);
    },

    async loadSnapshot(userId) {
      const r = await db.first<{ payload: string; saved_at: number; server_loaded_at: number | null }>('select payload, saved_at, server_loaded_at from progress_snapshots where user_id = ?', [userId]);
      if (!r) return null;
      const payload = parse(r.payload);
      return payload === null ? null : { payload, savedAt: r.saved_at, serverLoadedAt: r.server_loaded_at };
    },

    async saveSnapshot(userId, payload, opts) {
      const t = now();
      await db.run(
        `insert into progress_snapshots (user_id, payload, saved_at, server_loaded_at) values (?, ?, ?, ?)
         on conflict (user_id) do update set payload = excluded.payload, saved_at = excluded.saved_at,
           server_loaded_at = coalesce(excluded.server_loaded_at, progress_snapshots.server_loaded_at)`,
        [userId, JSON.stringify(payload), t, opts?.serverLoaded ? t : null],
      );
    },

    async loadContent(key) {
      const r = await db.first<{ version: string; revision: number; payload: string; fetched_at: number }>('select version, revision, payload, fetched_at from content_cache where key = ?', [key]);
      if (!r) return null;
      const payload = parse(r.payload);
      return payload === null ? null : { version: r.version, revision: r.revision, payload, fetchedAt: r.fetched_at };
    },

    async saveContent(key, c) {
      await db.run(
        `insert into content_cache (key, version, revision, payload, fetched_at) values (?, ?, ?, ?, ?)
         on conflict (key) do update set version = excluded.version, revision = excluded.revision, payload = excluded.payload, fetched_at = excluded.fetched_at`,
        [key, c.version, c.revision, JSON.stringify(c.payload), c.fetchedAt],
      );
    },

    async recordGame(userId, e) {
      await db.run(
        `insert into game_history (session_id, user_id, game, payload, played_at, synced) values (?, ?, ?, ?, ?, ?)
         on conflict (session_id) do nothing`,
        [e.sessionId, userId, e.game, JSON.stringify(e.payload), e.playedAt, e.synced ? 1 : 0],
      );
    },

    async games(userId, limit) {
      const rows = await db.all<{ session_id: string; game: string; payload: string; played_at: number; synced: number }>(
        'select session_id, game, payload, played_at, synced from game_history where user_id = ? order by played_at desc limit ?',
        [userId, Math.max(0, Math.trunc(limit))],
      );
      return rows.map((r) => ({ sessionId: r.session_id, game: r.game, payload: parse(r.payload), playedAt: r.played_at, synced: r.synced === 1 }));
    },

    async markGamesSynced(userId, ids) {
      if (!ids.length) return;
      await db.transaction(async (tx) => {
        for (const part of chunks(ids)) await tx.run(`update game_history set synced = 1 where user_id = ? and session_id in (${placeholders(part.length)})`, [userId, ...part]);
      });
    },

    async clearUser(userId, { queue }) {
      await db.transaction(async (tx) => {
        await tx.run('delete from progress_snapshots where user_id = ?', [userId]);
        await tx.run('delete from game_history where user_id = ?', [userId]);
        if (queue) await tx.run('delete from sync_queue where user_id = ?', [userId]);
      });
    },

    async clearOthers(keep) {
      await db.transaction(async (tx) => {
        await tx.run('delete from progress_snapshots where user_id is not ?', [keep]);
        await tx.run('delete from game_history where user_id is not ?', [keep]);
      });
    },
  };
}
