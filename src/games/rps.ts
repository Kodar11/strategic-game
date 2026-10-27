import { type GameEngine, type MatchSpec, draw, outcomeOf, sumTotals } from './core.ts';

/**
 * Rock, Paper, Scissors — 12 rounds against one bot.
 *
 * Rules: rock beats scissors, scissors beats paper, paper beats rock; the same move is a tie. Every match lasts
 * exactly 12 rounds (no early finish), so scores are comparable. Points: win 3, tie 1, loss 0 — for each side.
 * The match is won by whoever has more points after round 12; equal points is a draw.
 *
 * Bots see the revealed rounds only. Each policy below states what it reads. "Noise" is the chance a bot ignores its
 * policy and plays uniformly at random for that round, so no bot is perfectly predictable.
 */

export type RpsMove = 'rock' | 'paper' | 'scissors';
export const RPS_MOVES: readonly RpsMove[] = ['rock', 'paper', 'scissors'];

export type RpsBot = 'repeater' | 'counter' | 'mind-reader' | 'randomizer';
export const RPS_BOTS: readonly RpsBot[] = ['repeater', 'counter', 'mind-reader', 'randomizer'];

export interface RpsRound {
  p: RpsMove;
  b: RpsMove;
  /** From the player's side: 1 win, 0 tie, −1 loss. */
  r: 1 | 0 | -1;
}

export const RPS_ROUNDS = 12;
export const RPS_POINTS = { win: 3, tie: 1, loss: 0 } as const;

const idx = (m: RpsMove) => RPS_MOVES.indexOf(m);
/** The move that beats `m`. */
export const beats = (m: RpsMove): RpsMove => RPS_MOVES[(idx(m) + 1) % 3];

export function rpsResult(p: RpsMove, b: RpsMove): 1 | 0 | -1 {
  if (p === b) return 0;
  return p === beats(b) ? 1 : -1;
}

const randomMove = (u: number): RpsMove => RPS_MOVES[Math.floor(u * 3)];

/** Explicit per-difficulty settings. `minHistory`: rounds a predictor needs before it trusts its model. */
export const RPS_CONFIG = {
  repeater: { easy: { noise: 0.1 }, medium: { noise: 0.15 }, hard: { noise: 0.1 } },
  counter: {
    easy: { noise: 0.3, window: 0, weighted: false, minHistory: 3 },
    medium: { noise: 0.15, window: 6, weighted: false, minHistory: 2 },
    hard: { noise: 0.08, window: 5, weighted: true, minHistory: 1 },
  },
  'mind-reader': {
    easy: { noise: 0.35, order2: false, minHistory: 4 },
    medium: { noise: 0.2, order2: false, minHistory: 3 },
    hard: { noise: 0.1, order2: true, minHistory: 2 },
  },
  randomizer: { easy: { noise: 0 }, medium: { noise: 0 }, hard: { noise: 0 } },
} as const;

/** The most likely move from weighted counts [rock, paper, scissors]; ties broken at random with draw k = 2. */
function argmax(counts: readonly number[], seed: number, round: number): RpsMove {
  const best = Math.max(...counts);
  const tied = RPS_MOVES.filter((_, i) => counts[i] === best);
  return tied.length === 1 ? tied[0] : tied[Math.floor(draw(seed, round, 2) * tied.length)];
}

/** Frequency of the player's moves over the last `window` rounds (0 = all); weights 1…n favour recent rounds. */
function frequency(history: readonly RpsRound[], window: number, weighted: boolean): number[] {
  const seen = window > 0 ? history.slice(-window) : history;
  const counts = [0, 0, 0];
  seen.forEach((r, i) => {
    counts[idx(r.p)] += weighted ? i + 1 : 1;
  });
  return counts;
}

/** What the player played after each earlier occurrence of `context` (their last one or two moves). */
function transitions(history: readonly RpsRound[], order: 1 | 2): number[] | null {
  const n = history.length;
  if (n < order + 1) return null;
  const counts = [0, 0, 0];
  let any = false;
  for (let i = order; i < n; i++) {
    const match = order === 1 ? history[i - 1].p === history[n - 1].p : history[i - 2].p === history[n - 2].p && history[i - 1].p === history[n - 1].p;
    if (match) {
      counts[idx(history[i].p)] += 1;
      any = true;
    }
  }
  return any ? counts : null;
}

