import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, BookOpen, House, RotateCcw, X } from '@/src/components/ui/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Portrait } from '@/src/components/characters/Portrait';
import { FeedbackPanel, Panel } from '@/src/components/lesson/Panels';
import { PredictionPrompt } from '@/src/components/lesson/Prediction';
import { useEnter } from '@/src/components/lesson/motion';
import { chooseAnswer, emptyPrediction, missingForLock, rateConfidence } from '@/src/components/lesson/prediction-state';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { LESSONS, type LessonMeta, getLesson } from '@/src/content/lessons';
import { CONCEPT_REVIEW, type Challenge, challengesFor } from '@/src/features/challenges/content';
import {
  attemptsAt,
  challengeFeedback,
  resumeIndex,
  strongestOptions,
  summaryTakeaway,
} from '@/src/features/challenges/progress';
import type { Evaluation } from '@/src/features/learning/records';
import { useProgress } from '@/src/store/progress';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

export function generateStaticParams() {
  return LESSONS.map((l) => ({ lessonId: l.id }));
}

/** Practice challenges for one lesson. Every challenge is open, whether or not the lesson has been taken. */
export default function LessonChallengesScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const hydrated = useProgress((s) => s.hydrated);
  const lesson = getLesson(lessonId);
  if (!lesson) return <MessageScreen title="Challenges not found" body="This link doesn't match any lesson. Pick one from the practice list." />;
  // Wait for saved answers, so resuming lands on the right challenge and never re-submits one.
  if (!hydrated) return <MessageScreen loading />;
  return <ChallengeRunner key={lesson.id} lesson={lesson} />;
}

/** One shared empty attempt, so store selectors return a stable value. */
const EMPTY = emptyPrediction<string>();

const FIRST_TRY: Record<Evaluation, string> = {
  correct: 'First answer matched the model',
  partial: 'First answer was defensible',
  misconception: 'First answer is worth another look',
  reasonable: 'Open question — not scored',
  'reasonable-miss': 'A reasonable call',
};

function ChallengeRunner({ lesson }: { lesson: LessonMeta }) {
  const insets = useSafeAreaInsets();
  const list = challengesFor(lesson.id);
  const [view, setView] = useState<number | 'summary'>(() => resumeIndex(useProgress.getState().learning, useProgress.getState().challengeDrafts, lesson.id));
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [view]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/challenges'));
  const step = view === 'summary' ? list.length : view + 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.08} />
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerRow}>
          <IconButton icon={X} label="Leave challenges. Your answers are saved." onPress={leave} />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
              Practice · Lesson {lesson.number} · {lesson.title}
            </AppText>
            <View style={styles.track} accessible accessibilityRole="progressbar" accessibilityLabel={`Challenge ${Math.min(step, list.length)} of ${list.length}`}>
              <View style={[styles.fill, { width: `${(Math.min(step, list.length) / list.length) * 100}%` }]} />
            </View>
          </View>
          <AppText variant="caption" color={colors.textMuted} tabular style={{ minWidth: 32, textAlign: 'right' }}>
            {view === 'summary' ? 'Done' : `${step}/${list.length}`}
          </AppText>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {view === 'summary' ? (
            <Summary lesson={lesson} onOpen={(i) => setView(i)} />
          ) : (
            <ChallengeView key={list[view].id} challenge={list[view]} index={view} total={list.length} lesson={lesson} />
          )}
        </View>
      </ScrollView>

      {view !== 'summary' ? (
        <Footer
          challenge={list[view]}
          isLast={view === list.length - 1}
          onNext={() => setView(view === list.length - 1 ? 'summary' : view + 1)}
        />
      ) : null}
    </View>
  );
}

function ChallengeView({ challenge, index, total, lesson }: { challenge: Challenge; index: number; total: number; lesson: LessonMeta }) {
  const enter = useEnter();
  const attempt = useProgress((s) => s.challengeDrafts[challenge.id]) ?? EMPTY;
  const learning = useProgress((s) => s.learning);
  const history = useMemo(() => attemptsAt(learning, challenge.id), [learning, challenge.id]);
  const lessonDone = useProgress((s) => s.completed.includes(lesson.id));
  const setDraft = useProgress((s) => s.setChallengeDraft);
  const submit = useProgress((s) => s.submitChallenge);
  const fb = attempt.locked && attempt.answer ? challengeFeedback(challenge, attempt.answer) : null;
  const strongest = strongestOptions(challenge);
  const first = history[0];
  const firstLabel = first ? challenge.options.find((o) => o.id === first.answer)?.label : null;
  const review = CONCEPT_REVIEW[lesson.id];
  // Shown on any attempt after the first: the first answer is kept and this one is recorded separately.
  const isRetry = !!first && first.lockedAt !== attempt.lockedAt;

  return (
    <View style={{ gap: space.lg }}>
      <Animated.View entering={enter(0, 'fade')} style={{ gap: space.sm }}>
        <AppText variant="overline" color={colors.primaryText}>
          Challenge {index + 1} of {total} · {challenge.concept}
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          {challenge.title}
        </AppText>
        <AppText variant="body" color={colors.textBody}>
          {challenge.scenario}
        </AppText>
      </Animated.View>

      {isRetry && firstLabel ? (
        <AppText variant="caption" color={colors.textMuted}>
          Your first answer here was “{firstLabel}”. It stays in your record; {attempt.locked ? 'this retry was recorded separately' : 'a retry is recorded separately'}.
        </AppText>
      ) : null}

      <PredictionPrompt
        label="Your answer"
        question={challenge.question}
        options={challenge.options}
        value={attempt.answer}
        onChange={(a) => setDraft(challenge.id, chooseAnswer(attempt, a))}
        confidence={attempt.confidence}
        onConfidence={(c) => setDraft(challenge.id, rateConfidence(attempt, c))}
        onConfirm={() => {
          haptic.commit();
          submit(challenge.id);
        }}
        confirmLabel="Submit answer"
        lockedNote="Submitted and saved to your learning record."
        locked={attempt.locked}
      />

      {fb ? (
        <View style={{ gap: space.md }}>
          <FeedbackPanel verdict={fb.verdict}>{fb.text}</FeedbackPanel>
          {challenge.basis === 'uncertain' ? (
            <AppText variant="small" color={colors.textMuted}>
              Nothing in the scenario settles this one, so no answer is marked right — and it isn’t scored in your profile.
            </AppText>
          ) : fb.verdict !== 'match' && strongest.length ? (
            <Panel tone="info" title={`Stronger answer: ${strongest[0].label}`}>
              {strongest[0].feedback}
            </Panel>
          ) : null}
          <View style={styles.takeaway}>
            <AppText variant="overline" color={colors.accent}>
              Carry this with you
            </AppText>
            <AppText variant="body">{challenge.takeaway}</AppText>
          </View>
          <Card style={{ gap: space.sm }}>
            <SectionLabel>{lessonDone ? `Review · ${review.concept}` : `New to this idea? · ${review.concept}`}</SectionLabel>
            <AppText variant="small" color={colors.textBody}>
              {review.summary}
            </AppText>
            <Button
              label={lessonDone ? `Open lesson ${lesson.number}` : `Take lesson ${lesson.number}`}
              variant="ghost"
              compact
              icon={BookOpen}
              iconPosition="left"
              onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: lesson.id } })}
              style={{ alignSelf: 'flex-start' }}
            />
          </Card>
        </View>
      ) : null}
    </View>
  );
}

