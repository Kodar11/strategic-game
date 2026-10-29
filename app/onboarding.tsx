import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { ArrowLeft, ArrowRight } from '@/src/components/ui/icons';
import { allLessons } from '@/src/content/lessons';
import { type Move, type Round, lockIn, pick, startRound } from '@/src/features/onboarding/dilemma';
import { recommendedLesson } from '@/src/features/onboarding/next-step';
import { DilemmaStage, RevealStage } from '@/src/features/onboarding/ui/DilemmaStages';
import { WelcomeArt } from '@/src/features/onboarding/ui/WelcomeArt';
import { WorldStage } from '@/src/features/onboarding/ui/WorldStage';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

type Stage = 'welcome' | 'dilemma' | 'reveal' | 'world';
const STAGES: Stage[] = ['welcome', 'dilemma', 'reveal', 'world'];

/**
 * Leave the welcome: mark it done on this device, then open the recommended lesson or return to the tabs underneath.
 * The flag is set only here, at the moment of leaving, so an interrupted welcome simply shows again next launch.
 */
function finish(lessonId?: string) {
  useProgress.getState().setSetting('onboarded', true);
  if (lessonId) router.replace({ pathname: '/lesson/[lessonId]', params: { lessonId } });
  else if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * The first-session experience, shown once per device above the tabs (and on request from Settings): a welcome, one
 * strategic decision against Maya, the reveal and what it means, then the rest of the app and one recommended next
 * step. It is skippable at every stage. The dilemma is self-contained (src/features/onboarding/dilemma.ts) and
 * records nothing: no lesson, game or profile progress is read or written apart from the `onboarded` setting.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>('welcome');
  const [round, setRound] = useState<Round>(startRound);
  const completed = useProgress((s) => s.completed);
  const next = recommendedLesson(allLessons(), completed);

  const back = useCallback(() => {
    if (stage === 'welcome') finish();
    else if (stage === 'dilemma') setStage('welcome');
    else if (stage === 'reveal') {
      setRound(startRound());
      setStage('dilemma');
    } else setStage('reveal');
  }, [stage]);

  // Android back steps back through the stages; on the welcome it leaves, like "Skip".
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        back();
        return true;
      });
      return () => sub.remove();
    }, [back]),
  );

  const replay = () => {
    setRound(startRound());
    setStage('dilemma');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={stage === 'welcome' ? 0.2 : 0.12} />
      <ScrollView
        key={stage}
        contentContainerStyle={{ flexGrow: 1, padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          {stage === 'welcome' ? null : (
            <View style={styles.top}>
              <IconButton icon={ArrowLeft} label="Back" onPress={back} />
              <Dots stage={stage} />
              {stage === 'world' ? (
                <View style={{ width: 44 }} />
              ) : (
                <Pressable onPress={() => finish()} accessibilityRole="button" accessibilityLabel="Skip the introduction" hitSlop={8} style={styles.skip}>
                  <AppText variant="small" weight="semibold" color={colors.textMuted}>
                    Skip
                  </AppText>
                </Pressable>
              )}
            </View>
          )}

          {stage === 'welcome' ? (
            <Welcome onStart={() => setStage('dilemma')} onSkip={() => finish()} />
          ) : stage === 'dilemma' && round.phase === 'choosing' ? (
            <DilemmaStage
              round={round}
              onPick={(m: Move) => setRound((r) => pick(r, m))}
              onLockIn={() => {
                setRound((r) => lockIn(r));
                setStage('reveal');
              }}
            />
          ) : stage === 'reveal' && round.phase === 'revealed' ? (
            <RevealStage round={round} onReplay={replay} onContinue={() => setStage('world')} />
          ) : stage === 'world' ? (
            <WorldStage next={next} onStart={() => finish(next?.id)} onExplore={() => finish()} />
          ) : (
            // A stage without a matching round can't normally happen; offer a way on rather than a blank screen.
            <Button label="Start the decision" onPress={replay} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Welcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const enter = useEnter();
  return (
    <View style={styles.welcome}>
      <WelcomeArt />
      <Animated.View entering={enter(200)} style={{ gap: space.md }}>
        <AppText variant="display" align="center" accessibilityRole="header">
          Think beyond the obvious.
        </AppText>
        <AppText color={colors.textMuted} align="center">
          Discover how decisions, incentives and human behaviour shape the game. Starting with one of yours.
        </AppText>
      </Animated.View>
      <Animated.View entering={enter(320)} style={{ gap: space.sm }}>
        <Button label="Experience Tactiqo" icon={ArrowRight} onPress={onStart} accessibilityHint="A one-minute strategic decision" />
        <Button label="Skip to the app" variant="ghost" onPress={onSkip} />
      </Animated.View>
    </View>
  );
}

function Dots({ stage }: { stage: Stage }) {
  const step = STAGES.indexOf(stage);
  return (
    <View style={{ flexDirection: 'row', gap: space.xs }} accessible accessibilityLabel={`Step ${step + 1} of ${STAGES.length}`}>
      {STAGES.map((s, i) => (
        <View key={s} style={[styles.dot, i === step && { width: 20, backgroundColor: colors.primary }, i < step && { backgroundColor: colors.primaryText }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.xl },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  welcome: { flex: 1, justifyContent: 'center', gap: space.xxl, paddingVertical: space.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh },
});
