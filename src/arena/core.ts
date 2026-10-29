import { type Outcome, draw } from '../games/core.ts';

/**
 * Strategy Arena — the shared contract for five deeper, fully local strategy games (src/arena/<game>.ts).
 *
 * These are separate from the weekly-competition games in src/games/: those have exact SQL ports on the server and a
 * fixed GameId set in Supabase. Arena games run entirely on the device, never call the backend during a match and keep
 * their records locally (src/features/arena/records.ts).
 *
 * Every engine is a pure reducer over an explicit state:
 * - `create(setup)` builds the opening state from the setup (opponent, level, variant, length, seed).
 * - `validate(state, action)` returns why an action is illegal now, or null. `apply` throws on an illegal action, so
 *   a duplicate tap, an out-of-range bid or a move after the end can never corrupt a match.
 * - Bots decide from the state *before* the player's action is applied, using only what the rules let them observe.
 *   Where the rules reveal the player's move first (an ultimatum responder sees the offer; a signal receiver sees the
 *   signal), that is documented on the engine.
 *
 * Randomness is counter-based (`draw(seed, round, k)` from src/games/core.ts): each random number is fixed by the seed,
 * round and a per-purpose index, so the same seed replays the same items, states and slips whatever anyone does, and
 * random outcomes never depend on the difficulty.
 */

export const ARENA_IDS = ['cooperation', 'ultimatum-game', 'auction', 'market', 'signal'] as const;
export type ArenaGameId = (typeof ARENA_IDS)[number];
export const isArenaId = (x: unknown): x is ArenaGameId => typeof x === 'string' && (ARENA_IDS as readonly string[]).includes(x);

/** The four opponent personalities. Each game gives them game-specific policies (documented on its bot functions). */
export const PERSONAS = ['investor', 'banker', 'dealmaker', 'opportunist'] as const;
export type Persona = (typeof PERSONAS)[number];
export const isPersona = (x: unknown): x is Persona => typeof x === 'string' && (PERSONAS as readonly string[]).includes(x);
export const PERSONA_NAME: Record<Persona, string> = { investor: 'The Investor', banker: 'The Banker', dealmaker: 'The Deal Maker', opportunist: 'The Opportunist' };

export const LEVELS = ['easy', 'normal', 'hard'] as const;
export type Level = (typeof LEVELS)[number];
export const isLevel = (x: unknown): x is Level => typeof x === 'string' && (LEVELS as readonly string[]).includes(x);

export const LENGTHS = ['short', 'standard', 'long'] as const;
export type MatchLength = (typeof LENGTHS)[number];
export const isLength = (x: unknown): x is MatchLength => typeof x === 'string' && (LENGTHS as readonly string[]).includes(x);

export type { Outcome };

/**
 * A match setup. `persona` is the chosen opponent: one of the four shared personalities by default, or a game's own
 * opponent set (the Cooperation Game has its own four), listed in that engine's `opponents`.
 */
export interface Setup<V extends string = string, P extends string = Persona> {
  persona: P;
  level: Level;
  variant: V;
  length: MatchLength;
  /** Unsigned 32-bit match seed. */
  seed: number;
}

export interface Standing {
  id: string;
  name: string;
  score: number;
  isPlayer: boolean;
}

export interface MatchResult {
  /**
   * Win: ahead of (or, where `par` applies, level with) every rival, and at or above `par`. Topping the table below
   * par is a draw — a hollow win: in a dilemma, beating the opponent by wrecking both scores isn't the goal.
   */
  outcome: Outcome;
  /** The benchmark the player needed to reach for a win, when the game has one. */
  par: number | null;
  /** Why the outcome is what it is, when that isn't simply "more than the rival". */
  note: string | null;
  /** The player's score in `unit`. */
  player: number;
  /** The best rival's score (the only rival in head-to-head games). */
  rival: number;
  /** Everyone, best first. */
  standings: Standing[];
  unit: string;
}

/** The post-game analysis, generated from what actually happened in the match. */
export interface Debrief {
  headline: string;
  /** One to three specific decisions from this match and what followed. */
  moments: string[];
  /** The strategy involved, tied to those moments. */
  insight: string;
  /** What the evidence shows about the opponent's behaviour (revealed at the end). */
  opponentRead: string;
}

export interface ArenaEngine<S extends { setup: Setup<V, any> }, A, V extends string = string> {
  id: ArenaGameId;
  /** The opponents this game offers, by id (first is the default). */
  opponents: readonly string[];
  variants: readonly V[];
  /** Rounds (or items) in a match of this length. */
  rounds(length: MatchLength): number;
  create(setup: Setup<V, any>): S;
  validate(state: S, action: A): string | null;
  apply(state: S, action: A): S;
  isOver(state: S): boolean;
  /** Rounds completed so far. */
  played(state: S): number;
  result(state: S): MatchResult;
  debrief(state: S): Debrief;
}

// Erased engine type for the match hook and screens that handle any arena game.
export type AnyArenaEngine = ArenaEngine<any, any, any>;

export const LENGTH_ROUNDS = (short: number, standard: number, long: number) => (length: MatchLength) =>
  length === 'short' ? short : length === 'long' ? long : standard;

/** A uniform integer in [lo, hi] from the counter-based generator. */
export function drawInt(seed: number, round: number, k: number, lo: number, hi: number): number {
  return lo + Math.floor(draw(seed, round, k) * (hi - lo + 1));
}

export { draw };

/** Outcome by comparing the player with the best rival. */
export function outcomeVs(player: number, rival: number): Outcome {
  return player > rival ? 'win' : player < rival ? 'loss' : 'draw';
}

/** Standings, best first; the player is listed first among equals. */
export function rank(entries: Standing[]): Standing[] {
  return [...entries].sort((a, b) => b.score - a.score || Number(b.isPlayer) - Number(a.isPlayer));
}

/**
 * The result from final scores. With `par`, a level score counts as a win (unless `tieWins` is false), and finishing on top below par is a draw.
 * `positive`: a win also needs a score above zero (an auction where everyone lost money has no winner).
 */
export function resultFrom(entries: Standing[], unit: string, opts: { par?: number; parLabel?: string; positive?: boolean; tieWins?: boolean } = {}): MatchResult {
  const standings = rank(entries);
  const player = entries.find((e) => e.isPlayer)!.score;
  const rival = Math.max(...entries.filter((e) => !e.isPlayer).map((e) => e.score));
  const par = opts.par ?? null;
  let outcome = outcomeVs(player, rival);
  let note: string | null = null;
  if (par !== null) {
    const ahead = opts.tieWins === false ? player > rival : player >= rival;
    if (ahead && player >= par) outcome = 'win';
    else if (player >= rival) {
      outcome = 'draw';
      note = `You finished on top, but below ${opts.parLabel ?? 'the benchmark'} (${par}) — a hollow win.`;
    }
  }
  if (opts.positive && outcome === 'win' && player <= 0) {
    outcome = 'draw';
    note = 'Nobody made money — finishing on top with no profit isn’t a win.';
  }
  return { outcome, par, note, player, rival, standings, unit };
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
