import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Badge, Card } from '@/src/components/ui/Card';
import { ArrowLeft, ArrowRight, CalendarDays, CircleCheck, RefreshCw } from '@/src/components/ui/icons';
import { useDaily } from '@/src/data/daily-session';
import { CalendarLegend, MonthCalendar } from '@/src/features/daily/Calendar';
import { DAY_STATE_LABEL, type DayState, completionSummary, dayState } from '@/src/features/daily/day-state';
import type { DailyRange } from '@/src/features/daily/content';
import { type Day, type Month, addMonths, compareMonths, dayLabel, formatDay, monthKey, monthLabel, monthOf } from '@/src/features/daily/dates';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

const DIFFICULTY = { 1: 'Warm-up', 2: 'Standard', 3: 'Tricky' } as const;

function openDay(d: Day) {
  router.push({ pathname: '/daily/play', params: { date: formatDay(d) } });
}

/**
 * Daily Strategic Challenge: today's challenge up top, then a calendar of every day — completed, missed, no challenge
 * published, not released yet — and the selected day's details. Content and attempts come from Supabase; the
 * calendar refreshes whenever the screen comes back into view, so newly published challenges appear without a
 * release.
 */
export default function DailyScreen() {
  const insets = useSafeAreaInsets();
  const today = useDaily((s) => s.today);
  const months = useDaily((s) => s.months);
  const history = useDaily((s) => s.history);
  const loadMonth = useDaily((s) => s.loadMonth);
  const [month, setMonth] = useState<Month>(() => monthOf(today));
  const [selected, setSelected] = useState<Day>(today);

  useFocusEffect(
    useCallback(() => {
      void loadMonth(month);
      if (compareMonths(month, monthOf(today)) !== 0) void loadMonth(monthOf(today));
    }, [loadMonth, month, today]),
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const shown = months[monthKey(month)];
  const current = months[monthKey(monthOf(today))];
  const data: DailyRange | null = shown?.status === 'ready' ? shown.data : null;
  const stateOf = data ? (d: Day) => dayState(d, today, data.entries.get(formatDay(d)), data.attempts.get(formatDay(d))) : null;
  const summary = completionSummary(history ?? [], today);
  const canNext = compareMonths(month, monthOf(today)) < 0;
  const go = (n: number) => {
    const next = addMonths(month, n);
    setMonth(next);
    void loadMonth(next);
  };
  const monthChallenges = data ? data.entries.size : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          <View style={styles.head}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              Daily challenge
            </AppText>
            <IconButton
              icon={RefreshCw}
              label="Refresh the calendar"
              onPress={() => {
                void loadMonth(month, { force: true });
                if (compareMonths(month, monthOf(today)) !== 0) void loadMonth(monthOf(today), { force: true });
              }}
            />
          </View>
          <AppText variant="small" color={colors.textMuted}>
            One short strategic decision a day. Your first answer on the day is your official one; past challenges stay open for review and practice.
          </AppText>

          {history ? (
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              <Badge label={`${summary.total} completed`} tone="success" />
              {summary.streak > 1 ? <Badge label={`${summary.streak}-day run`} tone="amber" /> : null}
            </View>
          ) : null}

          <TodayCard today={today} state={current?.status === 'ready' ? current.data : null} loading={!current || current.status === 'loading'} failed={current?.status === 'error'} />

          <Card style={{ gap: space.md }}>
            <MonthCalendar
              month={month}
              today={today}
              selected={selected}
              stateOf={stateOf}
              onSelect={setSelected}
              onPrev={() => go(-1)}
              onNext={() => go(1)}
              canNext={canNext}
            />
            {!shown || shown.status === 'loading' ? (
              <View style={styles.inline}>
                <ActivityIndicator color={colors.primary} accessibilityLabel="Loading the calendar" />
              </View>
            ) : shown.status === 'error' ? (
              <View style={{ gap: space.sm }}>
                <AppText variant="small" color={colors.textBody}>
                  {shown.error.message}
                </AppText>
                <Button label="Try again" variant="secondary" compact icon={RefreshCw} iconPosition="left" onPress={() => void loadMonth(month, { force: true })} />
              </View>
            ) : monthChallenges === 0 ? (
              <AppText variant="caption" color={colors.textMuted}>
                No challenges were published in {monthLabel(month)}{compareMonths(month, monthOf(today)) === 0 ? ' so far' : ''}.
              </AppText>
            ) : null}
            <CalendarLegend />
          </Card>

          {stateOf ? <SelectedDay day={selected} today={today} state={stateOf(selected)} data={data!} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function TodayCard({ today, state, loading, failed }: { today: Day; state: DailyRange | null; loading: boolean; failed: boolean }) {
  if (loading || failed || !state) return null;
  const entry = state.entries.get(formatDay(today));
  const attempt = state.attempts.get(formatDay(today));
  if (!entry && !attempt) {
    return (
      <Card style={{ gap: space.xs }}>
        <AppText variant="overline" color={colors.textMuted}>
          Today · {dayLabel(today, today)}
        </AppText>
        <AppText variant="bodyStrong">No challenge today</AppText>
        <AppText variant="small" color={colors.textMuted}>
          Nothing was published for today. Earlier challenges below are open for review and practice.
        </AppText>
      </Card>
    );
  }
  const title = entry?.ok ? entry.challenge.title : attempt?.result.title ?? entry?.title ?? 'Today’s challenge';
  const meta = entry?.ok ? `${DIFFICULTY[entry.challenge.difficulty]} · a few minutes` : null;
  return (
    <Pressable
      onPress={() => openDay(today)}
      accessibilityRole="button"
      accessibilityLabel={`Today's challenge: ${title}. ${attempt ? 'Completed. Open your result.' : 'Not answered yet. Open it.'}`}
      style={({ pressed }) => [styles.today, attempt && styles.todayDone, pressed && { opacity: 0.9 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="caption" color={attempt ? colors.success : '#DBEAFE'}>
          {attempt ? 'Today’s challenge · done' : `Today’s challenge${meta ? ` · ${meta}` : ''}`}
        </AppText>
        <AppText variant="heading" color="#fff">
          {title}
        </AppText>
      </View>
      <View style={[styles.todayIcon, attempt && { backgroundColor: colors.successSoft }]}>
        {attempt ? <CircleCheck size={22} color={colors.success} strokeWidth={2.4} /> : <ArrowRight size={20} color={colors.primary} />}
      </View>
    </Pressable>
  );
}

function SelectedDay({ day, today, state, data }: { day: Day; today: Day; state: DayState; data: DailyRange }) {
  const entry = data.entries.get(formatDay(day));
  const attempt = data.attempts.get(formatDay(day));
  const title = entry?.ok ? entry.challenge.title : attempt?.result.title ?? entry?.title ?? null;
  const action: Partial<Record<DayState, string>> = { today: 'Open today’s challenge', completed: 'See your result', missed: 'Review and practise' };
  const body: Record<DayState, string> = {
    completed: attempt ? `Official answer recorded: ${attempt.result.answerLabel}.` : 'Official answer recorded.',
    today: 'Your first answer today is your official one.',
    missed: 'You didn’t answer this one on the day. You can still read it and practise — practice isn’t recorded.',
    none: 'No challenge was published for this day.',
    future: 'This day’s challenge hasn’t been released yet.',
  };
  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <CalendarDays size={16} color={colors.textMuted} />
        <AppText variant="overline" color={colors.textMuted} style={{ flex: 1 }}>
          {dayLabel(day, today)}
        </AppText>
        <Badge label={DAY_STATE_LABEL[state].split(' —')[0]} tone={state === 'completed' ? 'success' : state === 'today' ? 'blue' : state === 'missed' ? 'orange' : 'neutral'} />
      </View>
      {title ? <AppText variant="heading">{title}</AppText> : null}
      <AppText variant="small" color={colors.textBody}>
        {body[state]}
      </AppText>
      {action[state] ? <Button label={action[state]!} compact icon={ArrowRight} onPress={() => openDay(day)} style={{ alignSelf: 'flex-start' }} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inline: { paddingVertical: space.sm, alignItems: 'center' },
  today: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.primary, borderRadius: radius.xl, padding: space.lg },
  todayDone: { backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(74,222,128,0.35)' },
  todayIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
