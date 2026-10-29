import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StatGrid } from '@/src/components/lesson/Panels';
import { PayoffMatrix } from '@/src/components/lesson/PayoffMatrix';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { Slider } from '@/src/components/ui/Slider';
import { iteratedStrictDominance, subGame } from '@/src/game/payoff-matrix';
import { type TreeNode, backwardInduction, equilibriumPath } from '@/src/game/sequential';
import { fmt } from '@/src/features/scenarios/builders';
import { Bars, GameTreeView } from '@/src/features/scenarios/visuals';
import { colors, radius, space } from '@/src/theme/tokens';
import type { LabSpec } from './labs';

/** A lesson's interactive lab. Calls `onExplored` once the learner has done the thing the lab is for. */
export function LabView({ lab, onExplored }: { lab: LabSpec; onExplored: () => void }) {
  switch (lab.kind) {
    case 'matrix':
      return <MatrixLab lab={lab} onExplored={onExplored} />;
    case 'tree':
      return <TreeLab lab={lab} onExplored={onExplored} />;
    case 'param':
      return <ParamLab lab={lab} onExplored={onExplored} />;
    case 'reveal':
      return <RevealLab lab={lab} onExplored={onExplored} />;
  }
}

function MatrixLab({ lab, onExplored }: { lab: Extract<LabSpec, { kind: 'matrix' }>; onExplored: () => void }) {
  const [showBR, setShowBR] = useState(false);
  const [round, setRound] = useState(0);
  const elimination = useMemo(() => iteratedStrictDominance(lab.game), [lab.game]);
  const shown = lab.eliminate && round > 0 ? subGame(lab.game, elimination.steps[round - 1].rows, elimination.steps[round - 1].cols) : lab.game;
  const removed = elimination.steps.slice(0, round).flatMap((s, i) => [...s.removedRows.map((r) => `Round ${i + 1}: ${lab.rowName} ${lab.rowLabels[r]}`), ...s.removedCols.map((c) => `Round ${i + 1}: ${lab.colName} ${lab.colLabels[c]}`)]);
  return (
    <Card style={{ gap: space.md }}>
      <AppText variant="small" color={colors.textMuted}>
        {lab.prompt}
      </AppText>
      <PayoffMatrix game={shown} rowName={lab.rowName} colName={lab.colName} rowLabels={lab.rowLabels} colLabels={lab.colLabels} showBestReplies={showBR} />
      {lab.eliminate ? (
        <>
          {removed.map((r) => (
            <AppText key={r} variant="small" color={colors.textBody}>
              Deleted — {r}
            </AppText>
          ))}
          {round < elimination.steps.length ? (
            <Button
              label="Delete this round’s dominated options"
              variant="secondary"
              onPress={() => {
                const next = round + 1;
                setRound(next);
                if (next === elimination.steps.length) onExplored();
              }}
            />
          ) : (
            <AppText variant="bodyStrong" color={colors.insight}>
              Nothing more is dominated. What survives: {elimination.rows.map((r) => lab.rowLabels[r]).join(', ')} / {elimination.cols.map((c) => lab.colLabels[c]).join(', ')}.
            </AppText>
          )}
        </>
      ) : !showBR ? (
        <Button
          label="Ring the best replies"
          variant="secondary"
          onPress={() => {
            setShowBR(true);
            onExplored();
          }}
        />
      ) : null}
    </Card>
  );
}

/** Nodes in the order backward induction solves them: deepest first. */
function solveOrder(node: TreeNode, depth = 0, out: { node: TreeNode & { kind: 'decision' }; depth: number }[] = []) {
  if (node.kind === 'decision') {
    node.actions.forEach((a) => solveOrder(a.child, depth + 1, out));
    out.push({ node, depth });
  }
  return out.sort((a, b) => b.depth - a.depth);
}

function TreeLab({ lab, onExplored }: { lab: Extract<LabSpec, { kind: 'tree' }>; onExplored: () => void }) {
  const [solved, setSolved] = useState(0);
  const order = useMemo(() => solveOrder(lab.tree.root), [lab.tree]);
  const sol = useMemo(() => backwardInduction(lab.tree), [lab.tree]);
  const done = solved >= order.length;
  return (
    <Card style={{ gap: space.md }}>
      <AppText variant="small" color={colors.textMuted}>
        {lab.prompt}
      </AppText>
      <GameTreeView tree={lab.tree} path={done ? equilibriumPath(lab.tree, sol) : undefined} />
      <View style={{ gap: 4 }}>
        {order.slice(0, solved).map(({ node }) => {
          const a = node.actions.find((x) => x.id === sol.choice[node.id])!;
          return (
            <AppText key={node.id} variant="small">
              <AppText variant="small" weight="semibold" color={node.player === 0 ? colors.primaryText : colors.rivalText}>
                {lab.tree.players[node.player]}
              </AppText>{' '}
              {node.label ? `(${node.label}) ` : ''}chooses “{a.label}” → {sol.value[node.id].map((v) => fmt(v)).join(', ')}
            </AppText>
          );
        })}
      </View>
      {!done ? (
        <Button
          label={solved ? 'Solve the next step back' : 'Solve the last decision'}
          variant="secondary"
          onPress={() => {
            const next = solved + 1;
            setSolved(next);
            if (next >= order.length) onExplored();
          }}
        />
      ) : (
        <AppText variant="bodyStrong" color={colors.insight}>
          Solved: the highlighted path is the subgame-perfect prediction.
        </AppText>
      )}
    </Card>
  );
}

