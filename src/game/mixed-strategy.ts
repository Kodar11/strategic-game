import { clamp, createRng } from './rng.ts';

/** Lesson 4. The striker scores 1 when the keeper dives the other way, 0 when the keeper guesses right. */
export type Side = 'L' | 'R';

export const opposite = (s: Side): Side => (s === 'L' ? 'R' : 'L');

export function shotPayoff(shot: Side, dive: Side): 0 | 1 {
  return shot === dive ? 0 : 1;
}

/** Expected striker payoff when shooting left with probability q against a keeper diving left with probability k. */
export function expectedPayoff(q: number, k: number): number {
  const ql = clamp(q, 0, 1);
  const kl = clamp(k, 0, 1);
  return ql * (1 - kl) + (1 - ql) * kl;
}

/** Against a keeper who knows q, the keeper picks the dive that minimises your expected payoff: min(q, 1 − q). */
export function guaranteedPayoff(q: number): number {
  const ql = clamp(q, 0, 1);
  return Math.min(ql, 1 - ql);
}

/** The keeper's best pure response to a known mix q (ties → 'L'). */
export function keeperBestResponse(q: number): Side {
  return clamp(q, 0, 1) >= 0.5 ? 'L' : 'R';
}

export const EQUILIBRIUM_MIX = 0.5;

/**
 * Adaptive keeper — stated policy and parameters:
 * - Looks only at your past shots, never at the current one.
 * - WINDOW = last 6 shots. HABIT_MARGIN = 2.
 * - Habit check: among consecutive pairs in the window, count repeats vs switches. If one leads
 *   by ≥ HABIT_MARGIN, predict you continue it (repeat last side, or switch from it).
 * - Otherwise, frequency check: if one side leads by ≥ HABIT_MARGIN in the window, predict it.
 * - Otherwise there is no readable pattern and the keeper flips its own seeded coin.
 */
export const KEEPER_WINDOW = 6;
export const HABIT_MARGIN = 2;

export type KeeperReason = 'repeat-habit' | 'switch-habit' | 'favourite-side' | 'coin';

export interface KeeperRead {
  dive: Side;
  reason: KeeperReason;
}

export function keeperRead(history: readonly Side[], coin: () => number): KeeperRead {
  const window = history.slice(-KEEPER_WINDOW);
  if (window.length >= 3) {
    let repeats = 0;
    let switches = 0;
    for (let i = 1; i < window.length; i++) {
      if (window[i] === window[i - 1]) repeats++;
      else switches++;
    }
    const last = window[window.length - 1];
    if (repeats - switches >= HABIT_MARGIN) return { dive: last, reason: 'repeat-habit' };
    if (switches - repeats >= HABIT_MARGIN) return { dive: opposite(last), reason: 'switch-habit' };
  }
  const lefts = window.filter((s) => s === 'L').length;
  const rights = window.length - lefts;
  if (lefts - rights >= HABIT_MARGIN) return { dive: 'L', reason: 'favourite-side' };
  if (rights - lefts >= HABIT_MARGIN) return { dive: 'R', reason: 'favourite-side' };
  return { dive: coin() < 0.5 ? 'L' : 'R', reason: 'coin' };
}

export interface ShotRecord {
  shot: Side;
  dive: Side;
  reason: KeeperReason;
  scored: boolean;
}

/** Resolve a single shot against the adaptive keeper, using only prior history. */
export function takeShot(history: readonly ShotRecord[], shot: Side, coin: () => number): ShotRecord {
  const read = keeperRead(
    history.map((h) => h.shot),
    coin,
  );
  return { shot, dive: read.dive, reason: read.reason, scored: shotPayoff(shot, read.dive) === 1 };
}

export type StrikerStrategy = 'repeat' | 'alternate' | 'random';

/** Generate a shot sequence for a named strategy. `random` uses a 50/50 seeded mix. */
export function strategySequence(strategy: StrikerStrategy, length: number, seed: number): Side[] {
  const rng = createRng(seed);
  return Array.from({ length }, (_, i): Side => {
    if (strategy === 'repeat') return 'L';
    if (strategy === 'alternate') return i % 2 === 0 ? 'L' : 'R';
    return rng() < 0.5 ? 'L' : 'R';
  });
}

export interface SeriesResult {
  shots: ShotRecord[];
  goals: number;
  rate: number;
}

/** Play a full series against the adaptive keeper. The keeper's coin has its own seed. */
export function playSeries(shots: readonly Side[], keeperSeed: number): SeriesResult {
  const coin = createRng(keeperSeed);
  const records: ShotRecord[] = [];
  for (const s of shots) records.push(takeShot(records, s, coin));
  const goals = records.filter((r) => r.scored).length;
  return { shots: records, goals, rate: records.length ? goals / records.length : 0 };
}

export interface MixSimulation {
  q: number;
  keeperDive: Side;
  expected: number;
  observed: number;
  goals: number;
  shots: number;
  /** Running observed scoring rate after each shot, for charting convergence. */
  running: number[];
}

/**
 * Simulation lab: you shoot left with probability q; a keeper who has learned q dives to its best response
 * every time. Observed results vary run to run (seeded); the expected value does not.
 */
export function simulateMix(q: number, shots: number, seed: number): MixSimulation {
  const ql = clamp(q, 0, 1);
  const n = Math.max(1, Math.round(shots));
  const rng = createRng(seed);
  const dive = keeperBestResponse(ql);
  let goals = 0;
  const running: number[] = [];
  for (let i = 0; i < n; i++) {
    const shot: Side = rng() < ql ? 'L' : 'R';
    goals += shotPayoff(shot, dive);
    running.push(goals / (i + 1));
  }
  return { q: ql, keeperDive: dive, expected: guaranteedPayoff(ql), observed: goals / n, goals, shots: n, running };
}
