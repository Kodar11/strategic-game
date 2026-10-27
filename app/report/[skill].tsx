import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChevronRight, CircleCheck, CircleDashed, CircleX, type LucideIcon, Minus } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { getLesson } from '@/src/content/lessons';
import type { EvidenceLevel } from '@/src/features/learning/evidence-policy';
import { allSkills, type SkillArea } from '@/src/features/learning/records';
import { type AttemptResult, areaDetail } from '@/src/features/learning/summary';
import { EvidenceCaption, ScreenHeader, openLesson } from '@/src/features/learning/ui/ProfileParts';
import { useProfile } from '@/src/features/learning/useProfile';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

/** Shown first; older first attempts are summarised in one line. */
const MAX_LISTED = 12;

const LEVEL_NOTE: Record<EvidenceLevel, string> = {
  none: 'No answers in this area yet. The lessons below practise it.',
  activity: 'Not enough first attempts to describe a pattern yet.',
  tentative: 'Early evidence — a few more first attempts will show whether this pattern holds.',
  established: 'Enough first attempts to describe how they’ve gone. Still a record of answers, not a measure of ability.',
};

/** Words carry the result; the icon only repeats it. */
const RESULT: Record<AttemptResult, { label: string; icon: LucideIcon; color: string }> = {
  matched: { label: 'Matched the model', icon: CircleCheck, color: colors.success },
  partly: { label: 'Partly matched', icon: Minus, color: colors.textBody },
  reasonable: { label: 'A reasonable answer', icon: Minus, color: colors.textBody },
  different: { label: 'Different from the model', icon: CircleX, color: colors.textMuted },
  'not-compared': { label: 'Depended on the unknowable — not compared', icon: CircleDashed, color: colors.textMuted },
};

/** One skill area in detail: its measure, the first attempts behind it and the lessons that practise it. */
export default function AreaReportScreen() {
  const insets = useSafeAreaInsets();
  const { skill } = useLocalSearchParams<{ skill: string }>();
  const { hydrated, profile, attempts, completed } = useProfile();
  if (!hydrated) return <MessageScreen loading />;

  const known = allSkills().some((s) => s.id === skill);
  const detail = known ? areaDetail(profile, skill as SkillArea, { attempts, completed }) : null;
  if (!detail) return <MessageScreen title="Area not found" body="This skill area doesn’t exist." />;

  const { skill: s, row, modules } = detail;
  const listed = detail.attempts.slice(0, MAX_LISTED);
  const older = detail.attempts.length - listed.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <ScreenHeader title={s.label} subtitle={s.description} />

          <Card style={{ gap: space.xs }}>
            <AppText variant="heading" tabular>
              {row?.measure ?? 'Not explored yet'}
            </AppText>
            <EvidenceCaption text={LEVEL_NOTE[row?.level ?? 'none']} />
          </Card>

          {listed.length ? (
            <View style={{ gap: space.xs }}>
              <SectionLabel>Your first attempts</SectionLabel>
              <Card style={{ gap: space.md }}>
                {listed.map((a) => {
                  const r = RESULT[a.result];
                  return (
                    <View key={a.id} style={styles.attempt} accessible accessibilityLabel={`${a.question}. ${r.label}.`}>
                      <r.icon size={18} color={r.color} strokeWidth={2.2} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="small" color={colors.text}>
                          {a.question}
                        </AppText>
                        <AppText variant="caption" color={colors.textMuted}>
                          {r.label} · {a.daily ? 'Daily challenge' : (getLesson(a.lesson)?.title ?? '')}
                        </AppText>
                      </View>
                    </View>
                  );
                })}
                {older ? <EvidenceCaption text={`And ${older} earlier.`} /> : null}
              </Card>
              {detail.retries ? (
                <EvidenceCaption text={`You also retried questions here ${detail.retries === 1 ? 'once' : `${detail.retries} times`}. Retries show up under “Learning after feedback” and never change these results.`} />
              ) : null}
            </View>
          ) : null}

          <View style={{ gap: space.xs }}>
            <SectionLabel>Lessons that practise this area</SectionLabel>
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {modules.map((m) => (
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
                      {l.completed ? (
                        <View style={styles.done}>
                          <CircleCheck size={14} color={colors.success} />
                          <AppText variant="caption" color={colors.success}>
                            Done
                          </AppText>
                        </View>
                      ) : null}
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
  attempt: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  module: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.lg },
  lessonNumber: { width: 20 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
