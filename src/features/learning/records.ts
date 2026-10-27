import { z } from 'zod';

import { type Confidence, type PredictionAttempt, confidenceSchema } from '../../components/lesson/prediction-state.ts';
import type { Verdict } from '../../components/lesson/verdict.ts';
import { catalog } from '../../content/catalog.ts';
import { type LessonId, allLessons, lessonIdSchema } from '../../content/lessons.ts';
import { allAssessments } from '../assessments/content.ts';
import type { AssessmentRuns } from '../assessments/scoring.ts';
import { type Challenge, allChallenges, getChallenge } from '../challenges/content.ts';
import { getScenario, allScenarios } from '../scenarios/index.ts';
import type { EvaluationBasis, SkillArea } from './types.ts';

export type { EvaluationBasis, SkillArea } from './types.ts';

/**
 * The learning record: one entry per submitted answer — a lesson prediction or a practice challenge — kept on the
 * device. It is the single source of truth for the Strategic Thinking Profile and the JSON export. Pure, so it is
 * shared by the app and tests. No names, emails or device identifiers are ever recorded.
 *
 * Attempt semantics
 * - An *item* is one question: a lesson prediction (`l1.rival`) or a challenge (`l1.c1.discount-war`).
 * - An attempt is recorded once per intentional submission (a locked prediction), identified by `<item>@<lockedAt>`.
 *   Re-renders, resumes and double taps produce the same id, and the first record for an id wins.
 * - `attempt` numbers submissions per item, starting at 1, and is fixed when recorded. Attempt 1 is the **first
 *   attempt**: it is never overwritten, re-graded or trimmed. Challenge retries and lesson replays add attempts 2, 3…
 * - Records are append-only. Editing challenge content bumps its `version`; old records keep the version they used.
 */

export const LEARNING_SCHEMA_VERSION = 2;
/** Retries beyond this are trimmed (oldest first) so storage stays small. First attempts are always kept. */
export const MAX_ATTEMPTS = 500;

export interface SkillMeta {
  id: SkillArea;
  label: string;
  description: string;
  lesson: LessonId;
}

/** The four skill areas the profile reports on, in display order. Content: labels and descriptions are editable. */
export function allSkills(): readonly SkillMeta[] {
  return catalog().skills;
}

/**
 * Every prediction the five original lessons ask for. Each key is recorded by its lesson's code, so the list is
 * part of the app; what the record and profile say about each one (lesson, skill, basis, question) is content.
 * Keys are stable: they appear in exported data.
 */
export const PREDICTION_KEYS = ['l1.rival', 'l1.penalty', 'l2.crowd', 'l2.lab', 'l3.round1', 'l3.round2', 'l4.compare', 'l4.lab', 'l5.proposal', 'l5.detection'] as const;

export interface PredictionMeta {
  lesson: LessonId;
  skill: SkillArea;
  basis: EvaluationBasis;
  question: string;
}

export function predictionMeta(key: string): PredictionMeta | undefined {
  return catalog().lessonPredictions.get(key);
}

/** Every lesson prediction's metadata, in catalog order. */
export function allPredictionMeta(): PredictionMeta[] {
  return [...catalog().lessonPredictions.values()];
}

export type PredictionKey = (typeof PREDICTION_KEYS)[number];

/** `scenario`: a prediction made in a paired scenario. */
export type ItemKind = 'lesson' | 'challenge' | 'scenario';

export interface ItemMeta {
  kind: ItemKind;
  lesson: LessonId;
  skill: SkillArea;
  basis: EvaluationBasis;
  question: string;
}

/** What an item is about — a lesson prediction or a challenge. Undefined for ids this version doesn't know. */
export function itemMeta(id: string): ItemMeta | undefined {
  const p = predictionMeta(id);
  if (p) return { kind: 'lesson', ...p };
  const c = getChallenge(id);
  if (c) return { kind: 'challenge', lesson: c.lesson, skill: c.skill, basis: c.basis, question: c.title };
  const s = getScenario(id);
  return s ? { kind: 'scenario', lesson: s.lesson, skill: s.skill, basis: s.predict.basis, question: s.predict.question } : undefined;
}

