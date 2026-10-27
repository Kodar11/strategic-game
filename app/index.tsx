import { router } from 'expo-router';
import { ArrowRight, CalendarDays, CircleCheck, Clock, Lock, Play, RotateCcw, Settings, Target, Trophy, UserRound } from '@/src/components/ui/icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { allScenarios } from '@/src/features/scenarios';
import { type LessonRuntime, useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, radius, shadow, space } from '@/src/theme/tokens';

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
              Twenty-two short games in six modules. Make a call, watch what happens, then find out why — and where else the idea shows up.
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

          <Animated.View entering={enter(100)}>
            <Pressable
              onPress={() => router.push('/challenges')}
              accessibilityRole="button"
              accessibilityLabel={`Practice in new situations. ${played} of ${allScenarios().length} scenarios played. No lesson required.`}
              style={({ pressed }) => [styles.practice, { marginBottom: space.md }, pressed && { backgroundColor: colors.surfaceHigh }]}>
              <View style={styles.practiceIcon}>
                <Target size={20} color={colors.primaryText} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">Practice in new situations</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {played} of {allScenarios().length} scenarios played · open any time
                </AppText>
              </View>
              <ArrowRight size={18} color={colors.textMuted} />
            </Pressable>
          </Animated.View>

          <Animated.View entering={enter(110)}>
            <Pressable
              onPress={() => router.push('/daily')}
              accessibilityRole="button"
              accessibilityLabel="Daily strategic challenge. One short decision a day, with a calendar of past challenges."
              style={({ pressed }) => [styles.practice, pressed && { backgroundColor: colors.surfaceHigh }]}>
              <View style={[styles.practiceIcon, { backgroundColor: colors.insightSoft }]}>
                <CalendarDays size={20} color={colors.insight} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">Daily challenge</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  One short decision a day · calendar and past results
                </AppText>
              </View>
              <ArrowRight size={18} color={colors.textMuted} />
            </Pressable>
          </Animated.View>

          <View style={styles.sectionHead}>
            <AppText variant="heading">Lessons</AppText>
            <AppText variant="small" color={colors.textMuted} tabular>
              {doneCount} of {allLessons().length} complete
            </AppText>
          </View>

          {categories ? <CategoryFilter index={categories} completed={completed} value={category} onChange={setCategory} /> : null}

          {activeCategory ? (
            <View style={{ gap: space.lg }}>
              <CategoryHeader category={activeCategory} done={categoryDone?.done ?? 0} total={categoryDone?.total ?? 0} />
              {lessonsInCategory(categories!, activeCategory.id, allLessons()).map((lesson) => (
                <LessonCard key={lesson.id} lesson={lesson} done={completed.includes(lesson.id)} run={runtime[lesson.id]} />
              ))}
            </View>
          ) : (
          <View style={{ gap: space.xxl }}>
            {allModules().map((m, mi) => (
              <Animated.View key={m.id} entering={enter(120 + mi * 60)} style={{ gap: space.lg }}>
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

          <AppText variant="caption" color={colors.textFaint} align="center" style={{ marginTop: space.xxl }}>
            Simplified models of real situations. They sharpen how you reason — they don&apos;t predict everything.
          </AppText>
        </View>
      </ScrollView>
    </View>
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
      style={{ marginHorizontal: -space.lg, marginBottom: space.lg }}
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
            <AppText variant="small" weight="semibold" color={on ? colors.text : colors.textBody}>
              {c.title}
            </AppText>
            <AppText variant="caption" color={on ? colors.primaryText : colors.textMuted} tabular>
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
    <View style={{ gap: space.xs }} accessibilityRole="header">
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
  const status = locked
    ? `Locked · ${unlockedCount ?? 0} of 6 checkpoints submitted`
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
  practice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.xxl,
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
  practiceIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  miniTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  miniFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
});
