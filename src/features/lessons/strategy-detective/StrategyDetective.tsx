import { Minus, Plus } from '@/src/components/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { z } from 'zod';

import { SceneArt } from '@/src/components/art/SceneArt';
import { Completion } from '@/src/components/lesson/Completion';
import { LessonShell, type StepDef } from '@/src/components/lesson/LessonShell';
import { Dialogue, Panel, Stat, StepHeading } from '@/src/components/lesson/Panels';
import { TransferQuestion, type TransferOption } from '@/src/components/lesson/TransferQuestion';
import { useEnter } from '@/src/components/lesson/motion';
import { useLessonFlow } from '@/src/components/lesson/useLessonFlow';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { Slider } from '@/src/components/ui/Slider';
import type { LessonMeta } from '@/src/content/lessons';
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
  shiftPopulation,
  targetFor,
} from '@/src/game/two-thirds-game';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { NumberLine } from './NumberLine';

/** Round 1 crowd: a mix of reasoning depths. Round 2: the same people, each one level deeper. */
const ROUND1_POP: Population = { level0: 4, level1: 3, level2: 2, level3: 1, equilibrium: 0 };
const ROUND2_POP = shiftPopulation(ROUND1_POP);
const ROUND1_SEED = 11;
const ROUND2_SEED = 12;
const LAB_SEED = 21;
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
  guess1: guess,
  committed1: z.boolean(),
  guess2: guess,
  committed2: z.boolean(),
  lab: populationSchema,
  labTouched: z.boolean(),
  elim: z.number().int().min(0).max(MAX_ELIM),
  transferPick: z.string().nullable(),
  transferChecked: z.boolean(),
});
type Data = z.infer<typeof schema>;

const INITIAL: Data = {
  guess1: 50,
  committed1: false,
  guess2: 50,
  committed2: false,
  lab: ROUND1_POP,
  labTouched: false,
  elim: 0,
  transferPick: null,
  transferChecked: false,
};