function ParamLab({ lab, onExplored }: { lab: Extract<LabSpec, { kind: 'param' }>; onExplored: () => void }) {
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(lab.sliders.map((s) => [s.id, s.initial])));
  const [touched, setTouched] = useState(false);
  const out = lab.compute(values);
  return (
    <Card style={{ gap: space.md }}>
      <AppText variant="small" color={colors.textMuted}>
        {lab.prompt}
      </AppText>
      {lab.sliders.map((s) => (
        <Slider
          key={s.id}
          value={values[s.id]}
          min={s.min}
          max={s.max}
          step={s.step}
          label={s.label}
          tone="cyan"
          formatValue={(v) => `${v}${s.unit ?? ''}`}
          onChange={(v) => {
            setValues((x) => ({ ...x, [s.id]: v }));
            if (!touched) {
              setTouched(true);
              onExplored();
            }
          }}
        />
      ))}
      <StatGrid stats={out.stats} />
      {out.bars ? <Bars bars={out.bars} /> : null}
      {out.lines.map((l) => (
        <AppText key={l} variant="small">
          {l}
        </AppText>
      ))}
      {!touched ? (
        <AppText variant="caption" color={colors.textMuted}>
          Move a slider to explore.
        </AppText>
      ) : null}
    </Card>
  );
}

/**
 * Step-by-step reveal. A card with a `guess` asks the learner to commit to an answer first; the reveal then says
 * whether the guess matched. Guesses are part of the experiment, not recorded predictions.
 */
function RevealLab({ lab, onExplored }: { lab: Extract<LabSpec, { kind: 'reveal' }>; onExplored: () => void }) {
  const [shown, setShown] = useState(0);
  const [guesses, setGuesses] = useState<Record<number, string>>({});
  const reveal = () => {
    const next = shown + 1;
    setShown(next);
    if (next === lab.cards.length) onExplored();
  };
  return (
    <Card style={{ gap: space.md }}>
      <AppText variant="small" color={colors.textMuted}>
        {lab.prompt}
      </AppText>
      {lab.cards.map((c, i) => {
        if (i > shown) return null;
        const guess = guesses[i];
        if (i < shown)
          return (
            <View key={c.title} style={styles.card}>
              <SectionLabel>{c.title}</SectionLabel>
              {c.guess && guess ? (
                <AppText variant="caption" color={guess === c.guess.answer ? colors.success : colors.insight}>
                  {guess === c.guess.answer ? `You said “${guess}” — right.` : `You said “${guess}”. Look again:`}
                </AppText>
              ) : null}
              <AppText variant="small">{c.body}</AppText>
            </View>
          );
        if (c.guess)
          return (
            <View key={c.title} style={[styles.card, styles.hidden]}>
              <AppText variant="small" color={colors.accent}>
                {c.title}: {c.guess.question}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }} accessibilityRole="radiogroup">
                {c.guess.options.map((o) => (
                  <Pressable
                    key={o}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: guess === o }}
                    onPress={() => setGuesses((g) => ({ ...g, [i]: o }))}
                    style={[styles.chip, guess === o && styles.chipOn]}>
                    <AppText variant="small" color={guess === o ? colors.text : colors.textBody}>
                      {o}
                    </AppText>
                  </Pressable>
                ))}
              </View>
              <Button label="Reveal" variant="secondary" compact disabled={!guess} onPress={reveal} style={{ alignSelf: 'flex-start' }} />
            </View>
          );
        return (
          <Pressable
            key={c.title}
            accessibilityRole="button"
            accessibilityLabel={`Reveal ${c.title}`}
            onPress={reveal}
            style={({ pressed }) => [styles.card, styles.hidden, pressed && { backgroundColor: colors.surfaceHigh }]}>
            <AppText variant="small" color={colors.accent}>
              Tap to reveal: {c.title}
            </AppText>
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised, gap: 4 },
  hidden: { borderStyle: 'dashed', borderColor: 'rgba(34,211,238,0.4)', minHeight: 44, justifyContent: 'center' },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
