import type { Confidence } from '../components/lesson/prediction-state.ts';
import { type DailyAttempt, type DailyRange, type DailyResult, type DailyReveal, attemptSchema, parseRange, resultSchema, revealSchema } from '../features/daily/content.ts';
import { DataError } from './errors.ts';
import { type Rpc, call } from './repositories.ts';

/**
 * Daily Challenge reads and writes, through four database functions:
 * - get_daily_challenges({from, to})   released challenges, the caller's attempts in range, all their attempts (compact)
 * - submit_daily_challenge(...)        today's official answer, graded on the server; idempotent per learner and day
 * - check_daily_practice(...)          grade a practice answer without recording it (past days, or after answering)
 * - get_daily_reveal({challengeId})    model answer, explanation and takeaway (same rule as practice)
 *
 * These never touch lesson progress, scenario runs or the learning record.
 */

/** Why the server refused a daily request, when the learner can do something about it. */
export type DailyRefusal = 'stale' | 'closed' | 'locked' | 'not_found' | 'invalid_answer' | 'confidence';

export class DailyError extends DataError {
  readonly refusal: DailyRefusal;

  constructor(refusal: DailyRefusal, detail: string) {
    super('refused', detail, REFUSAL_MESSAGES[refusal]);
    this.refusal = refusal;
  }
}

const REFUSAL_MESSAGES: Record<DailyRefusal, string> = {
  stale: 'This challenge was updated after you opened it. It has been reloaded — check your answer and submit again.',
  closed: 'This day’s challenge has closed, so it can no longer be your official answer. You can still practise it.',
  locked: 'Answer today’s challenge first; practice and the full explanation open after that.',
  not_found: 'This challenge isn’t available any more.',
  invalid_answer: 'That answer couldn’t be checked. Try choosing it again.',
  confidence: 'Say how confident you are before submitting.',
};

async function daily(rpc: Rpc, fn: Parameters<typeof call>[1], request: Record<string, unknown>): Promise<unknown> {
  try {
    return await call(rpc, fn, { request });
  } catch (e) {
    const refusal = e instanceof DataError ? /daily:([a-z_]+)/.exec(e.detail)?.[1] : undefined;
    if (refusal && refusal in REFUSAL_MESSAGES) throw new DailyError(refusal as DailyRefusal, (e as DataError).detail);
    throw e;
  }
}

export interface SubmitRequest {
  challengeId: string;
  version: number;
  answer: unknown;
  confidence: Confidence | null;
}

export interface DailyRepository {
  fetchRange(from: string, to: string): Promise<DailyRange>;
  /** `existing` when an official answer was already recorded (a retry, another device): that one stands. */
  submit(req: SubmitRequest): Promise<{ status: 'recorded' | 'existing'; attempt: DailyAttempt }>;
  practice(req: Omit<SubmitRequest, 'confidence'>): Promise<DailyResult>;
  reveal(challengeId: string): Promise<DailyReveal>;
}

export function dailyRepository(rpc: Rpc): DailyRepository {
  return {
    async fetchRange(from, to) {
      const range = parseRange(await daily(rpc, 'get_daily_challenges', { from, to }));
      if (!range) throw new DataError('server', 'get_daily_challenges returned an unexpected result');
      return range;
    },
    async submit(req) {
      const raw = (await daily(rpc, 'submit_daily_challenge', { ...req })) as { status?: unknown; attempt?: unknown } | null;
      const attempt = attemptSchema.safeParse(raw?.attempt);
      if (!attempt.success || (raw?.status !== 'recorded' && raw?.status !== 'existing')) throw new DataError('server', 'submit_daily_challenge returned an unexpected result');
      return { status: raw.status, attempt: attempt.data as DailyAttempt };
    },
    async practice(req) {
      const r = resultSchema.safeParse(await daily(rpc, 'check_daily_practice', { ...req }));
      if (!r.success) throw new DataError('server', 'check_daily_practice returned an unexpected result');
      return r.data;
    },
    async reveal(challengeId) {
      const r = revealSchema.safeParse(await daily(rpc, 'get_daily_reveal', { challengeId }));
      if (!r.success) throw new DataError('server', 'get_daily_reveal returned an unexpected result');
      return r.data;
    },
  };
}
