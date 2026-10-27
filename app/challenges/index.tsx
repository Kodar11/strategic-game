import { router } from 'expo-router';
import { ArrowLeft, CircleCheck } from '@/src/components/ui/icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { IconButton } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { LESSONS, type LessonId, MODULES } from '@/src/content/lessons';
import { challengesFor } from '@/src/features/challenges/content';
import { isTried } from '@/src/features/challenges/progress';
import { SCENARIOS, scenariosFor } from '@/src/features/scenarios';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, radius, shadow, space } from '@/src/theme/tokens';

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
  const openScenario = (id: string) => router.push({ pathname: '/scenario/[scenarioId]', params: { scenarioId: id } });
  const openChallenges = (id: LessonId) => router.push({ pathname: '/challenges/[lessonId]', params: { lessonId: id } });

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
          </View>
          <AppText color={colors.textMuted}>
            Every lesson has three playable scenarios: learn the mechanism (A), change an assumption (B), transfer it (C). {played.length} of {SCENARIOS.length} played. No lesson required first.
          </AppText>

          {MODULES.map((m) => (
            <View key={m.id} style={{ gap: space.md }}>
              <AppText variant="overline" color={colors.primaryText}>
                Module {m.number} · {m.title}
              </AppText>
              {LESSONS.filter((l) => l.module === m.id).map((lesson) => {
                const scenarios = scenariosFor(lesson.id);
                const challenges = challengesFor(lesson.id);
                const tried = challenges.filter((c) => isTried(learning, c.id)).length;
                return (
                  <View key={lesson.id} style={[styles.card, shadow.card]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <AppText variant="caption" color={colors.textMuted} tabular>
                        {String(lesson.number).padStart(2, '0')}
                      </AppText>
                      <Badge label={lesson.concept} tone={lesson.accent} />
                      {completed.includes(lesson.id) ? <CircleCheck size={14} color={colors.success} strokeWidth={2.4} /> : null}
                    </View>
                    <AppText variant="heading">{lesson.title}</AppText>
                    <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                      {scenarios.map((s) => {
                        const on = played.includes(s.id);
                        return (
                          <Pressable
                            key={s.id}
                            onPress={() => openScenario(s.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`Scenario ${s.slot}: ${s.title}. ${on ? 'Played.' : 'Not played yet.'}`}
                            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { backgroundColor: colors.surfaceHigh }]}>
                            <AppText variant="caption" color={on ? colors.text : colors.textBody} numberOfLines={1}>
                              {s.slot} · {s.title}
                            </AppText>
                          </Pressable>
                        );
                      })}
                      {challenges.length ? (
                        <Pressable
                          onPress={() => openChallenges(lesson.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Challenges: ${tried} of ${challenges.length} tried`}
                          style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.surfaceHigh }]}>
                          <AppText variant="caption" color={colors.accent}>
                            Challenges · {tried}/{challenges.length}
                          </AppText>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
          <AppText variant="caption" color={colors.textMuted} align="center">
            Your first attempt at each scenario and challenge is kept, even if you play again.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  card: { gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, maxWidth: '100%' },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
