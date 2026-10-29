import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { IconButton } from '@/src/components/ui/Button';
import { SectionLabel } from '@/src/components/ui/Card';
import { ChartNoAxesColumn, Settings } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { useEnter } from '@/src/components/lesson/motion';
import { GameRecordCard } from '@/src/features/games/ui/GameRecordCard';
import { AreaList, GrowthCard, LearningProgressCard, LinkRow, RecommendationCard, openArea } from '@/src/features/learning/ui/JourneyParts';
import { GoalControl } from '@/src/features/learning/ui/ProfileParts';
import { useJourney } from '@/src/features/learning/useProfile';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

/**
 * Strategic Thinking Profile — a deliberate summary, not a compressed report:
 * 1. Learning progress: lessons completed, one bar, one sentence (opens the detailed report).
 * 2. At most one growth observation, with its evidence (opens that area).
 * 3. One recommended next step, with the optional goal.
 * 4. All four areas, each opening its own breakdown.
 * Everything deeper — accuracy, confidence, progress over time, every answer — is in app/report.tsx.
 * Content comes from src/features/learning/journey.ts; thresholds from evidence-policy.ts. The game record stays
 * separate at the foot and never feeds a learning measure.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const enter = useEnter();
  const { hydrated, summary, goal, journey } = useJourney();

  if (!hydrated) return <MessageScreen loading />;
  const { progress, growth, recommendation, areas } = journey;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      {/* Pinned above the scroll, so Settings stays in reach on a long profile */}
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <View style={[styles.column, styles.headerRow]}>
          <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            Your strategic thinking
          </AppText>
          <IconButton icon={Settings} label="Settings" onPress={() => router.navigate('/settings')} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.md, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          <Animated.View entering={enter(0, 'fade')}>
            <LearningProgressCard progress={progress} onPress={() => router.push('/report')} />
          </Animated.View>

          {growth ? (
            <Animated.View entering={enter(60, 'fade')}>
              <GrowthCard growth={growth} onPress={() => openArea(growth.skill)} />
            </Animated.View>
          ) : null}

          <Animated.View entering={enter(120, 'fade')}>
            <RecommendationCard rec={recommendation}>
              <GoalControl goal={goal} />
            </RecommendationCard>
          </Animated.View>

          <View>
            <SectionLabel>Areas you’re exploring</SectionLabel>
            <AreaList areas={areas} />
          </View>

          {summary.hasActivity ? (
            <LinkRow icon={ChartNoAxesColumn} title="Detailed report" subtitle="Accuracy, confidence, progress over time and every answer" onPress={() => router.push('/report')} />
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
  header: { paddingHorizontal: space.lg, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
