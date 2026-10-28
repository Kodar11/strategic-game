import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

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

/** Up to two decimals, trailing zeros dropped — so 0.95 reads 0.95, not a rounded 0.9. */
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

const GAP = 6;
const HEAD_H = 34;
const MIN_TOUCH = 44;

/** Sizes for the two ways a cell can show its payoff pair. */
const MODES = {
  // Side by side — "4 , 3" — for small tables with room to spare.
  side: { variant: 'heading', ring: 36, charW: 11.5, cellH: 64 },
  // Stacked — row player's payoff on top, column player's below — so wide tables still fit a phone.
  stack: { variant: 'bodyStrong', ring: 28, charW: 9.5, cellH: 70 },
} as const;

type Mode = keyof typeof MODES;

interface Layout {
  mode: Mode;
  rowHeadW: number;
  /** Fixed cell width when the grid scrolls sideways; otherwise cells share the width. */
  cellW?: number;
  scroll: boolean;
}

/**
 * Picks the most readable layout that fits `width`: side by side if every cell has room for both values, else
 * stacked, else stacked inside a sideways scroll with the row labels pinned. Text widths are estimated from
 * character counts (tabular digits), which is enough to choose between the three.
 */
function matrixLayout(width: number, cols: number, longestValue: number, longestRowLabel: number): Layout {
  const rowHeadW = Math.min(80, Math.max(28, Math.ceil(longestRowLabel * 7) + 6));
  const perCell = (width - rowHeadW - cols * GAP) / cols;
  const need = (m: Mode) => {
    const v = Math.max(MODES[m].ring, longestValue * MODES[m].charW + 10);
    return m === 'side' ? 2 * v + 18 : Math.max(MIN_TOUCH, v + 8);
  };
  if (perCell >= need('side')) return { mode: 'side', rowHeadW, scroll: false };
  if (perCell >= need('stack')) return { mode: 'stack', rowHeadW, scroll: false };
  return { mode: 'stack', rowHeadW, cellW: Math.max(need('stack'), 52), scroll: true };
}

/** "You: café" already names its player; "3" does not. */
const named = (name: string, label: string) => (label.toLowerCase().startsWith(name.toLowerCase()) ? label : `${name} ${label}`);

/**
 * Two-player payoff table. Row player (blue) payoff is shown first — or on top when cells are stacked — and the
 * column player (orange) second. Best replies are ringed; equilibria and the actual outcome are outlined in the
 * cell and named in the notes below it, so no annotation text has to fit inside a cell.
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
  const window = useWindowDimensions();
  // A first guess (screen minus lesson and card padding) avoids a visible re-layout; onLayout then gives the real width.
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? Math.min(window.width, 560) - 64;
  const marks = useMemo(() => bestReplyMarks(game), [game]);
  const layout = useMemo(() => {
    const longestValue = Math.max(...game.payoffs.flat(2).map((n) => fmt(n).length));
    const longestRowLabel = Math.max(...game.rows.map((r) => rowLabels[r].length));
    return matrixLayout(width, game.cols.length, longestValue, Math.min(longestRowLabel, 12));
  }, [game, rowLabels, width]);
  const m = MODES[layout.mode];

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== measured) setMeasured(w);
  };

  const equilibria = showBestReplies
    ? game.rows.flatMap((r, ri) => game.cols.filter((_, ci) => marks[ri][ci][0] && marks[ri][ci][1]).map((c) => ({ row: r, col: c })))
    : [];
  const cellLabel = (row: R, col: C) => `${named(rowName, rowLabels[row])} · ${named(colName, colLabels[col])}`;
  const outcomePayoff = outcome ? game.payoffs[game.rows.indexOf(outcome.row)][game.cols.indexOf(outcome.col)] : null;

  const grid = (
    <View>
      <View style={[styles.gridRow, { height: HEAD_H }]}>
        {game.cols.map((c) => (
          <View key={c} style={[styles.colHead, layout.cellW ? { width: layout.cellW } : styles.flexCell]}>
            <AppText variant="caption" color={colors.rivalText} align="center" numberOfLines={2}>
              {colLabels[c]}
            </AppText>
          </View>
        ))}
      </View>
      {game.rows.map((r, ri) => (
        <View key={r} style={[styles.gridRow, { height: m.cellH, marginTop: GAP }]}>
          {game.cols.map((c, ci) => {
            const [a, b] = game.payoffs[ri][ci];
            const base = baseline?.payoffs[ri][ci];
            const isOutcome = outcome?.row === r && outcome?.col === c;
            const isSelected = selected?.row === r && selected?.col === c;
            const [rowBR, colBR] = marks[ri][ci];
            const isEq = !!showBestReplies && rowBR && colBR;
            return (
              <MatrixCell
                key={c}
                width={layout.cellW}
                mode={layout.mode}
                label={`${rowLabels[r]} and ${colLabels[c]}: ${rowName} ${fmt(a)}, ${colName} ${fmt(b)}${isEq ? ', equilibrium' : ''}${isOutcome ? ', what happened' : ''}`}
                a={a}
                b={b}
                aChanged={base ? base[0] !== a : false}
                bChanged={base ? base[1] !== b : false}
                ringA={!!showBestReplies && rowBR}
                ringB={!!showBestReplies && colBR}
                outcome={isOutcome}
                selected={isSelected}
                equilibrium={isEq}
                onPress={onCellPress ? () => onCellPress(r, c) : undefined}
              />
            );
          })}
        </View>
      ))}
    </View>
  );

  return (
    <View onLayout={onLayout} style={{ gap: space.sm }}>
      <View style={styles.key} accessibilityLabel={`Payoff table. ${rowName} payoff ${layout.mode === 'stack' ? 'on top' : 'first'}, ${colName} payoff ${layout.mode === 'stack' ? 'below' : 'second'}.`}>
        <KeyItem color={colors.primaryText} text={`${rowName} · rows · ${layout.mode === 'stack' ? 'top' : 'first'}`} />
        <KeyItem color={colors.rivalText} text={`${colName} · columns · ${layout.mode === 'stack' ? 'bottom' : 'second'}`} />
      </View>

      <View style={{ flexDirection: 'row' }}>
        {/* Row labels sit outside the (possibly scrolling) grid, at the same fixed heights, so they stay aligned. */}
        <View style={{ width: layout.rowHeadW, marginRight: GAP }}>
          <View style={{ height: HEAD_H }} />
          {game.rows.map((r) => (
            <View key={r} style={[styles.rowHead, { height: m.cellH, marginTop: GAP }]}>
              <AppText variant="caption" color={colors.primaryText} numberOfLines={2}>
                {rowLabels[r]}
              </AppText>
            </View>
          ))}
        </View>
        {layout.scroll ? (
          <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }} contentContainerStyle={{ paddingRight: space.xs }}>
            {grid}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{grid}</View>
        )}
      </View>

      {layout.scroll ? (
        <AppText variant="caption" color={colors.textFaint}>
          Swipe the table sideways to see every column.
        </AppText>
      ) : null}

      {outcome && outcomePayoff ? (
        <View style={styles.note}>
          <View style={[styles.swatch, { borderColor: colors.text }]} />
          <AppText variant="caption" color={colors.textBody} style={{ flex: 1 }}>
            <AppText variant="caption" weight="semibold" color={colors.text}>
              What happened:{' '}
            </AppText>
            {cellLabel(outcome.row, outcome.col)} → {fmt(outcomePayoff[0])}, {fmt(outcomePayoff[1])}
          </AppText>
        </View>
      ) : null}
      {showBestReplies ? (
        <>
          <View style={styles.note}>
            <View style={[styles.swatch, styles.swatchRing]} />
            <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
              Ringed = best reply to the other side&apos;s choice.
            </AppText>
          </View>
          <View style={styles.note}>
            <View style={[styles.swatch, { borderColor: colors.insight, backgroundColor: colors.insightSoft }]} />
            <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
              <AppText variant="caption" weight="semibold" color={colors.insight}>
                {equilibria.length > 1 ? 'Equilibria' : 'Equilibrium'}:{' '}
              </AppText>
              {equilibria.length ? equilibria.map((e) => cellLabel(e.row, e.col)).join('; ') : 'none — no cell has both payoffs ringed.'}
            </AppText>
          </View>
        </>
      ) : null}
    </View>
  );
}

