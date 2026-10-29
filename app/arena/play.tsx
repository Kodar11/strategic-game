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
import { ARENA, LENGTH_LABEL, LEVEL_LABEL } from '@/src/arena/catalog';
import { type ArenaGameId, type Level, type MatchLength, PERSONA_NAME, type Persona, type Setup, isArenaId, isLength, isLevel, isPersona } from '@/src/arena/core';
import { arenaEngine } from '@/src/arena/registry';
import { randomSeed } from '@/src/games/core';
import { useArenaRecords } from '@/src/features/arena/records';
import { useArenaMatch } from '@/src/features/arena/useArenaMatch';
import { ArenaResult } from '@/src/features/arena/ui/ArenaResult';
import { AuctionBoard } from '@/src/features/arena/ui/AuctionBoard';
import { CooperationBoard } from '@/src/features/arena/ui/CooperationBoard';
import { MarketBoard } from '@/src/features/arena/ui/MarketBoard';
import { CoachTip, ScoreStrip } from '@/src/features/arena/ui/parts';
import { SignalBoard } from '@/src/features/arena/ui/SignalBoard';
import { UltimatumGameBoard } from '@/src/features/arena/ui/UltimatumGameBoard';
import { coopPar } from '@/src/arena/cooperation';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

type Params = { game?: string; persona?: string; level?: string; length?: string; variant?: string };

/** A Strategy Arena match, played entirely on the device. Params come from the game's setup screen. */
export default function ArenaPlayScreen() {
  const p = useLocalSearchParams<Params>();
  if (!isArenaId(p.game) || !isPersona(p.persona) || !isLevel(p.level) || !isLength(p.length) || !arenaEngine(p.game).variants.includes(p.variant)) {
    return <MessageScreen title="Game not found" body="That game, opponent or setting isn’t available." />;
  }
  return <Rematches key={`${p.game}:${p.persona}:${p.level}:${p.length}:${p.variant}`} game={p.game} persona={p.persona} level={p.level} length={p.length} variant={p.variant!} />;
}

function Rematches(props: { game: ArenaGameId; persona: Persona; level: Level; length: MatchLength; variant: string }) {
  // A fresh seed for every match; the seed doubles as the session key, so a rematch remounts from a clean state.
  const [seed, setSeed] = useState(randomSeed);
  return <Session key={seed} {...props} seed={seed} onPlayAgain={() => setSeed(randomSeed())} />;
}

function Session({ game, persona, level, length, variant, seed, onPlayAgain }: { game: ArenaGameId; persona: Persona; level: Level; length: MatchLength; variant: string; seed: number; onPlayAgain: () => void }) {
  const insets = useSafeAreaInsets();
  const engine = arenaEngine(game);
  const setup: Setup = { persona, level, length, variant, seed };
  const { state, act, over, result, refusal, newBest } = useArenaMatch(engine, setup);
  const coached = useArenaRecords((s) => s.coached[game]);
  const [tipHidden, setTipHidden] = useState(false);
  const g = ARENA[game];
  const name = PERSONA_NAME[persona];
  const playedRounds = engine.played(state);
  const scroll = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  // Bring the result's top into view once, when the last round resolves.
  const toResult = (y: number) => {
    if (scrolled.current) return;
    scrolled.current = true;
    scroll.current?.scrollTo({ y: Math.max(0, y - space.md), animated: true });
  };

  useEffect(() => {
    void useArenaRecords.getState().load();
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/arena/[gameId]', params: { gameId: game } }));
  const change = (next: { persona?: Persona; level?: Level }) => router.setParams({ persona: next.persona ?? persona, level: next.level ?? level });

  const live = result ?? engine.result(state);
  const target = game === 'cooperation' ? `win: ≥ ${coopPar(state)} & not behind` : undefined;
  const tip = !coached && !tipHidden && !over ? g.coach[Math.min(playedRounds, g.coach.length - 1)] : null;
  const showTip = tip && playedRounds < g.coach.length;

  const board = (() => {
    const props = { state, act, over, rivalName: name };
    switch (game) {
      case 'cooperation':
        return <CooperationBoard {...props} />;
      case 'ultimatum-game':
        return <UltimatumGameBoard {...props} />;
      case 'auction':
        return <AuctionBoard {...props} />;
      case 'market':
        return <MarketBoard {...props} />;
      case 'signal':
        return <SignalBoard {...props} />;
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
            <Badge label={name} tone="orange" />
            <Badge label={LEVEL_LABEL[level]} />
            <Badge label={`${LENGTH_LABEL[length]} · ${engine.rounds(length)} ${g.roundWord}`} tone="blue" />
            {g.variants.find((v) => v.id === variant)?.challenge ? <Badge label={g.variants.find((v) => v.id === variant)!.name} tone="amber" /> : null}
          </View>
          <ScoreStrip you={live.player} rival={game === 'auction' || game === 'market' ? live.rival : live.standings.find((s) => !s.isPlayer)!.score} rivalName={game === 'auction' || game === 'market' ? 'Best rival' : name} round={playedRounds + (over ? 0 : 1)} total={engine.rounds(length)} roundWord={g.roundWord === 'lots' ? 'Lot' : 'Round'} unit={g.unit} target={target} />
          {showTip ? <CoachTip text={tip} onDismiss={() => setTipHidden(true)} /> : null}
          {refusal ? (
            <AppText variant="small" color={colors.danger} accessibilityLiveRegion="assertive">
              {refusal}
            </AppText>
          ) : null}
          {board}
          {over && result ? (
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
