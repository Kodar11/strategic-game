import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, CircleCheck, Play, Repeat, X } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { Chip, Stepper } from '@/src/features/arena/ui/library/kit';
import { type RepeatKind, defaultCount, roundsLeft } from '@/src/repeat/plan';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import type { RepeatController } from './useRepeat';

const KIND: Record<RepeatKind, string> = { fixed: 'Same move', pattern: 'Pattern', conditional: 'Reacts to them' };

const roundsText = (n: number, word: string) => `${n} ${n === 1 ? word.replace(/s$/, '') : word}`;

/**
 * "Repeat a strategy": optional, folded to one button between decisions. Choosing opens a compact setup (only the
 * strategies this game supports, an amount where the strategy needs one, and how many rounds); while a run is going
 * it becomes a status strip with Cancel Repeat. Nothing is pre-armed and nothing is remembered between runs.
 * `hidden`: the screen isn't at a decision (a reveal pause the player drives, a result) — only a running strip shows.
 */
export function RepeatPanel({ repeat, roundWord = 'rounds', hidden }: { repeat: RepeatController; roundWord?: string; hidden?: boolean }) {
  const reduced = useMotionReduced();
  const [open, setOpen] = useState(false);
  const { progress } = repeat;
  const left = roundsLeft(progress);
  const strategies = repeat.game.strategies;
  const [picked, setPicked] = useState<string | null>(strategies.length === 1 ? strategies[0].id : null);
  const chosen = strategies.find((s) => s.id === picked);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const amount = chosen?.amount ? (amounts[chosen.id] ?? chosen.amount.initial) : 0;
  const [count, setCount] = useState<number | null>(null);
  const rounds = Math.min(left, Math.max(1, count ?? defaultCount(progress)));
  const enter = reduced ? undefined : FadeIn.duration(180);

  if (repeat.running && repeat.plan) {
    const { plan } = repeat;
    const done = repeat.completed;
    const label = repeat.strategy?.label(plan.amount) ?? '';
    const current = Math.min(progress.played + 1, progress.total);
    return (
      <Animated.View entering={enter} style={[styles.box, styles.running]} accessibilityLiveRegion="polite">
        <View style={styles.row}>
          <Repeat size={16} color={colors.accent} />
          <AppText variant="overline" color={colors.accent} style={{ flex: 1 }}>
            Repeating · round {current} of {progress.total}
          </AppText>
        </View>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {label}
        </AppText>
        <View style={styles.track} accessible accessibilityLabel={`${done} of ${plan.count} repeated ${roundWord} done, ${plan.count - done} to go.`}>
          {Array.from({ length: plan.count }, (_, i) => (
            <View key={i} style={[styles.pip, i < done ? { backgroundColor: colors.accent } : i === done ? styles.pipNow : null]} />
          ))}
        </View>
        <AppText variant="small" color={colors.textBody}>
          {done} of {plan.count} done · {roundsText(plan.count - done, roundWord)} to go
        </AppText>
        <Button label="Cancel Repeat" variant="secondary" compact icon={X} iconPosition="left" accessibilityHint="Stops before the next decision. Rounds already played stay as they are." onPress={repeat.cancel} />
      </Animated.View>
    );
  }

  if (hidden || progress.over || left === 0) return null;

  const notice = repeat.last && repeat.last.reason !== 'match-over' ? noticeFor(repeat.last.reason, repeat.last.completed, roundWord) : null;

  if (!open) {
    return (
      <View style={{ gap: space.xs }}>
        {notice ? (
          <Animated.View entering={enter} style={styles.row} accessibilityLiveRegion="polite">
            <CircleCheck size={14} color={colors.textMuted} />
            <AppText variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              {notice}
            </AppText>
          </Animated.View>
        ) : null}
        <Button
          label="Repeat a strategy"
          variant="ghost"
          compact
          icon={Repeat}
          iconPosition="left"
          disabled={progress.busy}
          accessibilityHint="Optional. Choose a move or strategy to play several rounds for you; you can cancel at any time."
          onPress={() => setOpen(true)}
          style={{ alignSelf: 'center' }}
        />
      </View>
    );
  }

  const start = () => {
    if (!chosen) return;
    repeat.start(chosen.id, amount, rounds);
    setOpen(false);
    setCount(null);
  };

  return (
    <Animated.View entering={enter} style={styles.box}>
      <View style={styles.row}>
        <Repeat size={16} color={colors.accent} />
        <AppText variant="overline" color={colors.accent} accessibilityRole="header" style={{ flex: 1 }}>
          Repeat a strategy
        </AppText>
      </View>
      <AppText variant="small" color={colors.textBody}>
        It plays for you, one round at a time, against the same opponent. You can cancel whenever you like and carry on by hand.
      </AppText>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {strategies.map((s) => (
          <Chip key={s.id} label={s.label(s.amount ? (amounts[s.id] ?? s.amount.initial) : 0)} on={picked === s.id} onPress={() => setPicked(s.id)} tint={colors.accent} a11y={`${s.label(s.amount ? (amounts[s.id] ?? s.amount.initial) : 0)}. ${KIND[s.kind]}.`} />
        ))}
      </View>
      {chosen ? (
        <View style={{ gap: space.sm }}>
          <AppText variant="caption" color={colors.textMuted}>
            {KIND[chosen.kind]} · {chosen.detail(amount)}
          </AppText>
          {chosen.amount ? <Slider label={chosen.amount.label} value={amount} min={chosen.amount.min} max={chosen.amount.max} step={1} onChange={(v) => setAmounts((a) => ({ ...a, [chosen.id]: v }))} tone="cyan" /> : null}
        </View>
      ) : null}
      <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
        <View style={{ gap: 2 }}>
          <AppText variant="caption" color={colors.textMuted}>
            For how many {roundWord}?
          </AppText>
          <AppText variant="caption" color={colors.textFaint}>
            {roundsText(left, roundWord)} left
          </AppText>
        </View>
        <Stepper value={rounds} min={1} max={left} onChange={setCount} label={`Repeated ${roundWord}`} format={(v) => (v === left && left > 1 ? `${v} · all` : String(v))} />
      </View>
      <View style={styles.row}>
        <Button label="Not now" variant="secondary" compact onPress={() => setOpen(false)} style={{ flex: 1 }} />
        <Button label={`Repeat ${roundsText(rounds, roundWord)}`} compact icon={Play} iconPosition="left" disabled={!chosen || progress.busy} onPress={start} style={{ flex: 1.4 }} />
      </View>
    </Animated.View>
  );
}

