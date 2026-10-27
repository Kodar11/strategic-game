/**
 * Calendar days for the Daily Challenge. The schedule runs on UTC calendar days (see the daily_challenges migration),
 * so every computation here uses UTC and whole-day numbers — never the device's local time zone or string
 * comparison. The app takes "today" from the server once it has answered, so a wrong device clock can't open a day
 * early; `utcToday()` is only the first guess before then.
 */

export interface Day {
  y: number;
  /** 1–12 */
  m: number;
  d: number;
}

export interface Month {
  y: number;
  m: number;
}

const MS_PER_DAY = 86_400_000;

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
/** Monday first. */
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Days since 1970-01-01 (UTC). */
export function dayNumber(k: Day): number {
  return Math.round(Date.UTC(k.y, k.m - 1, k.d) / MS_PER_DAY);
}

export function fromDayNumber(n: number): Day {
  const t = new Date(n * MS_PER_DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Parse `YYYY-MM-DD`; null for anything else, including impossible dates like 2026-02-30. */
export function parseDay(s: unknown): Day | null {
  if (typeof s !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const k = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  const back = fromDayNumber(dayNumber(k));
  return back.y === k.y && back.m === k.m && back.d === k.d ? k : null;
}

export function formatDay(k: Day): string {
  return `${String(k.y).padStart(4, '0')}-${String(k.m).padStart(2, '0')}-${String(k.d).padStart(2, '0')}`;
}

export function compareDays(a: Day, b: Day): number {
  return dayNumber(a) - dayNumber(b);
}

export function sameDay(a: Day, b: Day): boolean {
  return compareDays(a, b) === 0;
}

export function utcToday(now: number = Date.now()): Day {
  return fromDayNumber(Math.floor(now / MS_PER_DAY));
}

export function monthOf(k: Day): Month {
  return { y: k.y, m: k.m };
}

export function addMonths(mo: Month, n: number): Month {
  const i = mo.y * 12 + (mo.m - 1) + n;
  return { y: Math.floor(i / 12), m: (((i % 12) + 12) % 12) + 1 };
}

export function compareMonths(a: Month, b: Month): number {
  return a.y * 12 + a.m - (b.y * 12 + b.m);
}

export function daysInMonth(mo: Month): number {
  return new Date(Date.UTC(mo.y, mo.m, 0)).getUTCDate();
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(k: Day): number {
  return (new Date(Date.UTC(k.y, k.m - 1, k.d)).getUTCDay() + 6) % 7;
}

/** The month as rows of seven cells (Monday first); cells outside the month are null. */
export function monthGrid(mo: Month): (Day | null)[][] {
  const lead = weekday({ ...mo, d: 1 });
  const cells: (Day | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth(mo) }, (_, i) => ({ ...mo, d: i + 1 }))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** First and last day of a month, as the `from` / `to` of a range query. */
export function monthRange(mo: Month): { from: string; to: string } {
  return { from: formatDay({ ...mo, d: 1 }), to: formatDay({ ...mo, d: daysInMonth(mo) }) };
}

export function monthKey(mo: Month): string {
  return `${mo.y}-${String(mo.m).padStart(2, '0')}`;
}

export function monthLabel(mo: Month): string {
  return `${MONTH_NAMES[mo.m - 1]} ${mo.y}`;
}

/** "Tuesday 27 October" (with the year when it differs from `ref`). */
export function dayLabel(k: Day, ref?: Day): string {
  return `${WEEKDAY_LONG[weekday(k)]} ${k.d} ${MONTH_NAMES[k.m - 1]}${ref && ref.y === k.y ? '' : ` ${k.y}`}`;
}
