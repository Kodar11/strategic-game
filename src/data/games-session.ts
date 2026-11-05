import { currentUserId } from '@/src/auth/store';
import { createGamesStore } from '@/src/features/games/store';
import { reportError } from '@/src/observability/api';
import { arenaCompetitionRepository } from './arena-competition';
import { DataError } from './errors';
import { type GamesRepository, type PracticeRecord, gamesRepository } from './games';
import { localStore } from './local/database';
import { OperationQueue } from './sync/operation-queue';
import { classifySyncError, retryDelay } from './sync/retry-policy';
import { supabase, supabaseRpc } from './supabase';

const serverGames = gamesRepository(supabaseRpc);

/**
 * Finished practice games, saved on the device and sent to `record_practice_game` when the server can be reached
 * (src/data/sync/operation-queue.ts). The game id is the operation id; the server keeps one row per (player, id), so
 * a resend never records a game twice. Practice results are the player's own history — they never feed a leaderboard
 * or a reward. Restored for the signed-in player by src/data/session.ts.
 */
export const practiceUploads = new OperationQueue<PracticeRecord>({
  kind: 'practice_game',
  store: localStore,
  send: (r) => serverGames.recordPractice(r),
  classify: classifySyncError,
  retryDelay,
  onAcknowledged: async (owner, ids) => {
    await (await localStore()).markGamesSynced(owner, ids).catch(() => undefined);
  },
  onFailed: (_owner, _id, f) => reportError('sync_failed', new Error('A practice game was refused'), { sync_phase: 'practice_refused', error_code: f.category }, 'warning'),
});

/** The repository the games store uses: the server's, except practice games, which go through the device first. */
const gamesRepo: GamesRepository = {
  ...serverGames,
  recordPractice: async (r) => {
    const owner = currentUserId();
    // A guest's practice stays on the screen only, exactly as before (the server keeps no guest history).
    if (!owner) throw new DataError('signedOut', 'record_practice_game needs a signed-in user');
    const local = await localStore();
    await local.recordGame(owner, { sessionId: r.id, game: r.game, payload: r, playedAt: Date.now(), synced: false }).catch(() => undefined);
    await practiceUploads.enqueue(r.id, r, r.id);
  },
};

/** The app's games store. Separate from the lesson progress store and its outbox. */
export const useGames = createGamesStore(gamesRepo);
export { serverGames as gamesRepo };

/**
 * Ranked Arena matches go to the arena-match Edge Function. supabase-js attaches the signed-in user's access token;
 * the function verifies it with Supabase Auth. A non-2xx answer carries the function's JSON error body.
 */
export const arenaRepo = arenaCompetitionRepository(async (body) => {
  const { data, error } = await supabase().functions.invoke('arena-match', { body: body as Record<string, unknown> });
  if (!error) return { status: 200, body: data };
  const res = (error as { context?: unknown }).context;
  if (res instanceof Response) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // Not JSON: a gateway or network-level failure.
    }
    return { status: res.status, body: parsed };
  }
  throw error;
});
