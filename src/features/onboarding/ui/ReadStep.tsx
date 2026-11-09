import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, Hand as HandIcon, HandFist, Lightbulb, Scissors, type LucideIcon } from '@/src/components/ui/icons';
import { RivalMark } from '@/src/features/tournament/ui/parts';
import { playCue } from '@/src/features/tournament/sound';
import type { Rival } from '@/src/tournament/schema';
import { colors, radius, space } from '@/src/theme/tokens';
import { haptic, useMotionReduced } from '@/src/utils/feedback';

import { HANDS, READ_MAX_ROUNDS, READ_TARGET, playRead, readStatus, showHint, winsOf, type Hand, type ReadRound } from '../flow';
import { HAND_LABEL, SCRIPT } from '../script';
import { Card, SpokenLine, StepKicker } from './parts';

const S = SCRIPT.read;
const ICON: Record<Hand, LucideIcon> = { rock: HandFist, paper: HandIcon, scissors: Scissors };
const RESULT_WORD = { win: 'You win', loss: 'Host wins', draw: 'Draw' } as const;

/** Part 2: the player reads the Host back. The Host's habit is plain on purpose: this is the first win. */
export function ReadStep({ host, onNext }: { host: Rival; onNext: (solved: boolean) => void }) {
  const reduced = useMotionReduced();
  const [rounds, setRounds] = useState<ReadRound[]>([]);
  const status = readStatus(rounds);
  const wins = winsOf(rounds);
  const last = rounds[rounds.length - 1];

  useEffect(() => {
    if (status === 'solved') {
      haptic.success();
      playCue('win');
    }
  }, [status]);

  const play = (h: Hand) => {
    haptic.select();
    setRounds((r) => playRead(r, h));
  };

  const over = status !== 'playing';
  return (
    <View style={{ gap: space.xl }}>
      <View style={{ alignItems: 'center', gap: space.md }}>
        <RivalMark rival={host} size={68} expression={status === 'solved' ? 'surprised' : last?.result === 'loss' ? 'satisfied' : 'thinking'} />
        <StepKicker>{S.kicker}</StepKicker>
        <SpokenLine text={over ? (status === 'solved' ? S.solved : S.revealed) : S.host} />
      </View>

      <View style={styles.scoreRow} accessible accessibilityLabel={`${wins} of ${READ_TARGET} wins. Round ${Math.min(rounds.length + 1, READ_MAX_ROUNDS)} of ${READ_MAX_ROUNDS}.`}>
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          {Array.from({ length: READ_TARGET }, (_, i) => (
            <View key={i} style={[styles.pip, i < wins && { backgroundColor: colors.success, borderColor: colors.success }]} />
          ))}
        </View>
        <AppText variant="caption" color={colors.textMuted}>
          Round {Math.min(rounds.length + (over ? 0 : 1), READ_MAX_ROUNDS)} of {READ_MAX_ROUNDS}
        </AppText>
      </View>

      <View style={{ gap: space.xs }}>
        <AppText variant="overline" color={colors.textMuted}>
          {S.history}
        </AppText>
        <View style={styles.history}>
          {rounds.length === 0 ? (
            <AppText variant="small" color={colors.textFaint}>
              Nothing yet. Make your first move.
            </AppText>
          ) : (
            rounds.map((r, i) => {
              const Icon = ICON[r.host];
              const tint = r.result === 'win' ? colors.success : r.result === 'loss' ? colors.rival : colors.borderStrong;
              return (
                <Animated.View key={i} entering={reduced ? undefined : ZoomIn.duration(200)} style={[styles.chip, { borderColor: tint }]} accessible accessibilityLabel={`Round ${i + 1}: Host played ${HAND_LABEL[r.host]}, ${RESULT_WORD[r.result]}`}>
                  <Icon size={18} color={colors.rivalText} />
                </Animated.View>
              );
            })
          )}
        </View>
      </View>

      {last && !over ? (
        <Animated.View key={rounds.length} entering={reduced ? undefined : FadeIn.duration(180)}>
          <AppText variant="bodyStrong" align="center" color={last.result === 'win' ? colors.success : last.result === 'loss' ? colors.rivalText : colors.textBody}>
            {`${HAND_LABEL[last.you]} against ${HAND_LABEL[last.host]}: ${RESULT_WORD[last.result]}`}
          </AppText>
        </Animated.View>
      ) : null}

      {showHint(rounds) ? (
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(200)} style={styles.hint}>
          <Lightbulb size={16} color={colors.insight} />
          <AppText variant="small" color={colors.insight} style={{ flex: 1 }}>
            {S.hint}
          </AppText>
        </Animated.View>
      ) : null}

      {!over ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {HANDS.map((h) => {
            const Icon = ICON[h];
            return (
              <Pressable key={h} onPress={() => play(h)} accessibilityRole="button" accessibilityLabel={HAND_LABEL[h]} style={({ pressed }) => [styles.hand, pressed && { backgroundColor: colors.surfaceHigh, transform: [{ scale: 0.96 }] }]}>
                <Icon size={28} color={colors.primaryText} />
                <AppText variant="caption" color={colors.textBody}>
                  {HAND_LABEL[h]}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Animated.View entering={reduced ? undefined : FadeInDown.delay(200).duration(240)} style={{ gap: space.md }}>
          <Card tint={status === 'solved' ? colors.successSoft : colors.insightSoft} border={status === 'solved' ? colors.success : colors.insight}>
            <AppText variant="bodyStrong">{S.after}</AppText>
          </Card>
          <Button label={S.next} icon={ArrowRight} onPress={() => onNext(status === 'solved')} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pip: { width: 22, height: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  history: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, minHeight: 44, alignItems: 'center' },
  chip: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  hint: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.insightSoft },
  hand: { flex: 1, minHeight: 84, gap: space.xs, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
