import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ArrowLeft, ArrowRight, Play } from '@/src/components/ui/icons';
import { allLessons } from '@/src/content/lessons';
import { allGoals } from '@/src/features/learning/records';
import { NicknameInput, useNickname, useNicknameForm } from '@/src/features/profile/nickname';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

const STEPS = 3;

/** Mark the welcome done, then open the first lesson or return to the tabs underneath. */
function finish(startLesson: boolean) {
  useProgress.getState().setSetting('onboarded', true);
  const first = allLessons()[0];
  if (startLesson && first) router.replace({ pathname: '/lesson/[lessonId]', params: { lessonId: first.id } });
  else if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * First-launch welcome, shown once per device above the tabs: a nickname, an optional goal, then straight into the
 * first lesson. Every step can be skipped. Finishing or skipping sets `settings.onboarded`, so it never comes back;
 * both can be changed later in Settings.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const enter = useEnter();
  const [step, setStep] = useState(0);

  // Android back steps back through the welcome; on the first step it skips it, like "Skip for now".
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (step > 0) setStep(step - 1);
        else finish(false);
        return true;
      });
      return () => sub.remove();
    }, [step]),
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}
        keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={styles.top}>
            {step > 0 ? <IconButton icon={ArrowLeft} label="Previous step" onPress={() => setStep(step - 1)} /> : <View style={{ width: 44, height: 44 }} />}
            <Dots step={step} />
            <View style={{ width: 44 }} />
          </View>

          <Animated.View key={step} entering={enter(0, 'fade')} style={{ gap: space.lg }}>
            {step === 0 ? <NicknameStep onDone={() => setStep(1)} /> : step === 1 ? <GoalStep onDone={() => setStep(2)} /> : <StartStep onFinish={finish} />}
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Dots({ step }: { step: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.xs }} accessible accessibilityLabel={`Step ${step + 1} of ${STEPS}`}>
      {Array.from({ length: STEPS }, (_, i) => (
        <View key={i} style={[styles.dot, i === step && { width: 20, backgroundColor: colors.primary }, i < step && { backgroundColor: colors.primaryText }]} />
      ))}
    </View>
  );
}

function NicknameStep({ onDone }: { onDone: () => void }) {
  const { name } = useNickname();
  const form = useNicknameForm(name, onDone);
  return (
    <>
      <View style={{ gap: space.sm }}>
        <AppText variant="display" accessibilityRole="header">
          What should we call you?
        </AppText>
        <AppText color={colors.textMuted}>Your nickname is how other players see you. It’s public, on leaderboards and challenges.</AppText>
      </View>
      <NicknameInput form={form} />
      <View style={{ gap: space.sm }}>
        <Button
          label={form.saving ? 'Saving…' : 'Continue'}
          icon={ArrowRight}
          disabled={form.saving || (form.touched && !!form.problem)}
          onPress={() => void form.save()}
        />
        <Button label="Skip for now" variant="ghost" disabled={form.saving} onPress={onDone} accessibilityHint="You’ll appear as Anonymous player. You can add a nickname in Settings." />
      </View>
    </>
  );
}

function GoalStep({ onDone }: { onDone: () => void }) {
  const goal = useProgress((s) => s.goal);
  const setGoal = useProgress((s) => s.setGoal);
  return (
    <>
      <View style={{ gap: space.sm }}>
        <AppText variant="title" accessibilityRole="header">
          What would you like to get better at?
        </AppText>
        <AppText color={colors.textMuted}>Optional. Your profile will suggest lessons for it first.</AppText>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Learning goal" style={{ gap: space.sm }}>
        {allGoals().map((g) => (
          <View key={g.id} style={{ flexDirection: 'row' }}>
            <ChoiceCard compact title={g.label} selected={goal === g.id} onSelect={() => setGoal(g.id)} />
          </View>
        ))}
      </View>
      <View style={{ gap: space.sm }}>
        <Button label="Continue" icon={ArrowRight} disabled={goal === null} onPress={onDone} />
        <Button label="Skip" variant="ghost" onPress={onDone} />
      </View>
    </>
  );
}

function StartStep({ onFinish }: { onFinish: (startLesson: boolean) => void }) {
  return (
    <>
      <View style={{ gap: space.sm }}>
        <AppText variant="display" accessibilityRole="header">
          You’re all set
        </AppText>
        <AppText color={colors.textMuted}>Tactiqo teaches strategic thinking through short games: make a call, see what happens, then find out why.</AppText>
      </View>
      <View style={{ gap: space.sm }}>
        <Button label="Play your first game" icon={Play} iconPosition="left" onPress={() => onFinish(true)} />
        <Button label="Look around first" variant="ghost" onPress={() => onFinish(false)} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.xxl },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh },
});
