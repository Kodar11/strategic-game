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
import { ArrowRight, Clock, Crown, History, ListOrdered, Play, RefreshCw, Settings, Trophy } from '@/src/components/ui/icons';
import type { Competition, GamesOverview } from '@/src/data/games';
import { useGames } from '@/src/data/games-session';
import { GAMES } from '@/src/games/catalog';
import { LIBRARY_COUNT, LIBRARY_GROUPS } from '@/src/games/library';
import { ordinal, timeLeft, weekLabel } from '@/src/games/competition';
import { type GameId, isGameId } from '@/src/games/core';
import { ENGINES } from '@/src/games/registry';
import { GAME_TINT, GameArt } from '@/src/features/games/ui/GameArt';
import { ARENA } from '@/src/arena/catalog';
import { type ArenaGameId, isArenaId } from '@/src/arena/core';
import { competitionGame, configSummary } from '@/src/competition/catalog';
import { CompetitionArt } from '@/src/features/competition/CompetitionArt';
import { played, useArenaRecords } from '@/src/features/arena/records';
import { ARENA_TINT, ArenaArt } from '@/src/features/arena/ui/parts';
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
  const [group, setGroup] = useState('all');

  useFocusEffect(
    useCallback(() => {
      void loadOverview();
      void useArenaRecords.getState().load();
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
              <IconButton icon={Settings} label="Settings" onPress={() => router.navigate('/settings')} />
            </View>
            <AppText variant="small" color={colors.textMuted}>
              {LIBRARY_COUNT} strategic games against opponents with personalities.
            </AppText>
          </View>

          <Animated.View entering={enter(40)}>
            <WeeklyCard state={overview} onRetry={() => void loadOverview({ force: true })} />
          </Animated.View>

          <Animated.View entering={enter(80)} style={styles.boards}>
            <BoardLink label="This week" icon={Clock} onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'weekly' } })} />
            <BoardLink label="Global" icon={ListOrdered} onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'global' } })} />
            <BoardLink label="Hall of Fame" icon={Crown} onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'hall' } })} />
            <BoardLink label="Past weeks" icon={History} onPress={() => router.push('/competitions')} />
          </Animated.View>

          {overview.status === 'ready' && overview.data.lastWeek ? <LastWeek data={overview.data.lastWeek} /> : null}

          <View style={{ gap: 2, marginTop: space.sm }}>
            <AppText variant="heading" accessibilityRole="header">
              All {LIBRARY_COUNT} games
            </AppText>
            <AppText variant="small" color={colors.textMuted}>
              Each has four hidden personalities to figure out. Practice never affects rankings.
            </AppText>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }} accessibilityRole="tablist">
            {[{ id: 'all', title: 'All' }, ...LIBRARY_GROUPS].map((g) => {
              const on = group === g.id;
              return (
                <Pressable key={g.id} onPress={() => setGroup(g.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={({ pressed }) => [styles.filter, on && { borderColor: colors.primary, backgroundColor: colors.primarySoft }, pressed && { opacity: 0.8 }]}>
                  <AppText variant="small" weight={on ? 'semibold' : 'regular'} color={on ? colors.text : colors.textBody}>
                    {g.title}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
          {LIBRARY_GROUPS.filter((g) => group === 'all' || g.id === group).map((g) => (
            <View key={g.id} style={{ gap: space.xs }}>
              <View style={{ gap: 1, marginTop: space.xs }}>
                <AppText variant="bodyStrong" accessibilityRole="header">
                  {g.title}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {g.blurb}
                </AppText>
              </View>
              {g.games.map((e) =>
                e.kind === 'classic' ? (
                  <GameCard key={e.id} id={e.id} featured={overview.status === 'ready' && overview.data.competition?.game === e.id && overview.data.competition.phase === 'active'} />
                ) : (
                  <ArenaCard key={e.id} id={e.id} />
                ),
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
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
  const g = competitionGame(c.game);
  const [confirming, setConfirming] = useState(false);
  const phase = c.phase === 'active' && now >= c.endsAt ? 'closed' : c.phase;
  const me = c.me;
  const left = me ? c.maxAttempts - me.attemptsUsed : c.maxAttempts;
  // Classic games: the app must have the server's rules version. Arena games are run entirely by the server.
  const outdated = isGameId(c.game) ? rules[c.game] !== ENGINES[c.game].rulesVersion : !isArenaId(c.game);
  const status =
    phase === 'active' ? timeLeft(c.endsAt - now) : phase === 'upcoming' ? `starts in ${timeLeft(c.startsAt - now).replace(' left', '')}` : phase === 'closed' ? 'closed · results being finalized' : 'final results';

  const play = () => router.push({ pathname: '/games/play', params: { mode: 'competition', competitionId: c.id, n: String(Date.now()) } });
  const practise = () => (isArenaId(c.game) ? router.push({ pathname: '/arena/[gameId]', params: { gameId: c.game } }) : openGame(c.game));

  return (
    <View style={[styles.weekly, { gap: space.md }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Trophy size={16} color={colors.insight} strokeWidth={2.2} />
        <AppText variant="overline" color={colors.insight} style={{ flex: 1 }}>
          Game of the Week{c.number ? ` #${c.number}` : ''} · {weekLabel(c.startsAt, c.endsAt)}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <CompetitionArt game={c.game} size={72} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">{g.title}</AppText>
          <AppText variant="small" color={colors.textBody}>
            {g.blurb}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        <Badge label={status} tone={phase === 'active' ? 'amber' : 'neutral'} />
        <Badge label={configSummary(c.game, c.bot, c.difficulty, c.config)} tone="orange" />
        <Badge label={`${c.participants} playing`} />
      </View>

      {me ? (
        <View style={styles.me} accessible accessibilityLabel={me.best === null ? `You haven't set a score yet. ${left} of ${c.maxAttempts} attempts left.` : `Your best ${me.bestLabel ?? me.best}, rank ${me.rank}. ${left} of ${c.maxAttempts} attempts left.`}>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={colors.textMuted}>
              Your position
            </AppText>
            <AppText variant="bodyStrong">{me.best === null ? 'No score yet' : `${ordinal(me.rank ?? 0)} · best ${me.bestLabel ?? me.best}`}</AppText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <AppText variant="caption" color={colors.textMuted}>
              Ranked attempts
            </AppText>
            <AppText variant="bodyStrong" tabular>
              {me.attemptsUsed}/{c.maxAttempts} used
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
          <Button label="Resume your ranked match" icon={Play} onPress={play} accessibilityHint="Continues the match you started; it doesn't use another attempt" />
        ) : left > 0 ? (
          confirming ? (
            <View style={styles.confirm}>
              <AppText variant="bodyStrong">Start ranked attempt {c.maxAttempts - left + 1} of {c.maxAttempts}?</AppText>
              <AppText variant="small" color={colors.textBody}>
                • Starting uses an attempt, even if you leave — you can resume it until the week ends.{'\n'}• Only completed matches, checked by the server, count.{'\n'}• Your best of {c.maxAttempts} goes on the leaderboard.{'\n'}• Everyone plays the same game, opponent and rules.
              </AppText>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button label="Start ranked match" icon={Play} onPress={play} style={{ flex: 1 }} />
                <Button label="Not now" variant="ghost" compact onPress={() => setConfirming(false)} />
              </View>
            </View>
          ) : (
            <Button label={me?.best === null || !me ? 'Play for the leaderboard' : 'Try to beat your best'} icon={Play} onPress={() => setConfirming(true)} accessibilityHint={`${left} of ${c.maxAttempts} ranked attempts left this week`} />
          )
        ) : (
          <AppText variant="small" color={colors.textMuted}>
            You’ve used all {c.maxAttempts} ranked attempts this week. Your best score stands — practice is still open.
          </AppText>
        )
      ) : phase === 'upcoming' ? (
        <AppText variant="small" color={colors.textMuted}>
          Practise {g.title} now; ranked play opens when the week starts.
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Weekly leaderboard" variant="secondary" compact icon={ListOrdered} iconPosition="left" onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'weekly', competition: c.id } })} style={{ flex: 1 }} />
        <Button label="Practise" variant="ghost" compact onPress={practise} />
      </View>
      <AppText variant="caption" color={colors.textFaint}>
        How it’s scored: {g.scoring}
        {g.tieBreak ? ` Ties: ${g.tieBreak.charAt(0).toLowerCase()}${g.tieBreak.slice(1)}` : ''} {c.maxAttempts} ranked attempts a week; your best counts. Weeks run Monday to Sunday, India time.
      </AppText>
    </View>
  );
}

/** Last week's champion — a permanent record — with a link to the full competition. */
function LastWeek({ data }: { data: NonNullable<GamesOverview['lastWeek']> }) {
  const champs = data.winners;
  const title = competitionGame(data.game).title;
  const names = champs.map((w) => `${w.nickname ?? 'Anonymous player'}${w.isMe ? ' (you!)' : ''}`).join(' & ');
  const mineWon = champs.some((w) => w.isMe);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/competitions/[id]', params: { id: data.id } })}
      accessibilityRole="button"
      accessibilityLabel={champs.length ? `Last week's champion${champs.length > 1 ? 's' : ''}: ${names} in ${title} with ${champs[0].scoreLabel ?? champs[0].score}. Open the final results.` : `Last week: no entries. Open the final results.`}
      style={({ pressed }) => [styles.row, mineWon && styles.champion, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <Crown size={18} color={colors.insight} />
      <View style={{ flex: 1 }}>
        <AppText variant="caption" color={colors.textMuted}>
          {data.number ? `Week #${data.number}` : 'Last week'} · {title}
        </AppText>
        <AppText variant="small" weight="semibold">
          {champs.length ? `${mineWon ? '🏆 ' : ''}${champs.length > 1 ? 'Shared title: ' : 'Champion: '}${names} · ${champs[0].scoreLabel ?? champs[0].score}` : 'No entries'}
        </AppText>
        {data.mine && !mineWon ? (
          <AppText variant="caption" color={colors.textMuted}>
            You finished {ordinal(data.mine.rank)} of {data.mine.field}.
          </AppText>
        ) : null}
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

function ArenaCard({ id }: { id: ArenaGameId }) {
  const g = ARENA[id];
  const record = useArenaRecords((s) => s.games[id]);
  const n = played(record);
  const tally = record && n ? `${record.w}–${record.l}${record.d ? `–${record.d}` : ''}` : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/arena/[gameId]', params: { gameId: id } })}
      accessibilityRole="button"
      accessibilityLabel={`${g.title}. ${g.tagline} ${g.question}${tally ? ` Your record: ${record!.w} won of ${n}.` : ''}`}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <ArenaArt game={id} size={48} />
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
          <AppText variant="small" weight="semibold">
            {g.title}
          </AppText>
          {tally ? <Badge label={tally} /> : null}
        </View>
        <AppText variant="caption" color={ARENA_TINT[id].fg} numberOfLines={2}>
          {g.question}
        </AppText>
      </View>
      <ArrowRight size={16} color={colors.textMuted} />
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
      <GameArt game={id} size={48} />
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
          <AppText variant="small" weight="semibold">
            {g.title}
          </AppText>
          {featured ? <Badge label="This week" tone="amber" /> : null}
        </View>
        <AppText variant="caption" color={GAME_TINT[id].fg} numberOfLines={2}>
          {g.concept}
        </AppText>
      </View>
      <ArrowRight size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  weekly: { padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.bgRaised },
  me: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface },
  confirm: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.surface },
  champion: { borderColor: 'rgba(253,186,116,0.6)' },
  boards: { flexDirection: 'row', gap: space.sm },
  board: { flex: 1, alignItems: 'center', gap: 4, minHeight: 64, justifyContent: 'center', padding: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 56 },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