function Footer({ challenge, isLast, onNext }: { challenge: Challenge; isLast: boolean; onNext: () => void }) {
  const insets = useSafeAreaInsets();
  const attempt = useProgress((s) => s.challengeDrafts[challenge.id]) ?? EMPTY;
  const retry = useProgress((s) => s.retryChallenge);
  const missing = missingForLock(attempt);
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
      <View style={styles.column}>
        {attempt.locked ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Try again" variant="secondary" icon={RotateCcw} iconPosition="left" onPress={() => retry(challenge.id)} style={{ minWidth: 128 }} />
            <Button label={isLast ? 'See summary' : 'Next challenge'} icon={ArrowRight} onPress={onNext} style={{ flex: 1 }} />
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <AppText variant="small" color={colors.textMuted} align="center">
              {missing === 'answer' ? 'Choose an answer.' : missing === 'confidence' ? 'Rate how confident you are, then submit.' : 'Submit your answer to see feedback.'}
            </AppText>
            <Button label={isLast ? 'Skip to summary' : 'Skip this challenge'} variant="ghost" compact onPress={onNext} />
          </View>
        )}
      </View>
    </View>
  );
}

function Summary({ lesson, onOpen }: { lesson: LessonMeta; onOpen: (i: number) => void }) {
  const enter = useEnter();
  const reduced = useMotionReduced();
  const learning = useProgress((s) => s.learning);
  const lessonDone = useProgress((s) => s.completed.includes(lesson.id));
  const list = challengesFor(lesson.id);
  const tried = list.filter((c) => attemptsAt(learning, c.id).length > 0).length;
  const takeaway = summaryTakeaway(learning, lesson.id);

  return (
    <View style={{ gap: space.xl }}>
      <Animated.View entering={reduced ? undefined : enter(0, 'fade')} style={{ alignItems: 'center', gap: space.md, paddingTop: space.md }}>
        <Portrait character="sen" expression={tried ? 'satisfied' : 'thinking'} size={72} />
        <AppText variant="title" align="center" accessibilityRole="header">
          {tried === list.length
            ? 'You’ve explored three new situations using this concept.'
            : tried
              ? `You’ve explored ${tried} of ${list.length} new situations.`
              : 'No challenges answered yet.'}
        </AppText>
        <AppText variant="small" color={colors.textMuted} align="center">
          {CONCEPT_REVIEW[lesson.id].concept}
        </AppText>
      </Animated.View>

      {takeaway ? (
        <View style={styles.takeaway}>
          <AppText variant="overline" color={colors.accent}>
            One idea to keep
          </AppText>
          <AppText variant="body">{takeaway}</AppText>
        </View>
      ) : null}

      <Card style={{ gap: space.md }}>
        {list.map((c, i) => {
          const first = attemptsAt(learning, c.id)[0];
          return (
            <View key={c.id} style={styles.summaryRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">{c.title}</AppText>
                <AppText variant="small" color={colors.textMuted}>
                  {first ? FIRST_TRY[first.evaluation] : 'Not tried yet'}
                </AppText>
              </View>
              <Button label={first ? 'Open' : 'Try'} variant="secondary" compact onPress={() => onOpen(i)} />
            </View>
          );
        })}
      </Card>

      <View style={{ gap: space.sm }}>
        <Button label="All challenges" icon={ArrowRight} onPress={() => router.replace('/challenges')} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            label={lessonDone ? 'Review lesson' : 'Take the lesson'}
            variant="secondary"
            icon={BookOpen}
            iconPosition="left"
            onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: lesson.id } })}
            style={{ flex: 1 }}
          />
          <Button label="Home" variant="secondary" icon={House} iconPosition="left" onPress={() => router.replace('/')} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceHigh, marginTop: 6, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: 'rgba(8,18,32,0.94)' },
  takeaway: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)', backgroundColor: colors.bgRaised },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
});
