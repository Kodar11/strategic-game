import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useIsGuest } from '@/src/components/auth/SignInRequired';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ArrowRight, CalendarDays } from '@/src/components/ui/icons';
import { dailyRepo } from '@/src/data/daily-session';
import { DIFFICULTY_NAME } from '@/src/features/daily/content';
import { dayLabel, formatDay } from '@/src/features/daily/dates';
import { ScreenShell, shellStyles } from '@/src/features/competition/ScreenShell';
import { usePaged } from '@/src/features/competition/usePaged';
import { colors, space } from '@/src/theme/tokens';

const RESULT: Record<string, { label: string; tone: 'success' | 'amber' | 'neutral' }> = {
  correct: { label: 'Correct', tone: 'success' },
  partial: { label: 'Partly right', tone: 'amber' },
  reasonable: { label: 'Taken part', tone: 'neutral' },
  misconception: { label: 'Missed it', tone: 'neutral' },
};

/**
 * Every past Daily Challenge, newest first, 20 at a time: its concept, how many took part and your official result.
 * Each opens for review and practice — practice never changes a recorded result or reopens a past day.
 */
export default function DailyHistoryScreen() {
  const guest = useIsGuest();
  const { items, next, error, loading, load } = usePaged((before: string | null) => dailyRepo.history(before ?? undefined));

  return (
    <ScreenShell title="Past challenges" onRefresh={() => load(null)} fallback="/">
      {!items ? (
        error ? (
          <View style={{ gap: space.md, alignItems: 'flex-start' }}>
            <AppText color={colors.textBody}>{error}</AppText>
            <Button label="Try again" variant="secondary" compact onPress={() => load(null)} />
          </View>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} accessibilityLabel="Loading" />
        )
      ) : !items.length ? (
        <EmptyState icon={CalendarDays} text="No past challenges yet. Each day’s challenge stays here for review." />
      ) : (
        <View style={{ gap: space.sm }}>
          {items.map((c) => {
            const r = c.mine ? RESULT[c.mine.evaluation] : null;
            return (
              <Pressable
                key={c.id}
                onPress={() => (guest ? router.push('/sign-in') : router.push({ pathname: '/daily/play', params: { date: formatDay(c.date) } }))}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(c.date)}: ${c.title}.${c.concept ? ` ${c.concept}.` : ''} ${c.mine ? `Your result: ${r?.label}${c.mine.rank ? `, rank ${c.mine.rank} of ${c.participants}` : ''}.` : 'Not answered.'} Open to review or practise.`}
                style={({ pressed }) => [shellStyles.card, { flexDirection: 'row', alignItems: 'center', gap: space.md }, pressed && { backgroundColor: colors.surfaceHigh }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="caption" color={colors.textMuted}>
                    {dayLabel(c.date)} · {c.participants} {c.participants === 1 ? 'player' : 'players'}
                  </AppText>
                  <AppText variant="small" weight="semibold" numberOfLines={2}>
                    {c.title}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
                    {c.concept ? <Badge label={c.concept} tone="cyan" /> : null}
                    <Badge label={DIFFICULTY_NAME[c.difficulty as 1 | 2 | 3] ?? 'Medium'} />
                    {r ? <Badge label={`${r.label}${c.mine?.rank ? ` · ${c.mine.rank}/${c.participants}` : ''}`} tone={r.tone} /> : <Badge label="Not answered" />}
                  </View>
                </View>
                <ArrowRight size={16} color={colors.textMuted} />
              </Pressable>
            );
          })}
          {error ? <AppText color={colors.danger}>{error}</AppText> : null}
          {next ? <Button label={loading ? 'Loading…' : 'Show older challenges'} variant="secondary" compact disabled={loading} onPress={() => load(next)} /> : null}
        </View>
      )}
    </ScreenShell>
  );
}
