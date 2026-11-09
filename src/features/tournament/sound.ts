import { createAudioPlayer } from 'expo-audio';

import { useProgress } from '@/src/store/progress';

/**
 * Short sound cues for the Tournament's big moments, reusing the effects composed for the Stories (no new audio
 * files). Played only when the "Game sounds" setting is on, quietly, and never over narration of their own:
 * each cue is a one-shot player released after it finishes. A device that can't play simply stays silent.
 */
const CUES = {
  /** A match won. */
  win: { source: require('@/assets/audio/stories/meridian/sfx/accord.mp3'), ms: 1600 },
  /** A rival beaten in their duel, or a stage cleared. */
  defeated: { source: require('@/assets/audio/stories/meridian/sfx/crown.mp3'), ms: 2200 },
  /** A match lost. */
  loss: { source: require('@/assets/audio/stories/meridian/sfx/slip.mp3'), ms: 500 },
  /** A key card earned. */
  unlock: { source: require('@/assets/audio/stories/meridian/sfx/share.mp3'), ms: 1200 },
} as const;

export type Cue = keyof typeof CUES;

export function playCue(cue: Cue): void {
  if (!useProgress.getState().settings.sounds) return;
  try {
    const { source, ms } = CUES[cue];
    const player = createAudioPlayer(source);
    player.volume = 0.55;
    player.play();
    setTimeout(() => {
      try {
        player.remove();
      } catch {
        // Already released.
      }
    }, ms + 500);
  } catch {
    // No audio on this device or platform: the moment still shows, silently.
  }
}
