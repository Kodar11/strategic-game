import { Minus, Plus } from '@/src/components/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { z } from 'zod';

import { SceneArt } from '@/src/components/art/SceneArt';
import { Completion } from '@/src/components/lesson/Completion';
import { LessonShell, type StepDef } from '@/src/components/lesson/LessonShell';
import { Dialogue, FeedbackPanel, Panel, Stat, StepHeading } from '@/src/components/lesson/Panels';
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
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { Slider } from '@/src/components/ui/Slider';
import type { LessonMeta } from '@/src/content/lessons';
import { roundResultClip } from '@/src/features/audio/reactions';
import { NarrateOn } from '@/src/features/audio/useNarration';
import {
  MAX_GUESS,
  MAX_PER_TYPE,
  MIN_GUESS,
  PLAYER_TYPES,
  PLAYER_TYPE_INFO,
  type Population,
  type RoundResult,
  bestGuessForPopulation,
  eliminationBound,
  levelKGuess,
  opponentPicks,
  playRound,
  populationSize,
  targetFor,
} from '@/src/game/two-thirds-game';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { NumberLine } from './NumberLine';
import {
  ALL_INSTINCTIVE,
  ALL_THEORISTS,
  AVERAGE_GUESSES,
  LAB_PREDICTIONS,
  averageGuessLabel,
  averagePredictionFeedback,
  detectiveRecap,
  labPredictionFeedback,
  LAB_SEED,
  type LabPrediction,
  ROUND1_POP,
  ROUND1_SEED,
  ROUND2_POP,
  ROUND2_SEED,
  othersAverage,
  populationChanged,
} from './copy';

const MAX_ELIM = 8;

const populationSchema = z.object({
  level0: z.number().int().min(0).max(MAX_PER_TYPE),
  level1: z.number().int().min(0).max(MAX_PER_TYPE),
  level2: z.number().int().min(0).max(MAX_PER_TYPE),
  level3: z.number().int().min(0).max(MAX_PER_TYPE),
  equilibrium: z.number().int().min(0).max(MAX_PER_TYPE),
});
const guess = z.number().int().min(MIN_GUESS).max(MAX_GUESS);
const schema = z.object({
  crowdPrediction: predictionSchema(z.enum(['random', 'one-step', 'two-step', 'zero'])),
  guess1: guess,
  committed1: z.boolean(),
  guess2: guess,
  committed2: z.boolean(),
  labPrediction: predictionSchema(z.enum(['up', 'down', 'same'])),
  lab: populationSchema,
  labTouched: z.boolean(),
  elim: z.number().int().min(0).max(MAX_ELIM),
  transferPick: z.string().nullable(),
  transferChecked: z.boolean(),
});
type Data = z.infer<typeof schema>;

const INITIAL: Data = {
  crowdPrediction: emptyPrediction(),
  guess1: 50,
  committed1: false,
  guess2: 50,
  committed2: false,
  labPrediction: emptyPrediction(),
  lab: ROUND1_POP,
  labTouched: false,
  elim: 0,
  transferPick: null,
  transferChecked: false,
};

const TRANSFER: TransferOption[] = [
  {
    id: 'model',
    label: 'First estimate how many people will follow that advice',
    verdict: 'strong',
    clip: 'l2.transfer.model',
    feedback:
      'The advice only works if few people follow it. If most do, 9:30 becomes the new jam. The best time depends on how many steps ahead the rest of the crowd is thinking.',
  },
  {
    id: 'advice',
    label: 'Leave at 9:30, as the advice says',
    verdict: 'misconception',
    clip: 'l2.transfer.advice',
    feedback: 'That is one step of reasoning — beating last year’s crowd. But everyone read the same advice, so you may be joining this year’s crowd instead.',
  },
  {
    id: 'ten',
    label: 'Stay until 10 — everyone else will have left at 9:30',
    verdict: 'defensible',
    clip: 'l2.transfer.ten',
    feedback: 'One step further, and it can work — but only if most people really do leave early. If the advice didn’t spread widely, 10 pm is the old jam again.',
  },
  {
    id: 'earliest',
    label: 'Leave as early as possible to out-think everyone',
    verdict: 'misconception',
    clip: 'l2.transfer.earliest',
    feedback: 'You would beat the traffic and miss the festival. Reasoning further than the crowd costs you something — like picking 0 in the number game.',
  },
];

