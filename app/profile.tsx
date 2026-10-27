import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, ChevronDown, Compass, Lightbulb, Target, TrendingUp, Trophy } from '@/src/components/ui/icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { allLessons, type LessonId, allModules, getLesson } from '@/src/content/lessons';
import { useDaily } from '@/src/data/daily-session';
import { dailyEvidence } from '@/src/features/daily/evidence';
import { type Insight, type PeriodCount, type SkillSummary, buildProfile, lessonsForSkill } from '@/src/features/learning/profile';
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
 * Strategic Thinking Profile, readable at a glance: how first answers compare with the model, the four skill areas,
 * one strength, one area to work on and the next step; then confidence against results and change over time. The
 * longer observations (insights, practice, transfer, lessons per area, goal) sit behind "More detail". Everything
 * is derived from the learning record and qualifying Daily Challenge answers (src/features/learning/profile.ts and
 * src/features/daily/evidence.ts hold every rule); nothing here is stored.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const hydrated = useProgress((s) => s.hydrated);
  const learning = useProgress((s) => s.learning);
  const completed = useProgress((s) => s.completed);
  const runtime = useProgress((s) => s.runtime);
  const goal = useProgress((s) => s.goal);
  const dailyHistory = useDaily((s) => s.history);
  const [details, setDetails] = useState(false);

  const inProgress = useMemo(() => allLessons().filter((l) => (runtime[l.id]?.step ?? 0) > 0).map((l) => l.id), [runtime]);
  const daily = useMemo(() => (dailyHistory ? dailyEvidence(dailyHistory) : []), [dailyHistory]);
  const profile = useMemo(() => buildProfile({ attempts: learning, completed, inProgress, goal, daily }), [learning, completed, inProgress, goal, daily]);

  if (!hydrated) return <MessageScreen loading />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const { progress, glance, trend, confidence, next } = profile;

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

          {/* A · Summary */}
          <Card style={{ gap: space.sm }}>
            <SectionLabel>At a glance</SectionLabel>
            {glance.ready ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }} accessible accessibilityLabel={glance.text}>
                <AppText variant="number" tabular>
                  {glance.matched}
                  <AppText variant="heading" color={colors.textMuted}>
                    {' '}
                    / {glance.judged}
                  </AppText>
                </AppText>
                <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
                  first answers you could work out matched the model
                </AppText>
              </View>
            ) : (
              <>
                <AppText variant="heading">Building your profile</AppText>
                <AppText variant="small" color={colors.textBody}>
                  {glance.text}
                </AppText>
              </>
            )}
            <View style={styles.chips}>
              <Chip label={`${progress.completed}/${progress.total} lessons`} />
              <Chip label={`${progress.predictions} predictions`} />
              {progress.dailyCounted ? <Chip label={`${progress.dailyCounted} daily`} /> : null}
            </View>
          </Card>

          {/* B · Skill areas */}
          <Card style={{ gap: space.md }}>
            <SectionLabel>Skill areas · first answers matched</SectionLabel>
            {profile.skills.map((s) => (
              <SkillBar key={s.id} skill={s} />
            ))}
          </Card>

          {/* C · One strength, one area to work on, one next step */}
          <View style={styles.pair}>
            <Tile
              icon={Trophy}
              tint={colors.success}
              kicker="Strength"
              title={glance.strength?.label ?? 'Not clear yet'}
              body={glance.strength ? `${glance.strength.matched} of ${glance.strength.judged} matched` : 'Needs a few more answers in one area'}
            />
            <Tile
              icon={Target}
              tint={colors.rivalText}
              kicker="Work on"
              title={glance.focus?.skill.label ?? 'Not clear yet'}
              body={glance.focus ? (glance.focus.reason === 'weak' ? `${glance.focus.skill.matched} of ${glance.focus.skill.judged} matched` : 'Least tested so far') : 'Make a few predictions first'}
            />
          </View>
          <View style={styles.next}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Compass size={18} color={colors.primaryText} strokeWidth={2.2} />
              <AppText variant="overline" color={colors.primaryText}>
                Your next step
              </AppText>
            </View>
            <AppText variant="bodyStrong">{next.title}</AppText>
            <Button label={next.cta} icon={ArrowRight} compact onPress={() => (next.kind === 'challenges' ? openChallenges(next.lesson) : openLesson(next.lesson))} accessibilityHint={next.body} />
          </View>

          {/* Confidence against results — kept apart from correctness */}
          <Card style={{ gap: space.sm }}>
            <SectionLabel>Confidence and results</SectionLabel>
            {confidence.ready && confidence.groups.length ? (
              confidence.groups.map((g) => (
                <View key={g.label} style={{ gap: 4 }} accessible accessibilityLabel={g.text}>
                  <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'baseline' }}>
                    <AppText variant="small" weight="semibold" style={{ flex: 1 }}>
                      {g.label}
                    </AppText>
                    <AppText variant="small" color={colors.textBody} tabular>
                      {g.matched} of {g.count} matched
                    </AppText>
                  </View>
                  <Dots total={g.count} filled={g.matched} />
                </View>
              ))
            ) : (
              <AppText variant="small" color={colors.textMuted}>
                {confidence.message}
              </AppText>
            )}
          </Card>

          {/* D · Change over time, only with enough records in both periods */}
          <Card style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <TrendingUp size={16} color={colors.textMuted} />
              <SectionLabel>Over time</SectionLabel>
            </View>
            {trend.ready ? (
              <>
                <PeriodBar label={`Last ${trend.days / 7} weeks`} count={trend.recent} highlight />
                <PeriodBar label={`${trend.days / 7} weeks before`} count={trend.previous} />
                <AppText variant="caption" color={colors.textMuted}>
                  {trend.direction === 'higher' ? 'A higher match rate than before.' : trend.direction === 'lower' ? 'A lower match rate than before.' : 'The same match rate as before.'} Different questions each period, so it’s a rough signal.
                </AppText>
              </>
            ) : (
              <AppText variant="small" color={colors.textMuted}>
                {trend.text}
              </AppText>
            )}
          </Card>

          {/* E · Optional details */}
          <Pressable
            onPress={() => setDetails((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: details }}
            style={({ pressed }) => [styles.toggle, pressed && { backgroundColor: colors.surfaceHigh }]}>
            <AppText variant="bodyStrong" style={{ flex: 1 }}>
              More detail
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              Patterns, practice, lessons, goal
            </AppText>
            <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: details ? '180deg' : '0deg' }] }} />
          </Pressable>
          {details ? <Details profile={profile} completed={completed} goal={goal} /> : null}

          <AppText variant="caption" color={colors.textMuted} align="center">
            Worked out on your device from your saved answers{progress.dailyCounted ? ' and daily challenges' : ''}. It describes what you did — not who you are.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

