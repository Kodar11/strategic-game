import { BadgePercent, ChevronDown, Gavel, Gift, RotateCcw, ShieldCheck } from '@/src/components/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { z } from 'zod';

import { SceneArt } from '@/src/components/art/SceneArt';
import { Portrait } from '@/src/components/characters/Portrait';
import type { CharacterId } from '@/src/components/characters/cast';
import { Completion } from '@/src/components/lesson/Completion';
import { LessonShell, type StepDef } from '@/src/components/lesson/LessonShell';
import { Dialogue, Panel, Stat, StepHeading } from '@/src/components/lesson/Panels';
import { PayoffMatrix } from '@/src/components/lesson/PayoffMatrix';
import { TransferQuestion, type TransferOption } from '@/src/components/lesson/TransferQuestion';
import { useEnter } from '@/src/components/lesson/motion';
import { useLessonFlow } from '@/src/components/lesson/useLessonFlow';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { Slider } from '@/src/components/ui/Slider';
import type { LessonMeta } from '@/src/content/lessons';
import {
  BASE_PRICING_GAME,
  type IncentiveRules,
  NO_RULES,
  PENALTY_RANGE,
  type PriceAction,
  REWARD_RANGE,
  applyRules,
  cutAdvantage,
  evaluatePolicy,
  regimeFor,
  rivalPolicy,
} from '@/src/game/incentives';
import { payoffAt } from '@/src/game/payoff-matrix';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { OutcomeBoard, PRICE_LABEL } from '../shared/pricing';

const action = z.enum(['maintain', 'cut']);
const schema = z.object({
  choice: action.nullable(),
  committed: z.boolean(),
  penalty: z.number().min(PENALTY_RANGE.min).max(PENALTY_RANGE.max),
  reward: z.number().min(REWARD_RANGE.min).max(REWARD_RANGE.max),
  flipped: z.boolean(),
  replayChoice: action.nullable(),
  opened: z.array(z.string()),
  transferPick: z.string().nullable(),
  transferChecked: z.boolean(),
});
type Data = z.infer<typeof schema>;

const INITIAL: Data = {
  choice: null,
  committed: false,
  penalty: 0,
  reward: 0,
  flipped: false,
  replayChoice: null,
  opened: [],
  transferPick: null,
  transferChecked: false,
};

const ROW_LABELS = { maintain: 'You maintain', cut: 'You cut' } as const;
const COL_LABELS = { maintain: 'FoodKart maintains', cut: 'FoodKart cuts' } as const;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const other = (a: PriceAction): PriceAction => (a === 'cut' ? 'maintain' : 'cut');

const EXAMPLE_FINE: IncentiveRules = { cutPenalty: 3, maintainReward: 0 };
const EXAMPLE_REWARD: IncentiveRules = { cutPenalty: 0, maintainReward: 3 };

const SIDE_EFFECTS: { id: string; character: CharacterId; title: string; body: string }[] = [
  {
    id: 'customers',
    character: 'kavya',
    title: 'Customers pay more',
    body: 'The price war was good for Kavya. A rule that ends it raises what customers pay. "Better for the companies" can be worse for the people they serve.',
  },
  {
    id: 'enforcement',
    character: 'arjun',
    title: 'Someone has to enforce it',
    body: 'Detecting "price cuts" means defining them and watching for disguised discounts, coupons and bundles. Enforcement costs money, and loopholes change the game again.',
  },
  {
    id: 'competition',
    character: 'rohan',
    title: 'Competition moves elsewhere',
    body: 'If price is off the table, Rohan may compete on speed, quality or marketing instead — not modelled here, but likely in reality. New rivals may also enter.',
  },
];

const TRANSFER: TransferOption[] = [
  {
    id: 'team-bonus',
    label: 'Add a team bonus paid when the whole team hits its target',
    strong: true,
    feedback:
      'This changes the payoffs: sharing now earns you something directly. Like the reward lever, it has a cost — and it can invite free-riding, so it needs designing with care.',
  },
  {
    id: 'ask',
    label: 'Remind everyone that collaboration matters',
    strong: false,
    feedback:
      'Encouragement doesn’t change the table. If hoarding still wins the individual ranking, the incentive to hoard is unchanged.',
  },
  {
    id: 'bigger-ranking',
    label: 'Make the top-performer prize even bigger',
    strong: false,
    feedback: 'That raises the reward for beating colleagues, making hoarding even more attractive.',
  },
];

