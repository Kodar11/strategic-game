import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { History, Medal } from '@/src/components/ui/icons';
import { dailyRepo } from '@/src/data/daily-session';
import { DIFFICULTY_NAME, type DailyBoard } from '@/src/features/daily/content';
import { dayLabel, parseDay } from '@/src/features/daily/dates';
import { RemoteView, ScreenShell, shellStyles } from '@/src/features/competition/ScreenShell';
import { useRemote } from '@/src/features/competition/useRemote';
import { colors, space } from '@/src/theme/tokens';

const ANON = 'Anonymous player';

/**
 * One day's Daily Challenge leaderboard, from official answers only (practice is never recorded): score, then
 * calibration, then who answered first. Nicknames only. Today by default; `?date=YYYY-MM-DD` for a past day.
 */
export default function DailyLeaderboardScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const [state, reload] = useRemote(() => dailyRepo.leaderboard(date && parseDay(date) ? date : undefined), date ?? "today");
  return (
    <ScreenShell title="Daily leaderboard" onRefresh={reload} fallback="/">
      <RemoteView state={state} onRetry={reload}>
        {(d) => <Board d={d} />}
      </RemoteView>
      <Button label="Past challenges" variant="ghost" compact icon={History} iconPosition="left" onPress={() => router.push('/daily/history')} style={{ alignSelf: 'center' }} />
    </ScreenShell>
  );
}

function Board({ d }: { d: DailyBoard }) {
  const isToday = d.date.y === d.today.y && d.date.m === d.today.m && d.date.d === d.today.d;
  if (!d.challenge) return <AppText color={colors.textMuted}>No challenge was published for {dayLabel(d.date)}.</AppText>;
  const meShown = d.entries.some((e) => e.isMe);
  return (
    <View style={{ gap: space.md }}>
      <View style={shellStyles.card}>
        <AppText variant="caption" color={colors.insight}>
          {isToday ? 'Today' : dayLabel(d.date)} · {d.participants} {d.participants === 1 ? 'player' : 'players'}
        </AppText>
        <AppText variant="bodyStrong">{d.challenge.title}</AppText>
        <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
          <Badge label={DIFFICULTY_NAME[d.challenge.difficulty as 1 | 2 | 3] ?? 'Medium'} />
          <Badge label={d.status === 'completed' ? 'You’ve answered' : d.status === 'signed_out' ? 'Sign in to take part' : isToday ? 'Not answered yet' : 'Not answered'} tone={d.status === 'completed' ? 'success' : 'neutral'} />
        </View>
        {!d.challenge.scored ? (
          <AppText variant="small" color={colors.textBody}>
            This challenge has no single right answer, so it isn’t ranked — everyone who took part is listed.
          </AppText>
        ) : (
          <AppText variant="caption" color={colors.textMuted}>
            Ranked by score, then calibration (how well confidence matched the result), then who answered first.
          </AppText>
        )}
      </View>
      {d.me ? (
        <View style={[shellStyles.card, { borderColor: colors.primary }]}>
          <AppText variant="caption" color={colors.textMuted}>
            Your result
          </AppText>
          <AppText variant="bodyStrong">
            {d.me.rank ? `${d.me.rank} of ${d.participants}` : 'Taken part'}
            {d.me.score !== null ? ` · score ${d.me.score}` : ''}
            {d.me.calibration !== null ? ` · calibration ${d.me.calibration}` : ''}
          </AppText>
        </View>
      ) : isToday && d.status === 'not_attempted' ? (
        <Button label="Take today’s challenge" onPress={() => router.push('/daily')} />
      ) : null}
      {d.entries.length ? (
        <View style={{ gap: space.xs }}>
          {d.entries.map((e, i) => (
            <Row key={i} e={e} />
          ))}
          {d.me && !meShown ? (
            <>
              <AppText variant="caption" color={colors.textFaint} align="center">
                ···
              </AppText>
              <Row e={d.me} />
            </>
          ) : null}
        </View>
      ) : (
        <AppText color={colors.textMuted}>{isToday ? 'Nobody has answered yet today. Be the first.' : 'Nobody answered this one.'}</AppText>
      )}
    </View>
  );
}

function Row({ e }: { e: DailyBoard['entries'][number] }) {
  const name = e.nickname ?? ANON;
  const medal = e.rank === 1 ? colors.insight : e.rank === 2 ? colors.textBody : e.rank === 3 ? colors.rivalText : null;
  return (
    <View style={[shellStyles.row, e.rank === 1 && shellStyles.rowLeader, e.isMe && shellStyles.rowMe]} accessible accessibilityLabel={`${e.rank ? `Rank ${e.rank}` : 'Taken part'}: ${name}${e.isMe ? ' (you)' : ''}${e.score !== null ? `, score ${e.score}` : ''}${e.calibration !== null ? `, calibration ${e.calibration}` : ''}.`}>
      <View style={{ width: 36, alignItems: 'center' }}>
        {medal ? <Medal size={16} color={medal} /> : null}
        <AppText variant="small" weight="semibold" tabular color={colors.textMuted}>
          {e.rank ?? '–'}
        </AppText>
      </View>
      <AppText variant="small" weight={e.isMe ? 'semibold' : 'regular'} style={{ flex: 1 }} numberOfLines={1}>
        {name}
        {e.isMe ? ' (you)' : ''}
      </AppText>
      {e.calibration !== null ? (
        <AppText variant="caption" color={colors.textMuted} tabular>
          cal {e.calibration}
        </AppText>
      ) : null}
      <AppText variant="bodyStrong" tabular style={{ minWidth: 36, textAlign: 'right' }}>
        {e.score ?? '✓'}
      </AppText>
    </View>
  );
}
