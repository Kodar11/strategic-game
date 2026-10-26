import { z } from 'zod';

import { type Confidence, type PredictionAttempt, confidenceSchema } from '../../components/lesson/prediction-state.ts';
import type { Verdict } from '../../components/lesson/verdict.ts';
import { LESSONS, type LessonId, lessonIdSchema } from '../../content/lessons.ts';

/**
 * The learning record: one entry per evaluated prediction attempt, kept on the device. It is the single source
 * of truth for the Strategic Thinking Profile and the JSON export. Pure, so it is shared by the app and tests.
 * No names, emails or device identifiers are ever recorded.
 */

export const LEARNING_SCHEMA_VERSION = 1;
/** Oldest records are dropped beyond this, so storage stays small. */
export const MAX_ATTEMPTS = 500;

export type SkillArea = 'anticipating' | 'incentives' | 'coordination' | 'uncertainty';

export const SKILLS: readonly { id: SkillArea; label: string; description: string; lesson: LessonId }[] = [
  { id: 'anticipating', label: 'Anticipating others', description: 'Reasoning about what other players will choose.', lesson: 'strategy-detective' },
  { id: 'incentives', label: 'Understanding incentives', description: 'Seeing how penalties, rewards and payoffs change choices.', lesson: 'incentive-shift' },
  { id: 'coordination', label: 'Coordination', description: 'Recognising when success depends on aligning choices.', lesson: 'coordination-problem' },
  { id: 'uncertainty', label: 'Reasoning under uncertainty', description: 'Telling probabilities, predictions and outcomes apart.', lesson: 'predictability-trap' },
];

/**
 * How fair it is to judge reasoning by whether the prediction came true.
 * - `calculable`: the answer follows from what was on screen (a payoff table, a stated rule, an expected value).
 * - `uncertain`: it depended on something the learner couldn't know yet (a hidden rule, a crowd's mix). These
 *   are recorded, but never used to judge calibration or skill.
 */
export type EvaluationBasis = 'calculable' | 'uncertain';

/** Every prediction the lessons ask for. Keys are stable: they appear in exported data. */
export const PREDICTIONS = {
  'l1.rival': { lesson: 'cooperation-trap', skill: 'anticipating', basis: 'calculable', question: 'What will Rohan do?' },
  'l1.penalty': { lesson: 'cooperation-trap', skill: 'incentives', basis: 'calculable', question: 'Smallest penalty that makes maintaining better' },
  'l2.crowd': { lesson: 'strategy-detective', skill: 'anticipating', basis: 'uncertain', question: 'What will the other ten average?' },
  'l2.lab': { lesson: 'strategy-detective', skill: 'anticipating', basis: 'calculable', question: 'Against ten Theorists, what happens to your best pick?' },
  'l3.round1': { lesson: 'coordination-problem', skill: 'coordination', basis: 'uncertain', question: 'Where will Nina go (no clue)?' },
  'l3.round2': { lesson: 'coordination-problem', skill: 'coordination', basis: 'calculable', question: 'Where will Nina go (shared clue)?' },
  'l4.compare': { lesson: 'predictability-trap', skill: 'uncertainty', basis: 'calculable', question: 'Which striker will score the most?' },
  'l4.lab': { lesson: 'predictability-trap', skill: 'uncertainty', basis: 'calculable', question: 'What can an 80/20 mix count on?' },
  'l5.proposal': { lesson: 'incentive-shift', skill: 'incentives', basis: 'calculable', question: 'Will a 1.5 reward end the price war?' },
  'l5.detection': { lesson: 'incentive-shift', skill: 'incentives', basis: 'calculable', question: 'Does your rule hold if half of cuts are caught?' },
} as const satisfies Record<string, { lesson: LessonId; skill: SkillArea; basis: EvaluationBasis; question: string }>;

export type PredictionKey = keyof typeof PREDICTIONS;
const PREDICTION_KEYS = Object.keys(PREDICTIONS) as [PredictionKey, ...PredictionKey[]];

/**
 * What the lesson's own feedback concluded, in learner-neutral terms.
 * - `correct`: matched the model or outcome.
 * - `partial`: defensible or assumption-dependent — reasonable but missing something.
 * - `reasonable-miss`: a sensible call about something unknowable; the outcome went another way.
 * - `misconception`: contradicted the information available or the learner's own prediction.
 */
export type Evaluation = 'correct' | 'partial' | 'reasonable-miss' | 'misconception';

export function evaluationFromVerdict(v: Verdict): Evaluation {
  switch (v) {
    case 'match':
      return 'correct';
    case 'reasonable':
      return 'reasonable-miss';
    case 'misconception':
      return 'misconception';
    case 'defensible':
    case 'depends':
      return 'partial';
  }
}

export interface LearningAttempt {
  /** `<prediction>@<lockedAt>`: unique per attempt, stable across re-renders and app restarts. */
  id: string;
  schemaVersion: number;
  lesson: LessonId;
  prediction: PredictionKey;
  skill: SkillArea;
  basis: EvaluationBasis;
  /** The option id the learner locked in. */
  answer: string;
  confidence: Confidence;
  evaluation: Evaluation;
  /** What actually happened or what the model says, in a few words, so the record can be read on its own. */
  outcome: string;
  /** When the prediction was locked (ms since epoch). */
  lockedAt: number;
}

