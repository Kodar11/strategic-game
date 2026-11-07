import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Star } from '@/src/components/ui/icons';
import type { Rival, RivalTone } from '@/src/tournament/schema';
import { colors, radius, space } from '@/src/theme/tokens';

/** A rival's colours, from the app's semantic palette. */
export function toneColors(tone: RivalTone): { fg: string; soft: string; solid: string } {
  switch (tone) {
    case 'orange':
      return { fg: colors.rivalText, soft: colors.rivalSoft, solid: colors.rival };
    case 'amber':
      return { fg: colors.insight, soft: colors.insightSoft, solid: colors.insight };
    case 'cyan':
      return { fg: colors.accent, soft: colors.accentSoft, solid: colors.accent };
    case 'success':
      return { fg: colors.success, soft: colors.successSoft, solid: colors.success };
    default:
      return { fg: colors.primaryText, soft: colors.primarySoft, solid: colors.primary };
  }
}

/** The rival's mark: their initial in a ringed disc. Dimmed while their stage is locked. */
export function RivalMark({ rival, size = 44, dim = false, done = false }: { rival: Rival; size?: number; dim?: boolean; done?: boolean }) {
  const t = toneColors(rival.tone);
  const initial = rival.name.replace(/^The\s+/i, '').charAt(0).toUpperCase();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: dim ? colors.border : t.solid,
        backgroundColor: done ? t.solid : dim ? colors.bgRaised : t.soft,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dim ? 0.6 : 1,
      }}>
      <AppText variant={size >= 52 ? 'title' : 'bodyStrong'} color={done ? colors.bg : dim ? colors.textFaint : t.fg}>
        {initial}
      </AppText>
    </View>
  );
}

/** Up to three stars, filled for each one earned. */
export function StarRow({ count, max = 3, size = 14 }: { count: number; max?: number; size?: number }) {
  return (
    <View style={styles.stars} accessible accessibilityLabel={`${count} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} size={size} color={i < count ? colors.insight : colors.slateDot} fill={i < count ? colors.insight : 'transparent'} strokeWidth={2} />
      ))}
    </View>
  );
}

/** A thin progress bar. */
export function ProgressBar({ value, max, color = colors.primary }: { value: number; max: number; color?: string }) {
  const share = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

/** A small label in the stage's tone. */
export function Kicker({ children, tone }: { children: string; tone: RivalTone }) {
  return (
    <AppText variant="overline" color={toneColors(tone).fg}>
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: 2 },
  track: { height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceHigh, overflow: 'hidden', marginTop: space.xs },
  fill: { height: '100%', borderRadius: radius.pill },
});
