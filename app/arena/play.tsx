import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Badge } from '@/src/components/ui/Card';
import { IconButton } from '@/src/components/ui/Button';
import { ArrowLeft } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { ARENA, LENGTH_LABEL, LEVEL_LABEL, opponentName } from '@/src/arena/catalog';
import { type ArenaGameId, CODENAMES, type Level, type MatchLength, type Setup, isArenaId, isLength, isLevel } from '@/src/arena/core';
import type { CoopOpponent, CoopVariant } from '@/src/arena/cooperation';
import { MYSTERY, hiddenOpponent } from '@/src/arena/reads';
import { arenaEngine } from '@/src/arena/registry';
import { randomSeed } from '@/src/games/core';
import { useArenaRecords } from '@/src/features/arena/records';
import { useArenaMatch } from '@/src/features/arena/useArenaMatch';
import { useOpponentRead } from '@/src/features/arena/useOpponentRead';
import { ArenaResult } from '@/src/features/arena/ui/ArenaResult';
import { AuctionBoard } from '@/src/features/arena/ui/AuctionBoard';
import { CooperationMatch } from '@/src/features/arena/ui/CooperationMatch';
import { LIBRARY_BOARDS, TEAM_GAMES } from '@/src/features/arena/ui/library';
import { MarketBoard } from '@/src/features/arena/ui/MarketBoard';
import { CoachTip, ScoreStrip } from '@/src/features/arena/ui/parts';
import { ReadPanel } from '@/src/features/arena/ui/ReadPanel';
import { SignalBoard } from '@/src/features/arena/ui/SignalBoard';
import { UltimatumGameBoard } from '@/src/features/arena/ui/UltimatumGameBoard';
import { MatchReflection } from '@/src/features/reflections/ReflectionCard';
import { RepeatDone, RepeatPanel } from '@/src/features/repeat/RepeatPanel';
import { useRepeat } from '@/src/features/repeat/useRepeat';
import { ARENA_REPEAT } from '@/src/repeat/arena';
import { NO_REPEAT } from '@/src/repeat/plan';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

type Params = { game?: string; persona?: string; level?: string; length?: string; variant?: string };

/** Games whose scoreboard compares you with the best of several rivals. */
const FIELD_GAMES: ReadonlySet<ArenaGameId> = new Set(['auction', 'market', 'commons', 'coalition']);
/** Games whose board shows its own progress instead of a score strip (the score is decided at the end). */
const NO_STRIP: ReadonlySet<ArenaGameId> = new Set(['mole', ...TEAM_GAMES]);

/**
 * A Strategy Arena match, played entirely on the device. Params come from the game's setup screen.
 * `persona=mystery` picks a hidden opponent from the match seed on the device, so it never appears in the URL; a
 * rematch draws a new seed and so a new hidden opponent.
 */
export default function ArenaPlayScreen() {
  const p = useLocalSearchParams<Params>();
  const valid = isArenaId(p.game) && typeof p.persona === 'string' && (p.persona === MYSTERY || arenaEngine(p.game).opponents.includes(p.persona)) && isLevel(p.level) && isLength(p.length) && arenaEngine(p.game).variants.includes(p.variant);
  if (!valid) return <MessageScreen title="Game not found" body="That game, opponent or setting isn’t available." />;
  return <Rematches key={`${p.game}:${p.persona}:${p.level}:${p.length}:${p.variant}`} game={p.game as ArenaGameId} persona={p.persona!} level={p.level as Level} length={p.length as MatchLength} variant={p.variant!} />;
}

function Rematches(props: { game: ArenaGameId; persona: string; level: Level; length: MatchLength; variant: string }) {
  // A fresh seed for every match; the seed doubles as the session key, so a rematch remounts from a clean state.
  const [seed, setSeed] = useState(randomSeed);
  const again = () => setSeed(randomSeed());
  const mystery = props.persona === MYSTERY;
  const persona = mystery ? hiddenOpponent(arenaEngine(props.game).opponents, seed) : props.persona;
  if (props.game === 'cooperation') {
    return <CooperationMatch key={seed} persona={persona as CoopOpponent} mystery={mystery} level={props.level} length={props.length} variant={props.variant as CoopVariant} seed={seed} onPlayAgain={again} />;
  }
  return <Session key={seed} {...props} persona={persona} mystery={mystery} seed={seed} onPlayAgain={again} />;
}

