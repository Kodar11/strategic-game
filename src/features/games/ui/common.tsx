import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { colors, radius, space } from '@/src/theme/tokens';

/**
 * A 2×2 payoff grid: rows are the player's choice, columns the bot's. The played cell is highlighted. Cells read
 * "you / bot".
 */
export function MiniMatrix<M extends string>({ moves, labels, payoff, played }: { moves: readonly M[]; labels: Record<M, string>; payoff: (p: M, b: M) => [number, number]; played?: { p: M; b: M } }) {
  return (
    <View style={styles.matrix} accessible accessibilityLabel={moves.flatMap((p) => moves.map((b) => `You ${labels[p]}, bot ${labels[b]}: you ${payoff(p, b)[0]}, bot ${payoff(p, b)[1]}`)).join('. ')}>
      <View style={styles.mRow}>
        <View style={styles.mCorner}>
          <AppText variant="caption" color={colors.textFaint}>
            you ↓ · bot →
          </AppText>
        </View>
        {moves.map((b) => (
          <View key={b} style={styles.mHead}>
            <AppText variant="caption" color={colors.rivalText}>
              {labels[b]}
            </AppText>
          </View>
        ))}
      </View>
      {moves.map((p) => (
        <View key={p} style={styles.mRow}>
          <View style={styles.mCorner}>
            <AppText variant="caption" color={colors.primaryText}>
              {labels[p]}
            </AppText>
          </View>
          {moves.map((b) => {
            const on = played?.p === p && played?.b === b;
            const [x, y] = payoff(p, b);
            return (
              <View key={b} style={[styles.mCell, on && styles.mCellOn]}>
                <AppText variant="small" weight="semibold" tabular color={on ? colors.text : colors.textBody}>
                  <AppText variant="small" weight="semibold" color={colors.primaryText}>
                    {x}
                  </AppText>
                  {' / '}
                  <AppText variant="small" weight="semibold" color={colors.rivalText}>
                    {y}
                  </AppText>
                </AppText>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  matrix: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  mRow: { flexDirection: 'row' },
  mCorner: { flex: 1.2, padding: space.sm, justifyContent: 'center', backgroundColor: colors.bgRaised },
  mHead: { flex: 1, padding: space.sm, alignItems: 'center', backgroundColor: colors.bgRaised },
  mCell: { flex: 1, padding: space.sm, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderLeftWidth: 1, borderColor: colors.border },
  mCellOn: { backgroundColor: colors.insightSoft, borderColor: colors.insight },
});
