import { z } from 'zod';

import { COMPETITION_GAME_IDS, type CompetitionGameId } from '../competition/catalog.ts';
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
  | 'nickname_not_allowed'
  | 'nickname_taken'
  | 'nickname_rate_limited';

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
  nickname_reserved: 'That name is reserved — it could be mistaken for Tactiqo or its staff. Try another.',
  nickname_not_allowed: 'That name isn’t allowed on public boards. Try another.',
  nickname_taken: 'Someone already uses that name. Try another.',
  nickname_rate_limited: 'You’ve changed your nickname a lot recently. Try again later.',
};

export class GameError extends DataError {
  readonly refusal: GameRefusal;

  constructor(refusal: GameRefusal, detail: string, message: string = REFUSAL_MESSAGES[refusal]) {
    super('refused', detail, message);
    this.refusal = refusal;
  }
}

/** "about 4 hours" / "about 25 minutes" / "a minute" — rounded up, from the server's retry-after. */
function waitText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 2) return 'a minute';
  if (minutes < 90) return `about ${minutes} minutes`;
  return `about ${Math.ceil(minutes / 60)} hours`;
}

/**
 * The nickname rate-limit message from what the server said (which limit, and when it frees up). The app never
 * computes the quota itself; without details from an older server it falls back to the generic message.
 */
