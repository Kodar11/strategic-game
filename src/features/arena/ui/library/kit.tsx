import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { AppText } from '@/src/components/ui/AppText';
import { Minus, Plus } from '@/src/components/ui/icons';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';

/** The play-area container every library board uses: one raised surface with an accent border. */
export function Panel({ children, accent = colors.border, style }: { children: ReactNode; accent?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, { borderColor: accent }, style]}>{children}</View>;
}

export function Overline({ children, color = colors.textMuted }: { children: ReactNode; color?: string }) {
  return (
    <AppText variant="overline" color={color}>
      {children}
    </AppText>
  );
}

/** A − value + control with 44 pt targets. */
export function Stepper({ value, min, max, onChange, label, format }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; format?: (v: number) => string }) {
  const set = (v: number) => {
    const next = Math.max(min, Math.min(max, v));
    if (next !== value) {
      haptic.select();
      onChange(next);
    }
  };
  return (
    <View style={styles.stepper} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value, text: format ? format(value) : String(value) }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}>
      <Pressable onPress={() => set(value - 1)} disabled={value <= min} style={({ pressed }) => [styles.stepBtn, pressed && { backgroundColor: colors.surfaceHigh }, value <= min && { opacity: 0.35 }]} accessibilityElementsHidden importantForAccessibility="no">
        <Minus size={18} color={colors.text} />
      </Pressable>
      <AppText variant="heading" tabular align="center" style={{ minWidth: 44 }}>
        {format ? format(value) : value}
      </AppText>
      <Pressable onPress={() => set(value + 1)} disabled={value >= max} style={({ pressed }) => [styles.stepBtn, pressed && { backgroundColor: colors.surfaceHigh }, value >= max && { opacity: 0.35 }]} accessibilityElementsHidden importantForAccessibility="no">
        <Plus size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

/** A toggle pill. */
export function Chip({ label, on, onPress, tint = colors.primary, disabled, a11y }: { label: string; on: boolean; onPress: () => void; tint?: string; disabled?: boolean; a11y?: string }) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: !!disabled }}
      accessibilityLabel={a11y ?? label}
      style={({ pressed }) => [styles.chip, on && { borderColor: tint, backgroundColor: `${tint}26` }, pressed && { opacity: 0.8 }, disabled && { opacity: 0.4 }]}>
      <AppText variant="small" weight={on ? 'semibold' : 'regular'} color={on ? colors.text : colors.textBody}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** A neutral avatar: a letter in a circle. The colour comes from the seat, never from the personality. */
export function Avatar({ name, size = 36, seat = 0, dim }: { name: string; size?: number; seat?: number; dim?: boolean }) {
  const tints = [colors.primary, '#7C8BA1', '#5E7A99', '#8B7E9C', '#6D8C8A'];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tints[seat % tints.length], alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.45 : 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AppText variant={size >= 40 ? 'bodyStrong' : 'small'} weight="bold" color={colors.text}>
        {name[0]}
      </AppText>
    </View>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [3, 1], [1, 3], [3, 3]],
  5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
  6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
};

/** A die face; `face` 0 draws a hidden die. */
export function Die({ face, size = 34, highlight, hidden }: { face: number; size?: number; highlight?: boolean; hidden?: boolean }) {
  const fill = hidden ? colors.surfaceHigh : highlight ? colors.insight : colors.text;
  const pip = hidden ? colors.textFaint : colors.bg;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={2} y={2} width={36} height={36} rx={8} fill={fill} stroke={hidden ? colors.borderStrong : 'none'} strokeWidth={1.5} />
      {hidden ? <Circle cx={20} cy={20} r={4} fill={pip} /> : (PIPS[face] ?? []).map(([x, y], i) => <Circle key={i} cx={x * 9 + 2} cy={y * 9 + 2} r={3.6} fill={pip} />)}
    </Svg>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, backgroundColor: colors.surface },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', padding: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
  stepBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
});
