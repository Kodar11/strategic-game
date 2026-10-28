import { ArrowLeft, ArrowRight, Dices, Repeat, Repeat2, RotateCcw } from '@/src/components/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { z } from 'zod';

import { SceneArt } from '@/src/components/art/SceneArt';
import { Completion } from '@/src/components/lesson/Completion';
import { LessonShell, type StepDef } from '@/src/components/lesson/LessonShell';
import { Dialogue, FeedbackPanel, Panel, Stat, StepHeading } from '@/src/components/lesson/Panels';
import { PredictionPrompt } from '@/src/components/lesson/Prediction';
import {
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
import { Slider } from '@/src/components/ui/Slider';
import type { LessonMeta } from '@/src/content/lessons';
import {
  HABIT_MARGIN,
  KEEPER_WINDOW,
  type KeeperReason,
  type ShotRecord,
  type Side,
  type StrikerStrategy,
  expectedPayoff,
  guaranteedPayoff,
  simulateMix,
  takeShot,
} from '@/src/game/mixed-strategy';
import { createRng } from '@/src/game/rng';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import {
  COMPARE_PREDICTIONS,
  LAB_PREDICTIONS,
  COMPARE_SHOTS,
  KEEPER_SEED,
  MIX_LAB_RESET,
  compareResults,
  comparePredictionFeedback,
  mixLabFeedback,
  mixLabPhase,
  predictabilityRecap,
  predictabilityRecords,
  runComparison,
  simulateMixRun,
} from './copy';

const SHOTS_TO_TAKE = 8;
const SIM_SHOTS = 40;

/** The keeper's own coin for shot i is seeded, so a replayed sequence of shots gives the same saves. */
const keeperCoin = (i: number) => () => createRng(KEEPER_SEED + i * 101)();

const side = z.enum(['L', 'R']);
const shotSchema = z.object({
  shot: side,
  dive: side,
  reason: z.enum(['repeat-habit', 'switch-habit', 'favourite-side', 'coin']),
  scored: z.boolean(),
});
const schema = z.object({
  firstPick: side.nullable(),
  shots: z.array(shotSchema).max(SHOTS_TO_TAKE),
  comparePrediction: predictionSchema(z.enum(['repeat', 'alternate', 'random'])),
  compareSeed: z.number().int().min(0).nullable(),
  labPrediction: predictionSchema(z.enum(['high', 'half', 'low'])),
  q: z.number().min(0).max(1),
  simSeed: z.number().int().min(0).nullable(),
  transferPick: z.string().nullable(),
  transferChecked: z.boolean(),
});
type Data = z.infer<typeof schema>;

const INITIAL: Data = {
  firstPick: null,
  shots: [],
  comparePrediction: emptyPrediction(),
  compareSeed: null,
  ...MIX_LAB_RESET,
  transferPick: null,
  transferChecked: false,
};

const SIDE_NAME: Record<Side, string> = { L: 'left', R: 'right' };

const REASON_TEXT: Record<KeeperReason, string> = {
  'repeat-habit': 'You kept repeating your side, so she expected the same again.',
  'switch-habit': 'You kept switching sides, so she expected a switch.',
  'favourite-side': 'You favoured one side recently, so she covered it.',
  coin: 'No clear pattern to read, so she guessed.',
};

const STRATEGIES: { id: StrikerStrategy; label: string; rule: string; Icon: typeof Repeat }[] = [
  { id: 'repeat', label: 'Always left', rule: 'L, L, L, L…', Icon: Repeat },
  { id: 'alternate', label: 'Alternate', rule: 'L, R, L, R…', Icon: Repeat2 },
  { id: 'random', label: 'Random 50/50', rule: 'Seeded coin flip each shot', Icon: Dices },
];

const TRANSFER: TransferOption[] = [
  {
    id: 'weighted',
    label: 'Unpredictable days and times, with more checks where fare-dodging is most common',
    verdict: 'strong',
    feedback:
      'Riders can’t time their dodging, so skipping a ticket is risky on every trip — and the checks lean towards the routes where they matter most. Unpredictable doesn’t have to mean evenly spread.',
  },
  {
    id: 'uniform',
    label: 'Pick days and routes completely at random, each equally often',
    verdict: 'defensible',
    feedback:
      'Nothing for riders to learn, which is the key idea. But routes differ: an even spread wastes checks on routes where hardly anyone dodges. The right mix depends on the payoffs, like a striker with a stronger side.',
  },
  {
    id: 'fixed',
    label: 'Check the busiest route every Monday morning',
    verdict: 'misconception',
    feedback: 'A fixed schedule is easy to learn. Fare-dodgers simply avoid Monday mornings on that route.',
  },
  {
    id: 'rotate',
    label: 'Rotate through routes in a fixed order',
    verdict: 'misconception',
    feedback: 'Rotation feels varied, but a fixed cycle is still a pattern — once noticed, it is as exploitable as alternating shots.',
  },
];

const TRANSFER_ANALOGY = {
  holds: 'Inspectors and riders are like keeper and striker: whoever can read the other’s pattern wins, so a learnable schedule gets exploited.',
  differs:
    'There are many routes rather than two sides, the stakes differ by route, and riders only see part of the schedule — so the best mix isn’t 50/50 and depends on what each check is worth.',
};

export default function PredictabilityTrap({ lesson }: { lesson: LessonMeta }) {
  // The three paired scenarios sit just before completion, so steps saved before they existed keep their meaning.
  const TOTAL = 13;
  const { step, data, update, goTo, restart } = useLessonFlow(lesson.id, schema, INITIAL, TOTAL, predictabilityRecords);
  const scenarioDone = useProgress((s) => s.scenarioDone);
  const learning = useProgress((s) => s.learning);
  const enter = useEnter();

  // The updater stays pure; the keeper only ever sees shots already in history.
  const shoot = (s: Side) => {
    haptic.commit();
    update((d) => {
      if (d.shots.length >= SHOTS_TO_TAKE) return {};
      return { shots: [...d.shots, takeShot(d.shots, s, keeperCoin(d.shots.length))] };
    });
  };

  const goals = data.shots.filter((s) => s.scored).length;
  const last = data.shots[data.shots.length - 1];

  const steps: StepDef[] = [
    {
      key: 'intro',
      cta: 'Step up to the spot',
      render: () => (
        <>
          <Animated.View entering={enter(0, 'fade')} style={{ borderRadius: 20, overflow: 'hidden' }}>
            <SceneArt scene="shootout" height={180} />
          </Animated.View>
          <StepHeading kicker={`Lesson ${lesson.number}`} title="The penalty shootout" body="You shoot left or right. Maya, in goal, dives left or right at the same moment." />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Stat label="She dives the other way" value="Goal" tone="blue" caption="you score 1" />
            <Stat label="She guesses your side" value="Save" tone="orange" caption="you score 0" />
          </View>
          <Dialogue character="maya" expression="thinking" align="right" delay={120}>
            I don&apos;t know where you&apos;ll shoot. But I&apos;ll be watching every shot you take.
          </Dialogue>
        </>
      ),
    },
    {
      key: 'first',
      cta: data.shots.length > 0 ? 'Continue' : 'Shoot',
      canContinue: !!data.firstPick,
      blockedHint: 'Pick a side for your first shot.',
      onContinue: () => {
        if (data.shots.length === 0 && data.firstPick) shoot(data.firstPick);
      },
      render: () => (
        <>
          <StepHeading kicker="Shot 1" title="Pick your side" body="In this model both sides are equally good for you, and equally easy for her to reach." />
          <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
            <ChoiceCard title="Shoot left" icon={ArrowLeft} selected={data.firstPick === 'L'} disabled={data.shots.length > 0} onSelect={() => update({ firstPick: 'L' })} />
            <ChoiceCard title="Shoot right" icon={ArrowRight} selected={data.firstPick === 'R'} disabled={data.shots.length > 0} onSelect={() => update({ firstPick: 'R' })} />
          </View>
        </>
      ),
    },
    {
      key: 'series',
      canContinue: data.shots.length >= SHOTS_TO_TAKE,
      blockedHint: `Take all ${SHOTS_TO_TAKE} shots (${data.shots.length} so far).`,
      render: () => (
        <>
          <StepHeading
            kicker={`Shot ${Math.min(data.shots.length + 1, SHOTS_TO_TAKE)} of ${SHOTS_TO_TAKE}`}
            title={data.shots.length >= SHOTS_TO_TAKE ? 'Series complete' : 'Keep shooting'}
            body="Each tap is one shot. Maya only sees your past shots — never the one you are taking."
          />
          {last ? (
            <Animated.View key={data.shots.length} entering={enter(0)}>
              <Card style={{ gap: space.sm, borderColor: last.scored ? colors.success : colors.rival }}>
                <AppText variant="heading" color={last.scored ? colors.success : colors.rivalText}>
                  {last.scored ? 'Goal' : 'Saved'} — you went {SIDE_NAME[last.shot]}, she dived {SIDE_NAME[last.dive]}
                </AppText>
                <AppText variant="small" color={colors.textMuted}>
                  Maya&apos;s read: {REASON_TEXT[last.reason]}
                </AppText>
              </Card>
            </Animated.View>
          ) : null}
          {/* Maya reacts to each shot as it resolves; a newer shot cuts off the previous reaction. */}
          <History shots={data.shots} />
          {data.shots.length < SHOTS_TO_TAKE ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <ShotButton s="L" onPress={() => shoot('L')} />
              <ShotButton s="R" onPress={() => shoot('R')} />
            </View>
          ) : (
            <Panel tone="info" title={`You scored ${goals} of ${SHOTS_TO_TAKE}`}>
              Continue to see what Maya was looking for.
            </Panel>
          )}
        </>
      ),
    },
    {
      key: 'review',
      render: () => {
        const counts = data.shots.reduce<Record<KeeperReason, number>>(
          (acc, s) => ({ ...acc, [s.reason]: acc[s.reason] + 1 }),
          { 'repeat-habit': 0, 'switch-habit': 0, 'favourite-side': 0, coin: 0 },
        );
        const readCount = SHOTS_TO_TAKE - counts.coin;
        const readSaves = data.shots.filter((s) => s.reason !== 'coin' && !s.scored).length;
        return (
          <>
            <StepHeading kicker="The keeper's notebook" title="What Maya was watching" />
            <Card style={{ gap: space.sm }}>
              <SectionLabel>Maya&apos;s stated policy</SectionLabel>
              <AppText variant="small">
                She looks at your last {KEEPER_WINDOW} shots. If you&apos;ve repeated (or switched) at least {HABIT_MARGIN} more times than the opposite, she bets you&apos;ll continue. Otherwise, if you favoured one side by {HABIT_MARGIN}+, she covers it. Otherwise she guesses.
              </AppText>
            </Card>
            <History shots={data.shots} />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Stat label="Shots she read a pattern" value={String(readCount)} tone="orange" />
              <Stat label="Saves from those reads" value={String(readSaves)} tone="orange" />
              <Stat label="Your goals" value={`${goals}/${SHOTS_TO_TAKE}`} tone="blue" />
            </View>
            <Dialogue character="maya" expression={readSaves >= 3 ? 'confident' : 'frustrated'} align="right">
              {readSaves >= 3 ? 'People think they’re being random. Most of them have a rhythm.' : 'You didn’t give me much to work with. Annoying.'}
            </Dialogue>
          </>
        );
      },
    },
    {
      key: 'compare',
      canContinue: data.compareSeed !== null,
      blockedHint:
        missingForLock(data.comparePrediction) === 'answer'
          ? 'Predict the winner, then run the comparison.'
          : missingForLock(data.comparePrediction) === 'confidence'
            ? 'Rate how confident you are, then run the comparison.'
            : 'Run the comparison to continue.',
      render: () => {
        const seed = data.compareSeed;
        const results = seed === null ? null : compareResults(seed).map((r, i) => ({ ...STRATEGIES[i], result: r.result }));
        const comparePick = lockedAnswer(data.comparePrediction);
        const compareFb = results && comparePick ? comparePredictionFeedback(comparePick, results.map((r) => ({ id: r.id, goals: r.result.goals }))) : null;
        return (
          <>
            <StepHeading kicker="Experiment" title="Three strikers, same keeper" body={`Each strategy takes ${COMPARE_SHOTS} shots against Maya's stated policy. Her policy never changes — only the striker does.`} />
            <PredictionPrompt
              question="Which striker will score the most?"
              options={COMPARE_PREDICTIONS}
              value={data.comparePrediction.answer}
              onChange={(a) => update((d) => ({ comparePrediction: chooseAnswer(d.comparePrediction, a) }))}
              confidence={data.comparePrediction.confidence}
              onConfidence={(c) => update((d) => ({ comparePrediction: rateConfidence(d.comparePrediction, c) }))}
              locked={data.comparePrediction.locked}
            />
            <Card style={{ gap: space.lg }}>
              {STRATEGIES.map((s, i) => {
                const r = results?.[i].result;
                return (
                  <View key={s.id} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <s.Icon size={16} color={colors.textMuted} />
                      <AppText variant="bodyStrong" style={{ flex: 1 }}>
                        {s.label}
                      </AppText>
                      <AppText variant="small" color={colors.text} tabular>
                        {r ? `${r.goals}/${COMPARE_SHOTS} goals` : '—'}
                      </AppText>
                    </View>
                    <View style={styles.bar}>
                      {r ? <Animated.View entering={enter(i * 80, 'fade')} style={[styles.barFill, { width: `${r.rate * 100}%`, backgroundColor: s.id === 'random' ? colors.primary : colors.rival }]} /> : null}
                    </View>
                    <AppText variant="caption" color={colors.textMuted}>
                      {s.rule}
                    </AppText>
                  </View>
                );
              })}
            </Card>
            <Button
              label={seed === null ? 'Run the comparison' : 'Run again with new coin flips'}
              variant="secondary"
              disabled={!data.comparePrediction.locked && !canLock(data.comparePrediction)}
              onPress={() => update(runComparison)}
            />
            {results && compareFb ? (
              <FeedbackPanel verdict={compareFb.verdict} title="Your prediction">
                {compareFb.text}
              </FeedbackPanel>
            ) : null}
            {results ? (
              <Panel tone="insight" title="Patterns get punished">
                Always-left and alternating are both perfectly predictable once Maya has a few shots of history. The random striker gives her nothing reliable to read: her reads are no better than guesses, so it scores around half — more or less, depending on the run.
              </Panel>
            ) : null}
          </>
        );
      },
    },
    {
      key: 'mixed',
      render: () => (
        <>
          <StepHeading kicker="The idea" title="Mixed strategies" />
          <Dialogue character="meera" expression="explaining">
            Choosing each side with a fixed probability is called a mixed strategy. Mixing 50/50 here means your chance of scoring doesn&apos;t depend on what she does.
          </Dialogue>
          <Card style={{ gap: space.sm }}>
            <SectionLabel>Expected goals per shot at 50/50</SectionLabel>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Stat label="If she always dives left" value={expectedPayoff(0.5, 1).toFixed(2)} tone="blue" />
              <Stat label="If she always dives right" value={expectedPayoff(0.5, 0).toFixed(2)} tone="blue" />
            </View>
            <AppText variant="caption" color={colors.textMuted}>
              Expected value = chance you shoot left × chance she dives right + chance you shoot right × chance she dives left.
            </AppText>
          </Card>
          <Panel tone="info" title="Equilibrium">
            If you mix 50/50, she can&apos;t do better than 50/50 either, and vice versa. Neither can gain by changing alone — this is the game&apos;s mixed-strategy equilibrium.
          </Panel>
          <AppText variant="small" color={colors.textMuted}>
            A mix describes how often you pick each side — not a rule for which side comes next. Switching every time is the &ldquo;Alternate&rdquo; striker Maya just punished.
          </AppText>
        </>
      ),
    },
    {
      key: 'lab',
      canContinue: mixLabPhase(data) === 'review',
      blockedHint:
        mixLabPhase(data) === 'experiment'
          ? 'Run at least one simulation.'
          : missingForLock(data.labPrediction) === 'confidence'
            ? 'Rate how confident you are, then confirm.'
            : 'Make and confirm a prediction first.',
      render: () => {
        const q = data.q;
        const phase = mixLabPhase(data);
        const sim = data.simSeed === null ? null : simulateMix(q, SIM_SHOTS, data.simSeed);
        const labFb = mixLabFeedback(data);
        return (
          <>
            <StepHeading kicker="Simulation lab" title="Tune your mix" body="Set how often you shoot left. Assume Maya has studied you long enough to know this number, and always dives to the side that hurts you most." />
            <PredictionPrompt
              question="You shoot left 80% of the time, and Maya knows it. How many goals a shot can you count on?"
              options={LAB_PREDICTIONS}
              value={data.labPrediction.answer}
              onChange={(a) => update((d) => ({ labPrediction: chooseAnswer(d.labPrediction, a) }))}
              confidence={data.labPrediction.confidence}
              onConfidence={(c) => update((d) => ({ labPrediction: rateConfidence(d.labPrediction, c) }))}
              onConfirm={() => update((d) => ({ labPrediction: lockPrediction(d.labPrediction) }))}
              locked={data.labPrediction.locked}
            />
            {phase !== 'predict' ? (
              <>
                <Card style={{ gap: space.lg }}>
                  <Slider
                    label="Chance you shoot left"
                    value={Math.round(q * 100)}
                    min={0}
                    max={100}
                    step={5}
                    formatValue={(v) => `${v}%`}
                    marker={{ value: 50, label: '50/50' }}
                    onChange={(v) => update({ q: v / 100 })}
                  />
                  {/* Expected values would answer the prediction, so they wait for the first simulation. */}
                  {phase === 'review' ? (
                    <>
                      <View style={{ flexDirection: 'row', gap: space.sm }}>
                        <Stat label="Expected if she dives left" value={expectedPayoff(q, 1).toFixed(2)} />
                        <Stat label="Expected if she dives right" value={expectedPayoff(q, 0).toFixed(2)} />
                      </View>
                      <Stat label="What you can count on (she picks the worse one for you)" value={guaranteedPayoff(q).toFixed(2)} tone="amber" />
                    </>
                  ) : (
                    <AppText variant="small" color={colors.textMuted}>
                      Your prediction is locked. Set any mix you like, then simulate {SIM_SHOTS} shots against a keeper who knows it.
                    </AppText>
                  )}
                </Card>
                <Button
                  label={sim ? 'Simulate again' : `Simulate ${SIM_SHOTS} shots`}
                  variant="secondary"
                  icon={Dices}
                  iconPosition="left"
                  onPress={() => update(simulateMixRun)}
                />
                {sim ? (
                  <Card style={{ gap: space.md }}>
                    <View style={{ flexDirection: 'row', gap: space.sm }}>
                      <Stat label="Observed this run" value={sim.observed.toFixed(2)} tone="blue" caption={`${sim.goals} goals of ${sim.shots}`} />
                      <Stat label="Expected" value={sim.expected.toFixed(2)} tone="amber" caption={`she dives ${SIDE_NAME[sim.keeperDive]}`} />
                    </View>
                    <RunningChart running={sim.running} expected={sim.expected} />
                    <AppText variant="caption" color={colors.textMuted}>
                      Short runs wander around the expected value; longer runs settle closer. Run it again to see a different sequence.
                    </AppText>
                  </Card>
                ) : null}
                {labFb ? (
                  <FeedbackPanel verdict={labFb.verdict} title="Your prediction">
                    {labFb.text}
                  </FeedbackPanel>
                ) : null}
                {phase === 'review' ? (
                  <Button label="Start the lab over" variant="ghost" compact icon={RotateCcw} iconPosition="left" onPress={() => update(MIX_LAB_RESET)} />
                ) : null}
              </>
            ) : null}
          </>
        );
      },
    },
    {
      key: 'caveat',
      render: () => (
        <>
          <StepHeading title="When does unpredictability help?" body="50/50 is right only in this model, where both sides are equally good for you and equally easy for her to reach." />
          <Dialogue character="sen" expression="thinking">
            Real strikers have a stronger side, and keepers reach some corners better. Then the equilibrium mix shifts away from 50/50 — the principle stays the same: leave no exploitable pattern.
          </Dialogue>
          <Panel tone="caution" title="Random isn't careless">
            Mixing is a deliberate choice of probabilities. Being unpredictable only matters when someone is watching and can react to your pattern.
          </Panel>
          <Card style={{ gap: space.xs }}>
            <SectionLabel>When consistency wins</SectionLabel>
            <AppText variant="small">
              If the other person is on your side — like Nina trying to find you in Lesson 4 — being predictable is exactly what helps. Unpredictability pays only against someone who gains by reading you.
            </AppText>
          </Card>
        </>
      ),
    },
    {
      key: 'transfer',
      canContinue: data.transferChecked,
      blockedHint: 'Pick an answer and check your reasoning.',
      render: () => (
        <>
          <StepHeading
            kicker="New situation"
            title="Ticket inspections"
            body="A tram network can afford inspectors on only a few trams each day. Riders notice when and where checks happen. Fare-dodging is common on a few routes and rare on most."
          />
          <TransferQuestion
            question="Which schedule discourages fare-dodging most?"
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
          takeaway="If an opponent can learn your pattern, your pattern becomes their advantage."
          remember={[
            'Repeating and alternating are both patterns.',
            'A mixed strategy can make your result independent of the opponent’s choice.',
            'Short-run results are noisy; judge a strategy by its expected value.',
          ]}
          recap={[...predictabilityRecap({ shots: data.shots, comparePick: lockedAnswer(data.comparePrediction), labPick: lockedAnswer(data.labPrediction) }), ...scenarioRecap(lesson.id, learning)]}
          reflection="Where could someone exploit a routine of yours — and where does the same routine help the people on your side?"
          nextHook="So far you have faced one opponent's guesses. Next, compete in a market, where every move you make shifts your rival's best reply."
          onReplay={restart}
        />
      ),
    },
  ];

  return <LessonShell lesson={lesson} steps={steps} step={step} goTo={goTo} onRestart={restart} />;
}

