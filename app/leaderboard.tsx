import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { ArrowLeft, Crown, Medal, Pencil, RefreshCw } from '@/src/components/ui/icons';
import { Segmented } from '@/src/components/ui/Segmented';
import type { GlobalEntry, HallOfFameEntry, WeeklyBoard, WeeklyEntry } from '@/src/data/games';
import { useGames } from '@/src/data/games-session';
import type { Loadable } from '@/src/features/games/store';
import { DIFFICULTY_LABEL, GAMES, personality } from '@/src/games/catalog';
import { timeLeft, weekLabel } from '@/src/games/competition';
import { GameArt } from '@/src/features/games/ui/GameArt';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

type Tab = 'weekly' | 'global' | 'hall';
const ANON = 'Anonymous player';

/**
 * Three views of the competition. This week: the featured game's live (or final) standings and time left. Global:
 * points from every finalized week. Hall of Fame: each finished week's official winner, from the finalized records.
 * Only nicknames are shown — never account ids or emails.
 */
export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string; competition?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'global' || params.tab === 'hall' ? params.tab : 'weekly');
  const competition = params.competition ?? '';
  const s = useGames();

  useFocusEffect(
    useCallback(() => {
      const g = useGames.getState();
      if (tab === 'weekly') void g.loadWeekly(competition);
      else if (tab === 'global') void g.loadGlobal();
      else void g.loadHall();
    }, [tab, competition]),
  );

  const refresh = () => {
    if (tab === 'weekly') void s.loadWeekly(competition, { force: true });
    else if (tab === 'global') void s.loadGlobal({ force: true });
    else void s.loadHall({ force: true });
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace('/games'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <View style={styles.head}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              Leaderboards
            </AppText>
            <IconButton icon={RefreshCw} label="Refresh" onPress={refresh} />
          </View>
          <Segmented
            options={[
              { value: 'weekly', label: 'This week' },
              { value: 'global', label: 'Global' },
              { value: 'hall', label: 'Hall of Fame' },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'weekly' ? (
            <Load state={s.weekly[competition] ?? { status: 'idle' }} onRetry={refresh}>
              {(d) => <Weekly data={d} />}
            </Load>
          ) : tab === 'global' ? (
            <Load state={s.global} onRetry={refresh}>
              {(d) => (
                <View style={{ gap: space.md }}>
                  <AppText variant="small" color={colors.textMuted}>
                    Points from every finalized week: 10 for taking part, up to 40 for your placing, plus a bonus for the week’s winner. Practice games don’t count. {d.players} ranked player{d.players === 1 ? '' : 's'}.
                  </AppText>
                  <Rows entries={d.entries} me={d.me} empty="No finalized weeks yet. The first results appear after this week closes." render={(e) => <GlobalRow e={e} />} />
                </View>
              )}
            </Load>
          ) : (
            <Load state={s.hall} onRetry={refresh}>
              {(d) => <Hall entries={d} />}
            </Load>
          )}
          <Button label="Your public name" variant="ghost" compact icon={Pencil} iconPosition="left" onPress={() => router.push('/nickname')} style={{ alignSelf: 'center' }} />
        </View>
      </ScrollView>
    </View>
  );
}

function Load<T>({ state, onRetry, children }: { state: Loadable<T>; onRetry: () => void; children: (d: T) => React.ReactNode }) {
  if (state.status === 'idle' || state.status === 'loading') return <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} accessibilityLabel="Loading" />;
  if (state.status === 'error')
    return (
      <View style={{ gap: space.md, alignItems: 'flex-start' }}>
        <AppText color={colors.textBody}>{state.error.message}</AppText>
        <Button label="Try again" variant="secondary" compact icon={RefreshCw} iconPosition="left" onPress={onRetry} />
      </View>
    );
  return <>{children(state.data)}</>;
}

