import {
  type MatrixGame,
  colDominance,
  mapPayoffs,
  pureNashEquilibria,
  rowDominance,
} from './payoff-matrix.ts';
import { EPSILON, clamp } from './rng.ts';

/** Pricing game used in Lessons 1 and 5. Row = QuickEats, column = FoodKart. */
export type PriceAction = 'maintain' | 'cut';

export const PRICE_ACTIONS: readonly PriceAction[] = ['maintain', 'cut'];

export const BASE_PRICING_GAME: MatrixGame<PriceAction, PriceAction> = {
  rows: PRICE_ACTIONS,
  cols: PRICE_ACTIONS,
  payoffs: [
    [
      [8, 8],
      [3, 10],
    ],
    [
      [10, 3],
      [5, 5],
    ],
  ],
};

/**
 * How much more a company earns by cutting rather than maintaining, holding the rival fixed.
 * In the base game this is 2 against either rival action (10 − 8 and 5 − 3).
 */
export const BASE_CUT_ADVANTAGE = 2;

export interface IncentiveRules {
  /** Enforced cost paid by each company that cuts prices. */
  cutPenalty: number;
  /** Reward paid to each company that maintains prices. */
  maintainReward: number;
}

export const NO_RULES: IncentiveRules = { cutPenalty: 0, maintainReward: 0 };

export const PENALTY_RANGE = { min: 0, max: 5, step: 0.5 } as const;
export const REWARD_RANGE = { min: 0, max: 5, step: 0.5 } as const;

export function sanitizeRules(rules: IncentiveRules): IncentiveRules {
  return {
    cutPenalty: clamp(rules.cutPenalty, PENALTY_RANGE.min, PENALTY_RANGE.max),
    maintainReward: clamp(rules.maintainReward, REWARD_RANGE.min, REWARD_RANGE.max),
  };
}

/**
 * Subtract the penalty from each company that cuts, add the reward to each that maintains.
 * Nothing else changes: unrelated payoffs stay exactly as in the base game.
 */
export function applyRules(
  rules: IncentiveRules,
  base: MatrixGame<PriceAction, PriceAction> = BASE_PRICING_GAME,
): MatrixGame<PriceAction, PriceAction> {
  const { cutPenalty: p, maintainReward: s } = sanitizeRules(rules);
  const adjust = (value: number, action: PriceAction) => value + (action === 'cut' ? -p : s);
  return mapPayoffs(base, ([a, b], row, col) => [adjust(a, row), adjust(b, col)] as const);
}

/** Lesson 1's penalty experiment: only a cut penalty. */
export function applyCutPenalty(p: number, base = BASE_PRICING_GAME) {
  return applyRules({ cutPenalty: p, maintainReward: 0 }, base);
}

export type Regime = 'cut-dominant' | 'tie' | 'maintain-dominant';

/**
 * With penalty p and reward s, cutting beats maintaining by 2 − p − s for either rival action.
 * So: p + s < 2 → cut strictly dominant; = 2 → indifferent; > 2 → maintain strictly dominant.
 */
export function regimeFor(rules: IncentiveRules): Regime {
  const { cutPenalty, maintainReward } = sanitizeRules(rules);
  const margin = BASE_CUT_ADVANTAGE - cutPenalty - maintainReward;
  if (Math.abs(margin) < EPSILON) return 'tie';
  return margin > 0 ? 'cut-dominant' : 'maintain-dominant';
}

export function cutAdvantage(rules: IncentiveRules): number {
  const { cutPenalty, maintainReward } = sanitizeRules(rules);
  return BASE_CUT_ADVANTAGE - cutPenalty - maintainReward;
}

export interface PolicyOutcome {
  game: MatrixGame<PriceAction, PriceAction>;
  regime: Regime;
  /** Pure equilibria of the adjusted game. */
  equilibria: { row: PriceAction; col: PriceAction }[];
  /** The outcome predicted when each side plays its strictly dominant action (null if none). */
  predicted: { row: PriceAction; col: PriceAction } | null;
  /** Company payoffs at the predicted outcome, after penalties and rewards. */
  companyPayoffs: readonly [number, number] | null;
  /** Money the rule-maker collects in penalties at the predicted outcome. */
  penaltiesCollected: number;
  /** Money the rule-maker pays out in rewards at the predicted outcome. */
  rewardsPaid: number;
}

export function evaluatePolicy(rules: IncentiveRules): PolicyOutcome {
  const safe = sanitizeRules(rules);
  const game = applyRules(safe);
  const r = rowDominance(game);
  const c = colDominance(game);
  const predicted = r.kind === 'strict' && c.kind === 'strict' ? { row: r.action, col: c.action } : null;
  let companyPayoffs: readonly [number, number] | null = null;
  let penaltiesCollected = 0;
  let rewardsPaid = 0;
  if (predicted) {
    const ri = game.rows.indexOf(predicted.row);
    const ci = game.cols.indexOf(predicted.col);
    companyPayoffs = game.payoffs[ri][ci];
    for (const a of [predicted.row, predicted.col]) {
      if (a === 'cut') penaltiesCollected += safe.cutPenalty;
      else rewardsPaid += safe.maintainReward;
    }
  }
  return {
    game,
    regime: regimeFor(safe),
    equilibria: pureNashEquilibria(game),
    predicted,
    companyPayoffs,
    penaltiesCollected,
    rewardsPaid,
  };
}

/**
 * FoodKart's stated policy: it maximises its own payoff without seeing QuickEats' choice.
 * If one action is strictly dominant it plays that; if it is indifferent it keeps prices (status quo).
 */
export function rivalPolicy(game: MatrixGame<PriceAction, PriceAction> = BASE_PRICING_GAME): PriceAction {
  const d = colDominance(game);
  return d.kind === 'strict' ? d.action : 'maintain';
}
