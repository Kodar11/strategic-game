import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Dialogue, FeedbackPanel, Panel, Stat } from '@/src/components/lesson/Panels';
import { PredictionPrompt, PredictionResult } from '@/src/components/lesson/Prediction';
import { chooseAnswer, rateConfidence } from '@/src/components/lesson/prediction-state';
import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Badge, Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ChevronDown, RotateCcw } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { useProgress } from '@/src/store/progress';
import { colors, radius, space } from '@/src/theme/tokens';
import { getScenario } from './index';
import { type AlternativesView, alternatives, freshRun, replay, runPhase } from './runtime';
import { type DecisionPrompt, type Input, SLOT_INFO, type ScenarioSpec } from './types';
import { Bars, ScenarioVisualView } from './visuals';

const SOURCE_LABEL = { canonical: 'Canonical game', adapted: 'Adapted', original: 'Original to this app' } as const;

/**
 * One paired scenario, played end to end: brief and rules → prediction (with confidence, locked) → decisions →
 * the engine's result → how the prediction compares → the reasoning and the takeaway. State lives in the store, so
 * leaving and coming back resumes exactly; "Play again" starts a fresh attempt and keeps the first one on record.
 */
export function ScenarioPlayer({ id }: { id: string }) {
  const spec = getScenario(id);
  if (!spec) return null;
  return <Player key={spec.id} spec={spec} />;
}

