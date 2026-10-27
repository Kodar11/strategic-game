import { z } from 'zod';

import { type PredictionAttempt, emptyPrediction, lockPrediction, predictionSchema } from '../../components/lesson/prediction-state.ts';
import { type LearningAttempt, LEARNING_SCHEMA_VERSION, type NewAttempt, evaluationFromVerdict, mergeAttempts } from '../learning/records.ts';
import type { LessonId } from '../../content/lessons.ts';
import { getScenario } from './index.ts';
import type { Input, ScenarioResult, ScenarioSpec } from './types.ts';

/**
 * Scenario progress as pure functions over persisted state. A run stores only the learner's prediction, their inputs
 * and the seed; the game state is rebuilt by replaying the inputs through the scenario's own rules, so a saved run
 * can never disagree with the engine. A run that no longer replays (content changed) is dropped.
 */

export interface ScenarioRun {
  prediction: PredictionAttempt<string>;
  inputs: Input[];
  seed: number;
  /** Content version the run was played with. */
  version: number;
}

export type ScenarioRuns = Partial<Record<string, ScenarioRun>>;

export interface ScenarioState {
  scenarioRuns: ScenarioRuns;
  /** Scenarios finished at least once. A replay never removes a scenario from here. */
  scenarioDone: string[];
  learning: LearningAttempt[];
  completed: readonly LessonId[];
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function freshRun(spec: ScenarioSpec, seed: number = newSeed()): ScenarioRun {
  return { prediction: emptyPrediction(), inputs: [], seed, version: spec.version };
}

/** Rebuild the game state from a run. Null if any input is no longer legal. */
export function replay(spec: ScenarioSpec, run: ScenarioRun): unknown | null {
  try {
    let s = spec.play.init(run.seed);
    for (const input of run.inputs) s = spec.play.apply(s, input);
    return s;
  } catch {
    return null;
  }
}

export type RunPhase = 'predict' | 'play' | 'done';

export function runPhase(spec: ScenarioSpec, run: ScenarioRun): RunPhase {
  if (!run.prediction.locked) return 'predict';
  const s = replay(spec, run);
  return s !== null && spec.play.prompt(s) === null ? 'done' : 'play';
}

export function runResult(spec: ScenarioSpec, run: ScenarioRun): ScenarioResult | null {
  const s = replay(spec, run);
  return s !== null && spec.play.prompt(s) === null ? spec.play.result(s) : null;
}

const inputSchema = z.union([z.string().max(60), z.number(), z.array(z.number()).max(12)]);
const runSchema = z.object({
  prediction: predictionSchema(z.string().min(1).max(40)),
  inputs: z.array(inputSchema).max(60),
  seed: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

/** Keep only runs for known scenarios, of the current version, that still replay. */
export function sanitizeScenarioRuns(saved: unknown): ScenarioRuns {
  if (!saved || typeof saved !== 'object') return {};
  const out: ScenarioRuns = {};
  for (const [id, raw] of Object.entries(saved as Record<string, unknown>)) {
    const spec = getScenario(id);
    const parsed = runSchema.safeParse(raw);
    if (!spec || !parsed.success || parsed.data.version !== spec.version) continue;
    const run = parsed.data as ScenarioRun;
    if (run.prediction.answer !== null && !spec.predict.options.some((o) => o.id === run.prediction.answer)) continue;
    if (run.inputs.length && !run.prediction.locked) continue;
    if (replay(spec, run) === null) continue;
    out[id] = run;
  }
  return out;
}

export function sanitizeScenarioDone(saved: unknown): string[] {
  return Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === 'string' && !!getScenario(id)))] : [];
}

