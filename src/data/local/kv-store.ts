import type { CachedContent, GameHistoryEntry, LocalStore, NewOperation, QueueKind, QueuedOperation } from './local-store.ts';

/**
 * The local store over a key-value storage (AsyncStorage; localStorage on web). Used on web — where expo-sqlite needs
 * WebAssembly and cross-origin isolation headers the static site doesn't send — and as a fallback if SQLite can't be
 * opened on a phone. Same behaviour as the SQLite store, with whole-document writes: fine at these volumes.
 *
 * Writes are serialized, so two quick updates can't overwrite each other's read-modify-write.
 */

export interface KvStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const KV_QUEUE_KEY = 'tactiqo/local-queue/v1';
export const KV_SNAPSHOTS_KEY = 'tactiqo/local-snapshots/v1';
export const KV_GAMES_KEY = 'tactiqo/local-games/v1';
export const KV_CONTENT_PREFIX = 'tactiqo/local-content/v1/';

interface Row extends QueuedOperation {
  userId: string;
  status: 'pending' | 'failed';
}

type Snapshots = Record<string, { payload: unknown; savedAt: number; serverLoadedAt: number | null }>;
type Games = (GameHistoryEntry & { userId: string })[];

export function kvStore(storage: KvStorage, now: () => number = Date.now): LocalStore {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };

  async function read<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }
  const write = (key: string, value: unknown) => storage.setItem(key, JSON.stringify(value));

  const queue = () => read<Row[]>(KV_QUEUE_KEY, []);
  const updateQueue = (f: (rows: Row[]) => Row[]) =>
    serial(async () => {
      await write(KV_QUEUE_KEY, f(await queue()));
    });

  return {
    engine: 'kv',

    pending: (userId, kind) => serial(async () => (await queue()).filter((r) => r.userId === userId && r.kind === kind && r.status === 'pending').map(({ userId: _u, status: _s, ...op }) => op)),

    enqueue: (userId, op: NewOperation) =>
      updateQueue((rows) =>
        rows.some((r) => r.id === op.id)
          ? rows
          : [...rows, { id: op.id, userId, kind: op.kind, entityId: op.entityId ?? null, payload: op.payload, createdAt: op.createdAt ?? now(), attempts: 0, lastAttemptAt: null, nextAttemptAt: null, lastError: null, status: 'pending' }],
      ),

    acknowledge: (userId, ids) => updateQueue((rows) => rows.filter((r) => !(r.userId === userId && ids.includes(r.id)))),

    noteAttempt: (userId, ids, at, nextAt, error) =>
      updateQueue((rows) => rows.map((r) => (r.userId === userId && r.status === 'pending' && ids.includes(r.id) ? { ...r, attempts: r.attempts + 1, lastAttemptAt: at, nextAttemptAt: nextAt, lastError: error } : r))),

    fail: (userId, ids, error) => updateQueue((rows) => rows.map((r) => (r.userId === userId && ids.includes(r.id) ? { ...r, status: 'failed', lastError: error, lastAttemptAt: now() } : r))),

    clearQueue: (userId, kind?: QueueKind) => updateQueue((rows) => rows.filter((r) => !(r.userId === userId && (!kind || r.kind === kind)))),

    pendingCount: (userId) => serial(async () => (await queue()).filter((r) => r.userId === userId && r.status === 'pending').length),

    purge: (before, stalePendingBefore) =>
      updateQueue((rows) => rows.filter((r) => !((r.status === 'failed' && (r.lastAttemptAt ?? r.createdAt) < before) || (r.status === 'pending' && r.createdAt < stalePendingBefore)))),

    loadSnapshot: (userId) => serial(async () => (await read<Snapshots>(KV_SNAPSHOTS_KEY, {}))[userId] ?? null),

    saveSnapshot: (userId, payload, opts) =>
      serial(async () => {
        const all = await read<Snapshots>(KV_SNAPSHOTS_KEY, {});
        const t = now();
        all[userId] = { payload, savedAt: t, serverLoadedAt: opts?.serverLoaded ? t : (all[userId]?.serverLoadedAt ?? null) };
        await write(KV_SNAPSHOTS_KEY, all);
      }),

    loadContent: (key) => serial(() => read<CachedContent | null>(KV_CONTENT_PREFIX + key, null)),
    saveContent: (key, c) => serial(() => write(KV_CONTENT_PREFIX + key, c)),

    recordGame: (userId, e) =>
      serial(async () => {
        const all = await read<Games>(KV_GAMES_KEY, []);
        if (all.some((g) => g.sessionId === e.sessionId)) return;
        // Bounded: the newest 200 per device is plenty for history display.
        await write(KV_GAMES_KEY, [{ ...e, userId }, ...all].sort((a, b) => b.playedAt - a.playedAt).slice(0, 200));
      }),

    games: (userId, limit) =>
      serial(async () =>
        (await read<Games>(KV_GAMES_KEY, []))
          .filter((g) => g.userId === userId)
          .slice(0, limit)
          .map(({ userId: _u, ...g }) => g),
      ),

    markGamesSynced: (userId, ids) =>
      serial(async () => {
        const all = await read<Games>(KV_GAMES_KEY, []);
        await write(KV_GAMES_KEY, all.map((g) => (g.userId === userId && ids.includes(g.sessionId) ? { ...g, synced: true } : g)));
      }),

    clearUser: (userId, { queue: withQueue }) =>
      serial(async () => {
        const snaps = await read<Snapshots>(KV_SNAPSHOTS_KEY, {});
        delete snaps[userId];
        await write(KV_SNAPSHOTS_KEY, snaps);
        await write(KV_GAMES_KEY, (await read<Games>(KV_GAMES_KEY, [])).filter((g) => g.userId !== userId));
        if (withQueue) await write(KV_QUEUE_KEY, (await queue()).filter((r) => r.userId !== userId));
      }),

    clearOthers: (keep) =>
      serial(async () => {
        const snaps = await read<Snapshots>(KV_SNAPSHOTS_KEY, {});
        await write(KV_SNAPSHOTS_KEY, keep && snaps[keep] ? { [keep]: snaps[keep] } : {});
        await write(KV_GAMES_KEY, (await read<Games>(KV_GAMES_KEY, [])).filter((g) => g.userId === keep));
      }),
  };
}
