import { BadgePercent, ShieldCheck } from '@/src/components/ui/icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { z } from 'zod';

import { SceneArt } from '@/src/components/art/SceneArt';
import { Completion } from '@/src/components/lesson/Completion';
import { LessonShell, type StepDef } from '@/src/components/lesson/LessonShell';
import { Bullet, Dialogue, FeedbackPanel, Panel, StepHeading } from '@/src/components/lesson/Panels';
import { PayoffMatrix } from '@/src/components/lesson/PayoffMatrix';
import { ConfidenceScale, PredictionPrompt, PredictionResult } from '@/src/components/lesson/Prediction';
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
import { Segmented } from '@/src/components/ui/Segmented';
import { Slider } from '@/src/components/ui/Slider';
import type { LessonMeta } from '@/src/content/lessons';
import { BASE_CUT_ADVANTAGE, BASE_PRICING_GAME, PENALTY_RANGE, type PriceAction, applyCutPenalty, rivalPolicy } from '@/src/game/incentives';
import { payoffAt, rowBestResponses } from '@/src/game/payoff-matrix';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors, space } from '@/src/theme/tokens';
import { CompanyBadge, OutcomeBoard, OutcomeList, PRICE_LABEL, PRICE_SHORT } from '../shared/pricing';
import {
  PENALTY_GUESSES,
  RIVAL_REASONS,
  cooperationRecap,
  cooperationRecords,
  explainOutcome,
  movePenalty,
  penaltyExperimentState,
  penaltyExplanation,
  penaltyGuessFeedback,
  predictionCheck,
  promiseFeedback,
  reasonFeedback,
  rivalReasonLabel,
} from './copy';

const action = z.enum(['maintain', 'cut']);
const schema = z.object({
  prediction: predictionSchema(action),
  predictReason: z.enum(['either', 'grab', 'mutual', 'mirror']).nullable(),
  choice: action.nullable(),
  committed: z.boolean(),
  rival: action.nullable(),
  altYou: action,
  altRival: action,
  explored: z.array(action),
  inspected: z.object({ row: action, col: action }).nullable(),
  showBR: z.boolean(),
  promise: action.nullable(),
  penaltyPrediction: predictionSchema(z.enum(['one', 'two', 'over-two', 'five'])),
  penalty: z.number().min(PENALTY_RANGE.min).max(PENALTY_RANGE.max),
  foundFlip: z.boolean(),
  transferPick: z.string().nullable(),
  transferChecked: z.boolean(),
});
type Data = z.infer<typeof schema>;

const INITIAL: Data = {
  prediction: emptyPrediction(),
  predictReason: null,
  choice: null,
  committed: false,
  rival: null,
  altYou: 'maintain',
  altRival: 'maintain',
  explored: ['maintain'],
  inspected: null,
  showBR: false,
  promise: null,
  penaltyPrediction: emptyPrediction(),
  penalty: 0,
  foundFlip: false,
  transferPick: null,
  transferChecked: false,
};

const ROW_LABELS = { maintain: 'You maintain', cut: 'You cut' } as const;
const COL_LABELS = { maintain: 'FoodKart maintains', cut: 'FoodKart cuts' } as const;
const RIVAL_MOVE = { maintain: 'He maintains', cut: 'He cuts' } as const;

const TRANSFER: TransferOption[] = [
  {
    id: 'both-advertise',
    label: 'Both advertise heavily',
    verdict: 'strong',
    feedback:
      'Whatever the other shop does, heavy ads win you customers or protect the ones you have — so each shop spends. Together they pay for ads that mostly cancel out.',
  },
  {
    id: 'both-hold',
    label: 'Both hold back, since the ads mostly cancel out',
    verdict: 'misconception',
    feedback:
      'Holding back is better for the pair, but each shop gains by quietly advertising while the other holds back. Without something that changes those incentives, the good outcome is fragile.',
  },
  {
    id: 'repeat',
    label: 'It depends on whether they face each other month after month',
    verdict: 'defensible',
    feedback:
      'A fair point the one-month picture leaves out. Facing each other every month lets the shops reward restraint and punish ads. But within any single month, each still gains by advertising.',
  },
  {
    id: 'first-mover',
    label: 'Whoever decides first sets the outcome',
    verdict: 'misconception',
    feedback:
      'They decide at the same time without seeing each other, so there is no first move to react to. Each has to reason about the other instead.',
  },
];

