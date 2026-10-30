import { DEFAULT_LEVELS } from './mixer.ts';

/** The player's saved story sound levels. Pure, so validation is tested. */
export interface StoryAudioPrefs {
  voice: number;
  music: number;
  ambience: number;
  sfx: number;
  muted: boolean;
}

export const DEFAULT_PREFS: StoryAudioPrefs = { voice: 1, music: DEFAULT_LEVELS.music, ambience: DEFAULT_LEVELS.ambience, sfx: DEFAULT_LEVELS.sfx, muted: false };

const unit = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : fallback);

export function sanitizePrefs(raw: unknown): StoryAudioPrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { voice: unit(o.voice, DEFAULT_PREFS.voice), music: unit(o.music, DEFAULT_PREFS.music), ambience: unit(o.ambience, DEFAULT_PREFS.ambience), sfx: unit(o.sfx, DEFAULT_PREFS.sfx), muted: o.muted === true };
}
