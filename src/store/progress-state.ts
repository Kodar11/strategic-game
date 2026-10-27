import { LESSON_IDS, type LessonId, lessonIdSchema } from '../content/lessons.ts';
import { type AssessmentRuns, sanitizeAssessmentRuns } from '../features/assessments/scoring.ts';
import { type ChallengeDrafts, sanitizeChallengeDrafts } from '../features/challenges/progress.ts';
import { type GoalId, type LearningAttempt, sanitizeAttempts, sanitizeGoal } from '../features/learning/records.ts';
import { type ScenarioRuns, sanitizeScenarioDone, sanitizeScenarioRuns } from '../features/scenarios/runtime.ts';

/**
 * The learner's persistent progress: everything the store keeps that belongs to the learner rather than the device.
 * It is stored in Supabase (`get_my_progress` returns exactly this shape) and validated on load with the same
 * sanitizers the app always used. Pure, so tests share it.
 */

export interface LessonRuntime {
  /** Total steps in the lesson when saved, for progress display. */
  total: number;
  step: number;
  /** Lesson-specific state; each lesson validates it with its own schema on resume. */
  data: unknown;
  updatedAt: number;
}

export interface ProgressData {
  completed: LessonId[];
  runtime: Partial<Record<LessonId, LessonRuntime>>;
  /** Evaluated prediction attempts — the source of truth for the profile and the export. Survives completion. */
  learning: LearningAttempt[];
  /** Optional "what would you like to get better at?" answer. Null until the learner chooses. */
  goal: GoalId | null;
  /** The current attempt at each practice challenge (draft or submitted). Submissions themselves live in `learning`. */
  challengeDrafts: ChallengeDrafts;
  /** The current run of each paired scenario (prediction, inputs, seed). Finished predictions also go to `learning`. */
  scenarioRuns: ScenarioRuns;
  /** Scenarios finished at least once; replays never remove one. */
  scenarioDone: string[];
  /** Module checkpoints and the final assessment: answers and first / best / latest scores. */
  assessmentRuns: AssessmentRuns;
}

export const EMPTY_PROGRESS: ProgressData = {
  completed: [],
  runtime: {},
  learning: [],
  goal: null,
  challengeDrafts: {},
  scenarioRuns: {},
  scenarioDone: [],
  assessmentRuns: {},
};

/**
 * Drop anything unrecognised so a corrupted, older or hand-edited record can never break the app. Needs the content
 * catalog: runs for scenarios that no longer exist or no longer replay, drafts for unknown challenges, and so on, are
 * dropped exactly as they always were.
 */
export function sanitizeProgress(saved: unknown): ProgressData {
  const p = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<keyof ProgressData, unknown>>;
  const completed = Array.isArray(p.completed) ? p.completed.filter((id): id is LessonId => lessonIdSchema.safeParse(id).success) : [];
  const runtime: ProgressData['runtime'] = {};
  if (p.runtime && typeof p.runtime === 'object') {
    const rt = p.runtime as Partial<Record<LessonId, LessonRuntime>>;
    for (const id of LESSON_IDS) {
      const r = rt[id];
      if (r && Number.isFinite(r.step) && Number.isFinite(r.total)) runtime[id] = r;
    }
  }
  return {
    completed,
    runtime,
    // A learner with no records yet simply starts with an empty history.
    learning: sanitizeAttempts(p.learning),
    goal: sanitizeGoal(p.goal),
    challengeDrafts: sanitizeChallengeDrafts(p.challengeDrafts),
    scenarioRuns: sanitizeScenarioRuns(p.scenarioRuns),
    scenarioDone: sanitizeScenarioDone(p.scenarioDone),
    assessmentRuns: sanitizeAssessmentRuns(p.assessmentRuns),
  };
}
