/**
 * Pure rules for saved matches (src/features/resume/store.ts): which entries are valid and fresh, and how a play
 * screen's params map to a slot. No React Native imports, so the tests run in Node.
 */

export const APP_BUILD_FALLBACK = 'dev';
export const RESUME_TTL_MS = 24 * 60 * 60 * 1000;

export type ResumeSystem = 'arena' | 'classic';
export type ResumeContext = 'practice' | 'tournament' | 'gauntlet';

export interface SavedMatch {
  system: ResumeSystem;
  game: string;
  context: ResumeContext;
  /** The play screen's route params, exactly: a match resumes only on the same params. */
  params: Record<string, string>;
  seed: number;
  /** Arena: the player's actions in order. Classic: the practice driver's own state (rounds, read, hidden bot). */
  inputs: unknown;
  /** The opponent prediction locked so far (Arena), or null. */
  guess: string | null;
  played: number;
  total: number;
  savedAt: number;
  build: string;
}


export const slotOf = (system: ResumeSystem, game: string, context: ResumeContext) => `${system}:${game}:${context}`;
export const contextOf = (p: { t?: string; g?: string }): ResumeContext => (p.t ? 'tournament' : p.g ? 'gauntlet' : 'practice');

/** Route params as saved: strings only, sorted, so two visits to the same setup compare equal. */
export function cleanParams(p: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(p).sort()) {
    const v = p[k];
    if (typeof v === 'string' && v !== '') out[k] = v;
  }
  return out;
}

export const sameParams = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/** Whether a saved match may still be resumed now. */
export function isFresh(m: SavedMatch, now: number, build: string): boolean {
  return m.build === build && now - m.savedAt >= 0 && now - m.savedAt < RESUME_TTL_MS && m.played < m.total;
}

function valid(x: unknown): x is SavedMatch {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  return (
    (m.system === 'arena' || m.system === 'classic') &&
    typeof m.game === 'string' &&
    (m.context === 'practice' || m.context === 'tournament' || m.context === 'gauntlet') &&
    !!m.params &&
    typeof m.params === 'object' &&
    Object.values(m.params as object).every((v) => typeof v === 'string') &&
    typeof m.seed === 'number' &&
    Number.isFinite(m.seed) &&
    (m.guess === null || typeof m.guess === 'string') &&
    typeof m.played === 'number' &&
    typeof m.total === 'number' &&
    typeof m.savedAt === 'number' &&
    typeof m.build === 'string'
  );
}

/** Reads a stored blob, keeping only valid, fresh entries. */
export function parseSaved(raw: string | null, now: number, build: string): Record<string, SavedMatch> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') return {};
    const out: Record<string, SavedMatch> = {};
    for (const [slot, m] of Object.entries(data as Record<string, unknown>)) {
      if (valid(m) && slotOf(m.system, m.game, m.context) === slot && isFresh(m, now, build)) out[slot] = m;
    }
    return out;
  } catch {
    return {};
  }
}
