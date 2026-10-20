import { Check, type LucideIcon } from '@/src/components/ui/icons';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { AppText } from './AppText';

export interface ChoiceCardProps {
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  tone?: 'blue' | 'orange';
  icon?: LucideIcon;
  disabled?: boolean;
  footer?: ReactNode;
  compact?: boolean;
}

/** A selectable option. Selection is shown by border, fill and a check mark — never colour alone. */
export function ChoiceCard({ title, description, selected, onSelect, tone = 'blue', icon: Icon, disabled, footer, compact }: ChoiceCardProps) {
  const accent = tone === 'blue' ? colors.primary : colors.rival;
  const soft = tone === 'blue' ? colors.primarySoft : colors.rivalSoft;

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(selected ? 1 : 0.985, { damping: 18, stiffness: 260 }) }],
  }));

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      disabled={disabled}
      onPress={() => {
        if (!selected) haptic.select();
        onSelect();
      }}
      style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}>
      <Animated.View style={[styles.card, compact && styles.compact, { backgroundColor: selected ? soft : colors.surface, borderColor: selected ? accent : colors.border }, animated]}>
        {compact ? (
          // Compact: one row — icon, text, tick — vertically centred.
          <View style={styles.compactRow}>
            {Icon ? (
              <View style={[styles.iconWrap, { backgroundColor: selected ? accent : colors.surfaceHigh }]}>
                <Icon size={18} color={colors.text} strokeWidth={2.2} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" color={colors.text}>
                {title}
              </AppText>
              {description ? (
                <AppText variant="small" color={colors.textMuted} style={{ marginTop: space.xs }}>
                  {description}
                </AppText>
              ) : null}
            </View>
            <View style={[styles.check, { marginLeft: 0 }, selected && { backgroundColor: accent, borderColor: accent }]}>
              {selected ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
            </View>
          </View>
        ) : (
          <>
            <View style={styles.header}>
              {Icon ? (
                <View style={[styles.iconWrap, { backgroundColor: selected ? accent : colors.surfaceHigh }]}>
                  <Icon size={18} color={colors.text} strokeWidth={2.2} />
                </View>
              ) : null}
              <View style={[styles.check, selected && { backgroundColor: accent, borderColor: accent }]}>
                {selected ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
              </View>
            </View>
            <AppText variant="bodyStrong" color={colors.text}>
              {title}
            </AppText>
            {description ? (
              <AppText variant="small" color={colors.textMuted} style={{ marginTop: space.xs }}>
                {description}
              </AppText>
            ) : null}
          </>
        )}
        {footer}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: space.lg,
    minHeight: 120,
    flex: 1,
  },
  compact: { minHeight: 0, padding: space.md },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
});
