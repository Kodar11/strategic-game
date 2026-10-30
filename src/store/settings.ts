export interface Settings {
  reduceMotion: boolean;
  haptics: boolean;
  /** Spoken narration and character voices. On for new installs. */
  narration: boolean;
  /** The first-session welcome (one decision against Maya, then a recommended lesson) was finished or skipped here. */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = { reduceMotion: false, haptics: true, narration: true, onboarded: false };

/**
 * Keep only known boolean settings from a saved state; anything missing or malformed gets its default.
 * A save from before onboarding existed belongs to someone who already uses the app, so it counts as onboarded.
 */
export function sanitizeSettings(saved: unknown): Settings {
  const isSave = !!saved && typeof saved === 'object';
  const s = isSave ? (saved as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SETTINGS, onboarded: isSave };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (typeof s[key] === 'boolean') out[key] = s[key] as boolean;
  }
  return out;
}
