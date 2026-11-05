import { AppState, Platform } from 'react-native';

import { reportError } from '@/src/observability/api';
import { useProgress } from '@/src/store/progress';
import { AUDIO_ASSETS } from './audio-manifest';
import { NarrationController } from './controller';
import { createExpoBackend } from './expoBackend';

/** The app's one narration controller. Lessons talk to it through the hooks in useNarration.tsx. */
export const narration = new NarrationController({
  createBackend: createExpoBackend,
  resolveAsset: (clip) => AUDIO_ASSETS[clip],
  // A clip that can't play (once per clip per launch; the lesson carries on in text). Reported as a warning, at most a
  // few times per session (src/observability/core.ts).
  onWarn: (m) => {
    if (__DEV__) console.warn(m);
    reportError('audio_failed', new Error(m), { operation: 'narration' }, 'warning');
  },
});

// The mute preference lives in the persisted progress store; mirror it here and react immediately.
narration.setMuted(!useProgress.getState().settings.narration);
useProgress.subscribe((state, prev) => {
  if (state.settings.narration !== prev.settings.narration) narration.setMuted(!state.settings.narration);
});

// Never keep talking after the app leaves the foreground. (Skipped during static web rendering.)
if (Platform.OS !== 'web' || typeof window !== 'undefined') {
  AppState.addEventListener('change', (status) => {
    if (status !== 'active') narration.stop();
  });
}
