import { BadgePercent, ShieldCheck } from '@/src/components/ui/icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { z } from 'zod';

import { SceneArt } from '@/src/components/art/SceneArt';
import { Completion } from '@/src/components/lesson/Completion';
import { LessonShell, type StepDef } from '@/src/components/lesson/LessonShell';
import { Bullet, Dialogue, Panel, StepHeading } from '@/src/components/lesson/Panels';
import { PayoffMatrix } from '@/src/components/lesson/PayoffMatrix';
import { TransferQuestion, type TransferOption } from '@/src/components/lesson/TransferQuestion';
import { useEnter } from '@/src/components/lesson/motion';
import { useLessonFlow } from '@/src/components/lesson/useLessonFlow';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { Segmented } from '@/src/components/ui/Segmented';
import { Slider } from '@/src/components/ui/Slider';
import type { LessonMeta } from '@/src/content/lessons';
import {
  BASE_PRICING_GAME,
  PENALTY_RANGE,
  type PriceAction,
  applyCutPenalty,
  evaluatePolicy,
  regimeFor,
  rivalPolicy,
} from '@/src/game/incentives';
import { payoffAt, rowBestResponses } from '@/src/game/payoff-matrix';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors, space } from '@/src/theme/tokens';
import { CompanyBadge, OutcomeBoard, PRICE_LABEL, PRICE_SHORT } from '../shared/pricing';

const action = z.enum(['maintain', 'cut']);
const schema = z.object({
  choice: action.nullable(),
  committed: z.boolean(),
  rival: action.nullable(),
  altYou: action,
  altRival: action,
  inspected: z.object({ row: action, col: action }).nullable(),
  showBR: z.boolean(),
  penalty: z.number().min(PENALTY_RANGE.min).max(PENALTY_RANGE.max),
  foundFlip: z.boolean(),
  transferPick: z.string().nullable(),
  transferChecked: z.boolean(),
});
type Data = z.infer<typeof schema>;

const INITIAL: Data = {
  choice: null,
  committed: false,
  rival: null,
  altYou: 'maintain',
  altRival: 'maintain',
  inspected: null,
  showBR: false,
  penalty: 0,
  foundFlip: false,
  transferPick: null,
  transferChecked: false,
};

const ROW_LABELS = { maintain: 'You maintain', cut: 'You cut' } as const;
const COL_LABELS = { maintain: 'FoodKart maintains', cut: 'FoodKart cuts' } as const;

const TRANSFER: TransferOption[] = [
  {
    id: 'both-advertise',
    label: 'Both spend heavily, even though both would be better off holding back',
    strong: true,
    feedback:
      'Whatever the other shop does, heavy ads win you customers or protect the ones you have — so each shop spends. Together they pay for ads that mostly cancel out.',
  },
  {
    id: 'both-hold',
    label: 'Both hold back, because that is better for both',
    strong: false,
    feedback:
      'Holding back is better for the pair, but each shop gains by quietly advertising while the other holds back. Without something that changes those incentives, the good outcome is fragile.',
  },
  {
    id: 'first-mover',
    label: 'Whoever decides first sets the outcome',
    strong: false,
    feedback:
      'They decide at the same time without seeing each other, so there is no first move to react to. Each has to reason about the other instead.',
  },
];

