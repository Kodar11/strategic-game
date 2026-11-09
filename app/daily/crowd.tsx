import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useIsGuest } from '@/src/components/auth/SignInRequired';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { ArrowRight, BookOpen, CircleCheck, Lock, RefreshCw, Users } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { type CrowdQuestion, crowdOutcome, isOptionKind, validCrowdAnswer } from '@/src/daily-mix/crowd';
import { crowdQuestionFor } from '@/src/daily-mix/schedule';
import { toDataError } from '@/src/data/errors';
import type { CrowdResult } from '@/src/data/crowd';
import { crowdRepo, useDaily } from '@/src/data/daily-session';
import { useDailyMix } from '@/src/features/daily-mix/store';
import { CrowdBars, DailyFrame, OptionButton } from '@/src/features/daily-mix/ui';
import { compareDays, dayLabel, formatDay, parseDay } from '@/src/features/daily/dates';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; result: CrowdResult };

/**
 * The Crowd. Today: answer once (it locks), then wait for tomorrow. A past day (`?day=YYYY-MM-DD`): how the crowd
 * answered, whether you won, and the idea behind it. Guests can read the question and are invited to sign in, since
 * an answer only counts as part of a crowd when it is stored.
 */
export default function CrowdScreen() {
  const p = useLocalSearchParams<{ day?: string }>();
  const today = useDaily((s) => s.today);
  const asked = parseDay(p.day);
  const day = asked && compareDays(asked, today) <= 0 ? asked : today;
  const isToday = compareDays(day, today) === 0;
  const q = crowdQuestionFor(day);
  const key = formatDay(day);
  const guest = useIsGuest();
  const local = useDailyMix((s) => s.days[key]);
  const loadMix = useDailyMix((s) => s.load);
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  // Sets state only when the request settles; the screen starts in "loading", and retries reset it first.
  const request = useCallback(() => {
    if (guest) return;
    crowdRepo
      .result(key, q.id)
      .then((result) => setLoad({ status: 'ready', result }))
      .catch((e: unknown) => setLoad({ status: 'error', message: toDataError(e).message }));
  }, [guest, key, q.id]);
  const fetchResult = () => {
    setLoad({ status: 'loading' });
    request();
  };

  useEffect(() => {
    void loadMix();
    request();
  }, [request, loadMix]);

  const serverMine = load.status === 'ready' ? load.result.mine : null;
  const mine = serverMine ?? (local?.format === 'crowd' && local.questionId === q.id ? local.value : null);

  return (
    <DailyFrame title={q.title} overline={`The Crowd · ${dayLabel(day, today)}`}>
      <View style={styles.prompt}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Users size={16} color={colors.insight} />
          <AppText variant="caption" color={colors.insight}>
            Everyone gets this question today
          </AppText>
        </View>
        <AppText variant="body">{q.prompt}</AppText>
      </View>

      {guest ? (
        <View style={{ gap: space.sm }}>
          <AppText variant="small" color={colors.textBody}>
            Your answer only counts when it joins the crowd, so The Crowd needs an account. It takes one tap with Google.
          </AppText>
          <Button label="Sign in to take part" icon={ArrowRight} onPress={() => router.push('/sign-in')} />
        </View>
      ) : load.status === 'loading' ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />
      ) : load.status === 'error' ? (
        <View style={{ gap: space.sm }}>
          <AppText variant="small" color={colors.textBody}>
            {load.message}
          </AppText>
          <Button label="Try again" variant="secondary" icon={RefreshCw} iconPosition="left" onPress={fetchResult} />
        </View>
      ) : isToday ? (
        mine === null ? (
          <AnswerForm q={q} dayKey={key} onDone={fetchResult} />
        ) : (
          <Locked q={q} value={mine} answered={load.result.answered} />
        )
      ) : (
        <Outcome q={q} result={load.result} />
      )}
    </DailyFrame>
  );
}

const answerLabel = (q: CrowdQuestion, v: number) => (isOptionKind(q) ? q.options![v] : String(v));

