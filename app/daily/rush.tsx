import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { ArrowRight, Play, RotateCcw, Zap } from '@/src/components/ui/icons';
import { useDaily } from '@/src/data/daily-session';
import { RUSH_SECONDS, rushRating, rushSet } from '@/src/daily-mix/rush';
import { useDailyMix } from '@/src/features/daily-mix/store';
import { DailyFrame, OptionButton, PayoffTable } from '@/src/features/daily-mix/ui';
import { dayNumber, formatDay } from '@/src/features/daily/dates';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';

type Phase = 'intro' | 'play' | 'done';

/**
 * Read Rush: as many quick strategy reads as you can in three minutes. The set comes from the date, so it is the same
 * for everyone today. A right answer moves straight on; a wrong one shows the right answer and why, and the clock
 * keeps running — mistakes cost only time. The first run of the day is the day's result; later runs are practice.
 */
export default function ReadRushScreen() {
  const today = useDaily((s) => s.today);
  const key = formatDay(today);
  const questions = useMemo(() => rushSet(dayNumber(today)), [today]);
  const load = useDailyMix((s) => s.load);
  const loaded = useDailyMix((s) => s.loaded);
  const todays = useDailyMix((s) => s.days[key]);
  const best = useDailyMix((s) => s.rushBest);
  const [phase, setPhase] = useState<Phase>('intro');
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [left, setLeft] = useState(RUSH_SECONDS);
  const [summary, setSummary] = useState<{ official: boolean; best: boolean } | null>(null);
  const endsAt = useRef(0);
  const finished = useRef(false);

  useEffect(() => {
    void load();
  }, [load]);

  const finish = (finalScore: number, answered: number) => {
    if (finished.current) return;
    finished.current = true;
    setSummary(useDailyMix.getState().recordRush(key, finalScore, answered));
    setPhase('done');
    haptic.success();
  };

  useEffect(() => {
    if (phase !== 'play') return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [phase]);

  // Time's up (or the set ran out): the run ends with what was answered.
  useEffect(() => {
    if (phase === 'play' && (left === 0 || i >= questions.length)) finish(score, i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, i, phase]);

  const start = () => {
    finished.current = false;
    setI(0);
    setScore(0);
    setPicked(null);
    setLeft(RUSH_SECONDS);
    setSummary(null);
    endsAt.current = Date.now() + RUSH_SECONDS * 1000;
    setPhase('play');
  };

  const answer = (k: number) => {
    if (picked !== null) return;
    const q = questions[i];
    if (k === q.answer) {
      haptic.select();
      setScore((s) => s + 1);
      setI((n) => n + 1);
    } else {
      setPicked(k);
    }
  };
  const nextAfterWrong = () => {
    setPicked(null);
    setI((n) => n + 1);
  };

  if (phase === 'intro') {
    const done = todays?.format === 'rush' ? todays : null;
    return (
      <DailyFrame title="Read Rush" overline="Today’s Daily">
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Zap size={26} color={colors.insight} strokeWidth={2.2} />
          </View>
          <AppText variant="heading" align="center">
            As many quick reads as you can in 3 minutes
          </AppText>
          <AppText variant="small" color={colors.textBody} align="center">
            Spot the bot’s pattern, the move nobody should play, the deal that pays. One tap each. A wrong answer only costs time.
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.xs, justifyContent: 'center', flexWrap: 'wrap' }}>
            {done ? <Badge label={`Today: ${done.score} right`} tone="success" /> : null}
            {best > 0 ? <Badge label={`Best: ${best}`} tone="amber" /> : null}
          </View>
        </View>
        <Button label={done ? 'Play again · practice' : 'Start'} icon={Play} onPress={start} disabled={!loaded} />
        {done ? (
          <AppText variant="caption" color={colors.textMuted} align="center">
            Today’s first run counts; this one is practice and can still beat your best.
          </AppText>
        ) : null}
      </DailyFrame>
    );
  }

  if (phase === 'done') {
    return (
      <DailyFrame title="Read Rush" overline="Today’s Daily">
        <View style={styles.hero}>
          <AppText variant="number" color={colors.insight} tabular>
            {score}
          </AppText>
          <AppText variant="heading">{rushRating(score)}</AppText>
          <AppText variant="small" color={colors.textBody} align="center">
            {score} right out of {i} answered{summary?.best ? ' · a new best!' : best > 0 ? ` · best ${best}` : ''}
          </AppText>
          {summary ? <Badge label={summary.official ? 'Today’s Daily: done' : 'Practice run'} tone={summary.official ? 'success' : 'neutral'} /> : null}
        </View>
        <Button label="Done" icon={ArrowRight} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Button label="Play again · practice" variant="secondary" icon={RotateCcw} iconPosition="left" onPress={start} />
        <AppText variant="caption" color={colors.textMuted} align="center">
          A new set arrives tomorrow.
        </AppText>
      </DailyFrame>
    );
  }

  const q = questions[Math.min(i, questions.length - 1)];
  const wrong = picked !== null;
  const share = left / RUSH_SECONDS;
  return (
    <DailyFrame
      title="Read Rush"
      right={
        <View style={styles.scorePill} accessible accessibilityLabel={`${score} right. ${left} seconds left.`}>
          <AppText variant="bodyStrong" color={colors.insight} tabular>
            {score}
          </AppText>
        </View>
      }>
      <View style={styles.timerTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.timer, { width: `${share * 100}%`, backgroundColor: left <= 20 ? colors.rival : colors.insight }]} />
      </View>
      <AppText variant="caption" color={colors.textMuted} tabular accessibilityLiveRegion={left <= 10 ? 'polite' : 'none'}>
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left · question {i + 1}
      </AppText>

      <View style={{ gap: space.md }}>
        <AppText variant="heading">{q.prompt}</AppText>
        {q.sequence ? (
          <View style={styles.seq} accessible accessibilityLabel={`The bot played: ${q.sequence.join(', ')}`}>
            {q.sequence.map((m, k) => (
              <View key={k} style={styles.chip}>
                <AppText variant="caption" color={colors.rivalText}>
                  {m}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        {q.table ? <PayoffTable table={q.table} /> : null}
      </View>

      <View style={{ gap: space.sm }}>
        {q.options.map((o, k) => (
          <OptionButton key={`${q.id}-${k}`} label={o} onPress={() => answer(k)} disabled={wrong} state={wrong ? (k === q.answer ? 'right' : k === picked ? 'wrong' : 'idle') : 'idle'} />
        ))}
      </View>

      {wrong ? (
        <View style={{ gap: space.sm }}>
          <AppText variant="small" color={colors.textBody} accessibilityLiveRegion="polite">
            {q.why}
          </AppText>
          <Button label="Next" icon={ArrowRight} onPress={nextAfterWrong} />
        </View>
      ) : null}
    </DailyFrame>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.md, padding: space.xl, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(253,186,116,0.3)' },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.insightSoft, alignItems: 'center', justifyContent: 'center' },
  scorePill: { minWidth: 48, height: 40, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.insightSoft, alignItems: 'center', justifyContent: 'center' },
  timerTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bgRaised, overflow: 'hidden' },
  timer: { height: 6, borderRadius: 3 },
  seq: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.rivalSoft },
});
