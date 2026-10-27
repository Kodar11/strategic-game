import { z } from 'zod';

import type { Difficulty, GameId } from '../games/core.ts';
import { DataError } from './errors.ts';
import { type Rpc, type RpcName, call } from './repositories.ts';

/**
 * Games reads and writes (supabase/migrations/…_games.sql). Competition and challenge matches are played on the
 * server one round at a time: the app sends a move, the server decides the bot's move and the score. Practice games
 * run on the device and are only logged here. Nothing in this file touches lesson progress or the learning record.
 */

export type GameRefusal =
  | 'auth'
  | 'not_found'
  | 'not_started'
  | 'closed'
  | 'no_attempts'
  | 'stale'
  | 'finished'
  | 'invalid_move'
  | 'invalid_request'
  | 'expired'
  | 'outdated'
  | 'rate_limited'
  | 'nickname_length'
  | 'nickname_characters'
  | 'nickname_reserved'
  | 'nickname_taken';

const REFUSAL_MESSAGES: Record<GameRefusal, string> = {
  auth: 'Couldn’t confirm your session. Restart the app and try again.',
  not_found: 'This game isn’t available.',
  not_started: 'This week’s competition hasn’t started yet.',
  closed: 'This competition has closed. Results are being finalized.',
  no_attempts: 'You’ve used all your competitive attempts this week. Practice games are always open.',
  stale: 'This match moved on in another window. It has been reloaded.',
  finished: 'This match is already over.',
  invalid_move: 'That move isn’t allowed here. Try again.',
  invalid_request: 'That request wasn’t valid.',
  expired: 'This challenge link has expired. Ask your friend for a new one — or play the game in practice.',
  outdated: 'This challenge uses older rules than the server plays now.',
  rate_limited: 'That’s a lot in one day. Try again tomorrow.',
  nickname_length: 'Use 3 to 20 characters.',
  nickname_characters: 'Use letters, numbers, single spaces, and _ . - (start with a letter or number).',
  nickname_reserved: 'That name is reserved. Try another.',
  nickname_taken: 'Someone already uses that name. Try another.',
};

export class GameError extends DataError {
  readonly refusal: GameRefusal;

  constructor(refusal: GameRefusal, detail: string) {
    super('refused', detail, REFUSAL_MESSAGES[refusal]);
    this.refusal = refusal;
  }
}

async function games(rpc: Rpc, fn: RpcName, request?: Record<string, unknown>): Promise<unknown> {
  try {
    return await call(rpc, fn, request === undefined ? undefined : { request });
  } catch (e) {
    const refusal = e instanceof DataError ? /games:([a-z_]+)/.exec(e.detail)?.[1] : undefined;
    if (refusal && refusal in REFUSAL_MESSAGES) throw new GameError(refusal as GameRefusal, (e as DataError).detail);
    throw e;
  }
}

function parse<T>(schema: z.ZodType<T>, raw: unknown, fn: string): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new DataError('server', `${fn} returned an unexpected result: ${r.error.message.slice(0, 300)}`);
  return r.data;
}

// ── Shapes ───────────────────────────────────────────────────────────────────

const gameId = z.enum(['rps', 'two-thirds', 'split-steal', 'ultimatum', 'stag-hunt']);
const difficulty = z.enum(['easy', 'medium', 'hard']);
const outcome = z.enum(['win', 'loss', 'draw']);
const phase = z.enum(['upcoming', 'active', 'closed', 'finalized']);
const nickname = z.string().nullable();

const matchSchema = z.object({
  id: z.string(),
  kind: z.enum(['competition', 'challenge']),
  game: gameId,
  bot: z.string(),
  difficulty,
  rulesVersion: z.number().int(),
  attempt: z.number().int(),
  rounds: z.array(z.record(z.string(), z.unknown())),
  totalRounds: z.number().int(),
  status: z.enum(['active', 'completed', 'expired']),
  prompt: z.unknown().nullable(),
  playerScore: z.number().int(),
  botScore: z.number().int(),
  outcome: outcome.nullable(),
  competitionId: z.string().nullable(),
  challengeToken: z.string().nullable(),
  startedAt: z.number(),
  completedAt: z.number().nullable(),
  duplicate: z.boolean().optional(),
});
export type ServerMatch = z.infer<typeof matchSchema>;

