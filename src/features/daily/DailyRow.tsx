import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useIsGuest } from '@/src/components/auth/SignInRequired';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { ArrowRight, CalendarDays, CircleCheck } from '@/src/components/ui/icons';
import { useDaily } from '@/src/data/daily-session';
import { colors, radius, space } from '@/src/theme/tokens';
import { DIFFICULTY_NAME } from './content';
import { type Day, dayNumber, formatDay, fromDayNumber, monthKey, monthOf } from './dates';

/**
 * Daily challenge entry point. Shows today's real state from the server-backed daily store (the same month cache the
 * Daily screen uses): open, answered, or nothing published, and the current streak of days taken part. While loading,
 * or if the server can't be reached, it only describes the feature — it never guesses a state.
 */
export function DailyRow() {
  const today = useDaily((s) => s.today);
  const loadMonth = useDaily((s) => s.loadMonth);
  const month = useDaily((s) => s.months[monthKey(monthOf(s.today))]);
  const guest = useIsGuest();

  useFocusEffect(
    useCallback(() => {
      if (!guest) void loadMonth(monthOf(today));
    }, [guest, loadMonth, today]),
  );

  const data = month?.status === 'ready' && !guest ? month.data : null;
  const attempt = data?.attempts.get(formatDay(today)) ?? null;
  const entry = data?.entries.get(formatDay(today));
  const challenge = entry?.ok ? entry.challenge : null;
  const answered = !!attempt;
  const open = !answered && !!challenge;
  const streak = data ? streakFrom(today, (d) => data.attempts.has(formatDay(d))) : 0;
  const status = guest ? 'One decision a day · sign in to take part' : !data ? 'One decision a day' : answered ? 'Completed today' : open ? 'Start today’s challenge' : 'No challenge today · past ones stay open';
  const scored = attempt && attempt.score !== null && attempt.score !== undefined;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => router.push('/daily')}
        accessibilityRole="button"
        accessibilityLabel={`Daily challenge. ${challenge ? `${challenge.title}. ` : ''}${status}.${streak > 1 ? ` ${streak}-day streak.` : ''}${scored ? ` Your score ${attempt!.score}.` : ''}`}
        style={({ pressed }) => [{ gap: space.sm }, pressed && { opacity: 0.85 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={styles.icon}>
            <CalendarDays size={18} color={colors.insight} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="overline" color={colors.insight}>
              Daily challenge{streak > 1 ? ` · ${streak}-day streak` : ''}
            </AppText>
            <AppText variant="bodyStrong" numberOfLines={2}>
              {challenge?.title ?? attempt?.result.title ?? 'One short strategic decision'}
            </AppText>
          </View>
          {answered ? <CircleCheck size={20} color={colors.success} strokeWidth={2.4} /> : <ArrowRight size={18} color={colors.textMuted} />}
        </View>
        {challenge && !answered ? (
          <AppText variant="small" color={colors.textBody} numberOfLines={2}>
            {challenge.intro}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
          {challenge ? <Badge label={DIFFICULTY_NAME[challenge.difficulty]} /> : null}
          {challenge ? <Badge label={`~${challenge.minutes ?? 2} min`} /> : null}
          {scored ? <Badge label={`Score ${attempt!.score}/100`} tone={attempt!.score === 100 ? 'success' : 'amber'} /> : answered ? <Badge label="Taken part" tone="success" /> : null}
          <AppText variant="caption" color={open ? colors.insight : answered ? colors.success : colors.textMuted} style={{ alignSelf: 'center' }}>
            {status}
          </AppText>
        </View>
      </Pressable>
      {data ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {answered ? <Button label="Explanation" variant="secondary" compact onPress={() => router.push({ pathname: '/daily/play', params: { date: formatDay(today) } })} style={{ flex: 1 }} /> : null}
          <Button label="Leaderboard" variant={answered ? 'secondary' : 'ghost'} compact onPress={() => router.push('/daily/leaderboard')} style={{ flex: 1 }} />
          <Button label="Past days" variant="ghost" compact onPress={() => router.push('/daily/history')} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Consecutive days taken part, ending today (or yesterday, when today isn't done yet). Counts within the loaded
 * month only, so a streak that started last month shows from the 1st: it never claims days it hasn't seen.
 */
function streakFrom(today: Day, took: (d: Day) => boolean): number {
  let k = dayNumber(today);
  if (!took(today)) k--;
  let n = 0;
  for (let day = fromDayNumber(k); day.m === today.m && day.y === today.y && took(day); day = fromDayNumber(--k)) n++;
  return n;
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.surface },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.insightSoft, alignItems: 'center', justifyContent: 'center' },
});
