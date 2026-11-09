import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { ChevronLeft } from '@/src/components/ui/icons';
import { allLessons, getLesson } from '@/src/content/lessons';
import { allSkills } from '@/src/features/learning/records';
import { EMPTY_FLOW, STEPS, firstWeek, nextStep, parseFlow, previousStep, stepIndex, type SavedFlow } from '@/src/features/onboarding/flow';
import { recommendedLesson } from '@/src/features/onboarding/next-step';
import { SCRIPT } from '@/src/features/onboarding/script';
import { EnvelopeStep } from '@/src/features/onboarding/ui/EnvelopeStep';
import { GoalStep } from '@/src/features/onboarding/ui/GoalStep';
import { MeaningStep } from '@/src/features/onboarding/ui/MeaningStep';
import { PlanStep } from '@/src/features/onboarding/ui/PlanStep';
import { ReadStep } from '@/src/features/onboarding/ui/ReadStep';
import { TableStep } from '@/src/features/onboarding/ui/TableStep';
import { rivalOf, useTournamentContent } from '@/src/features/tournament/content';
import { playMatch } from '@/src/features/tournament/games';
import { track } from '@/src/observability';
import { useProgress } from '@/src/store/progress';
import { mainStages } from '@/src/tournament/progress';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';
import { useMotionReduced } from '@/src/utils/feedback';

/** Where the welcome is, so an app closed half-way resumes there. Cleared when the welcome ends. */
const SAVED_KEY = 'onboarding.flow.v1';

