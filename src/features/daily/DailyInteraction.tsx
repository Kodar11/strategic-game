import { View } from 'react-native';

import { FeedbackPanel, Panel, Stat } from '@/src/components/lesson/Panels';
import { ConfidenceScale, PredictionPrompt, PredictionResult } from '@/src/components/lesson/Prediction';
import type { Confidence } from '@/src/components/lesson/prediction-state';
import { AppText } from '@/src/components/ui/AppText';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { Slider } from '@/src/components/ui/Slider';
import { Decision } from '@/src/features/scenarios/ScenarioPlayer';
import { replay } from '@/src/features/scenarios/runtime';
import type { ScenarioSpec } from '@/src/features/scenarios/types';
import { Bars, ScenarioVisualView } from '@/src/features/scenarios/visuals';
import { colors, space } from '@/src/theme/tokens';
import type { DailyChallenge, DailyResult } from './content';
import {
  type ChoiceDraft,
  type NumberDraft,
  type ScenarioAnswer,
  type ScenarioDraft,
  choiceEngine,
  formatNumber,
  numberEngine,
  scenarioAnswerSchema,
  scenarioEngine,
  scenarioFor,
  scenarioPhase,
} from './interactions';

/**
 * Renderers for the registered interaction types (see interactions.ts). Each reuses the lesson components the rest of
 * the app uses — the prediction prompt and confidence scale, the slider, a scenario's own decision controls, payoff
 * visuals and result stats — and keeps nothing in the lesson progress store: the draft lives in the screen.
 */

export type DailyDraft = { kind: 'choice'; draft: ChoiceDraft } | { kind: 'number'; draft: NumberDraft } | { kind: 'scenario'; draft: ScenarioDraft };

export function initialDraft(c: DailyChallenge, seed: number): DailyDraft {
  switch (c.interaction) {
    case 'choice':
      return { kind: 'choice', draft: choiceEngine.draft() };
    case 'number':
      return { kind: 'number', draft: numberEngine.draft(c.config) };
    case 'scenario':
      return { kind: 'scenario', draft: scenarioEngine.draft(seed) };
  }
}

/** The answer to submit, or null while the draft is incomplete. */
export function completeAnswer(c: DailyChallenge, d: DailyDraft): unknown {
  if (c.interaction === 'choice' && d.kind === 'choice') return choiceEngine.complete(c.config, d.draft);
  if (c.interaction === 'number' && d.kind === 'number') return numberEngine.complete(c.config, d.draft);
  if (c.interaction === 'scenario' && d.kind === 'scenario') {
    const spec = scenarioFor(c.config);
    return spec ? scenarioEngine.complete(spec, d.draft) : null;
  }
  return null;
}

export function DailyInteraction({
  challenge,
  draft,
  onDraft,
  confidence,
  onConfidence,
}: {
  challenge: DailyChallenge;
  draft: DailyDraft;
  onDraft: (d: DailyDraft) => void;
  confidence: Confidence | null;
  /** Omitted when the challenge doesn't ask for confidence. */
  onConfidence?: (c: Confidence) => void;
}) {
  if (challenge.interaction === 'choice' && draft.kind === 'choice') {
    const c = challenge.config;
    return (
      <PredictionPrompt
        label="Your answer"
        question={challenge.prompt}
        options={c.options}
        value={draft.draft.option}
        onChange={(id) => onDraft({ kind: 'choice', draft: choiceEngine.choose(c, draft.draft, id) })}
        confidence={confidence}
        onConfidence={onConfidence}
      />
    );
  }

  if (challenge.interaction === 'number' && draft.kind === 'number') {
    const c = challenge.config;
    return (
      <View style={{ gap: space.md }}>
        <Card style={{ gap: space.sm }}>
          <SectionLabel color={colors.accent}>Your answer</SectionLabel>
          <AppText variant="bodyStrong">{challenge.prompt}</AppText>
          <Slider
            value={draft.draft.value}
            min={c.min}
            max={c.max}
            step={c.step}
            tone="cyan"
            label="Your answer"
            formatValue={(v) => formatNumber(c, v)}
            onChange={(v) => onDraft({ kind: 'number', draft: numberEngine.set(c, draft.draft, v) })}
          />
          {c.minLabel || c.maxLabel ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
              <AppText variant="caption" color={colors.textMuted}>
                {c.minLabel ?? ''}
              </AppText>
              <AppText variant="caption" color={colors.textMuted} align="right">
                {c.maxLabel ?? ''}
              </AppText>
            </View>
          ) : null}
        </Card>
        {onConfidence ? <ConfidenceScale value={confidence} onChange={onConfidence} /> : null}
      </View>
    );
  }

  if (challenge.interaction === 'scenario' && draft.kind === 'scenario') {
    const spec = scenarioFor(challenge.config);
    if (!spec) return null;
    return <ScenarioInteraction spec={spec} draft={draft.draft} onDraft={(d) => onDraft({ kind: 'scenario', draft: d })} confidence={confidence} onConfidence={onConfidence} />;
  }
  return null;
}

