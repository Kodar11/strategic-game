/**
 * Shared contract for the replayable bot games (src/games/<game>.ts). These are separate from the lesson engines in
 * src/game/: each game here is a complete multi-round match against one bot personality at one difficulty.
 *
 * Every engine is a pure function of (spec, history, move):
 * - `prompt(spec, history)` is what the player sees before choosing (e.g. the bot's offer in the Ultimatum Game).
 * - `resolve(spec, history, move)` decides the bot's action from the revealed history only, then resolves the round.
 *   Bots never receive the player's current move — except where the rules reveal it (a responder sees the offer).
 *
 * Randomness is counter-based: `draw(seed, round, k)` is the k-th random number of a round. It doesn't depend on how
 * many numbers were drawn before, so the same function can be reproduced exactly on the server
 * (supabase/migrations/…_games.sql, schema game_engine), which plays competition and friend-challenge matches
 * without ever sending the seed to the device.
 */

export const GAME_IDS = ['rps', 'two-thirds', 'split-steal', 'ultimatum', 'stag-hunt'] as const;
export type GameId = (typeof GAME_IDS)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const isGameId = (x: unknown): x is GameId => typeof x === 'string' && (GAME_IDS as readonly string[]).includes(x);
export const isDifficulty = (x: unknown): x is Difficulty => typeof x === 'string' && (DIFFICULTIES as readonly string[]).includes(x);

/** One match: which bot, how hard, and the seed for its random choices (an unsigned 32-bit integer). */
export interface MatchSpec<B extends string = string> {
  bot: B;
  difficulty: Difficulty;
  seed: number;
}

export type Outcome = 'win' | 'loss' | 'draw';

export interface Totals {
  player: number;
  bot: number;
}

export interface GameEngine<B extends string, Move, Round, Prompt> {
  id: GameId;
  /** Recorded with every server match. Bump it (here and in SQL) whenever rules, payoffs or a bot policy change. */
  rulesVersion: number;
  rounds: number;
  bots: readonly B[];
  prompt(spec: MatchSpec<B>, history: readonly Round[]): Prompt;
  /** The player's move if `raw` is legal in this round, otherwise null. */
  parseMove(raw: unknown, prompt: Prompt): Move | null;
  resolve(spec: MatchSpec<B>, history: readonly Round[], move: Move): Round;
  totals(history: readonly Round[]): Totals;
  outcome(history: readonly Round[]): Outcome;
}

// Erased engine type for registries and screens that handle any game.
export type AnyEngine = GameEngine<string, any, any, any>;

// ── Counter-based randomness ─────────────────────────────────────────────────

/** First output of mulberry32 (same generator as src/game/rng.ts), from a 32-bit state. */
function mulberryFirst(state: number): number {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The k-th uniform number in [0, 1) for a round of a match. Same inputs, same number, here and on the server. */
export function draw(seed: number, round: number, k: number): number {
  let h = (seed ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0;
  h = (h ^ Math.imul(k + 1, 0x85ebca77)) >>> 0;
  return mulberryFirst(h);
}

/** A fresh match seed. Only used for practice games played on the device; the server picks its own. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** Round half up. Written out (rather than Math.round) so SQL can reproduce it exactly: floor(x + 0.5). */
export const roundHalfUp = (x: number) => Math.floor(x + 0.5);

export const clampInt = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function outcomeOf(t: Totals): Outcome {
  return t.player > t.bot ? 'win' : t.player < t.bot ? 'loss' : 'draw';
}

export function sumTotals<R>(history: readonly R[], player: (r: R) => number, bot: (r: R) => number): Totals {
  let p = 0;
  let b = 0;
  for (const r of history) {
    p += player(r);
    b += bot(r);
  }
  return { player: p, bot: b };
}
