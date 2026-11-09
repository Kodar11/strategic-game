import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Portrait } from '@/src/components/characters/Portrait';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, Coins, Lock, Mail } from '@/src/components/ui/icons';
import { RivalMark } from '@/src/features/tournament/ui/parts';
import { playCue } from '@/src/features/tournament/sound';
import type { Rival } from '@/src/tournament/schema';
import { colors, radius, space } from '@/src/theme/tokens';
import { haptic, useMotionReduced } from '@/src/utils/feedback';

import { MOVE_LABEL, explainOutcome, lockIn, outcomeRows, payoff, pick, startRound, type Move, type Round } from '../dilemma';
import { HOST_PREDICTION, predictionRight } from '../flow';
import { SCRIPT } from '../script';
import { Card, SpokenLine, StepKicker } from './parts';

const S = SCRIPT.envelope;
const OPEN_DELAY_MS = 1100;

/** Part 1: the Host seals a prediction, the player plays one round against Maya, then the envelope opens. */
export function EnvelopeStep({ host, onNext }: { host: Rival; onNext: (choice: Move) => void }) {
  const reduced = useMotionReduced();
  const [round, setRound] = useState<Round>(startRound);
  const [opened, setOpened] = useState(false);
  const revealed = round.phase === 'revealed';

  // The envelope opens a beat after the moves are shown: the pause is the moment.
  useEffect(() => {
    if (!revealed) return;
    const id = setTimeout(() => {
      setOpened(true);
      haptic.success();
      playCue('unlock');
    }, reduced ? 0 : OPEN_DELAY_MS);
    return () => clearTimeout(id);
  }, [revealed, reduced]);

  const choose = (m: Move) => {
    haptic.commit();
    setRound((r) => lockIn(pick(r, m)));
  };

  return (
    <View style={{ gap: space.xl }}>
      <View style={{ alignItems: 'center', gap: space.md }}>
        <RivalMark rival={host} size={76} expression={opened ? (round.phase === 'revealed' && predictionRight(round.you) ? 'satisfied' : 'surprised') : 'confident'} />
        <StepKicker>{S.kicker}</StepKicker>
        <SpokenLine text={S.host} />
      </View>

      <Envelope opened={opened} right={revealed && predictionRight(round.you)} />

      {!revealed ? (
        <Animated.View entering={reduced ? undefined : FadeInDown.delay(500).duration(260)} style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Portrait character="maya" size={52} expression="thinking" />
            <AppText variant="bodyStrong" style={{ flex: 1 }}>
              {S.setup}
            </AppText>
          </View>
          <PayoffGrid />
          <AppText variant="overline" color={colors.textMuted} align="center">
            {S.prompt}
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <MoveButton move="share" onPress={() => choose('share')} />
            <MoveButton move="take" onPress={() => choose('take')} />
          </View>
        </Animated.View>
      ) : (
        <Reveal round={round} opened={opened} onNext={() => onNext(round.you)} />
      )}
    </View>
  );
}

