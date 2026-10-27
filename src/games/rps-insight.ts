import type { Difficulty } from './core.ts';
import { RPS_BOTS, RPS_INSIGHT, RPS_MOVES, RPS_ROUNDS, type RpsBot, type RpsMove, type RpsRound, beats, rpsRuleMoves } from './rps.ts';

/**
 * Rock, Paper, Scissors as a reading exercise, around the unchanged engine in rps.ts:
 * - a mystery opponent (one of the four personalities, hidden until the match ends) or a chosen one for practice;
 * - "Read your opponent": one locked prediction per mystery match, worth Insight Points (RPS_INSIGHT) when right —
 *   never touching match points;
 * - the post-match reveal: evidence from the recorded throws and one practical takeaway;
 * - "Repeat this throw": one auto-submitted move per remaining round, cancellable at any time.
 * Everything here is pure; the screens hold the state.
 */

export type OpponentMode = 'mystery' | 'chosen';

export const isRpsBot = (x: unknown): x is RpsBot => typeof x === 'string' && (RPS_BOTS as readonly string[]).includes(x);

const NAME: Record<RpsBot, string> = { repeater: 'The Repeater', counter: 'The Counter', 'mind-reader': 'The Mind Reader', randomizer: 'The Randomizer' };
const MOVE: Record<RpsMove, string> = { rock: 'rock', paper: 'paper', scissors: 'scissors' };

/** The opponent for a match: the chosen personality, or — with no (valid) choice — a hidden one picked by `u` ∈ [0, 1). */
export function pickOpponent(choice: string | null | undefined, u: number): { bot: RpsBot; mode: OpponentMode } {
  if (isRpsBot(choice)) return { bot: choice, mode: 'chosen' };
  return { bot: RPS_BOTS[Math.min(RPS_BOTS.length - 1, Math.floor(u * RPS_BOTS.length))], mode: 'mystery' };
}

/** What the player may see as the opponent's name: hidden in a mystery match until it ends. */
export const MYSTERY_NAME = 'Mystery bot';
export const opponentName = (bot: string, mode: OpponentMode, done: boolean) => (mode === 'mystery' && !done ? MYSTERY_NAME : isRpsBot(bot) ? NAME[bot] : bot);

/**
 * How each personality plays at each difficulty, in the player's words — the options for a prediction and the rule
 * named in the reveal. Each line restates rpsBotMove; keep them in step. Every bot except the Randomizer also throws
 * at random some of the time.
 */
export const RPS_READS: Record<RpsBot, Record<Difficulty, string>> = {
  repeater: {
    easy: 'Repeats its own last throw.',
    medium: 'Repeats its own last throw — but after losing a round it switches to what beats your throw.',
    hard: 'Repeats its last throw, switches to what beats yours after a loss, and copies your throw after two losses in a row.',
  },
  counter: {
    easy: 'Plays what beats the throw you’ve made most this match.',
    medium: 'Plays what beats the throw you’ve made most in your last 6.',
    hard: 'Plays what beats your most frequent throw in your last 5, recent ones counting most.',
  },
  'mind-reader': {
    easy: 'Plays what beats the throw you usually make after your last one.',
    medium: 'Plays what beats the throw you usually make after your last one.',
    hard: 'Plays what beats the throw you usually make after your last two.',
  },
  randomizer: {
    easy: 'Random, but streaky: it often repeats its last throw.',
    medium: 'Random, but never the same throw three times in a row.',
    hard: 'Truly random: no pattern to find.',
  },
};

// ── Read your opponent ───────────────────────────────────────────────────────

/** A locked prediction: who the player thinks the opponent is, and after how many rounds they said so. */
export interface OpponentRead {
  guess: RpsBot;
  round: number;
}

export interface ReadState {
  mode: OpponentMode;
  roundsPlayed: number;
  /** The opponent has been revealed: the player skipped the read at the end of the match. */
  revealed: boolean;
}

/**
 * A prediction can be made once per mystery match, from RPS_INSIGHT.minRounds rounds until the reveal — including
 * the pause after the last round, so a quick finish (say, with "Repeat this throw") doesn't skip it.
 */
export function predictionOpen(read: OpponentRead | null, s: ReadState): boolean {
  return s.mode === 'mystery' && read === null && !s.revealed && s.roundsPlayed >= RPS_INSIGHT.minRounds;
}

