import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ArrowLeft, ChevronDown, Play, UserPlus } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { Segmented } from '@/src/components/ui/Segmented';
import { gamesRepo, useGames } from '@/src/data/games-session';
import { DIFFICULTY_HINT, DIFFICULTY_LABEL, GAMES, personality } from '@/src/games/catalog';
import { DIFFICULTIES, type Difficulty, GAME_IDS, isGameId } from '@/src/games/core';
import { inviteText } from '@/src/games/share-text';
import { useSeenRules } from '@/src/features/games/seen';
import { challengeLink, inviteFailure, shareResultMessage, shareText } from '@/src/features/games/share';
import { GameArt } from '@/src/features/games/ui/GameArt';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

const OUTCOME = { win: 'Won', loss: 'Lost', draw: 'Drew' } as const;

// Static web export renders a page per game, as it does for lessons.
export function generateStaticParams() {
  return GAME_IDS.map((gameId) => ({ gameId }));
}

/**
 * A game's entry: what it is, its rules (in full before the first match, one tap away after), the opponent and
 * difficulty, then Play. Nothing here is required to play — no name, no sign-up, no leaderboard.
 */
export default function GameScreen() {
  const insets = useSafeAreaInsets();
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const seen = useSeenRules((s) => s.seen);
  const seenLoaded = useSeenRules((s) => s.loaded);
  const markSeen = useSeenRules((s) => s.markSeen);
  const mine = useGames((s) => s.mine);
  const loadMine = useGames((s) => s.loadMine);
  const valid = isGameId(gameId);
  const [bot, setBot] = useState<string>(valid ? GAMES[gameId].personalities[0].id : '');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    void useSeenRules.getState().load();
  }, []);
  useFocusEffect(
    useCallback(() => {
      void loadMine();
    }, [loadMine]),
  );

  if (!valid) return <MessageScreen title="Game not found" body="This game isn’t available in this version of the app." />;
  const g = GAMES[gameId];
  const firstTime = seenLoaded && !seen[gameId];
  const showRules = firstTime || rulesOpen;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/games'));

  const play = () => {
    markSeen(gameId);
    router.push({ pathname: '/games/play', params: { game: gameId, bot, difficulty } });
  };

  const invite = async () => {
    setInviting(true);
    setNote(null);
    try {
      const c = await gamesRepo.createChallenge(gameId, bot, difficulty);
      const link = challengeLink(c.token);
      const message = inviteText(gameId, bot, difficulty, null);
      setNote(shareResultMessage(await shareText(message, link), 'invite', `${message}\n${link}`) ?? 'Each of you plays your own match on the same draws; compare when you’re both done. Play it yourself from the link too.');
    } catch (e) {
      setNote(inviteFailure(e));
    } finally {
      setInviting(false);
    }
  };

  const history =
    mine.status === 'ready'
      ? [...mine.data.practice.map((p) => ({ ...p, at: p.playedAt, kind: 'practice' as const })), ...mine.data.matches.map((m) => ({ ...m, at: m.completedAt ?? 0 }))]
          .filter((r) => r.game === gameId)
          .sort((a, b) => b.at - a.at)
          .slice(0, 5)
      : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <View style={styles.head}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
          </View>

          <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
            <GameArt game={gameId} size={84} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="title" accessibilityRole="header">
                {g.title}
              </AppText>
              <AppText variant="small" color={colors.textBody}>
                {g.concept}
              </AppText>
            </View>
          </View>
          <AppText color={colors.textBody}>{g.action}</AppText>

          <Card style={{ gap: space.sm }}>
            <Pressable
              onPress={() => setRulesOpen((v) => !v)}
              disabled={firstTime}
              accessibilityRole="button"
              accessibilityState={{ expanded: showRules }}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}>
              <SectionLabel color={firstTime ? colors.insight : undefined}>{firstTime ? 'Before your first game: the rules' : 'How to play'}</SectionLabel>
              <View style={{ flex: 1 }} />
              {!firstTime ? <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: showRules ? '180deg' : '0deg' }] }} /> : null}
            </Pressable>
            {showRules ? (
              g.rules.map((r, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                  <AppText variant="small" color={colors.textMuted} tabular>
                    {i + 1}.
                  </AppText>
                  <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
                    {r}
                  </AppText>
                </View>
              ))
            ) : (
              <AppText variant="small" color={colors.textMuted}>
                {g.scoring}
              </AppText>
            )}
          </Card>

          <View style={{ gap: space.sm }}>
            <SectionLabel>{gameId === 'two-thirds' ? 'Who’s in the crowd' : 'Your opponent'}</SectionLabel>
            {g.personalities.map((p) => (
              <ChoiceCard key={p.id} compact title={p.name} description={p.summary} selected={bot === p.id} onSelect={() => setBot(p.id)} tone="orange" />
            ))}
          </View>

          <View style={{ gap: space.xs }}>
            <Segmented label="Difficulty" options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))} value={difficulty} onChange={setDifficulty} tone="orange" />
            <AppText variant="caption" color={colors.textMuted}>
              {DIFFICULTY_HINT[difficulty]}. Same rules and payoffs on every level.
            </AppText>
          </View>

          <Button label={`Play vs ${personality(gameId, bot)?.name ?? bot}`} icon={Play} onPress={play} />
          <Button label={inviting ? 'Creating link…' : 'Challenge a friend to this'} variant="secondary" icon={UserPlus} iconPosition="left" disabled={inviting} onPress={() => void invite()} />
          {note ? (
            <AppText variant="small" color={colors.textMuted} selectable accessibilityLiveRegion="polite">
              {note}
            </AppText>
          ) : null}

          {history.length ? (
            <Card style={{ gap: space.xs }}>
              <SectionLabel>Your recent games</SectionLabel>
              {history.map((h, i) => (
                <View key={i} style={styles.hist}>
                  <AppText variant="small" weight="semibold" color={h.outcome === 'win' ? colors.success : h.outcome === 'loss' ? colors.rivalText : colors.textBody} style={{ width: 44 }}>
                    {h.outcome ? OUTCOME[h.outcome] : '—'}
                  </AppText>
                  <AppText variant="small" color={colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
                    {personality(gameId, h.bot)?.name ?? h.bot} · {DIFFICULTY_LABEL[h.difficulty]}
                    {h.kind === 'competition' ? ' · weekly' : h.kind === 'challenge' ? ' · challenge' : ''}
                  </AppText>
                  <AppText variant="small" tabular color={colors.textMuted}>
                    {h.playerScore}–{h.botScore}
                  </AppText>
                </View>
              ))}
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center' },
  hist: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: radius.sm },
});
