import { EPSILON, clamp } from './rng.ts';

/**
 * Two-strategy evolutionary dynamics (Lesson 7). Individuals don't choose: each is born playing strategy A or B,
 * is matched at random against the population, and earns fitness = background + average payoff. Strategies
 * that earn more than average grow in share (discrete replicator dynamics).
 *
 * `payoff[i][j]` is the payoff to strategy i against strategy j (0 = A, 1 = B).
 */
export interface PopulationGame {
  names: readonly [string, string];
  payoff: readonly [readonly [number, number], readonly [number, number]];
  /** Added to every payoff so fitness stays positive. Changes speed, not direction or rest points. */
  background: number;
}

/** Average payoff of A and B when a share `x` of the population plays A. */
export function fitness(g: PopulationGame, x: number): [number, number] {
  const fa = x * g.payoff[0][0] + (1 - x) * g.payoff[0][1];
  const fb = x * g.payoff[1][0] + (1 - x) * g.payoff[1][1];
  return [fa, fb];
}

export function replicatorStep(g: PopulationGame, x: number): number {
  const [fa, fb] = fitness(g, x);
  const wa = g.background + fa;
  const wb = g.background + fb;
  if (wa <= 0 || wb <= 0) throw new Error('Background fitness too low: fitness must stay positive');
  const mean = x * wa + (1 - x) * wb;
  return clamp((x * wa) / mean, 0, 1);
}

export function simulatePopulation(g: PopulationGame, x0: number, generations: number): number[] {
  const out = [clamp(x0, 0, 1)];
  for (let t = 0; t < generations; t++) out.push(replicatorStep(g, out[out.length - 1]));
  return out;
}

/** Interior share at which A and B earn the same (the mixed rest point), or null if there is none in (0, 1). */
export function interiorRestPoint(g: PopulationGame): number | null {
  const [[a, b], [c, d]] = g.payoff;
  const den = a - b - c + d;
  if (Math.abs(den) < EPSILON) return null;
  const x = (d - b) / den;
  return x > EPSILON && x < 1 - EPSILON ? x : null;
}

/**
 * Maynard Smith's ESS conditions for a pure strategy i against a mutant j: either i does strictly better against
 * itself, or equally well and strictly better against the mutant.
 */
export function isPureESS(g: PopulationGame, i: 0 | 1): boolean {
  const j = i === 0 ? 1 : 0;
  const self = g.payoff[i][i];
  const mutant = g.payoff[j][i];
  if (self > mutant + EPSILON) return true;
  if (Math.abs(self - mutant) <= EPSILON) return g.payoff[i][j] > g.payoff[j][j] + EPSILON;
  return false;
}

/**
 * Is the interior rest point stable? A mixed population is an ESS when a small increase in A's share makes A do
 * worse than B (so the share is pushed back). That holds exactly when a − b − c + d < 0.
 */
export function isInteriorStable(g: PopulationGame): boolean {
  const [[a, b], [c, d]] = g.payoff;
  return interiorRestPoint(g) !== null && a - b - c + d < -EPSILON;
}

/** Where the population ends up from x0 (to 3 decimals) after many generations. */
export function longRunShare(g: PopulationGame, x0: number, generations = 400): number {
  const path = simulatePopulation(g, x0, generations);
  return Math.round(path[path.length - 1] * 1000) / 1000;
}

/** Hawk–Dove with resource V and fight cost C. Strategy 0 = Hawk. */
export function hawkDove(V: number, C: number): PopulationGame {
  return {
    names: ['Hawk', 'Dove'],
    payoff: [
      [(V - C) / 2, V],
      [0, V / 2],
    ],
    background: Math.max(1, (C - V) / 2 + 1),
  };
}
