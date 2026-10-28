import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { ArrowRight, CalendarDays, CircleCheck, Clock, Lock, Play, RotateCcw, Settings, Target, Trophy } from '@/src/components/ui/icons';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_NAME } from '@/src/brand';
import { LessonArt } from '@/src/components/art/LessonArt';
import { Portrait } from '@/src/components/characters/Portrait';
import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { type Category, type CategoryIndex, categoryProgress, lessonCategories, lessonsInCategory } from '@/src/content/categories';
import { allLessons, type LessonId, type LessonMeta, allModules, type ModuleMeta } from '@/src/content/lessons';
import { allAssessments, type Assessment, getAssessment, moduleCheckpoint, splitAssessmentTitle } from '@/src/features/assessments/content';
import { type AssessmentRun, finalUnlocked } from '@/src/features/assessments/scoring';
import { useDaily } from '@/src/data/daily-session';
import { formatDay, monthKey, monthOf } from '@/src/features/daily/dates';
import { allScenarios } from '@/src/features/scenarios';
import { type LessonRuntime, useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, radius, shadow, space } from '@/src/theme/tokens';
import { useMotionReduced } from '@/src/utils/feedback';

/** The brain-puzzle mark on a transparent background (the same artwork as the splash screen). */
const LOGO = require('@/assets/images/splash-icon.png');

function openLesson(id: LessonId) {
  router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: id } });
}