const competitionSchema = z.object({
  id: z.string(),
  game: gameId,
  bot: z.string(),
  difficulty,
  startsAt: z.number(),
  endsAt: z.number(),
  timezone: z.string(),
  scoringVersion: z.number().int(),
  maxAttempts: z.number().int(),
  winnerBonus: z.number().int(),
  phase,
  participants: z.number().int(),
  me: z.object({ attemptsUsed: z.number().int(), activeMatchId: z.string().nullable(), best: z.number().int().nullable(), rank: z.number().int().nullable() }).nullable(),
});
export type Competition = z.infer<typeof competitionSchema>;

const winnerSchema = z.object({ nickname, score: z.number().int(), isMe: z.boolean() });

const overviewSchema = z.object({
  now: z.number(),
  competition: competitionSchema.nullable(),
  lastWeek: z.object({ id: z.string(), game: gameId, endsAt: z.number(), participants: z.number().int().nullable(), winners: z.array(winnerSchema) }).nullable(),
  nickname,
  rules: z.record(z.string(), z.number().int()),
});
export type GamesOverview = z.infer<typeof overviewSchema>;

const weeklyEntry = z.object({ rank: z.number().int(), nickname, score: z.number().int(), points: z.number().int().optional(), isWinner: z.boolean().optional(), isMe: z.boolean() });
const globalEntry = z.object({ rank: z.number().int(), nickname, points: z.number().int(), wins: z.number().int(), weeks: z.number().int(), isMe: z.boolean() });

const weeklySchema = z.object({
  scope: z.literal('weekly'),
  competition: z.object({ id: z.string(), game: gameId, bot: z.string(), difficulty, startsAt: z.number(), endsAt: z.number(), phase, participants: z.number().int() }).nullable(),
  entries: z.array(weeklyEntry),
  me: weeklyEntry.nullable(),
  now: z.number().optional(),
});
const globalSchema = z.object({ scope: z.literal('global'), entries: z.array(globalEntry), me: globalEntry.nullable(), players: z.number().int() });
export type WeeklyBoard = z.infer<typeof weeklySchema>;
export type GlobalBoard = z.infer<typeof globalSchema>;
export type WeeklyEntry = z.infer<typeof weeklyEntry>;
export type GlobalEntry = z.infer<typeof globalEntry>;

const hallSchema = z.array(
  z.object({
    id: z.string(),
    game: gameId,
    bot: z.string(),
    difficulty,
    startsAt: z.number(),
    endsAt: z.number(),
    participants: z.number().int().nullable(),
    winners: z.array(winnerSchema),
    runnerUpScore: z.number().int().nullable(),
  }),
);
export type HallOfFameEntry = z.infer<typeof hallSchema>[number];

const challengeCreated = z.object({ token: z.string(), game: gameId, bot: z.string(), difficulty, expiresAt: z.number() });
const challengeSchema = z.object({
  token: z.string(),
  game: gameId,
  bot: z.string(),
  difficulty,
  rulesVersion: z.number().int(),
  createdAt: z.number(),
  expiresAt: z.number(),
  expired: z.boolean(),
  isCreator: z.boolean(),
  creatorNickname: nickname,
  creatorResult: z.object({ playerScore: z.number().int(), botScore: z.number().int(), outcome, completedAt: z.number() }).nullable(),
  players: z.number().int(),
  myMatch: matchSchema.nullable(),
});
export type ChallengeView = z.infer<typeof challengeSchema>;

