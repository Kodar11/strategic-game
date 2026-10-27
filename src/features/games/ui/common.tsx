import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import type { LucideIcon } from '@/src/components/ui/icons';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';

/** A large, easy-to-hit action tile for a game move. */
export function MoveTile({
  label,
  hint,
  icon,
  tint,
  bg,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  hint?: string;
  icon: ReactNode;
  tint: string;
  bg: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (hint ? `${label}. ${hint}` : label)}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptic.commit();
        onPress();
      }}
      style={({ pressed }) => [styles.tile, { borderColor: tint }, pressed && { backgroundColor: bg }, disabled && { opacity: 0.5 }]}>
      <View style={[styles.tileIcon, { backgroundColor: bg }]}>{icon}</View>
      <AppText variant="bodyStrong" align="center">
        {label}
      </AppText>
      {hint ? (
        <AppText variant="caption" color={colors.textMuted} align="center">
          {hint}
        </AppText>
      ) : null}
    </Pressable>
  );
}

/** A revealed choice: who, what, with a short pop-in unless motion is reduced. */
export function RevealChip({ who, label, icon, tint, bg, delay = 0, revealKey }: { who: string; label: string; icon: ReactNode; tint: string; bg: string; delay?: number; revealKey: string | number }) {
  const reduced = useMotionReduced();
  return (
    <Animated.View key={revealKey} entering={reduced ? undefined : ZoomIn.duration(220).delay(delay)} style={[styles.reveal, { borderColor: tint }]}>
      <AppText variant="caption" color={colors.textMuted}>
        {who}
      </AppText>
      <View style={[styles.revealIcon, { backgroundColor: bg }]}>{icon}</View>
      <AppText variant="bodyStrong" color={tint}>
        {label}
      </AppText>
    </Animated.View>
  );
}

export function FadeInView({ children, revealKey }: { children: ReactNode; revealKey: string | number }) {
  const reduced = useMotionReduced();
  return (
    <Animated.View key={revealKey} entering={reduced ? undefined : FadeIn.duration(200)}>
      {children}
    </Animated.View>
  );
}

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

export function iconFor(Icon: LucideIcon, color: string, size = 30) {
  return <Icon size={size} color={color} strokeWidth={2} />;
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  tileIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  reveal: { flex: 1, alignItems: 'center', gap: space.xs, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, backgroundColor: colors.bgRaised },
  revealIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  matrix: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  mRow: { flexDirection: 'row' },
  mCorner: { flex: 1.2, padding: space.sm, justifyContent: 'center', backgroundColor: colors.bgRaised },
  mHead: { flex: 1, padding: space.sm, alignItems: 'center', backgroundColor: colors.bgRaised },
  mCell: { flex: 1, padding: space.sm, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderLeftWidth: 1, borderColor: colors.border },
  mCellOn: { backgroundColor: colors.insightSoft, borderColor: colors.insight },
});
