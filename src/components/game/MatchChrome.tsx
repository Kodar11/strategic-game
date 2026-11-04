import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { IconButton } from '@/src/components/ui/Button';
import { ArrowLeft } from '@/src/components/ui/icons';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';

/** The top of every match: back, the game, where the match stands. One row, so the game itself starts high on a phone. */
export function MatchHeader({ title, meta, progress, backLabel = 'Back', onBack, right }: { title: string; meta: string; progress?: string; backLabel?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <IconButton icon={ArrowLeft} label={backLabel} onPress={onBack} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="bodyStrong" accessibilityRole="header" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
          {meta}
        </AppText>
      </View>
      {right}
      {progress ? (
        <AppText variant="small" weight="semibold" tabular color={colors.textBody} accessibilityLabel={progress}>
          {progress}
        </AppText>
      ) : null}
    </View>
  );
}

/** "You 14 · Rival 9" in one row: blue for you, orange for the other side. */
export function ScoreLine({ you, rival, rivalName, unit, label }: { you: number | string; rival: number | string; rivalName: string; unit?: string; label?: string }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label ? `${label}. ` : ''}You ${you}${unit ? ` ${unit}` : ''}, ${rivalName} ${rival}.`}>
      <View style={[styles.mark, { backgroundColor: colors.primary }]} />
      <AppText variant="caption" color={colors.primaryText}>
        You
      </AppText>
      <AppText variant="heading" tabular>
        {you}
      </AppText>
      <View style={{ flex: 1 }} />
      <AppText variant="heading" tabular>
        {rival}
      </AppText>
      <AppText variant="caption" color={colors.rivalText} numberOfLines={1} style={{ maxWidth: 150 }}>
        {rivalName.replace(/^The /, '')}
      </AppText>
      <View style={[styles.mark, { backgroundColor: colors.rival }]} />
    </View>
  );
}

/** A decision tile: label, optional consequence line and icon. Row layout when `compact`. Used by every simple choice. */
export function ChoiceTile({ label, hint, icon, tint, bg, onPress, disabled, selected, compact, a11y }: { label: string; hint?: string; icon?: ReactNode; tint: string; bg: string; onPress: () => void; disabled?: boolean; selected?: boolean; compact?: boolean; a11y?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? (hint ? `${label}. ${hint}` : label)}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={() => {
        haptic.commit();
        onPress();
      }}
      style={({ pressed }) => [compact ? styles.tileRow : styles.tile, { borderColor: selected ? tint : colors.borderStrong }, (pressed || selected) && { backgroundColor: bg }, disabled && { opacity: 0.45 }]}>
      {icon ? <View style={[compact ? styles.tileIconRow : styles.tileIcon, { backgroundColor: bg }]}>{icon}</View> : null}
      <View style={compact ? { flex: 1, gap: 1 } : { alignItems: 'center', gap: 2 }}>
        <AppText variant="bodyStrong" align={compact ? 'left' : 'center'}>
          {label}
        </AppText>
        {hint ? (
          <AppText variant="caption" color={colors.textMuted} align={compact ? 'left' : 'center'}>
            {hint}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
  mark: { width: 8, height: 8, borderRadius: 4 },
  tile: { flex: 1, minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: space.xs, padding: space.sm, borderRadius: radius.lg, borderWidth: 1.5, backgroundColor: colors.surface },
  tileRow: { flex: 1, flexDirection: 'row', minHeight: 56, alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.md, borderWidth: 1.5, backgroundColor: colors.surface },
  tileIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tileIconRow: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
