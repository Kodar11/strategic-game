import { AppState, Platform } from 'react-native';

import { useProgress } from '@/src/store/progress';
import { AUDIO_ASSETS } from './audio-manifest';
import { NarrationController } from './controller';
import { createExpoBackend } from './expoBackend';

/** The app's one narration controller. Lessons talk to it through the hooks in useNarration.tsx. */
export const narration = new NarrationController({
  createBackend: createExpoBackend,
  resolveAsset: (clip) => AUDIO_ASSETS[clip],
  onWarn: __DEV__ ? (m) => console.warn(m) : undefined,
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
