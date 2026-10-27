import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Panel } from '@/src/components/lesson/Panels';
import type { Confidence } from '@/src/components/lesson/prediction-state';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Badge, Card } from '@/src/components/ui/Card';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, RotateCcw, X } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { getLesson } from '@/src/content/lessons';
import { DailyError } from '@/src/data/daily';
import { dailyRepo, useDaily } from '@/src/data/daily-session';
import { toDataError } from '@/src/data/errors';
import { type DailyDraft, DailyInteraction, DailyResultView, completeAnswer, initialDraft } from '@/src/features/daily/DailyInteraction';
import type { DailyAttempt, DailyChallenge, DailyResult, DailyReveal } from '@/src/features/daily/content';
import { compareDays, dayLabel, formatDay, monthKey, monthOf, parseDay } from '@/src/features/daily/dates';
import { newSeed } from '@/src/features/scenarios/runtime';
import { haptic } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

const DIFFICULTY = { 1: 'Warm-up', 2: 'Standard', 3: 'Tricky' } as const;

/**
 * One day's challenge. Three stages: the situation → your answer → the result and why. What it does depends on the
 * day and on the learner's official record:
 * - today, not answered: the official attempt, graded and recorded on the server (one per day; retries are safe)
 * - answered (any day): the saved official result, read-only, plus optional practice that is never recorded
 * - an earlier day, not answered: review (the answer and reasoning) and practice; the official window has closed
 */
export default function DailyPlayScreen() {
  const { date: param } = useLocalSearchParams<{ date: string }>();
  const insets = useSafeAreaInsets();
  const day = parseDay(param);
  const today = useDaily((s) => s.today);
  const todayConfirmed = useDaily((s) => s.todayConfirmed);
  const month = useDaily((s) => (day ? s.months[monthKey(monthOf(day))] : undefined));
  const loadMonth = useDaily((s) => s.loadMonth);

  useEffect(() => {
    if (day) void loadMonth(monthOf(day));
    // `param` identifies the day; `day` is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, loadMonth]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/daily'));

  if (!day) return <MessageScreen title="Not a valid date" body="This link doesn’t point to a calendar day. Open the daily challenge calendar instead." />;
  if (todayConfirmed && compareDays(day, today) > 0) return <MessageScreen title="Not released yet" body={`The challenge for ${dayLabel(day, today)} opens on that day.`} />;
  if (!month || month.status === 'loading') return <MessageScreen loading />;
  if (month.status === 'error') return <MessageScreen title="Couldn’t load this challenge" body={month.error.message} onRetry={() => void loadMonth(monthOf(day), { force: true })} />;
  if (compareDays(day, month.data.today) > 0) return <MessageScreen title="Not released yet" body={`The challenge for ${dayLabel(day, today)} opens on that day.`} />;

  const key = formatDay(day);
  const entry = month.data.entries.get(key);
  const attempt = month.data.attempts.get(key);

  if (entry && !entry.ok) {
    return <MessageScreen title={entry.title ?? 'This challenge can’t be shown'} body={entry.problem} onRetry={() => void loadMonth(monthOf(day), { force: true })} />;
  }
  if (!entry && !attempt) {
    return <MessageScreen title="No challenge this day" body={`Nothing was published for ${dayLabel(day, today)}. A day without a challenge isn’t a missed day.`} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.08} />
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.row}>
          <IconButton icon={X} label="Close the challenge" onPress={leave} />
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
            Daily challenge · {dayLabel(day, today)}
          </AppText>
        </View>
      </View>
      <Flow
        key={`${key}-${entry?.ok ? entry.challenge.version : 0}`}
        day={key}
        isToday={compareDays(day, month.data.today) === 0}
        challenge={entry?.ok ? entry.challenge : null}
        attempt={attempt ?? null}
        bottom={insets.bottom}
      />
    </View>
  );
}

type Stage = 'brief' | 'answer' | 'result';
type Mode = 'official' | 'practice';

