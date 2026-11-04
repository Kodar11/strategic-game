import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FlipInYRight, ZoomIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { countUpValues, revealDelays } from './reveal-plan';

/**
 * How many of a reveal's `steps` are showing. Restarts when `revealKey` changes (a new round), and shows everything at
 * once with reduced motion. Each game decides what its steps look like.
 */
export function useRevealStep(revealKey: string | number, steps: number, stepMs = 320, startMs = 0): number {
  const reduced = useMotionReduced();
  const [state, setState] = useState({ key: revealKey, shown: reduced ? steps : 0 });
  useEffect(() => {
    if (reduced) return;
    const timers = revealDelays(steps, stepMs, false, startMs).map((ms, i) => setTimeout(() => setState({ key: revealKey, shown: i + 1 }), ms));
    return () => timers.forEach(clearTimeout);
  }, [revealKey, steps, stepMs, startMs, reduced]);
  if (reduced) return steps;
  return state.key === revealKey ? state.shown : 0;
}

/** A number that climbs to `to` when `revealKey` changes. */
export function CountUp({ to, revealKey, frames = 10, frameMs = 55, render }: { to: number; revealKey: string | number; frames?: number; frameMs?: number; render: (n: number) => ReactNode }) {
  const reduced = useMotionReduced();
  const values = countUpValues(to, frames, reduced);
  const step = useRevealStep(revealKey, values.length, frameMs);
  return <>{render(step === 0 ? 0 : values[step - 1])}</>;
}

export interface SealedSide {
  who: string;
  label: string;
  icon: ReactNode;
  tint: string;
  bg: string;
  /** Points this round, shown once the card is open. */
  points?: string;
}

/**
 * Two sealed choices that turn over together, after a short beat. The default look for simultaneous games; the card
 * content stays each game's own. Text is announced by the verdict below it, so the cards never hold back information.
 */
export function SealedPair({ revealKey, left, right, beatMs = 260, compact }: { revealKey: string | number; left: SealedSide; right: SealedSide; beatMs?: number; compact?: boolean }) {
  const reduced = useMotionReduced();
  const open = useRevealStep(revealKey, 1, beatMs) > 0;
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {[left, right].map((s) => (
        <View key={s.who} style={{ flex: 1 }}>
          {open ? (
            <Animated.View key={`${revealKey}-open`} entering={reduced ? undefined : FlipInYRight.duration(240)} style={[styles.card, compact && styles.cardCompact, { borderColor: s.tint }]}>
              <View style={[styles.icon, compact && styles.iconCompact, { backgroundColor: s.bg }]}>{s.icon}</View>
              <View style={compact ? { flex: 1 } : { alignItems: 'center' }}>
                <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {s.who}
                </AppText>
                <AppText variant="bodyStrong" color={s.tint} numberOfLines={1}>
                  {s.label}
                  {s.points ? <AppText variant="small" color={colors.textBody}>{`  ${s.points}`}</AppText> : null}
                </AppText>
              </View>
            </Animated.View>
          ) : (
            <View style={[styles.card, compact && styles.cardCompact, styles.sealed]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <AppText variant="caption" color={colors.textFaint}>
                {s.who}
              </AppText>
              <AppText variant="heading" color={colors.textFaint}>
                ?
              </AppText>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

/** A stamp or badge that lands once. */
export function Stamp({ revealKey, text, color, rotate = -3 }: { revealKey: string | number; text: string; color: string; rotate?: number }) {
  const reduced = useMotionReduced();
  return (
    <Animated.View key={revealKey} entering={reduced ? undefined : ZoomIn.duration(220).delay(120)} style={{ alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 2, borderColor: color, transform: [{ rotate: `${rotate}deg` }] }}>
      <AppText variant="small" weight="bold" color={color} accessibilityLiveRegion="polite">
        {text}
      </AppText>
    </Animated.View>
  );
}

/** Fades content in with a round. */
export function FadeInOnce({ revealKey, delay = 0, children }: { revealKey: string | number; delay?: number; children: ReactNode }) {
  const reduced = useMotionReduced();
  return (
    <Animated.View key={revealKey} entering={reduced ? undefined : FadeIn.duration(220).delay(delay)}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: space.xs, minHeight: 92, padding: space.sm, borderRadius: radius.lg, borderWidth: 1.5, backgroundColor: colors.bgRaised, justifyContent: 'center' },
  cardCompact: { flexDirection: 'row', minHeight: 56, gap: space.sm, justifyContent: 'flex-start' },
  sealed: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceHigh, borderStyle: 'dashed' },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconCompact: { width: 36, height: 36, borderRadius: 18 },
});
