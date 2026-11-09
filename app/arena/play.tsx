import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { LeaveGuard } from '@/src/components/game/LeaveGuard';
import { MatchHeader, ScoreLine } from '@/src/components/game/MatchChrome';
import { MatchLog } from '@/src/components/game/MatchLog';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { ARENA, LENGTH_LABEL, LEVEL_LABEL, opponentName } from '@/src/arena/catalog';
import { type ArenaGameId, CODENAMES, type Level, type MatchLength, type Setup, isArenaId, isLength, isLevel } from '@/src/arena/core';
import type { CoopOpponent, CoopVariant } from '@/src/arena/cooperation';
import { MYSTERY, hiddenOpponent } from '@/src/arena/reads';
import { arenaEngine } from '@/src/arena/registry';
import { randomSeed } from '@/src/games/core';
import { useArenaRecords } from '@/src/features/arena/records';
import { useArenaMatch } from '@/src/features/arena/useArenaMatch';
import { useGameTelemetry } from '@/src/observability';
import { useOpponentRead } from '@/src/features/arena/useOpponentRead';
import { GameReview } from '@/src/features/review/GameReview';
import { reviewArena } from '@/src/review/review';
import { ArenaResult } from '@/src/features/arena/ui/ArenaResult';
import { AuctionBoard } from '@/src/features/arena/ui/AuctionBoard';
import { CooperationMatch } from '@/src/features/arena/ui/CooperationMatch';
import { LIBRARY_BOARDS, TEAM_GAMES } from '@/src/features/arena/ui/library';
import { MarketBoard } from '@/src/features/arena/ui/MarketBoard';
import { CoachTip } from '@/src/features/arena/ui/parts';
import { suspectName, type MoleState } from '@/src/arena/mole';
import { crewName, type SaboteurState } from '@/src/arena/saboteur';
import { ReadPanel } from '@/src/features/arena/ui/ReadPanel';
import { TournamentHint } from '@/src/features/tournament/ui/TournamentHint';
import { TournamentThought } from '@/src/features/tournament/ui/TournamentThought';
import { TournamentResult } from '@/src/features/tournament/ui/TournamentResult';
import { GauntletResult } from '@/src/features/tournament/ui/GauntletResult';
import { SignalBoard } from '@/src/features/arena/ui/SignalBoard';
import { UltimatumGameBoard } from '@/src/features/arena/ui/UltimatumGameBoard';
import { MatchReflection } from '@/src/features/reflections/ReflectionCard';
import { RepeatDone, RepeatPanel } from '@/src/features/repeat/RepeatPanel';
import { useRepeat } from '@/src/features/repeat/useRepeat';
import { ARENA_REPEAT } from '@/src/repeat/arena';
import { NO_REPEAT } from '@/src/repeat/plan';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

/** `t`: a tournament match id (src/features/tournament): the result is recorded there and its reveal shown. */
/** `g`: a Gauntlet bout token (src/features/tournament/gauntlet-store.ts): the result goes to the run. */
type Params = { game?: string; persona?: string; level?: string; length?: string; variant?: string; t?: string; r?: string; g?: string };

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
  return <Rematches key={`${p.game}:${p.persona}:${p.level}:${p.length}:${p.variant}`} game={p.game as ArenaGameId} persona={p.persona!} level={p.level as Level} length={p.length as MatchLength} variant={p.variant!} tournament={typeof p.t === 'string' && p.t ? p.t : undefined} replay={p.r === '1'} gauntlet={typeof p.g === 'string' && p.g ? p.g : undefined} />;
}

function Rematches(props: { game: ArenaGameId; persona: string; level: Level; length: MatchLength; variant: string; tournament?: string; replay?: boolean; gauntlet?: string }) {
  // A fresh seed for every match; the seed doubles as the session key, so a rematch remounts from a clean state.
  const [seed, setSeed] = useState(randomSeed);
  const again = () => setSeed(randomSeed());
  const mystery = props.persona === MYSTERY;
  const persona = mystery ? hiddenOpponent(arenaEngine(props.game).opponents, seed) : props.persona;
  if (props.game === 'cooperation') {
    return <CooperationMatch key={seed} persona={persona as CoopOpponent} mystery={mystery} level={props.level} length={props.length} variant={props.variant as CoopVariant} seed={seed} onPlayAgain={again} tournament={props.tournament} replay={props.replay} gauntlet={props.gauntlet} />;
  }
  return <Session key={seed} {...props} persona={persona} mystery={mystery} seed={seed} onPlayAgain={again} />;
}