export default function CooperationTrap({ lesson }: { lesson: LessonMeta }) {
  const TOTAL = 12;
  const { step, data, update, goTo, restart } = useLessonFlow(lesson.id, schema, INITIAL, TOTAL);
  const enter = useEnter();

  const outcome = data.choice && data.rival ? { row: data.choice, col: data.rival } : null;
  const outcomePay = outcome ? payoffAt(BASE_PRICING_GAME, outcome.row, outcome.col) : null;
  const penaltyGame = applyCutPenalty(data.penalty);
  const policy = evaluatePolicy({ cutPenalty: data.penalty, maintainReward: 0 });

  const steps: StepDef[] = [
    {
      key: 'intro',
      cta: 'Enter the market',
      render: () => (
        <>
          <Animated.View entering={enter(0, 'fade')} style={{ borderRadius: 20, overflow: 'hidden' }}>
            <SceneArt scene="market" height={180} />
          </Animated.View>
          <StepHeading kicker="Lesson 1" title="Two apps. One city." body="Food delivery here comes down to two companies. You run one of them." />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Card style={{ flex: 1, gap: space.sm, borderTopWidth: 3, borderTopColor: colors.primary }}>
              <CompanyBadge side="you" />
              <AppText variant="small" color={colors.textMuted}>
                Your app. Fast, reliable, priced like FoodKart.
              </AppText>
            </Card>
            <Card style={{ flex: 1, gap: space.sm, borderTopWidth: 3, borderTopColor: colors.rival }}>
              <CompanyBadge side="rival" />
              <AppText variant="small" color={colors.textMuted}>
                Rohan&apos;s app. Equally good. Equally hungry.
              </AppText>
            </Card>
          </View>
          <Dialogue character="sen" expression="neutral" delay={150}>
            Every Monday both companies set prices for the week. Neither sees the other&apos;s choice until the week begins.
          </Dialogue>
        </>
      ),
    },
    {
      key: 'stakes',
      render: () => (
        <>
          <StepHeading title="What's at stake" body="Each company wants the most profit for itself. That's the only goal in this model." />
          <Dialogue character="kavya" expression="thinking">
            Honestly? If one app is cheaper this week, I&apos;m ordering from that one.
          </Dialogue>
          <Dialogue character="rohan" expression="confident" align="right" delay={120}>
            I&apos;ll do whatever earns FoodKart the most. Nothing personal.
          </Dialogue>
          <Panel tone="info" title="How the week is scored" delay={200}>
            <View style={{ gap: space.xs }}>
              <Bullet>Each company either maintains its prices or cuts them.</Bullet>
              <Bullet>Profit is measured in points. Higher is better.</Bullet>
              <Bullet>Both choices are made at the same time, in secret.</Bullet>
            </View>
          </Panel>
        </>
      ),
    },
    {
      key: 'decide',
      cta: data.committed ? 'See the result' : 'Lock in my decision',
      canContinue: !!data.choice,
      blockedHint: 'Choose a pricing strategy for QuickEats.',
      onContinue: () => {
        if (!data.committed && data.choice) {
          update({ committed: true, rival: rivalPolicy(BASE_PRICING_GAME) });
        }
      },
      render: () => (
        <>
          <StepHeading kicker="Your decision" title="Set this week's price" body="Rohan is choosing at the same moment. You won't see his choice until you commit." />
          <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
            {(['maintain', 'cut'] as const).map((a) => (
              <ChoiceCard
                key={a}
                title={PRICE_LABEL[a]}
                description={a === 'maintain' ? 'Keep your full margin per order.' : 'Earn less per order, but undercut a rival who keeps prices.'}
                icon={a === 'maintain' ? ShieldCheck : BadgePercent}
                tone={a === 'maintain' ? 'blue' : 'orange'}
                selected={data.choice === a}
                disabled={data.committed}
                onSelect={() => update({ choice: a })}
              />
            ))}
          </View>
          {data.committed ? (
            <Panel tone="info" title="Decision locked">
              You can replay the lesson to try the other option.
            </Panel>
          ) : (
            <Dialogue character="aarav" expression="thinking">
              What would I do if I knew Rohan&apos;s choice? Does it change if he picks the other one?
            </Dialogue>
          )}
        </>
      ),
    },
    {
      key: 'reveal',
      render: () => (outcome && outcomePay ? <Reveal you={outcome.row} rival={outcome.col} payoffs={outcomePay} /> : null),
    },
    {
      key: 'why',
      render: () =>
        outcome && outcomePay ? (
          <>
            <StepHeading title="Why it turned out this way" />
            <Dialogue character="meera" expression="explaining">
              {explainOutcome(outcome.row, outcome.col, outcomePay)}
            </Dialogue>
            <Card style={{ gap: space.sm }}>
              <SectionLabel>Rohan&apos;s reasoning (FoodKart&apos;s stated policy)</SectionLabel>
              <AppText variant="small">
                &ldquo;If QuickEats maintains, cutting earns me {payoffAt(BASE_PRICING_GAME, 'maintain', 'cut')[1]} instead of{' '}
                {payoffAt(BASE_PRICING_GAME, 'maintain', 'maintain')[1]}. If QuickEats cuts, cutting earns me{' '}
                {payoffAt(BASE_PRICING_GAME, 'cut', 'cut')[1]} instead of {payoffAt(BASE_PRICING_GAME, 'cut', 'maintain')[1]}. Either way, I cut.&rdquo;
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                He never needed to guess your move. Customer shares above are illustrative; profits come from the payoff table.
              </AppText>
            </Card>
          </>
        ) : null,
    },
    {
      key: 'counterfactual',
      render: () => {
        const pay = payoffAt(BASE_PRICING_GAME, data.altYou, data.altRival);
        const best = rowBestResponses(BASE_PRICING_GAME, data.altRival);
        return (
          <>
            <StepHeading kicker="What if?" title="Replay the week any way you like" body="Change either choice and watch the profits. Look for a FoodKart choice where maintaining pays you more." />
            <Card style={{ gap: space.md }}>
              <Segmented label="QuickEats (you)" value={data.altYou} onChange={(v) => update({ altYou: v })} options={(['maintain', 'cut'] as const).map((a) => ({ value: a, label: PRICE_SHORT[a] }))} />
              <Segmented
                label="FoodKart (Rohan)"
                tone="orange"
                value={data.altRival}
                onChange={(v) => update({ altRival: v })}
                options={(['maintain', 'cut'] as const).map((a) => ({ value: a, label: PRICE_SHORT[a] }))}
              />
            </Card>
            <OutcomeBoard key={`${data.altYou}-${data.altRival}`} you={data.altYou} rival={data.altRival} payoffs={pay} />
            <Panel tone="insight" title={`If FoodKart ${data.altRival === 'cut' ? 'cuts' : 'maintains'}, your best reply is to ${best.length > 1 ? 'either' : best[0]}`}>
              {`Maintaining earns you ${payoffAt(BASE_PRICING_GAME, 'maintain', data.altRival)[0]}; cutting earns ${payoffAt(BASE_PRICING_GAME, 'cut', data.altRival)[0]}. Flip FoodKart's choice and compare again.`}
            </Panel>
          </>
        );
      },
    },
    {
      key: 'matrix',
      canContinue: data.showBR,
      blockedHint: 'Reveal the best replies to continue.',
      render: () => {
        const insp = data.inspected;
        const ip = insp ? payoffAt(BASE_PRICING_GAME, insp.row, insp.col) : null;
        return (
          <>
            <StepHeading kicker="The payoff table" title="Every outcome on one screen" body="Each cell is one possible week. Your profit first, FoodKart's second. Tap a cell to read it." />
            <Card>
              <PayoffMatrix
                game={BASE_PRICING_GAME}
                rowName="You"
                colName="FoodKart"
                rowLabels={ROW_LABELS}
                colLabels={COL_LABELS}
                outcome={outcome ?? undefined}
                selected={insp ?? undefined}
                onCellPress={(row, col) => update({ inspected: { row, col } })}
                showBestReplies={data.showBR}
              />
            </Card>
            {insp && ip ? (
              <AppText variant="small" color={colors.textMuted}>
                {ROW_LABELS[insp.row]}, {COL_LABELS[insp.col].toLowerCase()}: you earn {ip[0]}, FoodKart earns {ip[1]}.
              </AppText>
            ) : null}
            {!data.showBR ? (
              <Button label="Show best replies" variant="secondary" onPress={() => update({ showBR: true })} />
            ) : (
              <Panel tone="insight" title="Cutting is a dominant strategy">
                Your cutting payoff is ringed in both columns, and FoodKart&apos;s in both rows. When one choice is best no matter what the other side does, it is called a dominant strategy.
              </Panel>
            )}
          </>
        );
      },
    },
    {
      key: 'trap',
      render: () => {
        const both = payoffAt(BASE_PRICING_GAME, 'maintain', 'maintain');
        const war = payoffAt(BASE_PRICING_GAME, 'cut', 'cut');
        return (
          <>
            <StepHeading kicker="The trap" title="Rational, and worse for both" />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Card style={{ flex: 1, gap: 4 }}>
                <AppText variant="caption" color={colors.textMuted}>
                  Both maintain
                </AppText>
                <AppText variant="number" tabular>
                  {both[0]} + {both[1]}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  Better for both — but each is tempted to cut
                </AppText>
              </Card>
              <Card style={{ flex: 1, gap: 4, borderColor: colors.insight }}>
                <AppText variant="caption" color={colors.insight}>
                  Both cut (what rational play predicts)
                </AppText>
                <AppText variant="number" tabular>
                  {war[0]} + {war[1]}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  Each loses {both[0] - war[0]} points
                </AppText>
              </Card>
            </View>
            <Dialogue character="sen" expression="explaining">
              Each company made the sensible choice for itself, and together they landed somewhere worse. This shape of game is called the Prisoner&apos;s Dilemma.
            </Dialogue>
            <Panel tone="caution" title="Why not just agree to maintain?">
              A promise doesn&apos;t change the table. Once Rohan expects you to maintain, he still earns more by cutting — and so do you. Cooperation needs something that changes the incentives, not just good intentions.
            </Panel>
          </>
        );
      },
    },
    {
      key: 'penalty',
      canContinue: data.foundFlip,
      blockedHint: 'Find a penalty that changes the predicted outcome.',
      render: () => {
        const regime = regimeFor({ cutPenalty: data.penalty, maintainReward: 0 });
        return (
          <>
            <StepHeading kicker="Experiment" title="Make price cuts costly" body="Suppose each company that cuts must pay a penalty p. Find the smallest p that changes what rational companies do." />
            <Card style={{ gap: space.lg }}>
              <Slider
                label="Penalty for cutting (p)"
                value={data.penalty}
                min={PENALTY_RANGE.min}
                max={PENALTY_RANGE.max}
                step={PENALTY_RANGE.step}
                tone="orange"
                formatValue={(v) => v.toFixed(1)}
                onChange={(p) =>
                  update((d) => ({ penalty: p, foundFlip: d.foundFlip || regimeFor({ cutPenalty: p, maintainReward: 0 }) === 'maintain-dominant' }))
                }
              />
              <PayoffMatrix
                game={penaltyGame}
                baseline={BASE_PRICING_GAME}
                rowName="You"
                colName="FoodKart"
                rowLabels={ROW_LABELS}
                colLabels={COL_LABELS}
                showBestReplies
              />
            </Card>
            <Panel
              tone={regime === 'maintain-dominant' ? 'success' : regime === 'tie' ? 'info' : 'caution'}
              title={
                regime === 'cut-dominant'
                  ? `At p = ${data.penalty.toFixed(1)}, cutting still wins`
                  : regime === 'tie'
                    ? 'At p = 2.0, the choices tie'
                    : `At p = ${data.penalty.toFixed(1)}, maintaining wins`
              }>
              {regime === 'cut-dominant'
                ? `Cutting gains 2 points before the penalty, so it still beats maintaining by ${(2 - data.penalty).toFixed(1)} whatever the rival does.`
                : regime === 'tie'
                  ? 'The penalty exactly cancels the 2-point gain from cutting. Each company is indifferent, and the model alone cannot say which way they go.'
                  : `The penalty outweighs the 2-point gain, so maintaining is now better by ${(data.penalty - 2).toFixed(1)} whatever the rival does. Predicted outcome: both maintain, earning ${policy.companyPayoffs?.[0] ?? 8} each.`}
            </Panel>
            <AppText variant="caption" color={colors.textMuted}>
              Changed payoffs are marked with a dot. Only companies that cut are affected.
            </AppText>
          </>
        );
      },
    },
    {
      key: 'caveat',
      render: () => (
        <>
          <StepHeading title="Is a penalty a good idea?" body="The model says what the penalty does to the companies' incentives. Whether that's desirable is a different question." />
          <Dialogue character="kavya" expression="concerned">
            Wait — the price war was good for me. If cutting is penalised, I pay more.
          </Dialogue>
          <Dialogue character="arjun" expression="thinking" align="right" delay={100}>
            And someone has to detect cuts and enforce the penalty. That costs something too.
          </Dialogue>
          <Panel tone="insight" title="Read the model carefully" delay={180}>
            &ldquo;Better for both companies&rdquo; is not &ldquo;better for everyone.&rdquo; This table only counts company profit. Customers, enforcement and new competitors are outside it.
          </Panel>
        </>
      ),
    },
    {
      key: 'transfer',
      canContinue: data.transferChecked,
      blockedHint: 'Pick an answer and check your reasoning.',
      render: () => (
        <>
          <StepHeading kicker="New situation" title="The advertising arms race" body="Two coffee shops on the same street each decide, without coordinating, whether to spend heavily on ads. Ads mostly pull customers from the other shop." />
          <TransferQuestion
            question="What do you expect, and why?"
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
          takeaway="When each side has a dominant strategy, individually rational choices can still leave everyone worse off."
          remember={[
            'Ask: is one choice best no matter what the other side does?',
            'Compare the predicted outcome with what both would prefer.',
            'Lasting cooperation usually needs changed incentives, not just promises.',
          ]}
          onReplay={restart}
        />
      ),
    },
  ];

  return <LessonShell lesson={lesson} steps={steps} step={step} goTo={goTo} />;
}

