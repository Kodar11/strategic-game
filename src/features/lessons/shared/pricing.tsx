import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AnimatedNumber } from '@/src/components/lesson/AnimatedNumber';
import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import type { PriceAction } from '@/src/game/incentives';
import { colors, radius, space } from '@/src/theme/tokens';

export const PRICE_LABEL: Record<PriceAction, string> = { maintain: 'Maintain prices', cut: 'Cut prices' };
export const PRICE_SHORT: Record<PriceAction, string> = { maintain: 'Maintain', cut: 'Cut' };

/**
 * Illustrative customer split for each outcome — for intuition only. The profit numbers shown
 * always come from the payoff table, never from this split.
 */
export function customerSplit(you: PriceAction, rival: PriceAction): [number, number] {
  if (you === rival) return [50, 50];
  return you === 'cut' ? [75, 25] : [25, 75];
}

export function CompanyBadge({ side }: { side: 'you' | 'rival' }) {
  const you = side === 'you';
  return (
    <View style={[styles.badge, { backgroundColor: you ? colors.primarySoft : colors.rivalSoft, borderColor: you ? colors.primary : colors.rival }]}>
      <View style={[styles.dot, { backgroundColor: you ? colors.primary : colors.rival }]} />
      <AppText variant="caption" color={you ? colors.primaryText : colors.rivalText}>
        {you ? 'QuickEats · you' : 'FoodKart · Rohan'}
      </AppText>
    </View>
  );
}

/** Side-by-side outcome card: each company's action, customers (illustrative) and profit (from the matrix). */
export function OutcomeBoard({
  you,
  rival,
  payoffs,
  delay = 0,
}: {
  you: PriceAction;
  rival: PriceAction;
  payoffs: readonly [number, number];
  delay?: number;
}) {
  const enter = useEnter();
  const [cy, cr] = customerSplit(you, rival);
  return (
    <Animated.View entering={enter(delay)} style={styles.board}>
      {(['you', 'rival'] as const).map((side) => {
        const isYou = side === 'you';
        const action = isYou ? you : rival;
        const profit = isYou ? payoffs[0] : payoffs[1];
        const share = isYou ? cy : cr;
        const accent = isYou ? colors.primary : colors.rival;
        return (
          <View key={side} style={[styles.half, { borderColor: accent }]}>
            <CompanyBadge side={side} />
            <AppText variant="bodyStrong" style={{ marginTop: space.sm }}>
              {PRICE_LABEL[action]}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: space.md }}>
              Customers (illustrative)
            </AppText>
            <View style={styles.shareTrack}>
              <View style={[styles.shareFill, { width: `${share}%`, backgroundColor: accent }]} />
            </View>
            <AppText variant="caption" color={colors.textMuted} tabular>
              {share}% of orders
            </AppText>
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: space.md }}>
              Profit
            </AppText>
            <AnimatedNumber value={profit} decimals={Number.isInteger(profit) ? 0 : 1} variant="number" color={isYou ? colors.primaryText : colors.rivalText} />
          </View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  board: { flexDirection: 'row', gap: space.sm },
  half: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderTopWidth: 3,
    padding: space.md,
  },
  shareTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, marginVertical: 6, overflow: 'hidden' },
  shareFill: { height: '100%', borderRadius: 3 },
});