export const learningAttemptSchema = z.object({
  id: z.string().min(1).max(80),
  schemaVersion: z.number().int().positive(),
  lesson: lessonIdSchema,
  prediction: z.enum(PREDICTION_KEYS),
  skill: z.enum(['anticipating', 'incentives', 'coordination', 'uncertainty']),
  basis: z.enum(['calculable', 'uncertain']),
  answer: z.string().min(1).max(40),
  confidence: confidenceSchema,
  evaluation: z.enum(['correct', 'partial', 'reasonable-miss', 'misconception']),
  outcome: z.string().max(200),
  lockedAt: z.number().int().nonnegative(),
});

/**
 * Build the record for an evaluated prediction, or null when there is nothing fair to record yet: not locked,
 * no confidence, or saved before attempts carried a lock time (those can't be told apart, so they are skipped
 * rather than risk duplicates).
 */
export function recordAttempt(
  prediction: PredictionKey,
  attempt: PredictionAttempt<string>,
  verdict: Verdict,
  outcome: string,
): LearningAttempt | null {
  if (!attempt.locked || attempt.answer === null || attempt.confidence === null || attempt.lockedAt === undefined) return null;
  const meta = PREDICTIONS[prediction];
  return {
    id: `${prediction}@${attempt.lockedAt}`,
    schemaVersion: LEARNING_SCHEMA_VERSION,
    lesson: meta.lesson,
    prediction,
    skill: meta.skill,
    basis: meta.basis,
    answer: attempt.answer,
    confidence: attempt.confidence,
    evaluation: evaluationFromVerdict(verdict),
    outcome,
    lockedAt: attempt.lockedAt,
  };
}

/** Add new records. The first record for an id wins, so a later re-evaluation (e.g. a rerun) never rewrites it. */
export function mergeAttempts(existing: readonly LearningAttempt[], incoming: readonly (LearningAttempt | null)[]): LearningAttempt[] {
  const seen = new Set(existing.map((a) => a.id));
  const added = incoming.filter((a): a is LearningAttempt => !!a && !seen.has(a.id) && (seen.add(a.id), true));
  if (!added.length) return existing as LearningAttempt[];
  return [...existing, ...added].sort((a, b) => a.lockedAt - b.lockedAt).slice(-MAX_ATTEMPTS);
}

/** Keep only well-formed, unique records from storage. Anything malformed is dropped, never repaired by guessing. */
export function sanitizeAttempts(saved: unknown): LearningAttempt[] {
  if (!Array.isArray(saved)) return [];
  const valid = saved.flatMap((a) => {
    const parsed = learningAttemptSchema.safeParse(a);
    return parsed.success ? [parsed.data as LearningAttempt] : [];
  });
  return mergeAttempts([], valid);
}

// ── Goal ─────────────────────────────────────────────────────────────────────

export type GoalId = SkillArea | 'none';

export const GOALS: readonly { id: GoalId; label: string }[] = [
  { id: 'anticipating', label: 'Anticipating other people’s decisions' },
  { id: 'incentives', label: 'Understanding incentives and trade-offs' },
  { id: 'coordination', label: 'Coordinating with others' },
  { id: 'uncertainty', label: 'Making decisions under uncertainty' },
  { id: 'none', label: 'No specific goal yet' },
];

export const goalSchema = z.enum(['anticipating', 'incentives', 'coordination', 'uncertainty', 'none']);

export function sanitizeGoal(saved: unknown): GoalId | null {
  const parsed = goalSchema.safeParse(saved);
  return parsed.success ? parsed.data : null;
}

// ── Export ───────────────────────────────────────────────────────────────────

export const EXPORT_FORMAT = 'strategic-thinking-learning-data';
export const EXPORT_SCHEMA_VERSION = 1;

export interface LearningExport {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  goal: GoalId | null;
  lessons: { id: LessonId; number: number; title: string; completed: boolean; inProgress: boolean }[];
  attempts: (Omit<LearningAttempt, 'lockedAt' | 'schemaVersion'> & { recordSchemaVersion: number; lockedAt: string; question: string })[];
}

/** The versioned export documented in docs/LEARNING_DATA.md. Only learning records, lesson status and the goal. */
export function buildLearningExport(input: {
  attempts: readonly LearningAttempt[];
  completed: readonly LessonId[];
  inProgress: readonly LessonId[];
  goal: GoalId | null;
  now: Date;
}): LearningExport {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: input.now.toISOString(),
    goal: input.goal,
    lessons: LESSONS.map((l) => ({
      id: l.id,
      number: l.number,
      title: l.title,
      completed: input.completed.includes(l.id),
      inProgress: input.inProgress.includes(l.id),
    })),
    attempts: input.attempts.map(({ lockedAt, schemaVersion, ...a }) => ({
      ...a,
      recordSchemaVersion: schemaVersion,
      question: PREDICTIONS[a.prediction].question,
      lockedAt: new Date(lockedAt).toISOString(),
    })),
  };
}

export function exportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `strategic-thinking-data-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
