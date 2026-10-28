import { Coffee, MessageCircle, Trees } from '@/src/components/ui/icons';
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { z } from 'zod';

import { SceneArt } from '@/src/components/art/SceneArt';
import { Portrait } from '@/src/components/characters/Portrait';
import { Completion } from '@/src/components/lesson/Completion';
import { LessonShell, type StepDef } from '@/src/components/lesson/LessonShell';
import { Dialogue, Panel, StepHeading } from '@/src/components/lesson/Panels';
import { PayoffMatrix } from '@/src/components/lesson/PayoffMatrix';
import { PredictionPrompt, PredictionResult } from '@/src/components/lesson/Prediction';
import {
  type Confidence,
  canLock,
  chooseAnswer,
  emptyPrediction,
  lockPrediction,
  lockedAnswer,
  missingForLock,
  predictionSchema,
  rateConfidence,
} from '@/src/components/lesson/prediction-state';
import { TransferQuestion, type TransferOption } from '@/src/components/lesson/TransferQuestion';
import { useEnter } from '@/src/components/lesson/motion';
import { useLessonFlow } from '@/src/components/lesson/useLessonFlow';
import { useProgress } from '@/src/store/progress';
import { pairedScenarioSteps, scenarioRecap } from '../curriculum/scenarioSteps';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import type { LessonMeta } from '@/src/content/lessons';
import { MEETUP_GAME, type MeetupResult, type Place, friendPolicy, resolveMeetup } from '@/src/game/coordination';
import { payoffAt, rowBestResponses } from '@/src/game/payoff-matrix';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { PLACE_NAME as NAME, ROUND_INFO, coordinationRecap, coordinationRecords, equilibriumSummary, meetupFeedback, messageExplanation } from './copy';

const place = z.enum(['cafe', 'park']);
const schema = z.object({
  predict1: predictionSchema(place),
  pick1: place.nullable(),
  committed1: z.boolean(),
  inspected: z.object({ row: place, col: place }).nullable(),
  showBR: z.boolean(),
  predict2: predictionSchema(place),
  pick2: place.nullable(),
  committed2: z.boolean(),
  message: place.nullable(),
  transferPick: z.string().nullable(),
  transferChecked: z.boolean(),
});
type Data = z.infer<typeof schema>;

const INITIAL: Data = {
  predict1: emptyPrediction(),
  pick1: null,
  committed1: false,
  inspected: null,
  showBR: false,
  predict2: emptyPrediction(),
  pick2: null,
  committed2: false,
  message: null,
  transferPick: null,
  transferChecked: false,
};

const ROW_LABELS = { cafe: 'You: café', park: 'You: park' } as const;
const COL_LABELS = { cafe: 'Nina: café', park: 'Nina: park' } as const;
const NINA_AT: Record<Place, string> = { cafe: 'At the café', park: 'At the park' };

const TRANSFER: TransferOption[] = [
  {
    id: 'announce',
    label: 'The group admin posts: “From Monday, we’re all on Ping.”',
    verdict: 'strong',
    feedback:
      'A public announcement gives everyone the same expectation at once — and everyone knows everyone saw it. Chatter fans lose their favourite, but being on one app beats being split.',
  },
  {
    id: 'majority',
    label: 'Everyone moves to whichever app more people already use',
    verdict: 'defensible',
    feedback: 'That can work as a shared rule — if everyone knows the numbers and expects the others to follow the same rule. If it is close, or people disagree about the count, the group can stay split.',
  },
  {
    id: 'better-app',
    label: 'Wait until everyone agrees which app is better',
    verdict: 'misconception',
    feedback: 'People prefer different apps, so there may never be agreement on “better”. Like the café and the park, neither option is best for everyone — what matters is that you all pick the same one.',
  },
  {
    id: 'both',
    label: 'Stay on both apps — that keeps everyone happy',
    verdict: 'misconception',
    feedback: 'Staying split is the outcome everyone wanted to avoid: messages get missed, like waiting at different meeting places.',
  },
];