function noticeFor(reason: 'count' | 'cancelled' | 'refused', completed: number, word: string): string {
  const played = roundsText(completed, word);
  if (reason === 'cancelled') return `Repeat cancelled after ${played}. Your move.`;
  if (reason === 'refused') return `Repeat stopped after ${played}: that move wasn’t accepted. Your move.`;
  return `Repeat finished: ${played} played. Your move.`;
}

/**
 * Shown instead of the results when a repeat played the final round: the match is over, any prediction is settled,
 * and the results wait for an explicit Continue — repeat mode never jumps straight to them.
 */
export function RepeatDone({ repeat, onContinue, roundWord = 'rounds' }: { repeat: RepeatController; onContinue?: () => void; roundWord?: string }) {
  const reduced = useMotionReduced();
  const last = repeat.last;
  const { played, total } = repeat.progress;
  // A match can end early (a collapsed lake): say what actually happened.
  const ending = played < total ? `The match ended after ${played} of ${total} ${roundWord}.` : `All ${total} ${roundWord} are done.`;
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} style={[styles.box, styles.running]}>
      <View style={styles.row}>
        <CircleCheck size={16} color={colors.accent} />
        <AppText variant="overline" color={colors.accent} accessibilityRole="header">
          Match complete
        </AppText>
      </View>
      <AppText variant="small" color={colors.textBody} accessibilityLiveRegion="polite">
        {last?.label ? `${last.label} played the last ${roundsText(last.completed, roundWord)}. ` : ''}
        {ending}
      </AppText>
      <Button
        label="Continue"
        icon={ArrowRight}
        accessibilityHint="Shows the results"
        onPress={() => {
          repeat.release();
          onContinue?.();
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)', backgroundColor: colors.surface },
  running: { backgroundColor: colors.accentSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  track: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  pip: { width: 14, height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh },
  pipNow: { backgroundColor: colors.borderStrong },
});
