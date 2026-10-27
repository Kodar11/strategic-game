import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ArrowLeft, Gamepad2, Play, RefreshCw } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { toDataError } from '@/src/data/errors';
import { GameError, type ChallengeView } from '@/src/data/games';
import { gamesRepo } from '@/src/data/games-session';
import { DIFFICULTY_LABEL, GAMES, personality } from '@/src/games/catalog';
import { ENGINES } from '@/src/games/registry';
import { GameArt } from '@/src/features/games/ui/GameArt';
import { OpponentBadges } from '@/src/features/games/ui/parts';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

const TOKEN = /^[0-9a-f]{20}$/;

/**
 * Where an invite link lands (`strategicgame://challenge/<token>` or `<web host>/challenge/<token>`): the game, who
 * sent it, and Play. Opening it again resumes or shows your result. Malformed, unknown and expired links get a
 * clear message and a way into the Games tab. This screen sits above the tabs, so Back goes to the app.
 */
export default function ChallengeScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();
  const valid = typeof token === 'string' && TOKEN.test(token);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ready'; c: ChallengeView }>(valid ? { status: 'loading' } : { status: 'missing' });

  const fetchChallenge = useCallback(
    () =>
      gamesRepo
        .getChallenge(token)
        .then((c) => setState({ status: 'ready', c }))
        .catch((e: unknown) => setState(e instanceof GameError && e.refusal === 'not_found' ? { status: 'missing' } : { status: 'error', message: toDataError(e).message })),
    [token],
  );
  useEffect(() => {
    if (valid) void fetchChallenge();
  }, [fetchChallenge, valid]);
  const load = () => {
    setState({ status: 'loading' });
    void fetchChallenge();
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/games'));

  if (state.status === 'loading') return <MessageScreen loading />;
  if (state.status === 'missing') {
    return <Fallback title="Challenge not found" body="This link doesn’t match any challenge. It may have been copied incompletely. You can still play every game." />;
  }
  if (state.status === 'error') return <MessageScreen title="Couldn’t open the challenge" body={state.message} onRetry={load} />;

  const c = state.c;
  const g = GAMES[c.game];
  const from = c.isCreator ? 'You created this challenge' : `${c.creatorNickname ?? 'A friend'} challenged you`;
  const mine = c.myMatch;
  const outdated = c.rulesVersion !== ENGINES[c.game].rulesVersion;
  const play = () => router.push({ pathname: '/games/play', params: { mode: 'challenge', token: c.token } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.2} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <AppText variant="overline" color={colors.accent} style={{ flex: 1 }}>
              Friend challenge
            </AppText>
            <IconButton icon={RefreshCw} label="Refresh" onPress={load} />
          </View>

          <View style={{ alignItems: 'center', gap: space.md }}>
            <GameArt game={c.game} size={96} />
            <AppText variant="overline" color={colors.textMuted}>
              {from}
            </AppText>
            <AppText variant="title" align="center" accessibilityRole="header">
              {g.title}
            </AppText>
            <AppText align="center" color={colors.textBody}>
              {g.action}
            </AppText>
            <OpponentBadges game={c.game} bot={c.bot} difficulty={c.difficulty} mode="challenge" />
          </View>

          <Card style={{ gap: space.sm }}>
            <AppText variant="small" color={colors.textBody}>
              Everyone who opens this link plays their own match against {personality(c.game, c.bot)?.name ?? c.bot} ({DIFFICULTY_LABEL[c.difficulty]}) with the same random draws. Results are compared once both are finished.
            </AppText>
            {c.creatorResult && !c.isCreator ? (
              <AppText variant="bodyStrong">
                Score to beat: {c.creatorResult.playerScore} ({c.creatorNickname ?? 'your friend'})
              </AppText>
            ) : !c.isCreator ? (
              <AppText variant="small" color={colors.textMuted}>
                {c.creatorNickname ?? 'Your friend'} hasn’t finished it yet.
              </AppText>
            ) : null}
            <AppText variant="caption" color={colors.textMuted}>
              {c.players} finished so far · {c.expired ? 'expired' : `open until ${new Date(c.expiresAt).toLocaleDateString()}`}
            </AppText>
          </Card>

          {outdated ? (
            <AppText color={colors.rivalText}>This challenge uses rules this version of the app doesn’t have. Update the app to play it.</AppText>
          ) : mine?.status === 'completed' ? (
            <View style={{ gap: space.sm }}>
              <AppText variant="bodyStrong" align="center">
                You played this: {mine.playerScore}
                {c.creatorResult && !c.isCreator ? ` vs ${c.creatorResult.playerScore}` : ''}
              </AppText>
              <Button label="See your match" icon={Play} onPress={play} />
            </View>
          ) : mine ? (
            <Button label="Resume your match" icon={Play} onPress={play} />
          ) : c.expired ? (
            <AppText color={colors.textMuted} align="center">
              This challenge has expired. You can still play {g.title} in practice.
            </AppText>
          ) : (
            <Button label={c.isCreator ? 'Play your own challenge' : 'Accept and play'} icon={Play} onPress={play} />
          )}
          <Button label={`Practise ${g.title}`} variant="secondary" icon={Gamepad2} iconPosition="left" onPress={() => router.push({ pathname: '/games/[gameId]', params: { gameId: c.game } })} />
        </View>
      </ScrollView>
    </View>
  );
}

function Fallback({ title, body }: { title: string; body: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space.xxl, paddingTop: insets.top, gap: space.lg }}>
      <Backdrop />
      <AppText variant="title" align="center" accessibilityRole="header">
        {title}
      </AppText>
      <AppText align="center" color={colors.textMuted}>
        {body}
      </AppText>
      <Button label="Go to Games" icon={Gamepad2} iconPosition="left" onPress={() => router.replace('/games')} />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
});
