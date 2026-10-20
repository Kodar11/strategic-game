import { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useMotionReduced } from '@/src/utils/feedback';

/** Entering animation for staggered content; returns undefined when motion is reduced. */
export function useEnter() {
  const reduced = useMotionReduced();
  return (delay = 0, kind: 'rise' | 'fade' = 'rise') => {
    if (reduced) return undefined;
    const base = kind === 'rise' ? FadeInDown.springify().damping(20).stiffness(180) : FadeIn.duration(260);
    return base.delay(delay);
  };
}
