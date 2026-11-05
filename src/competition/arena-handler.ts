import { type ArenaGameId, isArenaId } from '../arena/core.ts';
import { type ArenaConfig, ArenaRuleError, type ArenaView, finalOf, playAction, replay, viewOf } from './arena-match.ts';

/**
 * The request handler behind the `arena-match` Edge Function, kept free of Deno and Supabase specifics so it runs
 * unchanged in the Edge runtime and in the Node test suite (supabase/__tests__/arena-competition.test.ts).
 *
 * Trust: `userId` comes from the verified JWT (never from the body). The store talks to Postgres with the service
 * role through two functions only callable by it — public.arena_match_load and public.arena_match_commit — which own
 * every competition rule that isn't a game rule: the match belongs to the caller, it is still active, the week (and
 * its grace period) hasn't closed, and the action is the next one (optimistic concurrency on `step`).
 *
 * Requests (JSON body):
 *   { op: 'get',  matchId }                     → the current view (resume after an interruption)
 *   { op: 'move', matchId, step, action }       → apply `action` as action number `step` (0-based)
 * A `move` whose step was already applied returns the current view with `duplicate: true` (a retry or double tap);
 * a step ahead of the match is `stale`.
 */

export interface ArenaMatchRow {
  id: string;
  game: string;
  config: ArenaConfig;
  seed: number;
  actions: unknown[];
  status: 'active' | 'completed' | 'expired';
  competitionId: string;
  attempt: number;
  /** A completed match: the player's standing in the week. */
  standing?: unknown;
}

export interface CommitRequest {
  matchId: string;
  userId: string;
  step: number;
  action: unknown;
  /** Present when this action ends the match: the server-computed result to persist. */
  final: null | { score: number; secondary: number | null; outcome: string; label: string; result: unknown; debrief: unknown; rounds: number };
}

export interface CommitResult {
  status: 'ok' | 'conflict' | 'closed' | 'not_found' | 'finished';
  /** After a final action: the player's standing in the week (best, rank, attempts). */
  standing?: unknown;
}

export interface ArenaStore {
  load(matchId: string, userId: string): Promise<ArenaMatchRow | null>;
  commit(req: CommitRequest): Promise<CommitResult>;
}

export interface HandlerResponse {
  status: number;
  body: object;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail = (status: number, error: string, message?: string): HandlerResponse => ({ status, body: { error, ...(message ? { message } : {}) } });

function view(row: ArenaMatchRow, actions: unknown[]): ArenaView & { matchId: string; status: string; competitionId: string; attempt: number } {
  const game = row.game as ArenaGameId;
  const state = replay(game, row.config, row.seed, actions);
  const v = viewOf(game, row.config, state, actions.length);
  // An expired match (the week closed while it was open) is shown as it stood, without its hidden information.
  if (row.status === 'expired' && !v.over) return { ...v, matchId: row.id, status: row.status, competitionId: row.competitionId, attempt: row.attempt };
  return { ...v, matchId: row.id, status: v.over ? 'completed' : row.status, competitionId: row.competitionId, attempt: row.attempt };
}

export async function handleArenaRequest(userId: string | null, body: unknown, store: ArenaStore): Promise<HandlerResponse> {
  if (!userId) return fail(401, 'auth');
  const b = body as { op?: unknown; matchId?: unknown; step?: unknown; action?: unknown } | null;
  if (!b || typeof b !== 'object' || (b.op !== 'get' && b.op !== 'move')) return fail(400, 'invalid_request');
  if (typeof b.matchId !== 'string' || !UUID.test(b.matchId)) return fail(404, 'not_found');

  // Two attempts: a concurrent move by the same player (another device) can win the race once; reload and answer.
  for (let tries = 0; tries < 2; tries++) {
    const row = await store.load(b.matchId, userId);
    if (!row || !isArenaId(row.game)) return fail(404, 'not_found');
    const game = row.game;
    try {
      if (b.op === 'get') return { status: 200, body: { ...view(row, row.actions), standing: row.standing ?? null } };

      if (typeof b.step !== 'number' || !Number.isInteger(b.step) || b.step < 0) return fail(400, 'invalid_request');
      if (b.step < row.actions.length) return { status: 200, body: { ...view(row, row.actions), duplicate: true } };
      if (b.step > row.actions.length) return fail(409, 'stale');
      if (row.status === 'expired') return fail(409, 'closed');
      if (row.status !== 'active') return fail(409, 'finished');

      const { state, action, over } = playAction(game, row.config, row.seed, row.actions, b.action);
      const f = over ? finalOf(game, state) : null;
      const res = await store.commit({
        matchId: row.id,
        userId,
        step: b.step,
        action,
        final: f ? { score: f.score.score, secondary: f.score.secondary, outcome: f.score.outcome, label: f.score.label, result: f.result, debrief: f.debrief, rounds: f.rounds } : null,
      });
      if (res.status === 'conflict') continue;
      if (res.status === 'closed') return fail(409, 'closed');
      if (res.status === 'finished') return fail(409, 'finished');
      if (res.status === 'not_found') return fail(404, 'not_found');
      const actions = [...row.actions, action];
      return { status: 200, body: { ...view({ ...row, status: over ? 'completed' : 'active' }, actions), standing: res.standing ?? null } };
    } catch (e) {
      if (e instanceof ArenaRuleError) {
        if (e.code === 'corrupt_log') return fail(500, 'corrupt_log', e.message);
        return fail(e.code === 'finished' ? 409 : 422, e.code, e.message);
      }
      throw e;
    }
  }
  return fail(409, 'conflict');
}
