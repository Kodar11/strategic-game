import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ArrowLeft, ArrowRight, ChevronRight, Compass, type LucideIcon, Sprout } from '@/src/components/ui/icons';
import { type LessonId, getLesson } from '@/src/content/lessons';
import type { NextStep } from '@/src/features/learning/profile';
import { allGoals, type GoalId } from '@/src/features/learning/records';
import type { AreaRow, Observation, Snapshot } from '@/src/features/learning/summary';
import { useProgress } from '@/src/store/progress';
import { colors, radius, space } from '@/src/theme/tokens';

/** Building blocks shared by the profile and the detailed report. Copy comes from summary.ts / profile.ts. */

export function openLesson(id: LessonId) {
  router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: id } });
}

export function openNextStep(next: NextStep) {
  if (next.kind === 'challenges') router.push({ pathname: '/challenges/[lessonId]', params: { lessonId: next.lesson } });
  else openLesson(next.lesson);
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

/** Where the learner is and what they have done — one compact card, one headline, no competing statistics. */
export function LearningSnapshot({ snapshot }: { snapshot: Snapshot }) {
  const { lessons, firstAttempts } = snapshot;
  const lessonsLine = `${lessons.completed} of ${lessons.total} lessons completed${lessons.inProgress ? ` · ${lessons.inProgress} in progress` : ''}`;
  return (
    <Card style={{ gap: space.xs }}>
      <AppText variant="overline" color={colors.primaryText}>
        {snapshot.stage}
      </AppText>
      <AppText variant="body" color={colors.text}>
        {snapshot.body}
      </AppText>
      <View style={styles.snapshotMeta}>
        <AppText variant="small" color={colors.textBody} tabular>
          {lessonsLine}
        </AppText>
        {firstAttempts ? (
          <AppText variant="caption" color={colors.textMuted} tabular>
            {firstAttempts.matched} of {firstAttempts.judged} first attempts matched the model
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

/** The one evidence-based observation, with its sample size always visible. */
export function ObservationCard({ observation }: { observation: Observation }) {
  const encouraging = observation.tone === 'encouraging';
  return (
    <View style={styles.observation} accessible accessibilityLabel={`${observation.title}. ${observation.body} ${observation.caption}`}>
      <View style={styles.inlineIcon}>
        <Sprout size={16} color={encouraging ? colors.success : colors.textMuted} strokeWidth={2.2} />
        <AppText variant="small" weight="semibold" color={encouraging ? colors.success : colors.textBody}>
          {observation.title}
        </AppText>
      </View>
      <AppText variant="body" color={colors.text}>
        {observation.body}
      </AppText>
      <EvidenceCaption text={observation.caption} />
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

/** The most prominent interactive element on the profile: one recommendation that opens the real lesson. */
export function NextStepCard({ next, children }: { next: NextStep; children?: ReactNode }) {
  const lesson = getLesson(next.lesson);
  const meta = lesson ? `Lesson ${lesson.number}${next.kind === 'challenges' ? ' · practice challenges' : ` · ${lesson.minutes} min`}` : null;
  return (
    <View style={styles.next}>
      <View style={styles.inlineIcon}>
        <Compass size={16} color={colors.primaryText} strokeWidth={2.2} />
        <AppText variant="overline" color={colors.primaryText}>
          Your next step
        </AppText>
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="heading">{next.title}</AppText>
        {meta ? (
          <AppText variant="caption" color={colors.textMuted} tabular>
            {meta}
          </AppText>
        ) : null}
      </View>
      <AppText variant="small" color={colors.textBody}>
        {next.body}
      </AppText>
      <Button label={next.cta} icon={ArrowRight} onPress={() => openNextStep(next)} />
      {children}
    </View>
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

/** One explored area: name, one raw measure and its evidence level (in words, not colour). Tapping opens it. */
export function SkillAreaRow({ row, onPress, last }: { row: AreaRow; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.label}. ${row.measure}. ${row.caption}.`}
      accessibilityHint="Opens the lessons and answers behind this area"
      style={({ pressed }) => [styles.area, !last && styles.areaDivider, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="small" weight="semibold" color={colors.text}>
          {row.label}
        </AppText>
        <AppText variant="small" color={colors.textBody} tabular>
          {row.measure}
        </AppText>
      </View>
      <AppText variant="caption" color={colors.textMuted} style={styles.areaCaption}>
        {row.caption}
      </AppText>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
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
  snapshotMeta: { gap: 2, marginTop: space.xs, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  observation: { gap: space.xs, paddingHorizontal: space.xs },
  next: { gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  goal: { gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: 'rgba(147,180,248,0.2)' },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  area: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingVertical: space.sm, paddingHorizontal: space.lg },
  areaDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  areaCaption: { maxWidth: 96, textAlign: 'right' },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
});