function Details({ profile, completed, goal }: { profile: ReturnType<typeof buildProfile>; completed: readonly LessonId[]; goal: GoalId | null }) {
  const setGoal = useProgress((s) => s.setGoal);
  const [editingGoal, setEditingGoal] = useState(false);
  const { primary, secondary, practice, progress, next } = profile;
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <SectionLabel>Your decision-making pattern</SectionLabel>
        {primary ? (
          <>
            <InsightCard insight={primary} primary />
            {secondary ? <InsightCard insight={secondary} /> : null}
          </>
        ) : (
          <Card style={{ gap: space.xs }}>
            <AppText variant="small" color={colors.textBody}>
              Patterns appear once a few of your predictions can be compared with the model — guesses about things you couldn&apos;t know never count against you.
            </AppText>
          </Card>
        )}
      </View>

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
        <AppText variant="caption" color={colors.textMuted}>
          {progress.challengesTried} of {progress.challengesTotal} practice challenges tried.
        </AppText>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionLabel>Where each area is practised</SectionLabel>
        {profile.skills.map((s) => (
          <SkillLessons key={s.id} skill={s} completed={completed} />
        ))}
        <AppText variant="caption" color={colors.textMuted}>
          Chips show the lessons that practise each area, by module: completed / total.
        </AppText>
      </Card>

      <Card style={{ gap: space.sm }}>
        <SectionLabel>Your goal (optional)</SectionLabel>
        {editingGoal ? (
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
            <Button label={goal === null ? 'Skip for now' : 'Keep my current goal'} variant="ghost" compact onPress={() => setEditingGoal(false)} />
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <AppText variant="small" style={{ flex: 1 }}>
              {goal ? allGoals().find((g) => g.id === goal)!.label : 'No goal chosen. A goal puts its area first in your next step.'}
            </AppText>
            <Button label={goal ? 'Change' : 'Choose'} variant="secondary" compact onPress={() => setEditingGoal(true)} />
          </View>
        )}
      </Card>

      <AppText variant="small" color={colors.textMuted}>
        Why this next step: {next.body}
      </AppText>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <AppText variant="caption" color={colors.textBody} tabular>
        {label}
      </AppText>
    </View>
  );
}