/**
 * What the feedback concluded, in learner-neutral terms.
 * - `correct`: matched the model or outcome.
 * - `partial`: defensible or assumption-dependent — reasonable but missing something.
 * - `reasonable-miss`: a sensible lesson prediction about something unknowable; the outcome went another way.
 * - `reasonable`: a sensible challenge answer where no single answer can be known. Never scored.
 * - `misconception`: contradicted the information available or the learner's own prediction.
 */
export type Evaluation = 'correct' | 'partial' | 'reasonable-miss' | 'reasonable' | 'misconception';

export function evaluationFromVerdict(v: Verdict, kind: ItemKind = 'lesson'): Evaluation {
  switch (v) {
    case 'match':
      return 'correct';
    case 'reasonable':
      return kind === 'challenge' ? 'reasonable' : 'reasonable-miss';
    case 'misconception':
      return 'misconception';
    case 'defensible':
    case 'depends':
      return 'partial';
  }
}

export interface LearningAttempt {
  /** `<item>@<lockedAt>`: unique per submission, stable across re-renders and app restarts. */
  id: string;
  schemaVersion: number;
  kind: ItemKind;
  lesson: LessonId;
  /** The item: a lesson prediction key, or a challenge id. */
  prediction: string;
  skill: SkillArea;
  basis: EvaluationBasis;
  /** The option id the learner locked in. */
  answer: string;
  confidence: Confidence;
  evaluation: Evaluation;
  /** What actually happened or what the model says, in a few words, so the record can be read on its own. */
  outcome: string;
  /** When the answer was locked (ms since epoch). */
  lockedAt: number;
  /** 1 for the first submission at this item, 2 for the next, … Fixed when recorded. */
  attempt: number;
  /** Whether the associated lesson had been completed when this was submitted. Null for records made before v2. */
  lessonCompleted: boolean | null;
  /** Challenge content version answered; null for lesson predictions. */
  contentVersion: number | null;
}

/** A record before it joins the history: `attempt` (and, if unknown, `lessonCompleted`) are filled in on merge. */
export type NewAttempt = Omit<LearningAttempt, 'attempt' | 'lessonCompleted'> & { lessonCompleted?: boolean };

const evaluationSchema = z.enum(['correct', 'partial', 'reasonable-miss', 'reasonable', 'misconception']);

/** Accepts v1 records (no kind / attempt / lessonCompleted / contentVersion); `normalise` fills those in. */
export const learningAttemptSchema = z.object({
  id: z.string().min(1).max(80),
  schemaVersion: z.number().int().positive(),
  kind: z.enum(['lesson', 'challenge', 'scenario']).optional(),
  lesson: lessonIdSchema,
  prediction: z.string().refine((id) => itemMeta(id) !== undefined, 'Unknown item'),
  skill: z.enum(['anticipating', 'incentives', 'coordination', 'uncertainty']),
  basis: z.enum(['calculable', 'uncertain']),
  answer: z.string().min(1).max(40),
  confidence: confidenceSchema,
  evaluation: evaluationSchema,
  outcome: z.string().max(200),
  lockedAt: z.number().int().nonnegative(),
  attempt: z.number().int().positive().optional(),
  lessonCompleted: z.boolean().nullable().optional(),
  contentVersion: z.number().int().positive().nullable().optional(),
});

/**
 * Build the record for an evaluated lesson prediction, or null when there is nothing fair to record yet: not
 * locked, no confidence, or saved before attempts carried a lock time (those can't be told apart, so they are
 * skipped rather than risk duplicates).
 */
export function recordAttempt(prediction: PredictionKey, attempt: PredictionAttempt<string>, verdict: Verdict, outcome: string): NewAttempt | null {
  if (!attempt.locked || attempt.answer === null || attempt.confidence === null || attempt.lockedAt === undefined) return null;
  const meta = predictionMeta(prediction);
  if (!meta) return null;
  return {
    id: `${prediction}@${attempt.lockedAt}`,
    schemaVersion: LEARNING_SCHEMA_VERSION,
    kind: 'lesson',
    lesson: meta.lesson,
    prediction,
    skill: meta.skill,
    basis: meta.basis,
    answer: attempt.answer,
    confidence: attempt.confidence,
    evaluation: evaluationFromVerdict(verdict),
    outcome,
    lockedAt: attempt.lockedAt,
    contentVersion: null,
  };
}