/** All rounds are played but the mystery match holds its reveal: the player can still read, or skip to the results. */
export function awaitingRead(read: OpponentRead | null, s: ReadState & { totalRounds: number }): boolean {
  return predictionOpen(read, s) && s.roundsPlayed >= s.totalRounds;
}

/** Lock in a prediction. Anything else — a second guess, too early, after the reveal, not a personality — leaves `read` as it was. */
export function lockPrediction(read: OpponentRead | null, guess: unknown, s: ReadState): OpponentRead | null {
  if (!predictionOpen(read, s) || !isRpsBot(guess)) return read;
  return { guess, round: s.roundsPlayed };
}

/** The Insight Points a read earns: RPS_INSIGHT.points when right, 0 when wrong (no penalty), null with no read. */
export function insightFor(read: OpponentRead | null, bot: RpsBot): { correct: boolean; points: number } | null {
  if (!read) return null;
  const correct = read.guess === bot;
  return { correct, points: correct ? RPS_INSIGHT.points : 0 };
}

// ── Evidence ─────────────────────────────────────────────────────────────────

/** How often the bot's throws matched a personality's rule, counting only rounds where that rule names a throw. */
export function ruleFit(bot: RpsBot, difficulty: Difficulty, rounds: readonly RpsRound[]): { hits: number; chances: number } {
  let hits = 0;
  let chances = 0;
  for (let i = 0; i < rounds.length; i++) {
    const moves = rpsRuleMoves(bot, difficulty, rounds.slice(0, i));
    if (!moves) continue;
    chances += 1;
    if (moves.includes(rounds[i].b)) hits += 1;
  }
  return { hits, chances };
}

