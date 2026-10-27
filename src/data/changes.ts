import type { LessonId } from '../content/lessons.ts';
import type { AssessmentRun } from '../features/assessments/scoring.ts';
import type { PredictionAttempt } from '../components/lesson/prediction-state.ts';
import type { GoalId, LearningAttempt } from '../features/learning/records.ts';
import type { ScenarioRun } from '../features/scenarios/runtime.ts';
import type { LessonRuntime, ProgressData } from '../store/progress-state.ts';

/**
 * What one or more store updates changed, in the shape `apply_progress_changes` applies in a single transaction.
 * Pure: the diff between two store states, and the merge of consecutive batches waiting to be sent.
 *
 * Every entry describes the *resulting* state of one key — an attempt or completion to add, an in-progress record to
 * replace or clear — so applying a batch twice changes nothing, and a merged batch means the same as its parts
 * applied in order.
 */
export interface ProgressChanges {
  /** Clear all progress first (the goal is kept), then apply the rest. */
  reset?: true;
  goal?: { value: GoalId | null };
  attempts?: LearningAttempt[];
  lessonsCompleted?: LessonId[];
  runtimeUpsert?: { lesson: LessonId; runtime: LessonRuntime }[];
  runtimeDelete?: LessonId[];
  scenarioRuns?: { scenario: string; run: ScenarioRun }[];
  scenariosDone?: string[];
  challengeDrafts?: { challenge: string; draft: PredictionAttempt<string> }[];
  assessmentRuns?: { assessment: string; run: AssessmentRun }[];
}

export function isEmpty(c: ProgressChanges): boolean {
  return !c.reset && !c.goal && !Object.entries(c).some(([k, v]) => k !== 'reset' && k !== 'goal' && Array.isArray(v) && v.length > 0);
}

function changedKeys<T>(prev: Partial<Record<string, T>>, next: Partial<Record<string, T>>): string[] {
  return Object.keys(next).filter((k) => next[k] !== undefined && next[k] !== prev[k]);
}

/**
 * The changes from `prev` to `next`. The store updates immutably, so a value that is the same object hasn't changed.
 * `reset` says the update was a progress reset: everything is cleared and `next` is compared against nothing.
 */
export function diffProgress(prevState: ProgressData, next: ProgressData, reset = false): ProgressChanges {
  const prev: ProgressData = reset
    ? { completed: [], runtime: {}, learning: [], goal: prevState.goal, challengeDrafts: {}, scenarioRuns: {}, scenarioDone: [], assessmentRuns: {} }
    : prevState;
  const out: ProgressChanges = {};
  if (reset) out.reset = true;
  if (next.goal !== prev.goal) out.goal = { value: next.goal };

  if (next.learning !== prev.learning) {
    const known = new Set(prev.learning.map((a) => a.id));
    const added = next.learning.filter((a) => !known.has(a.id));
    if (added.length) out.attempts = added;
  }
  if (next.completed !== prev.completed) {
    const added = next.completed.filter((id) => !prev.completed.includes(id));
    if (added.length) out.lessonsCompleted = added;
  }
  if (next.runtime !== prev.runtime) {
    const upsert = changedKeys(prev.runtime, next.runtime).map((k) => ({ lesson: k as LessonId, runtime: next.runtime[k as LessonId]! }));
    const removed = (Object.keys(prev.runtime) as LessonId[]).filter((k) => prev.runtime[k] !== undefined && next.runtime[k] === undefined);
    if (upsert.length) out.runtimeUpsert = upsert;
    if (removed.length) out.runtimeDelete = removed;
  }
  if (next.scenarioRuns !== prev.scenarioRuns) {
    const runs = changedKeys(prev.scenarioRuns, next.scenarioRuns).map((k) => ({ scenario: k, run: next.scenarioRuns[k]! }));
    if (runs.length) out.scenarioRuns = runs;
  }
  if (next.scenarioDone !== prev.scenarioDone) {
    const added = next.scenarioDone.filter((id) => !prev.scenarioDone.includes(id));
    if (added.length) out.scenariosDone = added;
  }
  if (next.challengeDrafts !== prev.challengeDrafts) {
    const drafts = changedKeys(prev.challengeDrafts, next.challengeDrafts).map((k) => ({ challenge: k, draft: next.challengeDrafts[k]! }));
    if (drafts.length) out.challengeDrafts = drafts;
  }
  if (next.assessmentRuns !== prev.assessmentRuns) {
    const runs = changedKeys(prev.assessmentRuns as Partial<Record<string, AssessmentRun>>, next.assessmentRuns as Partial<Record<string, AssessmentRun>>).map((k) => ({
      assessment: k,
      run: (next.assessmentRuns as Partial<Record<string, AssessmentRun>>)[k]!,
    }));
    if (runs.length) out.assessmentRuns = runs;
  }
  return out;
}

const union = <T>(a: readonly T[] = [], b: readonly T[] = []): T[] => [...a, ...b.filter((x) => !a.includes(x))];

function byKey<T, K extends string>(a: readonly T[] = [], b: readonly T[] = [], key: (x: T) => K): T[] {
  const m = new Map<K, T>();
  for (const x of [...a, ...b]) {
    m.delete(key(x));
    m.set(key(x), x);
  }
  return [...m.values()];
}

/** One batch meaning "apply `a`, then `b`". */
export function mergeChanges(a: ProgressChanges, b: ProgressChanges): ProgressChanges {
  if (b.reset) return b;
  const seen = new Set((a.attempts ?? []).map((x) => x.id));
  const out: ProgressChanges = {
    ...(a.reset ? { reset: true as const } : {}),
    ...(b.goal ? { goal: b.goal } : a.goal ? { goal: a.goal } : {}),
    attempts: [...(a.attempts ?? []), ...(b.attempts ?? []).filter((x) => !seen.has(x.id))],
    lessonsCompleted: union(a.lessonsCompleted, b.lessonsCompleted),
    // A later upsert replaces an earlier one or an earlier delete; a later delete cancels an earlier upsert.
    runtimeUpsert: byKey(a.runtimeUpsert, b.runtimeUpsert, (x) => x.lesson).filter((x) => !(b.runtimeDelete ?? []).includes(x.lesson) || (b.runtimeUpsert ?? []).some((y) => y.lesson === x.lesson)),
    runtimeDelete: union(a.runtimeDelete, b.runtimeDelete).filter((l) => !(b.runtimeUpsert ?? []).some((x) => x.lesson === l)),
    scenarioRuns: byKey(a.scenarioRuns, b.scenarioRuns, (x) => x.scenario),
    scenariosDone: union(a.scenariosDone, b.scenariosDone),
    challengeDrafts: byKey(a.challengeDrafts, b.challengeDrafts, (x) => x.challenge),
    assessmentRuns: byKey(a.assessmentRuns, b.assessmentRuns, (x) => x.assessment),
  };
  for (const k of Object.keys(out) as (keyof ProgressChanges)[]) {
    const v = out[k];
    if (Array.isArray(v) && v.length === 0) delete out[k];
  }
  return out;
}
