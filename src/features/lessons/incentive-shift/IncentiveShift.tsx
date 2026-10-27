import { ChevronDown, Gavel, Gift, RotateCcw } from '@/src/components/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { z } from 'zod';

import { SceneArt } from '@/src/components/art/SceneArt';
import { Portrait } from '@/src/components/characters/Portrait';
import type { CharacterId } from '@/src/components/characters/cast';
import { Completion } from '@/src/components/lesson/Completion';
import { LessonShell, type StepDef } from '@/src/components/lesson/LessonShell';
import { Dialogue, FeedbackPanel, Panel, Stat, StepHeading } from '@/src/components/lesson/Panels';
import { PayoffMatrix } from '@/src/components/lesson/PayoffMatrix';
import { PredictionPrompt, PredictionResult } from '@/src/components/lesson/Prediction';
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
import { Slider } from '@/src/components/ui/Slider';
import type { LessonMeta } from '@/src/content/lessons';
import type { ClipId } from '@/src/features/audio/clips';
import { NarrateOn } from '@/src/features/audio/useNarration';
import {
  BASE_PRICING_GAME,
  type IncentiveRules,
  NO_RULES,
  PENALTY_RANGE,
  REWARD_RANGE,
  applyRules,
  cutAdvantage,
  evaluatePolicy,
  withDetection,
} from '@/src/game/incentives';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { PRICE_LABEL } from '../shared/pricing';
import {
  DETECTION_PREDICTIONS,
  ENFORCEMENT_RESET,
  PROPOSAL,
  PROPOSAL_PREDICTIONS,
  detectionFeedback,
  incentiveRecap,
  incentiveRecords,
  proposalExplanation,
  proposalFeedback,
  proposalLabel,
  proposalOutcome,
  changeRules,
  ruleWorks,
} from './copy';

const schema = z.object({
  proposal: predictionSchema(z.enum(['maintain', 'cut', 'split', 'unclear'])),
  penalty: z.number().min(PENALTY_RANGE.min).max(PENALTY_RANGE.max),
  reward: z.number().min(REWARD_RANGE.min).max(REWARD_RANGE.max),
  detectionPrediction: predictionSchema(z.enum(['yes', 'no', 'depends'])),
  detection: z.number().int().min(0).max(100),
  detectionTouched: z.boolean(),
  opened: z.array(z.string()),
  transferPick: z.string().nullable(),
  transferChecked: z.boolean(),
});
type Data = z.infer<typeof schema>;

const INITIAL: Data = {
  proposal: emptyPrediction(),
  penalty: 0,
  reward: 0,
  ...ENFORCEMENT_RESET,
  opened: [],
  transferPick: null,
  transferChecked: false,
};

const ROW_LABELS = { maintain: 'QuickEats maintains', cut: 'QuickEats cuts' } as const;
const COL_LABELS = { maintain: 'FoodKart maintains', cut: 'FoodKart cuts' } as const;
const fmt = (n: number) => String(Number(n.toFixed(2)));

const EXAMPLE_FINE: IncentiveRules = { cutPenalty: 3, maintainReward: 0 };
const EXAMPLE_REWARD: IncentiveRules = { cutPenalty: 0, maintainReward: 3 };

const SIDE_EFFECTS: { id: string; character: CharacterId; title: string; body: string; clip: ClipId }[] = [
  {
    id: 'customers',
    character: 'kavya',
    clip: 'l5.side.customers',
    title: 'Customers pay more',
    body: 'The price war was good for Kavya. A rule that ends it raises what customers pay. "Better for the companies" can be worse for the people they serve.',
  },
  {
    id: 'enforcement',
    character: 'arjun',
    clip: 'l5.side.enforcement',
    title: 'Someone has to enforce it',
    body: 'Detecting "price cuts" means defining them and watching for disguised discounts, coupons and bundles. Enforcement costs money, and loopholes change the game again.',
  },
  {
    id: 'competition',
    character: 'rohan',
    clip: 'l5.side.competition',
    title: 'Competition moves elsewhere',
    body: 'If price is off the table, Rohan may compete on speed, quality or marketing instead — not modelled here, but likely in reality. New rivals may also enter.',
  },
];

