import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useIsGuest } from '@/src/components/auth/SignInRequired';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { ArrowRight, CalendarDays, CircleCheck, type LucideIcon, Users, Zap } from '@/src/components/ui/icons';
import { useDaily } from '@/src/data/daily-session';
import { crowdQuestionFor, dailyFormat, FORMAT_LINE, FORMAT_NAME, isCrowdDay } from '@/src/daily-mix/schedule';
import { useDailyMix } from '@/src/features/daily-mix/store';
import { colors, radius, space } from '@/src/theme/tokens';
import { DIFFICULTY_NAME } from './content';
import { addMonths, dayNumber, formatDay, fromDayNumber, monthKey, monthOf } from './dates';
import { streakFrom } from './streak';

/**
 * Today's Daily on Home, in whichever format today is (src/daily-mix/schedule.ts): a published Daily Challenge, The
 * Crowd (Wednesdays and Sundays) or Read Rush (any other day). The streak counts days taken part in any format.
 * The challenge state comes from the server-backed daily store; Crowd and Rush days from the device.
 */
export function DailyRow() {
  const today = useDaily((s) => s.today);
  const month = useDaily((s) => s.months[monthKey(monthOf(s.today))]);
  const guest = useIsGuest();
  const mixDays = useDailyMix((s) => s.days);
  const loadMix = useDailyMix((s) => s.load);
  const loadMonth = useDaily((s) => s.loadMonth);
  useEffect(() => {
    void loadMix();
  }, [loadMix]);
  useFocusEffect(
    useCallback(() => {
      if (!guest) {
        void loadMonth(monthOf(today));
        // The streak can run back across the 1st, so last month is needed too.
        void loadMonth(addMonths(monthOf(today), -1));
      }
    }, [guest, loadMonth, today]),
  );

  const data = month?.status === 'ready' && !guest ? month.data : null;
  const key = formatDay(today);
  const published = data ? !!data.entries.get(key) || !!data.attempts.get(key) : null;
  const format = dailyFormat(today, published);
  const yesterday = fromDayNumber(dayNumber(today) - 1);
  const yKey = formatDay(yesterday);
  const crowdYesterday = isCrowdDay(yesterday) && mixDays[yKey]?.format === 'crowd' ? yKey : null;

  return (
    <View style={{ gap: space.sm }}>
      {format === 'challenge' ? <ChallengeRow /> : <MixRow format={format} />}
      {crowdYesterday ? (
        <Pressable onPress={() => router.push({ pathname: '/daily/crowd', params: { day: crowdYesterday } })} accessibilityRole="button" accessibilityLabel="Yesterday's crowd result is in. Open it." style={({ pressed }) => [styles.note, pressed && { opacity: 0.85 }]}>
          <Users size={16} color={colors.insight} />
          <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
            Yesterday’s crowd result is in: <AppText variant="small" weight="semibold" color={colors.text}>{crowdQuestionFor(yesterday).title}</AppText>
          </AppText>
          <ArrowRight size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** The streak of days taken part in any Daily format, from the server's attempts and the device's Rush/Crowd days. */
function useAnyDailyStreak(): number {
  const today = useDaily((s) => s.today);
  const month = useDaily((s) => s.months[monthKey(monthOf(s.today))]);
  const previous = useDaily((s) => s.months[monthKey(addMonths(monthOf(s.today), -1))]);
  const mixDays = useDailyMix((s) => s.days);
  const guest = useIsGuest();
  const data = month?.status === 'ready' && !guest ? month.data : null;
  const before = previous?.status === 'ready' && !guest ? previous.data : null;
  return streakFrom(today, (d) => !!mixDays[formatDay(d)] || ((d.m === today.m && d.y === today.y ? data : before)?.attempts.has(formatDay(d)) ?? false));
}

const MIX_ICON: Record<'crowd' | 'rush', LucideIcon> = { crowd: Users, rush: Zap };

/** A Crowd or Read Rush day. Works for guests and offline: Rush is generated on the device. */
function MixRow({ format }: { format: 'crowd' | 'rush' }) {
  const today = useDaily((s) => s.today);
  const done = useDailyMix((s) => s.days[formatDay(today)]);
  const streak = useAnyDailyStreak();
  const Icon = MIX_ICON[format];
  const title = format === 'crowd' ? crowdQuestionFor(today).title : 'Read the bots, beat the clock';
  const status = done ? (done.format === 'rush' ? `Done · ${done.score} right` : 'Answered · results tomorrow') : format === 'crowd' ? 'Answer once · results tomorrow' : 'Start today’s run';
  return (
    <Pressable
      onPress={() => router.push(format === 'crowd' ? '/daily/crowd' : '/daily/rush')}
      accessibilityRole="button"
      accessibilityLabel={`Today's Daily: ${FORMAT_NAME[format]}. ${title}. ${status}.${streak > 1 ? ` ${streak}-day streak.` : ''}`}
      style={({ pressed }) => [styles.card, { gap: space.sm }, pressed && { opacity: 0.85 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={styles.icon}>
          <Icon size={18} color={colors.insight} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="overline" color={colors.insight}>
            {FORMAT_NAME[format]}
            {streak > 1 ? ` · ${streak}-day streak` : ''}
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {title}
          </AppText>
        </View>
        {done ? <CircleCheck size={20} color={colors.success} strokeWidth={2.4} /> : <ArrowRight size={18} color={colors.textMuted} />}
      </View>
      {!done ? (
        <AppText variant="small" color={colors.textBody} numberOfLines={2}>
          {FORMAT_LINE[format]}
        </AppText>
      ) : null}
      <AppText variant="caption" color={done ? colors.success : colors.insight}>
        {status}
      </AppText>
    </Pressable>
  );
}

/** A published Daily Challenge day (the original row). */
function ChallengeRow() {
  const today = useDaily((s) => s.today);
  const month = useDaily((s) => s.months[monthKey(monthOf(s.today))]);
  const guest = useIsGuest();

  const data = month?.status === 'ready' && !guest ? month.data : null;
  const attempt = data?.attempts.get(formatDay(today)) ?? null;
  const entry = data?.entries.get(formatDay(today));
  const challenge = entry?.ok ? entry.challenge : null;
  const answered = !!attempt;
  const open = !answered && !!challenge;
  const streak = useAnyDailyStreak();
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

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.insightSoft },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.surface },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.insightSoft, alignItems: 'center', justifyContent: 'center' },
});
