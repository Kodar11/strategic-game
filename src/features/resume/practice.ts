import type { ReadLock } from '@/src/games/reads';
import type { OpponentMode } from '@/src/games/rps-insight';

/** The practice driver's whole state: saved after every round so a match can be continued (src/features/resume). */
export interface PracticeSnapshot {
  seed: number;
  bot: string;
  mode: OpponentMode;
  rounds: unknown[];
  read: ReadLock | null;
  revealed: boolean;
}

/**
 * A saved practice snapshot, if it still fits: a bot this game has (the chosen one, when the player chose), fewer
 * rounds than a match, nothing revealed yet. Anything else starts a fresh match.
 */
export function restorePractice(bots: readonly string[], rounds: number, choice: string | null, x: unknown): PracticeSnapshot | null {
  if (!x || typeof x !== 'object') return null;
  const s = x as Partial<PracticeSnapshot>;
  const mode = s.mode === 'chosen' || s.mode === 'mystery' ? s.mode : null;
  if (!mode || typeof s.seed !== 'number' || !Number.isFinite(s.seed) || typeof s.bot !== 'string' || !bots.includes(s.bot)) return null;
  if ((mode === 'chosen') !== (choice !== null) || (choice !== null && s.bot !== choice)) return null;
  if (!Array.isArray(s.rounds) || s.rounds.length === 0 || s.rounds.length >= rounds || s.rounds.some((r) => !r || typeof r !== 'object')) return null;
  const read = s.read === null || s.read === undefined ? null : typeof s.read === 'object' && typeof (s.read as ReadLock).guess === 'string' ? (s.read as ReadLock) : undefined;
  if (read === undefined || s.revealed) return null;
  return { seed: s.seed, bot: s.bot, mode, rounds: s.rounds, read, revealed: false };
}