const TRANSFER: TransferOption[] = [
  {
    id: 'team-bonus',
    label: 'Add a team bonus paid when the whole team hits its target',
    verdict: 'strong',
    clip: 'l5.transfer.team-bonus',
    feedback:
      'This changes the payoffs: sharing now earns you something directly. Like the reward lever, it has a cost — and it can invite free-riding, so it needs designing with care.',
  },
  {
    id: 'drop-ranking',
    label: 'Scrap the individual ranking bonus altogether',
    verdict: 'defensible',
    clip: 'l5.transfer.drop-ranking',
    feedback:
      'That removes the reason to hoard — but also the reward for effort. People may stop hoarding and stop pushing, too. Taking away an incentive changes more than the one behaviour you were aiming at.',
  },
  {
    id: 'ask',
    label: 'Remind everyone that collaboration matters',
    verdict: 'misconception',
    clip: 'l5.transfer.ask',
    feedback:
      'Encouragement doesn’t change the table. If hoarding still wins the individual ranking, the incentive to hoard is unchanged.',
  },
  {
    id: 'bigger-ranking',
    label: 'Make the top-performer prize even bigger',
    verdict: 'misconception',
    clip: 'l5.transfer.bigger-ranking',
    feedback: 'That raises the reward for beating colleagues, making hoarding even more attractive.',
  },
];

const TRANSFER_ANALOGY = {
  holds: 'Like the council, the manager can’t choose for people. They can only change what each choice earns — and the change has to outweigh what hoarding gains.',
  differs:
    'A team has many players, effort is hard to observe, and colleagues care about each other. A team bonus can invite free-riding — a cost the two-company pricing table never had.',
};

