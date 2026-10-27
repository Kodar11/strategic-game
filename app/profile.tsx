import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, Compass, Lightbulb } from '@/src/components/ui/icons';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Portrait } from '@/src/components/characters/Portrait';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { allLessons, type LessonId, allModules, getLesson } from '@/src/content/lessons';
import { type Insight, type SkillSummary, buildProfile, lessonsForSkill } from '@/src/features/learning/profile';
import { allGoals, type GoalId } from '@/src/features/learning/records';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

function openLesson(id: LessonId) {
  router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: id } });
}

function openChallenges(id: LessonId) {
  router.push({ pathname: '/challenges/[lessonId]', params: { lessonId: id } });
}

const lessonNumber = (id: LessonId) => allLessons().find((l) => l.id === id)!.number;

/**
 * Strategic Thinking Profile: progress, one grounded observation, confidence against results, and one next step —
 * all derived from the learner's learning record (see src/features/learning/profile.ts for every rule).
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const hydrated = useProgress((s) => s.hydrated);
  const learning = useProgress((s) => s.learning);
  const completed = useProgress((s) => s.completed);
  const runtime = useProgress((s) => s.runtime);
  const goal = useProgress((s) => s.goal);
  const setGoal = useProgress((s) => s.setGoal);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalSkipped, setGoalSkipped] = useState(false);

  const inProgress = useMemo(() => allLessons().filter((l) => (runtime[l.id]?.step ?? 0) > 0).map((l) => l.id), [runtime]);
  const profile = useMemo(() => buildProfile({ attempts: learning, completed, inProgress, goal }), [learning, completed, inProgress, goal]);

  if (!hydrated) return <MessageScreen loading />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const { progress, primary, secondary, confidence, next, practice } = profile;
  const showGoalPicker = editingGoal || (goal === null && !goalSkipped);
  const pct = progress.total ? progress.completed / progress.total : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          <View style={styles.head}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              Your strategic thinking
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <Portrait character="sen" expression="thinking" size={48} />
            <AppText variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              A reflection on how you make decisions, built only from the predictions you&apos;ve made in this app. It describes what you did — not who you are.
            </AppText>
          </View>

          {/* 1 · Progress */}
          <Card style={{ gap: space.sm }}>
            <SectionLabel>Your progress</SectionLabel>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
              <AppText variant="heading" tabular>
                {progress.completed} of {progress.total}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                lessons completed
              </AppText>
            </View>
            <View
              style={styles.track}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${progress.completed} of ${progress.total} lessons completed`}
              accessibilityValue={{ min: 0, max: progress.total, now: progress.completed }}>
              <View style={[styles.fill, { width: `${pct * 100}%` }]} />
            </View>
            <AppText variant="caption" color={colors.textMuted}>
              {progress.predictions === 0
                ? 'No predictions recorded yet — they appear here as you play.'
                : `${progress.predictions} ${progress.predictions === 1 ? 'prediction' : 'predictions'} recorded${progress.inProgress ? ` · ${progress.inProgress} lesson${progress.inProgress === 1 ? '' : 's'} in progress` : ''}.`}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {progress.challengesTried} of {progress.challengesTotal} practice challenges tried.
            </AppText>
          </Card>

          {/* 2 · Skill areas */}
          <Card style={{ gap: space.md }}>
            <SectionLabel>Your strategic thinking</SectionLabel>
            {profile.skills.map((s) => (
              <SkillRow key={s.id} skill={s} completed={completed} />
            ))}
            <AppText variant="caption" color={colors.textMuted}>
              Chips show the lessons that practise each area, by module: completed / total.
            </AppText>
          </Card>

          {/* 3 · Decision-making pattern (the primary insight) */}
          <View style={{ gap: space.sm }}>
            <SectionLabel>Your decision-making pattern</SectionLabel>
            {primary ? (
              <>
                <InsightCard insight={primary} primary />
                {secondary ? <InsightCard insight={secondary} /> : null}
              </>
            ) : (
              <Card style={{ gap: space.xs }}>
                <AppText variant="bodyStrong">Play a few more scenarios to discover your decision-making patterns.</AppText>
                <AppText variant="small" color={colors.textMuted}>
                  Patterns only appear once a few of your predictions can be compared with the model — guesses about things you couldn&apos;t know never count against you.
                </AppText>
              </Card>
            )}
          </View>

          {/* First tries, practice and transfer — first attempts are the evidence; retries only show what changed. */}
          <Card style={{ gap: space.md }}>
            <SectionLabel>First tries and practice</SectionLabel>
            <PracticeRow title="First tries" text={practice.first.text} ready={practice.first.ready} />
            <PracticeRow title="After feedback" text={practice.improvement.text} ready={practice.improvement.ready} />
            <View style={{ gap: 4 }}>
              <AppText variant="small" weight="semibold">
                New situations
              </AppText>
              {practice.transfer.lines.map((l) => (
                <AppText key={l.lesson} variant="small" color={colors.textBody}>
                  {l.text}
                </AppText>
              ))}
              <AppText variant="small" color={colors.textMuted}>
                {practice.transfer.text}
              </AppText>
            </View>
          </Card>

          {/* 4 · Confidence vs results */}
          <Card style={{ gap: space.sm }}>
            <SectionLabel>Confidence and results</SectionLabel>
            {confidence.ready && confidence.groups.length ? (
              confidence.groups.map((g) => (
                <View key={g.label} style={{ gap: 4 }} accessible accessibilityLabel={g.text}>
                  <AppText variant="small" weight="semibold">
                    {g.label}
                  </AppText>
                  <Dots total={g.count} filled={g.matched} />
                  <AppText variant="small" color={colors.textBody}>
                    {g.text}
                  </AppText>
                </View>
              ))
            ) : null}
            <AppText variant="small" color={confidence.groups.length ? colors.textMuted : colors.textBody}>
              {confidence.message}
            </AppText>
          </Card>

          {/* Optional goal */}
          <Card style={{ gap: space.sm }}>
            <SectionLabel>Your goal (optional)</SectionLabel>
            {showGoalPicker ? (
              <>
                <AppText variant="bodyStrong">What would you like to get better at?</AppText>
                <View accessibilityRole="radiogroup" accessibilityLabel="What would you like to get better at?" style={{ gap: space.sm }}>
                  {allGoals().map((g) => (
                    <View key={g.id} style={{ flexDirection: 'row' }}>
                      <ChoiceCard
                        compact
                        title={g.label}
                        selected={goal === g.id}
                        onSelect={() => {
                          setGoal(g.id as GoalId);
                          setEditingGoal(false);
                        }}
                      />
                    </View>
                  ))}
                </View>
                <Button
                  label={goal === null ? 'Skip for now' : 'Keep my current goal'}
                  variant="ghost"
                  compact
                  onPress={() => {
                    setGoalSkipped(true);
                    setEditingGoal(false);
                  }}
                />
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <AppText variant="small" style={{ flex: 1 }}>
                  {goal ? allGoals().find((g) => g.id === goal)!.label : 'No goal chosen. You can pick one any time.'}
                </AppText>
                <Button label={goal ? 'Change' : 'Choose'} variant="secondary" compact onPress={() => setEditingGoal(true)} />
              </View>
            )}
          </Card>

          {/* 5 · Next step */}
          <View style={styles.next}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Compass size={18} color={colors.primaryText} strokeWidth={2.2} />
              <AppText variant="overline" color={colors.primaryText}>
                Your next step
              </AppText>
            </View>
            <AppText variant="heading">{next.title}</AppText>
            <AppText variant="small" color={colors.textBody}>
              {next.body}
            </AppText>
            <Button label={next.cta} icon={ArrowRight} compact onPress={() => (next.kind === 'challenges' ? openChallenges(next.lesson) : openLesson(next.lesson))} />
          </View>

          <AppText variant="caption" color={colors.textMuted} align="center">
            This is worked out on your device from your saved answers. You can export or reset them in Settings.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

function InsightCard({ insight, primary }: { insight: Insight; primary?: boolean }) {
  return (
    <View style={[styles.insight, primary ? styles.insightPrimary : null]}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        {primary ? <Lightbulb size={18} color={colors.insight} strokeWidth={2.2} /> : null}
        <AppText variant={primary ? 'bodyStrong' : 'small'} weight="semibold" color={primary ? colors.insight : colors.text} style={{ flex: 1 }}>
          {insight.title}
        </AppText>
      </View>
      <AppText variant="small" color={colors.textBody}>
        {insight.body}
      </AppText>
      <AppText variant="caption" color={colors.textMuted}>
        Why we say this: {insight.evidence}
      </AppText>
      {primary && insight.lesson ? (
        <Button
          label={`Open lesson ${lessonNumber(insight.lesson)}`}
          variant="ghost"
          compact
          icon={ArrowRight}
          onPress={() => openLesson(insight.lesson!)}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
    </View>
  );
}

function PracticeRow({ title, text, ready }: { title: string; text: string; ready: boolean }) {
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${title}. ${text}`}>
      <AppText variant="small" weight="semibold">
        {title}
      </AppText>
      <AppText variant="small" color={ready ? colors.textBody : colors.textMuted}>
        {text}
      </AppText>
    </View>
  );
}