function Envelope({ opened, right }: { opened: boolean; right: boolean }) {
  const reduced = useMotionReduced();
  const scale = useSharedValue(1);
  const tilt = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    if (opened) {
      scale.value = withSequence(withTiming(1.06, { duration: 140 }), withSpring(1, { damping: 12 }));
      tilt.value = withSequence(withTiming(-3, { duration: 90 }), withTiming(3, { duration: 90 }), withTiming(0, { duration: 90 }));
    } else {
      // A slow idle wobble while sealed.
      tilt.value = withDelay(700, withSequence(withTiming(-2, { duration: 160 }), withTiming(2, { duration: 160 }), withTiming(0, { duration: 160 })));
    }
  }, [opened, reduced, scale, tilt]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${tilt.value}deg` }] }));

  return (
    <Animated.View style={[styles.envelope, opened && { borderColor: colors.insight, backgroundColor: colors.insightSoft }, style]} accessible accessibilityLabel={opened ? `${S.opened}: you will ${HOST_PREDICTION}.` : `${S.sealed}, sealed.`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {opened ? <Mail size={16} color={colors.insight} /> : <Lock size={16} color={colors.textMuted} />}
        <AppText variant="overline" color={opened ? colors.insight : colors.textMuted}>
          {opened ? S.opened : S.sealed}
        </AppText>
      </View>
      {opened ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(320)} style={{ alignItems: 'center', gap: space.xs }}>
          <AppText variant="title" color={colors.text} style={{ fontStyle: 'italic' }}>
            “You will {HOST_PREDICTION}.”
          </AppText>
          <AppText variant="bodyStrong" color={right ? colors.insight : colors.accent} align="center">
            {right ? S.right : S.wrong}
          </AppText>
        </Animated.View>
      ) : (
        <View style={styles.seal}>
          <AppText variant="caption" color={colors.textFaint}>
            ••••••••••
          </AppText>
        </View>
      )}
    </Animated.View>
  );
}

/** All four outcomes, shown before choosing. You on the left, Maya on the right. */
function PayoffGrid() {
  return (
    <View style={styles.grid} accessible accessibilityLabel={outcomeRows().map((r) => `${r.label}: you ${r.result.you}, Maya ${r.result.maya}`).join('. ')}>
      {outcomeRows().map((r) => (
        <View key={r.label} style={styles.cell}>
          <AppText variant="caption" color={colors.textMuted}>
            {r.label}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Coins size={14} color={colors.insight} />
            <AppText variant="bodyStrong" color={colors.primaryText} tabular>
              {r.result.you}
            </AppText>
            <AppText variant="small" color={colors.textFaint}>
              /
            </AppText>
            <AppText variant="bodyStrong" color={colors.rivalText} tabular>
              {r.result.maya}
            </AppText>
          </View>
        </View>
      ))}
    </View>
  );
}

function MoveButton({ move, onPress }: { move: Move; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={MOVE_LABEL[move]} style={({ pressed }) => [styles.move, move === 'share' ? styles.share : styles.take, pressed && { transform: [{ scale: 0.97 }] }]}>
      <AppText variant="heading" align="center">
        {MOVE_LABEL[move]}
      </AppText>
    </Pressable>
  );
}

function Reveal({ round, opened, onNext }: { round: Extract<Round, { phase: 'revealed' }>; opened: boolean; onNext: () => void }) {
  const reduced = useMotionReduced();
  const r = payoff(round.you, round.maya);
  const why = explainOutcome(round.you, round.maya);
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.duration(240)} style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Side label={S.revealYou} move={round.you} coins={r.you} color={colors.primaryText} />
        <Side label={S.revealMaya} move={round.maya} coins={r.maya} color={colors.rivalText} maya />
      </View>
      {opened ? (
        <Animated.View entering={reduced ? undefined : FadeIn.delay(250).duration(260)} style={{ gap: space.md }}>
          <Card>
            <AppText variant="small" color={colors.textBody}>
              {why.happened} {S.mayaWhy}
            </AppText>
          </Card>
          <Button label={S.next} icon={ArrowRight} onPress={onNext} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function Side({ label, move, coins, color, maya = false }: { label: string; move: Move; coins: number; color: string; maya?: boolean }) {
  return (
    <View style={[styles.side, { borderColor: color }]} accessible accessibilityLabel={`${label}: ${MOVE_LABEL[move]}, ${coins} coins`}>
      {maya ? <Portrait character="maya" size={40} expression={move === 'take' ? 'confident' : 'happy'} /> : null}
      <AppText variant="overline" color={color}>
        {label}
      </AppText>
      <AppText variant="heading">{MOVE_LABEL[move]}</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <Coins size={14} color={colors.insight} />
        <AppText variant="bodyStrong" tabular>
          {coins}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  envelope: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg, paddingHorizontal: space.lg, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: colors.bgRaised },
  seal: { paddingHorizontal: space.lg, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.surface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { flexBasis: '47%', flexGrow: 1, gap: 2, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  move: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderWidth: 1.5 },
  share: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  take: { backgroundColor: colors.rivalSoft, borderColor: colors.rival },
  side: { flex: 1, alignItems: 'center', gap: space.xs, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, backgroundColor: colors.surface },
});
