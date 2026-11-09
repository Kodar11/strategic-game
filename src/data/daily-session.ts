import { createDailyStore } from '@/src/features/daily/store';
import { crowdRepository } from './crowd';
import { dailyRepository } from './daily';
import { supabaseRpc } from './supabase';

/** The app's Daily Challenge store, backed by Supabase. Separate from the lesson progress store and its outbox. */
export const dailyRepo = dailyRepository(supabaseRpc);
export const useDaily = createDailyStore(dailyRepo);

/** The Crowd's answers and results (src/daily-mix/crowd.ts), signed-in players only. */
export const crowdRepo = crowdRepository(supabaseRpc);
