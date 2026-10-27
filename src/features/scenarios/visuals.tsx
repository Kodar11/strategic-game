import { StyleSheet, View } from 'react-native';

import { PayoffMatrix } from '@/src/components/lesson/PayoffMatrix';
import { AppText } from '@/src/components/ui/AppText';
import { type GameTree, type TreeNode } from '@/src/game/sequential';
import { colors, radius, space } from '@/src/theme/tokens';
import { fmt } from './builders';
import type { ScenarioResult, ScenarioVisual, Tone } from './types';

const TONE: Record<Tone, string> = { neutral: colors.text, blue: colors.primaryText, orange: colors.rivalText, amber: colors.insight };

/** The game's structure as the learner sees it: a payoff table, a decision tree or a plain table. */
export function ScenarioVisualView({ visual, result }: { visual: ScenarioVisual; result?: ScenarioResult | null }) {
  if (visual.kind === 'matrix') {
    return (
      <PayoffMatrix
        game={visual.game}
        rowName={visual.rowName}
        colName={visual.colName}
        rowLabels={visual.rowLabels}
        colLabels={visual.colLabels}
        outcome={result?.cell}
        showBestReplies={!!result}
      />
    );
  }
  if (visual.kind === 'tree') return <GameTreeView tree={visual.tree} path={result?.path} />;
  return <DataTable caption={visual.caption} head={visual.head} rows={visual.rows} />;
}

export function DataTable({ caption, head, rows }: { caption?: string; head: string[]; rows: string[][] }) {
  return (
    <View style={{ gap: space.xs }} accessible accessibilityLabel={`${caption ?? 'Table'}. ${head.join(', ')}. ${rows.map((r) => r.join(', ')).join('. ')}`}>
      {caption ? (
        <AppText variant="caption" color={colors.textMuted}>
          {caption}
        </AppText>
      ) : null}
      <View style={styles.table}>
        {[head, ...rows].map((r, i) => (
          <View key={i} style={[styles.tr, i === 0 && styles.th]}>
            {r.map((cell, j) => (
              <AppText key={j} variant={i === 0 ? 'caption' : 'small'} color={i === 0 ? colors.textMuted : j === 0 ? colors.primaryText : colors.text} tabular style={styles.td} numberOfLines={2}>
                {cell}
              </AppText>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A game tree drawn as nested branches: each decision shows who moves, each branch the action, each leaf the
 * payoffs (in the order of `tree.players`). After play, the branches actually taken are highlighted.
 */
export function GameTreeView({ tree, path }: { tree: GameTree; path?: string[] }) {
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="caption" color={colors.textMuted}>
        Payoffs shown as {tree.players.join(', ')}.
      </AppText>
      <Branch tree={tree} node={tree.root} path={path} depth={0} taken={!!path} />
    </View>
  );
}

function Branch({ tree, node, path, depth, taken }: { tree: GameTree; node: TreeNode; path?: string[]; depth: number; taken: boolean }) {
  if (node.kind === 'leaf') {
    return (
      <AppText variant="small" tabular color={taken && path ? colors.insight : colors.textBody} weight={taken && path ? 'semibold' : undefined}>
        → {node.payoffs.map((p) => fmt(p)).join(', ')}
      </AppText>
    );
  }
  const mover = tree.players[node.player];
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="caption" color={node.player === 0 ? colors.primaryText : colors.rivalText}>
        {mover === 'You' ? 'You decide' : `${mover} decides`}
      </AppText>
      {node.actions.map((a) => {
        const on = taken && path?.[depth] === a.id;
        return (
          <View key={a.id} style={[styles.branch, on && { borderLeftColor: colors.insight }]}>
            <AppText variant="small" weight={on ? 'semibold' : undefined} color={on ? colors.insight : colors.text}>
              {a.label}
            </AppText>
            <View style={{ paddingLeft: space.sm }}>
              <Branch tree={tree} node={a.child} path={path} depth={depth + 1} taken={on} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Labelled horizontal bars for shares and probabilities (0–1), with the number always printed. */
export function Bars({ bars }: { bars: NonNullable<ScenarioResult['bars']> }) {
  return (
    <View style={{ gap: space.sm }}>
      {bars.map((b) => (
        <View key={b.label} accessible accessibilityLabel={`${b.label}: ${Math.round(b.value * 100)}%`} style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" color={colors.textMuted}>
              {b.label}
            </AppText>
            <AppText variant="caption" tabular color={TONE[b.tone ?? 'blue']}>
              {(b.value * 100).toFixed(1)}%
            </AppText>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, b.value)) * 100}%`, backgroundColor: b.tone === 'amber' ? colors.insight : b.tone === 'orange' ? colors.rival : colors.primary }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function statColor(t?: Tone) {
  return TONE[t ?? 'neutral'];
}

const styles = StyleSheet.create({
  table: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border },
  th: { borderTopWidth: 0, backgroundColor: colors.bgRaised },
  td: { flex: 1, paddingHorizontal: 6, paddingVertical: 6 },
  branch: { borderLeftWidth: 2, borderLeftColor: colors.borderStrong, paddingLeft: space.sm, gap: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
