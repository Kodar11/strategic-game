import { createDailyStore } from '@/src/features/daily/store';
import { dailyRepository } from './daily';
import { supabaseRpc } from './supabase';

/** The app's Daily Challenge store, backed by Supabase. Separate from the lesson progress store and its outbox. */
export const dailyRepo = dailyRepository(supabaseRpc);
export const useDaily = createDailyStore(dailyRepo);