const TRANSFER_ANALOGY = {
  holds:
    'Two outcomes both work — everyone on Ping, or everyone on Chatter — and each person’s best choice is wherever the others go. Being split is the bad outcome, just like missing each other.',
  differs:
    'There are many people instead of two, switching apps has a cost, and an announcement needs someone everyone listens to. Some members also prefer staying split if their friends are on their app.',
};

export default function CoordinationProblem({ lesson }: { lesson: LessonMeta }) {
  // The three paired scenarios sit just before completion, so steps saved before they existed keep their meaning.
  const TOTAL = 14;
  const { step, data, update, goTo, restart } = useLessonFlow(lesson.id, schema, INITIAL, TOTAL, coordinationRecords);
  const scenarioDone = useProgress((s) => s.scenarioDone);
  const learning = useProgress((s) => s.learning);
  const enter = useEnter();
  const equilibria = equilibriumSummary();

  const friend1 = friendPolicy(ROUND_INFO[1]);
  const friend2 = friendPolicy(ROUND_INFO[2]);
  const r1 = data.committed1 && data.pick1 ? resolveMeetup(data.pick1, friend1) : null;
  const r2 = data.committed2 && data.pick2 ? resolveMeetup(data.pick2, friend2) : null;
  const predict1 = lockedAnswer(data.predict1);
  const predict2 = lockedAnswer(data.predict2);

  const steps: StepDef[] = [
    {
      // Situation: a shared goal with no way to communicate.
      key: 'intro',
      cta: 'Head into town',
      render: () => (
        <>
          <Animated.View entering={enter(0, 'fade')} style={{ borderRadius: 20, overflow: 'hidden' }}>
            <SceneArt scene="meetup" height={180} />
          </Animated.View>
          <StepHeading kicker={`Lesson ${lesson.number}`} title="Two dead phones" body="You and Nina agreed to meet in the old town at six. Then both your phones died. You never said where." />
          <Dialogue character="aarav" expression="concerned">
            There are only two places we&apos;d ever go: the Clocktower Café or Riverside Park.
          </Dialogue>
        </>
      ),
    },
    {
      // Rules: the payoffs — a shared goal and slightly different tastes.
      key: 'stakes',
      render: () => (
        <>
          <StepHeading title="What each of you wants" body="Meeting anywhere is good. Missing each other ruins the evening." />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <PrefCard who="aarav" title="You" cafe={payoffAt(MEETUP_GAME, 'cafe', 'cafe')[0]} park={payoffAt(MEETUP_GAME, 'park', 'park')[0]} />
            <PrefCard who="nina" title="Nina" cafe={payoffAt(MEETUP_GAME, 'cafe', 'cafe')[1]} park={payoffAt(MEETUP_GAME, 'park', 'park')[1]} />
          </View>
          <Panel tone="info" title="Missing each other: 0 for both">
            The numbers are how much each of you enjoys the evening. You slightly prefer the café; Nina prefers the park. But any meeting beats none.
          </Panel>
        </>
      ),
    },
    {
      // Prediction, then decision.
      key: 'pick1',
      cta: data.committed1 ? 'See what happened' : 'Go there',
      canContinue: data.committed1 || (canLock(data.predict1) && !!data.pick1),
      blockedHint:
        missingForLock(data.predict1) === 'answer'
          ? 'First, predict where Nina will go.'
          : missingForLock(data.predict1) === 'confidence'
            ? 'Rate how confident you are in your prediction.'
            : 'Choose where to go.',
      // Going there locks the prediction together with the decision.
      onContinue: () =>
        update((d) => {
          if (d.committed1 || !d.pick1) return {};
          const predict1 = lockPrediction(d.predict1);
          return predict1.locked ? { predict1, committed1: true } : {};
        }),
      render: () => (
        <>
          <StepHeading kicker="Your move" title="Where do you go?" body="Nina is deciding at the same moment, with the same information you have." />
          <PredictionPrompt
            question="Where do you think Nina will go?"
            layout="row"
            options={(['cafe', 'park'] as const).map((p) => ({ id: p, label: NINA_AT[p] }))}
            value={data.predict1.answer}
            onChange={(a) => update((d) => ({ predict1: chooseAnswer(d.predict1, a) }))}
            confidence={data.predict1.confidence}
            onConfidence={(c) => update((d) => ({ predict1: rateConfidence(d.predict1, c) }))}
            locked={data.predict1.locked}
          />
          {data.predict1.answer ? <PlacePicker value={data.pick1} onChange={(p) => update({ pick1: p })} locked={data.committed1} /> : null}
        </>
      ),
    },
    {
      // Consequence: both choices, the payoff, and how the prediction held up.
      key: 'reveal1',
      render: () =>
        r1 ? (
          <>
            <MeetReveal round={1} result={r1}>
              {predict1 ? <MeetPrediction round={1} predicted={predict1} confidence={data.predict1.confidence} result={r1} /> : null}
              <Panel tone="info" title="Nina's reasoning (now revealed)" delay={300}>
                With nothing else to go on, Nina went where she would most like to meet: {NAME[friend1]}. She follows this rule whatever you do.
              </Panel>
            </MeetReveal>
          </>
        ) : null,
    },
    {
      // Concept: two equilibria, no dominant strategy.
      key: 'matrix',
      canContinue: data.showBR,
      blockedHint: 'Reveal the best replies to continue.',
      render: () => (
        <>
          <StepHeading kicker="The table" title="Two ways to get it right" body="Tap any cell. Your enjoyment first, Nina's second." />
          <Card>
            <PayoffMatrix
              game={MEETUP_GAME}
              rowName="You"
              colName="Nina"
              rowLabels={ROW_LABELS}
              colLabels={COL_LABELS}
              outcome={r1 ? { row: r1.you, col: r1.friend } : undefined}
              selected={data.inspected ?? undefined}
              onCellPress={(row, col) => update({ inspected: { row, col } })}
              showBestReplies={data.showBR}
            />
          </Card>
          {data.inspected ? (
            <AppText variant="small" color={colors.textMuted}>
              {data.inspected.row === data.inspected.col
                ? `Both at ${NAME[data.inspected.row]}: if either of you walked off alone, you'd drop to 0. Neither wants to switch.`
                : `You at ${NAME[data.inspected.row]}, Nina at ${NAME[data.inspected.col]}: both would rather be wherever the other one is.`}
            </AppText>
          ) : null}
          {!data.showBR ? (
            <Button label="Show best replies" variant="secondary" onPress={() => update({ showBR: true })} />
          ) : (
            <>
              <Panel tone="insight" title={equilibria.title}>
                Your best move is simply &ldquo;go where Nina goes&rdquo; — and the same for her. Each meeting outcome is a Nash equilibrium: once you&apos;re there, nobody gains by leaving alone. The hard part is knowing which one you&apos;re aiming for.
              </Panel>
              <AppText variant="small" color={colors.textMuted}>
                {`If Nina picks the café, your best reply is the ${rowBestResponses(MEETUP_GAME, 'cafe')[0] === 'cafe' ? 'café' : 'park'}; if she picks the park, it's the ${rowBestResponses(MEETUP_GAME, 'park')[0] === 'park' ? 'park' : 'café'}. Your best move flips with hers, so no single choice is best whatever she does — unlike cutting prices in Lesson 1.`}
              </AppText>
              {equilibria.mixedNote ? (
                <AppText variant="caption" color={colors.textMuted}>
                  {equilibria.mixedNote}
                </AppText>
              ) : null}
            </>
          )}
        </>
      ),
    },
    {
      // A shared expectation appears: predict again, then choose.
      key: 'pick2',
      cta: data.committed2 ? 'See what happened' : 'Go there',
      canContinue: data.committed2 || (canLock(data.predict2) && !!data.pick2),
      blockedHint:
        missingForLock(data.predict2) === 'answer'
          ? 'First, predict where Nina will go.'
          : missingForLock(data.predict2) === 'confidence'
            ? 'Rate how confident you are in your prediction.'
            : 'Choose where to go.',
      // Going there locks the prediction together with the decision.
      onContinue: () =>
        update((d) => {
          if (d.committed2 || !d.pick2) return {};
          const predict2 = lockPrediction(d.predict2);
          return predict2.locked ? { predict2, committed2: true } : {};
        }),
      render: () => (
        <>
          <StepHeading kicker="A week later" title="Same problem, one clue" body="Phones dead again. Same places, same preferences. But you remember something you both know." />
          <Dialogue character="nina" expression="happy" align="right">
            (Last month) &ldquo;Let&apos;s make the clocktower our usual spot — easy to remember.&rdquo;
          </Dialogue>
          <Dialogue character="aarav" expression="thinking" delay={120}>
            She&apos;ll remember that. And she knows I remember it too.
          </Dialogue>
          <PredictionPrompt
            question="Where do you think Nina will go this time?"
            layout="row"
            options={(['cafe', 'park'] as const).map((p) => ({ id: p, label: NINA_AT[p] }))}
            value={data.predict2.answer}
            onChange={(a) => update((d) => ({ predict2: chooseAnswer(d.predict2, a) }))}
            confidence={data.predict2.confidence}
            onConfidence={(c) => update((d) => ({ predict2: rateConfidence(d.predict2, c) }))}
            locked={data.predict2.locked}
          />
          {data.predict2.answer ? <PlacePicker value={data.pick2} onChange={(p) => update({ pick2: p })} locked={data.committed2} /> : null}
        </>
      ),
    },
    {
      key: 'reveal2',
      render: () =>
        r2 ? (
          <>
            <MeetReveal round={2} result={r2}>
              {predict2 ? <MeetPrediction round={2} predicted={predict2} confidence={data.predict2.confidence} result={r2} /> : null}
              <Panel tone="info" title="Nina's reasoning" delay={300}>
                With a reference point you both share, Nina went to it: {NAME[friend2]} — even though she enjoys the park a little more.
              </Panel>
            </MeetReveal>
          </>
        ) : null,
    },
    {
      // Concept: focal points, named after the learner has seen one work.
      key: 'focal',
      render: () => (
        <>
          <StepHeading kicker="The idea" title="Focal points" />
          <Dialogue character="sen" expression="explaining">
            When several outcomes would work, people coordinate on the one that stands out to everyone — and that everyone knows stands out. That&apos;s a focal point.
          </Dialogue>
          <Panel tone="insight" title="Shared, not best" delay={120}>
            The café wasn&apos;t the best place for Nina. It became the answer because it was the expectation you both held. Without that clue, there was no guaranteed right answer.
          </Panel>
          <Card style={{ gap: space.xs }}>
            <SectionLabel>Where focal points come from</SectionLabel>
            <AppText variant="small">Shared history (&ldquo;our usual spot&rdquo;), convention (driving on one side of the road), prominence (the biggest landmark), or simple labels (&ldquo;meet at the entrance&rdquo;).</AppText>
          </Card>
        </>
      ),
    },
    {
      // Experiment (a hypothetical extension): add communication, keep the payoffs.
      key: 'message',
      canContinue: !!data.message,
      blockedHint: 'Choose which message to send.',
      render: () => {
        const msg = data.message ? resolveMeetup(data.message, friendPolicy({ kind: 'message', proposed: data.message })) : null;
        return (
          <>
            <StepHeading
              kicker="What if?"
              title="One text gets through"
              body="An extension of the original game: suppose your phone survives just long enough to send Nina one message. The payoffs stay exactly the same."
            />
            <AppText variant="bodyStrong">Which message do you send?</AppText>
            <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
              {(['cafe', 'park'] as const).map((p) => (
                <ChoiceCard key={p} compact icon={MessageCircle} title={`"Meet at the ${p === 'cafe' ? 'café' : 'park'}"`} selected={data.message === p} onSelect={() => update({ message: p })} />
              ))}
            </View>
            {msg && data.message ? (
              <>
                <Panel tone="info" title={`You meet at ${NAME[msg.you]}: you ${msg.payoffs[0]}, Nina ${msg.payoffs[1]}`}>
                  {messageExplanation(data.message)}
                </Panel>
                <Panel tone="caution" title="Communication helps here — it isn't magic">
                  It works because missing each other is bad for both. If messages could be lost, if Nina doubted you&apos;d stick to it, or if one of you strongly preferred missing over the &ldquo;wrong&rdquo; place, a message might not settle it.
                </Panel>
              </>
            ) : null}
          </>
        );
      },
    },
    {
      // Transfer: coordination among many people with different preferences.
      key: 'transfer',
      canContinue: data.transferChecked,
      blockedHint: 'Pick an answer and check your reasoning.',
      render: () => (
        <>
          <StepHeading
            kicker="New situation"
            title="The split study group"
            body="Your study group of twenty is split across two chat apps, Ping and Chatter. Everyone would rather the whole group used one app. People who use Ping prefer Ping; people who use Chatter prefer Chatter."
          />
          <TransferQuestion
            question="What is most likely to get everyone onto one app?"
            options={TRANSFER}
            picked={data.transferPick}
            checked={data.transferChecked}
            onPick={(id) => update({ transferPick: id })}
            onCheck={() => update({ transferChecked: true })}
            analogy={TRANSFER_ANALOGY}
          />
        </>
      ),
    },
    ...pairedScenarioSteps(lesson.id, scenarioDone),
    {
      key: 'done',
      render: () => (
        <Completion
          lesson={lesson}
          takeaway="When many outcomes could work, success depends on shared expectations — not on finding the single best option."
          remember={[
            'Ask what the other person expects you to expect.',
            'Look for what stands out to both of you: history, convention, prominence.',
            'A clear signal in advance is often worth more than a clever guess later.',
          ]}
          recap={[...coordinationRecap({ predict1, r1, predict2, r2, message: data.message }), ...scenarioRecap(lesson.id, learning)]}
          reflection="Think of a group you belong to — friends, a team, a household. Which unwritten conventions let you coordinate without discussing it? Where did one come from?"
          nextHook="Here, being easy to predict helped you find Nina. Next, being predictable is exactly what your opponent wants."
          onReplay={restart}
        />
      ),
    },
  ];

  return <LessonShell lesson={lesson} steps={steps} step={step} goTo={goTo} onRestart={restart} />;
}