export default function IncentiveShift({ lesson }: { lesson: LessonMeta }) {
  const TOTAL = 11;
  const { step, data, update, goTo, restart } = useLessonFlow(lesson.id, schema, INITIAL, TOTAL);
  const enter = useEnter();

  const rules: IncentiveRules = { cutPenalty: data.penalty, maintainReward: data.reward };
  const before = evaluatePolicy(NO_RULES);
  const after = evaluatePolicy(rules);
  const ruledGame = applyRules(rules);

  const rival = data.committed ? rivalPolicy(BASE_PRICING_GAME) : null;
  const pay = data.choice && rival ? payoffAt(BASE_PRICING_GAME, data.choice, rival) : null;

  const steps: StepDef[] = [
    {
      key: 'intro',
      cta: 'Look at the market',
      render: () => (
        <>
          <Animated.View entering={enter(0, 'fade')} style={{ borderRadius: 20, overflow: 'hidden' }}>
            <SceneArt scene="policy" height={180} />
          </Animated.View>
          <StepHeading kicker="Lesson 5" title="Change the rules, change the game" body="QuickEats and FoodKart are back in the same market. This time you'll also get to rewrite its rules." />
          <Dialogue character="arjun" expression="thinking">
            I advise the city&apos;s delivery council. Before anyone writes a rule, I want to see what it actually does to each company&apos;s choices.
          </Dialogue>
        </>
      ),
    },
    {
      key: 'rules',
      render: () => (
        <>
          <StepHeading title="Today's rules: none" body="Same payoffs as Lesson 1. No penalties, no rewards." />
          <Card>
            <PayoffMatrix game={BASE_PRICING_GAME} rowName="You" colName="FoodKart" rowLabels={ROW_LABELS} colLabels={COL_LABELS} showBestReplies />
          </Card>
          <Dialogue character="meera" expression="explaining">
            Cutting is each company&apos;s best reply in every case — by exactly {cutAdvantage(NO_RULES)} points. Keep that number in mind.
          </Dialogue>
        </>
      ),
    },
    {
      key: 'choose',
      cta: data.committed ? 'See the result' : 'Lock in my decision',
      canContinue: !!data.choice,
      blockedHint: 'Choose a strategy for QuickEats.',
      onContinue: () => {
        if (!data.committed) update({ committed: true });
      },
      render: () => (
        <>
          <StepHeading kicker="One more week" title="Run QuickEats again" body="Rohan follows the same stated policy: he picks whatever earns FoodKart the most." />
          <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
            {(['maintain', 'cut'] as const).map((a) => (
              <ChoiceCard
                key={a}
                title={PRICE_LABEL[a]}
                icon={a === 'maintain' ? ShieldCheck : BadgePercent}
                tone={a === 'maintain' ? 'blue' : 'orange'}
                selected={data.choice === a}
                disabled={data.committed}
                onSelect={() => update({ choice: a })}
              />
            ))}
          </View>
        </>
      ),
    },
    {
      key: 'result',
      render: () => {
        if (!data.choice || !rival || !pay) return null;
        const alt = payoffAt(BASE_PRICING_GAME, other(data.choice), rival);
        return (
          <>
            <StepHeading kicker="Result" title={`FoodKart ${rival === 'cut' ? 'cut' : 'maintained'} prices`} />
            <OutcomeBoard you={data.choice} rival={rival} payoffs={pay} />
            <Panel tone="info" title="Compared with the alternative" delay={200}>
              {`Had you chosen to ${PRICE_LABEL[other(data.choice)].toLowerCase()}, you'd have earned ${alt[0]} instead of ${pay[0]}. Under today's rules cutting is the better reply whatever Rohan does, so the market settles at ${before.companyPayoffs?.[0]} each.`}
            </Panel>
          </>
        );
      },
    },
    {
      key: 'designer',
      cta: 'Open the policy sandbox',
      render: () => (
        <>
          <StepHeading kicker="Switch roles" title="You're now the rule designer" body="You can't choose prices for the companies. You can only change what each choice costs or earns." />
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
          <Dialogue character="sen" expression="happy" delay={120}>
            Your goal: find rules under which rational companies maintain prices. Then ask whether those rules are worth it.
          </Dialogue>
        </>
      ),
    },
    {
      key: 'sandbox',
      canContinue: data.flipped,
      blockedHint: 'Find rules that make maintaining the best choice.',
      render: () => {
        const regime = after.regime;
        const adv = cutAdvantage(rules);
        const setRules = (patch: Partial<Pick<Data, 'penalty' | 'reward'>>) =>
          update((d) => {
            const next = { cutPenalty: patch.penalty ?? d.penalty, maintainReward: patch.reward ?? d.reward };
            return { ...patch, flipped: d.flipped || regimeFor(next) === 'maintain-dominant' };
          });
        return (
          <>
            <StepHeading kicker="Policy sandbox" title="Set the rules" />
            <Card style={{ gap: space.lg }}>
              <Slider label="Penalty for cutting (p)" tone="orange" value={data.penalty} min={PENALTY_RANGE.min} max={PENALTY_RANGE.max} step={PENALTY_RANGE.step} formatValue={(v) => v.toFixed(1)} onChange={(penalty) => setRules({ penalty })} />
              <Slider label="Reward for maintaining (r)" value={data.reward} min={REWARD_RANGE.min} max={REWARD_RANGE.max} step={REWARD_RANGE.step} formatValue={(v) => v.toFixed(1)} onChange={(reward) => setRules({ reward })} />
              <PayoffMatrix game={ruledGame} baseline={BASE_PRICING_GAME} rowName="You" colName="FoodKart" rowLabels={ROW_LABELS} colLabels={COL_LABELS} showBestReplies />
            </Card>
            <Panel
              tone={regime === 'maintain-dominant' ? 'success' : regime === 'tie' ? 'info' : 'caution'}
              title={regime === 'maintain-dominant' ? 'Maintaining is now dominant' : regime === 'tie' ? 'Exactly balanced' : 'Cutting is still dominant'}>
              {`Advantage of cutting = 2 − p − r = 2 − ${fmt(data.penalty)} − ${fmt(data.reward)} = ${fmt(adv)}. ` +
                (regime === 'maintain-dominant'
                  ? `Both companies maintain and earn ${fmt(after.companyPayoffs![0])} each.`
                  : regime === 'tie'
                    ? 'Each company is indifferent; the model cannot predict which way they go.'
                    : `Both still cut and earn ${fmt(after.companyPayoffs![0])} each.`)}
            </Panel>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Stat label="Penalties you collect" value={after.predicted ? fmt(after.penaltiesCollected) : '—'} tone="orange" caption="at the predicted outcome" />
              <Stat label="Rewards you pay" value={after.predicted ? fmt(after.rewardsPaid) : '—'} tone="blue" caption="at the predicted outcome" />
            </View>
            <Button label="Reset rules" variant="ghost" compact icon={RotateCcw} iconPosition="left" onPress={() => update({ penalty: 0, reward: 0 })} />
          </>
        );
      },
    },
    {
      key: 'replay',
      canContinue: !!data.replayChoice,
      blockedHint: 'Choose a strategy under your rules.',
      render: () => {
        const rivalNow = rivalPolicy(ruledGame);
        const payNow = data.replayChoice ? payoffAt(ruledGame, data.replayChoice, rivalNow) : null;
        return (
          <>
            <StepHeading kicker="Before and after" title="Play a week under your rules" body={`Your rules: p = ${fmt(data.penalty)}, r = ${fmt(data.reward)}. Rohan re-runs his policy against the new table.`} />
            <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
              {(['maintain', 'cut'] as const).map((a) => (
                <ChoiceCard
                  key={a}
                  compact
                  title={PRICE_LABEL[a]}
                  tone={a === 'maintain' ? 'blue' : 'orange'}
                  selected={data.replayChoice === a}
                  onSelect={() => {
                    haptic.commit();
                    update({ replayChoice: a });
                  }}
                />
              ))}
            </View>
            {data.replayChoice && payNow ? (
              <>
                <OutcomeBoard key={`${data.replayChoice}-${rivalNow}-${data.penalty}-${data.reward}`} you={data.replayChoice} rival={rivalNow} payoffs={payNow} />
                <Card style={{ gap: space.sm }}>
                  <SectionLabel>Predicted market, before vs after</SectionLabel>
                  <CompareRow label="Both companies" before={before.predicted ? `${PRICE_LABEL[before.predicted.row]}` : 'unclear'} after={after.predicted ? PRICE_LABEL[after.predicted.row] : 'unclear (tie)'} />
                  <CompareRow label="Profit each" before={fmt(before.companyPayoffs![0])} after={after.companyPayoffs ? fmt(after.companyPayoffs[0]) : '—'} />
                  <CompareRow label="Designer's net" before="0" after={after.predicted ? fmt(after.penaltiesCollected - after.rewardsPaid) : '—'} />
                </Card>
              </>
            ) : null}
          </>
        );
      },
    },
    {
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
            <Dialogue character="meera" expression="satisfied">
              The behaviour flips at the same line — p + r &gt; 2 — but who bears the cost is completely different.
            </Dialogue>
          </>
        );
      },
    },
    {
      key: 'side-effects',
      canContinue: data.opened.length > 0,
      blockedHint: 'Open at least one perspective.',
      render: () => (
        <>
          <StepHeading kicker="Trade-offs" title="What the table doesn't count" body="Tap each perspective. None of these are in the numbers above — which is exactly why they matter." />
          <View style={{ gap: space.sm }}>
            {SIDE_EFFECTS.map((s) => {
              const open = data.opened.includes(s.id);
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={s.title}
                  accessibilityHint={open ? "Collapse" : "Expand"}
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
          />
        </>
      ),
    },
    {
      key: 'done',
      render: () => (
        <Completion
          lesson={lesson}
          takeaway="To change what people choose, change what their choices cost and earn — then check what else changes."
          remember={[
            'Find the gap that makes the unwanted choice attractive, and how big it is.',
            'Penalties and rewards can flip the same choice at very different costs.',
            'Every rule has side effects outside the model. Look for them before you celebrate.',
          ]}
          onReplay={restart}
        />
      ),
    },
  ];

  return <LessonShell lesson={lesson} steps={steps} step={step} goTo={goTo} />;
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
