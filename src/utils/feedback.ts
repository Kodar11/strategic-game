import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useProgress } from '@/src/store/progress';

const canVibrate = Platform.OS === 'ios' || Platform.OS === 'android';

function enabled() {
  return canVibrate && useProgress.getState().settings.haptics;
}

/** Haptics are used sparingly: selections, commits and milestones only. */
export const haptic = {
  select() {
    if (enabled()) Haptics.selectionAsync().catch(() => undefined);
  },
  commit() {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  },
  success() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};

/** True when the system or the in-app setting asks for reduced motion. */
export function useMotionReduced(): boolean {
  const system = useReducedMotion();
  const setting = useProgress((s) => s.settings.reduceMotion);
  return system || setting;
}
