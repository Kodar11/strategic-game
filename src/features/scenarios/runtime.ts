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

// ── Counterfactuals: what the learner's other choices would have produced ────

export interface Alternative {
  /** The option's label (or the value, for number prompts). */
  label: string;
  input: Input;
  headline: string;
  /** The compared stat's value for this choice. */
  value: string;
  mine: boolean;
}

export interface AlternativesView {
  /** Which stat is compared (e.g. "Your profit", "Expected for your bid"). */
  stat: string;
  /** True when the compared stat is an expected value or guaranteed chance rather than one run's outcome. */
  expected: boolean;
  rows: Alternative[];
}

const MAX_GRID = 13;

/** Slider values to compare: the configured ones (plus the learner's pick), or every grid value on a short range. */
export function compareValues(p: { min: number; max: number; step: number }, chosen: number, configured?: number[]): number[] | null {
  const grid = Math.round((p.max - p.min) / p.step) + 1;
  const values = configured ?? (grid <= MAX_GRID ? Array.from({ length: grid }, (_, i) => Number((p.min + i * p.step).toFixed(6))) : null);
  if (!values) return null;
  return [...new Set([...values, chosen])].sort((a, b) => a - b);
}

/**
 * For a finished single-decision run: replay the same seed with every other choice, using the scenario's own rules
 * (see `ScenarioSpec.explore`). Null when the scenario doesn't support a fair comparison.
 */
export function alternatives(spec: ScenarioSpec, run: ScenarioRun): AlternativesView | null {
  const cfg = spec.explore;
  if (cfg === false || run.inputs.length !== 1) return null;
  if (spec.formal.chance && !(cfg && cfg.expected)) return null;
  const start = spec.play.init(run.seed);
  const prompt = spec.play.prompt(start);
  if (!prompt || prompt.kind === 'allocation') return null;
  const chosen = run.inputs[0];
  let options: { label: string; input: Input }[];
  if (prompt.kind === 'choice') options = prompt.options.map((o) => ({ label: o.label, input: o.id }));
  else {
    if (typeof chosen !== 'number') return null;
    const values = compareValues(prompt, chosen, cfg ? cfg.values : undefined);
    if (!values) return null;
    const unit = (x: number) => (prompt.unit ? ` ${x === 1 && prompt.unit.endsWith('s') ? prompt.unit.slice(0, -1) : prompt.unit}` : '');
    options = values.map((x) => ({ label: prompt.percent ? `${x}%` : `${x}${unit(x)}`, input: x }));
  }
  const rows: Alternative[] = [];
  let stat: string | null = null;
  for (const o of options) {
    let r: ScenarioResult;
    try {
      const s = spec.play.apply(spec.play.init(run.seed), o.input);
      if (spec.play.prompt(s) !== null) return null;
      r = spec.play.result(s);
    } catch {
      return null;
    }
    const line = cfg && cfg.stat ? r.stats.find((x) => x.label === cfg.stat) : (r.stats.find((x) => x.tone === 'blue') ?? r.stats[0]);
    if (!line) return null;
    if (stat === null) stat = line.label;
    else if (stat !== line.label) return null;
    rows.push({ label: o.label, input: o.input, headline: r.headline, value: line.value.replace(/^-0$/, '0'), mine: o.input === chosen });
  }
  return { stat: stat!, expected: !!spec.formal.chance || !!(cfg && cfg.expected), rows };
}