const TRANSFER_ANALOGY = {
  holds:
    'The shape of the price war: each shop has a choice that is better for itself whatever the other does, and both making it leaves them worse off than mutual restraint.',
  differs:
    'Ads can also bring new customers into the market, and shops may weigh next month too. Both weaken the trap — the comparison only fits if ads mostly move customers from one shop to the other.',
};

export default function CooperationTrap({ lesson }: { lesson: LessonMeta }) {
  // The three paired scenarios sit just before completion, so steps saved before they existed keep their meaning.
  const TOTAL = 15;
  const { step, data, update, goTo, restart } = useLessonFlow(lesson.id, schema, INITIAL, TOTAL, cooperationRecords);
  const scenarioDone = useProgress((s) => s.scenarioDone);
  const learning = useProgress((s) => s.learning);
  const enter = useEnter();

  const outcome = data.choice && data.rival ? { row: data.choice, col: data.rival } : null;
  const outcomePay = outcome ? payoffAt(BASE_PRICING_GAME, outcome.row, outcome.col) : null;
  const penaltyGame = applyCutPenalty(data.penalty);
  const predicted = lockedAnswer(data.prediction);
  const penaltyGuess = lockedAnswer(data.penaltyPrediction);

  const steps: StepDef[] = [
    {
      // Situation: who you are and what you're competing for.
      key: 'intro',
      cta: 'Enter the market',
      render: () => (
        <>
          <Animated.View entering={enter(0, 'fade')} style={{ borderRadius: 20, overflow: 'hidden' }}>
            <SceneArt scene="market" height={180} />
          </Animated.View>
          <StepHeading kicker={`Lesson ${lesson.number}`} title="Two apps. One city." body="Food delivery here comes down to two companies. You run one of them." />
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
      // Rules: the full scoring, in plain language, with no analysis layered on.
      key: 'stakes',
      render: () => (
        <>
          <StepHeading title="What's at stake" body="Each company wants the most profit for itself. In this model, that's its only goal." />
          <Dialogue character="kavya" expression="thinking">
            Honestly? If one app is cheaper this week, I&apos;m ordering from that one.
          </Dialogue>
          <Dialogue character="rohan" expression="confident" align="right" delay={120}>
            I&apos;ll do whatever earns FoodKart the most. Nothing personal.
          </Dialogue>
          <Panel tone="info" title="How the week is scored" delay={200}>
            <View style={{ gap: space.xs }}>
              <Bullet>Each company either maintains its prices or cuts them.</Bullet>
              <Bullet>Both choices are made at the same time, in secret.</Bullet>
              <Bullet>Profit is measured in points. Higher is better.</Bullet>
            </View>
          </Panel>
          <Card>
            <OutcomeList />
          </Card>
        </>
      ),
    },
    {
      // Prediction: reason about the rival before any choice or explanation.
      key: 'predict',
      cta: data.prediction.locked ? 'Continue' : 'Lock prediction',
      canContinue: data.prediction.locked || (canLock(data.prediction) && !!data.predictReason),
      blockedHint:
        data.prediction.answer === null
          ? 'Predict what Rohan will do.'
          : !data.predictReason
            ? 'Pick the reason closest to yours.'
            : 'Rate how confident you are.',
      onContinue: () => update((d) => (d.predictReason ? { prediction: lockPrediction(d.prediction) } : {})),
      render: () => (
        <>
          <StepHeading kicker="Before you decide" title="What will Rohan do?" body="He's choosing at the same moment, from the same table you just read." />
          <PredictionPrompt
            question="Rohan will…"
            layout="row"
            options={(['maintain', 'cut'] as const).map((a) => ({ id: a, label: RIVAL_MOVE[a] }))}
            value={data.prediction.answer}
            onChange={(a) => update((d) => ({ prediction: chooseAnswer(d.prediction, a) }))}
            confidence={data.prediction.confidence}
            locked={data.prediction.locked}
          />
          {data.prediction.answer ? (
            <PredictionPrompt
              label="Your reasoning"
              question="Which is closest to why?"
              options={RIVAL_REASONS}
              value={data.predictReason}
              onChange={(predictReason) => update((d) => (d.prediction.locked ? {} : { predictReason }))}
              locked={data.prediction.locked}
              delay={80}
            />
          ) : null}
          {data.prediction.answer && data.predictReason && !data.prediction.locked ? (
            <ConfidenceScale value={data.prediction.confidence} onChange={(c) => update((d) => ({ prediction: rateConfidence(d.prediction, c) }))} />
          ) : null}
        </>
      ),
    },
    {
      // Decision: the learner's own move, kept separate from the prediction.
      key: 'decide',
      cta: data.committed ? 'See the result' : 'Lock decision',
      canContinue: !!data.choice,
      blockedHint: 'Choose a pricing strategy for QuickEats.',
      onContinue: () => {
        if (!data.committed && data.choice) {
          update({ committed: true, rival: rivalPolicy(BASE_PRICING_GAME) });
        }
      },
      render: () => (
        <>
          <StepHeading kicker="Your decision" title="Set this week's price" body="Now choose for QuickEats. Rohan can't see your choice, and you won't see his until Monday." />
          {predicted ? (
            <AppText variant="small" color={colors.accent}>
              Your prediction: {RIVAL_MOVE[predicted].toLowerCase()}.
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
            {(['maintain', 'cut'] as const).map((a) => (
              <ChoiceCard
                key={a}
                title={PRICE_LABEL[a]}
                description={a === 'maintain' ? 'Keep your full margin per order.' : 'Earn less per order, but undercut a rival who keeps prices.'}
                icon={a === 'maintain' ? ShieldCheck : BadgePercent}
                tone={a === 'maintain' ? 'blue' : 'orange'}
                selected={data.choice === a}
                disabled={data.committed && data.choice !== a}
                onSelect={() => !data.committed && update({ choice: a })}
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
      // Consequence: both choices, profits, reactions, and the prediction compared.
      key: 'reveal',
      render: () =>
        outcome && outcomePay ? (
          <Reveal you={outcome.row} rival={outcome.col} payoffs={outcomePay} predicted={predicted} confidence={data.prediction.confidence} />
        ) : null,
    },
    {
      // Discovery: replay the week to find out whether the result was about this week or about the table.
      key: 'whatif',
      canContinue: data.explored.includes('maintain') && data.explored.includes('cut'),
      blockedHint: 'Check both of FoodKart’s choices.',
      render: () => {
        const pay = payoffAt(BASE_PRICING_GAME, data.altYou, data.altRival);
        const best = rowBestResponses(BASE_PRICING_GAME, data.altRival);
        const exploredBoth = data.explored.includes('maintain') && data.explored.includes('cut');
        const keep = (r: PriceAction) => payoffAt(BASE_PRICING_GAME, 'maintain', r)[0];
        const cut = (r: PriceAction) => payoffAt(BASE_PRICING_GAME, 'cut', r)[0];
        return (
          <>
            <StepHeading kicker="What if?" title="Was it this week, or the table?" />
            {outcome && outcomePay ? (
              <Dialogue character="meera" expression="explaining">
                {explainOutcome(outcome.row, outcome.col, outcomePay)}
              </Dialogue>
            ) : null}
            <AppText variant="bodyStrong">Is there any FoodKart choice where maintaining pays you more than cutting? Set FoodKart both ways and compare.</AppText>
            <Card style={{ gap: space.md }}>
              <Segmented label="QuickEats (you)" value={data.altYou} onChange={(v) => update({ altYou: v })} options={(['maintain', 'cut'] as const).map((a) => ({ value: a, label: PRICE_SHORT[a] }))} />
              <Segmented
                label="FoodKart (Rohan)"
                tone="orange"
                value={data.altRival}
                onChange={(v) => update((d) => ({ altRival: v, explored: d.explored.includes(v) ? d.explored : [...d.explored, v] }))}
                options={(['maintain', 'cut'] as const).map((a) => ({ value: a, label: PRICE_SHORT[a] }))}
              />
            </Card>
            <OutcomeBoard key={`${data.altYou}-${data.altRival}`} you={data.altYou} rival={data.altRival} payoffs={pay} />
            <AppText variant="small" color={colors.textMuted}>
              {`If FoodKart ${data.altRival === 'cut' ? 'cuts' : 'maintains'}: maintaining earns you ${keep(data.altRival)}, cutting earns ${cut(data.altRival)}. Best reply: ${best.length > 1 ? 'either' : best[0]}.`}
            </AppText>
            {exploredBoth ? (
              <Panel tone="insight" title="No — cutting pays more either way">
                {`If FoodKart maintains, cutting earns ${cut('maintain')} instead of ${keep('maintain')}. If it cuts, ${cut('cut')} instead of ${keep('cut')}. Same ${BASE_CUT_ADVANTAGE}-point edge both times — and Rohan's numbers mirror yours.`}
              </Panel>
            ) : null}
          </>
        );
      },
    },
    {
      // Concept: name the pattern the learner just found, and revisit their earlier reasoning.
      key: 'matrix',
      canContinue: data.showBR,
      blockedHint: 'Reveal the best replies to continue.',
      render: () => {
        const insp = data.inspected;
        const ip = insp ? payoffAt(BASE_PRICING_GAME, insp.row, insp.col) : null;
        const rf = data.predictReason ? reasonFeedback(data.predictReason) : null;
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
              <>
                <Panel tone="insight" title="Cutting is a dominant strategy">
                  Your cutting payoff is ringed in both columns, and FoodKart&apos;s in both rows. When one choice is best no matter what the other side does, it is called a dominant strategy.
                </Panel>
                {rf && data.predictReason ? (
                  <FeedbackPanel verdict={rf.verdict} title={`Your reasoning earlier: “${rivalReasonLabel(data.predictReason)}”`} delay={120}>
                    {rf.text}
                  </FeedbackPanel>
                ) : null}
              </>
            )}
          </>
        );
      },
    },
    {
      // Discovery: individually sensible, collectively worse — and why a promise doesn't fix it.
      key: 'trap',
      canContinue: !!data.promise,
      blockedHint: 'Decide what you would do with Rohan’s offer.',
      render: () => {
        const both = payoffAt(BASE_PRICING_GAME, 'maintain', 'maintain');
        const war = payoffAt(BASE_PRICING_GAME, 'cut', 'cut');
        const pf = data.promise ? promiseFeedback(data.promise) : null;
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
            <Dialogue character="rohan" expression="confident" align="right" delay={120}>
              Let&apos;s stop this. Next week, we both keep prices. Deal?
            </Dialogue>
            <View style={{ gap: space.sm }}>
              <AppText variant="bodyStrong">Suppose you believe him. Next Monday, what do you do?</AppText>
              <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
                {(['maintain', 'cut'] as const).map((a) => (
                  <ChoiceCard
                    key={a}
                    compact
                    title={a === 'maintain' ? 'Keep the deal' : 'Cut anyway'}
                    tone={a === 'maintain' ? 'blue' : 'orange'}
                    selected={data.promise === a}
                    disabled={!!data.promise && data.promise !== a}
                    onSelect={() => !data.promise && update({ promise: a })}
                  />
                ))}
              </View>
            </View>
            {pf ? (
              <FeedbackPanel verdict={pf.verdict} title={pf.verdict === 'match' ? 'That is what the table rewards' : undefined}>
                {pf.text}
              </FeedbackPanel>
            ) : null}
          </>
        );
      },
    },
    {
      // Experiment: predict, then change one incentive and watch the best replies move.
      key: 'penalty',
      canContinue: penaltyExperimentState(data.penalty, data.foundFlip).canContinue,
      blockedHint: data.penaltyPrediction.locked
        ? 'Find a penalty that changes the predicted outcome.'
        : missingForLock(data.penaltyPrediction) === 'confidence'
          ? 'Rate how confident you are, then confirm.'
          : 'Make and confirm a prediction first.',
      render: () => {
        const ex = penaltyExplanation(data.penalty);
        const experiment = penaltyExperimentState(data.penalty, data.foundFlip);
        const gf = penaltyGuess ? penaltyGuessFeedback(penaltyGuess) : null;
        return (
          <>
            <StepHeading
              kicker="Experiment"
              title="Make price cuts costly"
              body="Suppose a delivery council fines each company that cuts by a penalty p. Nothing else about the table changes."
            />
            <PredictionPrompt
              question="What is the smallest penalty that makes maintaining the better choice for QuickEats, whatever FoodKart does?"
              options={PENALTY_GUESSES}
              value={data.penaltyPrediction.answer}
              onChange={(a) => update((d) => ({ penaltyPrediction: chooseAnswer(d.penaltyPrediction, a) }))}
              confidence={data.penaltyPrediction.confidence}
              onConfidence={(c) => update((d) => ({ penaltyPrediction: rateConfidence(d.penaltyPrediction, c) }))}
              onConfirm={() => update((d) => ({ penaltyPrediction: lockPrediction(d.penaltyPrediction) }))}
              locked={data.penaltyPrediction.locked}
            />
            {data.penaltyPrediction.locked ? (
              <>
                <Card style={{ gap: space.lg }}>
                  <Slider
                    label="Penalty for cutting (p)"
                    value={data.penalty}
                    min={PENALTY_RANGE.min}
                    max={PENALTY_RANGE.max}
                    step={PENALTY_RANGE.step}
                    tone="orange"
                    marker={data.foundFlip ? { value: BASE_CUT_ADVANTAGE, label: 'tie' } : undefined}
                    formatValue={(v) => v.toFixed(1)}
                    onChange={(p) => update((d) => movePenalty(d, p))}
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
                  <AppText variant="caption" color={colors.textMuted}>
                    Changed payoffs are marked with a dot. Only companies that cut are affected.
                  </AppText>
                </Card>
                <Panel tone={ex.regime === 'maintain-dominant' ? 'success' : ex.regime === 'tie' ? 'info' : 'caution'} title={ex.title}>
                  {ex.body}
                </Panel>
                {experiment.currentNote ? (
                  <AppText variant="small" color={colors.textMuted}>
                    {experiment.currentNote}
                  </AppText>
                ) : null}
              </>
            ) : null}
            {data.foundFlip && gf ? (
              <>
                <FeedbackPanel verdict={gf.verdict} title="Your prediction">
                  {gf.text}
                </FeedbackPanel>
                <Card style={{ gap: space.xs }}>
                  <SectionLabel>The threshold, in this model</SectionLabel>
                  <AppText variant="small">
                    Below p = 2, cutting is strictly better. At exactly 2, maintaining and cutting tie against either rival choice. Above 2, maintaining is strictly better.
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    What changed: only the payoffs for cutting. What stayed the same: the companies&apos; goal and what they know. The line sits at 2 because cutting gained exactly 2 to begin with — a real fine would also need to be detected, enforced and believed.
                  </AppText>
                </Card>
              </>
            ) : null}
          </>
        );
      },
    },
    {
      // Limits: what the model leaves out, voiced by people it affects.
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
            &ldquo;Better for both companies&rdquo; is not &ldquo;better for everyone.&rdquo; This table only counts company profit. Customers, enforcement and new competitors are outside it — so the penalty result tells you about these numbers, not that a fine guarantees cooperation in a real market.
          </Panel>
        </>
      ),
    },
    {
      // Transfer: a different market with the same structure — the concept is not named in the question.
      key: 'transfer',
      canContinue: data.transferChecked,
      blockedHint: 'Pick an answer and check your reasoning.',
      render: () => (
        <>
          <StepHeading
            kicker="New situation"
            title="Two coffee shops"
            body="Two coffee shops on the same street each decide this month, without talking, whether to spend heavily on ads. The ads mostly pull customers from the other shop rather than bringing in new ones."
          />
          <TransferQuestion
            question="What do you expect the shops to do, and why?"
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
      // Reflection: the insight, this learner's path, and a question to carry forward.
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
          recap={[...cooperationRecap({
            predicted,
            reason: predicted ? data.predictReason : null,
            choice: data.choice,
            rival: data.rival,
            promise: data.promise,
            penaltyGuess,
          }), ...scenarioRecap(lesson.id, learning)]}
          reflection="Think of a place where everyone would be better off holding back — but each person gains by not holding back. What would have to change in the payoffs to make holding back the better choice?"
          nextHook="Here, one move was best whatever Rohan did. Next, learn to spot moves like that — and rule out the ones nobody should make — in any payoff table."
          onReplay={restart}
        />
      ),
    },
  ];

  return <LessonShell lesson={lesson} steps={steps} step={step} goTo={goTo} onRestart={restart} />;
}

function Reveal({
  you,
  rival,
  payoffs,
  predicted,
  confidence,
}: {
  you: PriceAction;
  rival: PriceAction;
  payoffs: readonly [number, number];
  predicted: PriceAction | null;
  confidence: Confidence | null;
}) {
  const reduced = useMotionReduced();
  const [shown, setShown] = useState(reduced);
  const check = predicted ? predictionCheck(predicted, rival) : null;
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
          {predicted && check ? (
            <PredictionResult
              predicted={RIVAL_MOVE[predicted]}
              actual={RIVAL_MOVE[rival]}
              verdict={check.verdict}
              confidence={confidence}
              title={check.verdict === 'match' ? 'You read him right' : 'Not what happened'}
              delay={500}>
              {check.text}
            </PredictionResult>
          ) : null}
          <Card style={{ gap: space.xs }}>
            <SectionLabel>How FoodKart chose</SectionLabel>
            <AppText variant="small">
              In this model Rohan follows one fixed rule: pick whichever price earns FoodKart more. He couldn&apos;t see your choice, so it played no part — he would have done the same whatever you picked.
            </AppText>
          </Card>
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
