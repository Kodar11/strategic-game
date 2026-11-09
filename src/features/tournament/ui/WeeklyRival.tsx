import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { ARENA } from '@/src/arena/catalog';
import { isArenaId } from '@/src/arena/core';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Swords } from '@/src/components/ui/icons';
import { useGames } from '@/src/data/games-session';
import { GAMES } from '@/src/games/catalog';
import { isGameId } from '@/src/games/core';
import { mainStages } from '@/src/tournament/progress';
import { colors, radius, space } from '@/src/theme/tokens';
import { rivalOf, useTournamentContent } from '../content';
import { Kicker, RivalMark, toneColors } from './parts';

/**
 * The Weekly Rival: this week's Game of the Week, presented as a rematch with the rival who plays that game in the
 * Tournament. The competition itself (one shared setup for everyone, ranked attempts, the weekly board) is the
 * existing Game of the Week on the server; this card only names it and opens it. Shown while a week is running;
 * nothing otherwise.
 */
export function WeeklyRival() {
  const overview = useGames((s) => s.overview);
  const loadOverview = useGames((s) => s.loadOverview);
  const { doc, season } = useTournamentContent();

  useFocusEffect(
    useCallback(() => {
      void loadOverview();
    }, [loadOverview]),
  );

  const c = overview.status === 'ready' ? overview.data.competition : null;
  if (!c || c.phase !== 'active') return null;

  // The rival who plays this game in the bracket (the first stage that uses it); the Host otherwise.
  const stage = mainStages(season).find((s) => s.matches.some((m) => m.game.id === c.game));
  const rival = rivalOf(doc, stage?.rival ?? doc.host);
  const tone = toneColors(rival.tone);
  const title = c.title ?? (isArenaId(c.game) ? ARENA[c.game].title : isGameId(c.game) ? GAMES[c.game].title : c.game);
  const me = c.me ?? null;
  const left = me ? Math.max(0, c.maxAttempts - me.attemptsUsed) : c.maxAttempts;
  const play = () => router.push({ pathname: '/games/play', params: { mode: 'competition', competitionId: c.id, n: String(Date.now()) } });

  return (
    <View style={[styles.card, { borderColor: tone.solid }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <RivalMark rival={rival} size={48} expression="confident" />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Swords size={12} color={tone.fg} />
            <Kicker tone={rival.tone}>Weekly Rival</Kicker>
          </View>
          <AppText variant="bodyStrong" accessibilityRole="header">
            {rival.name} is back: {title}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} tabular>
            Same setup for everyone · {c.participants.toLocaleString('en-IN')} playing · {left} ranked {left === 1 ? 'attempt' : 'attempts'} left
            {me && me.best !== null ? ` · your best ${me.best}` : ''}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Play the rematch" compact onPress={play} style={{ flex: 1 }} />
        <Button label="Leaderboard" variant="secondary" compact onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'weekly', competition: c.id } })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, backgroundColor: colors.surface },
});
