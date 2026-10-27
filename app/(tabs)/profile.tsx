import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChartNoAxesColumn } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { GameRecordCard } from '@/src/features/games/ui/GameRecordCard';
import { GoalControl, LearningSnapshot, NextStepCard, ObservationCard, SkillAreaRow } from '@/src/features/learning/ui/ProfileParts';
import { useProfile } from '@/src/features/learning/useProfile';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

/**
 * Strategic Thinking Profile, in three layers:
 * 1. The glance: a learning snapshot, at most one evidence-based observation and one next step.
 * 2. The areas the learner has actually explored, each opening its own breakdown.
 * 3. "View detailed report" for first attempts, feedback, transfer, confidence and trends (app/report.tsx).
 * What is shown, and how cautiously, is decided in src/features/learning/summary.ts from the profile in
 * profile.ts; the thresholds are in evidence-policy.ts. The game record stays separate, below the learning.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { hydrated, profile, summary, goal } = useProfile();

  if (!hydrated) return <MessageScreen loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          <AppText variant="title" accessibilityRole="header">
            Your strategic thinking
          </AppText>

          <LearningSnapshot snapshot={summary.snapshot} />
          {summary.observation ? <ObservationCard observation={summary.observation} /> : null}
          <NextStepCard next={profile.next}>
            <GoalControl goal={goal} />
          </NextStepCard>

          {summary.areas.length ? (
            <View style={{ gap: space.xs }}>
              <SectionLabel>What you’re exploring</SectionLabel>
              <Card padded={false} style={{ overflow: 'hidden' }}>
                {summary.areas.map((row, i) => (
                  <SkillAreaRow key={row.id} row={row} last={i === summary.areas.length - 1} onPress={() => router.push({ pathname: '/report/[skill]', params: { skill: row.id } })} />
                ))}
              </Card>
              <AppText variant="caption" color={colors.textMuted}>
                Counts the first answer to each question you could work out from the information given.
              </AppText>
            </View>
          ) : null}

          {summary.hasActivity ? (
            <Button label="View detailed report" variant="secondary" icon={ChartNoAxesColumn} iconPosition="left" onPress={() => router.push('/report')} />
          ) : null}

          {/* Games: a separate, competitive record — never mixed into the learning measures above */}
          <GameRecordCard />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
});
