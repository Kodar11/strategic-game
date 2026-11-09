import { currentStage, recordOf, type TournamentProgress } from './progress.ts';
import type { TournamentDoc } from './schema.ts';

/**
 * When and what to remind. Pure, so the rules are tested; src/features/reminders schedules the notifications.
 *
 * - Reminders are opt-in. The offer appears only once the app has been opened on two different days (someone who
 *   came back), and is never repeated after an answer.
 * - The daily nudge fires at 19:00 local time.
 * - The rival nudge fires two days after the last visit, and only when the player is part-way through a stage: at
 *   least one game played in it, not yet cleared. Nothing is sent to someone who hasn't started or has finished.
 */

export interface ReminderState {
  enabled: boolean;
  /** The offer was answered (yes or no). */
  asked: boolean;
  /** Days the app was opened, YYYY-MM-DD, most recent last, at most 14. */
  days: string[];
}

export const EMPTY_REMINDERS: ReminderState = { enabled: false, asked: false, days: [] };
export const DAILY_HOUR = 19;
export const NUDGE_AFTER_DAYS = 2;
export const NUDGE_HOUR = 18;

export function recordVisit(s: ReminderState, day: string): ReminderState {
  if (s.days.at(-1) === day) return s;
  return { ...s, days: [...s.days.filter((d) => d !== day), day].slice(-14) };
}

export const shouldOffer = (s: ReminderState) => !s.asked && !s.enabled && s.days.length >= 2;

export interface Nudge {
  title: string;
  body: string;
}

export function rivalNudge(doc: TournamentDoc, p: TournamentProgress, completed: readonly string[]): Nudge | null {
  const season = doc.seasons.find((s) => s.status === 'live');
  if (!season) return null;
  const status = currentStage(season, p, completed);
  if (!status.unlocked || status.cleared) return null;
  const played = status.stage.matches.some((m) => {
    const r = recordOf(p, m.id);
    return r.wins + r.losses + r.draws > 0;
  });
  if (!played) return null;
  const rival = doc.rivals.find((r) => r.id === status.stage.rival);
  if (!rival) return null;
  const n = status.stage.matches.length;
  return {
    title: `${rival.name} is waiting`,
    body: `${status.clearedCount} of ${n} matches cleared in ${status.stage.title}. ${status.duelOpen ? `The duel is open.` : 'Pick up where you left off.'}`,
  };
}

/** The moment the rival nudge fires: NUDGE_AFTER_DAYS after `now`, at NUDGE_HOUR local time. */
export function nudgeDate(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + NUDGE_AFTER_DAYS);
  d.setHours(NUDGE_HOUR, 0, 0, 0);
  return d;
}

export function sanitizeReminders(raw: unknown): ReminderState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const days = (Array.isArray(o.days) ? o.days : []).filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-14);
  return { enabled: o.enabled === true, asked: o.asked === true, days };
}