function Session({ game, persona, mystery, level, length, variant, seed, onPlayAgain, tournament, replay, gauntlet }: { game: ArenaGameId; persona: string; mystery: boolean; level: Level; length: MatchLength; variant: string; seed: number; onPlayAgain: () => void; tournament?: string; replay?: boolean; gauntlet?: string }) {
  const insets = useSafeAreaInsets();
  const engine = arenaEngine(game);
  const setup: Setup<string, string> = { persona, level, length, variant, seed };
  const { state, act, over, result, refusal, newBest, actions } = useArenaMatch(engine, setup);
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
  const finished = over && !!result && read.revealed && !repeat.holding;
  // Computed once the match is over: it replays the match a few hundred times, so never while playing.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `actions` is a stable ref, complete once `over`.
  const review = useMemo(() => (over ? reviewArena(engine, setup, actions) : null), [over, engine, seed]);
  useGameTelemetry({ game_id: game, system: 'arena', mode: tournament ? 'tournament' : 'practice', level, variant, length, mystery }, { round: playedRounds, roundsTotal: total, finished, outcome: result?.outcome ?? null });
  const challenge = g.variants.find((v) => v.id === variant && v.challenge);
  const roundLabel = g.roundWord === 'lots' ? 'Lot' : g.roundWord === 'turns' ? 'Turn' : 'Round';
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
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.huge }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <LeaveGuard started={playedRounds > 0} over={over} />
          <MatchHeader title={g.title} meta={[hidden ? (team ? 'Mystery teammate' : 'Mystery opponent') : name, LEVEL_LABEL[level], LENGTH_LABEL[length], challenge?.name].filter(Boolean).join(' · ')} progress={engine.endsEarly ? `${roundLabel} ${Math.min(playedRounds + (over ? 0 : 1), total)} · up to ${total}` : `${roundLabel} ${Math.min(playedRounds + (over ? 0 : 1), total)}/${total}`} onBack={close} />
          {NO_STRIP.has(game) || finished ? null : <ScoreLine you={live.player} rival={field ? live.rival : live.standings.find((s) => !s.isPlayer)!.score} rivalName={field ? 'Best rival' : hidden ? (team ? 'Teammate' : 'Opponent') : name} unit={g.unit} />}
          {showTip ? <CoachTip text={tip} onDismiss={() => setTipHidden(true)} /> : null}
          {tournament ? <TournamentThought matchId={tournament} played={playedRounds} total={total} over={over} /> : null}
          {tournament && !over ? <TournamentHint matchId={tournament} /> : null}
          {refusal ? (
            <AppText variant="small" color={colors.danger} accessibilityLiveRegion="assertive">
              {refusal}
            </AppText>
          ) : null}
          {finished ? null : <View style={repeat.running ? { pointerEvents: 'none' } : undefined}>{board}</View>}
          {repeatable ? <RepeatPanel repeat={repeat} roundWord={g.roundWord} /> : null}
          <ReadPanel game={game} read={readShown} played={playedRounds} />
          {over && result && read.revealed && repeat.holding ? <RepeatDone repeat={repeat} roundWord={g.roundWord} /> : null}
          {finished && result ? (
            <View onLayout={(e) => toResult(e.nativeEvent.layout.y)} style={{ gap: space.md }}>
              {tournament ? <TournamentResult matchId={tournament} outcome={result.outcome} level={level} readCorrect={read.verdict === 'correct'} debrief={engine.debrief(state)} onRematch={onPlayAgain} replay={replay} /> : null}
              {gauntlet ? <GauntletResult token={gauntlet} outcome={result.outcome} /> : null}
              <ArenaResult
                unmasked={game === 'mole' || game === 'saboteur' ? unmaskedLine(game, state) : null}
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
                practice={!tournament && !gauntlet}
              />
              {review ? <GameReview review={review} unit={g.unit} /> : null}
              <MatchLog title="Final board" summary="How the match ended">
                {board}
              </MatchLog>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/** The hidden-role games' own final reveal, for the top of the results. */
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