/** The record for a submitted challenge answer, graded by the option's verdict. */
export function recordChallengeAttempt(challenge: Challenge, attempt: PredictionAttempt<string>, lessonCompleted: boolean): NewAttempt | null {
  if (!attempt.locked || attempt.answer === null || attempt.confidence === null || attempt.lockedAt === undefined) return null;
  const option = challenge.options.find((o) => o.id === attempt.answer);
  if (!option) return null;
  const strongest = challenge.options.filter((o) => o.verdict === 'match').map((o) => o.label);
  return {
    id: `${challenge.id}@${attempt.lockedAt}`,
    schemaVersion: LEARNING_SCHEMA_VERSION,
    kind: 'challenge',
    lesson: challenge.lesson,
    prediction: challenge.id,
    skill: challenge.skill,
    basis: challenge.basis,
    answer: option.id,
    confidence: attempt.confidence,
    evaluation: evaluationFromVerdict(option.verdict, 'challenge'),
    outcome: strongest.length ? `Strongest answer: ${strongest.join(' / ')}`.slice(0, 200) : 'No single answer can be known from the scenario',
    lockedAt: attempt.lockedAt,
    lessonCompleted,
    contentVersion: challenge.version,
  };
}

/** Keep every first attempt; beyond the cap, drop the oldest retries. */
function capHistory(list: LearningAttempt[]): LearningAttempt[] {
  if (list.length <= MAX_ATTEMPTS) return list;
  let excess = list.length - MAX_ATTEMPTS;
  return list.filter((a) => !(a.attempt > 1 && excess > 0 && excess-- > 0));
}

/**
 * Add new records. The first record for an id wins, so a later re-evaluation (e.g. a rerun) never rewrites it.
 * Each new record gets the next attempt number for its item, and — if it didn't say — whether its lesson was
 * already completed at that moment.
 */
export function mergeAttempts(
  existing: readonly LearningAttempt[],
  incoming: readonly (NewAttempt | LearningAttempt | null)[],
  context: { completed?: readonly LessonId[] } = {},
): LearningAttempt[] {
  const seen = new Set(existing.map((a) => a.id));
  const counts = new Map<string, number>();
  for (const a of existing) counts.set(a.prediction, Math.max(counts.get(a.prediction) ?? 0, a.attempt));
  const added: LearningAttempt[] = [];
  for (const a of [...incoming].filter((x): x is NewAttempt => !!x).sort((x, y) => x.lockedAt - y.lockedAt)) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const attempt = (counts.get(a.prediction) ?? 0) + 1;
    counts.set(a.prediction, attempt);
    added.push({ ...a, attempt, lessonCompleted: a.lessonCompleted ?? (context.completed ? context.completed.includes(a.lesson) : null) });
  }
  if (!added.length) return existing as LearningAttempt[];
  return capHistory([...existing, ...added].sort((a, b) => a.lockedAt - b.lockedAt));
}

/**
 * Keep only well-formed, unique records from storage, upgrading v1 records: they are lesson predictions, their
 * attempt numbers follow their order, and whether the lesson was completed at the time is unknown (null).
 * Anything malformed is dropped, never repaired by guessing.
 */
export function sanitizeAttempts(saved: unknown): LearningAttempt[] {
  if (!Array.isArray(saved)) return [];
  const parsed = saved.flatMap((a) => {
    const r = learningAttemptSchema.safeParse(a);
    return r.success ? [r.data] : [];
  });
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const out: LearningAttempt[] = [];
  for (const r of parsed.sort((a, b) => a.lockedAt - b.lockedAt || (a.attempt ?? 0) - (b.attempt ?? 0))) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const meta = itemMeta(r.prediction)!;
    const attempt = r.attempt ?? (counts.get(r.prediction) ?? 0) + 1;
    counts.set(r.prediction, Math.max(counts.get(r.prediction) ?? 0, attempt));
    out.push({
      ...r,
      kind: r.kind ?? meta.kind,
      attempt,
      lessonCompleted: r.lessonCompleted ?? null,
      contentVersion: r.contentVersion ?? null,
    } as LearningAttempt);
  }
  return capHistory(out);
}

