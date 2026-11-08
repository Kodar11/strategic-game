import { type Day, dayNumber, fromDayNumber } from './dates.ts';

/**
 * Consecutive days taken part, ending today (or yesterday, when today isn't done yet). `took` answers from the
 * months that are loaded (this one and the last), so the count runs across the 1st; a day in a month that isn't
 * loaded counts as not taken part, so it never claims a day it hasn't seen.
 */
export function streakFrom(today: Day, took: (d: Day) => boolean): number {
  let k = dayNumber(today);
  if (!took(today)) k--;
  let n = 0;
  for (let day = fromDayNumber(k); took(day); day = fromDayNumber(--k)) n++;
  return n;
}
