import type { DailyAttempt, DailyEntry } from './content.ts';
import { type Day, compareDays } from './dates.ts';

/**
 * What a calendar day shows. Completion comes only from a recorded official attempt — never from having opened the
 * challenge — and a day with nothing published is "none", not a missed day.
 *
 * - `completed`  the learner's official attempt is recorded (today or earlier); opens the saved result
 * - `today`      today's challenge is published and not yet answered; opens it
 * - `missed`     an earlier day had a challenge and no official attempt; opens it for review and practice
 * - `none`       nothing was published for that day (today or earlier)
 * - `future`     after today; never opens content (unreleased challenges are not even sent to the app)
 */
export type DayState = 'completed' | 'today' | 'missed' | 'none' | 'future';

export function dayState(date: Day, today: Day, entry: DailyEntry | undefined, attempt: DailyAttempt | undefined): DayState {
  const c = compareDays(date, today);
  if (c > 0) return 'future';
  if (attempt) return 'completed';
  if (!entry) return 'none';
  return c === 0 ? 'today' : 'missed';
}

export const DAY_STATE_LABEL: Record<DayState, string> = {
  completed: 'Completed',
  today: 'Available today',
  missed: 'Missed — open to review or practise',
  none: 'No challenge published',
  future: 'Not released yet',
};

/** Completion summary for the calendar header, from official attempts only. */
export function completionSummary(history: readonly { date: Day; evaluation: string }[], today: Day): { total: number; streak: number } {
  const days = new Set(history.map((h) => compareDays(h.date, today)));
  // Consecutive completed days ending today (or yesterday, if today isn't answered yet).
  let streak = 0;
  for (let d = days.has(0) ? 0 : -1; days.has(d); d--) streak++;
  return { total: history.length, streak };
}