function AnswerForm({ q, dayKey, onDone }: { q: CrowdQuestion; dayKey: string; onDone: () => void }) {
  const option = isOptionKind(q);
  const lo = q.min ?? 0;
  const hi = q.max ?? 100;
  const [value, setValue] = useState<number | null>(option ? null : Math.round((lo + hi) / 2));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (value === null || !validCrowdAnswer(q, value)) return;
    setSending(true);
    setError(null);
    try {
      const r = await crowdRepo.submit(q.id, value);
      useDailyMix.getState().recordCrowd(dayKey, r.questionId, r.value);
      haptic.commit();
      onDone();
    } catch (e) {
      setError(toDataError(e).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      {option ? (
        <View style={{ gap: space.sm }}>
          {q.options!.map((o, i) => (
            <OptionButton key={o} label={o} selected={value === i} onPress={() => setValue(i)} />
          ))}
        </View>
      ) : (
        <View style={styles.numberBox}>
          <AppText variant="number" align="center" color={colors.primaryText} tabular>
            {value}
          </AppText>
          <Slider value={value ?? lo} min={lo} max={hi} step={1} onChange={setValue} label="Your number" hideLabel showValue={false} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" color={colors.textMuted}>
              {lo}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {hi}
            </AppText>
          </View>
        </View>
      )}
      {error ? (
        <AppText variant="small" color={colors.danger} accessibilityLiveRegion="assertive">
          {error}
        </AppText>
      ) : null}
      <Button label={sending ? 'Locking in…' : value === null ? 'Pick an answer' : `Lock in ${answerLabel(q, value)}`} icon={Lock} onPress={() => void submit()} disabled={value === null || sending} />
      <AppText variant="caption" color={colors.textMuted} align="center">
        One answer a day — it can’t be changed. Results open tomorrow.
      </AppText>
    </View>
  );
}

function Locked({ q, value, answered }: { q: CrowdQuestion; value: number; answered: number }) {
  return (
    <View style={styles.locked}>
      <CircleCheck size={28} color={colors.success} strokeWidth={2.2} />
      <AppText variant="heading" align="center">
        Locked in: {answerLabel(q, value)}
      </AppText>
      <AppText variant="small" color={colors.textBody} align="center">
        {answered > 1 ? `${answered} players have answered so far. ` : ''}The crowd’s answer — and whether you read it right — arrives tomorrow morning.
      </AppText>
    </View>
  );
}

function Outcome({ q, result }: { q: CrowdQuestion; result: CrowdResult }) {
  const o = crowdOutcome(q, result.counts ?? [], result.mine);
  const verdict = o.won === true ? { text: 'You read the crowd', tone: 'success' as const } : o.won === false ? { text: 'Not this time', tone: 'orange' as const } : { text: result.mine === null ? 'You didn’t answer this one' : 'No result', tone: 'neutral' as const };
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Badge label={verdict.text} tone={verdict.tone} style={{ alignSelf: 'flex-start' }} />
        <AppText variant="heading">{o.crowd}</AppText>
        {o.you ? (
          <AppText variant="small" color={colors.textBody}>
            {o.you}
          </AppText>
        ) : null}
        <AppText variant="caption" color={colors.textMuted}>
          {o.answered} players · winning answer: {o.winning}
        </AppText>
      </View>
      {o.answered > 0 ? <CrowdBars bars={o.bars} /> : null}
      <View style={styles.idea}>
        <AppText variant="overline" color={colors.insight}>
          The idea
        </AppText>
        <AppText variant="small" color={colors.textBody}>
          {q.idea}
        </AppText>
      </View>
      {q.lesson ? <Button label="Learn the idea" variant="secondary" icon={BookOpen} iconPosition="left" onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: q.lesson! } })} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(253,186,116,0.3)' },
  numberBox: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.border },
  locked: { alignItems: 'center', gap: space.sm, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(74,222,128,0.35)' },
  idea: { gap: space.xs, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.insightSoft },
});
