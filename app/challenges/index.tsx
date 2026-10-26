import { router } from 'expo-router';
import { ArrowLeft, ArrowRight } from '@/src/components/ui/icons';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { IconButton } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { LESSONS, type LessonId } from '@/src/content/lessons';
import { CONCEPT_REVIEW, challengesFor } from '@/src/features/challenges/content';
import { isTried } from '@/src/features/challenges/progress';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, radius, shadow, space } from '@/src/theme/tokens';

/** Practice: every lesson's three challenges, open from the start — no lesson has to be completed first. */
export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const hydrated = useProgress((s) => s.hydrated);
  const learning = useProgress((s) => s.learning);
  const completed = useProgress((s) => s.completed);
  const rows = useMemo(
    () =>
      LESSONS.map((l) => {
        const list = challengesFor(l.id);
        return { lesson: l, total: list.length, tried: list.filter((c) => isTried(learning, c.id)).length };
      }),
    [learning],
  );

  if (!hydrated) return <MessageScreen loading />;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const open = (id: LessonId) => router.push({ pathname: '/challenges/[lessonId]', params: { lessonId: id } });

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
            Apply each idea somewhere new. Three short challenges per lesson — about two minutes, no lesson required first.
          </AppText>

          {rows.map(({ lesson, total, tried }) => {
            const done = completed.includes(lesson.id);
            const label = `${lesson.title}. ${CONCEPT_REVIEW[lesson.id].concept}. ${tried} of ${total} challenges tried.${done ? ' Lesson completed.' : ''}`;
            return (
              <Pressable
                key={lesson.id}
                onPress={() => open(lesson.id)}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={({ pressed }) => [styles.card, shadow.card, pressed && { backgroundColor: colors.surfaceHigh }]}>
                <View style={{ flex: 1, gap: space.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <AppText variant="caption" color={colors.textMuted} tabular>
                      {String(lesson.number).padStart(2, '0')}
                    </AppText>
                    <Badge label={lesson.concept} tone={lesson.accent} />
                  </View>
                  <AppText variant="heading">{lesson.title}</AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <View style={{ flexDirection: 'row', gap: 4 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                      {Array.from({ length: total }, (_, i) => (
                        <View key={i} style={[styles.dot, i < tried && styles.dotOn]} />
                      ))}
                    </View>
                    <AppText variant="caption" color={colors.textMuted}>
                      {tried === total ? 'All 3 tried' : `${tried} of ${total} tried`}
                      {done ? ' · lesson completed' : ''}
                    </AppText>
                  </View>
                </View>
                <ArrowRight size={20} color={colors.textMuted} />
              </Pressable>
            );
          })}
          <AppText variant="caption" color={colors.textMuted} align="center">
            Your first answer to each challenge is kept, even if you try again.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.textMuted },
  dotOn: { backgroundColor: colors.primaryText, borderColor: colors.primaryText },
});
