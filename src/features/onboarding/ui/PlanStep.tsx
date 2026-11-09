import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, CircleHelp } from '@/src/components/ui/icons';
import { colors, radius, space } from '@/src/theme/tokens';
import { useMotionReduced } from '@/src/utils/feedback';

import type { DailyMinutes, PlanDay } from '../flow';
import { SCRIPT } from '../script';
import { Card, StepKicker } from './parts';

const S = SCRIPT.plan;

/** Part 6: straight answers to the usual doubts, the first week, and the way in. */
export function PlanStep({ days, minutes, replay, onStart, onExplore }: { days: PlanDay[]; minutes: DailyMinutes | null; replay: boolean; onStart: () => void; onExplore: () => void }) {
  const reduced = useMotionReduced();
  const enter = (i: number) => (reduced ? undefined : FadeInDown.delay(120 + i * 140).duration(260));
  return (
    <View style={{ gap: space.xl }}>
      <Animated.View entering={enter(0)} style={{ gap: space.sm }}>
        <StepKicker>{S.kicker}</StepKicker>
        <Card>
          {S.faq.map((f, i) => (
            <View key={f.q} style={[styles.faq, i > 0 && styles.divider]} accessible accessibilityLabel={`${f.q} ${f.a}`}>
              <CircleHelp size={16} color={colors.accent} style={{ marginTop: 3 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">{f.q}</AppText>
                <AppText variant="small" color={colors.textBody}>
                  {f.a}
                </AppText>
              </View>
            </View>
          ))}
        </Card>
      </Animated.View>

      <Animated.View entering={enter(1)} style={{ gap: space.sm }}>
        <AppText variant="title" align="center" accessibilityRole="header">
          {S.weekTitle}
        </AppText>
        {minutes ? (
          <AppText variant="small" color={colors.textMuted} align="center">
            {S.pace(minutes)}
          </AppText>
        ) : null}
        <View style={{ gap: space.sm, marginTop: space.xs }}>
          {days.map((d, i) => (
            <View key={d.when} style={styles.day} accessible accessibilityLabel={`${d.when}: ${d.title}. ${d.detail}`}>
              <View style={[styles.dot, i === 0 && { backgroundColor: colors.primary, borderColor: colors.primary }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="overline" color={i === 0 ? colors.primaryText : colors.textMuted}>
                  {d.when}
                </AppText>
                <AppText variant="bodyStrong">{d.title}</AppText>
                <AppText variant="small" color={colors.textMuted}>
                  {d.detail}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={enter(2)} style={{ gap: space.sm }}>
        <Button label={S.start} icon={ArrowRight} onPress={onStart} accessibilityHint="Opens the first Qualifier match" />
        <Button label={replay ? S.done : S.explore} variant="ghost" onPress={onExplore} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  faq: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  day: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 3, borderWidth: 2, borderColor: colors.borderStrong },
});
