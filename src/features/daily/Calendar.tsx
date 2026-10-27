import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { IconButton } from '@/src/components/ui/Button';
import { Check, ChevronLeft, ChevronRight } from '@/src/components/ui/icons';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { DAY_STATE_LABEL, type DayState } from './day-state';
import { type Day, type Month, WEEKDAY_SHORT, dayLabel, monthGrid, monthLabel, sameDay } from './dates';

/**
 * A compact month grid (Monday first). Each day shows its state — completed, today's challenge, missed, nothing
 * published, or not released yet — with shape and colour together (a check, a filled day, a dot, faint text), so the
 * states read without relying on colour alone; every cell also says its state to screen readers.
 */
export function MonthCalendar({
  month,
  today,
  selected,
  stateOf,
  onSelect,
  onPrev,
  onNext,
  canNext,
}: {
  month: Month;
  today: Day;
  selected: Day | null;
  /** Null while the month is loading: days render without states. */
  stateOf: ((d: Day) => DayState) | null;
  onSelect: (d: Day) => void;
  onPrev: () => void;
  onNext: () => void;
  canNext: boolean;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.nav}>
        <IconButton icon={ChevronLeft} label="Previous month" onPress={onPrev} />
        <AppText variant="bodyStrong" align="center" style={{ flex: 1 }} accessibilityRole="header" accessibilityLiveRegion="polite">
          {monthLabel(month)}
        </AppText>
        {canNext ? <IconButton icon={ChevronRight} label="Next month" onPress={onNext} /> : <View style={{ width: 44 }} />}
      </View>
      <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {WEEKDAY_SHORT.map((w) => (
          <AppText key={w} variant="caption" color={colors.textFaint} align="center" style={styles.cellBox}>
            {w.slice(0, 1)}
          </AppText>
        ))}
      </View>
      {monthGrid(month).map((week, i) => (
        <View key={i} style={styles.row}>
          {week.map((d, j) =>
            d ? (
              <DayCell key={j} day={d} today={today} state={stateOf ? stateOf(d) : null} selected={!!selected && sameDay(selected, d)} onSelect={onSelect} />
            ) : (
              <View key={j} style={styles.cellBox} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function DayCell({ day, today, state, selected, onSelect }: { day: Day; today: Day; state: DayState | null; selected: boolean; onSelect: (d: Day) => void }) {
  const isToday = sameDay(day, today);
  const future = state === 'future';
  const fill = state === 'completed' ? colors.successSoft : state === 'today' ? colors.primary : 'transparent';
  const fg =
    state === 'today' ? '#fff' : state === 'completed' ? colors.success : state === 'missed' ? colors.text : future || state === 'none' ? colors.textFaint : colors.textBody;
  return (
    <View style={styles.cellBox}>
      <Pressable
        onPress={() => {
          haptic.select();
          onSelect(day);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: future }}
        accessibilityLabel={`${dayLabel(day, today)}${isToday ? ', today' : ''}. ${state ? DAY_STATE_LABEL[state] : 'Loading'}.`}
        style={({ pressed }) => [
          styles.cell,
          { backgroundColor: fill },
          isToday && state !== 'today' && styles.todayRing,
          selected && styles.selected,
          pressed && state !== 'today' && { backgroundColor: colors.surfaceHigh },
        ]}>
        <AppText variant="small" weight={isToday || state === 'today' || state === 'missed' ? 'semibold' : 'regular'} color={fg} tabular style={future ? { opacity: 0.55 } : undefined}>
          {day.d}
        </AppText>
        <View style={styles.marker}>
          {state === 'completed' ? <Check size={10} color={colors.success} strokeWidth={3} /> : state === 'missed' ? <View style={styles.missedDot} /> : null}
        </View>
      </Pressable>
    </View>
  );
}

/** The key to the calendar's day states. */
export function CalendarLegend() {
  const items: { label: string; swatch: ReactNode }[] = [
    { label: 'Completed', swatch: <View style={[styles.swatch, { backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' }]}><Check size={9} color={colors.success} strokeWidth={3} /></View> },
    { label: 'Today', swatch: <View style={[styles.swatch, { backgroundColor: colors.primary }]} /> },
    { label: 'Missed', swatch: <View style={[styles.swatch, { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 }]}><View style={styles.missedDot} /></View> },
    { label: 'No challenge', swatch: <View style={[styles.swatch, { alignItems: 'center', justifyContent: 'center' }]}><AppText variant="caption" color={colors.textFaint}>·</AppText></View> },
  ];
  return (
    <View style={styles.legend} accessibilityLabel="Key: completed days have a check, today’s open challenge is filled blue, missed days have an orange dot, faint days had no challenge.">
      {items.map((i) => (
        <View key={i.label} style={styles.legendItem} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {i.swatch}
          <AppText variant="caption" color={colors.textMuted}>
            {i.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row' },
  cellBox: { flex: 1, alignItems: 'center' },
  cell: {
    width: '100%',
    maxWidth: 46,
    aspectRatio: 1,
    minHeight: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  todayRing: { borderColor: colors.primaryText },
  selected: { borderColor: colors.insight },
  marker: { height: 10, alignItems: 'center', justifyContent: 'center' },
  missedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rival },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  swatch: { width: 16, height: 16, borderRadius: 5, borderWidth: 1, borderColor: colors.border },
});