/**
 * One skill area as a compact bar. The bar is drawn only once there is enough evidence (the profile's existing
 * `observed` status); before that the row says "Exploring" or "Not tried", so missing data never looks like zero.
 */
function SkillBar({ skill }: { skill: SkillSummary }) {
  const observed = skill.status === 'observed';
  const status = observed ? `${skill.matched} of ${skill.judged}` : skill.status === 'exploring' ? 'Exploring' : 'Not tried';
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${skill.label}. ${skill.text}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
        <AppText variant="small" weight="semibold" style={{ flex: 1 }}>
          {skill.label}
        </AppText>
        <AppText variant="caption" color={observed ? colors.text : colors.textMuted} tabular>
          {status}
        </AppText>
      </View>
      <View style={[styles.track, !observed && styles.trackEmpty]}>
        {observed ? <View style={[styles.fill, { width: `${(skill.matched / skill.judged) * 100}%` }]} /> : null}
      </View>
    </View>
  );
}

function Tile({ icon: Icon, tint, kicker, title, body }: { icon: typeof Trophy; tint: string; kicker: string; title: string; body: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${kicker}: ${title}. ${body}.`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <Icon size={14} color={tint} strokeWidth={2.4} />
        <AppText variant="overline" color={tint}>
          {kicker}
        </AppText>
      </View>
      <AppText variant="bodyStrong">{title}</AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {body}
      </AppText>
    </View>
  );
}

function PeriodBar({ label, count, highlight }: { label: string; count: PeriodCount; highlight?: boolean }) {
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${label}: ${count.matched} of ${count.judged} matched`}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <AppText variant="small" color={highlight ? colors.text : colors.textBody} style={{ flex: 1 }}>
          {label}
        </AppText>
        <AppText variant="small" color={colors.textBody} tabular>
          {count.matched} of {count.judged}
        </AppText>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(count.matched / count.judged) * 100}%` }, !highlight && { backgroundColor: colors.textFaint }]} />
      </View>
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

/** The lessons that practise an area, summarised per module (completed / total); the full list is in the label. */
function SkillLessons({ skill, completed }: { skill: SkillSummary; completed: readonly LessonId[] }) {
  const lessons = lessonsForSkill(skill.id);
  const done = lessons.filter((id) => completed.includes(id)).length;
  const byModule = allModules()
    .map((m) => {
      const inModule = lessons.filter((id) => getLesson(id)!.module === m.id);
      return { module: m, total: inModule.length, done: inModule.filter((id) => completed.includes(id)).length };
    })
    .filter((g) => g.total > 0);
  const label = `${skill.label}. ${skill.text} Practised in lessons ${lessons.map(lessonNumber).join(', ')}; ${done} of ${lessons.length} completed.`;
  return (
    <View style={styles.skill} accessible accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
        <AppText variant="small" weight="semibold" style={{ flex: 1 }}>
          {skill.label}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} tabular>
          {done} of {lessons.length} lessons done
        </AppText>
      </View>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  chip: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(148,163,184,0.12)' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  trackEmpty: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { flexGrow: 1, flexBasis: 140, gap: 2, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  insight: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  insightPrimary: { backgroundColor: colors.insightSoft, borderColor: 'rgba(253,186,116,0.35)' },
  next: { gap: space.sm, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
  skill: { gap: space.xs, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modules: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xxs },
  moduleChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(148,163,184,0.10)' },
  moduleChipDone: { backgroundColor: colors.successSoft },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.textMuted },
  dotOn: { backgroundColor: colors.primaryText, borderColor: colors.primaryText },
});
