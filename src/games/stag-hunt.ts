import { type GameEngine, type MatchSpec, draw, outcomeOf, sumTotals } from './core.ts';

/**
 * Stag Hunt — 8 rounds, both choices hidden until the reveal.
 *
 * Payoffs per round (player / bot):
 *   both Stag            5 / 5   the big cooperative reward
 *   you Stag, bot Hare   0 / 3   the stag escapes alone; the hare hunter is fine
 *   you Hare, bot Stag   3 / 0
 *   both Hare            3 / 3   the safe solo reward
 * Neither action is better in every situation: Stag is the best reply to Stag (5 > 3), Hare is the best reply to
 * Hare (3 > 0). Both (Stag, Stag) and (Hare, Hare) are equilibria. Stag pays off on average only if the partner
 * hunts stag with probability above 3/5 — so it's a question of trust, not of incentive to cheat.
 *
 * Bots see the full history of the current match; it resets each match.
 */

export type StagMove = 'stag' | 'hare';
export const STAG_MOVES: readonly StagMove[] = ['stag', 'hare'];

export type StagBot = 'cautious' | 'optimist' | 'opportunistic' | 'conditional';
export const STAG_BOTS: readonly StagBot[] = ['cautious', 'optimist', 'opportunistic', 'conditional'];

export const STAG_ROUNDS = 8;
export const STAG_PAYOFFS = { together: 5, alone: 0, hare: 3 } as const;
/** Stag beats Hare in expectation when the partner hunts stag with probability above 3/5. */
export const STAG_BREAK_EVEN = STAG_PAYOFFS.hare / STAG_PAYOFFS.together;

export interface StagRound {
  p: StagMove;
  b: StagMove;
  ps: number;
  bs: number;
}

export function stagPayoffs(p: StagMove, b: StagMove): [number, number] {
  const P = STAG_PAYOFFS;
  const mine = (me: StagMove, other: StagMove) => (me === 'hare' ? P.hare : other === 'stag' ? P.together : P.alone);
  return [mine(p, b), mine(b, p)];
}

/**
 * The bot's choice for round `history.length`. Beliefs are about how often the player hunts stag; "Laplace" means
 * (stag rounds + 1) / (rounds + 2), a cautious estimate that starts at ½ with no evidence. All comparisons are done
 * in whole numbers.
 *
 * - Cautious Hunter. Easy: always Hare. Medium: Stag only after the player chose Stag in each of the last three
 *   rounds. Hard: Stag only when its Laplace belief is at least 0.8.
 * - Optimist. Easy: always Stag. Medium: Stag, but after two failed Stag hunts in a row it takes one Hare. Hard: Stag
 *   85 % of the time while its belief is at least 0.4, otherwise Hare.
 * - Opportunistic Hunter: Stag exactly when the expected value of Stag (5 × belief) beats the sure 3. Easy: belief =
 *   the player's last choice (½ before any round, so it opens with Hare). Medium: Laplace over the match. Hard:
 *   Laplace over the last four rounds, weighted 4-3-2-1 towards the most recent.
 * - Conditional Partner: opens with Stag (it offers trust first), then hunts stag while its belief clears a bar —
 *   easy 0.5, medium 0.6, hard 0.7 — and, on hard, only if the player hunted stag last round too.
 */
export function stagBotMove(spec: MatchSpec<StagBot>, history: readonly StagRound[]): StagMove {
  const { bot, difficulty, seed } = spec;
  const n = history.length;
  const last = history[n - 1];
  const stags = history.filter((r) => r.p === 'stag').length;
  const stag = (yes: boolean): StagMove => (yes ? 'stag' : 'hare');

  switch (bot) {
    case 'cautious':
      if (difficulty === 'easy') return 'hare';
      if (difficulty === 'medium') return stag(n >= 3 && history.slice(-3).every((r) => r.p === 'stag'));
      return stag((stags + 1) * 5 >= (n + 2) * 4);
    case 'optimist':
      if (difficulty === 'easy') return 'stag';
      if (difficulty === 'medium') {
        const failed = (r: StagRound | undefined) => r?.b === 'stag' && r.p === 'hare';
        return stag(!(failed(last) && failed(history[n - 2])));
      }
      if (n < 2) return 'stag';
      return stag((stags + 1) * 10 >= (n + 2) * 4 && draw(seed, n, 0) < 0.85);
    case 'opportunistic': {
      if (difficulty === 'easy') return stag(!!last && last.p === 'stag');
      if (difficulty === 'medium') return stag(5 * (stags + 1) > 3 * (n + 2));
      let ws = 0;
      let wt = 0;
      history.slice(-4).forEach((r, i, recent) => {
        const w = 4 - (recent.length - 1 - i);
        wt += w;
        if (r.p === 'stag') ws += w;
      });
      return stag(5 * (ws + 1) > 3 * (wt + 2));
    }
    case 'conditional':
      if (n === 0) return 'stag';
      if (difficulty === 'easy') return stag(2 * (stags + 1) >= n + 2);
      if (difficulty === 'medium') return stag(5 * (stags + 1) >= 3 * (n + 2));
      return stag(10 * (stags + 1) >= 7 * (n + 2) && last.p === 'stag');
  }
}

export const stagHunt: GameEngine<StagBot, StagMove, StagRound, null> = {
  id: 'stag-hunt',
  rulesVersion: 1,
  rounds: STAG_ROUNDS,
  bots: STAG_BOTS,
  prompt: () => null,
  parseMove: (raw) => (raw === 'stag' || raw === 'hare' ? raw : null),
  resolve(spec, history, move) {
    if (history.length >= STAG_ROUNDS) throw new Error('stag-hunt: the match is over');
    const b = stagBotMove(spec, history);
    const [ps, bs] = stagPayoffs(move, b);
    return { p: move, b, ps, bs };
  },
  totals: (history) => sumTotals(history, (r) => r.ps, (r) => r.bs),
  outcome: (history) => outcomeOf(stagHunt.totals(history)),
};
