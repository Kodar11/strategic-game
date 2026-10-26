export interface Settings {
  reduceMotion: boolean;
  haptics: boolean;
  /** Spoken narration and character voices. On for new installs. */
  narration: boolean;
}

export const DEFAULT_SETTINGS: Settings = { reduceMotion: false, haptics: true, narration: true };

/** Keep only known boolean settings from a saved state; anything missing or malformed gets its default. */
export function sanitizeSettings(saved: unknown): Settings {
  const s = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (typeof s[key] === 'boolean') out[key] = s[key] as boolean;
  }
  return out;
}
