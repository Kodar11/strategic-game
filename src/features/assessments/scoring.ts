import { z } from 'zod';

import type { Verdict } from '../../components/lesson/verdict.ts';
import { ASSESSMENTS, type Assessment, type AssessmentId, type AssessmentItem, getAssessment } from './content.ts';

/**
 * Assessment progress and scoring, as pure functions. A run holds the current answers; submitting scores them and
 * keeps the first, best and latest scores, so a retake never overwrites the evidence of the first attempt.
 */

export interface AssessmentRun {
  version: number;
  answers: Record<string, string[]>;
  submitted: boolean;
  attempts: number;
  firstScore: number | null;
  bestScore: number | null;
  lastScore: number | null;
  /** When the latest submission happened (ms since epoch). */
  submittedAt: number | null;
  reflection: string;
  /** Indices of rubric points the learner says their written answer covers. Self-assessed, never scored. */
  rubric: number[];
}

export type AssessmentRuns = Partial<Record<AssessmentId, AssessmentRun>>;

export function emptyRun(a: Assessment): AssessmentRun {
  return { version: a.version, answers: {}, submitted: false, attempts: 0, firstScore: null, bestScore: null, lastScore: null, submittedAt: null, reflection: '', rubric: [] };
}

const VALUE: Record<Verdict, number> = { match: 1, defensible: 0.5, depends: 0.5, reasonable: 0, misconception: 0 };

/**
 * Score one item, 0–1. Single answer: by its verdict. Multi-select: each matching choice earns 1 and each defensible
 * one ½, each misconception costs 1, normalised by the number of matching options — so plausible alternatives are
 * never treated as wrong, and choosing everything doesn't pay.
 */
export function itemScore(item: AssessmentItem, answer: readonly string[]): number {
  const chosen = item.options.filter((o) => answer.includes(o.id));
  if (!chosen.length) return 0;
  if (!item.multi) return VALUE[chosen[0].verdict];
  const matches = item.options.filter((o) => o.verdict === 'match').length;
  const raw = chosen.reduce((s, o) => s + (o.verdict === 'match' ? 1 : o.verdict === 'misconception' ? -1 : o.verdict === 'reasonable' ? 0 : 0.5), 0);
  return Math.max(0, Math.min(1, raw / matches));
}

export function assessmentScore(a: Assessment, answers: Record<string, readonly string[]>): { score: number; max: number; ratio: number; passed: boolean } {
  const score = a.items.reduce((s, item) => s + itemScore(item, answers[item.id] ?? []), 0);
  const max = a.items.length;
  const ratio = score / max;
  return { score, max, ratio, passed: ratio >= a.passMark - 1e-9 };
}

export function isComplete(a: Assessment, answers: Record<string, readonly string[]>): boolean {
  return a.items.every((i) => (answers[i.id]?.length ?? 0) > 0);
}

export function currentAssessmentRun(runs: AssessmentRuns, a: Assessment): AssessmentRun {
  const r = runs[a.id];
  return r && r.version === a.version ? r : emptyRun(a);
}

/** Choose (or, for multi-select, toggle) an option. No-op once submitted. */
export function answerItem(run: AssessmentRun, item: AssessmentItem, optionId: string): AssessmentRun {
  if (run.submitted || !item.options.some((o) => o.id === optionId)) return run;
  const prev = run.answers[item.id] ?? [];
  const next = item.multi ? (prev.includes(optionId) ? prev.filter((x) => x !== optionId) : [...prev, optionId]) : [optionId];
  return { ...run, answers: { ...run.answers, [item.id]: next } };
}

/** Score and lock the run. Null when incomplete or already submitted (double taps are safe). */
export function submitAssessment(run: AssessmentRun, a: Assessment, now: number = Date.now()): AssessmentRun | null {
  if (run.submitted || !isComplete(a, run.answers)) return null;
  const { score } = assessmentScore(a, run.answers);
  return {
    ...run,
    submitted: true,
    attempts: run.attempts + 1,
    firstScore: run.firstScore ?? score,
    bestScore: Math.max(run.bestScore ?? -Infinity, score),
    lastScore: score,
    submittedAt: now,
  };
}

/** Start again: answers clear, the score history stays. */
export function retakeAssessment(run: AssessmentRun): AssessmentRun {
  return run.submitted ? { ...run, answers: {}, submitted: false, reflection: '', rubric: [] } : run;
}

/** The final assessment opens once every module checkpoint has been submitted at least once. */
export function finalUnlocked(runs: AssessmentRuns): boolean {
  return ASSESSMENTS.filter((a) => a.id !== 'final').every((a) => (runs[a.id]?.attempts ?? 0) > 0);
}

const runSchema = z.object({
  version: z.number().int().positive(),
  answers: z.record(z.string(), z.array(z.string().max(40)).max(10)),
  submitted: z.boolean(),
  attempts: z.number().int().nonnegative(),
  firstScore: z.number().nullable(),
  bestScore: z.number().nullable(),
  lastScore: z.number().nullable(),
  submittedAt: z.number().nullable(),
  reflection: z.string().max(4000),
  rubric: z.array(z.number().int().nonnegative()).max(10),
});

/** Keep runs for known assessments of the current version; drop answers to items or options that no longer exist. */
export function sanitizeAssessmentRuns(saved: unknown): AssessmentRuns {
  if (!saved || typeof saved !== 'object') return {};
  const out: AssessmentRuns = {};
  for (const [id, raw] of Object.entries(saved as Record<string, unknown>)) {
    const a = getAssessment(id);
    const parsed = runSchema.safeParse(raw);
    if (!a || !parsed.success || parsed.data.version !== a.version) continue;
    const answers: Record<string, string[]> = {};
    for (const item of a.items) {
      const ans = parsed.data.answers[item.id]?.filter((x) => item.options.some((o) => o.id === x));
      if (ans?.length) answers[item.id] = item.multi ? ans : ans.slice(0, 1);
    }
    const submitted = parsed.data.submitted && isComplete(a, answers);
    out[a.id] = { ...parsed.data, answers, submitted };
  }
  return out;
}