function Session({ game, persona, mystery, level, length, variant, seed, onPlayAgain }: { game: ArenaGameId; persona: string; mystery: boolean; level: Level; length: MatchLength; variant: string; seed: number; onPlayAgain: () => void }) {
  const insets = useSafeAreaInsets();
  const engine = arenaEngine(game);
  const setup: Setup<string, string> = { persona, level, length, variant, seed };
  const { state, act, over, result, refusal, newBest } = useArenaMatch(engine, setup);
  const coached = useArenaRecords((s) => s.coached[game]);
  const [tipHidden, setTipHidden] = useState(false);
  const g = ARENA[game];
  const team = TEAM_GAMES.has(game);
  const playedRounds = engine.played(state);
  const total = engine.rounds(length);
  const read = useOpponentRead(game, persona, mystery, playedRounds, total, over);
  const repeatable = ARENA_REPEAT[game];
  const repeat = useRepeat(repeatable ?? NO_REPEAT, {
    ctx: state,
    progress: { played: playedRounds, total, busy: false, over },
    // Through the match's own act: the engine validates, resolves and records every repeated round.
    play: (a) => {
      if (engine.validate(state, a) !== null) return false;
      act(a);
      return true;
    },
  });
  // Skipping the end-of-match guess is already an explicit "show me the results".
  const readShown = repeat.holding ? { ...read, skip: () => (repeat.release(), read.skip()) } : read;
  const hidden = !read.revealed;
  const name = hidden ? (team ? 'Your teammate' : 'Your opponent') : opponentName(game, persona);
  const scroll = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  // Bring the result's top into view once, when it first appears.
  const toResult = (y: number) => {
    if (scrolled.current) return;
    scrolled.current = true;
    scroll.current?.scrollTo({ y: Math.max(0, y - space.md), animated: true });
  };

  useEffect(() => {
    void useArenaRecords.getState().load();
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/arena/[gameId]', params: { gameId: game } }));
  const change = (next: { persona?: string; level?: Level }) => router.setParams({ persona: next.persona ?? (mystery ? MYSTERY : persona), level: next.level ?? level });

  const live = result ?? engine.result(state);
  const tip = !coached && !tipHidden && !over ? g.coach[Math.min(playedRounds, g.coach.length - 1)] : null;
  const showTip = tip && playedRounds < g.coach.length;
  // In a mystery auction or market the other bidders are personalities too; mask them all until the reveal.
  const nameOf = hidden ? (seat: number) => (seat === 0 ? 'You' : seat === 1 ? 'Your rival' : `Bidder ${CODENAMES[seat]}`) : undefined;
  const field = FIELD_GAMES.has(game);

  const board = (() => {
    // While a repeat runs the board is read-only: one round never gets two moves.
    const props = { state, act: repeat.running ? () => undefined : act, over, rivalName: name, nameOf };
    const Library = LIBRARY_BOARDS[game as keyof typeof LIBRARY_BOARDS];
    if (Library) return <Library {...props} />;
    switch (game) {
      case 'ultimatum-game':
        return <UltimatumGameBoard {...props} />;
      case 'auction':
        return <AuctionBoard {...props} />;
      case 'market':
        return <MarketBoard {...props} />;
      case 'signal':
        return <SignalBoard {...props} />;
      default:
        return null;
    }
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>
              {g.title}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            <Badge label={hidden ? (team ? 'Mystery teammate' : 'Mystery opponent') : name} tone="orange" />
            <Badge label={LEVEL_LABEL[level]} />
            <Badge label={`${LENGTH_LABEL[length]} · ${total} ${g.roundWord}`} tone="blue" />
            {g.variants.find((v) => v.id === variant)?.challenge ? <Badge label={g.variants.find((v) => v.id === variant)!.name} tone="amber" /> : null}
          </View>
          {NO_STRIP.has(game) ? null : (
            <ScoreStrip
              you={live.player}
              rival={field ? live.rival : live.standings.find((s) => !s.isPlayer)!.score}
              rivalName={field ? 'Best rival' : name}
              round={playedRounds + (over ? 0 : 1)}
              total={total}
              roundWord={g.roundWord === 'lots' ? 'Lot' : g.roundWord === 'turns' ? 'Turn' : 'Round'}
              unit={g.unit}
            />
          )}
          {showTip ? <CoachTip text={tip} onDismiss={() => setTipHidden(true)} /> : null}
          {refusal ? (
            <AppText variant="small" color={colors.danger} accessibilityLiveRegion="assertive">
              {refusal}
            </AppText>
          ) : null}
          <View style={repeat.running ? { pointerEvents: 'none' } : undefined}>{board}</View>
          {repeatable ? <RepeatPanel repeat={repeat} roundWord={g.roundWord} /> : null}
          <ReadPanel game={game} read={readShown} played={playedRounds} />
          {over && result && read.revealed && repeat.holding ? <RepeatDone repeat={repeat} roundWord={g.roundWord} /> : null}
          {over && result && read.revealed && !repeat.holding ? (
            <View onLayout={(e) => toResult(e.nativeEvent.layout.y)}>
              <ArenaResult
                game={game}
                result={result}
                debrief={engine.debrief(state)}
                persona={persona}
                level={level}
                newBest={newBest}
                onPlayAgain={onPlayAgain}
                onChange={change}
                onLibrary={() => router.navigate('/games')}
                read={mystery && read.verdict ? { guess: read.guess, verdict: read.verdict } : null}
                reflection={<MatchReflection game={game} record={state} />}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
});
