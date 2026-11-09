import { z } from 'zod';

import { DataError } from './errors.ts';
import { type Rpc, call } from './repositories.ts';

/**
 * The Crowd's two database functions (supabase/migrations/20261110120000_daily_crowd.sql):
 * - submit_crowd_answer({questionId, value})  today's answer; the first one of the day stands
 * - get_crowd_result({day, questionId})       your answer and the count; the distribution once the day is over
 */

const submitSchema = z.object({ status: z.enum(['recorded', 'existing']), day: z.string(), questionId: z.string(), value: z.number().int() });
const resultSchema = z.object({
  day: z.string(),
  open: z.boolean(),
  answered: z.number().int().nonnegative(),
  mine: z.number().int().nullable(),
  counts: z.array(z.tuple([z.number().int(), z.number().int().nonnegative()])).optional(),
});

export type CrowdSubmit = z.infer<typeof submitSchema>;
export type CrowdResult = z.infer<typeof resultSchema>;

export interface CrowdRepository {
  submit(questionId: string, value: number): Promise<CrowdSubmit>;
  result(day: string, questionId: string): Promise<CrowdResult>;
}

export function crowdRepository(rpc: Rpc): CrowdRepository {
  return {
    async submit(questionId, value) {
      const r = submitSchema.safeParse(await call(rpc, 'submit_crowd_answer', { request: { questionId, value } }));
      if (!r.success) throw new DataError('server', 'submit_crowd_answer returned an unexpected result');
      return r.data;
    },
    async result(day, questionId) {
      const r = resultSchema.safeParse(await call(rpc, 'get_crowd_result', { request: { day, questionId } }));
      if (!r.success) throw new DataError('server', 'get_crowd_result returned an unexpected result');
      return r.data;
    },
  };
}