const TRANSFER_ANALOGY = {
  holds: 'Like the number game, your best choice depends on what others choose — and they are guessing what everyone else will do, including you.',
  differs: 'There is no single target and no fixed number of players, people care about more than the traffic, and some will leave early for reasons that have nothing to do with reasoning about others.',
};

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function StrategyDetective({ lesson }: { lesson: LessonMeta }) {
  const TOTAL = 11;
  const { step, data, update, goTo, restart } = useLessonFlow(lesson.id, schema, INITIAL, TOTAL);
  const enter = useEnter();

  const round1 = data.committed1 ? playRound(data.guess1, ROUND1_POP, ROUND1_SEED) : null;
  const round2 = data.committed2 ? playRound(data.guess2, ROUND2_POP, ROUND2_SEED) : null;
  const averageGuess = lockedAnswer(data.crowdPrediction);

  const steps: StepDef[] = [
    {
      // Situation: the game, and who you're playing against (honestly: simulated players).
      key: 'intro',
      cta: 'Join the game',
      render: () => (
        <>
          <Animated.View entering={enter(0, 'fade')} style={{ borderRadius: 20, overflow: 'hidden' }}>
            <SceneArt scene="crowd" height={170} />
          </Animated.View>
          <StepHeading kicker="Lesson 2" title="Guess two-thirds of the average" body="You and ten other players each secretly pick a whole number from 0 to 100." clip="l2.intro.heading" />
          <Dialogue character="sen" expression="explaining" clip="l2.intro.sen">
            The target is two-thirds of everyone&apos;s average pick — yours included. Closest to the target wins.
          </Dialogue>
          <Dialogue character="maya" expression="confident" align="right" delay={120} clip="l2.intro.maya">
            I&apos;m in. The question is what the rest of you will do.
          </Dialogue>
          <AppText variant="caption" color={colors.textMuted}>
            The ten others are simulated players. Each follows a fixed rule of thumb — you&apos;ll see their rules after two rounds.
          </AppText>
        </>
      ),
    },
    {
      // Rules: one worked example of the scoring, no strategy.
      key: 'example',
      render: () => (
        <>
          <StepHeading title="A quick example" body="Suppose the average of all picks turns out to be 60." />
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Stat label="Average" value="60" />
              <Stat label="Target = ⅔ × 60" value="40" tone="amber" />
            </View>
            <AppText variant="small" color={colors.textMuted}>
              Whoever picked closest to 40 wins. If several are equally close, they share the win.
            </AppText>
          </Card>
          <Dialogue character="aarav" expression="curious" clip="l2.example.aarav">
            So I&apos;m not guessing a number — I&apos;m guessing what everyone else will guess.
          </Dialogue>
        </>
      ),
    },
    {
      // Prediction + decision: model the crowd first, then pick.
      key: 'guess1',
      cta: data.committed1 ? 'See the results' : 'Submit my number',
      canContinue: data.committed1 || canLock(data.crowdPrediction),
      blockedHint: missingForLock(data.crowdPrediction) === 'confidence' ? 'Rate how confident you are in your read of the crowd.' : 'Predict how the crowd will pick first.',
      // Submitting the number also locks the crowd prediction it was based on.
      onContinue: () =>
        update((d) => {
          if (d.committed1) return {};
          const crowdPrediction = lockPrediction(d.crowdPrediction);
          return crowdPrediction.locked ? { crowdPrediction, committed1: true } : {};
        }),
      render: () => (
        <>
          <StepHeading kicker="Round 1" title="Read the crowd, then pick" body="Ten others are choosing right now. Start with them, not with your number." />
          <PredictionPrompt
            question="What do you think the other ten will average?"
            options={AVERAGE_GUESSES}
            value={data.crowdPrediction.answer}
            onChange={(a) => update((d) => ({ crowdPrediction: chooseAnswer(d.crowdPrediction, a) }))}
            confidence={data.crowdPrediction.confidence}
            onConfidence={(c) => update((d) => ({ crowdPrediction: rateConfidence(d.crowdPrediction, c) }))}
            locked={data.crowdPrediction.locked}
          />
          {data.crowdPrediction.answer ? <NumberPicker value={data.guess1} onChange={(v) => update({ guess1: v })} locked={data.committed1} /> : null}
        </>
      ),
    },
    {
      // Consequence: the target, your distance, and how your crowd model held up.
      key: 'result1',
      render: () =>
        round1 ? (
          <>
            <RoundResultView result={round1} round={1} />
            {averageGuess ? (
              <PredictionResult
                predicted={averageGuessLabel(averageGuess).split(' — ')[0]}
                actual={`Average ${othersAverage(round1).toFixed(1)}`}
                verdict={averagePredictionFeedback(averageGuess, round1).verdict}
                confidence={data.crowdPrediction.confidence}
                title="Your read of the crowd">
                {averagePredictionFeedback(averageGuess, round1).text}
              </PredictionResult>
            ) : null}
          </>
        ) : null,
    },
    {
      // Decision under a changed crowd: the same players, one level deeper.
      key: 'guess2',
      cta: data.committed2 ? 'See the results' : 'Submit my number',
      onContinue: () => {
        if (!data.committed2) update({ committed2: true });
      },
      render: () => (
        <>
          <StepHeading
            kicker="Round 2"
            title="Same crowd, one step wiser"
            body={`Everyone saw that last target of ${round1 ? round1.target.toFixed(1) : '—'}. In this simulation, each player now reasons exactly one step deeper than before.`}
          />
          <Dialogue character="maya" expression="thinking" align="right" clip="l2.guess2.maya">
            If they all expect a lower target, the target itself moves lower. Where does it stop?
          </Dialogue>
          <NumberPicker value={data.guess2} onChange={(v) => update({ guess2: v })} locked={data.committed2} />
        </>
      ),
    },
    {
      // Discovery: the rules didn't change; only the players' depth did.
      key: 'result2',
      render: () =>
        round1 && round2 ? (
          <>
            <RoundResultView result={round2} round={2} />
            <Panel
              tone="insight"
              title={`The target ${round2.target < round1.target ? 'fell' : 'moved'} from ${round1.target.toFixed(1)} to ${round2.target.toFixed(1)}`}>
              Nobody changed the rules. The other players only changed how deeply they reasoned — and that alone moved the right answer.
            </Panel>
          </>
        ) : null,
    },
    {
      // Concept: name level-k reasoning once both rounds have shown it.
      key: 'types',
      render: () => (
        <>
          <StepHeading kicker="Meet the players" title="Five ways to reason" body="Here are the stated rules the simulated players were following." />
          <View style={{ gap: space.sm }}>
            {PLAYER_TYPES.map((t, i) => (
              <Animated.View key={t} entering={enter(i * 50)}>
                <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                  <View style={styles.levelBadge}>
                    <AppText variant="bodyStrong" tabular>
                      {t === 'level0' ? '0' : t === 'equilibrium' ? '∞' : t.slice(-1)}
                    </AppText>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyStrong">{PLAYER_TYPE_INFO[t].label}</AppText>
                    <AppText variant="small" color={colors.textMuted}>
                      {PLAYER_TYPE_INFO[t].rule}
                    </AppText>
                  </View>
                </Card>
              </Animated.View>
            ))}
          </View>
          <Dialogue character="meera" expression="explaining" clip="l2.types.meera">
            Each extra step multiplies the previous guess by ⅔: 50 → {levelKGuess(1)} → {levelKGuess(2)} → {levelKGuess(3)}. This is called level-k reasoning.
          </Dialogue>
        </>
      ),
    },
    {
      // Experiment: predict, then change who you're playing against.
      key: 'lab',
      canContinue: data.labTouched,
      blockedHint: data.labPrediction.locked
        ? 'Change the crowd at least once to see the effect.'
        : missingForLock(data.labPrediction) === 'confidence'
          ? 'Rate how confident you are, then confirm.'
          : 'Make and confirm a prediction first.',
      render: () => (
        <CrowdLab
          pop={data.lab}
          prediction={data.labPrediction}
          touched={data.labTouched}
          onPredict={(a) => update((d) => ({ labPrediction: chooseAnswer(d.labPrediction, a) }))}
          onConfidence={(c) => update((d) => ({ labPrediction: rateConfidence(d.labPrediction, c) }))}
          onConfirm={() => update((d) => ({ labPrediction: lockPrediction(d.labPrediction) }))}
          // Only a real change of crowd counts as running the experiment, and only after the prediction is locked.
          onChange={(lab) => update((d) => (d.labPrediction.locked && populationChanged(d.lab, lab) ? { lab, labTouched: true } : {}))}
        />
      ),
    },
    {
      // Theory vs practice: where perfect reasoning leads, and where real people stop.
      key: 'theory',
      canContinue: data.elim >= 3,
      blockedHint: 'Run at least three rounds of elimination.',
      render: () => (
        <>
          <StepHeading kicker="The theory" title="What if everyone is perfectly rational?" body="Assume every player is rational, and everyone knows that everyone is rational, and so on." />
          <Card style={{ gap: space.sm }}>
            {Array.from({ length: data.elim + 1 }, (_, k) => {
              const bound = eliminationBound(k);
              return (
                <Animated.View key={k} entering={enter(0)} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <AppText variant="caption" color={colors.textMuted}>
                      {k === 0 ? 'Any number is possible' : `Round ${k} of elimination`}
                    </AppText>
                    <AppText variant="caption" color={colors.text} tabular>
                      0 – {bound.toFixed(1)}
                    </AppText>
                  </View>
                  <View style={styles.elimTrack}>
                    <View style={[styles.elimFill, { width: `${bound}%` }]} />
                  </View>
                </Animated.View>
              );
            })}
            <Button
              label={data.elim === 0 ? 'Eliminate numbers that can never win' : 'Eliminate again'}
              variant="secondary"
              compact
              disabled={data.elim >= MAX_ELIM}
              onPress={() => {
                haptic.select();
                update((d) => ({ elim: Math.min(MAX_ELIM, d.elim + 1) }));
              }}
            />
          </Card>
          {data.elim >= 1 ? (
            <AppText variant="small" color={colors.textMuted}>
              The target can be at most ⅔ × 100 ≈ 66.7, so no rational player picks above it. If everyone knows that, the target is at most ⅔ × 66.7 ≈ 44.4 — and so on.
            </AppText>
          ) : null}
          <NarrateOn clip="l2.theory.zero" trigger={data.elim >= 3} />
          {data.elim >= 3 ? (
            <>
              <Panel tone="insight" title="Theory predicts 0. Real crowds don't play 0.">
                Repeating the elimination forever leaves only 0. But that requires everyone to reason all the way down and to trust that everyone else does too. In the rounds you played, the winning number came from modelling the actual crowd.
              </Panel>
              <Card style={{ gap: space.xs }}>
                <SectionLabel>With real people</SectionLabel>
                <AppText variant="small">
                  When groups play this for the first time, the average usually lands well above 0 — often somewhere in the 20s or 30s — and 0 rarely wins. Played again and again, groups tend to drift lower.
                </AppText>
              </Card>
            </>
          ) : null}
        </>
      ),
    },
    {
      // Transfer: iterative reasoning in a situation with no numbers to guess.
      key: 'transfer',
      canContinue: data.transferChecked,
      blockedHint: 'Pick an answer and check your reasoning.',
      render: () => (
        <>
          <StepHeading
            kicker="New situation"
            title="Leaving the festival"
            body="A festival ends at 10 pm. Last year everyone left at 10 and the car park was jammed for an hour. This year a popular post says: “Leave at 9:30 to beat the rush.” Lots of people have read it."
          />
          <TransferQuestion
            question="How should you decide when to leave?"
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
    {
      key: 'done',
      render: () => (
        <Completion
          lesson={lesson}
          takeaway="Your best move depends on how deeply others think — not on how deeply you can think."
          takeawayClip="l2.done.takeaway"
          remember={[
            'Model the people you are actually playing with.',
            'Theory tells you where perfect reasoning leads; real players often stop earlier.',
            'Thinking one step beyond the crowd usually beats thinking ten steps beyond it.',
          ]}
          recap={detectiveRecap({ averageGuess, round1, round2 })}
          reflection="Think of a recent choice that depended on what other people would do — a queue, a sale, a deadline. Did you assume they'd think one step ahead, or several? What would have told you which?"
          nextHook="Here, everyone wanted to out-think each other. Next, two people want the same thing — to find each other — and still might fail."
          onReplay={restart}
        />
      ),
    },
  ];

  return <LessonShell lesson={lesson} steps={steps} step={step} goTo={goTo} />;
}

function NumberPicker({ value, onChange, locked }: { value: number; onChange: (v: number) => void; locked: boolean }) {
  const quick = [0, 22, 33, 50, 67];
  return (
    <Card style={{ gap: space.lg, opacity: locked ? 0.7 : 1 }}>
      <View style={{ alignItems: 'center' }}>
        <AppText variant="caption" color={colors.textMuted}>
          {locked ? 'Your locked-in number' : 'Your number'}
        </AppText>
        <AppText variant="display" tabular style={{ fontSize: 64, lineHeight: 72 }} accessibilityLiveRegion="polite">
          {value}
        </AppText>
      </View>
      {locked ? (
        <AppText variant="small" color={colors.textMuted} align="center">
          Submitted. Replay the lesson to try a different number.
        </AppText>
      ) : (
        <>
          <Slider label="Choose 0 to 100" value={value} min={MIN_GUESS} max={MAX_GUESS} step={1} onChange={onChange} showValue={false} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' }}>
            {quick.map((q) => (
              <Pressable
                key={q}
                onPress={() => {
                  haptic.select();
                  onChange(q);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Set to ${q}`}
                style={[styles.chip, value === q && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
                <AppText variant="small" weight="semibold" tabular>
                  {q}
                </AppText>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}

function RoundResultView({ result, round }: { result: RoundResult; round: 1 | 2 }) {
  const { learner, target, average, winners, learnerRank, playerCount } = result;
  const won = learner.isWinner;
  const winning = winners.find((w) => w.type !== 'you') ?? winners[0];
  const sumText = result.picks.map((p) => p.guess).reduce((a, b) => a + b, 0).toFixed(1);
  return (
    <>
      <StepHeading kicker={`Round ${round} results`} title={won ? (winners.length > 1 ? 'You shared the win' : 'You won this round') : `You placed ${ordinal(learnerRank)} of ${playerCount}`} />
      <Card style={{ gap: space.lg }}>
        <NumberLine picks={result.picks} target={target} average={average} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Stat label="Average" value={average.toFixed(1)} />
          <Stat label="Target (⅔)" value={target.toFixed(1)} tone="amber" />
          <Stat label="You were off by" value={learner.distance.toFixed(1)} tone="blue" />
        </View>
        <AppText variant="caption" color={colors.textMuted}>
          Sum of all {playerCount} picks = {sumText}. Average = {sumText} ÷ {playerCount} = {average.toFixed(1)}. Target = ⅔ × {average.toFixed(1)} = {target.toFixed(1)}.
        </AppText>
      </Card>
      <Dialogue character="meera" expression={won ? 'satisfied' : 'explaining'} clip={roundResultClip(result)} clipKey={`l2.result${round}`}>
        {won
          ? `Your ${learner.guess} landed ${learner.distance.toFixed(1)} from the target. You read this crowd well.`
          : `You picked ${learner.guess}. The closest pick was ${winning.guess}, just ${winning.distance.toFixed(1)} away. ${
              learner.guess > target ? 'Your number was above the target this crowd produced.' : 'Your number was below the target this crowd produced.'
            }`}
      </Dialogue>
    </>
  );
}

const PRESETS: { label: string; pop: Population }[] = [
  { label: 'All Instinctive', pop: ALL_INSTINCTIVE },
  { label: 'Round 1 mix', pop: ROUND1_POP },
  { label: 'All Theorists', pop: ALL_THEORISTS },
];

function CrowdLab({
  pop,
  prediction,
  touched,
  onPredict,
  onConfidence,
  onConfirm,
  onChange,
}: {
  pop: Population;
  prediction: Data['labPrediction'];
  touched: boolean;
  onPredict: (p: LabPrediction) => void;
  onConfidence: (c: Confidence) => void;
  onConfirm: () => void;
  onChange: (p: Population) => void;
}) {
  const others = opponentPicks(pop, LAB_SEED);
  const best = bestGuessForPopulation(pop, LAB_SEED);
  const n = populationSize(pop);
  const { average, target } = targetFor([...others.map((o) => o.guess), best]);
  const pick = lockedAnswer(prediction);
  const fb = pick ? labPredictionFeedback(pick) : null;
  return (
    <>
      <StepHeading kicker="Crowd lab" title="Change the crowd, not the rules" body="Your best number is the one that lands exactly on the target, given what everyone else picks." />
      <PredictionPrompt
        question="Swap the round-1 mix for ten Theorists. What happens to your best pick?"
        options={LAB_PREDICTIONS}
        value={prediction.answer}
        onChange={onPredict}
        confidence={prediction.confidence}
        onConfidence={onConfidence}
        onConfirm={onConfirm}
        locked={prediction.locked}
      />
      {prediction.locked ? (
        <>
          <Card style={{ gap: space.sm }}>
            <SectionLabel>Players by reasoning type</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm }}>
              {PRESETS.map((p) => (
                <Button key={p.label} label={p.label} variant="secondary" compact onPress={() => onChange(p.pop)} />
              ))}
            </View>
            {PLAYER_TYPES.map((t) => (
              <View key={t} style={styles.labRow}>
                <AppText variant="small" style={{ flex: 1 }}>
                  {PLAYER_TYPE_INFO[t].label}
                </AppText>
                <Counter
                  label={PLAYER_TYPE_INFO[t].label}
                  value={pop[t]}
                  onChange={(v) => onChange({ ...pop, [t]: v })}
                  min={0}
                  max={MAX_PER_TYPE}
                  disableDecrement={n <= 1 && pop[t] > 0}
                />
              </View>
            ))}
          </Card>
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Stat label="Other players" value={String(n)} />
              <Stat label="Best pick for you" value={best.toFixed(1)} tone="blue" caption={`lands on target ${target.toFixed(1)}`} />
            </View>
            <AppText variant="caption" color={colors.textMuted}>
              Average with your best pick = {average.toFixed(1)}. Best pick solves: your number = ⅔ × average including your number.
            </AppText>
          </Card>
        </>
      ) : null}
      {touched && fb ? (
        <FeedbackPanel verdict={fb.verdict} title="Your prediction">
          {fb.text} The rules never changed; only the crowd did.
        </FeedbackPanel>
      ) : null}
    </>
  );
}

function Counter({
  label,
  value,
  onChange,
  min,
  max,
  disableDecrement,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  disableDecrement?: boolean;
}) {
  const dec = value <= min || !!disableDecrement;
  const inc = value >= max;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessible accessibilityRole="adjustable" accessibilityLabel={`${label} players`} accessibilityValue={{ min, max, now: value }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => {
      if (e.nativeEvent.actionName === 'increment' && !inc) onChange(value + 1);
      if (e.nativeEvent.actionName === 'decrement' && !dec) onChange(value - 1);
    }}>
      <Pressable disabled={dec} onPress={() => { haptic.select(); onChange(value - 1); }} style={[styles.counterBtn, dec && { opacity: 0.35 }]} accessibilityRole="button" accessibilityState={{ disabled: dec }} accessibilityLabel={`Fewer ${label}`}>
        <Minus size={16} color={colors.text} />
      </Pressable>
      <AppText variant="bodyStrong" tabular style={{ width: 24, textAlign: 'center' }}>
        {value}
      </AppText>
      <Pressable disabled={inc} onPress={() => { haptic.select(); onChange(value + 1); }} style={[styles.counterBtn, inc && { opacity: 0.35 }]} accessibilityRole="button" accessibilityState={{ disabled: inc }} accessibilityLabel={`More ${label}`}>
        <Plus size={16} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  levelBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minWidth: 52,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  elimTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  elimFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 4 },
  labRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  counterBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