/**
 * "The First Read": the first-session experience, shown once per device above the tabs (and on request from
 * Settings). Six short parts, about ninety seconds: the Host's sealed prediction and one round against Maya, a quick
 * read of the Host's habit, what it means in everyday life, the player's goal and pace, the five rivals and the
 * season, then fair answers, a first week and the first Qualifier. Every part can be skipped (Skip jumps to the last
 * part, which still ends in the first match). Records the `onboarded` setting and the learning goal; nothing else.
 * Rules and copy: src/features/onboarding/flow.ts and script.ts; docs/ONBOARDING.md.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const reduced = useMotionReduced();
  const { doc, season } = useTournamentContent();
  // Read once: finishing sets `onboarded`, which mustn't turn this run into a replay half-way.
  const [replay] = useState(() => useProgress.getState().settings.onboarded);
  const [flow, setFlow] = useState<SavedFlow | null>(replay ? EMPTY_FLOW : null);
  const scroll = useRef<ScrollView>(null);

  const host = rivalOf(doc, doc.host);
  const stages = mainStages(season);
  const firstStage = stages[0];
  const first = firstStage?.matches[0];
  const rivals = useMemo(() => {
    const ids = stages.filter((s) => s.kind === 'arc').map((s) => s.rival);
    return [...new Set(ids)].map((id) => rivalOf(doc, id)).filter((r) => r.id !== doc.host);
  }, [stages, doc]);

  // Resume a welcome the OS closed half-way (first run only; a replay always starts at the top).
  useEffect(() => {
    if (replay) return;
    AsyncStorage.getItem(SAVED_KEY)
      .then((raw) => setFlow(parseFlow(raw)))
      .catch(() => setFlow(EMPTY_FLOW));
  }, [replay]);

  const step = flow?.step;
  useEffect(() => {
    if (!step) return;
    track('onboarding_step', { step, replay });
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [step, replay]);

  const update = useCallback(
    (patch: Partial<SavedFlow>) => {
      setFlow((f) => {
        const next = { ...(f ?? EMPTY_FLOW), ...patch };
        if (!replay) AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next)).catch(() => undefined);
        return next;
      });
    },
    [replay],
  );

  const advance = useCallback((patch: Partial<SavedFlow> = {}) => update({ ...patch, step: nextStep(flow?.step ?? 'envelope') }), [update, flow?.step]);
  const skip = useCallback(() => update({ step: 'plan', skipped: true }), [update]);

  const finish = useCallback(
    (play: boolean) => {
      const f = flow ?? EMPTY_FLOW;
      track('onboarding_finished', {
        result: f.skipped ? 'skipped' : 'completed',
        at_step: f.step,
        ...(f.choice ? { choice: f.choice } : {}),
        ...(f.readSolved !== null ? { read_solved: f.readSolved } : {}),
        ...(f.goal ? { goal: f.goal } : {}),
        ...(f.minutes ? { daily_minutes: f.minutes } : {}),
        next: play ? 'match' : 'explore',
        replay,
      });
      const store = useProgress.getState();
      if (f.goal) store.setGoal(f.goal);
      store.setSetting('onboarded', true);
      AsyncStorage.removeItem(SAVED_KEY).catch(() => undefined);
      // Play first, learn after: the welcome opens the first match itself; its result points to the idea behind it.
      if (play && first && firstStage) playMatch(firstStage, first, first.level, { replace: true });
      else if (router.canGoBack()) router.back();
      else router.replace('/');
    },
    [flow, replay, first, firstStage],
  );

  // Android back: one part back; from the first part, to the end (first run) or out (replay).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        const prev = step ? previousStep(step) : null;
        if (prev) update({ step: prev });
        else if (replay) finish(false);
        else skip();
        return true;
      });
      return () => sub.remove();
    }, [step, update, replay, finish, skip]),
  );

  const plan = useMemo(() => {
    const goal = flow?.goal;
    const skillLesson = goal && goal !== 'none' ? allSkills().find((s) => s.id === goal)?.lesson : undefined;
    // The goal's own lesson; otherwise the Prisoner's Dilemma lesson (what they just played), or their next open one.
    const lesson = getLesson(skillLesson) ?? recommendedLesson(allLessons(), useProgress.getState().completed);
    return firstWeek({ minutes: flow?.minutes ?? null, rival: rivals[0]?.name ?? 'the first rival', lesson });
  }, [flow?.goal, flow?.minutes, rivals]);

  if (!flow) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const index = stepIndex(flow.step);
  const prev = previousStep(flow.step);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.3} />
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <View style={{ width: 72 }}>
          {prev ? (
            <Pressable onPress={() => update({ step: prev })} accessibilityRole="button" accessibilityLabel={SCRIPT.back} hitSlop={12} style={styles.topButton}>
              <ChevronLeft size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.dots} accessible accessibilityLabel={`Part ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.dot, i <= index && { backgroundColor: colors.primary }, i === index && { width: 20 }]} />
          ))}
        </View>
        <View style={{ width: 72, alignItems: 'flex-end' }}>
          {flow.step !== 'plan' ? (
            <Pressable onPress={skip} accessibilityRole="button" accessibilityLabel="Skip the introduction" hitSlop={12} style={styles.topButton}>
              <AppText variant="bodyStrong" color={colors.textMuted}>
                {SCRIPT.skip}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.lg, paddingBottom: insets.bottom + space.xxl }}>
        <Animated.View key={flow.step} entering={reduced ? undefined : FadeIn.duration(260)} style={styles.column}>
          {flow.step === 'envelope' ? <EnvelopeStep host={host} onNext={(choice) => advance({ choice })} /> : null}
          {flow.step === 'read' ? <ReadStep host={host} onNext={(readSolved) => advance({ readSolved })} /> : null}
          {flow.step === 'meaning' ? <MeaningStep onNext={() => advance()} /> : null}
          {flow.step === 'goal' ? <GoalStep goal={flow.goal} minutes={flow.minutes} onGoal={(goal) => update({ goal })} onMinutes={(minutes) => update({ minutes })} onNext={() => advance()} /> : null}
          {flow.step === 'table' ? <TableStep host={host} rivals={rivals} onNext={() => advance()} /> : null}
          {flow.step === 'plan' ? <PlanStep days={plan} minutes={flow.minutes} replay={replay} onStart={() => finish(true)} onExplore={() => finish(false)} /> : null}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.xs },
  topButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', borderRadius: radius.pill },
  dots: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh },
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
});