/**
 * One skill area. The lessons that practise it are summarised per module (completed / total) instead of as a raw
 * list of lesson numbers; the full list stays in the accessibility label.
 */
function SkillRow({ skill, completed }: { skill: SkillSummary; completed: readonly LessonId[] }) {
  const lessons = lessonsForSkill(skill.id);
  const done = lessons.filter((id) => completed.includes(id)).length;
  const byModule = allModules().map((m) => {
    const inModule = lessons.filter((id) => getLesson(id)!.module === m.id);
    return { module: m, total: inModule.length, done: inModule.filter((id) => completed.includes(id)).length };
  }).filter((g) => g.total > 0);
  const label = `${skill.label}. ${skill.text} Practised in lessons ${lessons.map(lessonNumber).join(', ')}; ${done} of ${lessons.length} completed.`;
  return (
    <View style={styles.skill} accessible accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {skill.label}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} tabular>
          {done} of {lessons.length} lessons done
        </AppText>
      </View>
      {skill.status === 'observed' ? <Dots total={skill.judged} filled={skill.matched} /> : null}
      <AppText variant="small" color={skill.status === 'observed' ? colors.textBody : colors.textMuted}>
        {skill.text}
      </AppText>
      <View style={styles.modules} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {byModule.map(({ module, total, done: d }) => (
          <View key={module.id} style={[styles.moduleChip, d === total && styles.moduleChipDone]}>
            <AppText variant="caption" color={d === total ? colors.success : colors.textBody} tabular>
              M{module.number}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} tabular>
              {d}/{total}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** One dot per prediction: filled when it matched the model. Counts, not a score. */
function Dots({ total, filled }: { total: number; filled: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i < filled ? styles.dotOn : null]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  insight: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  insightPrimary: { backgroundColor: colors.insightSoft, borderColor: 'rgba(253,186,116,0.35)' },
  next: { gap: space.sm, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  skill: { gap: space.xs, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modules: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xxs },
  moduleChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(148,163,184,0.10)' },
  moduleChipDone: { backgroundColor: colors.successSoft },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.textMuted },
  dotOn: { backgroundColor: colors.primaryText, borderColor: colors.primaryText },
});
