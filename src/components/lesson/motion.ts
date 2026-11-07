import { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useMotionReduced } from '@/src/utils/feedback';

/** The longest a staggered item waits: content is on screen almost at once, so a screen never feels slow to fill. */
const MAX_DELAY_MS = 140;

/**
 * Entering animation for staggered content; returns undefined when motion is reduced.
 *
 * Short, timing-based and capped: a spring per element (and delays of up to half a second) made every screen keep
 * animating well after it arrived, competing with the navigation transition. Callers' delays keep their order but are
 * compressed, so a stagger still reads as one.
 */
export function useEnter() {
  const reduced = useMotionReduced();
  return (delay = 0, kind: 'rise' | 'fade' = 'rise') => {
    if (reduced) return undefined;
    const d = Math.min(Math.round(delay * 0.35), MAX_DELAY_MS);
    const base = kind === 'rise' ? FadeInDown.duration(220).withInitialValues({ transform: [{ translateY: 8 }] }) : FadeIn.duration(180);
    return base.delay(d);
  };
}
