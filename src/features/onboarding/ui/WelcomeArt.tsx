import { type ReactNode, memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { useMotionReduced } from '@/src/utils/feedback';
import { colors, palette } from '@/src/theme/tokens';

const W = 280;
const H = 200;
const ROOT = { x: 140, y: 178 };
const LEFT = { x: 80, y: 114 };
const RIGHT = { x: 200, y: 114 };
const LEAVES = [
  { x: 40, y: 46, from: LEFT, color: palette.cyan },
  { x: 110, y: 30, from: LEFT, color: palette.blue },
  { x: 170, y: 30, from: RIGHT, color: palette.amber },
  { x: 240, y: 46, from: RIGHT, color: palette.orange },
];

const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => `M${a.x} ${a.y} Q${a.x} ${(a.y + b.y) / 2} ${b.x} ${b.y}`;

function Layer({ delay, children, reduced }: { delay: number; children: ReactNode; reduced: boolean }) {
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(420).delay(delay)} style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

/**
 * The welcome's focal point: one decision branching into two contrasting paths (blue and orange), each branching
 * again. The tiers fade in from the root up, then the two choice nodes breathe slowly. Static with reduced motion.
 */
function WelcomeArtView() {
  const reduced = useMotionReduced();
  const glow = useSharedValue(reduced ? 0.6 : 0);

  useEffect(() => {
    if (reduced) {
      glow.set(0.6);
      return;
    }
    glow.set(withRepeat(withTiming(1, { duration: 1800 }), -1, true));
    return () => cancelAnimation(glow);
  }, [reduced, glow]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + glow.get() * 0.5 }));

  return (
    <View style={styles.frame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Layer delay={0} reduced={reduced}>
        <Path d={curve(ROOT, LEFT)} stroke={palette.blue} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Path d={curve(ROOT, RIGHT)} stroke={palette.orange} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Circle cx={ROOT.x} cy={ROOT.y} r={13} fill={colors.surface} stroke={palette.light} strokeWidth={2.5} />
        <Circle cx={ROOT.x} cy={ROOT.y} r={4.5} fill={palette.light} />
      </Layer>
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          <Circle cx={LEFT.x} cy={LEFT.y} r={24} fill={palette.blue} fillOpacity={0.28} />
          <Circle cx={RIGHT.x} cy={RIGHT.y} r={24} fill={palette.orange} fillOpacity={0.24} />
        </Svg>
      </Animated.View>
      <Layer delay={260} reduced={reduced}>
        {LEAVES.map((l) => (
          <Path key={`${l.x}`} d={curve(l.from, l)} stroke={l.color} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="4 5" fill="none" strokeLinecap="round" />
        ))}
        <Circle cx={LEFT.x} cy={LEFT.y} r={11} fill={palette.blue} />
        <Circle cx={RIGHT.x} cy={RIGHT.y} r={11} fill={palette.orange} />
      </Layer>
      <Layer delay={520} reduced={reduced}>
        {LEAVES.map((l) => (
          <Circle key={`${l.x}`} cx={l.x} cy={l.y} r={7} fill={colors.bg} stroke={l.color} strokeWidth={2.5} />
        ))}
      </Layer>
    </View>
  );
}

// Memoized: it has no props, so it never needs to re-render with the screen.
export const WelcomeArt = memo(WelcomeArtView);

const styles = StyleSheet.create({
  frame: { width: '100%', maxWidth: 300, aspectRatio: W / H, alignSelf: 'center' },
});
