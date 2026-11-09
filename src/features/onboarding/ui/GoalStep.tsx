import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, Check } from '@/src/components/ui/icons';
import type { GoalId } from '@/src/features/learning/records';
import { colors, radius, space } from '@/src/theme/tokens';
import { haptic } from '@/src/utils/feedback';

import { DAILY_MINUTES, type DailyMinutes } from '../flow';
import { SCRIPT } from '../script';
import { SCENE_ICON, StepKicker } from './parts';

const S = SCRIPT.goal;

/** Part 4: one goal (the app's learning goal) and a daily pace. Both answers shape the plan. */
export function GoalStep({ goal, minutes, onGoal, onMinutes, onNext }: { goal: GoalId | null; minutes: DailyMinutes | null; onGoal: (g: GoalId) => void; onMinutes: (m: DailyMinutes) => void; onNext: () => void }) {
  return (
    <View style={{ gap: space.xl }}>
      <View style={{ gap: space.sm }}>
        <StepKicker>{S.kicker}</StepKicker>
        <AppText variant="title" align="center" accessibilityRole="header">
          {S.title}
        </AppText>
      </View>

      <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
        {S.options.map((o) => {
          const on = goal === o.id;
          const Icon = SCENE_ICON[o.icon];
          return (
            <Pressable
              key={o.id}
              onPress={() => {
                haptic.select();
                onGoal(o.id);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${o.label}. ${o.detail}`}
              style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && !on && { backgroundColor: colors.surfaceHigh }]}>
              <Icon size={22} color={on ? colors.primaryText : colors.textMuted} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">{o.label}</AppText>
                <AppText variant="small" color={colors.textMuted}>
                  {o.detail}
                </AppText>
              </View>
              <View style={[styles.tick, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>{on ? <Check size={14} color={colors.text} strokeWidth={3} /> : null}</View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: space.sm }}>
        <AppText variant="overline" color={colors.textMuted} align="center">
          {S.timeTitle}
        </AppText>
        <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
          {DAILY_MINUTES.map((m) => {
            const on = minutes === m;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  haptic.select();
                  onMinutes(m);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${S.minutes[m]} a day`}
                style={({ pressed }) => [styles.pill, on && styles.optionOn, pressed && !on && { backgroundColor: colors.surfaceHigh }]}>
                <AppText variant="bodyStrong" color={on ? colors.text : colors.textBody}>
                  {S.minutes[m]}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button label={S.next} icon={ArrowRight} disabled={!goal || !minutes} onPress={onNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  pill: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
});