function ShotButton({ s, onPress }: { s: Side; onPress: () => void }) {
  const Icon = s === 'L' ? ArrowLeft : ArrowRight;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Shoot ${SIDE_NAME[s]}`}
      style={({ pressed }) => [styles.shot, pressed && { backgroundColor: colors.primaryPressed, transform: [{ scale: 0.98 }] }]}>
      <Icon size={22} color="#fff" strokeWidth={2.4} />
      <AppText variant="bodyStrong" color="#fff">
        Shoot {SIDE_NAME[s]}
      </AppText>
    </Pressable>
  );
}

function History({ shots }: { shots: ShotRecord[] }) {
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="caption" color={colors.textMuted}>
        Your history
      </AppText>
      <View style={styles.history} accessible accessibilityLabel={`History: ${shots.map((s) => `${SIDE_NAME[s.shot]} ${s.scored ? 'goal' : 'saved'}`).join(', ') || 'no shots yet'}`}>
        {Array.from({ length: SHOTS_TO_TAKE }, (_, i) => {
          const s = shots[i];
          return (
            <View key={i} style={[styles.chip, s && { borderColor: s.scored ? colors.success : colors.rival, backgroundColor: s.scored ? colors.successSoft : colors.rivalSoft }]}>
              <AppText variant="bodyStrong" color={s ? colors.text : colors.textFaint}>
                {s ? s.shot : '·'}
              </AppText>
              <AppText variant="caption" color={s ? (s.scored ? colors.success : colors.rivalText) : colors.textFaint} style={{ fontSize: 10 }}>
                {s ? (s.scored ? 'goal' : 'save') : ''}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function RunningChart({ running, expected }: { running: number[]; expected: number }) {
  const H = 80;
  return (
    <View accessible accessibilityLabel={`Running scoring rate across ${running.length} shots, ending at ${running[running.length - 1]?.toFixed(2)}. Expected ${expected.toFixed(2)}.`}>
      <View style={[styles.chart, { height: H }]}>
        <View style={[styles.expectedLine, { bottom: expected * H }]} />
        {running.map((r, i) => (
          <View key={i} style={{ flex: 1, height: Math.max(2, r * H), backgroundColor: colors.primary, opacity: 0.5 + (i / running.length) * 0.5, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <AppText variant="caption" color={colors.textFaint}>
          Shot 1
        </AppText>
        <AppText variant="caption" color={colors.insight}>
          — expected
        </AppText>
        <AppText variant="caption" color={colors.textFaint}>
          Shot {running.length}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shot: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  history: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1,
    aspectRatio: 0.8,
    maxWidth: 52,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 1, borderBottomWidth: 1, borderBottomColor: colors.border },
  expectedLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.insight, zIndex: 1 },
});
