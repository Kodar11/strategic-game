import { type GameEngine, type MatchSpec, clampInt, draw, roundHalfUp } from './core.ts';

/**
 * The Two-Thirds Guessing Game — 5 rounds, the player plus a simulated group of 8 bots. Not a real population: the
 * group is made of named reasoning strategies, and the screen says so.
 *
 * Rules
 * - Everyone picks a whole number from 0 to 100 (no decimals).
 * - Target = ⅔ × the arithmetic mean of all 9 picks, the player's included. It is shown to two decimals, but the
 *   winner is decided exactly: a pick's distance is compared as |27·pick − 2·sum| (that is 3n·|pick − target|, n = 9),
 *   which is an integer, so there are no rounding errors.
 * - The pick(s) closest to the target win the round. Exact ties share the win.
 * - Player's score per round: 10 for a sole win, 5 for a shared win, plus closeness points max(0, 10 − ⌊distance⌋).
 *   At most 20 a round, 100 a match. The match ends after round 5.
 * - The match outcome compares rounds the player won (alone or shared) against rounds only bots won.
 *
 * The group: the chosen personality is the "crowd type" — 5 of the 8 bots use it, and one each of the other three
 * keeps the group mixed. Bots see every earlier round's picks (all picks are revealed after each round).
 */

export type TwoThirdsBot = 'crowd-follower' | 'shallow' | 'deep' | 'chaos';
export const TWO_THIRDS_BOTS: readonly TwoThirdsBot[] = ['crowd-follower', 'shallow', 'deep', 'chaos'];

export const TT_ROUNDS = 5;
export const TT_MIN = 0;
export const TT_MAX = 100;
export const TT_GROUP = 8;
export const TT_PLAYERS = TT_GROUP + 1;

export interface TwoThirdsRound {
  p: number;
  /** The 8 bot picks, in lineup order. */
  bots: number[];
  /** Player's points this round. */
  ps: number;
  /** Whether a bot won the round outright (the player wasn't among the winners). */
  botWon: boolean;
}

/** The 8 bots: five of the chosen type, then one of each other type, in TWO_THIRDS_BOTS order. */
export function lineup(crowd: TwoThirdsBot): TwoThirdsBot[] {
  return [crowd, crowd, crowd, crowd, crowd, ...TWO_THIRDS_BOTS.filter((t) => t !== crowd)];
}

export const sumOf = (r: Pick<TwoThirdsRound, 'p' | 'bots'>) => r.bots.reduce((s, x) => s + x, r.p);

/** Display values. The exact comparison uses `scaledDistance`. */
export function roundStats(r: Pick<TwoThirdsRound, 'p' | 'bots'>): { sum: number; average: number; target: number } {
  const sum = sumOf(r);
  return { sum, average: sum / TT_PLAYERS, target: (2 * sum) / (3 * TT_PLAYERS) };
}

/** 3n·|pick − target| as an exact integer. */
export const scaledDistance = (pick: number, sum: number) => Math.abs(3 * TT_PLAYERS * pick - 2 * sum);

export function winners(r: Pick<TwoThirdsRound, 'p' | 'bots'>): { player: boolean; count: number; best: number } {
  const sum = sumOf(r);
  const all = [r.p, ...r.bots].map((g) => scaledDistance(g, sum));
  const best = Math.min(...all);
  return { player: all[0] === best, count: all.filter((d) => d === best).length, best };
}

export function playerPoints(r: Pick<TwoThirdsRound, 'p' | 'bots'>): number {
  const w = winners(r);
  const winPts = w.player ? (w.count === 1 ? 10 : 5) : 0;
  const closeness = Math.max(0, 10 - Math.floor(scaledDistance(r.p, sumOf(r)) / (3 * TT_PLAYERS)));
  return winPts + closeness;
}

/** Jitter: a whole number in [−j, j] from the bot's own draw. */
const jitter = (u: number, j: number) => Math.floor(u * (2 * j + 1)) - j;