/** The learning record for a scenario prediction, graded by the option's verdict once the outcome is shown. */
export function recordScenarioAttempt(spec: ScenarioSpec, attempt: PredictionAttempt<string>, lessonCompleted: boolean): NewAttempt | null {
  if (!attempt.locked || attempt.answer === null || attempt.confidence === null || attempt.lockedAt === undefined) return null;
  const option = spec.predict.options.find((o) => o.id === attempt.answer);
  if (!option) return null;
  return {
    id: `${spec.id}@${attempt.lockedAt}`,
    schemaVersion: LEARNING_SCHEMA_VERSION,
    kind: 'scenario',
    lesson: spec.lesson,
    prediction: spec.id,
    skill: spec.skill,
    basis: spec.predict.basis,
    answer: option.id,
    confidence: attempt.confidence,
    evaluation: evaluationFromVerdict(option.verdict, 'scenario'),
    outcome: spec.predict.modelAnswer.slice(0, 200),
    lockedAt: attempt.lockedAt,
    lessonCompleted,
    contentVersion: spec.version,
  };
}

export function currentRun(state: Pick<ScenarioState, 'scenarioRuns'>, spec: ScenarioSpec): ScenarioRun {
  const r = state.scenarioRuns[spec.id];
  return r && r.version === spec.version ? r : freshRun(spec, 0);
}

/** Update the draft prediction of a run that hasn't been locked. */
export function setScenarioPrediction(state: Pick<ScenarioState, 'scenarioRuns'>, id: string, prediction: PredictionAttempt<string>): ScenarioRuns | null {
  const spec = getScenario(id);
  if (!spec) return null;
  const run = state.scenarioRuns[id] ?? freshRun(spec);
  if (run.prediction.locked) return null;
  if (prediction.answer !== null && !spec.predict.options.some((o) => o.id === prediction.answer)) return null;
  return { ...state.scenarioRuns, [id]: { ...run, prediction: { ...prediction, locked: false } } };
}

export function lockScenarioPrediction(state: Pick<ScenarioState, 'scenarioRuns'>, id: string, now: number = Date.now()): ScenarioRuns | null {
  const spec = getScenario(id);
  const run = state.scenarioRuns[id];
  if (!spec || !run || run.prediction.locked) return null;
  const locked = lockPrediction(run.prediction, now);
  if (!locked.locked) return null;
  // A run seeded with the placeholder 0 (never saved) gets a real seed when it starts.
  return { ...state.scenarioRuns, [id]: { ...run, prediction: locked, seed: run.seed || newSeed() } };
}

/**
 * Apply one learner input. When it ends the game, the scenario is marked done and its prediction recorded — in the
 * same update, so the record and the result can't drift apart. Returns null for anything illegal.
 */
export function applyScenarioInput(state: ScenarioState, id: string, input: Input): Pick<ScenarioState, 'scenarioRuns' | 'scenarioDone' | 'learning'> | null {
  const spec = getScenario(id);
  const run = state.scenarioRuns[id];
  if (!spec || !run || !run.prediction.locked) return null;
  const s = replay(spec, run);
  if (s === null || spec.play.prompt(s) === null) return null;
  let next: unknown;
  try {
    next = spec.play.apply(s, input);
  } catch {
    return null;
  }
  const nextRun: ScenarioRun = { ...run, inputs: [...run.inputs, input] };
  const done = spec.play.prompt(next) === null;
  const record = done ? recordScenarioAttempt(spec, run.prediction, state.completed.includes(spec.lesson)) : null;
  return {
    scenarioRuns: { ...state.scenarioRuns, [id]: nextRun },
    scenarioDone: done && !state.scenarioDone.includes(id) ? [...state.scenarioDone, id] : state.scenarioDone,
    learning: record ? mergeAttempts(state.learning, [record]) : state.learning,
  };
}

/** Start over with a fresh prediction and a new seed. Earlier records and completion stay. */
export function restartScenario(state: Pick<ScenarioState, 'scenarioRuns'>, id: string, seed: number = newSeed()): ScenarioRuns | null {
  const spec = getScenario(id);
  if (!spec) return null;
  return { ...state.scenarioRuns, [id]: freshRun(spec, seed) };
}
