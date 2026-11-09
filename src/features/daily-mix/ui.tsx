import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { IconButton } from '@/src/components/ui/Button';
import { ArrowLeft, Check, X } from '@/src/components/ui/icons';
import type { RushQuestion } from '@/src/daily-mix/rush';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

/** A full-screen Daily page: back button, title, scrolling column. */
export function DailyFrame({ title, overline, right, children }: { title: string; overline?: string; right?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.1} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={styles.head}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <View style={{ flex: 1 }}>
              {overline ? (
                <AppText variant="overline" color={colors.insight}>
                  {overline}
                </AppText>
              ) : null}
              <AppText variant="title" accessibilityRole="header">
                {title}
              </AppText>
            </View>
            {right}
          </View>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

/** A tappable answer. `state` colours it after the answer: right (green), wrong pick (orange), or neutral. */
export function OptionButton({ label, onPress, state = 'idle', disabled, selected }: { label: string; onPress: () => void; state?: 'idle' | 'right' | 'wrong'; disabled?: boolean; selected?: boolean }) {
  const tone = state === 'right' ? { bg: colors.successSoft, border: 'rgba(74,222,128,0.6)', fg: colors.success } : state === 'wrong' ? { bg: colors.rivalSoft, border: 'rgba(249,115,22,0.6)', fg: colors.rivalText } : selected ? { bg: colors.primarySoft, border: colors.primary, fg: colors.text } : { bg: colors.surface, border: colors.border, fg: colors.text };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      accessibilityLabel={`${label}${state === 'right' ? ', correct' : state === 'wrong' ? ', not this one' : ''}`}
      style={({ pressed }) => [styles.option, { backgroundColor: tone.bg, borderColor: tone.border }, pressed && !disabled && { opacity: 0.85 }]}>
      <AppText variant="bodyStrong" color={tone.fg} style={{ flex: 1 }}>
        {label}
      </AppText>
      {state === 'right' ? <Check size={18} color={colors.success} strokeWidth={2.6} /> : state === 'wrong' ? <X size={18} color={colors.rivalText} strokeWidth={2.6} /> : null}
    </Pressable>
  );
}

/** A small payoff table: your points in blue, theirs (when shown) in orange — the app's colour code for the two sides. */
export function PayoffTable({ table }: { table: NonNullable<RushQuestion['table']> }) {
  const both = table.cells[0][0].length > 1;
  return (
    <View style={styles.table} accessible accessibilityLabel={table.rows.map((r, i) => `${r}: ${table.cols.map((c, j) => `against ${c}, ${both ? `you ${table.cells[i][j][0]}, them ${table.cells[i][j][1]}` : table.cells[i][j][0]}`).join('; ')}`).join('. ')}>
      <View style={styles.tr}>
        <View style={styles.th} />
        {table.cols.map((c) => (
          <View key={c} style={styles.th}>
            <AppText variant="caption" color={colors.rivalText}>
              {c}
            </AppText>
          </View>
        ))}
      </View>
      {table.rows.map((r, i) => (
        <View key={r} style={styles.tr}>
          <View style={styles.th}>
            <AppText variant="caption" color={colors.primaryText}>
              {r}
            </AppText>
          </View>
          {table.cols.map((c, j) => (
            <View key={c} style={styles.td}>
              <AppText variant="bodyStrong" color={colors.primaryText} tabular>
                {table.cells[i][j][0]}
              </AppText>
              {both ? (
                <AppText variant="bodyStrong" color={colors.rivalText} tabular>
                  , {table.cells[i][j][1]}
                </AppText>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** A horizontal bar per answer; the winning ones in amber, yours outlined. */
export function CrowdBars({ bars }: { bars: { label: string; count: number; winning: boolean; mine: boolean }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <View style={{ gap: 6 }}>
      {bars.map((b) => (
        <View key={b.label} style={styles.barRow} accessible accessibilityLabel={`${b.label}: ${b.count}${b.winning ? ', winning' : ''}${b.mine ? ', your answer' : ''}`}>
          <AppText variant="caption" color={b.mine ? colors.text : colors.textMuted} style={{ width: 96 }} numberOfLines={1}>
            {b.label}
          </AppText>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { width: `${(b.count / max) * 100}%`, backgroundColor: b.winning ? colors.insight : colors.surfaceHigh }, b.mine && styles.barMine]} />
          </View>
          <AppText variant="caption" color={colors.textMuted} style={{ width: 36, textAlign: 'right' }} tabular>
            {b.count}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.md, borderWidth: 1 },
  table: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.bgRaised },
  tr: { flexDirection: 'row' },
  th: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', padding: space.xs },
  td: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderLeftWidth: 1, borderColor: colors.border, padding: space.xs },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.bgRaised, overflow: 'hidden' },
  bar: { height: 14, borderRadius: 7, minWidth: 2 },
  barMine: { borderWidth: 2, borderColor: colors.primaryText },
});
