import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SignInRequiredScreen, useIsGuest } from '@/src/components/auth/SignInRequired';
import { MatchHeader } from '@/src/components/game/MatchChrome';
import { MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { ArrowRight, ListOrdered, RefreshCw, Trophy } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { ARENA } from '@/src/arena/catalog';
import type { ArenaGameId, MatchResult } from '@/src/arena/core';
import type { CoopState, CoopVariant } from '@/src/arena/cooperation';
import { type MoleState, suspectName } from '@/src/arena/mole';
import { type SaboteurState, crewName } from '@/src/arena/saboteur';
import { configSummary } from '@/src/competition/catalog';
import type { ArenaMatchView } from '@/src/data/arena-competition';
import { useGames } from '@/src/data/games-session';
import { ordinal } from '@/src/games/competition';
import { AuctionBoard } from '@/src/features/arena/ui/AuctionBoard';
import { CooperationMatch } from '@/src/features/arena/ui/CooperationMatch';
import { LIBRARY_BOARDS } from '@/src/features/arena/ui/library';
import { MarketBoard } from '@/src/features/arena/ui/MarketBoard';
import { SignalBoard } from '@/src/features/arena/ui/SignalBoard';
import { UltimatumGameBoard } from '@/src/features/arena/ui/UltimatumGameBoard';
import { Panel } from '@/src/features/games/ui/parts';
import { useRankedArenaMatch } from '@/src/features/competition/useRankedArenaMatch';
import { useGameTelemetry } from '@/src/observability';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

/**
 * A ranked Game of the Week match of a Strategy Arena game, run on the server (supabase/functions/arena-match). The
 * board is the same one practice uses; it is given the server's redacted view of the match — no seed and none of the
 * game's hidden information — and its actions go to the server, which runs the opponent and scores the match.
 * Leaving is safe: the match is resumed from the server, on any device, until the week's deadline.
 */
export default function RankedArenaScreen() {
  const { matchId } = useLocalSearchParams<{ matchId?: string }>();
  const guest = useIsGuest();
  if (guest) return <SignInRequiredScreen title="Game of the Week" body="Ranked matches are scored on our server under your account. Sign in with Google to play — practice works without an account." />;
  if (!matchId || !/^[0-9a-f-]{36}$/.test(matchId)) return <MessageScreen title="Match not found" body="That ranked match isn’t available." />;
  return <Ranked key={matchId} matchId={matchId} />;
}

function Ranked({ matchId }: { matchId: string }) {
  const m = useRankedArenaMatch(matchId);
  const v = m.view;
  // Game of the Week, scored on the server. A match that is already over when opened (looking back) sends nothing.
  useGameTelemetry(
    v ? { game_id: v.game, system: 'arena', mode: 'ranked', level: v.config.level, variant: v.config.variant, length: v.config.length, attempt_number: v.attempt } : null,
    { round: v?.played ?? 0, roundsTotal: v?.total ?? 0, finished: !!v?.over, outcome: v?.final?.score.outcome ?? null },
  );

  // Once a ranked match ends, the week's standings changed.
  const over = !!v?.over;
  useEffect(() => {
    if (!over) return;
    void useGames.getState().loadOverview({ force: true });
    void useGames.getState().loadMine({ force: true });
  }, [over]);

  if (!v && m.error) {
    return <MessageScreen title="Couldn’t load your match" body={m.error.message} onRetry={m.retry} />;
  }
  if (!v) return <MessageScreen loading />;

  const game = v.game;
  if (!ARENA[game]) return <MessageScreen title="Update needed" body="This week’s game needs a newer version of the app." />;
  const result = (v.final?.result ?? null) as MatchResult | null;
  const done = <RankedResult view={v} />;
  const busyAct = (a: unknown) => (m.busy ? undefined : m.act(a));

  if (game === 'cooperation') {
    return (
      <CooperationMatch
        persona={v.config.opponent as never}
        level={v.config.level}
        length={v.config.length}
        variant={v.config.variant as CoopVariant}
        seed={0}
        onPlayAgain={() => router.navigate('/games')}
        server={{ state: v.state as unknown as CoopState, act: busyAct, result, busy: m.busy }}
        resultSlot={done}
      />
    );
  }
  return <BoardScreen m={m} view={v} game={game} act={busyAct} />;
}

function BoardScreen({ m, view: v, game, act }: { m: ReturnType<typeof useRankedArenaMatch>; view: ArenaMatchView; game: ArenaGameId; act: (a: unknown) => void }) {
  const insets = useSafeAreaInsets();
  const g = ARENA[game];
  const name = configSummary(game, v.config.opponent, v.config.level, v.config).replace(/^vs /, '').split(' · ')[0];
  const props = { state: v.state as never, act, over: v.over, rivalName: name };
  const Library = LIBRARY_BOARDS[game as keyof typeof LIBRARY_BOARDS];
  const board = Library ? (
    <Library {...props} />
  ) : game === 'ultimatum-game' ? (
    <UltimatumGameBoard {...props} />
  ) : game === 'auction' ? (
    <AuctionBoard {...props} />
  ) : game === 'market' ? (
    <MarketBoard {...props} />
  ) : game === 'signal' ? (
    <SignalBoard {...props} />
  ) : null;
  const roundLabel = g.roundWord === 'lots' ? 'Lot' : g.roundWord === 'turns' ? 'Turn' : 'Round';
  const close = () => (router.canGoBack() ? router.back() : router.replace('/games'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.huge }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <MatchHeader
            title={g.title}
            meta={`Game of the Week · ranked attempt ${v.attempt} · ${configSummary(game, v.config.opponent, v.config.level, v.config)}`}
            progress={`${roundLabel} ${Math.min(v.played + (v.over ? 0 : 1), v.total)}/${v.total}`}
            backLabel={v.over ? 'Back' : 'Leave — you can resume this match later'}
            onBack={close}
          />
          {!v.over ? (
            <AppText variant="caption" color={colors.textMuted}>
              Played on the server: each move is checked there and the opponent answers there. You can leave and resume until the week ends.
            </AppText>
          ) : null}
          {v.status === 'expired' ? (
            <Panel>
              <AppText variant="bodyStrong">This match closed when the week ended.</AppText>
              <AppText variant="small" color={colors.textBody}>
                It was still in progress at the deadline, so it doesn’t count. The attempt was used when the match started.
              </AppText>
            </Panel>
          ) : null}
          {m.error ? (
            <View style={{ gap: space.xs }}>
              <AppText variant="small" color={colors.danger} accessibilityLiveRegion="assertive">
                {m.error.message}
              </AppText>
              {m.unsent ? <Button label="Send the move again" variant="secondary" compact icon={RefreshCw} iconPosition="left" onPress={m.retry} style={{ alignSelf: 'flex-start' }} /> : null}
            </View>
          ) : null}
          {v.over ? null : <View style={m.busy ? { opacity: 0.7 } : undefined}>{board}</View>}
          {v.over ? (
            <>
              <RankedResult view={v} unmasked={game === 'mole' || game === 'saboteur' ? unmaskedLine(game, v.state) : null} />
              <MatchLog title="Final board" summary="How the match ended">
                {board}
              </MatchLog>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * The end of a ranked match: the result and score the server computed, whether it is the player's best this week,
 * the attempts left and the current rank — then the debrief, generated from this match's own decisions.
 */
function RankedResult({ view: v, unmasked = null }: { view: ArenaMatchView; unmasked?: string | null }) {
  const f = v.final;
  const st = v.standing;
  const max = st?.maxAttempts ?? 3;
  if (!f) return null;
  const outcome = f.score.outcome === 'win' ? 'You won' : f.score.outcome === 'draw' ? 'A draw' : 'You lost';
  const headline = (f.result.headline as string | undefined) ?? outcome;
  return (
    <View style={{ gap: space.md }}>
      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Trophy size={16} color={colors.insight} />
          <AppText variant="overline" color={colors.insight}>
            Game of the Week · ranked attempt {v.attempt}
          </AppText>
        </View>
        <AppText variant="title">{headline}</AppText>
        {unmasked ? (
          <AppText variant="small" color={colors.textBody}>
            {unmasked}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          <Badge label={`Score: ${f.score.label}`} tone="amber" />
          {st?.isBest ? <Badge label="Your best this week" tone="orange" /> : null}
        </View>
        {st ? (
          <AppText variant="small" color={colors.textBody}>
            {st.best === null ? 'No counted score yet.' : `Your best this week: ${st.bestLabel ?? st.best} — ${ordinal(st.rank ?? 0)} of ${st.participants ?? '?'} so far.`} {Math.max(0, max - st.attemptsUsed)} of {max} ranked
            attempts left.
          </AppText>
        ) : (
          <AppText variant="small" color={colors.textBody}>
            Recorded by the server. Your standing updates on the leaderboard.
          </AppText>
        )}
        {f.result.note ? (
          <AppText variant="caption" color={colors.textMuted}>
            {String(f.result.note)}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Button label="Weekly leaderboard" compact icon={ListOrdered} iconPosition="left" onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'weekly', competition: v.competitionId } })} />
          <Button label="Practise this game" variant="secondary" compact onPress={() => router.push({ pathname: '/arena/[gameId]', params: { gameId: v.game } })} />
        </View>
      </Panel>
      <Panel>
        <AppText variant="overline" color={colors.primaryText}>
          {f.debrief.headline}
        </AppText>
        {f.debrief.moments.map((t, i) => (
          <AppText key={i} variant="small" color={colors.textBody}>
            • {t}
          </AppText>
        ))}
        <AppText variant="small">{f.debrief.insight}</AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {f.debrief.opponentRead}
        </AppText>
      </Panel>
      <Button label="Back to Game of the Week" variant="ghost" icon={ArrowRight} onPress={() => router.navigate('/games')} />
    </View>
  );
}

function unmaskedLine(game: 'mole' | 'saboteur', state: unknown): string | null {
  if (game === 'mole') {
    const s = state as MoleState;
    return s.accused === null ? null : `The Mole was ${suspectName(s.mole)}. You accused ${suspectName(s.accused)}.`;
  }
  const s = state as SaboteurState;
  return s.accused === null ? null : `The saboteur was ${crewName(s.saboteur)}. You accused ${crewName(s.accused)}.`;
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.sm },
});
