import { z } from 'zod';

import type { ArenaGameId } from '../arena/core.ts';
import { DataError } from './errors.ts';

/**
 * Ranked Game of the Week matches for the 18 Strategy Arena games, played through the `arena-match` Edge Function
 * (supabase/functions/arena-match). The match is created — and the attempt reserved — by start_match like any other
 * ranked match (src/data/games.ts); after that each action goes to the function, which runs the shared engine on the
 * server. The device receives a redacted view while the match is in play (no seed, no hidden roles, dice or cards)
 * and the full result once it ends. It never submits a score.
 */

export type ArenaRefusal = 'auth' | 'not_found' | 'stale' | 'closed' | 'finished' | 'illegal_action' | 'invalid_action' | 'invalid_request' | 'conflict' | 'corrupt_log' | 'unavailable';

const MESSAGES: Record<ArenaRefusal, string> = {
  auth: 'Couldn’t confirm your session. Sign in again to keep playing.',
  not_found: 'This match isn’t available.',
  stale: 'This match moved on (another device?). It has been reloaded.',
  closed: 'This week’s competition has closed, so this match can’t continue.',
  finished: 'This match is already over.',
  illegal_action: 'That move isn’t allowed right now.',
  invalid_action: 'That move wasn’t valid.',
  invalid_request: 'That request wasn’t valid.',
  conflict: 'Another move was being saved at the same time. The match has been reloaded.',
  corrupt_log: 'This match can’t be replayed on the server. Please contact support — your attempt is kept.',
  unavailable: 'The game server isn’t reachable right now. Your match is saved — try again in a moment.',
};

export class ArenaMatchError extends DataError {
  readonly refusal: ArenaRefusal;

  constructor(refusal: ArenaRefusal, detail: string, serverMessage?: string) {
    // Network-level and server hiccups are transient: the move wasn't applied and can simply be sent again.
    super(refusal === 'unavailable' ? 'network' : 'refused', detail, refusal === 'illegal_action' && serverMessage ? serverMessage : MESSAGES[refusal]);
    this.refusal = refusal;
  }
}

const standing = z
  .object({
    attemptsUsed: z.number().int(),
    maxAttempts: z.number().int().optional(),
    best: z.number().int().nullable(),
    bestLabel: z.string().nullable().optional(),
    rank: z.number().int().nullable(),
    participants: z.number().int().optional(),
    isBest: z.boolean().optional(),
  })
  .nullable()
  .optional();

const viewSchema = z.object({
  matchId: z.string(),
  game: z.string(),
  config: z.object({ opponent: z.string(), level: z.enum(['easy', 'normal', 'hard']), variant: z.string(), length: z.enum(['short', 'standard', 'long']) }),
  step: z.number().int().nonnegative(),
  over: z.boolean(),
  played: z.number().int(),
  total: z.number().int(),
  state: z.record(z.string(), z.unknown()),
  final: z
    .object({
      result: z.record(z.string(), z.unknown()),
      debrief: z.object({ headline: z.string(), moments: z.array(z.string()), insight: z.string(), opponentRead: z.string() }),
      score: z.object({ score: z.number(), secondary: z.number().nullable(), outcome: z.enum(['win', 'loss', 'draw']), label: z.string() }),
      rounds: z.number().int(),
    })
    .nullable(),
  status: z.enum(['active', 'completed', 'expired']),
  competitionId: z.string(),
  attempt: z.number().int(),
  duplicate: z.boolean().optional(),
  standing,
});
export type ArenaMatchView = Omit<z.infer<typeof viewSchema>, 'game'> & { game: ArenaGameId };

/** The transport: POST a JSON body to the function and get its status and JSON body back. */
export type ArenaTransport = (body: unknown) => Promise<{ status: number; body: unknown }>;

export interface ArenaCompetitionRepository {
  /** The match as it stands (resume after leaving, restarting or switching devices). */
  get(matchId: string): Promise<ArenaMatchView>;
  /** Send action number `step`. A retry of an applied step returns the match unchanged (`duplicate`). */
  move(matchId: string, step: number, action: unknown): Promise<ArenaMatchView>;
}

export function arenaCompetitionRepository(send: ArenaTransport): ArenaCompetitionRepository {
  async function request(body: Record<string, unknown>): Promise<ArenaMatchView> {
    let res: { status: number; body: unknown };
    try {
      res = await send(body);
    } catch (e) {
      throw new ArenaMatchError('unavailable', e instanceof Error ? e.message : String(e));
    }
    if (res.status >= 200 && res.status < 300) {
      const v = viewSchema.safeParse(res.body);
      if (!v.success) throw new DataError('server', `arena-match returned an unexpected result: ${v.error.message.slice(0, 200)}`);
      return v.data as ArenaMatchView;
    }
    const b = (res.body ?? {}) as { error?: unknown; message?: unknown };
    const code = typeof b.error === 'string' && b.error in MESSAGES ? (b.error as ArenaRefusal) : res.status >= 500 || res.status === 0 ? 'unavailable' : 'invalid_request';
    throw new ArenaMatchError(code, `arena-match ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`, typeof b.message === 'string' ? b.message : undefined);
  }
  return {
    get: (matchId) => request({ op: 'get', matchId }),
    move: (matchId, step, action) => request({ op: 'move', matchId, step, action }),
  };
}
