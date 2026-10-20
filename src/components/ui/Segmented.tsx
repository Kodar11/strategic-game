import { Pressable, StyleSheet, View } from 'react-native';

import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { AppText } from './AppText';

/** Compact segmented toggle for experiments (e.g. "what if FoodKart maintains?"). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  tone = 'blue',
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  tone?: 'blue' | 'orange';
}) {
  const accent = tone === 'blue' ? colors.primary : colors.rival;
  return (
    <View style={{ gap: space.xs }}>
      {label ? (
        <AppText variant="caption" color={colors.textMuted}>
          {label}
        </AppText>
      ) : null}
      <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => {
                if (!on) haptic.select();
                onChange(o.value);
              }}
              style={[styles.seg, on && { backgroundColor: accent }]}>
              <AppText variant="small" weight="semibold" color={on ? '#fff' : colors.textMuted} align="center">
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.bgRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    gap: 3,
  },
  seg: { flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
});
