import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { type MatrixGame, bestReplyMarks } from '@/src/game/payoff-matrix';
import { colors, radius, space } from '@/src/theme/tokens';

export interface PayoffMatrixProps<R extends string, C extends string> {
  game: MatrixGame<R, C>;
  rowName: string;
  colName: string;
  rowLabels: Record<R, string>;
  colLabels: Record<C, string>;
  /** The outcome that actually happened. */
  outcome?: { row: R; col: C };
  /** A cell the learner is inspecting. */
  selected?: { row: R; col: C };
  onCellPress?: (row: R, col: C) => void;
  showBestReplies?: boolean;
  /** Payoffs that differ from a baseline are flagged so learners see exactly what a rule changed. */
  baseline?: MatrixGame<R, C>;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Two-player payoff table. Row player (blue) payoff is shown first, column player (orange) second.
 * Best replies are ringed and labelled in the legend; equilibria get a text tag, not just a colour.
 */
export function PayoffMatrix<R extends string, C extends string>({
  game,
  rowName,
  colName,
  rowLabels,
  colLabels,
  outcome,
  selected,
  onCellPress,
  showBestReplies,
  baseline,
}: PayoffMatrixProps<R, C>) {
  const marks = bestReplyMarks(game);

  return (
    <View accessibilityLabel={`Payoff table. ${rowName} payoff first, ${colName} payoff second.`}>
      <View style={styles.row}>
        <View style={styles.corner}>
          <AppText variant="caption" color={colors.primaryText} numberOfLines={1}>
            {rowName} ↓
          </AppText>
          <AppText variant="caption" color={colors.rivalText} numberOfLines={1}>
            {colName} →
          </AppText>
        </View>
        {game.cols.map((c) => (
          <View key={c} style={styles.colHead}>
            <AppText variant="caption" color={colors.rivalText} align="center">
              {colLabels[c]}
            </AppText>
          </View>
        ))}
      </View>
      {game.rows.map((r, ri) => (
        <View key={r} style={styles.row}>
          <View style={styles.rowHead}>
            <AppText variant="caption" color={colors.primaryText}>
              {rowLabels[r]}
            </AppText>
          </View>
          {game.cols.map((c, ci) => {
            const [a, b] = game.payoffs[ri][ci];
            const base = baseline?.payoffs[ri][ci];
            const isOutcome = outcome?.row === r && outcome?.col === c;
            const isSelected = selected?.row === r && selected?.col === c;
            const [rowBR, colBR] = marks[ri][ci];
            const isEq = showBestReplies && rowBR && colBR;
            return (
              <MatrixCell
                key={c}
                label={`${rowLabels[r]} and ${colLabels[c]}: ${rowName} ${fmt(a)}, ${colName} ${fmt(b)}${isEq ? ', equilibrium' : ''}${isOutcome ? ', what happened' : ''}`}
                a={a}
                b={b}
                aChanged={base ? base[0] !== a : false}
                bChanged={base ? base[1] !== b : false}
                ringA={!!showBestReplies && rowBR}
                ringB={!!showBestReplies && colBR}
                outcome={isOutcome}
                selected={isSelected}
                equilibrium={!!isEq}
                onPress={onCellPress ? () => onCellPress(r, c) : undefined}
              />
            );
          })}
        </View>
      ))}
      {showBestReplies ? (
        <View style={styles.legend}>
          <View style={styles.legendRing} />
          <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
            Ringed = best reply to the other side&apos;s choice. Both ringed = equilibrium.
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function MatrixCell({
  label,
  a,
  b,
  aChanged,
  bChanged,
  ringA,
  ringB,
  outcome,
  selected,
  equilibrium,
  onPress,
}: {
  label: string;
  a: number;
  b: number;
  aChanged: boolean;
  bChanged: boolean;
  ringA: boolean;
  ringB: boolean;
  outcome: boolean;
  selected: boolean;
  equilibrium: boolean;
  onPress?: () => void;
}) {
  const border = selected ? colors.primary : outcome ? colors.text : equilibrium ? colors.insight : colors.border;
  return (
    <Pressable
      style={{ flex: 1 }}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityState={onPress ? { selected } : undefined}>
      <View style={[styles.cell, { borderColor: border }, selected && { backgroundColor: colors.primarySoft }]}>
        <View style={styles.values}>
          <Value n={a} ring={ringA} color={colors.primaryText} changed={aChanged} />
          <AppText variant="small" color={colors.textFaint}>
            ,
          </AppText>
          <Value n={b} ring={ringB} color={colors.rivalText} changed={bChanged} />
        </View>
        {outcome || equilibrium ? (
          <AppText variant="caption" color={outcome ? colors.text : colors.insight} align="center" style={{ fontSize: 10 }}>
            {outcome ? 'What happened' : 'Equilibrium'}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

function Value({ n, ring, color, changed }: { n: number; ring: boolean; color: string; changed: boolean }) {
  return (
    <View style={[styles.value, ring && { borderColor: color }]}>
      <AppText variant="heading" color={color} tabular weight={ring ? 'bold' : 'semibold'}>
        {fmt(n)}
      </AppText>
      {changed ? <View style={styles.changedDot} accessibilityLabel="changed" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm, alignItems: 'stretch' },
  corner: { width: 76, justifyContent: 'flex-end', paddingBottom: 2 },
  colHead: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 2 },
  rowHead: { width: 76, justifyContent: 'center' },
  cell: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    gap: 2,
  },
  values: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 4,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changedDot: { position: 'absolute', top: 1, right: 1, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.insight },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  legendRing: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.textMuted },
});
