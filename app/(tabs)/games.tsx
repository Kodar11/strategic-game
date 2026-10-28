import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { ArrowRight, Clock, Crown, ListOrdered, Pencil, Play, RefreshCw, Settings, Trophy } from '@/src/components/ui/icons';
import type { Competition, GamesOverview } from '@/src/data/games';
import { useGames } from '@/src/data/games-session';
import { DIFFICULTY_LABEL, GAMES, GAME_ORDER, personality } from '@/src/games/catalog';
import { ordinal, timeLeft, weekLabel } from '@/src/games/competition';
import type { GameId } from '@/src/games/core';
import { ENGINES } from '@/src/games/registry';
import { GAME_TINT, GameArt } from '@/src/features/games/ui/GameArt';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

function openGame(id: GameId) {
  router.push({ pathname: '/games/[gameId]', params: { gameId: id } });
}

/**
 * Games home: the Game of the Week (from the competition configuration in Supabase — never hard-coded here), the
 * leaderboards, and every game, each playable at any time against its bots. Only the featured game counts toward
 * rankings, and only through its official competition matches.
 */
export default function GamesScreen() {
  const insets = useSafeAreaInsets();
  const enter = useEnter();
  const overview = useGames((s) => s.overview);
  const loadOverview = useGames((s) => s.loadOverview);

  useFocusEffect(
    useCallback(() => {
      void loadOverview();
    }, [loadOverview]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.18} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: space.huge }}>
        <View style={styles.column}>
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
                Games
              </AppText>
              <NicknameChip name={overview.status === 'ready' ? overview.data.nickname : undefined} />
              <IconButton icon={Settings} label="Settings" onPress={() => router.navigate('/settings')} />
            </View>
            <AppText variant="small" color={colors.textMuted}>
              Five strategic games against bots with personalities.
            </AppText>
          </View>

          <Animated.View entering={enter(40)}>
            <WeeklyCard state={overview} onRetry={() => void loadOverview({ force: true })} />
          </Animated.View>

          <Animated.View entering={enter(80)} style={styles.boards}>
            <BoardLink label="This week" icon={Clock} onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'weekly' } })} />
            <BoardLink label="Global" icon={ListOrdered} onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'global' } })} />
            <BoardLink label="Hall of Fame" icon={Crown} onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'hall' } })} />
          </Animated.View>

          {overview.status === 'ready' && overview.data.lastWeek ? <LastWeek data={overview.data.lastWeek} /> : null}

          <View style={{ gap: 2, marginTop: space.sm }}>
            <AppText variant="heading" accessibilityRole="header">
              All games
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              Practice any game, any time. Practice never affects rankings.
            </AppText>
          </View>
          {GAME_ORDER.map((id, i) => (
            <Animated.View key={id} entering={enter(120 + i * 40)}>
              <GameCard id={id} featured={overview.status === 'ready' && overview.data.competition?.game === id && overview.data.competition.phase === 'active'} />
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function NicknameChip({ name }: { name: string | null | undefined }) {
  if (name === undefined) return null;
  return (
    <Pressable
      onPress={() => router.push('/nickname')}
      accessibilityRole="button"
      accessibilityLabel={name ? `Your public name is ${name}. Change it` : 'Set a public name for leaderboards'}
      style={({ pressed }) => [styles.nick, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <Pencil size={14} color={colors.textMuted} />
      <AppText variant="caption" color={name ? colors.text : colors.primaryText} numberOfLines={1} style={{ maxWidth: 120 }}>
        {name ?? 'Set your name'}
      </AppText>
    </Pressable>
  );
}

/**
 * The time to count down from: the device clock, corrected by how far it was from the server's clock when the
 * overview loaded. Display only — the server decides what is open. Re-renders every 30 s.
 */
function useNow(offset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now + offset;
}

function WeeklyCard({ state, onRetry }: { state: ReturnType<typeof useGames.getState>['overview']; onRetry: () => void }) {
  const now = useNow(state.status === 'ready' ? state.data.now - state.loadedAt : 0);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <View style={[styles.weekly, { alignItems: 'center', justifyContent: 'center', minHeight: 180 }]}>
        <ActivityIndicator color={colors.insight} accessibilityLabel="Loading the Game of the Week" />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <View style={[styles.weekly, { gap: space.sm }]}>
        <AppText variant="overline" color={colors.insight}>
          Game of the Week
        </AppText>
        <AppText variant="small" color={colors.textBody}>
          {state.error.message}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          You can still play every game below.
        </AppText>
        <Button label="Try again" variant="secondary" compact icon={RefreshCw} iconPosition="left" onPress={onRetry} style={{ alignSelf: 'flex-start' }} />
      </View>
    );
  }
  const c = state.data.competition;
  if (!c) {
    return (
      <View style={[styles.weekly, { gap: space.sm }]}>
        <AppText variant="overline" color={colors.insight}>
          Game of the Week
        </AppText>
        <AppText variant="heading">No competition this week</AppText>
        <AppText variant="small" color={colors.textMuted}>
          The next one will appear here when it’s scheduled. Practice is open meanwhile.
        </AppText>
      </View>
    );
  }
  return <Featured c={c} now={now} rules={state.data.rules} />;
}

function Featured({ c, now, rules }: { c: Competition; now: number; rules: GamesOverview['rules'] }) {
  const g = GAMES[c.game];
  const phase = c.phase === 'active' && now >= c.endsAt ? 'closed' : c.phase;
  const me = c.me;
  const left = me ? c.maxAttempts - me.attemptsUsed : c.maxAttempts;
  const outdated = rules[c.game] !== ENGINES[c.game].rulesVersion;
  const status =
    phase === 'active' ? timeLeft(c.endsAt - now) : phase === 'upcoming' ? `starts in ${timeLeft(c.startsAt - now).replace(' left', '')}` : phase === 'closed' ? 'closed · results being finalized' : 'final results';

  const play = () => router.push({ pathname: '/games/play', params: { mode: 'competition', competitionId: c.id } });

  return (
    <View style={[styles.weekly, { gap: space.md }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Trophy size={16} color={colors.insight} strokeWidth={2.2} />
        <AppText variant="overline" color={colors.insight} style={{ flex: 1 }}>
          Game of the Week · {weekLabel(c.startsAt, c.endsAt)}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <GameArt game={c.game} size={72} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">{g.title}</AppText>
          <AppText variant="small" color={colors.textBody}>
            {g.concept}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        <Badge label={status} tone={phase === 'active' ? 'amber' : 'neutral'} />
        <Badge label={`vs ${personality(c.game, c.bot)?.name ?? c.bot} · ${DIFFICULTY_LABEL[c.difficulty]}`} tone="orange" />
        <Badge label={`${c.participants} playing`} />
      </View>

      {me ? (
        <View style={styles.me} accessible accessibilityLabel={me.best === null ? `You haven't set a score yet. ${left} of ${c.maxAttempts} attempts left.` : `Your best ${me.best}, rank ${me.rank}. ${left} of ${c.maxAttempts} attempts left.`}>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={colors.textMuted}>
              Your position
            </AppText>
            <AppText variant="bodyStrong">{me.best === null ? 'No score yet' : `${ordinal(me.rank ?? 0)} · best ${me.best}`}</AppText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <AppText variant="caption" color={colors.textMuted}>
              Attempts left
            </AppText>
            <AppText variant="bodyStrong" tabular>
              {left} of {c.maxAttempts}
            </AppText>
          </View>
        </View>
      ) : null}

      {outdated ? (
        <AppText variant="small" color={colors.rivalText}>
          This week’s game uses rules this version of the app doesn’t have. Update the app to compete; practice still works.
        </AppText>
      ) : phase === 'active' ? (
        me?.activeMatchId ? (
          <Button label="Resume your match" icon={Play} onPress={play} />
        ) : left > 0 ? (
          <Button label={me?.best === null || !me ? 'Play for the leaderboard' : 'Try to beat your best'} icon={Play} onPress={play} accessibilityHint={`Uses one of your ${left} remaining attempts this week`} />
        ) : (
          <AppText variant="small" color={colors.textMuted}>
            You’ve used every attempt this week. Your best score stands — practice is still open.
          </AppText>
        )
      ) : phase === 'upcoming' ? (
        <AppText variant="small" color={colors.textMuted}>
          Practise {g.title} now; competitive play opens when the week starts.
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Weekly leaderboard" variant="secondary" compact icon={ListOrdered} iconPosition="left" onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'weekly', competition: c.id } })} style={{ flex: 1 }} />
        <Button label="Practise" variant="ghost" compact onPress={() => openGame(c.game)} />
      </View>
      <AppText variant="caption" color={colors.textFaint}>
        {c.maxAttempts} attempts a week; your best counts. Weeks run Monday to Sunday, India time.
      </AppText>
    </View>
  );
}

function LastWeek({ data }: { data: NonNullable<GamesOverview['lastWeek']> }) {
  const w = data.winners[0];
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'hall' } })}
      accessibilityRole="button"
      accessibilityLabel={w ? `Last week's winner: ${w.nickname ?? 'Anonymous player'} in ${GAMES[data.game].title} with ${w.score}. Open the Hall of Fame.` : `Last week: no entries. Open the Hall of Fame.`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <Crown size={18} color={colors.insight} />
      <View style={{ flex: 1 }}>
        <AppText variant="caption" color={colors.textMuted}>
          Last week · {GAMES[data.game].title}
        </AppText>
        <AppText variant="small" weight="semibold">
          {w ? `${w.nickname ?? 'Anonymous player'}${w.isMe ? ' (you!)' : ''} won with ${w.score}` : 'No entries'}
        </AppText>
      </View>
      <ArrowRight size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function BoardLink({ label, icon: Icon, onPress }: { label: string; icon: typeof Clock; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} leaderboard`} style={({ pressed }) => [styles.board, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <Icon size={18} color={colors.primaryText} />
      <AppText variant="caption" color={colors.text} align="center">
        {label}
      </AppText>
    </Pressable>
  );
}

function GameCard({ id, featured }: { id: GameId; featured: boolean }) {
  const g = GAMES[id];
  return (
    <Pressable
      onPress={() => openGame(id)}
      accessibilityRole="button"
      accessibilityLabel={`${g.title}${featured ? ', this week’s featured game' : ''}. ${g.action} ${g.concept}`}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceHigh }, featured && { borderColor: 'rgba(253,186,116,0.45)' }]}>
      <GameArt game={id} size={64} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
          <AppText variant="bodyStrong">{g.title}</AppText>
          {featured ? <Badge label="This week" tone="amber" /> : null}
        </View>
        <AppText variant="small" color={colors.textBody}>
          {g.action}
        </AppText>
        <AppText variant="caption" color={GAME_TINT[id].fg}>
          {g.concept}
        </AppText>
      </View>
      <View style={styles.play}>
        <Play size={16} color={colors.text} fill={colors.text} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  nick: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  weekly: { padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.bgRaised },
  me: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface },
  boards: { flexDirection: 'row', gap: space.sm },
  board: { flex: 1, alignItems: 'center', gap: 4, minHeight: 64, justifyContent: 'center', padding: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 56 },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  play: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
