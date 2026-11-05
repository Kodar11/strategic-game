export interface Settings {
  reduceMotion: boolean;
  haptics: boolean;
  /** Spoken narration and character voices. On for new installs. */
  narration: boolean;
  /** The first-session welcome (one decision against Maya, then a recommended lesson) was finished or skipped here. */
  onboarded: boolean;
  /**
   * "Share usage and crash data": pseudonymous product events and crash reports (src/observability). A device
   * preference, so it survives signing out and switching accounts. The default is the release-gate decision recorded
   * in docs/OBSERVABILITY.md; nothing is collected in any build until telemetry is switched on for it.
   */
  shareUsageData: boolean;
}

export const DEFAULT_SETTINGS: Settings = { reduceMotion: false, haptics: true, narration: true, onboarded: false, shareUsageData: true };

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