function openAssessment(id: string) {
  router.push({ pathname: '/checkpoint/[assessmentId]', params: { assessmentId: id } });
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const enter = useEnter();
  const hydrated = useProgress((s) => s.hydrated);
  const completed = useProgress((s) => s.completed);
  const runtime = useProgress((s) => s.runtime);
  const played = useProgress((s) => s.scenarioDone.length);
  const assessmentRuns = useProgress((s) => s.assessmentRuns);
  // null = "All": the module view, exactly as before categories existed.
  const [category, setCategory] = useState<string | null>(null);
  const categories = lessonCategories();
  const reduced = useMotionReduced();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const columnY = useRef(0);
  const lessonsY = useRef(0);

  // Switching filters swaps the list below; if the learner had scrolled past the Lessons heading, bring it back to
  // the top so the new list starts in view instead of leaving them somewhere in the middle of it.
  const selectCategory = (id: string | null) => {
    setCategory(id);
    const top = columnY.current + lessonsY.current - space.sm;
    if (scrollY.current > top) scrollRef.current?.scrollTo({ y: top, animated: !reduced });
  };

  if (!hydrated) return <MessageScreen loading />;

  const activeCategory = categories?.categories.find((c) => c.id === category) ?? null;
  const categoryDone = activeCategory ? categoryProgress(categories!, allLessons(), completed).get(activeCategory.id) : undefined;

  // Resume the most recently touched unfinished lesson; otherwise suggest the first lesson not yet completed.
  const resume = allLessons().filter((l) => runtime[l.id] && runtime[l.id]!.step > 0).sort(
    (a, b) => runtime[b.id]!.updatedAt - runtime[a.id]!.updatedAt,
  )[0];
  const suggested = resume ?? allLessons().find((l) => !completed.includes(l.id));
  const doneCount = completed.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView
        ref={scrollRef}
        onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl, paddingHorizontal: space.lg }}>
        <View style={styles.column} onLayout={(e) => (columnY.current = e.nativeEvent.layout.y)}>
          <View style={styles.topBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessible accessibilityRole="header" accessibilityLabel={APP_NAME}>
              <Image source={LOGO} style={styles.logo} contentFit="contain" />
              <AppText variant="heading" color={colors.text}>
                {APP_NAME}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              <IconButton icon={Settings} label="Settings" onPress={() => router.navigate('/settings')} />
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
            <AppText color={colors.textMuted}>Make decisions, see what happens, and discover why.</AppText>
          </Animated.View>

          {suggested ? (
            <Animated.View entering={enter(80)}>
              <Pressable
                onPress={() => openLesson(suggested.id)}
                accessibilityRole="button"
                accessibilityLabel={`${resume ? 'Resume' : 'Start'} lesson ${suggested.number}, ${suggested.title}${resume ? `, step ${runtime[resume.id]!.step + 1} of ${runtime[resume.id]!.total}` : ''}`}
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
                <View style={styles.resumePill}>
                  <Play size={14} color={colors.primary} fill={colors.primary} />
                  <AppText variant="small" weight="semibold" color={colors.primary}>
                    {resume ? 'Resume' : 'Start'}
                  </AppText>
                </View>
              </Pressable>
            </Animated.View>
          ) : null}

          <Animated.View entering={enter(100)} style={styles.utilities}>
            <Pressable
              onPress={() => router.push('/challenges')}
              accessibilityRole="button"
              accessibilityLabel={`Practice in new situations. Apply what you've learned. ${played} of ${allScenarios().length} scenarios played. No lesson required.`}
              style={({ pressed }) => [styles.practice, pressed && { backgroundColor: colors.surfaceHigh }]}>
              <View style={styles.practiceIcon}>
                <Target size={18} color={colors.primaryText} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">Practice in new situations</AppText>
                <AppText variant="caption" color={colors.textMuted} tabular>
                  {played} of {allScenarios().length} scenarios played
                </AppText>
              </View>
              <ArrowRight size={18} color={colors.textMuted} />
            </Pressable>
            <DailyRow />
          </Animated.View>

          <View style={styles.sectionHead} onLayout={(e) => (lessonsY.current = e.nativeEvent.layout.y)}>
            <AppText variant="heading" accessibilityRole="header">
              Lessons
            </AppText>
            <AppText variant="small" color={colors.textMuted} tabular>
              {doneCount} of {allLessons().length} complete
            </AppText>
          </View>

          {categories ? <CategoryFilter index={categories} completed={completed} value={category} onChange={selectCategory} /> : null}

          {activeCategory ? (
            <View style={{ gap: space.md }}>
              <CategoryHeader category={activeCategory} done={categoryDone?.done ?? 0} total={categoryDone?.total ?? 0} />
              {lessonsInCategory(categories!, activeCategory.id, allLessons()).map((lesson) => (
                <LessonCard key={lesson.id} lesson={lesson} done={completed.includes(lesson.id)} run={runtime[lesson.id]} />
              ))}
            </View>
          ) : (
          <View style={{ gap: space.xxl }}>
            {allModules().map((m, mi) => (
              <Animated.View key={m.id} entering={enter(120 + mi * 60)} style={{ gap: space.md }}>
                <ModuleHeader module={m} done={allLessons().filter((l) => l.module === m.id && completed.includes(l.id)).length} total={allLessons().filter((l) => l.module === m.id).length} />
                {allLessons().filter((l) => l.module === m.id).map((lesson) => (
                  <LessonCard key={lesson.id} lesson={lesson} done={completed.includes(lesson.id)} run={runtime[lesson.id]} />
                ))}
                <AssessmentCard a={moduleCheckpoint(m.id)} run={assessmentRuns[m.id]} />
              </Animated.View>
            ))}
            <AssessmentCard a={getAssessment('final')!} run={assessmentRuns.final} locked={!finalUnlocked(assessmentRuns)} unlockedCount={allAssessments().filter((x) => x.id !== 'final' && (assessmentRuns[x.id]?.attempts ?? 0) > 0).length} final />
          </View>
          )}

          <AppText variant="caption" color={colors.textMuted} align="center" style={{ marginTop: space.xl }}>
            Simplified models of real situations. They sharpen how you reason — they don&apos;t predict everything.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Daily challenge entry point. Shows today's real state from the server-backed daily store (the same month cache the
 * Daily screen uses): open, answered, or nothing published. While loading, or if the server can't be reached, it only
 * describes the feature — it never guesses a state. The whole row opens the Daily screen.
 */