/** Rounds (after the first) in which the bot threw the same as the round before. */
function repeats(rounds: readonly RpsRound[]): number {
  return rounds.filter((r, i) => i > 0 && r.b === rounds[i - 1].b).length;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Facts from the recorded throws that bear on the opponent's rule. Every sentence is a count from `rounds`. */
export function evidence(bot: RpsBot, difficulty: Difficulty, rounds: readonly RpsRound[]): string[] {
  const out: string[] = [];
  const n = rounds.length;
  if (bot === 'randomizer') {
    const counts = RPS_MOVES.map((m) => rounds.filter((r) => r.b === m).length);
    out.push(`Its throws: rock ${counts[0]}, paper ${counts[1]}, scissors ${counts[2]}.`);
    if (difficulty === 'easy') out.push(`It repeated its previous throw ${repeats(rounds)} of ${n - 1} times — chance alone would be about 1 in 3.`);
    if (difficulty === 'medium' && !rounds.some((r, i) => i > 1 && r.b === rounds[i - 1].b && r.b === rounds[i - 2].b)) {
      out.push('It never threw the same move three times in a row.');
    }
    const others = (['repeater', 'counter', 'mind-reader'] as const).map((b) => ({ b, ...ruleFit(b, difficulty, rounds) })).filter((f) => f.chances > 0);
    const best = others.sort((x, y) => y.hits / y.chances - x.hits / x.chances)[0];
    if (best) {
      out.push(
        best.hits / best.chances < 0.5
          ? `No rule fitted: the closest, ${NAME[best.b]}’s, matched only ${best.hits} of ${best.chances} throws.`
          : `${NAME[best.b]}’s rule matched ${best.hits} of ${best.chances} throws — by chance: it follows no rule.`,
      );
    }
    return out;
  }

  const fit = ruleFit(bot, difficulty, rounds);
  out.push(`Its rule: ${lowerFirst(RPS_READS[bot][difficulty])} Its throws matched that in ${fit.hits} of ${fit.chances} rounds where the rule applied.`);
  if (bot === 'repeater') {
    out.push(`It kept its previous throw ${repeats(rounds)} of ${n - 1} times.`);
    if (difficulty !== 'easy') {
      const lost = rounds.map((r, i) => i).filter((i) => i < n - 1 && rounds[i].r === 1);
      const switched = lost.filter((i) => rounds[i + 1].b === beats(rounds[i].p)).length;
      if (lost.length) out.push(`After ${lost.length === 1 ? 'the round it lost' : `the ${lost.length} rounds it lost`}, it threw what beats your last throw ${switched} time${switched === 1 ? '' : 's'}.`);
    }
  } else if (bot === 'counter') {
    const counts = RPS_MOVES.map((m) => rounds.filter((r) => r.p === m).length);
    const top = Math.max(...counts);
    const fav = RPS_MOVES.filter((_, i) => counts[i] === top).map((m) => MOVE[m]);
    out.push(`Your most-thrown move was ${fav.join(' and ')} (${top} of ${n}).`);
  }
  if (fit.chances > 0) {
    out.push(fit.hits / fit.chances >= 0.5 ? 'The habit showed in most of its throws.' : 'Its random throws hid the habit more than usual this match.');
  }
  return out;
}

/** One practical thing to try next time against this personality at this difficulty. */
export function rpsTakeaway(bot: RpsBot, difficulty: Difficulty): string {
  switch (bot) {
    case 'repeater':
      return difficulty === 'easy'
        ? 'Play what beats its last throw — it will most likely throw it again.'
        : 'Play what beats its last throw after it wins or ties; after it loses, expect what beats your last throw, and answer that.';
    case 'counter':
      return 'Know your favourite throw — that is what it counters. If you’ve thrown rock most, expect paper and answer with scissors.';
    case 'mind-reader':
      return 'It learns what you throw after each throw. Change your follow-ups, or stay one step ahead: beat the throw that beats your usual follow-up.';
    case 'randomizer':
      return difficulty === 'easy'
        ? 'Its streaks are the only edge: when it repeats, play what beats its last throw.'
        : difficulty === 'medium'
          ? 'After it throws the same move twice, that move is ruled out next — pick from what’s left.'
          : 'Against true randomness no pattern pays. Mix your throws evenly and don’t chase streaks that aren’t there.';
  }
}

// ── The reveal ───────────────────────────────────────────────────────────────

export interface MatchReveal {
  bot: RpsBot;
  name: string;
  difficulty: Difficulty;
  mode: OpponentMode;
  read: OpponentRead | null;
  insight: { correct: boolean; points: number } | null;
  /** For a wrong read: how the guessed personality's rule fitted these throws. */
  guessFit: { hits: number; chances: number } | null;
  evidence: string[];
  takeaway: string;
}

/** Everything the result screen reveals — or null while the match is still being played. */
export function matchReveal(m: { bot: RpsBot; difficulty: Difficulty; mode: OpponentMode; rounds: readonly RpsRound[]; read: OpponentRead | null }): MatchReveal | null {
  if (m.rounds.length < RPS_ROUNDS) return null;
  const insight = insightFor(m.read, m.bot);
  return {
    bot: m.bot,
    name: NAME[m.bot],
    difficulty: m.difficulty,
    mode: m.mode,
    read: m.read,
    insight,
    guessFit: m.read && !insight!.correct && m.read.guess !== 'randomizer' ? ruleFit(m.read.guess, m.difficulty, m.rounds) : null,
    evidence: evidence(m.bot, m.difficulty, m.rounds),
    takeaway: rpsTakeaway(m.bot, m.difficulty),
  };
}

// ── Repeat this throw ────────────────────────────────────────────────────────

export interface RepeatState {
  roundsPlayed: number;
  totalRounds: number;
  /** A round is in flight (a server match): wait for it. */
  busy: boolean;
  done: boolean;
  error?: boolean;
}

/**
 * "Repeat this throw": while armed, each `tick` releases the move at most once per round — only when the round before
 * has been resolved and nothing is in flight. It disarms itself when the match ends or a submission fails, and
 * `cancel` stops it at once. The caller decides when to tick (after its reveal pause), so no round is skipped.
 */
export class RepeatThrow {
  private armed: { move: RpsMove; sentFor: number } | null = null;

  get move(): RpsMove | null {
    return this.armed?.move ?? null;
  }

  start(move: RpsMove): void {
    this.armed = { move, sentFor: -1 };
  }

  cancel(): void {
    this.armed = null;
  }

  /** The move to submit for the current round, if it hasn't been released for this round yet; otherwise null. */
  tick(s: RepeatState): RpsMove | null {
    const a = this.armed;
    if (!a) return null;
    if (s.done || s.error || s.roundsPlayed >= s.totalRounds) {
      this.armed = null;
      return null;
    }
    if (s.busy || a.sentFor === s.roundsPlayed) return null;
    a.sentFor = s.roundsPlayed;
    return a.move;
  }
}
