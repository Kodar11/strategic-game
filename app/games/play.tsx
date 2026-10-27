import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { ArrowLeft, ListOrdered } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { toDataError } from '@/src/data/errors';
import type { ChallengeView, ServerMatch } from '@/src/data/games';
import { gamesRepo, useGames } from '@/src/data/games-session';
import { GAMES, personality } from '@/src/games/catalog';
import { type GameId, isDifficulty, isGameId } from '@/src/games/core';
import { ENGINES } from '@/src/games/registry';
import { type MatchView, usePracticeMatch, useServerMatch } from '@/src/features/games/useMatch';
import { Board } from '@/src/features/games/ui/Board';
import { ordinal } from '@/src/games/competition';
import { OpponentBadges, Panel, ScoreBar } from '@/src/features/games/ui/parts';
import { ResultPanel } from '@/src/features/games/ui/ResultPanel';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

type Params = { game?: string; bot?: string; difficulty?: string; mode?: string; competitionId?: string; token?: string; n?: string };

/**
 * Playing a match. Practice (`game`, `bot`, `difficulty`) runs on the device. `mode=competition` and
 * `mode=challenge` start — or resume — a match on the server, which decides the bot's moves and the score.
 */
export default function PlayScreen() {
  const p = useLocalSearchParams<Params>();
  if (p.mode === 'competition' && p.competitionId) return <ServerLoader key={`c:${p.competitionId}:${p.n ?? ""}`} start={() => gamesRepo.startCompetitionMatch(p.competitionId!)} />;
  if (p.mode === 'challenge' && p.token) return <ServerLoader key={`t:${p.token}`} start={() => gamesRepo.startChallengeMatch(p.token!)} />;
  if (!isGameId(p.game) || !isDifficulty(p.difficulty) || !p.bot || !ENGINES[p.game].bots.includes(p.bot)) {
    return <MessageScreen title="Game not found" body="That game, opponent or difficulty isn’t available." />;
  }
  return <Practice game={p.game} bot={p.bot} difficulty={p.difficulty} />;
}

function Practice({ game, bot, difficulty }: { game: GameId; bot: string; difficulty: 'easy' | 'medium' | 'hard' }) {
  const [round, setRound] = useState(0);
  return <PracticeSession key={round} game={game} bot={bot} difficulty={difficulty} onPlayAgain={() => setRound((n) => n + 1)} />;
}

function PracticeSession({ game, bot, difficulty, onPlayAgain }: { game: GameId; bot: string; difficulty: 'easy' | 'medium' | 'hard'; onPlayAgain: () => void }) {
  const view = usePracticeMatch(game, bot, difficulty);
  return <MatchLayout view={view} result={<ResultPanel view={view} onPlayAgain={onPlayAgain} />} />;
}

function ServerLoader({ start }: { start: () => Promise<ServerMatch> }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; match: ServerMatch }>({ status: 'loading' });
  // `start` is fixed for this loader: the loader is keyed by the screen's params.
  const [begin] = useState(
    () => () =>
      start()
        .then((match) => setState({ status: 'ready', match }))
        .catch((e: unknown) => setState({ status: 'error', message: toDataError(e).message })),
  );
  useEffect(() => {
    void begin();
  }, [begin]);
  const run = () => {
    setState({ status: 'loading' });
    void begin();
  };

  if (state.status === 'loading') return <MessageScreen loading />;
  if (state.status === 'error') return <LoadError message={state.message} onRetry={run} />;
  if (state.match.rulesVersion !== ENGINES[state.match.game].rulesVersion) {
    return <MessageScreen title="Update needed" body="This match uses game rules that this version of the app doesn’t have. Update the app to play it." />;
  }
  return <ServerSession match={state.match} />;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space.xxl, paddingTop: insets.top, gap: space.lg }}>
      <Backdrop />
      <AppText variant="title" align="center">
        Couldn’t start the match
      </AppText>
      <AppText align="center" color={colors.textMuted}>
        {message}
      </AppText>
      <Button label="Try again" onPress={onRetry} />
      <Button label="Back to games" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/games'))} />
    </View>
  );
}

