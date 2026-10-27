import type { CharacterId } from '../../components/characters/cast.ts';
import type { Verdict } from '../../components/lesson/verdict.ts';
import type { LessonId } from '../../content/lessons.ts';
import type { MatrixGame } from '../../game/payoff-matrix.ts';
import type { GameTree } from '../../game/sequential.ts';
import type { EvaluationBasis, SkillArea } from '../learning/types.ts';

/**
 * A paired scenario: a small, fully specified game the learner plays. Pure data plus pure functions, so the same
 * spec drives the screen, the learning record and the tests. The rules a learner sees (`rules`, `formal`, `visual`)
 * are the rules `play` implements; every outcome and every number in a result comes from `play`.
 */

export type Slot = 'A' | 'B' | 'C';

export const SLOT_INFO: Record<Slot, { label: string; purpose: string }> = {
  A: { label: 'Scenario A', purpose: 'Learn the mechanism' },
  B: { label: 'Scenario B', purpose: 'Change an assumption' },
  C: { label: 'Scenario C', purpose: 'Transfer the reasoning' },
};

export type Tone = 'neutral' | 'blue' | 'orange' | 'amber';

export interface StatLine {
  label: string;
  value: string;
  tone?: Tone;
}

export interface ScenarioResult {
  /** One sentence: what happened. */
  headline: string;
  stats: StatLine[];
  /** Why it happened, computed from this play-through. */
  lines: string[];
  /** For a matrix visual: the cell that was played. */
  cell?: { row: string; col: string };
  /** For a tree visual: the action ids taken from the root. */
  path?: string[];
  /** For bar visuals: labelled values 0…1 (shares or probabilities). */
  bars?: { label: string; value: number; tone?: Tone }[];
}

export type Input = string | number | number[];

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
}

export type DecisionPrompt =
  | { kind: 'choice'; prompt: string; options: ChoiceOption[]; cta?: string }
  | { kind: 'number'; prompt: string; min: number; max: number; step: number; initial: number; unit?: string; percent?: boolean; cta?: string }
  | { kind: 'allocation'; prompt: string; parties: { id: string; label: string }[]; total: number; step: number; cta?: string };

/** The game's rules as a state machine. `S` must be plain JSON-like data. */
export interface ScenarioPlay<S> {
  init: (seed: number) => S;
  /** What the learner decides next; null once the game is over. */
  prompt: (s: S) => DecisionPrompt | null;
  /** Apply a legal input. Throws on an illegal one. */
  apply: (s: S, input: Input) => S;
  result: (s: S) => ScenarioResult;
  /** Running history shown while a multi-step game is in progress (rounds so far, what was revealed). */
  log?: (s: S) => string[];
}

export type ScenarioVisual =
  | {
      kind: 'matrix';
      game: MatrixGame;
      rowName: string;
      colName: string;
      rowLabels: Record<string, string>;
      colLabels: Record<string, string>;
    }
  | { kind: 'tree'; tree: GameTree; actionLabels?: Record<string, string> }
  | { kind: 'table'; caption?: string; head: string[]; rows: string[][] };

export interface FormalSpec {
  players: string;
  actions: string;
  timing: string;
  information: string;
  payoffs: string;
  /** How any simulated player behaves. Stated, never hidden from the spec (the screen may reveal it after play). */
  opponent?: string;
  /** Random draws and their probabilities, if any. */
  chance?: string;
  /** Tie-breaking and termination rules. */
  ties?: string;
  solution: string;
  source: 'canonical' | 'adapted' | 'original';
  sourceNote: string;
}

export interface PredictionOption {
  id: string;
  label: string;
  verdict: Verdict;
  feedback: string;
}

export interface ScenarioPrediction {
  question: string;
  options: PredictionOption[];
  /** What the model says, in a few words — shown after play and recorded as the outcome. */
  modelAnswer: string;
  basis: EvaluationBasis;
  /**
   * For calculable predictions: computes, from the game engine, the id of the option that matches the model.
   * Tests check it against the option marked `match`, so a claim can't drift from the maths.
   */
  solve?: () => string;
}

export interface ScenarioSpec<S = unknown> {
  id: string;
  lesson: LessonId;
  slot: Slot;
  /** Bump when rules or options change meaning; recorded with every attempt. */
  version: number;
  title: string;
  /** For B: the assumption that changed. For C: the new context. One sentence. */
  purpose: string;
  setup: string;
  speaker?: { character: CharacterId; line: string };
  /** The rules exactly as `play` implements them. */
  rules: string[];
  formal: FormalSpec;
  visual?: ScenarioVisual;
  /** Hide the visual's answer-revealing parts (opponent policy etc.) until play ends. */
  predict: ScenarioPrediction;
  play: ScenarioPlay<S>;
  /** Shown after play: the reasoning, independent of this particular run. */
  explain: string[];
  takeaway: string;
  skill: SkillArea;
  /**
   * "Compare your options" after a single-decision run: every other choice, replayed through the same rules.
   * On by default for scenarios without chance moves. Scenarios with chance must opt in with an `expected` stat
   * (an expected value or guaranteed chance), so one run's luck is never presented as a comparison of strategies.
   * `values` picks the slider values to compare (default: every value when there are at most 13).
   */
  explore?: false | { stat?: string; values?: number[]; expected?: boolean };
  /** Fixed seed for tests; play-throughs use a fresh seed. */
  testSeed?: number;
}

/** Erase a spec's state type so specs with different state can share one list. */
export function defineScenario<S>(spec: ScenarioSpec<S>): ScenarioSpec<unknown> {
  return spec as unknown as ScenarioSpec<unknown>;
}