export function nicknameLimitMessage(limit: unknown, retryAfterSeconds: unknown): string {
  const wait = typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0 ? waitText(retryAfterSeconds) : null;
  if (limit === 'changes') return `You can change your nickname 3 times a day. ${wait ? `Try again in ${wait}.` : 'Try again later.'}`;
  if (limit === 'attempts') return `Too many tries in the last hour. ${wait ? `Try again in ${wait}.` : 'Try again later.'}`;
  return REFUSAL_MESSAGES.nickname_rate_limited;
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
/** Any of the 23 games that can be Game of the Week (classic or Arena). */
const anyGame = z.enum(COMPETITION_GAME_IDS as unknown as [CompetitionGameId, ...CompetitionGameId[]]);
/** Classic difficulties plus the Arena's 'normal'. */
const anyDifficulty = z.enum(['easy', 'medium', 'normal', 'hard']);
const state = z.enum(['scheduled', 'active', 'finalizing', 'completed', 'cancelled']);
const config = z.record(z.string(), z.unknown()).nullable();

/** The caller's position in a competition (overview, after each ranked match). */
const standingSchema = z.object({
  attemptsUsed: z.number().int(),
  maxAttempts: z.number().int().optional(),
  activeMatchId: z.string().nullable(),
  best: z.number().int().nullable(),
  bestLabel: z.string().nullable().optional(),
  bestMatchId: z.string().nullable().optional(),
  rank: z.number().int().nullable(),
  participants: z.number().int().optional(),
  isBest: z.boolean().optional(),
});
export type Standing = z.infer<typeof standingSchema>;
const outcome = z.enum(['win', 'loss', 'draw']);
const phase = z.enum(['upcoming', 'active', 'closed', 'finalized']);
const nickname = z.string().nullable();
/** set_nickname: the saved name, or a refusal returned as data (see setNickname below). */
const nicknameResult = z.union([
  z.object({ nickname: z.string(), changesLeft: z.number().int().optional() }),
  z.object({ refused: z.string(), limit: z.string().optional(), retryAfterSeconds: z.number().optional() }),
]);

const matchSchema = z.object({
  id: z.string(),
  kind: z.enum(['competition', 'challenge']),
  game: anyGame,
  bot: z.string(),
  difficulty: anyDifficulty,
  rulesVersion: z.number().int(),
  // v2: Arena matches are played through the arena-match function (src/data/arena-competition.ts).
  engine: z.enum(['sql', 'arena']).optional(),
  config: config.optional(),
  score: z.number().int().nullable().optional(),
  scoreLabel: z.string().nullable().optional(),
  standing: standingSchema.nullable().optional(),
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
/** A server match of one of the five classic (SQL-engine) games: friend challenges, and their Game of the Week. */
export type ClassicServerMatch = ServerMatch & { game: GameId; difficulty: Difficulty };
export const isClassicMatch = (m: ServerMatch): m is ClassicServerMatch => m.engine !== 'arena' && ['rps', 'two-thirds', 'split-steal', 'ultimatum', 'stag-hunt'].includes(m.game) && m.difficulty !== 'normal';

const competitionSchema = z.object({
  id: z.string(),
  game: anyGame,
  bot: z.string(),
  difficulty: anyDifficulty,
  // v2 fields (optional, so an older server still parses).
  number: z.number().int().optional(),
  engine: z.enum(['sql', 'arena']).optional(),
  title: z.string().optional(),
  config: config.optional(),
  rulesVersion: z.number().int().optional(),
  deadline: z.number().optional(),
  state: state.optional(),
  finalizedAt: z.number().nullable().optional(),
  startsAt: z.number(),
  endsAt: z.number(),
  timezone: z.string(),
  scoringVersion: z.number().int(),
  maxAttempts: z.number().int(),
  winnerBonus: z.number().int(),
  phase,
  participants: z.number().int(),
  me: standingSchema.nullable().optional(),
});
export type Competition = z.infer<typeof competitionSchema>;

const winnerSchema = z.object({ nickname, score: z.number().int(), scoreLabel: z.string().nullable().optional(), isMe: z.boolean(), shared: z.boolean().optional(), decidedBy: z.string().optional() });

const overviewSchema = z.object({
  now: z.number(),
  competition: competitionSchema.nullable(),
  lastWeek: z
    .object({
      id: z.string(),
      number: z.number().int().optional(),
      game: anyGame,
      startsAt: z.number().optional(),
      endsAt: z.number(),
      participants: z.number().int().nullable(),
      winners: z.array(winnerSchema),
      mine: z.object({ rank: z.number().int(), score: z.number().int(), scoreLabel: z.string().nullable(), field: z.number().int() }).nullable().optional(),
    })
    .nullable(),
  nickname,
  rules: z.record(z.string(), z.number().int()),
  next: z.object({ id: z.string(), number: z.number().int(), game: anyGame, startsAt: z.number() }).nullable().optional(),
});
export type GamesOverview = z.infer<typeof overviewSchema>;

const weeklyEntry = z.object({
  rank: z.number().int(),
  nickname,
  score: z.number().int(),
  scoreLabel: z.string().nullable().optional(),
  attemptsUsed: z.number().int().nullable().optional(),
  points: z.number().int().optional(),
  isWinner: z.boolean().optional(),
  isMe: z.boolean(),
});
const globalEntry = z.object({ rank: z.number().int(), nickname, points: z.number().int(), wins: z.number().int(), weeks: z.number().int(), isMe: z.boolean() });

const weeklySchema = z.object({
  scope: z.literal('weekly'),
  competition: competitionSchema.omit({ me: true, timezone: true, scoringVersion: true, maxAttempts: true, winnerBonus: true }).extend({ maxAttempts: z.number().int().optional() }).nullable(),
  entries: z.array(weeklyEntry),
  me: weeklyEntry.nullable(),
  myAttempts: z.number().int().nullable().optional(),
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
    number: z.number().int().optional(),
    game: anyGame,
    bot: z.string(),
    difficulty: anyDifficulty,
    config: config.optional(),
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
  weeks: z.array(z.object({ competitionId: z.string(), number: z.number().int().optional(), scoreLabel: z.string().nullable().optional(), game: anyGame, endsAt: z.number(), rank: z.number().int(), field: z.number().int(), score: z.number().int(), points: z.number().int(), isWinner: z.boolean() })),
  // opponent / prediction / insightPoints: Rock, Paper, Scissors reads (…_rps_opponent_reads.sql); absent on older servers.
  practice: z.array(
    z.object({
      game: gameId,
      bot: z.string(),
      difficulty,
      playerScore: z.number().int(),
      botScore: z.number().int(),
      outcome,
      playedAt: z.number(),
      opponent: z.enum(['mystery', 'chosen']).nullable().optional(),
      prediction: z.string().nullable().optional(),
      insightPoints: z.number().int().nullable().optional(),
    }),
  ),
  matches: z.array(z.object({ id: z.string(), kind: z.enum(['competition', 'challenge']), game: gameId, bot: z.string(), difficulty, playerScore: z.number().int(), botScore: z.number().int(), outcome: outcome.nullable(), competitionId: z.string().nullable(), completedAt: z.number().nullable() })),
});
export type MyGames = z.infer<typeof myGamesSchema>;

// v2: one competition in full, the history list and the all-time champions board.
const championSchema = winnerSchema.extend({ runnerUpScore: z.number().int().nullable().optional() });
const competitionDetailSchema = z.object({
  competition: competitionSchema.omit({ me: true }).extend({ cancelReason: z.string().nullable().optional() }),
  champions: z.array(championSchema),
  entries: z.array(weeklyEntry),
  me: weeklyEntry.nullable().optional(),
  now: z.number(),
});
export type CompetitionDetail = z.infer<typeof competitionDetailSchema>;

const historyItem = competitionSchema.omit({ me: true }).extend({
  champions: z.array(z.object({ nickname, score: z.number().int(), scoreLabel: z.string().nullable().optional(), isMe: z.boolean() })),
  mine: z.object({ rank: z.number().int(), score: z.number().int(), scoreLabel: z.string().nullable().optional(), field: z.number().int(), isWinner: z.boolean() }).nullable().optional(),
});
const historySchema = z.object({ items: z.array(historyItem), next: z.number().nullable() });
export type CompetitionHistoryPage = z.infer<typeof historySchema>;
export type CompetitionHistoryItem = z.infer<typeof historyItem>;

const championsBoardSchema = z.object({
  entries: z.array(z.object({ rank: z.number().int(), nickname, titles: z.number().int(), weeks: z.number().int(), bestRank: z.number().int(), isMe: z.boolean() })),
  me: z.object({ titles: z.number().int(), weeks: z.number().int(), bestRank: z.number().int() }).nullable(),
  competitions: z.number().int(),
});
export type ChampionsBoard = z.infer<typeof championsBoardSchema>;

export interface PracticeRecord {
  id: string;
  game: GameId;
  bot: string;
  difficulty: Difficulty;
  playerScore: number;
  botScore: number;
  outcome: 'win' | 'loss' | 'draw';
  /** Rock, Paper, Scissors: a hidden (mystery) or chosen opponent, the player's locked read of it, and the Insight Points it earned. */
  opponent?: 'mystery' | 'chosen';
  prediction?: string | null;
  insightPoints?: number | null;
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
  competition(competitionId: string): Promise<CompetitionDetail>;
  /** Past competitions, newest first; `before` is the `next` of the previous page. */
  competitionHistory(before?: number | null): Promise<CompetitionHistoryPage>;
  champions(): Promise<ChampionsBoard>;
}

export function gamesRepository(rpc: Rpc): GamesRepository {
  return {
    overview: async () => parse(overviewSchema, await games(rpc, 'get_games_overview'), 'get_games_overview'),
    setNickname: async (name) => {
      // A refusal comes back as data, not as an error, so the server keeps its record of the attempt for rate limiting
      // (supabase/migrations/20261106120000_nickname_rate_limit.sql). It surfaces exactly like the old raised refusals.
      const r = parse(nicknameResult, await games(rpc, 'set_nickname', { nickname: name }), 'set_nickname');
      if ('nickname' in r) return r.nickname;
      const refusal = /^games:([a-z_]+)$/.exec(r.refused)?.[1];
      if (refusal === 'nickname_rate_limited') throw new GameError('nickname_rate_limited', r.refused, nicknameLimitMessage(r.limit, r.retryAfterSeconds));
      if (refusal && refusal in REFUSAL_MESSAGES) throw new GameError(refusal as GameRefusal, r.refused);
      throw new DataError('server', `set_nickname refused for an unknown reason: ${r.refused.slice(0, 80)}`);
    },
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
    competition: async (competitionId) => parse(competitionDetailSchema, await games(rpc, 'get_competition', { competitionId }), 'get_competition'),
    competitionHistory: async (before) => parse(historySchema, await games(rpc, 'get_competition_history', { limit: 20, ...(before ? { before } : {}) }), 'get_competition_history'),
    champions: async () => parse(championsBoardSchema, await games(rpc, 'get_champions_leaderboard', {}), 'get_champions_leaderboard'),
  };
}