function Flow({
  day,
  isToday,
  challenge,
  attempt,
  bottom,
}: {
  day: string;
  isToday: boolean;
  challenge: DailyChallenge | null;
  attempt: DailyAttempt | null;
  bottom: number;
}) {
  const submit = useDaily((s) => s.submit);
  const loadMonth = useDaily((s) => s.loadMonth);
  const scroll = useRef<ScrollView>(null);
  const official = isToday && !attempt;
  const [mode, setMode] = useState<Mode>(official ? 'official' : 'practice');
  // An answered challenge opens on its saved result; everything else starts at the situation.
  const [stage, setStage] = useState<Stage>(attempt ? 'result' : 'brief');
  const [draft, setDraft] = useState<DailyDraft | null>(() => (challenge ? initialDraft(challenge, newSeed()) : null));
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practiceResult, setPracticeResult] = useState<DailyResult | null>(null);
  const [reveal, setReveal] = useState<DailyReveal | null>(null);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [stage]);

  const answer = challenge && draft ? completeAnswer(challenge, draft) : null;
  const needsConfidence = mode === 'official' && !!challenge?.askConfidence;
  const ready = answer !== null && (!needsConfidence || confidence !== null);

  const restartPractice = () => {
    if (!challenge) return;
    setMode('practice');
    setDraft(initialDraft(challenge, newSeed()));
    setConfidence(null);
    setPracticeResult(null);
    setError(null);
    setStage('answer');
  };

  const send = async () => {
    if (!challenge || !answer || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'official') {
        await submit({ challengeId: challenge.id, version: challenge.version, answer, confidence: challenge.askConfidence ? confidence : null, date: challenge.date });
        haptic.success();
        // The recorded attempt (or the one already on record) now drives the result.
        setStage('result');
      } else {
        setPracticeResult(await dailyRepo.practice({ challengeId: challenge.id, version: challenge.version, answer }));
        setStage('result');
      }
    } catch (e) {
      const err = toDataError(e);
      setError(err.message);
      // Content changed under us, or the day closed: reload so the screen shows what now applies.
      if (e instanceof DailyError && (e.refusal === 'stale' || e.refusal === 'closed' || e.refusal === 'not_found')) void loadMonth(monthOf(challenge.date), { force: true });
    } finally {
      setBusy(false);
    }
  };

  const showReveal = async () => {
    if (!challenge || busy) return;
    setBusy(true);
    setError(null);
    try {
      setReveal(await dailyRepo.reveal(challenge.id));
    } catch (e) {
      setError(toDataError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const lesson = getLesson(challenge?.lesson ?? attempt?.lesson ?? undefined);
  const stepLabel = stage === 'brief' ? '1 of 3 · The situation' : stage === 'answer' ? '2 of 3 · Your answer' : '3 of 3 · Result';

  return (
    <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: bottom + space.xxxl }} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Badge label={stepLabel} tone="cyan" />
          {challenge ? <Badge label={DIFFICULTY[challenge.difficulty]} /> : null}
          {attempt ? <Badge label="Official answer recorded" tone="success" /> : mode === 'practice' ? <Badge label="Practice · not recorded" tone="amber" /> : null}
        </View>
        <AppText variant="title" accessibilityRole="header">
          {challenge?.title ?? attempt?.result.title}
        </AppText>

        {!attempt && !isToday && stage === 'brief' ? (
          <Panel tone="info" title="You missed this one">
            Its day has passed, so it can’t become your official answer — but you can still work through it. Practice isn’t recorded and doesn’t change your profile.
          </Panel>
        ) : null}

        {stage === 'brief' && challenge ? (
          <View style={{ gap: space.md }}>
            <AppText variant="body">{challenge.intro}</AppText>
            <AppText variant="bodyStrong">{challenge.prompt}</AppText>
            {challenge.instructions ? (
              <AppText variant="small" color={colors.textMuted}>
                {challenge.instructions}
              </AppText>
            ) : null}
            <Button label={official ? 'Make your call' : 'Practise it'} icon={ArrowRight} onPress={() => setStage('answer')} />
            {!attempt && !isToday ? (
              <Button label={reveal ? 'Answer shown below' : 'Just show me the answer'} variant="ghost" disabled={!!reveal || busy} onPress={() => void showReveal()} />
            ) : null}
            {reveal ? (
              <View style={{ gap: space.md }}>
                <Card style={{ gap: space.xs }}>
                  <AppText variant="caption" color={colors.textMuted}>
                    The model’s answer
                  </AppText>
                  <AppText variant="bodyStrong">{reveal.modelAnswer}</AppText>
                </Card>
                <Panel tone="insight" title="The reasoning">
                  <View style={{ gap: space.sm }}>
                    {reveal.explanation.map((e) => (
                      <AppText key={e}>{e}</AppText>
                    ))}
                  </View>
                </Panel>
                <Panel tone="info" title="Takeaway">
                  {reveal.takeaway}
                </Panel>
              </View>
            ) : null}
          </View>
        ) : null}

        {stage === 'answer' && challenge && draft ? (
          <View style={{ gap: space.lg }}>
            {challenge.interaction === 'scenario' ? <AppText variant="small" color={colors.textMuted}>{challenge.prompt}</AppText> : null}
            <DailyInteraction
              challenge={challenge}
              draft={draft}
              onDraft={setDraft}
              confidence={confidence}
              onConfidence={challenge.askConfidence ? setConfidence : undefined}
            />
            {error ? (
              <AppText variant="small" color={colors.danger} accessibilityLiveRegion="polite">
                {error}
              </AppText>
            ) : null}
            <Button
              label={busy ? 'Checking…' : mode === 'official' ? (error ? 'Try submitting again' : 'Submit official answer') : 'Check my answer'}
              disabled={!ready || busy}
              onPress={() => void send()}
              accessibilityHint={mode === 'official' ? 'Your first submitted answer today is final.' : 'Practice answers are not recorded.'}
            />
            {mode === 'official' ? (
              <AppText variant="caption" color={colors.textMuted} align="center">
                Your first submitted answer is final for today. Practice opens after.
              </AppText>
            ) : null}
            <Button label="Back to the situation" variant="ghost" compact icon={ArrowLeft} iconPosition="left" onPress={() => setStage('brief')} />
          </View>
        ) : null}

        {stage === 'result' ? (
          <View style={{ gap: space.lg }}>
            {mode === 'practice' && practiceResult ? (
              <DailyResultView challenge={challenge} result={practiceResult} answer={answer} confidence={confidence} practice />
            ) : attempt ? (
              <>
                <AppText variant="small" color={colors.textMuted}>
                  Your official answer{attempt.version !== challenge?.version ? ' (to an earlier version of this challenge)' : ''}, recorded {dayLabel(attempt.date)}.
                </AppText>
                <DailyResultView challenge={attempt.version === challenge?.version ? challenge : null} result={attempt.result} answer={attempt.answer} confidence={attempt.confidence} />
              </>
            ) : null}
            {lesson ? (
              <Button
                label={`More on this: lesson ${lesson.number}, ${lesson.title}`}
                variant="secondary"
                icon={BookOpen}
                iconPosition="left"
                onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: lesson.id } })}
              />
            ) : null}
            {challenge ? <Button label={practiceResult ? 'Practise again' : 'Practise this challenge'} variant="secondary" icon={RotateCcw} iconPosition="left" onPress={restartPractice} accessibilityHint="Practice is not recorded and never changes your official answer." /> : null}
            <Button label="Back to the calendar" variant="ghost" icon={CalendarDays} iconPosition="left" onPress={() => (router.canGoBack() ? router.back() : router.replace('/daily'))} />
          </View>
        ) : null}
        <AppText variant="caption" color={colors.textFaint} align="center">
          {day} · UTC calendar day
        </AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
});
