import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ArrowLeft, type LucideIcon } from '@/src/components/ui/icons';
import type { LessonId } from '@/src/content/lessons';
import { allGoals, type GoalId } from '@/src/features/learning/records';
import { useProgress } from '@/src/store/progress';
import { colors, space } from '@/src/theme/tokens';

/** Building blocks shared by the profile and the detailed report (more in JourneyParts.tsx). Copy comes from journey.ts / profile.ts. */

export function openLesson(id: LessonId) {
  router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: id } });
}

/** Back button + title, for screens pushed above the tabs. */
export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  return (
    <View style={{ gap: space.xs }}>
      <View style={styles.headRow}>
        <IconButton icon={ArrowLeft} label="Back" onPress={close} />
        <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </AppText>
      </View>
      {subtitle ? (
        <AppText variant="small" color={colors.textMuted}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

/** Muted, small: how much a measure can be read into. */
export function EvidenceCaption({ text }: { text: string }) {
  return (
    <AppText variant="caption" color={colors.textMuted}>
      {text}
    </AppText>
  );
}

const goalLabel = (goal: GoalId) => allGoals().find((g) => g.id === goal)?.label ?? goal;

/**
 * The optional goal, as one inline line under the next step. Choosing one puts its area first in the next step;
 * "No specific goal yet" removes it. Uses the existing `setGoal` store action.
 */
export function GoalControl({ goal }: { goal: GoalId | null }) {
  const setGoal = useProgress((s) => s.setGoal);
  const [open, setOpen] = useState(false);
  const active = goal !== null && goal !== 'none';
  return (
    <View style={styles.goal}>
      <View style={styles.goalRow}>
        <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
          {active ? `Prioritising your goal: ${goalLabel(goal)}` : 'Want to focus on one area? A goal puts it first here.'}
        </AppText>
        <Button
          label={open ? 'Close' : active ? 'Change goal' : 'Choose a goal'}
          variant="ghost"
          compact
          onPress={() => setOpen((v) => !v)}
          accessibilityHint="Optional. Changes which area your next step focuses on."
        />
      </View>
      {open ? (
        <View accessibilityRole="radiogroup" accessibilityLabel="What would you like to get better at?" style={{ gap: space.sm }}>
          {allGoals().map((g) => (
            <View key={g.id} style={{ flexDirection: 'row' }}>
              <ChoiceCard
                compact
                title={g.label}
                selected={goal === g.id}
                onSelect={() => {
                  setGoal(g.id);
                  setOpen(false);
                }}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A titled section of the detailed report. */
export function ReportSection({ title, icon: Icon, children, footnote }: { title: string; icon?: LucideIcon; children: ReactNode; footnote?: string }) {
  return (
    <Card style={{ gap: space.sm }}>
      <View style={styles.inlineIcon}>
        {Icon ? <Icon size={16} color={colors.textMuted} /> : null}
        <SectionLabel>{title}</SectionLabel>
      </View>
      {children}
      {footnote ? <EvidenceCaption text={footnote} /> : null}
    </Card>
  );
}

/** A label with a count on the right, for report rows. */
export function StatRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.statRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="small" color={strong ? colors.text : colors.textBody} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="small" weight={strong ? 'semibold' : 'regular'} color={colors.text} tabular>
        {value}
      </AppText>
    </View>
  );
}

/** Body text that explains a measure or an insight inside a report section. */
export function Note({ children, muted }: { children: string; muted?: boolean }) {
  return (
    <AppText variant="small" color={muted ? colors.textMuted : colors.textBody}>
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inlineIcon: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  goal: { gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: 'rgba(147,180,248,0.2)' },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
});
