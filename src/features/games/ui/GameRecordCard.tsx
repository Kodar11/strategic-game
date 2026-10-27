import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ArrowRight, Gamepad2, ListOrdered, Pencil } from '@/src/components/ui/icons';
import type { MyGames } from '@/src/data/games';
import { useGames } from '@/src/data/games-session';
import { DIFFICULTY_LABEL, GAMES, personality } from '@/src/games/catalog';
import { ordinal } from '@/src/games/competition';
import { colors, space } from '@/src/theme/tokens';

const OUTCOME = { win: 'Won', loss: 'Lost', draw: 'Drew' } as const;

/**
 * The player's game record at the foot of the Thinking Profile: competitive standing, last weekly result and recent
 * games. Visually secondary to, and kept apart from, the learning measures — points come from weekly placings, not from reasoning in lessons —
 * and it draws no conclusions about strengths from a handful of matches.
 */
export function GameRecordCard() {
  const mine = useGames((s) => s.mine);
  const loadMine = useGames((s) => s.loadMine);
  useFocusEffect(
    useCallback(() => {
      void loadMine();
    }, [loadMine]),
  );

  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Gamepad2 size={16} color={colors.textMuted} />
        <SectionLabel>Games · competitive record</SectionLabel>
      </View>
      <AppText variant="caption" color={colors.textMuted}>
        Separate from your learning profile: points come from Game of the Week placings, not lesson answers.
      </AppText>

      {mine.status === 'loading' || mine.status === 'idle' ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your game record" />
      ) : mine.status === 'error' ? (
        <View style={{ gap: space.sm }}>
          <AppText variant="small" color={colors.textMuted}>
            {mine.error.message}
          </AppText>
          <Button label="Try again" variant="secondary" compact onPress={() => void loadMine({ force: true })} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : (
        <Record data={mine.data} />
      )}
    </Card>
  );
}

function Record({ data }: { data: MyGames }) {
  const recent = [
    ...data.practice.map((p) => ({ ...p, kind: 'practice' as const, at: p.playedAt })),
    ...data.matches.map((m) => ({ ...m, kind: m.kind, at: m.completedAt ?? 0 })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 3);
  const lastWeek = data.weeks[0];
  const practice = data.practice;
  const wins = practice.filter((p) => p.outcome === 'win').length;

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
          Public name: <AppText variant="small" weight="semibold">{data.nickname ?? 'not set — you appear as “Anonymous player”'}</AppText>
        </AppText>
        <Button label={data.nickname ? 'Change' : 'Set'} variant="ghost" compact icon={Pencil} iconPosition="left" onPress={() => router.push('/nickname')} />
      </View>

      {data.standing ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }} accessible accessibilityLabel={`Global rank ${data.standing.rank} of ${data.standing.players}. ${data.standing.points} points. ${data.standing.wins} weekly wins in ${data.standing.weeks} weeks.`}>
          <Stat label="Global rank" value={`#${data.standing.rank}`} sub={`of ${data.standing.players}`} />
          <Stat label="Points" value={String(data.standing.points)} sub={`${data.standing.weeks} week${data.standing.weeks === 1 ? '' : 's'}`} />
          <Stat label="Weekly wins" value={String(data.standing.wins)} />
        </View>
      ) : (
        <AppText variant="small" color={colors.textMuted}>
          No ranked weeks yet. Play the Game of the Week to appear on the global leaderboard.
        </AppText>
      )}

      {lastWeek ? (
        <AppText variant="small" color={colors.textBody}>
          Latest week: {GAMES[lastWeek.game].title} — {lastWeek.isWinner ? 'winner' : `${ordinal(lastWeek.rank)} of ${lastWeek.field}`}, +{lastWeek.points} points
        </AppText>
      ) : null}

      {recent.length ? (
        <View style={{ gap: 4 }}>
          <AppText variant="caption" color={colors.textMuted}>
            Recent games
          </AppText>
          {recent.map((r, i) => (
            <AppText key={i} variant="small" color={colors.textBody}>
              {r.outcome ? OUTCOME[r.outcome] : 'Played'} {GAMES[r.game].title} vs {personality(r.game, r.bot)?.name ?? r.bot} ({DIFFICULTY_LABEL[r.difficulty]}) · {r.playerScore}–{r.botScore}
              {r.kind !== 'practice' ? (r.kind === 'competition' ? ' · weekly' : ' · challenge') : ''}
            </AppText>
          ))}
          {practice.length >= 5 ? (
            <AppText variant="caption" color={colors.textMuted}>
              Practice: {wins} wins in your last {practice.length} games. A record, not a verdict — a few games can be luck.
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Button label="Leaderboards" variant="secondary" compact icon={ListOrdered} iconPosition="left" onPress={() => router.push('/leaderboard')} />
        <Button label="Games" variant="ghost" compact icon={ArrowRight} onPress={() => router.navigate('/games')} />
      </View>
    </View>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" tabular>
        {value}
        {sub ? (
          <AppText variant="caption" color={colors.textMuted}>
            {' '}
            {sub}
          </AppText>
        ) : null}
      </AppText>
    </View>
  );
}