/**
 * A bot's pick for round `history.length`. A = last round's average (50 before any round), T = last round's target.
 *
 * - Crowd Follower: estimates where the group will be from where it was. Easy: picks that estimate itself (±10).
 *   Medium: ⅚ of it — partly adjusting for the ⅔ rule (±5). Hard: extrapolates the trend of the last two averages
 *   and picks ⅔ of that (±2).
 * - Shallow Thinker: one level of anticipation — ⅔ of what it expects the group to pick. Easy: anchors on 50 (≈33,
 *   ±8). Medium: anchors on 50 but tighter (±4). Hard: anchors on last round's actual average (±2).
 * - Deep Thinker: several levels — the anchor × (⅔)^k. Easy: k = 2 from 50 (≈22, ±5). Medium: k = 3 from 50 in
 *   round 1, then k = 2 from last average (±3). Hard: k = 4 from 50 in round 1, then k = 2 from last round's target —
 *   three levels below where the group actually was (±1).
 * - Chaos Agent: plausible but unpredictable. Easy: uniform 0–100. Medium: uniform 0–66 (never a pick that can't
 *   win). Hard: the sum of two uniform 0–40 picks (centred on 40, rarely extreme).
 */
export function botPick(type: TwoThirdsBot, spec: MatchSpec<TwoThirdsBot>, history: readonly TwoThirdsRound[], slot: number): number {
  const { difficulty, seed } = spec;
  const round = history.length;
  const u = draw(seed, round, slot);
  const last = history[round - 1];
  const prev = history[round - 2];
  const A = last ? sumOf(last) / TT_PLAYERS : 50;
  let base: number;
  let j: number;
  switch (type) {
    case 'crowd-follower':
      if (difficulty === 'easy') [base, j] = [A, 10];
      else if (difficulty === 'medium') [base, j] = [(A * 5) / 6, 5];
      else {
        const Aprev = prev ? sumOf(prev) / TT_PLAYERS : 0;
        const est = prev && Aprev > 0 ? Math.min(100, (A * A) / Aprev) : A;
        [base, j] = [(est * 2) / 3, 2];
      }
      break;
    case 'shallow':
      if (difficulty === 'easy') [base, j] = [(50 * 2) / 3, 8];
      else if (difficulty === 'medium') [base, j] = [(50 * 2) / 3, 4];
      else [base, j] = [(A * 2) / 3, 2];
      break;
    case 'deep': {
      let anchor: number;
      let k: number;
      if (difficulty === 'easy') [anchor, k, j] = [50, 2, 5];
      else if (difficulty === 'medium') [anchor, k, j] = last ? [A, 2, 3] : [50, 3, 3];
      else [anchor, k, j] = last ? [(A * 2) / 3, 2, 1] : [50, 4, 1];
      base = anchor;
      for (let i = 0; i < k; i++) base = (base * 2) / 3;
      break;
    }
    case 'chaos':
      if (difficulty === 'easy') return Math.floor(u * 101);
      if (difficulty === 'medium') return Math.floor(u * 67);
      return Math.floor(u * 41) + Math.floor(draw(seed, round, 100 + slot) * 41);
  }
  return clampInt(roundHalfUp(base) + jitter(u, j), TT_MIN, TT_MAX);
}

export function botPicks(spec: MatchSpec<TwoThirdsBot>, history: readonly TwoThirdsRound[]): number[] {
  return lineup(spec.bot).map((type, slot) => botPick(type, spec, history, slot));
}

export const twoThirds: GameEngine<TwoThirdsBot, number, TwoThirdsRound, null> = {
  id: 'two-thirds',
  rulesVersion: 1,
  rounds: TT_ROUNDS,
  bots: TWO_THIRDS_BOTS,
  prompt: () => null,
  parseMove: (raw) => (typeof raw === 'number' && Number.isInteger(raw) && raw >= TT_MIN && raw <= TT_MAX ? raw : null),
  resolve(spec, history, move) {
    if (history.length >= TT_ROUNDS) throw new Error('two-thirds: the match is over');
    const bots = botPicks(spec, history);
    const r = { p: move, bots };
    return { ...r, ps: playerPoints(r), botWon: !winners(r).player };
  },
  totals(history) {
    const won = history.filter((r) => !r.botWon).length;
    return { player: history.reduce((s, r) => s + r.ps, 0), bot: history.length - won };
  },
  outcome(history) {
    const won = history.filter((r) => !r.botWon).length;
    const lost = history.length - won;
    return won > lost ? 'win' : won < lost ? 'loss' : 'draw';
  },
};