function KeyItem({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.keyItem}>
      <View style={[styles.keyDot, { backgroundColor: color }]} />
      <AppText variant="caption" color={color} numberOfLines={1} style={{ flexShrink: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

function MatrixCell({
  width,
  mode,
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
  width?: number;
  mode: Mode;
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
  const fill = selected ? colors.primarySoft : equilibrium ? colors.insightSoft : colors.bgRaised;
  return (
    <Pressable
      style={width ? { width } : styles.flexCell}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityState={onPress ? { selected } : undefined}>
      <View style={[styles.cell, { borderColor: border, backgroundColor: fill, borderWidth: outcome || selected ? 2 : 1.5 }]}>
        <View style={mode === 'side' ? styles.valuesSide : styles.valuesStack}>
          <Value n={a} ring={ringA} color={colors.primaryText} changed={aChanged} mode={mode} />
          {mode === 'side' ? (
            <AppText variant="small" color={colors.textFaint}>
              ,
            </AppText>
          ) : null}
          <Value n={b} ring={ringB} color={colors.rivalText} changed={bChanged} mode={mode} />
        </View>
      </View>
    </Pressable>
  );
}

function Value({ n, ring, color, changed, mode }: { n: number; ring: boolean; color: string; changed: boolean; mode: Mode }) {
  const m = MODES[mode];
  return (
    <View style={[styles.value, { minWidth: m.ring, height: m.ring, borderRadius: m.ring / 2 }, ring && { borderColor: color }]}>
      <AppText variant={m.variant} color={color} tabular weight={ring ? 'bold' : 'semibold'} numberOfLines={1}>
        {fmt(n)}
      </AppText>
      {changed ? <View style={styles.changedDot} accessibilityLabel="changed" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  key: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: 2 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  keyDot: { width: 8, height: 8, borderRadius: 4 },
  gridRow: { flexDirection: 'row', gap: GAP },
  flexCell: { flex: 1 },
  colHead: { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 2 },
  rowHead: { justifyContent: 'center' },
  cell: {
    flex: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valuesSide: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  valuesStack: { alignItems: 'center', gap: 2 },
  value: {
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changedDot: { position: 'absolute', top: 1, right: 1, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.insight },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  swatch: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, marginTop: 0 },
  swatchRing: { borderRadius: 8, borderColor: colors.textMuted },
});
