import { create } from 'zustand';

import type { DailyRepository, SubmitRequest } from '../../data/daily.ts';
import { DataError, toDataError } from '../../data/errors.ts';
import type { DailyAttempt, DailyHistoryEntry, DailyRange } from './content.ts';
import { type Day, type Month, formatDay, monthKey, monthOf, monthRange, utcToday } from './dates.ts';

/**
 * Daily Challenge state for the screens: loaded months, the learner's attempt history and the server's "today".
 * Supabase is the source of truth; this is a cache of what it returned, kept in memory only (nothing is written to
 * the device), and separate from the lesson progress store — daily activity never changes lessons or scenarios.
 */

export type MonthState = { status: 'loading' } | { status: 'ready'; data: DailyRange; loadedAt: number } | { status: 'error'; error: DataError };

export interface DailyState {
  /** The schedule's today (UTC), from the server once it has answered; the device's UTC date before that. */
  today: Day;
  /** Whether `today` came from the server. */
  todayConfirmed: boolean;
  months: Record<string, MonthState>;
  /** Every official attempt (compact), for summaries and the profile. Null until first loaded. */
  history: DailyHistoryEntry[] | null;
  loadMonth: (month: Month, opts?: { force?: boolean }) => Promise<void>;
  /** Submit today's official answer and fold the recorded attempt into the cache. */
  submit: (req: SubmitRequest & { date: Day }) => Promise<{ status: 'recorded' | 'existing'; attempt: DailyAttempt }>;
}

/** A loaded month is reused for this long before a visit refetches it (content may be published meanwhile). */
export const MONTH_TTL_MS = 60_000;

export function createDailyStore(repo: DailyRepository, now: () => number = Date.now) {
  const inflight = new Map<string, Promise<void>>();
  const store = create<DailyState>()((set, get) => ({
    today: utcToday(now()),
    todayConfirmed: false,
    months: {},
    history: null,
    loadMonth: (month, opts) => {
      const key = monthKey(month);
      const cur = get().months[key];
      if (!opts?.force && cur?.status === 'ready' && now() - cur.loadedAt < MONTH_TTL_MS) return Promise.resolve();
      const pending = inflight.get(key);
      if (pending) return pending;
      // Keep showing a loaded month while it refreshes; only a first load shows the spinner.
      if (cur?.status !== 'ready') set((s) => ({ months: { ...s.months, [key]: { status: 'loading' } } }));
      const { from, to } = monthRange(month);
      const p = repo
        .fetchRange(from, to)
        .then((data) => {
          set((s) => ({ today: data.today, todayConfirmed: true, history: data.history, months: { ...s.months, [key]: { status: 'ready', data, loadedAt: now() } } }));
        })
        .catch((e: unknown) => {
          const d = toDataError(e);
          // A read can't lose an answer, so say what failed instead of the generic "refused a change".
          const error = d.transient ? d : new DataError(d.kind, d.detail, 'Daily challenges aren’t available from the server right now. Try again later.');
          set((s) => (s.months[key]?.status === 'ready' ? s : { months: { ...s.months, [key]: { status: 'error', error } } }));
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    },
    submit: async (req) => {
      const { date, ...request } = req;
      const out = await repo.submit(request);
      const a = out.attempt;
      set((s) => {
        const key = monthKey(monthOf(date));
        const m = s.months[key];
        const months =
          m?.status === 'ready' ? { ...s.months, [key]: { ...m, data: { ...m.data, attempts: new Map(m.data.attempts).set(formatDay(a.date), a) } } } : s.months;
        const { answer: _a, result: _r, ...entry } = a;
        const history = [...(s.history ?? []).filter((h) => h.challengeId !== a.challengeId), entry].sort((x, y) => x.submittedAt - y.submittedAt);
        return { months, history };
      });
      return out;
    },
  }));
  return store;
}
