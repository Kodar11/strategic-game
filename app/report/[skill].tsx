import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChevronRight, CircleCheck, ListOrdered } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import type { EvidenceLevel } from '@/src/features/learning/evidence-policy';
import { answerHistory, areaNext, areaTrend } from '@/src/features/learning/journey';
import { allSkills, type SkillArea } from '@/src/features/learning/records';
import { areaDetail } from '@/src/features/learning/summary';
import { LinkRow, ProgressBar, RESULT, RecommendationCard } from '@/src/features/learning/ui/JourneyParts';
import { EvidenceCaption, ScreenHeader, openLesson } from '@/src/features/learning/ui/ProfileParts';
import { useJourney } from '@/src/features/learning/useProfile';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

/** Recent first attempts shown here; the rest are one tap away in the answer history. */
const RECENT = 5;

const LEVEL_NOTE: Record<EvidenceLevel, string> = {
  none: 'No answers in this area yet. The lessons below practise it.',
  activity: 'Too few first attempts to describe a pattern yet.',
  tentative: 'Early evidence — a few more first attempts will show whether this pattern holds.',
  established: 'Enough first attempts to describe how they’ve gone. Still a record of answers, not a measure of ability.',
};

/**
 * One area in detail: lessons completed (activity) and first attempts matched (evidence) side by side, any change
 * over time, the next thing to do in this area, the most recent answers, and every lesson that practises it.
 */
export default function AreaReportScreen() {
  const insets = useSafeAreaInsets();
  const { skill } = useLocalSearchParams<{ skill: string }>();
  const { hydrated, profile, attempts, completed, inProgress, journey } = useJourney();
  const known = allSkills().some((s) => s.id === skill);
  const area = skill as SkillArea;
  const extra = useMemo(
    () =>
      known
        ? {
            detail: areaDetail(profile, area, { attempts, completed }),
            trend: areaTrend(profile, area),
            next: areaNext(area, { attempts, completed, inProgress }),
            recent: answerHistory(profile, attempts, area).slice(0, RECENT),
          }
        : null,
    [known, profile, area, attempts, completed, inProgress],
  );

  if (!hydrated) return <MessageScreen loading />;
  const card = journey.areas.find((a) => a.id === skill);
  if (!extra?.detail || !card) return <MessageScreen title="Area not found" body="This skill area doesn’t exist." />;
  const { detail, trend, next, recent } = extra;
  const total = detail.attempts.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <ScreenHeader title={card.label} subtitle={card.description} />

          <Card style={{ gap: space.lg }}>
            <View style={{ gap: space.sm }} accessible accessibilityLabel={`${card.lessons.done} of ${card.lessons.total} lessons in this area completed.`}>
              <View style={styles.row}>
                <AppText variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                  Lessons completed
                </AppText>
                <AppText variant="small" weight="semibold" tabular>
                  {card.lessons.done} of {card.lessons.total}
                </AppText>
              </View>
              <ProgressBar value={card.lessons.total ? card.lessons.done / card.lessons.total : 0} />
            </View>
            <View style={{ gap: space.xs }}>
              <View style={styles.row}>
                <AppText variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                  First attempts
                </AppText>
                <AppText variant="small" weight="semibold" tabular>
                  {card.judged ? `${card.matched} of ${card.judged} matched` : '—'}
                </AppText>
              </View>
              <EvidenceCaption text={LEVEL_NOTE[card.level]} />
            </View>
            {trend.ready ? (
              <View style={styles.trend} accessible accessibilityLabel={`Earlier first attempts: ${trend.earlier.matched} of ${trend.earlier.judged}. Recent: ${trend.later.matched} of ${trend.later.judged}.`}>
                <AppText variant="small" color={colors.textBody}>
                  {trend.direction === 'higher'
                    ? 'Your recent first attempts here matched more often than your earlier ones.'
                    : trend.direction === 'lower'
                      ? 'Your recent first attempts here matched less often than your earlier ones — later questions may be harder.'
                      : 'Your earlier and recent first attempts here have matched at similar rates.'}
                </AppText>
                <AppText variant="caption" color={colors.textMuted} tabular>
                  Earlier {trend.earlier.matched} of {trend.earlier.judged} · Recent {trend.later.matched} of {trend.later.judged} · different questions, so a rough signal
                </AppText>
              </View>
            ) : null}
          </Card>

          {next ? <RecommendationCard rec={next} kicker="Next in this area" /> : null}

          {recent.length ? (
            <View>
              <SectionLabel>Recent first attempts</SectionLabel>
              <Card style={{ gap: space.md }}>
                {recent.map((a) => {
                  const r = RESULT[a.result];
                  return (
                    <View key={a.id} style={styles.attempt} accessible accessibilityLabel={`${a.question}. ${r.label}.`}>
                      <r.icon size={18} color={r.color} strokeWidth={2.2} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="small" color={colors.text}>
                          {a.question}
                        </AppText>
                        <AppText variant="caption" color={colors.textMuted}>
                          {r.label}
                        </AppText>
                      </View>
                    </View>
                  );
                })}
              </Card>
              <View style={{ marginTop: space.sm }}>
                <LinkRow
                  icon={ListOrdered}
                  title={total > RECENT ? `All ${total} answers in this area` : 'Answers in detail'}
                  subtitle={detail.retries ? `Including what changed on ${detail.retries === 1 ? 'your retry' : `your ${detail.retries} retries`}` : 'Your answer, confidence and what happened'}
                  onPress={() => router.push({ pathname: '/report/history', params: { skill: area } })}
                />
              </View>
            </View>
          ) : null}

          <View>
            <SectionLabel>Lessons that practise this area</SectionLabel>
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {detail.modules.map((m) => (
                <View key={m.id}>
                  <AppText variant="caption" color={colors.textMuted} style={styles.module}>
                    Module {m.number} · {m.title}
                  </AppText>
                  {m.lessons.map((l) => (
                    <Pressable
                      key={l.id}
                      onPress={() => openLesson(l.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Lesson ${l.number}, ${l.title}${l.completed ? ', completed' : ''}`}
                      style={({ pressed }) => [styles.lesson, pressed && { backgroundColor: colors.surfaceHigh }]}>
                      <AppText variant="caption" color={colors.textMuted} tabular style={styles.lessonNumber}>
                        {l.number}
                      </AppText>
                      <AppText variant="small" color={colors.text} style={{ flex: 1 }}>
                        {l.title}
                      </AppText>
                      {l.completed ? <CircleCheck size={16} color={colors.success} accessibilityLabel="Completed" /> : null}
                      <ChevronRight size={16} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              ))}
            </Card>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  trend: { gap: space.xs, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  attempt: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  module: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.lg },
  lessonNumber: { width: 20 },
});
