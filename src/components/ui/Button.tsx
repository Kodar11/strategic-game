import type { LucideIcon } from '@/src/components/ui/icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, radius, space } from '@/src/theme/tokens';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  compact?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  icon: Icon,
  iconPosition = 'right',
  style,
  accessibilityHint,
  compact,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const bg =
    variant === 'primary' ? (disabled ? colors.surfaceHigh : colors.primary) : variant === 'secondary' ? colors.surface : 'transparent';
  const fg = disabled ? colors.textFaint : variant === 'ghost' ? colors.primaryText : colors.text;

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          scale.set(withSpring(0.97, { damping: 20, stiffness: 400 }));
        }}
        onPressOut={() => {
          scale.set(withSpring(1, { damping: 16, stiffness: 300 }));
        }}
        style={({ pressed }) => [
          styles.base,
          compact && styles.compact,
          { backgroundColor: bg },
          variant === 'secondary' && styles.secondary,
          pressed && !disabled && { backgroundColor: variant === 'primary' ? colors.primaryPressed : colors.surfaceHigh },
        ]}>
        <View style={styles.row}>
          {Icon && iconPosition === 'left' ? <Icon size={18} color={fg} strokeWidth={2.2} /> : null}
          <AppText variant="bodyStrong" color={fg}>
            {label}
          </AppText>
          {Icon && iconPosition === 'right' ? <Icon size={18} color={fg} strokeWidth={2.2} /> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.icon, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <Icon size={20} color={colors.textBody} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.lg,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.md },
  secondary: { borderWidth: 1, borderColor: colors.borderStrong },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