function ServerSession({ match }: { match: ServerMatch }) {
  const view = useServerMatch(match);
  const extra = view.mode === 'competition' ? <CompetitionResult view={view} /> : view.server?.challengeToken ? <ChallengeResult view={view} token={view.server.challengeToken} /> : null;
  const again =
    view.mode === 'competition'
      ? () => router.replace({ pathname: '/games/play', params: { mode: 'competition', competitionId: view.server!.competitionId!, n: String(Date.now()) } })
      : () => router.replace({ pathname: '/games/play', params: { game: view.game, bot: view.bot, difficulty: view.difficulty } });
  return (
    <MatchLayout
      view={view}
      result={
        <ResultPanel view={view} onPlayAgain={again} playAgainLabel={view.mode === 'competition' ? 'Play again (uses an attempt)' : 'Practise against this bot'}>
          {extra}
        </ResultPanel>
      }
    />
  );
}

function CompetitionResult({ view }: { view: MatchView }) {
  const overview = useGames((s) => s.overview);
  const c = overview.status === 'ready' ? overview.data.competition : null;
  const me = c && c.id === view.server?.competitionId ? c.me : null;
  return (
    <Panel>
      <AppText variant="overline" color={colors.insight}>
        Game of the Week
      </AppText>
      <AppText variant="bodyStrong">This match scored {view.totals.player}. It was recorded by the server.</AppText>
      {me && me.best !== null ? (
        <AppText variant="small" color={colors.textBody}>
          Your best this week: {me.best} — {ordinal(me.rank ?? 0)} so far. {c!.maxAttempts - me.attemptsUsed} of {c!.maxAttempts} attempts left.
        </AppText>
      ) : null}
      <Button label="Weekly leaderboard" variant="secondary" compact icon={ListOrdered} iconPosition="left" onPress={() => router.push({ pathname: '/leaderboard', params: { tab: 'weekly', competition: view.server!.competitionId! } })} />
    </Panel>
  );
}

/** Compares results only once both exist — never claims the friend played when they haven't. */
function ChallengeResult({ view, token }: { view: MatchView; token: string }) {
  const [c, setC] = useState<ChallengeView | null>(null);
  useEffect(() => {
    gamesRepo
      .getChallenge(token)
      .then(setC)
      .catch(() => undefined);
  }, [token]);
  if (!c) return null;
  const others = c.players - 1;
  return (
    <Panel>
      <AppText variant="overline" color={colors.accent}>
        Friend challenge
      </AppText>
      {c.isCreator ? (
        <AppText variant="small" color={colors.textBody}>
          {others > 0 ? `${others} ${others === 1 ? 'person has' : 'people have'} finished your challenge so far.` : 'Nobody else has finished your challenge yet. Share the link to invite someone.'}
        </AppText>
      ) : c.creatorResult ? (
        <AppText variant="bodyStrong">
          You {view.totals.player} · {c.creatorNickname ?? 'Your friend'} {c.creatorResult.playerScore}
          {view.totals.player > c.creatorResult.playerScore ? ' — you beat their score.' : view.totals.player < c.creatorResult.playerScore ? ' — they scored more.' : ' — level.'}
        </AppText>
      ) : (
        <AppText variant="small" color={colors.textBody}>
          {c.creatorNickname ?? 'Your friend'} hasn’t finished this challenge yet, so there’s nothing to compare. Open the link again later.
        </AppText>
      )}
    </Panel>
  );
}

function MatchLayout({ view, result }: { view: MatchView; result: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const g = GAMES[view.game];
  const botName = view.game === 'two-thirds' ? 'Bot rounds' : (personality(view.game, view.bot)?.name ?? view.bot);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/games'));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <IconButton icon={ArrowLeft} label={view.mode === 'practice' || view.done ? 'Back' : 'Leave — you can resume this match later'} onPress={close} />
            <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>
              {g.title}
            </AppText>
          </View>
          <OpponentBadges game={view.game} bot={view.bot} difficulty={view.difficulty} mode={view.mode} />
          <ScoreBar you={view.totals.player} bot={view.totals.bot} botName={botName} round={view.rounds.length + (view.done ? 0 : 1)} total={view.totalRounds} />
          {view.mode !== 'practice' && !view.done ? (
            <AppText variant="caption" color={colors.textMuted}>
              Played on the server: each move is sent and the bot answers there. {view.mode === 'competition' ? 'You can leave and resume until the week ends.' : 'You can leave and resume from the link.'}
            </AppText>
          ) : null}
          {view.error ? (
            <AppText variant="small" color={colors.danger} accessibilityLiveRegion="assertive">
              {view.error}
            </AppText>
          ) : null}
          <Board view={view} />
          {view.done ? result : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
});