/** The first attempt at each item — the evidence of initial understanding. */
export function firstAttempts(attempts: readonly LearningAttempt[]): LearningAttempt[] {
  const first = new Map<string, LearningAttempt>();
  for (const a of attempts) {
    const prev = first.get(a.prediction);
    if (!prev || a.attempt < prev.attempt || (a.attempt === prev.attempt && a.lockedAt < prev.lockedAt)) first.set(a.prediction, a);
  }
  return [...first.values()].sort((a, b) => a.lockedAt - b.lockedAt);
}

// ── Goal ─────────────────────────────────────────────────────────────────────

export type GoalId = SkillArea | 'none';

/** The goal choices, in display order. Content: the labels are editable. */
export function allGoals(): readonly { id: GoalId; label: string }[] {
  return catalog().goals;
}

export const goalSchema = z.enum(['anticipating', 'incentives', 'coordination', 'uncertainty', 'none']);

export function sanitizeGoal(saved: unknown): GoalId | null {
  const parsed = goalSchema.safeParse(saved);
  return parsed.success ? parsed.data : null;
}

// ── Export ───────────────────────────────────────────────────────────────────

export const EXPORT_FORMAT = 'strategic-thinking-learning-data';
/** v2 adds challenge records and first-attempt / retry history. v3: the 22-lesson curriculum, scenarios and assessments. */
export const EXPORT_SCHEMA_VERSION = 3;

export interface LearningExport {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  goal: GoalId | null;
  lessons: {
    id: LessonId;
    number: number;
    module: string;
    title: string;
    completed: boolean;
    inProgress: boolean;
    challengesTried: number;
    challengesTotal: number;
    scenariosPlayed: number;
    scenariosTotal: number;
  }[];
  /** Module checkpoints and the final assessment: scores out of `maxScore`; null when never submitted. */
  assessments: { id: string; title: string; attempts: number; firstScore: number | null; bestScore: number | null; lastScore: number | null; maxScore: number }[];
  attempts: (Omit<LearningAttempt, 'lockedAt' | 'schemaVersion'> & { recordSchemaVersion: number; lockedAt: string; question: string; isFirstAttempt: boolean })[];
}

/** The versioned export documented in docs/LEARNING_DATA.md. Only learning records, lesson status and the goal. */
export function buildLearningExport(input: {
  attempts: readonly LearningAttempt[];
  completed: readonly LessonId[];
  inProgress: readonly LessonId[];
  goal: GoalId | null;
  now: Date;
  scenarioDone?: readonly string[];
  assessments?: AssessmentRuns;
}): LearningExport {
  const tried = new Set(input.attempts.filter((a) => a.kind === 'challenge').map((a) => a.prediction));
  const challenges = allChallenges();
  const scenarios = allScenarios();
  return {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: input.now.toISOString(),
    goal: input.goal,
    lessons: allLessons().map((l) => {
      const lessonChallenges = challenges.filter((c) => c.lesson === l.id);
      const lessonScenarios = scenarios.filter((s) => s.lesson === l.id);
      return {
        id: l.id,
        number: l.number,
        module: l.module,
        title: l.title,
        completed: input.completed.includes(l.id),
        inProgress: input.inProgress.includes(l.id),
        challengesTried: lessonChallenges.filter((c) => tried.has(c.id)).length,
        challengesTotal: lessonChallenges.length,
        scenariosPlayed: lessonScenarios.filter((s) => input.scenarioDone?.includes(s.id)).length,
        scenariosTotal: lessonScenarios.length,
      };
    }),
    assessments: allAssessments().map((a) => {
      const r = input.assessments?.[a.id];
      return { id: a.id, title: a.title, attempts: r?.attempts ?? 0, firstScore: r?.firstScore ?? null, bestScore: r?.bestScore ?? null, lastScore: r?.lastScore ?? null, maxScore: a.items.length };
    }),
    attempts: input.attempts.map(({ lockedAt, schemaVersion, ...a }) => ({
      ...a,
      recordSchemaVersion: schemaVersion,
      question: itemMeta(a.prediction)?.question ?? a.prediction,
      isFirstAttempt: a.attempt === 1,
      lockedAt: new Date(lockedAt).toISOString(),
    })),
  };
}

export function exportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `strategic-thinking-data-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
