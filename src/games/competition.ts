/**
 * Game of the Week rules, as the app displays them. The server (supabase/migrations/…_games.sql) is authoritative:
 * it decides eligibility, scores matches, ranks players and finalizes each week. These pure functions mirror its
 * rules for display and are tested against the same cases.
 *
 * Scoring policy v1
 * - A week runs Monday 00:00 to the next Monday 00:00 in Asia/Kolkata (IST, UTC+05:30, no daylight saving), stored
 *   as explicit UTC timestamps. A round played at or after the end is refused.
 * - Each player gets `maxAttempts` competitive matches a week (3 by default). Starting a match uses an attempt, even
 *   if it's abandoned, so replaying until lucky isn't possible. An unfinished match can be resumed until the end.
 * - Weekly score = the best completed match score. Ties: the earlier achievement ranks higher; identical score and
 *   time share the rank.
 * - Global points for a finalized week: 10 for taking part, plus placement points ⌊40 × (n − rank + 1) / n⌋ for a field
 *   of n players (40 for first, at least ⌊40 / n⌋ for last), plus the winner bonus (25 by default, configurable per
 *   week, at most 50). Practice games never count.
 */

export const SCORING_VERSION = 1;
export const COMPETITION_TIMEZONE = 'Asia/Kolkata';
/** IST is a fixed UTC+05:30 (India has no daylight saving). */
export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
export const PARTICIPATION_POINTS = 10;
export const PLACEMENT_POINTS = 40;
export const DEFAULT_WINNER_BONUS = 25;

/** The UTC window of the competition week that starts on `monday` (YYYY-MM-DD, a Monday in IST). */
export function weekWindow(monday: string): { startsAt: number; endsAt: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(monday);
  if (!m) throw new Error(`weekWindow: ${monday} is not a date`);
  const midnightUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(midnightUtc).getUTCDay() !== 1) throw new Error(`weekWindow: ${monday} is not a Monday`);
  const startsAt = midnightUtc - IST_OFFSET_MS;
  return { startsAt, endsAt: startsAt + 7 * 24 * 60 * 60 * 1000 };
}

export function placementPoints(rank: number, field: number): number {
  if (field < 1 || rank < 1 || rank > field) return 0;
  return Math.floor((PLACEMENT_POINTS * (field - rank + 1)) / field);
}

export function weeklyPoints(rank: number, field: number, isWinner: boolean, winnerBonus = DEFAULT_WINNER_BONUS): number {
  return PARTICIPATION_POINTS + placementPoints(rank, field) + (isWinner ? winnerBonus : 0);
}

export type CompetitionPhase = 'upcoming' | 'active' | 'closed' | 'finalized';

export function competitionPhase(c: { startsAt: number; endsAt: number; finalized: boolean }, now: number): CompetitionPhase {
  if (c.finalized) return 'finalized';
  if (now < c.startsAt) return 'upcoming';
  if (now < c.endsAt) return 'active';
  return 'closed';
}

/** "2d 4h left", "3h 12m left", "under a minute left". */
export function timeLeft(ms: number): string {
  if (ms <= 0) return 'closed';
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m left`;
  return 'under a minute left';
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

/** "27 Oct – 2 Nov" in IST. */
export function weekLabel(startsAt: number, endsAt: number): string {
  const fmt = (t: number) => {
    const d = new Date(t + IST_OFFSET_MS);
    return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
  };
  return `${fmt(startsAt)} – ${fmt(endsAt - 1)}`;
}

// ── Nicknames ────────────────────────────────────────────────────────────────

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 20;
/** Names that could pass for the app or its staff. Checked against the normalized key. */
export const RESERVED_NICKNAMES = ['admin', 'administrator', 'moderator', 'mod', 'official', 'support', 'staff', 'system', 'strategic', 'strategicgame', 'anonymous', 'anonymousplayer', 'null', 'undefined'];

/** The uniqueness key: lower case, with spaces, underscores, hyphens and dots removed ("Ada Lovelace" = "ada_lovelace"). */
export const nicknameKey = (name: string) => name.toLowerCase().replace(/[\s_.-]/g, '');

export type NicknameProblem = 'length' | 'characters' | 'reserved';

/** Same rules as public.set_nickname: 3–20 characters; letters, digits, single spaces, _ . -; starts with a letter or digit. */
export function nicknameProblem(raw: string): NicknameProblem | null {
  const name = raw.trim();
  if (name.length < NICKNAME_MIN || name.length > NICKNAME_MAX) return 'length';
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(name) || name.includes('  ')) return 'characters';
  const key = nicknameKey(name);
  if (key.length < NICKNAME_MIN || RESERVED_NICKNAMES.includes(key)) return 'reserved';
  return null;
}

export const NICKNAME_MESSAGES: Record<NicknameProblem | 'taken', string> = {
  length: `Use ${NICKNAME_MIN} to ${NICKNAME_MAX} characters.`,
  characters: 'Use letters, numbers, single spaces, and _ . - (start with a letter or number).',
  reserved: 'That name is reserved. Try another.',
  taken: 'Someone already uses that name. Try another.',
};
