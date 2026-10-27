import { posterior } from '../../game/information.ts';
import { type MatrixGame, pureNashEquilibria, strictlyDominatedRows } from '../../game/payoff-matrix.ts';
import { alternatingOffers } from '../../game/bargaining.ts';
import { cournotBestResponse } from '../../game/markets.ts';
import { type PopulationGame, interiorRestPoint, longRunShare } from '../../game/evolution.ts';
import { AXELROD, grimThreshold } from '../../game/repeated.ts';
import { coreIsEmpty } from '../../game/collective.ts';

/**
 * The engine side of the assessments: for each single-answer calculable item, the solver that computes the matching
 * option from the game engine. The items themselves are content; tests check every solver against the option the
 * content marks `match`, so a claim can't drift from the maths. Keyed `<assessment>/<item>`.
 */
const AIRLINES: MatrixGame = { rows: ['high', 'low'], cols: ['high', 'low'], payoffs: [[[6, 6], [1, 8]], [[8, 1], [3, 3]]] };
const THREE_ROWS: MatrixGame = { rows: ['up', 'middle', 'down'], cols: ['left', 'right'], payoffs: [[[2, 1], [4, 0]], [[1, 2], [3, 3]], [[0, 1], [5, 2]]] };
const TWO_EQ: MatrixGame = { rows: ['T', 'B'], cols: ['L', 'R'], payoffs: [[[2, 1], [0, 0]], [[0, 0], [1, 2]]] };

/** The final case: Riverbend decides first; Hilltop sees it and has a private cost. */
export const CASE = {
  bothInvest: 12,
  oneInvestsInvestor: 5,
  oneInvestsOther: 7,
  neither: 3,
  riverbendCost: 4,
  hilltopCosts: [4, 7],
  pHigh: 0.5,
};
/** Hilltop invests after Riverbend's choice iff it pays more for its type. */
export function hilltopInvests(riverbendInvested: boolean, cost: number): boolean {
  return riverbendInvested ? CASE.bothInvest - cost > CASE.oneInvestsOther : CASE.oneInvestsInvestor - cost > CASE.neither;
}
export function riverbendValue(invest: boolean, pHigh = CASE.pHigh): number {
  return [1 - pHigh, pHigh].reduce((sum, p, i) => {
    const hInvests = hilltopInvests(invest, CASE.hilltopCosts[i]);
    const gross = invest ? (hInvests ? CASE.bothInvest : CASE.oneInvestsInvestor) : hInvests ? CASE.oneInvestsOther : CASE.neither;
    return sum + p * (gross - (invest ? CASE.riverbendCost : 0));
  }, 0);
}

export const ASSESSMENT_SOLVERS: Readonly<Partial<Record<string, () => string>>> = {
  'm1/m1.q1': () => (pureNashEquilibria(AIRLINES).length === 1 && pureNashEquilibria(AIRLINES)[0].row === 'low' ? 'both-low' : 'other'),
  'm1/m1.q2': () => strictlyDominatedRows(THREE_ROWS).join(','),
  'm1/m1.q3': () => (pureNashEquilibria(TWO_EQ).length === 2 ? 'both' : 'other'),
  'm2/m2.q2': () => String(Math.round((2 / 10) * 100)),
  'm2/m2.q3': () => String(cournotBestResponse({ a: 20, cost: 2 }, 6)),
  'm2/m2.q4': () => {
        const g: PopulationGame = { names: ['A', 'B'], payoff: [[3, 1], [2, 2]], background: 1 };
        return longRunShare(g, 0.9) === 1 && Math.abs((interiorRestPoint(g) ?? 0) - 0.5) < 1e-9 ? 'a' : 'other';
      },
  'm3/m3.q4': () => String(Math.round((6 / 30) * 100)),
  'm4/m4.q1': () => String(alternatingOffers([100, 40]).minAccept[0]),
  'm4/m4.q3': () => (0.4 < grimThreshold(AXELROD) ? 'no' : 'yes'),
  'm5/m5.q1': () => String(Math.round((2 / 3) * 40)),
  'm5/m5.q2': () => String(Math.round(posterior([0.01, 0.99], [0.9, 0.05])[0] * 100)),
  'm6/m6.q1': () => (coreIsEmpty({ A: 0, B: 0, C: 0, AB: 30, AC: 30, BC: 30, ABC: 36 }, ['A', 'B', 'C']) ? 'no' : 'yes'),
  'final/final.prediction': () => (riverbendValue(true) > riverbendValue(false) && riverbendValue(true) === 4.5 && riverbendValue(false) === 3 ? 'invest' : 'other'),
};