function Weekly({ data }: { data: WeeklyBoard }) {
  const c = data.competition;
  if (!c) {
    return (
      <AppText color={colors.textMuted}>
        No Game of the Week has started yet. When one does, its standings appear here.
      </AppText>
    );
  }
  // The server sends its clock with every weekly board.
  const now = data.now ?? c.startsAt;
  const status = c.phase === 'finalized' ? 'Final results' : c.phase === 'active' ? timeLeft(c.endsAt - now) : c.phase === 'closed' ? 'Closed · results being finalized' : 'Not started';
  return (
    <View style={{ gap: space.md }}>
      <View style={[styles.banner, c.phase === 'finalized' && { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <GameArt game={c.game} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" color={c.phase === 'finalized' ? colors.textMuted : colors.insight}>
            {c.phase === 'finalized' ? 'Finished week' : 'Current competition'} · {weekLabel(c.startsAt, c.endsAt)}
          </AppText>
          <AppText variant="bodyStrong">{GAMES[c.game].title}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            vs {personality(c.game, c.bot)?.name ?? c.bot} · {DIFFICULTY_LABEL[c.difficulty]} · {c.participants} player{c.participants === 1 ? '' : 's'}
          </AppText>
        </View>
        <Badge label={status} tone={c.phase === 'active' ? 'amber' : 'neutral'} />
      </View>
      <AppText variant="caption" color={colors.textMuted}>
        Best completed match per player. Equal scores: whoever got there first ranks higher.
      </AppText>
      <Rows
        entries={data.entries}
        me={data.me}
        empty={c.phase === 'active' ? 'No scores yet this week. Be the first.' : 'Nobody played this week.'}
        render={(e) => <WeeklyRow e={e} />}
      />
    </View>
  );
}

function Rows<E extends { rank: number; isMe: boolean }>({ entries, me, empty, render }: { entries: E[]; me: E | null; empty: string; render: (e: E) => React.ReactNode }) {
  if (!entries.length) return <AppText color={colors.textMuted}>{empty}</AppText>;
  const meShown = entries.some((e) => e.isMe);
  return (
    <View style={{ gap: space.xs }}>
      {entries.map((e, i) => (
        <View key={i}>{render(e)}</View>
      ))}
      {me && !meShown ? (
        <>
          <AppText variant="caption" color={colors.textFaint} align="center">
            ···
          </AppText>
          {render(me)}
        </>
      ) : null}
      {!me ? (
        <AppText variant="caption" color={colors.textMuted} align="center" style={{ marginTop: space.sm }}>
          You don’t have a ranked score here yet.
        </AppText>
      ) : null}
    </View>
  );
}

function RankCell({ rank }: { rank: number }) {
  const medal = rank === 1 ? colors.insight : rank === 2 ? colors.textBody : rank === 3 ? colors.rivalText : null;
  return (
    <View style={{ width: 40, alignItems: 'center' }}>
      {medal ? <Medal size={18} color={medal} /> : null}
      <AppText variant="small" weight="semibold" tabular color={medal ?? colors.textMuted}>
        {rank}
      </AppText>
    </View>
  );
}

function WeeklyRow({ e }: { e: WeeklyEntry }) {
  const name = e.nickname ?? ANON;
  return (
    <View style={[styles.row, e.isMe && styles.rowMe]} accessible accessibilityLabel={`Rank ${e.rank}: ${name}${e.isMe ? ' (you)' : ''}, score ${e.score}${e.isWinner ? ', winner' : ''}${e.points !== undefined ? `, ${e.points} points` : ''}.`}>
      <RankCell rank={e.rank} />
      <AppText variant="small" weight={e.isMe ? 'semibold' : 'regular'} style={{ flex: 1 }} numberOfLines={1}>
        {name}
        {e.isMe ? ' (you)' : ''}
      </AppText>
      {e.isWinner ? <Crown size={16} color={colors.insight} /> : null}
      {e.points !== undefined ? (
        <AppText variant="caption" color={colors.textMuted} tabular>
          +{e.points} pts
        </AppText>
      ) : null}
      <AppText variant="bodyStrong" tabular style={{ minWidth: 36, textAlign: 'right' }}>
        {e.score}
      </AppText>
    </View>
  );
}

function GlobalRow({ e }: { e: GlobalEntry }) {
  const name = e.nickname ?? ANON;
  return (
    <View style={[styles.row, e.isMe && styles.rowMe]} accessible accessibilityLabel={`Rank ${e.rank}: ${name}${e.isMe ? ' (you)' : ''}, ${e.points} points, ${e.wins} weekly wins in ${e.weeks} weeks.`}>
      <RankCell rank={e.rank} />
      <View style={{ flex: 1 }}>
        <AppText variant="small" weight={e.isMe ? 'semibold' : 'regular'} numberOfLines={1}>
          {name}
          {e.isMe ? ' (you)' : ''}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {e.weeks} week{e.weeks === 1 ? '' : 's'}
          {e.wins ? ` · ${e.wins} win${e.wins === 1 ? '' : 's'}` : ''}
        </AppText>
      </View>
      <AppText variant="bodyStrong" tabular>
        {e.points}
      </AppText>
    </View>
  );
}

function Hall({ entries }: { entries: HallOfFameEntry[] }) {
  if (!entries.length) return <AppText color={colors.textMuted}>No finished weeks yet. Every week’s official winner will be kept here.</AppText>;
  return (
    <View style={{ gap: space.md }}>
      {entries.map((h) => {
        const names = h.winners.map((w) => `${w.nickname ?? ANON}${w.isMe ? ' (you)' : ''}`).join(' & ');
        return (
          <View key={h.id} style={styles.hall} accessible accessibilityLabel={`${weekLabel(h.startsAt, h.endsAt)}, ${GAMES[h.game].title}. ${h.winners.length ? `Winner ${names} with ${h.winners[0].score}` : 'No entries'}. ${h.participants ?? 0} players.`}>
            <GameArt game={h.game} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="caption" color={colors.textMuted}>
                {weekLabel(h.startsAt, h.endsAt)} · {GAMES[h.game].title}
              </AppText>
              {h.winners.length ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Crown size={16} color={colors.insight} />
                  <AppText variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {names}
                  </AppText>
                </View>
              ) : (
                <AppText variant="small" color={colors.textMuted}>
                  No entries this week
                </AppText>
              )}
              <AppText variant="caption" color={colors.textMuted}>
                {h.winners.length ? `Winning score ${h.winners[0].score}` : ''}
                {h.runnerUpScore !== null ? ` · runner-up ${h.runnerUpScore}` : ''} · {h.participants ?? 0} player{h.participants === 1 ? '' : 's'} · vs {personality(h.game, h.bot)?.name ?? h.bot}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.bgRaised },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.md, backgroundColor: colors.surface },
  rowMe: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  hall: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