/**
 * The bot's move for round `history.length`, from the revealed rounds only.
 *
 * - Repeater. Easy: plays its own previous move again (rock first). Medium: win-stay, lose-shift — after losing it
 *   switches to the move that beats what just beat it, otherwise it repeats. Hard: as medium, but after losing two
 *   rounds in a row it plays the player's last move (it expects the player to anticipate the shift).
 * - Counter. Plays what beats the player's most frequent move. Easy: over the whole match, from round 4. Medium: the
 *   last 6 rounds. Hard: the last 5 rounds, recent rounds weighted more.
 * - Mind Reader. Predicts the player's next move from what they played after the same move before (order 1); hard
 *   first looks at what followed the same last two moves (order 2). Falls back to plain frequency, then random.
 * - Randomizer. Every move is equally likely in the long run. Easy: "streaky" — repeats its last move half the time
 *   (otherwise uniform). Medium: uniform, but never the same move three times in a row (a human idea of random).
 *   Hard: independent uniform choices (the equilibrium strategy, which no pattern-finder can beat on average).
 */
export function rpsBotMove(spec: MatchSpec<RpsBot>, history: readonly RpsRound[]): RpsMove {
  const { bot, difficulty, seed } = spec;
  const round = history.length;
  const last = history[round - 1];
  const noise = RPS_CONFIG[bot][difficulty].noise;
  if (noise > 0 && round > 0 && draw(seed, round, 0) < noise) return randomMove(draw(seed, round, 1));

  switch (bot) {
    case 'repeater': {
      if (!last) return 'rock';
      if (difficulty === 'easy') return last.b;
      const prev = history[round - 2];
      if (difficulty === 'hard' && last.r === 1 && prev?.r === 1) return last.p;
      return last.r === 1 ? beats(last.p) : last.b;
    }
    case 'counter': {
      const c = RPS_CONFIG.counter[difficulty];
      if (round < c.minHistory) return randomMove(draw(seed, round, 1));
      return beats(argmax(frequency(history, c.window, c.weighted), seed, round));
    }
    case 'mind-reader': {
      const c = RPS_CONFIG['mind-reader'][difficulty];
      if (round < c.minHistory) return randomMove(draw(seed, round, 1));
      const counts = (c.order2 ? transitions(history, 2) : null) ?? transitions(history, 1) ?? frequency(history, 0, false);
      return beats(argmax(counts, seed, round));
    }
    case 'randomizer': {
      const u = draw(seed, round, 1);
      if (difficulty === 'easy') return last && draw(seed, round, 0) < 0.5 ? last.b : randomMove(u);
      if (difficulty === 'medium') {
        const prev = history[round - 2];
        if (last && prev && last.b === prev.b) {
          const others = RPS_MOVES.filter((m) => m !== last.b);
          return others[Math.floor(u * 2)];
        }
      }
      return randomMove(u);
    }
  }
}

const points = (r: 1 | 0 | -1) => (r === 1 ? RPS_POINTS.win : r === 0 ? RPS_POINTS.tie : RPS_POINTS.loss);

export const rps: GameEngine<RpsBot, RpsMove, RpsRound, null> = {
  id: 'rps',
  rulesVersion: 1,
  rounds: RPS_ROUNDS,
  bots: RPS_BOTS,
  prompt: () => null,
  parseMove: (raw) => (typeof raw === 'string' && (RPS_MOVES as readonly string[]).includes(raw) ? (raw as RpsMove) : null),
  resolve(spec, history, move) {
    if (history.length >= RPS_ROUNDS) throw new Error('rps: the match is over');
    const b = rpsBotMove(spec, history);
    return { p: move, b, r: rpsResult(move, b) };
  },
  totals: (history) => sumTotals(history, (r) => points(r.r), (r) => points((-r.r) as 1 | 0 | -1)),
  outcome: (history) => outcomeOf(rps.totals(history)),
};
