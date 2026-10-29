import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ArrowLeft, ChevronDown, CircleCheck, CircleX, Play, Target, UserPlus } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { Segmented } from '@/src/components/ui/Segmented';
import { gamesRepo, useGames } from '@/src/data/games-session';
import { DIFFICULTY_HINT, DIFFICULTY_LABEL, GAMES, personality } from '@/src/games/catalog';
import { DIFFICULTIES, type Difficulty, GAME_IDS, isGameId } from '@/src/games/core';
import { inviteText } from '@/src/games/share-text';
import { readTarget } from '@/src/games/reads';
import { ENGINES } from '@/src/games/registry';
import { MYSTERY_NAME } from '@/src/games/rps-insight';
import { type HistoryItem, ago, opponentHistory } from '@/src/features/games/history';
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
  // Every game starts with a mystery opponent (null); choosing a personality is deliberate practice.
  const [bot, setBot] = useState<string | null>(null);
  const [chooseOpen, setChooseOpen] = useState(false);
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

  const mystery = bot === null;
  const play = () => {
    markSeen(gameId);
    router.push({ pathname: '/games/play', params: mystery ? { game: gameId, opponent: 'mystery', difficulty } : { game: gameId, bot, difficulty } });
  };
  const practise = (h: HistoryItem) => {
    markSeen(gameId);
    router.push({ pathname: '/games/play', params: { game: gameId, bot: h.bot, difficulty: h.difficulty } });
  };

  const invite = async () => {
    setInviting(true);
    setNote(null);
    try {
      // A friend challenge always names its opponent; from the mystery setting it gets a random one.
      const bots = ENGINES[gameId].bots;
      const opponent = bot ?? bots[Math.floor(Math.random() * bots.length)];
      const c = await gamesRepo.createChallenge(gameId, opponent, difficulty);
      const link = challengeLink(c.token);
      const message = inviteText(gameId, opponent, difficulty, null);
      setNote(shareResultMessage(await shareText(message, link), 'invite', `${message}\n${link}`) ?? 'Each of you plays your own match on the same draws; compare when you’re both done. Play it yourself from the link too.');
    } catch (e) {
      setNote(inviteFailure(e));
    } finally {
      setInviting(false);
    }
  };

  const opponents = gameId === 'rps' && mine.status === 'ready' ? opponentHistory(mine.data, gameId) : [];
  const history =
    gameId !== 'rps' && mine.status === 'ready'
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

          {(
            <View style={{ gap: space.sm }}>
              <SectionLabel>{gameId === 'two-thirds' ? 'Who’s in the crowd' : gameId === 'stag-hunt' ? 'Your partner' : 'Your opponent'}</SectionLabel>
              <ChoiceCard
                compact
                title={MYSTERY_NAME}
                description={`One of the four personalities, hidden until the match ends. Read ${readTarget(gameId)} — and name its personality for Insight Points.`}
                selected={mystery}
                onSelect={() => setBot(null)}
                tone="orange"
              />
              <Pressable
                onPress={() => setChooseOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: chooseOpen }}
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 36 }}>
                <AppText variant="small" weight="semibold" color={colors.primaryText} style={{ flex: 1 }}>
                  Choose a specific opponent
                </AppText>
                <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: chooseOpen ? '180deg' : '0deg' }] }} />
              </Pressable>
              {chooseOpen ? (
                <>
                  <AppText variant="caption" color={colors.textMuted}>
                    Deliberate practice: you know who you face, so there’s no read to make.
                  </AppText>
                  {g.personalities.map((p) => (
                    <ChoiceCard key={p.id} compact title={p.name} description={p.summary} selected={bot === p.id} onSelect={() => setBot(p.id)} tone="orange" />
                  ))}
                </>
              ) : null}
            </View>
          )}

          <View style={{ gap: space.xs }}>
            <Segmented label="Difficulty" options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))} value={difficulty} onChange={setDifficulty} tone="orange" />
            <AppText variant="caption" color={colors.textMuted}>
              {DIFFICULTY_HINT[difficulty]}. Same rules and payoffs on every level.
            </AppText>
          </View>

          <Button label={bot === null ? `Play vs a ${MYSTERY_NAME.toLowerCase()}` : `Play vs ${personality(gameId, bot)?.name ?? bot}`} icon={Play} onPress={play} />
          <Button label={inviting ? 'Creating link…' : 'Challenge a friend to this'} variant="secondary" icon={UserPlus} iconPosition="left" disabled={inviting} onPress={() => void invite()} />
          {note ? (
            <AppText variant="small" color={colors.textMuted} selectable accessibilityLiveRegion="polite">
              {note}
            </AppText>
          ) : null}

          {opponents.length ? <OpponentHistory items={opponents} onPractise={practise} /> : null}

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

/** Rock, Paper, Scissors: recent opponents — revealed, since these games are over — with a quick rematch. */
function OpponentHistory({ items, onPractise }: { items: HistoryItem[]; onPractise: (h: HistoryItem) => void }) {
  const [now] = useState(() => Date.now());
  return (
    <Card style={{ gap: space.xs }}>
      <SectionLabel>Opponent history</SectionLabel>
      {items.map((h, i) => {
        const name = personality('rps', h.bot)?.name ?? h.bot;
        const tag = { mystery: 'Mystery', chosen: 'Chosen', practice: 'Practice', competition: 'Weekly', challenge: 'Challenge' }[h.kind];
        return (
          <View key={i} style={[styles.hist, { flexWrap: 'wrap' }]}>
            <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <AppText variant="small" weight="semibold" color={h.outcome === 'win' ? colors.success : h.outcome === 'loss' ? colors.rivalText : colors.textBody}>
                  {h.outcome ? OUTCOME[h.outcome] : '—'} {h.playerScore}–{h.botScore}
                </AppText>
                <AppText variant="small" color={colors.textBody} numberOfLines={1} style={{ flexShrink: 1 }}>
                  vs {name}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <AppText variant="caption" color={colors.textMuted}>
                  {DIFFICULTY_LABEL[h.difficulty]} · {tag} · {ago(h.at, now)}
                </AppText>
                {h.read ? (
                  h.read.correct ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} accessible accessibilityLabel={`Read right, plus ${h.read.points} Insight Points`}>
                      <CircleCheck size={12} color={colors.success} />
                      <AppText variant="caption" color={colors.success}>
                        +{h.read.points}
                      </AppText>
                    </View>
                  ) : (
                    <View accessible accessibilityLabel="Read missed">
                      <CircleX size={12} color={colors.textMuted} />
                    </View>
                  )
                ) : null}
              </View>
            </View>
            <Button
              label="Practise again"
              variant="ghost"
              compact
              icon={Target}
              iconPosition="left"
              onPress={() => onPractise(h)}
              accessibilityHint={`A practice match against ${name}, ${DIFFICULTY_LABEL[h.difficulty]}`}
            />
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center' },
  hist: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: radius.sm },
});