export default function IncentiveShift({ lesson }: { lesson: LessonMeta }) {
  // The three paired scenarios sit just before completion, so steps saved before they existed keep their meaning.
  const TOTAL = 14;
  const { step, data, update, goTo, restart } = useLessonFlow(lesson.id, schema, INITIAL, TOTAL, incentiveRecords);
  const scenarioDone = useProgress((s) => s.scenarioDone);
  const learning = useProgress((s) => s.learning);
  const enter = useEnter();

  const rules: IncentiveRules = { cutPenalty: data.penalty, maintainReward: data.reward };
  const before = evaluatePolicy(NO_RULES);
  const after = evaluatePolicy(rules);
  const ruledGame = applyRules(rules);
  // Always judged on the current rules, so changing them back can never leave a stale "it works".
  const ruleOk = ruleWorks(rules);
  const proposalPick = lockedAnswer(data.proposal);
  const detectionPick = lockedAnswer(data.detectionPrediction);

  const steps: StepDef[] = [
    {
      // Situation: a new role — the person who writes the rules.
      key: 'intro',
      cta: 'Look at the market',
      render: () => (
        <>
          <Animated.View entering={enter(0, 'fade')} style={{ borderRadius: 20, overflow: 'hidden' }}>
            <SceneArt scene="policy" height={180} />
          </Animated.View>
          <StepHeading kicker={`Lesson ${lesson.number}`} title="Change the rules, change the game" body="QuickEats and FoodKart are back in the same market. This time you'll also get to rewrite its rules." clip="l5.intro.heading" />
          <Dialogue character="arjun" expression="thinking" clip="l5.intro.arjun">
            I advise the city&apos;s delivery council. Before anyone writes a rule, I want to see what it actually does to each company&apos;s choices.
          </Dialogue>
        </>
      ),
    },
    {
      // Rules: the starting table and the number that matters.
      key: 'rules',
      render: () => (
        <>
          <StepHeading title="Today's rules: none" body="Same payoffs as Lesson 1. No penalties, no rewards." />
          <Card>
            <PayoffMatrix game={BASE_PRICING_GAME} rowName="QuickEats" colName="FoodKart" rowLabels={ROW_LABELS} colLabels={COL_LABELS} showBestReplies />
          </Card>
          <Dialogue character="meera" expression="explaining" clip="l5.rules.meera">
            Cutting is each company&apos;s best reply in every case — by exactly {cutAdvantage(NO_RULES)} points. Keep that number in mind.
          </Dialogue>
        </>
      ),
    },
    {
      // Prediction: judge a proposed incentive before seeing what it does.
      key: 'proposal',
      cta: data.proposal.locked ? 'Continue' : 'Lock prediction',
      canContinue: data.proposal.locked || canLock(data.proposal),
      blockedHint: missingForLock(data.proposal) === 'confidence' ? 'Rate how confident you are.' : 'Predict what the companies will do.',
      onContinue: () => update((d) => ({ proposal: lockPrediction(d.proposal) })),
      render: () => (
        <>
          <StepHeading kicker="A proposal" title="Will a reward end the price war?" />
          <Dialogue character="arjun" expression="explaining" clip="l5.proposal.arjun">
            One councillor wants to pay each company 1.5 points a week for keeping its prices. It sounds generous. Will it work?
          </Dialogue>
          <PredictionPrompt
            question="With a reward of 1.5 for maintaining, what will the companies do?"
            options={PROPOSAL_PREDICTIONS}
            value={data.proposal.answer}
            onChange={(a) => update((d) => ({ proposal: chooseAnswer(d.proposal, a) }))}
            confidence={data.proposal.confidence}
            onConfidence={(c) => update((d) => ({ proposal: rateConfidence(d.proposal, c) }))}
            locked={data.proposal.locked}
          />
        </>
      ),
    },
    {
      // Consequence: what the reward did to the payoffs — and what it didn't change.
      key: 'verdict',
      render: () => {
        const outcome = proposalOutcome();
        const fb = proposalPick ? proposalFeedback(proposalPick) : null;
        return (
          <>
            <StepHeading kicker="The verdict" title="The reward changed the numbers, not the choice" />
            <Card>
              <PayoffMatrix game={applyRules(PROPOSAL)} baseline={BASE_PRICING_GAME} rowName="QuickEats" colName="FoodKart" rowLabels={ROW_LABELS} colLabels={COL_LABELS} showBestReplies />
              <AppText variant="caption" color={colors.textMuted} style={{ marginTop: space.sm }}>
                Dots mark payoffs the reward changed: only cells where a company maintains.
              </AppText>
            </Card>
            {proposalPick && fb ? (
              <PredictionResult predicted={proposalLabel(proposalPick)} actual={proposalLabel(outcome)} verdict={fb.verdict} confidence={data.proposal.confidence}>
                {fb.text}
              </PredictionResult>
            ) : null}
            <Panel tone="insight" title="Close, but not enough" clip="l5.proposal.result">
              {proposalExplanation()}
            </Panel>
            <Card style={{ gap: space.xs }}>
              <SectionLabel>What a rule can and can&apos;t change</SectionLabel>
              <AppText variant="small">
                The reward changed the payoffs — what maintaining earns. It didn&apos;t change the companies&apos; preferences (each still wants the most profit) or their information (neither sees the other&apos;s choice). The levers in this lesson work through payoffs alone.
              </AppText>
            </Card>
          </>
        );
      },
    },
    {
      // Role: the designer's two levers.
      key: 'designer',
      cta: 'Open the policy sandbox',
      render: () => (
        <>
          <StepHeading kicker="Your turn" title="You're now the rule designer" body="You can't choose prices for the companies. You can only change what each choice costs or earns." />
          <View style={{ gap: space.sm }}>
            <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <Gavel size={22} color={colors.rivalText} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">Penalty for cutting (p)</AppText>
                <AppText variant="small" color={colors.textMuted}>
                  Subtracted from every company that cuts.
                </AppText>
              </View>
            </Card>
            <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <Gift size={22} color={colors.primaryText} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">Reward for maintaining (r)</AppText>
                <AppText variant="small" color={colors.textMuted}>
                  Paid to every company that maintains.
                </AppText>
              </View>
            </Card>
          </View>
          <Dialogue character="sen" expression="happy" delay={120} clip="l5.designer.sen">
            Your goal: find rules under which rational companies maintain prices. Then ask whether those rules are worth it.
          </Dialogue>
        </>
      ),
    },
    {
      // Experiment: two levers, one threshold.
      key: 'sandbox',
      canContinue: ruleOk,
      blockedHint: 'Find rules that make maintaining the best choice.',
      render: () => {
        const regime = after.regime;
        const adv = cutAdvantage(rules);
        const setRules = (patch: Partial<Pick<Data, 'penalty' | 'reward'>>) => update((d) => changeRules(d, patch));
        return (
          <>
            <StepHeading kicker="Policy sandbox" title="Set the rules" body="Combine the two levers. Watch which payoffs move, and when the best replies flip." />
            <NarrateOn clip="l5.sandbox.flip" trigger={ruleOk} />
            <Card style={{ gap: space.lg }}>
              <Slider label="Penalty for cutting (p)" tone="orange" value={data.penalty} min={PENALTY_RANGE.min} max={PENALTY_RANGE.max} step={PENALTY_RANGE.step} formatValue={(v) => v.toFixed(1)} onChange={(penalty) => setRules({ penalty })} />
              <Slider label="Reward for maintaining (r)" value={data.reward} min={REWARD_RANGE.min} max={REWARD_RANGE.max} step={REWARD_RANGE.step} formatValue={(v) => v.toFixed(1)} onChange={(reward) => setRules({ reward })} />
              <PayoffMatrix game={ruledGame} baseline={BASE_PRICING_GAME} rowName="QuickEats" colName="FoodKart" rowLabels={ROW_LABELS} colLabels={COL_LABELS} showBestReplies />
            </Card>
            <Panel
              tone={regime === 'maintain-dominant' ? 'success' : regime === 'tie' ? 'info' : 'caution'}
              title={regime === 'maintain-dominant' ? 'Maintaining is now dominant' : regime === 'tie' ? 'Exactly balanced' : 'Cutting is still dominant'}>
              {`Advantage of cutting = 2 − p − r = 2 − ${fmt(data.penalty)} − ${fmt(data.reward)} = ${fmt(adv)}. ` +
                (regime === 'maintain-dominant'
                  ? `Both companies maintain and earn ${fmt(after.companyPayoffs![0])} each.`
                  : regime === 'tie'
                    ? 'Each company is indifferent against either rival choice; the model cannot predict which way they go.'
                    : `Both still cut and earn ${fmt(after.companyPayoffs![0])} each.`)}
            </Panel>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Stat label="Penalties you collect" value={after.predicted ? fmt(after.penaltiesCollected) : '—'} tone="orange" caption="at the predicted outcome" />
              <Stat label="Rewards you pay" value={after.predicted ? fmt(after.rewardsPaid) : '—'} tone="blue" caption="at the predicted outcome" />
            </View>
            <Button label="Reset rules" variant="ghost" compact icon={RotateCcw} iconPosition="left" onPress={() => setRules({ penalty: 0, reward: 0 })} />
          </>
        );
      },
    },
    {
      // Experiment: stress-test the rule against imperfect enforcement (an explicit extension of the model).
      key: 'enforcement',
      canContinue: data.detectionPrediction.locked && data.detectionTouched,
      blockedHint: data.detectionPrediction.locked
        ? 'Move the detection slider to test your rule.'
        : missingForLock(data.detectionPrediction) === 'confidence'
          ? 'Rate how confident you are, then confirm.'
          : 'Make and confirm a prediction first.',
      render: () => {
        const d = data.detection / 100;
        const effective = withDetection(rules, d);
        const tested = evaluatePolicy(effective);
        const fb = detectionPick ? detectionFeedback(detectionPick, rules) : null;
        return (
          <>
            <StepHeading
              kicker="Stress test"
              title="What if cuts aren't always caught?"
              body="Discounts can hide in coupons and bundles. Suppose only some price cuts are detected, and companies weigh a fine by their chance of paying it."
            />
            <Dialogue character="arjun" expression="concerned" clip="l5.enforce.arjun">
              Every inspector costs the council money. I need to know how much checking your rule really needs.
            </Dialogue>
            <AppText variant="small" color={colors.textMuted}>
              Your rules: penalty p = {fmt(data.penalty)}, reward r = {fmt(data.reward)}.
            </AppText>
            <PredictionPrompt
              question="If only half of all price cuts are caught, will your rule still keep both companies from cutting?"
              options={DETECTION_PREDICTIONS}
              value={data.detectionPrediction.answer}
              onChange={(a) => update((d) => ({ detectionPrediction: chooseAnswer(d.detectionPrediction, a) }))}
              confidence={data.detectionPrediction.confidence}
              onConfidence={(c) => update((d) => ({ detectionPrediction: rateConfidence(d.detectionPrediction, c) }))}
              onConfirm={() => update((d) => ({ detectionPrediction: lockPrediction(d.detectionPrediction) }))}
              locked={data.detectionPrediction.locked}
            />
            {data.detectionPrediction.locked ? (
              <>
                <Card style={{ gap: space.lg }}>
                  <Slider
                    label="Share of price cuts detected"
                    tone="cyan"
                    value={data.detection}
                    min={0}
                    max={100}
                    step={10}
                    formatValue={(v) => `${v}%`}
                    marker={{ value: 50, label: 'half' }}
                    onChange={(detection) => update({ detection, detectionTouched: true })}
                  />
                  <PayoffMatrix game={applyRules(effective)} baseline={BASE_PRICING_GAME} rowName="QuickEats" colName="FoodKart" rowLabels={ROW_LABELS} colLabels={COL_LABELS} showBestReplies />
                </Card>
                <Panel
                  tone={tested.regime === 'maintain-dominant' ? 'success' : tested.regime === 'tie' ? 'info' : 'caution'}
                  title={`At ${data.detection}% detected: ${tested.regime === 'maintain-dominant' ? 'your rule holds' : tested.regime === 'tie' ? 'exactly balanced' : 'the price war returns'}`}>
                  {`Expected penalty = ${data.detection}% × ${fmt(data.penalty)} = ${fmt(effective.cutPenalty)}. Advantage of cutting = 2 − ${fmt(effective.cutPenalty)} − ${fmt(effective.maintainReward)} = ${fmt(cutAdvantage(effective))}.` +
                    (data.reward > 0 ? ' The reward is paid whether or not anyone is caught.' : '')}
                </Panel>
                <Card style={{ gap: space.sm }}>
                  <SectionLabel>Before vs after, at this detection rate</SectionLabel>
                  <CompareRow label="Both companies" before={before.predicted ? PRICE_LABEL[before.predicted.row] : 'unclear'} after={tested.predicted ? PRICE_LABEL[tested.predicted.row] : 'unclear (tie)'} />
                  <CompareRow label="Profit each" before={fmt(before.companyPayoffs![0])} after={tested.companyPayoffs ? fmt(tested.companyPayoffs[0]) : '—'} />
                  <CompareRow label="Council's net (expected)" before="0" after={tested.predicted ? fmt(tested.penaltiesCollected - tested.rewardsPaid) : '—'} />
                </Card>
              </>
            ) : null}
            {data.detectionTouched && fb ? (
              <FeedbackPanel verdict={fb.verdict} title="Your prediction">
                {fb.text}
              </FeedbackPanel>
            ) : null}
          </>
        );
      },
    },
    {
      // Concept: the same behaviour change can carry very different costs.
      key: 'levers',
      render: () => {
        const fine = evaluatePolicy(EXAMPLE_FINE);
        const reward = evaluatePolicy(EXAMPLE_REWARD);
        return (
          <>
            <StepHeading kicker="Compare levers" title="Same behaviour, different bill" body="Both of these rules make maintaining dominant. Look at what they cost the designer." />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <LeverCard title="Penalty p = 3" icon="fine" profit={fine.companyPayoffs![0]} flow={`Collects ${fmt(fine.penaltiesCollected)}`} note="Nobody cuts, so the fine is never paid — if the threat is credible." />
              <LeverCard title="Reward r = 3" icon="reward" profit={reward.companyPayoffs![0]} flow={`Pays out ${fmt(reward.rewardsPaid)}`} note="Works only while someone keeps paying, every week." />
            </View>
            <Dialogue character="meera" expression="satisfied" clip="l5.levers.meera">
              The behaviour flips at the same line — p + r &gt; 2 — but who bears the cost is completely different.
            </Dialogue>
          </>
        );
      },
    },
    {
      // Limits: unintended consequences outside the table.
      key: 'side-effects',
      canContinue: data.opened.length > 0,
      blockedHint: 'Open at least one perspective.',
      render: () => (
        <>
          <StepHeading kicker="Trade-offs" title="What the table doesn't count" body="Tap each perspective. None of these are in the numbers above — which is exactly why they matter." />
          {/* Read a perspective aloud when the learner opens it (the most recently opened one). */}
          <NarrateOn
            clip={SIDE_EFFECTS.find((s) => s.id === data.opened[data.opened.length - 1])?.clip}
            trigger={data.opened.join(',')}
            narrationKey={SIDE_EFFECTS.find((s) => s.id === data.opened[data.opened.length - 1])?.clip}
          />
          <View style={{ gap: space.sm }}>
            {SIDE_EFFECTS.map((s) => {
              const open = data.opened.includes(s.id);
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={s.title}
                  accessibilityHint={open ? 'Collapse' : 'Expand'}
                  accessibilityState={{ expanded: open }}
                  onPress={() => {
                    haptic.select();
                    update((d) => ({ opened: open ? d.opened.filter((o) => o !== s.id) : [...d.opened, s.id] }));
                  }}>
                  <Card style={{ gap: space.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                      <Portrait character={s.character} expression={open ? 'concerned' : 'neutral'} size={40} />
                      <AppText variant="bodyStrong" style={{ flex: 1 }}>
                        {s.title}
                      </AppText>
                      <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                        <ChevronDown size={18} color={colors.textMuted} />
                      </View>
                    </View>
                    {open ? (
                      <Animated.View entering={enter(0, 'fade')}>
                        <AppText variant="small" color={colors.textBody}>
                          {s.body}
                        </AppText>
                      </Animated.View>
                    ) : null}
                  </Card>
                </Pressable>
              );
            })}
          </View>
          <Panel tone="caution" title="Changing incentives changes behaviour — not necessarily for the better">
            A rule can hit its target and still leave people worse off overall. Good design weighs who gains, who pays, and how people will adapt.
          </Panel>
        </>
      ),
    },
    {
      // Transfer: incentive design in a workplace, not a market.
      key: 'transfer',
      canContinue: data.transferChecked,
      blockedHint: 'Pick an answer and check your reasoning.',
      render: () => (
        <>
          <StepHeading
            kicker="New situation"
            title="The knowledge-sharing problem"
            body="In a sales team, bonuses go to whoever ranks highest individually. Sharing leads helps the team, but helps your colleagues outrank you. Most people hoard."
          />
          <TransferQuestion
            question="As the manager, which change is most likely to shift behaviour?"
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
          takeaway="To change what people choose, change what their choices cost and earn — then check what else changes."
          takeawayClip="l5.done.takeaway"
          remember={[
            'Find the gap that makes the unwanted choice attractive, and how big it is.',
            'Penalties and rewards can flip the same choice at very different costs.',
            'Every rule has side effects outside the model. Look for them before you celebrate.',
          ]}
          nextHook="Next module: bargaining — what decides who gets what when two sides must agree."
          recap={[...incentiveRecap({ proposalPick, rules, detectionPick }), ...scenarioRecap(lesson.id, learning)]}
          reflection="Prediction challenge: a city starts charging for every bag of household rubbish. What do you expect most people to do — and what unwanted behaviour might the charge also create?"
          onReplay={restart}
        />
      ),
    },
  ];

  return <LessonShell lesson={lesson} steps={steps} step={step} goTo={goTo} onRestart={restart} />;
}

function CompareRow({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <View style={styles.compareRow}>
      <AppText variant="small" color={colors.textMuted} style={{ flex: 1.2 }}>
        {label}
      </AppText>
      <AppText variant="small" style={{ flex: 1 }} tabular>
        {before}
      </AppText>
      <AppText variant="small" color={colors.text} weight="semibold" style={{ flex: 1 }} tabular>
        → {after}
      </AppText>
    </View>
  );
}

function LeverCard({ title, icon, profit, flow, note }: { title: string; icon: 'fine' | 'reward'; profit: number; flow: string; note: string }) {
  const Icon = icon === 'fine' ? Gavel : Gift;
  return (
    <Card style={{ flex: 1, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon size={18} color={icon === 'fine' ? colors.rivalText : colors.primaryText} />
        <AppText variant="bodyStrong">{title}</AppText>
      </View>
      <AppText variant="caption" color={colors.textMuted}>
        Each company earns
      </AppText>
      <AppText variant="heading" tabular>
        {fmt(profit)}
      </AppText>
      <View style={styles.flow}>
        <AppText variant="caption" color={colors.insight}>
          Designer: {flow}
        </AppText>
      </View>
      <AppText variant="caption" color={colors.textMuted}>
        {note}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 },
  flow: { backgroundColor: colors.insightSoft, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 4, alignSelf: 'flex-start' },
});
