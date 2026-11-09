import { type Day, dayNumber, weekday } from '../features/daily/dates.ts';
import { CROWD_QUESTIONS, type CrowdQuestion } from './crowd.ts';

/**
 * One Daily a day, in one of three formats, so it never feels the same and never runs dry:
 *
 * 1. Challenge  A Daily Challenge published on the server for that date (manual, or the automatic scenario pick).
 *               Publishing always wins: it's a deliberate choice for that day.
 * 2. Crowd      Wednesdays and Sundays: a question whose answer is other people (src/daily-mix/crowd.ts).
 * 3. Read Rush  Every other day without a published challenge: quick reads against the clock, generated on the
 *               device from the date (src/daily-mix/rush.ts) — so a day is never empty.
 *
 * `published` is whether the server has a challenge for the day: true, false, or null while unknown (loading, offline,
 * a guest). Unknown is treated as "none", so an offline player still has a Daily.
 */

export type DailyFormatKind = 'challenge' | 'crowd' | 'rush';

/** Wednesday and Sunday (0 = Monday). */
const CROWD_WEEKDAYS: ReadonlySet<number> = new Set([2, 6]);

export const isCrowdDay = (d: Day) => CROWD_WEEKDAYS.has(weekday(d));

export function dailyFormat(d: Day, published: boolean | null): DailyFormatKind {
  if (published) return 'challenge';
  return isCrowdDay(d) ? 'crowd' : 'rush';
}

/** The Crowd question for a crowd day: the bank in order, one per crowd day, then round again. */
export function crowdQuestionFor(d: Day): CrowdQuestion {
  // Crowd days since 1970-01-05 (a Monday): two per full week, plus those in the current week up to `d`.
  const n = dayNumber(d) - 4;
  const week = Math.floor(n / 7);
  const before = [...CROWD_WEEKDAYS].filter((w) => w < weekday(d)).length;
  const index = week * CROWD_WEEKDAYS.size + before;
  return CROWD_QUESTIONS[((index % CROWD_QUESTIONS.length) + CROWD_QUESTIONS.length) % CROWD_QUESTIONS.length];
}

export const FORMAT_NAME: Record<DailyFormatKind, string> = { challenge: 'Daily challenge', crowd: 'The Crowd', rush: 'Read Rush' };
export const FORMAT_LINE: Record<DailyFormatKind, string> = {
  challenge: 'One short strategic decision',
  crowd: 'Your answer depends on everyone else’s · results tomorrow',
  rush: 'Quick reads against the clock · 3 minutes',
};