function MeetPrediction({ round, predicted, confidence, result }: { round: 1 | 2; predicted: Place; confidence: Confidence | null; result: MeetupResult }) {
  const fb = meetupFeedback(round, predicted, result);
  return (
    <PredictionResult predicted={NINA_AT[predicted]} actual={NINA_AT[result.friend]} verdict={fb.verdict} confidence={confidence} title="Your read of Nina" delay={250}>
      {fb.text}
    </PredictionResult>
  );
}

function PrefCard({ who, title, cafe, park }: { who: 'aarav' | 'nina'; title: string; cafe: number; park: number }) {
  return (
    <Card style={{ flex: 1, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Portrait character={who} expression="happy" size={36} />
        <AppText variant="bodyStrong">{title}</AppText>
      </View>
      <PrefRow icon="cafe" value={cafe} />
      <PrefRow icon="park" value={park} />
    </Card>
  );
}

function PrefRow({ icon, value }: { icon: Place; value: number }) {
  const Icon = icon === 'cafe' ? Coffee : Trees;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={14} color={colors.textMuted} />
        <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
          {icon === 'cafe' ? 'Meet at café' : 'Meet at park'}
        </AppText>
        <AppText variant="caption" color={colors.text} tabular>
          {value}
        </AppText>
      </View>
      <View style={styles.prefTrack}>
        <View style={[styles.prefFill, { width: `${(value / 10) * 100}%` }]} />
      </View>
    </View>
  );
}

function PlacePicker({ value, onChange, locked }: { value: Place | null; onChange: (p: Place) => void; locked: boolean }) {
  return (
    <>
      <AppText variant="bodyStrong">Where do you go?</AppText>
      <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
        <ChoiceCard
          title={NAME.cafe}
          description="Under the old clocktower, in the main square."
          icon={Coffee}
          selected={value === 'cafe'}
          disabled={locked && value !== 'cafe'}
          onSelect={() => !locked && onChange('cafe')}
        />
        <ChoiceCard
          title={NAME.park}
          description="Benches by the water, a short walk away."
          icon={Trees}
          tone="orange"
          selected={value === 'park'}
          disabled={locked && value !== 'park'}
          onSelect={() => !locked && onChange('park')}
        />
      </View>
      {locked ? (
        <AppText variant="caption" color={colors.textMuted}>
          Decision made. Replay the lesson to try the other place.
        </AppText>
      ) : null}
    </>
  );
}

/** Nina's line at the meetup. Round 1 she goes to her favourite (the park); round 2 to the shared spot (the café). */
function meetupLine(round: 1 | 2, r: { friend: Place; met: boolean }): string | undefined {
  if (round === 1 && r.friend === 'park') return r.met ? 'There you are! I hoped you’d pick the park.' : 'I waited by the river. I thought you’d come to the park.';
  if (round === 2 && r.friend === 'cafe') return r.met ? 'Our usual spot. I knew you’d remember.' : 'I waited under the clocktower — our usual spot.';
  return undefined;
}

/** The meetup reveal. `children` (prediction check, Nina's reasoning) appear only once both places are shown. */
function MeetReveal({ round, result, children }: { round: 1 | 2; result: MeetupResult; children?: ReactNode }) {
  const { you, friend, met, payoffs } = result;
  const reduced = useMotionReduced();
  const ninaLine = meetupLine(round, { friend, met });
  const enter = useEnter();
  const [shown, setShown] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setShown(true), 650);
    return () => clearTimeout(t);
  }, [reduced]);

  return (
    <>
      <StepHeading kicker="Six o'clock" title={!shown ? 'You arrive and look around…' : met ? `You find each other at ${NAME[you]}` : 'No sign of Nina'} />
      <View style={styles.revealRow}>
        {(['cafe', 'park'] as const).map((p) => (
          <View key={p} style={[styles.place, p === you && { borderColor: colors.primary }]}>
            <AppText variant="caption" color={colors.textMuted}>
              {NAME[p]}
            </AppText>
            <View style={{ flexDirection: 'row', gap: space.xs, minHeight: 48, alignItems: 'center' }}>
              {p === you ? <Portrait character="aarav" expression={!shown ? 'curious' : met ? 'happy' : 'frustrated'} size={44} ring={colors.primary} /> : null}
              {shown && p === friend ? (
                <Animated.View entering={enter(0)}>
                  <Portrait character="nina" expression={met ? 'happy' : 'concerned'} size={44} ring={colors.rival} />
                </Animated.View>
              ) : null}
            </View>
          </View>
        ))}
      </View>
      {shown ? (
        <Panel tone={met ? 'success' : 'caution'} title={met ? `You get ${payoffs[0]}, Nina gets ${payoffs[1]}` : 'You each get 0'} delay={150}>
          {met
            ? 'You coordinated. Neither of you would now want to be anywhere else.'
            : `You waited at ${NAME[you]}. Nina waited at ${NAME[friend]}. Both choices were reasonable — they just didn't match.`}
        </Panel>
      ) : null}
      {shown && ninaLine ? (
        <Dialogue character="nina" expression={met ? 'happy' : 'concerned'} align="right" delay={250}>
          {ninaLine}
        </Dialogue>
      ) : null}
      {shown ? children : null}
    </>
  );
}

const styles = StyleSheet.create({
  prefTrack: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  prefFill: { height: '100%', backgroundColor: colors.insight, borderRadius: 3 },
  revealRow: { flexDirection: 'row', gap: space.sm },
  place: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
});
