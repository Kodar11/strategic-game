import { router } from 'expo-router';
import { ArrowRight, CircleCheck, Clock, Play, RotateCcw, Settings, UserRound } from '@/src/components/ui/icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SceneArt } from '@/src/components/art/SceneArt';
import { Portrait } from '@/src/components/characters/Portrait';
import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { LESSONS, type LessonId, type LessonMeta } from '@/src/content/lessons';
import { type LessonRuntime, useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, radius, shadow, space } from '@/src/theme/tokens';

function openLesson(id: LessonId) {
  router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: id } });
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const enter = useEnter();
  const hydrated = useProgress((s) => s.hydrated);
  const completed = useProgress((s) => s.completed);
  const runtime = useProgress((s) => s.runtime);

  if (!hydrated) return <MessageScreen loading />;

  // Resume the most recently touched unfinished lesson; otherwise suggest the first lesson not yet completed.
  const resume = LESSONS.filter((l) => runtime[l.id] && runtime[l.id]!.step > 0).sort(
    (a, b) => runtime[b.id]!.updatedAt - runtime[a.id]!.updatedAt,
  )[0];
  const suggested = resume ?? LESSONS.find((l) => !completed.includes(l.id));
  const doneCount = completed.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge, paddingHorizontal: space.lg }}>
        <View style={styles.column}>
          <View style={styles.topBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={styles.logo}>
                <View style={[styles.logoHalf, { backgroundColor: colors.primary }]} />
                <View style={[styles.logoHalf, { backgroundColor: colors.rival }]} />
              </View>
              <AppText variant="overline" color={colors.text}>
                Strategic
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              <IconButton icon={UserRound} label="Your strategic thinking profile" onPress={() => router.push('/profile')} />
              <IconButton icon={Settings} label="Settings" onPress={() => router.push('/settings')} />
            </View>
          </View>

          {/* Hero */}
          <Animated.View entering={enter(0, 'fade')} style={styles.hero}>
            <View style={styles.cast} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={[styles.castItem, { zIndex: 1 }]}>
                <Portrait character="aarav" expression="curious" size={72} ring={colors.primary} />
              </View>
              <View style={[styles.castItem, { marginLeft: -14, marginTop: 18 }]}>
                <Portrait character="sen" expression="explaining" size={56} ring={colors.insight} />
              </View>
              <View style={[styles.castItem, { marginLeft: -14 }]}>
                <Portrait character="maya" expression="skeptical" size={72} ring={colors.rival} mirrored />
              </View>
            </View>
            <AppText variant="overline" color={colors.primaryText}>
              A game that teaches you to think strategically
            </AppText>
            <AppText variant="display" accessibilityRole="header">
              Think in Strategies.
            </AppText>
            <AppText color={colors.textMuted}>
              Five short games. Make a call, watch what happens, then find out why — and where else the idea shows up.
            </AppText>
          </Animated.View>

          {suggested ? (
            <Animated.View entering={enter(80)}>
              <Pressable
                onPress={() => openLesson(suggested.id)}
                accessibilityRole="button"
                accessibilityLabel={`${resume ? 'Resume' : 'Start'} lesson ${suggested.number}, ${suggested.title}`}
                style={({ pressed }) => [styles.resume, pressed && { backgroundColor: colors.primaryPressed }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="caption" color="#DBEAFE">
                    {resume ? 'Pick up where you left off' : doneCount === 0 ? 'Start here' : 'Up next'}
                  </AppText>
                  <AppText variant="heading" color="#fff">
                    {suggested.number}. {suggested.title}
                  </AppText>
                  {resume ? <ResumeProgress run={runtime[resume.id]!} light /> : null}
                </View>
                <View style={styles.resumeIcon}>
                  <Play size={20} color={colors.primary} fill={colors.primary} />
                </View>
              </Pressable>
            </Animated.View>
          ) : null}

          <View style={styles.sectionHead}>
            <AppText variant="heading">Lessons</AppText>
            <AppText variant="small" color={colors.textMuted} tabular>
              {doneCount} of {LESSONS.length} complete
            </AppText>
          </View>

          <View style={{ gap: space.lg }}>
            {LESSONS.map((lesson, i) => (
              <Animated.View key={lesson.id} entering={enter(120 + i * 60)}>
                <LessonCard lesson={lesson} done={completed.includes(lesson.id)} run={runtime[lesson.id]} />
              </Animated.View>
            ))}
          </View>

          <AppText variant="caption" color={colors.textFaint} align="center" style={{ marginTop: space.xxl }}>
            Simplified models of real situations. They sharpen how you reason — they don&apos;t predict everything.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

function ResumeProgress({ run, light }: { run: LessonRuntime; light?: boolean }) {
  const pct = Math.min(1, (run.step + 1) / Math.max(1, run.total));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs }}>
      <View style={[styles.miniTrack, light && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
        <View style={[styles.miniFill, { width: `${pct * 100}%` }, light && { backgroundColor: '#fff' }]} />
      </View>
      <AppText variant="caption" color={light ? '#DBEAFE' : colors.textMuted} tabular>
        Step {run.step + 1} of {run.total}
      </AppText>
    </View>
  );
}

function LessonCard({ lesson, done, run }: { lesson: LessonMeta; done: boolean; run?: LessonRuntime }) {
  const clearRuntime = useProgress((s) => s.clearRuntime);
  const inProgress = !!run && run.step > 0;
  const action = inProgress ? 'Resume' : done ? 'Replay' : 'Start';

  return (
    <View style={[styles.card, shadow.card]}>
      <Pressable
        onPress={() => openLesson(lesson.id)}
        accessibilityRole="button"
        accessibilityLabel={`Lesson ${lesson.number}: ${lesson.title}. ${lesson.description} About ${lesson.minutes} minutes. ${done ? 'Completed.' : inProgress ? 'In progress.' : 'Not started.'}`}>
        <View>
          <SceneArt scene={lesson.scene} height={104} />
          <View style={styles.cardNumber}>
            <AppText variant="caption" color={colors.text} tabular>
              {String(lesson.number).padStart(2, '0')}
            </AppText>
          </View>
          {done ? (
            <View style={styles.doneTag}>
              <CircleCheck size={14} color={colors.success} strokeWidth={2.4} />
              <AppText variant="caption" color={colors.success}>
                Completed
              </AppText>
            </View>
          ) : null}
        </View>
        <View style={styles.cardBody}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Badge label={lesson.concept} tone={lesson.accent} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
              <Clock size={13} color={colors.textMuted} />
              <AppText variant="caption" color={colors.textMuted}>
                {lesson.minutes} min
              </AppText>
            </View>
          </View>
          <AppText variant="heading">{lesson.title}</AppText>
          <AppText variant="small" color={colors.textMuted}>
            {lesson.description}
          </AppText>
          {inProgress ? <ResumeProgress run={run!} /> : null}
        </View>
      </Pressable>
      <View style={styles.cardActions}>
        {inProgress ? (
          <Button label="Start over" variant="ghost" compact icon={RotateCcw} iconPosition="left" onPress={() => clearRuntime(lesson.id)} />
        ) : (
          <View />
        )}
        <Button
          label={action}
          compact
          variant={done && !inProgress ? 'secondary' : 'primary'}
          icon={done && !inProgress ? RotateCcw : ArrowRight}
          iconPosition={done && !inProgress ? 'left' : 'right'}
          onPress={() => openLesson(lesson.id)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xl },
  logo: { width: 22, height: 22, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', transform: [{ rotate: '45deg' }] },
  logoHalf: { flex: 1 },
  hero: { gap: space.md, marginBottom: space.xxl },
  cast: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space.sm },
  castItem: {},
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.xxl,
  },
  resumeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardNumber: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    backgroundColor: colors.overlay,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  doneTag: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  cardBody: { padding: space.lg, paddingBottom: space.sm, gap: space.sm },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    paddingTop: space.xs,
  },
  miniTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  miniFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
});
