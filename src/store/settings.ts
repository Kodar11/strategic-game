/**
 * The player's choice about optional analytics and diagnostics (src/observability):
 * - `unset`: not asked yet, or not answered. Nothing is collected.
 * - `granted`: the player chose "Share". Pseudonymous product events and crash reports are sent.
 * - `denied`: the player chose "Not now" or switched it off. Nothing is collected.
 * Only `granted` allows collection. Consent is never inferred from a default.
 */
export type UsageConsent = 'unset' | 'granted' | 'denied';

export interface Settings {
  reduceMotion: boolean;
  haptics: boolean;
  /** Spoken narration and character voices. On for new installs. */
  narration: boolean;
  /** Short sound cues on tournament wins, losses, rivals beaten and key cards. On for new installs. */
  sounds: boolean;
  /** The first-session welcome (one decision against Maya, then a recommended lesson) was finished or skipped here. */
  onboarded: boolean;
  /**
   * "Share usage and crash data". A device preference, so it survives signing out, switching accounts
   * and deleting the account. Asked once after onboarding (UsageConsentCard), changeable in Settings at any time.
   */
  usageConsent: UsageConsent;
}

export const DEFAULT_SETTINGS: Settings = { reduceMotion: false, haptics: true, narration: true, sounds: true, onboarded: false, usageConsent: 'unset' };

const BOOLEAN_KEYS = ['reduceMotion', 'haptics', 'narration', 'sounds', 'onboarded'] as const;

/**
 * The consent stored by a save, including saves from before `usageConsent` existed. Those had a boolean
 * `shareUsageData` whose default was `true`:
 * - `true` is what every install had without ever being asked, so it is NOT a choice: it becomes `unset`.
 * - `false` could only come from the player switching it off, so it is an explicit refusal: `denied`.
 */
export function consentFromSave(s: Record<string, unknown>): UsageConsent {
  const v = s.usageConsent;
  if (v === 'unset' || v === 'granted' || v === 'denied') return v;
  if (s.shareUsageData === false) return 'denied';
  return 'unset';
}

/**
 * Keep only known settings from a saved state; anything missing or malformed gets its default.
 * A save from before onboarding existed belongs to someone who already uses the app, so it counts as onboarded.
 */
export function sanitizeSettings(saved: unknown): Settings {
  const isSave = !!saved && typeof saved === 'object';
  const s = isSave ? (saved as Record<string, unknown>) : {};
  const out: Settings = { ...DEFAULT_SETTINGS, onboarded: isSave };
  for (const key of BOOLEAN_KEYS) {
    if (typeof s[key] === 'boolean') out[key] = s[key] as boolean;
  }
  out.usageConsent = consentFromSave(s);
  return out;
}