const myGamesSchema = z.object({
  nickname,
  standing: z.object({ rank: z.number().int(), points: z.number().int(), wins: z.number().int(), weeks: z.number().int(), players: z.number().int() }).nullable(),
  weeks: z.array(z.object({ competitionId: z.string(), game: gameId, endsAt: z.number(), rank: z.number().int(), field: z.number().int(), score: z.number().int(), points: z.number().int(), isWinner: z.boolean() })),
  practice: z.array(z.object({ game: gameId, bot: z.string(), difficulty, playerScore: z.number().int(), botScore: z.number().int(), outcome, playedAt: z.number() })),
  matches: z.array(z.object({ id: z.string(), kind: z.enum(['competition', 'challenge']), game: gameId, bot: z.string(), difficulty, playerScore: z.number().int(), botScore: z.number().int(), outcome: outcome.nullable(), competitionId: z.string().nullable(), completedAt: z.number().nullable() })),
});
export type MyGames = z.infer<typeof myGamesSchema>;

export interface PracticeRecord {
  id: string;
  game: GameId;
  bot: string;
  difficulty: Difficulty;
  playerScore: number;
  botScore: number;
  outcome: 'win' | 'loss' | 'draw';
}

// ── Repository ───────────────────────────────────────────────────────────────

export interface GamesRepository {
  overview(): Promise<GamesOverview>;
  setNickname(nickname: string): Promise<string>;
  startCompetitionMatch(competitionId: string): Promise<ServerMatch>;
  startChallengeMatch(token: string): Promise<ServerMatch>;
  /** `round` is the 0-based round being answered; a retry of the same round is answered with the match as it is. */
  playRound(matchId: string, round: number, move: unknown): Promise<ServerMatch>;
  getMatch(matchId: string): Promise<ServerMatch>;
  weekly(competitionId?: string): Promise<WeeklyBoard>;
  global(): Promise<GlobalBoard>;
  hallOfFame(): Promise<HallOfFameEntry[]>;
  createChallenge(game: GameId, bot: string, difficulty: Difficulty): Promise<z.infer<typeof challengeCreated>>;
  getChallenge(token: string): Promise<ChallengeView>;
  recordPractice(r: PracticeRecord): Promise<void>;
  myGames(): Promise<MyGames>;
}

export function gamesRepository(rpc: Rpc): GamesRepository {
  return {
    overview: async () => parse(overviewSchema, await games(rpc, 'get_games_overview'), 'get_games_overview'),
    setNickname: async (name) => parse(z.object({ nickname: z.string() }), await games(rpc, 'set_nickname', { nickname: name }), 'set_nickname').nickname,
    startCompetitionMatch: async (competitionId) => parse(matchSchema, await games(rpc, 'start_match', { kind: 'competition', competitionId }), 'start_match'),
    startChallengeMatch: async (token) => parse(matchSchema, await games(rpc, 'start_match', { kind: 'challenge', token }), 'start_match'),
    playRound: async (matchId, round, move) => parse(matchSchema, await games(rpc, 'play_match_round', { matchId, round, move }), 'play_match_round'),
    getMatch: async (matchId) => parse(matchSchema, await games(rpc, 'get_match', { matchId }), 'get_match'),
    weekly: async (competitionId) => parse(weeklySchema, await games(rpc, 'get_leaderboard', competitionId ? { scope: 'weekly', competitionId } : { scope: 'weekly' }), 'get_leaderboard'),
    global: async () => parse(globalSchema, await games(rpc, 'get_leaderboard', { scope: 'global' }), 'get_leaderboard'),
    hallOfFame: async () => parse(hallSchema, await games(rpc, 'get_hall_of_fame', {}), 'get_hall_of_fame'),
    createChallenge: async (game, bot, diff) => parse(challengeCreated, await games(rpc, 'create_challenge', { game, bot, difficulty: diff }), 'create_challenge'),
    getChallenge: async (token) => parse(challengeSchema, await games(rpc, 'get_challenge', { token }), 'get_challenge'),
    recordPractice: async (r) => {
      await games(rpc, 'record_practice_game', { ...r });
    },
    myGames: async () => parse(myGamesSchema, await games(rpc, 'get_my_games'), 'get_my_games'),
  };
}