function DailyRow() {
  const today = useDaily((s) => s.today);
  const loadMonth = useDaily((s) => s.loadMonth);
  const month = useDaily((s) => s.months[monthKey(monthOf(s.today))]);

  useFocusEffect(
    useCallback(() => {
      void loadMonth(monthOf(today));
    }, [loadMonth, today]),
  );

  const data = month?.status === 'ready' ? month.data : null;
  const answered = !!data?.attempts.get(formatDay(today));
  const open = !answered && !!data?.entries.get(formatDay(today));
  const status = !data ? 'One decision a day' : answered ? 'Completed today · review your answer' : open ? 'Take today’s challenge' : 'No challenge today · past ones stay open';

  return (
    <Pressable
      onPress={() => router.push('/daily')}
      accessibilityRole="button"
      accessibilityLabel={`Daily challenge. ${status}.${data ? '' : ' One short decision a day, with a calendar of past challenges.'}`}
      style={({ pressed }) => [styles.practice, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <View style={[styles.practiceIcon, { backgroundColor: colors.insightSoft }]}>
        <CalendarDays size={18} color={colors.insight} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">Daily challenge</AppText>
        <AppText variant="caption" color={open ? colors.insight : answered ? colors.success : colors.textMuted}>
          {status}
        </AppText>
      </View>
      {answered ? <CircleCheck size={18} color={colors.success} strokeWidth={2.4} /> : <ArrowRight size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

function ModuleHeader({ module, done, total }: { module: ModuleMeta; done: number; total: number }) {
  return (
    <View style={{ gap: 2 }} accessibilityRole="header">
      <AppText variant="overline" color={colors.primaryText}>
        Module {module.number} · {done}/{total} complete
      </AppText>
      <AppText variant="heading">{module.title}</AppText>
      <AppText variant="small" color={colors.textMuted}>
        {module.objective}
      </AppText>
    </View>
  );
}

/**
 * Browse by category. "All" is the module view (with checkpoints); a category lists its lessons in curriculum order.
 * Counts are completed / total lessons in that category.
 */
function CategoryFilter({ index, completed, value, onChange }: { index: CategoryIndex; completed: readonly LessonId[]; value: string | null; onChange: (id: string | null) => void }) {
  const progress = categoryProgress(index, allLessons(), completed);
  const chips = [{ id: null, title: 'All', count: `${completed.length}/${allLessons().length}` }, ...index.categories.map((c) => ({ id: c.id, title: c.title, count: `${progress.get(c.id)!.done}/${progress.get(c.id)!.total}` }))];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel="Lesson categories"
      style={{ marginHorizontal: -space.lg, marginBottom: space.md, flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
      {chips.map((c) => {
        const on = c.id === value;
        return (
          <Pressable
            key={c.id ?? 'all'}
            onPress={() => onChange(c.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${c.title}, ${c.count.replace('/', ' of ')} lessons complete`}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && !on && { backgroundColor: colors.surfaceHigh }]}>
            <AppText variant="small" weight="semibold" color={on ? '#fff' : colors.textBody} numberOfLines={1}>
              {c.title}
            </AppText>
            <AppText variant="caption" color={on ? '#DBEAFE' : colors.textMuted} tabular>
              {c.count}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function CategoryHeader({ category, done, total }: { category: Category; done: number; total: number }) {
  return (
    <View style={{ gap: 2 }} accessibilityRole="header">
      <AppText variant="overline" color={colors.primaryText}>
        Category · {done}/{total} complete
      </AppText>
      <AppText variant="heading">{category.title}</AppText>
      <AppText variant="small" color={colors.textMuted}>
        {category.description}
      </AppText>
      <View style={[styles.miniTrack, { flex: 0, marginTop: space.xs }]}>
        <View style={[styles.miniFill, { width: `${total ? (done / total) * 100 : 0}%` }]} />
      </View>
    </View>
  );
}

/**
 * A checkpoint or the final assessment. States: locked (final only, until every checkpoint is submitted), available,
 * in progress (answers drafted), submitted (with best score; "passed" once the best score reaches the pass mark).
 */
function AssessmentCard({ a, run, locked, final, unlockedCount }: { a: Assessment; run?: AssessmentRun; locked?: boolean; final?: boolean; unlockedCount?: number }) {
  const score = run?.bestScore ?? null;
  const submitted = (run?.attempts ?? 0) > 0;
  const passed = score !== null && score / a.items.length >= a.passMark - 1e-9;
  const drafting = !submitted && !!run && Object.keys(run.answers).length > 0;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const checkpoints = allAssessments().filter((x) => x.id !== 'final').length;
  const status = locked
    ? `Locked · submit every checkpoint to unlock (${unlockedCount ?? 0} of ${checkpoints} done)`
    : submitted
      ? `${passed ? 'Passed' : 'Submitted'} · best ${fmt(score!)} / ${a.items.length}`
      : drafting
        ? `In progress · ${a.items.length} questions`
        : `${a.items.length} questions · pass mark ${Math.round(a.passMark * 100)}%`;
  const { kicker, subject } = splitAssessmentTitle(a.title);
  const tint = locked ? colors.textMuted : submitted ? colors.success : final ? colors.insight : colors.primaryText;
  return (
    <Pressable
      onPress={() => openAssessment(a.id)}
      accessibilityRole="button"
      accessibilityLabel={`${a.title}. ${status}.`}
      style={({ pressed }) => [styles.assessment, final && styles.final, submitted && styles.assessmentDone, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <View style={[styles.practiceIcon, final && !locked && { backgroundColor: colors.insightSoft }, locked && { backgroundColor: colors.surfaceHigh }]}>
        {locked ? <Lock size={18} color={colors.textMuted} /> : final ? <Trophy size={18} color={colors.insight} /> : <Target size={18} color={colors.primaryText} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="overline" color={tint}>
          {kicker}
        </AppText>
        <AppText variant="bodyStrong" color={locked ? colors.textBody : colors.text}>
          {subject}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {status}
        </AppText>
      </View>
      {submitted ? <CircleCheck size={20} color={colors.success} strokeWidth={2.4} /> : <ArrowRight size={18} color={colors.textMuted} />}
    </Pressable>
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

/** Restarting a lesson lives in the lesson's own header, so each card has a single action. */
function LessonCard({ lesson, done, run }: { lesson: LessonMeta; done: boolean; run?: LessonRuntime }) {
  const inProgress = !!run && run.step > 0;
  const action = inProgress ? 'Resume' : done ? 'Replay' : 'Start';

  return (
    <View style={[styles.card, shadow.card]}>
      <Pressable
        onPress={() => openLesson(lesson.id)}
        accessibilityRole="button"
        accessibilityLabel={`Lesson ${lesson.number}: ${lesson.title}. ${lesson.description} About ${lesson.minutes} minutes. ${done ? 'Completed.' : inProgress ? 'In progress.' : 'Not started.'}`}>
        <View>
          <LessonArt lesson={lesson.id} height={104} />
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
        </View>
      </Pressable>
      <View style={styles.cardActions}>
        <View style={{ flex: 1 }}>{inProgress ? <ResumeProgress run={run!} /> : null}</View>
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
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  logo: { width: 30, height: 30 },
  hero: { gap: space.sm, marginBottom: space.xl },
  cast: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space.xs },
  castItem: {},
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  resumePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: '#fff',
  },
  utilities: { gap: space.sm, marginBottom: space.xl },
  practice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  assessment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.bgRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  final: { borderStyle: 'solid', borderColor: 'rgba(253,186,116,0.4)', padding: space.lg },
  assessmentDone: { borderStyle: 'solid', borderColor: 'rgba(74,222,128,0.35)' },
  practiceIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm },
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
  cardBody: { paddingHorizontal: space.lg, paddingTop: space.md, gap: 6 },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    paddingTop: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  miniTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  miniFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
});
