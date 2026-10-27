import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, CircleCheck, Target } from '@/src/components/ui/icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { IconButton } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { LESSONS, type LessonId, type LessonMeta, MODULES } from '@/src/content/lessons';
import { challengesFor } from '@/src/features/challenges/content';
import { isTried } from '@/src/features/challenges/progress';
import type { LearningAttempt } from '@/src/features/learning/records';
import { SCENARIOS, scenariosFor } from '@/src/features/scenarios';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, radius, shadow, space } from '@/src/theme/tokens';

const openScenario = (id: string) => router.push({ pathname: '/scenario/[scenarioId]', params: { scenarioId: id } });
const openChallenges = (id: LessonId) => router.push({ pathname: '/challenges/[lessonId]', params: { lessonId: id } });

/**
 * Practice: every lesson's three paired scenarios (and, for the original five lessons, their challenges), open
 * from the start — no lesson has to be completed first.
 */
export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const hydrated = useProgress((s) => s.hydrated);
  const learning = useProgress((s) => s.learning);
  const completed = useProgress((s) => s.completed);
  const played = useProgress((s) => s.scenarioDone);

  if (!hydrated) return <MessageScreen loading />;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          <View style={styles.head}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              Practice
            </AppText>
            <AppText variant="small" color={colors.textMuted} tabular>
              {played.length}/{SCENARIOS.length} played
            </AppText>
          </View>
          <AppText color={colors.textMuted}>
            Every lesson has three playable scenarios: learn the mechanism (A), change an assumption (B), transfer it (C). No lesson required first.
          </AppText>

          {MODULES.map((m) => {
            const lessons = LESSONS.filter((l) => l.module === m.id);
            const ids = lessons.flatMap((l) => scenariosFor(l.id).map((s) => s.id));
            const moduleDone = ids.filter((id) => played.includes(id)).length;
            return (
              <View key={m.id} style={{ gap: space.md }}>
                <View style={styles.moduleHead} accessibilityRole="header">
                  <AppText variant="overline" color={colors.primaryText} tabular>
                    Module {m.number} · {moduleDone}/{ids.length} played
                  </AppText>
                  <AppText variant="heading">{m.title}</AppText>
                </View>
                {lessons.map((lesson) => (
                  <LessonPractice key={lesson.id} lesson={lesson} done={completed.includes(lesson.id)} played={played} learning={learning} />
                ))}
              </View>
            );
          })}
          <AppText variant="caption" color={colors.textMuted} align="center">
            Your first attempt at each scenario and challenge is kept, even if you play again.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

function LessonPractice({ lesson, done, played, learning }: { lesson: LessonMeta; done: boolean; played: readonly string[]; learning: readonly LearningAttempt[] }) {
  const scenarios = scenariosFor(lesson.id);
  const challenges = challengesFor(lesson.id);
  const tried = challenges.filter((c) => isTried(learning, c.id)).length;
  const count = scenarios.filter((s) => played.includes(s.id)).length;
  return (
    <View style={[styles.card, shadow.card]}>
      <View style={styles.cardHead}>
        <AppText variant="caption" color={colors.textMuted} tabular>
          {String(lesson.number).padStart(2, '0')}
        </AppText>
        <Badge label={lesson.concept} tone={lesson.accent} />
        <View style={styles.cardMeta}>
          {done ? <CircleCheck size={14} color={colors.success} strokeWidth={2.4} /> : null}
          <AppText variant="caption" color={count === scenarios.length ? colors.success : colors.textMuted} tabular>
            {done ? 'Lesson done · ' : ''}
            {count}/{scenarios.length}
          </AppText>
        </View>
      </View>
      <AppText variant="heading">{lesson.title}</AppText>
      <View style={{ gap: space.xs }}>
        {scenarios.map((s) => {
          const on = played.includes(s.id);
          return (
            <Pressable
              key={s.id}
              onPress={() => openScenario(s.id)}
              accessibilityRole="button"
              accessibilityLabel={`Scenario ${s.slot}: ${s.title}. ${on ? 'Played.' : 'Not played yet.'}`}
              style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && { backgroundColor: colors.surfaceHigh }]}>
              <View style={[styles.slot, on && styles.slotOn]}>
                <AppText variant="caption" color={on ? colors.text : colors.textBody}>
                  {s.slot}
                </AppText>
              </View>
              <AppText variant="small" color={colors.text} style={{ flex: 1 }}>
                {s.title}
              </AppText>
              {on ? <CircleCheck size={16} color={colors.success} strokeWidth={2.4} /> : <ArrowRight size={16} color={colors.textMuted} />}
            </Pressable>
          );
        })}
        {challenges.length ? (
          <Pressable
            onPress={() => openChallenges(lesson.id)}
            accessibilityRole="button"
            accessibilityLabel={`Challenges: ${tried} of ${challenges.length} tried`}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHigh }]}>
            <View style={[styles.slot, { backgroundColor: colors.accentSoft }]}>
              <Target size={13} color={colors.accent} strokeWidth={2.4} />
            </View>
            <AppText variant="small" color={colors.accent} style={{ flex: 1 }}>
              Challenges
            </AppText>
            <AppText variant="caption" color={colors.textMuted} tabular>
              {tried}/{challenges.length} tried
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  moduleHead: { gap: 2, marginTop: space.md },
  card: { gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgRaised,
  },
  rowOn: { borderColor: 'rgba(37,99,235,0.45)', backgroundColor: colors.primarySoft },
  slot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh },
  slotOn: { backgroundColor: colors.primary },
});