function Player({ spec }: { spec: ScenarioSpec }) {
  const enter = useEnter();
  const saved = useProgress((s) => s.scenarioRuns[spec.id]);
  // A stable placeholder until the first prediction creates a real run (selectors must return stable values).
  const placeholder = useMemo(() => freshRun(spec, 0), [spec]);
  const run = saved && saved.version === spec.version ? saved : placeholder;
  const setPrediction = useProgress((s) => s.setScenarioPrediction);
  const lock = useProgress((s) => s.lockScenarioPrediction);
  const input = useProgress((s) => s.scenarioInput);
  const restart = useProgress((s) => s.restartScenario);
  const doneBefore = useProgress((s) => s.scenarioDone.includes(spec.id));
  const [showFormal, setShowFormal] = useState(false);

  const phase = runPhase(spec, run);
  const state = phase === 'predict' ? null : replay(spec, run);
  const prompt = state !== null ? spec.play.prompt(state) : null;
  const result = phase === 'done' && state !== null ? spec.play.result(state) : null;
  const log = state !== null && spec.play.log ? spec.play.log(state) : [];
  const chosen = spec.predict.options.find((o) => o.id === run.prediction.answer);
  const compare = useMemo(() => (phase === 'done' ? alternatives(spec, run) : null), [phase, spec, run]);

  return (
    <View style={{ gap: space.lg }}>
      <Animated.View entering={enter(0, 'fade')} style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Badge label={`${SLOT_INFO[spec.slot].label} · ${SLOT_INFO[spec.slot].purpose}`} tone="cyan" />
          {doneBefore ? <Badge label="Played" tone="success" /> : null}
        </View>
        <AppText variant="title" accessibilityRole="header">
          {spec.title}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          {spec.purpose}
        </AppText>
        <AppText variant="body">{spec.setup}</AppText>
      </Animated.View>

      {spec.speaker ? (
        <Dialogue character={spec.speaker.character} expression="confident" align="right">
          {spec.speaker.line}
        </Dialogue>
      ) : null}

      <Card style={{ gap: space.sm }}>
        <SectionLabel>The rules</SectionLabel>
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
            <ScenarioVisualView visual={spec.visual} result={result} />
          </View>
        ) : null}
        <Pressable
          onPress={() => setShowFormal((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showFormal }}
          accessibilityLabel="Formal specification and source"
          style={styles.formalToggle}>
          <AppText variant="caption" color={colors.accent} style={{ flex: 1 }}>
            Formal specification · {SOURCE_LABEL[spec.formal.source]}
          </AppText>
          <ChevronDown size={16} color={colors.accent} style={{ transform: [{ rotate: showFormal ? '180deg' : '0deg' }] }} />
        </Pressable>
        {showFormal ? <Formal spec={spec} revealOpponent={phase === 'done'} /> : null}
      </Card>

      <PredictionPrompt
        question={spec.predict.question}
        options={spec.predict.options.map((o) => ({ id: o.id, label: o.label }))}
        value={run.prediction.answer}
        onChange={(a) => setPrediction(spec.id, chooseAnswer(run.prediction, a))}
        confidence={run.prediction.confidence}
        onConfidence={(c) => setPrediction(spec.id, rateConfidence(run.prediction, c))}
        locked={run.prediction.locked}
        onConfirm={() => lock(spec.id)}
        confirmLabel="Lock prediction and play"
        lockedNote="Locked in — now play, then compare."
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

      {phase === 'play' && prompt ? <Decision key={`${run.seed}-${run.inputs.length}`} prompt={prompt} onCommit={(x) => input(spec.id, x)} /> : null}

      {result ? (
        <Animated.View entering={enter(0)} style={{ gap: space.md }}>
          <Card elevated style={{ gap: space.md }}>
            <SectionLabel color={colors.insight}>What happened</SectionLabel>
            <AppText variant="heading">{result.headline}</AppText>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              {result.stats.map((s) => (
                <View key={s.label} style={{ flexBasis: '30%', flexGrow: 1 }}>
                  <Stat label={s.label} value={s.value} tone={s.tone === 'neutral' ? undefined : s.tone} />
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
          {chosen ? (
            <PredictionResult
              predicted={chosen.label}
              actual={spec.predict.modelAnswer}
              actualLabel="The model’s answer"
              note={spec.formal.chance ? 'This game has random draws: your single run above can differ from the model’s answer, and a lucky or unlucky run doesn’t change whether the reasoning was sound.' : undefined}
              verdict={chosen.verdict}
              confidence={run.prediction.confidence}>
              {chosen.feedback}
            </PredictionResult>
          ) : null}
          {compare ? <CompareOptions view={compare} /> : null}
          <Panel tone="insight" title="The reasoning">
            <View style={{ gap: space.sm }}>
              {spec.explain.map((e) => (
                <AppText key={e} variant="body">
                  {e}
                </AppText>
              ))}
            </View>
          </Panel>
          <FeedbackPanel verdict="match" title="Takeaway">
            {spec.takeaway}
          </FeedbackPanel>
          <Button label="Play again" variant="secondary" icon={RotateCcw} iconPosition="left" onPress={() => restart(spec.id)} accessibilityHint="Starts a new attempt. Your first attempt stays on record." />
        </Animated.View>
      ) : null}

      {phase === 'predict' && !run.prediction.answer ? (
        <AppText variant="caption" color={colors.textMuted} align="center">
          Make a prediction to start playing.
        </AppText>
      ) : null}
    </View>
  );
}

function Formal({ spec, revealOpponent }: { spec: ScenarioSpec; revealOpponent: boolean }) {
  const f = spec.formal;
  const rows: [string, string | undefined][] = [
    ['Players', f.players],
    ['Actions', f.actions],
    ['Timing', f.timing],
    ['Information', f.information],
    ['Payoffs', f.payoffs],
    ['Simulated players', f.opponent ? (revealOpponent ? f.opponent : 'Revealed after you play.') : undefined],
    ['Chance', f.chance],
    ['Ties & ending', f.ties],
    ['Solution concept', revealOpponent ? f.solution : 'Revealed after you play.'],
    ['Source', `${SOURCE_LABEL[f.source]}. ${f.sourceNote}`],
  ];
  return (
    <View style={{ gap: space.xs }}>
      {rows
        .filter((r): r is [string, string] => !!r[1])
        .map(([k, v]) => (
          <AppText key={k} variant="small">
            <AppText variant="small" weight="semibold" color={colors.textMuted}>
              {k}:{' '}
            </AppText>
            {v}
          </AppText>
        ))}
    </View>
  );
}

/** The learner's move: a draft they can change freely until they commit it. Also used by Daily Challenge scenarios. */
export function Decision({ prompt, onCommit }: { prompt: DecisionPrompt; onCommit: (input: Input) => void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [num, setNum] = useState<number>(prompt.kind === 'number' ? prompt.initial : 0);
  const [alloc, setAlloc] = useState<number[]>(() =>
    prompt.kind === 'allocation' ? prompt.parties.map((_, i, a) => (i < a.length - 1 ? Math.floor(prompt.total / a.length / prompt.step) * prompt.step : 0)) : [],
  );
  const cta = prompt.cta ?? 'Commit';

  if (prompt.kind === 'choice') {
    return (
      <View style={styles.decision}>
        <AppText variant="overline" color={colors.primaryText}>
          Your move
        </AppText>
        <AppText variant="bodyStrong">{prompt.prompt}</AppText>
        <View accessibilityRole="radiogroup" accessibilityLabel={prompt.prompt} style={{ gap: space.sm }}>
          {prompt.options.map((o) => (
            <View key={o.id} style={{ flexDirection: 'row' }}>
              <ChoiceCard compact title={o.label} description={o.description} selected={choice === o.id} onSelect={() => setChoice(o.id)} />
            </View>
          ))}
        </View>
        <Button label={cta} disabled={!choice} onPress={() => choice && onCommit(choice)} />
      </View>
    );
  }

  if (prompt.kind === 'number') {
    const fmtValue = (v: number) => (prompt.percent ? `${v}%` : prompt.unit ? `${v} ${prompt.unit}` : String(v));
    return (
      <View style={styles.decision}>
        <AppText variant="overline" color={colors.primaryText}>
          Your move
        </AppText>
        <AppText variant="bodyStrong">{prompt.prompt}</AppText>
        <Slider value={num} min={prompt.min} max={prompt.max} step={prompt.step} onChange={setNum} label={prompt.prompt} formatValue={fmtValue} />
        <Button label={`${cta}: ${fmtValue(num)}`} onPress={() => onCommit(num)} />
      </View>
    );
  }

  // Allocation: sliders for every party but the last, who gets what's left.
  const last = prompt.total - alloc.slice(0, -1).reduce((s, x) => s + x, 0);
  const values = [...alloc.slice(0, -1), last];
  return (
    <View style={styles.decision}>
      <AppText variant="overline" color={colors.primaryText}>
        Your move
      </AppText>
      <AppText variant="bodyStrong">{prompt.prompt}</AppText>
      {prompt.parties.slice(0, -1).map((p, i) => (
        <Slider key={p.id} value={alloc[i]} min={0} max={prompt.total} step={prompt.step} onChange={(v) => setAlloc((a) => a.map((x, j) => (j === i ? v : x)))} label={p.label} formatValue={(v) => `${p.label}: ${v}`} />
      ))}
      <AppText variant="small" color={last < 0 ? colors.danger : colors.text}>
        {prompt.parties[prompt.parties.length - 1].label} gets the rest: {last}
        {last < 0 ? ' — lower the others so the total is ' + prompt.total : ''}
      </AppText>
      <Button label={cta} disabled={last < 0} onPress={() => onCommit(values)} />
    </View>
  );
}

/** Every choice the learner could have made, replayed through the same rules — the scenario's "what if" step. */
function CompareOptions({ view }: { view: AlternativesView }) {
  return (
    <Card style={{ gap: space.sm }}>
      <SectionLabel>Compare your options</SectionLabel>
      <AppText variant="small" color={colors.textMuted}>
        {view.expected
          ? `${view.stat} for each choice. These are expected values, so they don’t depend on the luck of one run.`
          : `${view.stat} for each choice. Same rules, same other side — only your choice changes.`}
      </AppText>
      <View accessibilityRole="list" style={{ gap: 4 }}>
        {view.rows.map((r) => (
          <View
            key={String(r.input)}
            accessible
            accessibilityLabel={`${r.label}: ${r.value}${r.mine ? ', your choice' : ''}`}
            style={[styles.compareRow, r.mine && styles.compareMine]}>
            <AppText variant="small" color={r.mine ? colors.text : colors.textBody} style={{ flex: 1 }}>
              {r.label}
              {r.mine ? ' · your choice' : ''}
            </AppText>
            <AppText variant="small" weight="semibold" color={r.mine ? colors.primaryText : colors.text} tabular>
              {r.value}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 36, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.md, backgroundColor: colors.bgRaised },
  compareMine: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  formalToggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.sm, minHeight: 44 },
  decision: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
});

