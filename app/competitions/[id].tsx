import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Badge } from '@/src/components/ui/Card';
import { Crown, Medal } from '@/src/components/ui/icons';
import { competitionGame, configSummary } from '@/src/competition/catalog';
import type { CompetitionDetail } from '@/src/data/games';
import { gamesRepo } from '@/src/data/games-session';
import { ordinal, weekLabel } from '@/src/games/competition';
import { CompetitionArt } from '@/src/features/competition/CompetitionArt';
import { RemoteView, ScreenShell, shellStyles } from '@/src/features/competition/ScreenShell';
import { useRemote } from '@/src/features/competition/useRemote';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors, space } from '@/src/theme/tokens';

const ANON = 'Anonymous player';
const DECIDED: Record<string, string> = {
  score: 'Highest score of the week.',
  secondary: 'Level on score — decided by the game’s tie-break.',
  earliest: 'Level on score — reached it first.',
  unopposed: 'The only player to finish a ranked match.',
  shared: 'Level on every tie-break: the title is shared.',
};

/**
 * One Game of the Week, current or past. Once finalized: the champion announcement (a permanent record, with the
 * name as it was at the time), the final leaderboard and the caller's own result. Read-only.
 */
export default function CompetitionScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [state, reload] = useRemote(() => gamesRepo.competition(id ?? ""), id ?? "");
  return (
    <ScreenShell title="Game of the Week" onRefresh={reload}>
      <RemoteView state={state} onRetry={reload}>
        {(d) => <Detail d={d} />}
      </RemoteView>
    </ScreenShell>
  );
}

function Detail({ d }: { d: CompetitionDetail }) {
  const reduced = useMotionReduced();
  const c = d.competition;
  const g = competitionGame(c.game);
  const done = c.state === 'completed' || c.phase === 'finalized';
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <CompetitionArt game={c.game} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" color={colors.textMuted}>
            {c.number ? `Week #${c.number} · ` : ''}
            {weekLabel(c.startsAt, c.endsAt)}
          </AppText>
          <AppText variant="heading">{g.title}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {configSummary(c.game, c.bot, c.difficulty, c.config)} · {c.participants} player{c.participants === 1 ? '' : 's'}
          </AppText>
        </View>
      </View>

      {c.state === 'cancelled' ? (
        <AppText color={colors.textMuted}>This week was cancelled{c.cancelReason ? `: ${c.cancelReason}` : ''}. It has no champion and awarded no points.</AppText>
      ) : done ? (
        d.champions.length ? (
          <Animated.View entering={reduced ? undefined : ZoomIn.duration(320)} style={shellStyles.champion} accessible accessibilityLabel={`Champion${d.champions.length > 1 ? 's' : ''}: ${d.champions.map((w) => w.nickname ?? ANON).join(' and ')}, ${d.champions[0].scoreLabel ?? d.champions[0].score}.`}>
            <Crown size={32} color={colors.insight} />
            <AppText variant="overline" color={colors.insight}>
              {d.champions.length > 1 ? 'Shared champions' : 'Champion'}
            </AppText>
            {d.champions.map((w, i) => (
              <AppText key={i} variant="title" align="center" numberOfLines={2}>
                {w.nickname ?? ANON}
                {w.isMe ? ' (you!)' : ''}
              </AppText>
            ))}
            <Badge label={d.champions[0].scoreLabel ?? String(d.champions[0].score)} tone="amber" />
            <AppText variant="caption" color={colors.textMuted} align="center">
              {DECIDED[d.champions[0].decidedBy ?? 'score'] ?? ''}
              {d.champions[0].runnerUpScore !== null && d.champions[0].runnerUpScore !== undefined ? ` Runner-up scored ${d.champions[0].runnerUpScore}.` : ''}
            </AppText>
          </Animated.View>
        ) : (
          <AppText color={colors.textMuted}>Nobody finished a ranked match this week, so there is no champion.</AppText>
        )
      ) : (
        <AppText variant="small" color={colors.textMuted}>
          {c.state === 'finalizing' ? 'The week has ended; results are being finalized.' : c.state === 'scheduled' ? 'This week hasn’t started yet.' : 'Live standings — the week is still on.'}
        </AppText>
      )}

      {d.me ? (
        <View style={[shellStyles.card, { borderColor: colors.primary }]}>
          <AppText variant="caption" color={colors.textMuted}>
            Your result
          </AppText>
          <AppText variant="bodyStrong">
            {ordinal(d.me.rank)} of {c.participants} · best {d.me.scoreLabel ?? d.me.score}
            {d.me.attemptsUsed ? ` · ${d.me.attemptsUsed} ranked attempt${d.me.attemptsUsed === 1 ? '' : 's'}` : ''}
          </AppText>
        </View>
      ) : null}

      <View style={{ gap: space.xs }}>
        <AppText variant="overline" color={colors.textMuted}>
          {done ? 'Final leaderboard' : 'Leaderboard'}
        </AppText>
        {d.entries.length ? (
          d.entries.map((e, i) => (
            <View key={i} style={[shellStyles.row, e.rank === 1 && shellStyles.rowLeader, e.isMe && shellStyles.rowMe]} accessible accessibilityLabel={`Rank ${e.rank}: ${e.nickname ?? ANON}${e.isMe ? ' (you)' : ''}, ${e.scoreLabel ?? e.score}.`}>
              <View style={{ width: 36, alignItems: 'center' }}>
                {e.rank <= 3 ? <Medal size={16} color={e.rank === 1 ? colors.insight : e.rank === 2 ? colors.textBody : colors.rivalText} /> : null}
                <AppText variant="small" weight="semibold" tabular color={colors.textMuted}>
                  {e.rank}
                </AppText>
              </View>
              <AppText variant="small" weight={e.isMe ? 'semibold' : 'regular'} style={{ flex: 1 }} numberOfLines={1}>
                {e.nickname ?? ANON}
                {e.isMe ? ' (you)' : ''}
              </AppText>
              {e.points !== undefined ? (
                <AppText variant="caption" color={colors.textMuted} tabular>
                  +{e.points} pts
                </AppText>
              ) : null}
              <AppText variant="bodyStrong" tabular numberOfLines={1} style={{ maxWidth: 150, textAlign: 'right' }}>
                {e.scoreLabel ?? e.score}
              </AppText>
            </View>
          ))
        ) : (
          <AppText color={colors.textMuted}>No ranked results.</AppText>
        )}
      </View>
      <AppText variant="caption" color={colors.textFaint}>
        {g.scoring} Results are final once the week is finalized and are never recalculated.
      </AppText>
    </View>
  );
}
