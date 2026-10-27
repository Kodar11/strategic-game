import { EPSILON } from './rng.ts';

/**
 * Hidden types, beliefs and signals (Lessons 15–18). Every probability here is explicit: priors, likelihoods and
 * posteriors come from Bayes' rule, and expected payoffs are probability-weighted sums.
 */

/** Posterior of each state after observing a signal: P(s | obs) ∝ P(s) · P(obs | s). */
export function posterior(prior: readonly number[], likelihood: readonly number[]): number[] {
  const joint = prior.map((p, i) => p * likelihood[i]);
  const total = joint.reduce((s, v) => s + v, 0);
  if (total <= 0) throw new Error('Observation has zero probability');
  return joint.map((j) => j / total);
}

export function expected(probs: readonly number[], values: readonly number[]): number {
  return probs.reduce((s, p, i) => s + p * values[i], 0);
}

/** Value of acting on the best of several actions under beliefs `probs`; `payoffs[a][s]` = action a in state s. */
export function bestAction(probs: readonly number[], payoffs: readonly (readonly number[])[]): { action: number; value: number } {
  let action = 0;
  let value = -Infinity;
  payoffs.forEach((row, a) => {
    const v = expected(probs, row);
    if (v > value + EPSILON) {
      value = v;
      action = a;
    }
  });
  return { action, value };
}

/**
 * Value of a signal before acting: for each possible signal, its probability times the value of the best action
 * under the matching posterior. `signal[k][s]` = P(signal k | state s).
 */
export function valueWithSignal(prior: readonly number[], signal: readonly (readonly number[])[], payoffs: readonly (readonly number[])[]): number {
  return signal.reduce((sum, lik) => {
    const pk = expected(prior, lik);
    if (pk <= 0) return sum;
    return sum + pk * bestAction(posterior(prior, lik), payoffs).value;
  }, 0);
}

// ── Signaling (Spence-style, two worker types) ───────────────────────────────

export interface SignalingGame {
  /** Productivity (= competitive wage when believed) of the high and low type. */
  high: number;
  low: number;
  /** Prior share of high types. */
  pHigh: number;
  /** Cost of the signal for each type. */
  costHigh: number;
  costLow: number;
}

/**
 * Separating equilibrium (high signals, low doesn't; wages = productivity) holds when neither type wants to copy
 * the other: high − costHigh ≥ low and low ≥ high − costLow. Weak inequalities: a type that is exactly
 * indifferent is assumed to stick to its equilibrium choice.
 */
export function separatingHolds(g: SignalingGame): { holds: boolean; highGains: number; lowGainsFromCopying: number } {
  const highGains = g.high - g.costHigh - g.low;
  const lowGainsFromCopying = g.high - g.costLow - g.low;
  return { holds: highGains >= -EPSILON && lowGainsFromCopying <= EPSILON, highGains, lowGainsFromCopying };
}

/**
 * Pooling equilibrium: both types make the same choice and are paid the average productivity. Off the path,
 * employers believe an unexpected choice comes from a low type (paid `low`), the standard pessimistic belief.
 */
export function poolingHolds(g: SignalingGame, onSignal: boolean): boolean {
  const avg = g.pHigh * g.high + (1 - g.pHigh) * g.low;
  if (!onSignal) {
    // Deviating to the signal is paid `low` minus its cost.
    return avg >= g.low - g.costHigh - EPSILON && avg >= g.low - g.costLow - EPSILON;
  }
  return avg - g.costHigh >= g.low - EPSILON && avg - g.costLow >= g.low - EPSILON;
}

export function averageWage(g: SignalingGame): number {
  return g.pHigh * g.high + (1 - g.pHigh) * g.low;
}

// ── Adverse selection (market for lemons) ────────────────────────────────────

/**
 * Cars with known qualities; each seller sells at price p only if p ≥ their quality (their own value of the car).
 * Buyers value a car at `buyerMultiplier` × its quality but can't see quality before buying.
 */
export function lemonsMarket(qualities: readonly number[], price: number, buyerMultiplier: number) {
  const offered = qualities.filter((q) => q <= price + EPSILON);
  const avgQuality = offered.length ? offered.reduce((s, q) => s + q, 0) / offered.length : 0;
  const buyerValue = avgQuality * buyerMultiplier;
  return { offered, avgQuality, buyerValue, buyerSurplus: offered.length ? buyerValue - price : 0 };
}

// ── Information cascade ──────────────────────────────────────────────────────

/**
 * Posterior that option A is better after net signals: with symmetric signals of accuracy a and a 50/50 prior,
 * only the difference between A-signals and B-signals matters.
 */
export function cascadePosterior(aSignals: number, bSignals: number, accuracy: number): number {
  const k = aSignals - bSignals;
  const ra = accuracy ** Math.max(0, k) * (1 - accuracy) ** Math.max(0, -k);
  const rb = (1 - accuracy) ** Math.max(0, k) * accuracy ** Math.max(0, -k);
  return ra / (ra + rb);
}
