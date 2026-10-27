import { z } from 'zod';

import type { Confidence } from '../../components/lesson/prediction-state.ts';
import type { Verdict } from '../../components/lesson/verdict.ts';
import type { EvaluationBasis, SkillArea } from '../learning/types.ts';
import { type Day, formatDay, parseDay } from './dates.ts';
import { type ChoiceConfig, INTERACTIONS, type InteractionType, type NumberConfig, type ScenarioConfig, isInteractionType } from './interactions.ts';

/**
 * Daily Challenge data as the app uses it, parsed from the database functions (get_daily_challenges,
 * submit_daily_challenge, check_daily_practice, get_daily_reveal). Database content is untrusted input: each
 * challenge is validated on its own against the interaction registry, and one that fails becomes a readable,
 * recoverable problem for that day — it never breaks the calendar and is never swapped for other content.
 */

export type DailyEvaluation = 'correct' | 'partial' | 'reasonable' | 'misconception';

interface DailyBase {
  id: string;
  date: Day;
  version: number;
  title: string;
  intro: string;
  prompt: string;
  instructions?: string;
  askConfidence: boolean;
  difficulty: 1 | 2 | 3;
  skill?: SkillArea;
  basis: EvaluationBasis;
  lesson?: string;
}

export type DailyChallenge = DailyBase &
  ({ interaction: 'choice'; config: ChoiceConfig } | { interaction: 'number'; config: NumberConfig } | { interaction: 'scenario'; config: ScenarioConfig });

/** A published day: either a challenge this app can run, or why it can't (shown instead, with a retry). */
export type DailyEntry = { ok: true; challenge: DailyChallenge } | { ok: false; id: string; date: Day; title: string | null; problem: string };

export interface DailyResult {
  verdict: Verdict;
  evaluation: DailyEvaluation;
  feedback: string;
  answerLabel: string;
  modelAnswer: string;
  explanation: string[];
  takeaway: string;
  title: string;
  version: number;
}

export interface DailyAttempt {
  challengeId: string;
  date: Day;
  version: number;
  interaction: string;
  answer: unknown;
  confidence: Confidence | null;
  evaluation: DailyEvaluation;
  skill: SkillArea | null;
  basis: EvaluationBasis;
  lesson: string | null;
  result: DailyResult;
  submittedAt: number;
}

/** One official attempt, without its answer and result: what summaries and the profile need. */
export type DailyHistoryEntry = Omit<DailyAttempt, 'answer' | 'result'>;

export interface DailyRange {
  today: Day;
  timezone: string;
  /** Keyed by `YYYY-MM-DD`. */
  entries: Map<string, DailyEntry>;
  attempts: Map<string, DailyAttempt>;
  history: DailyHistoryEntry[];
}

export interface DailyReveal {
  modelAnswer: string;
  explanation: string[];
  takeaway: string;
}

const day = z.string().transform((s, ctx) => parseDay(s) ?? (ctx.addIssue({ code: 'custom', message: `not a date: ${s}` }), z.NEVER));
const skill = z.enum(['anticipating', 'incentives', 'coordination', 'uncertainty']);
const basis = z.enum(['calculable', 'uncertain']);
const evaluation = z.enum(['correct', 'partial', 'reasonable', 'misconception']);
const confidence = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

const baseSchema = z.object({
  id: z.string().min(1).max(80),
  date: day,
  version: z.number().int().positive(),
  title: z.string().min(1).max(120),
  intro: z.string().min(1).max(800),
  prompt: z.string().min(1).max(1500),
  instructions: z.string().min(1).max(400).optional(),
  interaction: z.string(),
  config: z.unknown(),
  askConfidence: z.boolean(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  skill: skill.optional(),
  basis,
  lesson: z.string().optional(),
});

export const resultSchema = z.object({
  verdict: z.enum(['match', 'defensible', 'misconception', 'depends', 'reasonable']),
  evaluation,
  feedback: z.string().min(1),
  answerLabel: z.string(),
  modelAnswer: z.string().min(1),
  explanation: z.array(z.string()).min(1),
  takeaway: z.string().min(1),
  title: z.string(),
  version: z.number().int().positive(),
});

const historySchema = z.object({
  challengeId: z.string(),
  date: day,
  version: z.number().int().positive(),
  interaction: z.string(),
  confidence: confidence.nullable(),
  evaluation,
  skill: skill.nullable(),
  basis,
  lesson: z.string().nullable(),
  submittedAt: z.number().int().nonnegative(),
});

export const attemptSchema = historySchema.extend({ answer: z.unknown(), result: resultSchema });

export const revealSchema = z.object({ modelAnswer: z.string().min(1), explanation: z.array(z.string()).min(1), takeaway: z.string().min(1) });

/** Validate one published challenge against the registry and this app's engines. */
export function parseChallenge(raw: unknown): DailyEntry | null {
  const base = baseSchema.safeParse(raw);
  if (!base.success) {
    // Without a valid id and date there is no day to show the problem on.
    const r = (raw ?? {}) as { id?: unknown; date?: unknown; title?: unknown };
    const date = parseDay(r.date);
    if (typeof r.id !== 'string' || !date) return null;
    return { ok: false, id: r.id, date, title: typeof r.title === 'string' ? r.title : null, problem: 'This challenge’s content didn’t pass the app’s checks.' };
  }
  const b = base.data;
  const fail = (problem: string): DailyEntry => ({ ok: false, id: b.id, date: b.date, title: b.title, problem });
  if (!isInteractionType(b.interaction)) return fail('This challenge uses a kind of interaction this version of the app doesn’t support yet. Update the app to play it.');
  const type: InteractionType = b.interaction;
  const parsed = INTERACTIONS[type].config.safeParse(b.config);
  if (!parsed.success) return fail('This challenge’s settings didn’t pass the app’s checks.');
  const problem = (INTERACTIONS[type].check as (c: unknown) => string | null)(parsed.data);
  if (problem) return fail(`${problem} Update the app to play it.`);
  const { interaction: _i, config: _c, ...rest } = b;
  return { ok: true, challenge: { ...rest, interaction: type, config: parsed.data } as DailyChallenge };
}

const rangeSchema = z.object({
  today: day,
  timezone: z.string(),
  challenges: z.array(z.unknown()),
  attempts: z.array(z.unknown()),
  history: z.array(z.unknown()),
});

export function parseRange(raw: unknown): DailyRange | null {
  const r = rangeSchema.safeParse(raw);
  if (!r.success) return null;
  const entries = new Map<string, DailyEntry>();
  for (const c of r.data.challenges) {
    const e = parseChallenge(c);
    if (e) entries.set(formatDay(e.ok ? e.challenge.date : e.date), e);
  }
  const attempts = new Map<string, DailyAttempt>();
  for (const a of r.data.attempts) {
    const p = attemptSchema.safeParse(a);
    if (p.success) attempts.set(formatDay(p.data.date), p.data as DailyAttempt);
  }
  const history = r.data.history.flatMap((h) => {
    const p = historySchema.safeParse(h);
    return p.success ? [p.data as DailyHistoryEntry] : [];
  });
  return { today: r.data.today, timezone: r.data.timezone, entries, attempts, history };
}