/** A paired scenario played inside a daily challenge: rules, prediction, then the scenario's own moves. */
function ScenarioInteraction({
  spec,
  draft,
  onDraft,
  confidence,
  onConfidence,
}: {
  spec: ScenarioSpec;
  draft: ScenarioDraft;
  onDraft: (d: ScenarioDraft) => void;
  confidence: Confidence | null;
  onConfidence?: (c: Confidence) => void;
}) {
  const phase = scenarioPhase(spec, draft);
  const state = phase === 'predict' ? null : replay(spec, { prediction: { answer: draft.option, confidence: null, locked: true }, inputs: draft.inputs, seed: draft.seed, version: spec.version });
  const prompt = state !== null ? spec.play.prompt(state) : null;
  const log = state !== null && spec.play.log ? spec.play.log(state) : [];
  return (
    <View style={{ gap: space.lg }}>
      <Card style={{ gap: space.sm }}>
        <SectionLabel>The rules</SectionLabel>
        <AppText variant="small" color={colors.textBody}>
          {spec.setup}
        </AppText>
        {spec.rules.map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap: space.sm }}>
            <AppText color={colors.textMuted}>•</AppText>
            <AppText variant="small" style={{ flex: 1 }}>
              {r}
            </AppText>
          </View>
        ))}
        {spec.visual ? (
          <View style={{ marginTop: space.sm }}>
            <ScenarioVisualView visual={spec.visual} />
          </View>
        ) : null}
      </Card>
      <PredictionPrompt
        question={spec.predict.question}
        options={spec.predict.options.map((o) => ({ id: o.id, label: o.label }))}
        value={draft.option}
        onChange={(id) => onDraft(scenarioEngine.predict(spec, draft, id))}
        confidence={confidence}
        onConfidence={onConfidence}
        locked={draft.locked}
        onConfirm={() => onDraft(scenarioEngine.lock(draft))}
        confirmLabel="Lock prediction and play"
        lockedNote="Locked in — now play it out."
      />
      {log.length ? (
        <Card style={{ gap: 4 }}>
          <SectionLabel>So far</SectionLabel>
          {log.map((l, i) => (
            <AppText key={`${i}-${l}`} variant="small" color={colors.textBody}>
              {l}
            </AppText>
          ))}
        </Card>
      ) : null}
      {phase === 'play' && prompt ? <Decision key={`${draft.seed}-${draft.inputs.length}`} prompt={prompt} onCommit={(x) => onDraft(scenarioEngine.play(spec, draft, x))} /> : null}
      {phase === 'done' ? <ScenarioOutcome spec={spec} answer={{ option: draft.option!, seed: draft.seed, inputs: draft.inputs }} /> : null}
    </View>
  );
}

/** What the scenario's engine produced for a play-through (from its seed and moves). */
function ScenarioOutcome({ spec, answer }: { spec: ScenarioSpec; answer: ScenarioAnswer }) {
  const s = replay(spec, { prediction: { answer: answer.option, confidence: null, locked: true }, inputs: answer.inputs, seed: answer.seed, version: spec.version });
  if (s === null || spec.play.prompt(s) !== null) return null;
  const result = spec.play.result(s);
  return (
    <Card elevated style={{ gap: space.md }}>
      <SectionLabel color={colors.insight}>What happened</SectionLabel>
      <AppText variant="heading">{result.headline}</AppText>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        {result.stats.map((st) => (
          <View key={st.label} style={{ flexBasis: '30%', flexGrow: 1 }}>
            <Stat label={st.label} value={st.value} tone={st.tone === 'neutral' ? undefined : st.tone} />
          </View>
        ))}
      </View>
      {result.bars?.length ? <Bars bars={result.bars} /> : null}
      {result.lines.map((l) => (
        <AppText key={l} variant="small" color={colors.textBody}>
          {l}
        </AppText>
      ))}
    </Card>
  );
}

/**
 * The graded result: the answer against the model's, the server's feedback for it, the reasoning and the takeaway.
 * For a scenario challenge, the recorded play-through is replayed through the scenario's engine first.
 */
export function DailyResultView({ challenge, result, answer, confidence, practice }: { challenge: DailyChallenge | null; result: DailyResult; answer: unknown; confidence: Confidence | null; practice?: boolean }) {
  const spec = challenge?.interaction === 'scenario' ? scenarioFor(challenge.config) : null;
  const played = spec ? scenarioAnswerSchema.safeParse(answer) : null;
  return (
    <View style={{ gap: space.md }}>
      {spec && played?.success ? <ScenarioOutcome spec={spec} answer={played.data} /> : null}
      <PredictionResult
        predicted={result.answerLabel}
        actual={result.modelAnswer}
        actualLabel="The model’s answer"
        verdict={result.verdict}
        confidence={confidence}
        title={practice ? 'Practice — not recorded' : undefined}>
        {result.feedback}
      </PredictionResult>
      <Panel tone="insight" title="The reasoning">
        <View style={{ gap: space.sm }}>
          {result.explanation.map((e) => (
            <AppText key={e} variant="body">
              {e}
            </AppText>
          ))}
        </View>
      </Panel>
      <FeedbackPanel verdict="match" title="Takeaway">
        {result.takeaway}
      </FeedbackPanel>
    </View>
  );
}
