import { type GameEngine, type MatchSpec, draw, outcomeOf, sumTotals } from './core.ts';

/**
 * Split or Steal — 10 rounds against one bot, both choices hidden until the reveal.
 *
 * Payoffs per round (coins: player / bot):
 *   both Split            5 / 5
 *   you Steal, bot Splits 8 / 0
 *   you Split, bot Steals 0 / 8
 *   both Steal            1 / 1
 * Stealing pays more against either choice in a single round (8 > 5 and 1 > 0), yet both stealing (1 each) is worse
 * for both than both splitting (5 each) — the prisoner's dilemma. Over 10 rounds, what the other side remembers
 * matters. The match has a known length: 10 rounds, announced up front.
 *
 * Memory: every bot sees the full history of the current match and nothing else. It resets when a new match starts —
 * a rematch is a fresh encounter.
 */

export type SplitMove = 'split' | 'steal';
export const SPLIT_MOVES: readonly SplitMove[] = ['split', 'steal'];

export type SplitBot = 'cooperator' | 'opportunist' | 'retaliator' | 'strategist';
export const SPLIT_BOTS: readonly SplitBot[] = ['cooperator', 'opportunist', 'retaliator', 'strategist'];

export const SPLIT_ROUNDS = 10;
export const SPLIT_PAYOFFS = { bothSplit: 5, temptation: 8, sucker: 0, bothSteal: 1 } as const;

export interface SplitRound {
  p: SplitMove;
  b: SplitMove;
  ps: number;
  bs: number;
}

export function splitPayoffs(p: SplitMove, b: SplitMove): [number, number] {
  const P = SPLIT_PAYOFFS;
  if (p === 'split' && b === 'split') return [P.bothSplit, P.bothSplit];
  if (p === 'steal' && b === 'split') return [P.temptation, P.sucker];
  if (p === 'split' && b === 'steal') return [P.sucker, P.temptation];
  return [P.bothSteal, P.bothSteal];
}

const copy = (last: SplitRound | undefined): SplitMove => (last ? last.p : 'split');

/**
 * The bot's choice for round `history.length` from the revealed rounds of this match.
 *
 * - Cooperator. Easy: always splits. Medium: splits unless the player stole in both of the last two rounds, then
 *   steals once. Hard: generous tit-for-tat — copies the player's last choice, but forgives a steal one time in three.
 * - Opportunist. Easy: steals on a coin flip. Medium: splits for two rounds, then steals whenever the player split in
 *   both of the last two rounds (it exploits trust). Hard: tit-for-tat, except it steals after three splits in a row
 *   (a probe) and in the last two rounds, when retaliation can no longer cost it much.
 * - Retaliator. Easy: tit-for-tat (one steal for one steal). Medium: two steals for every steal (steals if the
 *   player stole in either of the last two rounds). Hard: grim — after the player's first steal it never splits again.
 * - Strategist. Easy: splits for three rounds, then splits only if the player split in at least two of the last three.
 *   Medium: win-stay, lose-shift — splits when both made the same choice last round, steals otherwise. Hard: reads
 *   the player — steals against frequent stealers (≥ 40 % of rounds), exploits an unconditional splitter late (rounds
 *   8–9) and always steals in the final round; otherwise tit-for-tat.
 */
export function splitBotMove(spec: MatchSpec<SplitBot>, history: readonly SplitRound[]): SplitMove {
  const { bot, difficulty, seed } = spec;
  const n = history.length;
  const last = history[n - 1];
  const prev = history[n - 2];
  const stole = (r: SplitRound | undefined) => r?.p === 'steal';
  const splitStreak = (k: number) => n >= k && history.slice(-k).every((r) => r.p === 'split');

  switch (bot) {
    case 'cooperator':
      if (difficulty === 'easy') return 'split';
      if (difficulty === 'medium') return stole(last) && stole(prev) ? 'steal' : 'split';
      return stole(last) && draw(seed, n, 0) >= 1 / 3 ? 'steal' : 'split';
    case 'opportunist':
      if (difficulty === 'easy') return draw(seed, n, 0) < 0.5 ? 'steal' : 'split';
      if (difficulty === 'medium') return n >= 2 && splitStreak(2) ? 'steal' : 'split';
      if (n >= SPLIT_ROUNDS - 2) return 'steal';
      if (splitStreak(3)) return 'steal';
      return copy(last);
    case 'retaliator':
      if (difficulty === 'easy') return copy(last);
      if (difficulty === 'medium') return stole(last) || stole(prev) ? 'steal' : 'split';
      return history.some(stole) ? 'steal' : 'split';
    case 'strategist': {
      if (difficulty === 'easy') {
        if (n < 3) return 'split';
        return history.slice(-3).filter((r) => r.p === 'split').length >= 2 ? 'split' : 'steal';
      }
      if (difficulty === 'medium') return !last || last.p === last.b ? 'split' : 'steal';
      if (n === SPLIT_ROUNDS - 1) return 'steal';
      if (n < 2) return 'split';
      const steals = history.filter(stole).length;
      if (steals * 10 >= n * 4) return 'steal';
      if (steals === 0 && n >= 7) return 'steal';
      return copy(last);
    }
  }
}

export const splitSteal: GameEngine<SplitBot, SplitMove, SplitRound, null> = {
  id: 'split-steal',
  rulesVersion: 1,
  rounds: SPLIT_ROUNDS,
  bots: SPLIT_BOTS,
  prompt: () => null,
  parseMove: (raw) => (raw === 'split' || raw === 'steal' ? raw : null),
  resolve(spec, history, move) {
    if (history.length >= SPLIT_ROUNDS) throw new Error('split-steal: the match is over');
    const b = splitBotMove(spec, history);
    const [ps, bs] = splitPayoffs(move, b);
    return { p: move, b, ps, bs };
  },
  totals: (history) => sumTotals(history, (r) => r.ps, (r) => r.bs),
  outcome: (history) => outcomeOf(splitSteal.totals(history)),
};