function explainOutcome(you: PriceAction, rival: PriceAction, [a, b]: readonly [number, number]): string {
  if (you === 'cut' && rival === 'cut') {
    const both = payoffAt(BASE_PRICING_GAME, 'maintain', 'maintain');
    return `You both cut. Neither gained customers from the other, but every order earned less. You each made ${a} — instead of the ${both[0]} you'd each have made by both maintaining.`;
  }
  if (you === 'maintain' && rival === 'cut') {
    return `Rohan undercut you. Price-sensitive customers like Kavya moved to FoodKart, so you made ${a} while FoodKart made ${b}.`;
  }
  if (you === 'cut' && rival === 'maintain') {
    return `You undercut FoodKart and won most of the orders: you made ${a}, FoodKart made ${b}.`;
  }
  return `Both kept prices. Customers split and margins held: ${a} each.`;
}

function Reveal({ you, rival, payoffs }: { you: PriceAction; rival: PriceAction; payoffs: readonly [number, number] }) {
  const reduced = useMotionReduced();
  const [shown, setShown] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setShown(true), 700);
    return () => clearTimeout(t);
  }, [reduced]);

  return (
    <>
      <StepHeading kicker="Monday morning" title={shown ? 'The prices are out' : 'Revealing both choices…'} />
      {shown ? (
        <>
          <OutcomeBoard you={you} rival={rival} payoffs={payoffs} />
          <Dialogue character="rohan" expression={rival === 'cut' && you === 'maintain' ? 'satisfied' : rival === 'cut' ? 'frustrated' : 'neutral'} delay={250} align="right">
            {rival === 'cut' && you === 'maintain'
              ? 'Thanks for keeping your prices up.'
              : rival === 'cut'
                ? 'So we both cut. That stings.'
                : 'Interesting week.'}
          </Dialogue>
          <Dialogue character="aarav" expression={you === 'maintain' && rival === 'cut' ? 'frustrated' : 'confused'} delay={400}>
            {you === 'maintain' && rival === 'cut' ? 'He undercut me. Could I have seen that coming?' : 'We both did the "smart" thing. So why does it feel like we lost?'}
          </Dialogue>
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Card style={{ flex: 1, minHeight: 160, justifyContent: 'center', alignItems: 'center', gap: space.sm }}>
            <CompanyBadge side="you" />
            <AppText variant="heading">{PRICE_SHORT[you]}</AppText>
          </Card>
          <Card style={{ flex: 1, minHeight: 160, justifyContent: 'center', alignItems: 'center', gap: space.sm }}>
            <CompanyBadge side="rival" />
            <AppText variant="heading" color={colors.textMuted}>
              ?
            </AppText>
          </Card>
        </View>
      )}
    </>
  );
}