const TRANSFER: TransferOption[] = [
  {
    id: 'others',
    label: 'Estimating how far ahead the other bidders are thinking',
    strong: true,
    feedback:
      'Your best bid depends on what others will bid, which depends on what they expect from you. Modelling their depth of reasoning — not just your own valuation — is the core skill.',
  },
  {
    id: 'value-only',
    label: 'Only the item’s true value — the other bidders don’t matter',
    strong: false,
    feedback: 'Value sets your limit, but whether you win, and at what price, depends on how the others reason.',
  },
  {
    id: 'deepest',
    label: 'Thinking more steps ahead than anyone else, always',
    strong: false,
    feedback: 'Out-thinking a crowd that reasons less deeply can make you overshoot — just as guessing 0 rarely wins the number game.',
  },
];

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

  const steps: StepDef[] = [
    {
      key: 'intro',
      cta: 'Join the game',
      render: () => (
        <>
          <Animated.View entering={enter(0, 'fade')} style={{ borderRadius: 20, overflow: 'hidden' }}>
            <SceneArt scene="crowd" height={170} />
          </Animated.View>
          <StepHeading kicker="Lesson 2" title="Guess two-thirds of the average" body="You and ten other players each secretly pick a whole number from 0 to 100." />
          <Dialogue character="sen" expression="explaining">
            The target is two-thirds of everyone&apos;s average pick — yours included. Closest to the target wins.
          </Dialogue>
          <Dialogue character="maya" expression="confident" align="right" delay={120}>
            I&apos;m in. The question is what the rest of you will do.
          </Dialogue>
        </>
      ),
    },
    {
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
          <Dialogue character="aarav" expression="curious">
            So I&apos;m not guessing a number — I&apos;m guessing what everyone else will guess.
          </Dialogue>
        </>
      ),
    },
    {
      key: 'guess1',
      cta: data.committed1 ? 'See the results' : 'Submit my number',
      onContinue: () => {
        if (!data.committed1) update({ committed1: true });
      },
      render: () => (
        <>
          <StepHeading kicker="Round 1" title="Pick your number" body="Ten others are choosing right now. Think about how they might think." />
          <NumberPicker value={data.guess1} onChange={(v) => update({ guess1: v })} locked={data.committed1} />
        </>
      ),
    },
    {
      key: 'result1',
      render: () => (round1 ? <RoundResultView result={round1} round={1} /> : null),
    },
    {
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
            body={`Everyone saw that last target of ${round1 ? round1.target.toFixed(1) : '—'}. This time, each player reasons one step deeper than before.`}
          />
          <Dialogue character="maya" expression="thinking" align="right">
            If they all expect a lower target, the target itself moves lower. Where does it stop?
          </Dialogue>
          <NumberPicker value={data.guess2} onChange={(v) => update({ guess2: v })} locked={data.committed2} />
        </>
      ),
    },
    {
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
      key: 'types',
      render: () => (
        <>
          <StepHeading kicker="Meet the players" title="Five ways to reason" body="The simulated players aren't random personalities. Each follows one of these stated rules." />
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
          <Dialogue character="meera" expression="explaining">
            Each extra step multiplies the previous guess by ⅔: 50 → {levelKGuess(1)} → {levelKGuess(2)} → {levelKGuess(3)}. This is called level-k reasoning.
          </Dialogue>
        </>
      ),
    },
    {
      key: 'lab',
      canContinue: data.labTouched,
      blockedHint: 'Change the crowd at least once to see the effect.',
      render: () => <CrowdLab pop={data.lab} onChange={(lab) => update({ lab, labTouched: true })} />,
    },
    {
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
          {data.elim >= 3 ? (
            <Panel tone="insight" title="Theory predicts 0. Real crowds don't play 0.">
              Repeating the elimination forever leaves only 0. But that requires everyone to reason all the way down and to trust that everyone else does too. In the rounds you played, the winning number came from modelling the actual crowd.
            </Panel>
          ) : null}
        </>
      ),
    },
    {
      key: 'transfer',
      canContinue: data.transferChecked,
      blockedHint: 'Pick an answer and check your reasoning.',
      render: () => (
        <>
          <StepHeading kicker="New situation" title="The sealed-bid auction" body="You're bidding on a vintage camera in a sealed-bid auction. Highest bid wins and pays what they bid." />
          <TransferQuestion
            question="Beyond knowing what the camera is worth to you, what matters most for your bid?"
            options={TRANSFER}
            picked={data.transferPick}
            checked={data.transferChecked}
            onPick={(id) => update({ transferPick: id })}
            onCheck={() => update({ transferChecked: true })}
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
          remember={[
            'Model the people you are actually playing with.',
            'Theory tells you where perfect reasoning leads; real players often stop earlier.',
            'Thinking one step beyond the crowd usually beats thinking ten steps beyond it.',
          ]}
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
      <Dialogue character="meera" expression={won ? 'satisfied' : 'explaining'}>
        {won
          ? `Your ${learner.guess} landed ${learner.distance.toFixed(1)} from the target. You read this crowd well.`
          : `You picked ${learner.guess}. The closest pick was ${winning.guess}, just ${winning.distance.toFixed(1)} away. ${
              learner.guess > target ? 'You expected the crowd to aim higher than it did.' : 'This crowd aimed higher than you expected.'
            }`}
      </Dialogue>
    </>
  );
}

function CrowdLab({ pop, onChange }: { pop: Population; onChange: (p: Population) => void }) {
  const others = opponentPicks(pop, LAB_SEED);
  const best = bestGuessForPopulation(pop, LAB_SEED);
  const n = populationSize(pop);
  const { average, target } = targetFor([...others.map((o) => o.guess), best]);
  return (
    <>
      <StepHeading kicker="Crowd lab" title="Design the crowd" body="Change who you're playing against. The best number to pick updates as you go." />
      <Card style={{ gap: space.sm }}>
        <SectionLabel>Players by reasoning type</SectionLabel>
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
      <Panel tone="insight" title="Try this">
        Fill the crowd with Instinctive players, then with Theorists. The &ldquo;right&rdquo; answer swings from the 30s to 0 — the rules never change.
      </Panel>
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
    minHeight: 40,
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
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
