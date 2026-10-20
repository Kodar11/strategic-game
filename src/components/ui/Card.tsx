import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, shadow, space } from '@/src/theme/tokens';
import { AppText } from './AppText';

export function Card({
  children,
  style,
  padded = true,
  elevated,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
}) {
  return <View style={[styles.card, padded && styles.padded, elevated && shadow.card, style]}>{children}</View>;
}

type Tone = 'neutral' | 'blue' | 'orange' | 'amber' | 'cyan' | 'success' | 'danger';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: 'rgba(148,163,184,0.14)', fg: colors.textBody },
  blue: { bg: colors.primarySoft, fg: colors.primaryText },
  orange: { bg: colors.rivalSoft, fg: colors.rivalText },
  amber: { bg: colors.insightSoft, fg: colors.insight },
  cyan: { bg: colors.accentSoft, fg: colors.accent },
  success: { bg: colors.successSoft, fg: colors.success },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

export function Badge({ label, tone = 'neutral', style }: { label: string; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      <AppText variant="caption" color={t.fg}>
        {label}
      </AppText>
    </View>
  );
}

export function SectionLabel({ children, color }: { children: string; color?: string }) {
  return (
    <AppText variant="overline" color={color ?? colors.textMuted} style={{ marginBottom: space.sm }}>
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  padded: { padding: space.lg },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
