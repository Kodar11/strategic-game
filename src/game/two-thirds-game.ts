import { clamp, createRng, round } from './rng.ts';

/**
 * Two-Thirds Game: everyone picks 0–100, target = ⅔ × average of all picks (learner included).
 * Scoring rule: the pick(s) with the smallest absolute distance to the target win; exact ties share the win.
 */
export const MIN_GUESS = 0;
export const MAX_GUESS = 100;
export const FACTOR = 2 / 3;

export type PlayerType = 'level0' | 'level1' | 'level2' | 'level3' | 'equilibrium';

export const PLAYER_TYPES: readonly PlayerType[] = ['level0', 'level1', 'level2', 'level3', 'equilibrium'];

export interface PlayerTypeInfo {
  label: string;
  rule: string;
}

export const PLAYER_TYPE_INFO: Record<PlayerType, PlayerTypeInfo> = {
  level0: { label: 'Instinctive', rule: 'Picks without modelling anyone. Picks are spread across 0–100 (seeded), averaging about 50.' },
  level1: { label: 'One step', rule: 'Assumes others are instinctive (avg 50) and picks ⅔ × 50 ≈ 33.' },
  level2: { label: 'Two steps', rule: 'Assumes others think one step (≈33) and picks ⅔ × 33 ≈ 22.' },
  level3: { label: 'Three steps', rule: 'Assumes others think two steps (≈22) and picks ⅔ × 22 ≈ 15.' },
  equilibrium: { label: 'Theorist', rule: 'Follows the reasoning all the way down and picks 0.' },
};

export type Population = Record<PlayerType, number>;

export const EMPTY_POPULATION: Population = { level0: 0, level1: 0, level2: 0, level3: 0, equilibrium: 0 };

export const MAX_PER_TYPE = 10;

/** A level-k thinker anchored on an instinctive average of 50: 50 × (⅔)^k. */
export function levelKGuess(k: number, anchor = 50): number {
  return round(anchor * FACTOR ** Math.max(0, k), 1);
}

export function guessForType(type: PlayerType, rng: () => number): number {
  switch (type) {
    case 'level0':
      return Math.round(rng() * MAX_GUESS);
    case 'level1':
      return levelKGuess(1);
    case 'level2':
      return levelKGuess(2);
    case 'level3':
      return levelKGuess(3);
    case 'equilibrium':
      return 0;
  }
}

/** Move every player one reasoning level deeper (used when the crowd "learns" between rounds). */
export function shiftPopulation(pop: Population): Population {
  return {
    level0: 0,
    level1: pop.level0,
    level2: pop.level1,
    level3: pop.level2,
    equilibrium: pop.level3 + pop.equilibrium,
  };
}

export interface Pick {
  id: string;
  type: PlayerType | 'you';
  guess: number;
  distance: number;
  isWinner: boolean;
}

export interface RoundResult {
  picks: Pick[];
  average: number;
  target: number;
  learner: Pick;
  winners: Pick[];
  /** 1-based rank of the learner by distance (ties share the better rank). */
  learnerRank: number;
  playerCount: number;
}

export function sanitizeGuess(guess: number): number {
  return clamp(Math.round(guess), MIN_GUESS, MAX_GUESS);
}

export function sanitizePopulation(pop: Population): Population {
  const out = { ...EMPTY_POPULATION };
  for (const t of PLAYER_TYPES) out[t] = clamp(Math.round(pop[t] ?? 0), 0, MAX_PER_TYPE);
  return out;
}

export function populationSize(pop: Population): number {
  return PLAYER_TYPES.reduce((n, t) => n + pop[t], 0);
}

/** Opponent picks are a deterministic function of population and seed. */
export function opponentPicks(pop: Population, seed: number): { id: string; type: PlayerType; guess: number }[] {
  const safe = sanitizePopulation(pop);
  const rng = createRng(seed);
  const picks: { id: string; type: PlayerType; guess: number }[] = [];
  for (const type of PLAYER_TYPES) {
    for (let i = 0; i < safe[type]; i++) picks.push({ id: `${type}-${i}`, type, guess: guessForType(type, rng) });
  }
  return picks;
}

export function targetFor(guesses: readonly number[]): { average: number; target: number } {
  if (guesses.length === 0) return { average: 0, target: 0 };
  const average = guesses.reduce((a, b) => a + b, 0) / guesses.length;
  return { average, target: average * FACTOR };
}

export function playRound(learnerGuess: number, pop: Population, seed: number): RoundResult {
  const you = sanitizeGuess(learnerGuess);
  const others = opponentPicks(pop, seed);
  const all = [{ id: 'you', type: 'you' as const, guess: you }, ...others];
  const { average, target } = targetFor(all.map((p) => p.guess));
  const withDistance = all.map((p) => ({ ...p, distance: Math.abs(p.guess - target) }));
  const best = Math.min(...withDistance.map((p) => p.distance));
  const picks: Pick[] = withDistance.map((p) => ({ ...p, isWinner: Math.abs(p.distance - best) < 1e-9 }));
  const learner = picks[0];
  const learnerRank = 1 + picks.filter((p) => p.distance < learner.distance - 1e-9).length;
  return {
    picks,
    average,
    target,
    learner,
    winners: picks.filter((p) => p.isWinner),
    learnerRank,
    playerCount: picks.length,
  };
}

/**
 * The single guess that lands exactly on the target, given what everyone else picks.
 * Solves g = ⅔ × (S + g) / (n + 1)  ⇒  g = 2S / (3n + 1).
 */
export function bestGuess(othersSum: number, othersCount: number): number {
  if (othersCount <= 0) return 0;
  return clamp((2 * othersSum) / (3 * othersCount + 1), MIN_GUESS, MAX_GUESS);
}

export function bestGuessForPopulation(pop: Population, seed: number): number {
  const others = opponentPicks(pop, seed);
  return bestGuess(
    others.reduce((s, p) => s + p.guess, 0),
    others.length,
  );
}

/** Upper bound of numbers that survive k rounds of eliminating picks that can never win: 100 × (⅔)^k. */
export function eliminationBound(k: number): number {
  return MAX_GUESS * FACTOR ** k;
}
