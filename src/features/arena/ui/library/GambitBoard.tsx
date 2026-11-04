import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { COLS, DASH_P, type GMove, type GTurn, type GambitState, HOME_TO_WIN, type Piece, ROWS, STRIKE_P, legalMoves, odds, square } from '@/src/arena/gambit';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Row } from '../parts';
import { trackPieces } from './piece-ids';

type Sq = [number, number];
const KIND_LABEL = { step: 'Step', dash: 'Dash', strike: 'Strike' } as const;
const VERB = { step: 'stepped', dash: 'dashed', strike: 'struck' } as const;
const KIND_TINT = { step: colors.primary, dash: colors.insight, strike: colors.danger } as const;
/** Cell gap on each side. */
const M = 2;

/** Keeps each piece's identity between positions, so it slides instead of vanishing. */
function usePieceIds(pieces: readonly Piece[]) {
  const [tracked, setTracked] = useState(() => ({ pieces, ids: trackPieces([], pieces) }));
  if (tracked.pieces === pieces) return tracked.ids;
  const ids = trackPieces(tracked.ids, pieces);
  setTracked({ pieces, ids });
  return ids;
}

function PieceDot({ x, y, size, side, marked }: { x: number; y: number; size: number; side: Piece['side']; marked: boolean }) {
  const reduced = useMotionReduced();
  const px = useSharedValue(x);
  const py = useSharedValue(y);
  useEffect(() => {
    px.set(reduced ? x : withTiming(x, { duration: 220 }));
    py.set(reduced ? y : withTiming(y, { duration: 220 }));
  }, [x, y, reduced, px, py]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: px.get() }, { translateY: py.get() }] }));
  return <Animated.View pointerEvents="none" style={[styles.piece, { width: size, height: size, borderRadius: size / 2, backgroundColor: side === 'player' ? colors.primary : colors.rival }, marked && { borderWidth: 2.5, borderColor: colors.insight }, style]} />;
}

const describe = (t: GTurn, who: string) => `${who} ${VERB[t.move.kind]} ${square(...t.move.from)} → ${square(...t.move.to)}${t.move.kind === 'step' ? '' : t.success ? ', and it worked' : ', and it failed'}${t.captured ? ', capturing a piece' : ''}${t.home ? ', and reached home' : ''}.`;

const tallyOf = (turns: readonly GTurn[], side: 'player' | 'bot') => {
  const mine = turns.filter((t) => t.side === side);
  const risky = mine.filter((t) => t.move.kind !== 'step');
  return { safe: mine.length - risky.length, risky: risky.length, landed: risky.filter((t) => t.success).length };
};

/** The board is the interface: tap a piece, tap a square with its odds on it. The board never moves on the screen. */
export function GambitBoard({ state, act, over, rivalName }: BoardProps<GambitState, { from: Sq; to: Sq }>) {
  const { width } = useWindowDimensions();
  const [sel, setSel] = useState<Sq | null>(null);
  const cell = Math.floor(Math.min(width - space.lg * 2 - 4, MAX_CONTENT_WIDTH) / COLS) - M * 2;
  const pitch = cell + M * 2;
  const moves = over ? [] : legalMoves(state, 'player');
  const mine = sel ? moves.filter((m) => m.from[0] === sel[0] && m.from[1] === sel[1]) : [];
  const target = (r: number, c: number) => mine.find((m) => m.to[0] === r && m.to[1] === c);
  const lastTwo = state.turns.slice(-2);
  const lastBot = lastTwo.find((t) => t.side === 'bot');
  const lastMine = lastTwo.find((t) => t.side === 'player');
  const skip = state.skipped[state.skipped.length - 1];
  const skippedNow = skip && skip.side === 'player' && skip.at >= state.turns.length - 1;
  const pieces = usePieceIds(state.pieces);
  const me = tallyOf(state.turns, 'player');
  const them = tallyOf(state.turns, 'bot');
  const dot = cell * 0.62;

  const tap = (r: number, c: number) => {
    const m = target(r, c);
    if (m) {
      haptic.commit();
      act({ from: m.from, to: m.to });
      setSel(null);
      return;
    }
    const piece = state.pieces.find((x) => x.r === r && x.c === c && x.side === 'player');
    if (piece) {
      haptic.select();
      setSel([r, c]);
    } else setSel(null);
  };

  return (
    <View style={{ gap: space.sm }}>
      <View style={[styles.board, { width: pitch * COLS + 4, height: pitch * ROWS + 4 }]} accessibilityLabel="Game board">
        {Array.from({ length: ROWS }, (_, k) => ROWS - 1 - k).map((r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {Array.from({ length: COLS }, (_, c) => {
              const piece = state.pieces.find((x) => x.r === r && x.c === c);
              const m = target(r, c);
              const selected = sel && sel[0] === r && sel[1] === c;
              const from = lastBot && lastBot.move.from[0] === r && lastBot.move.from[1] === c;
              const home = r === ROWS - 1 || r === 0;
              return (
                <Pressable
                  key={c}
                  onPress={() => tap(r, c)}
                  disabled={over}
                  accessibilityRole="button"
                  accessibilityLabel={`${square(r, c)}${piece ? `, ${piece.side === 'player' ? 'your piece' : 'opponent piece'}` : ''}${m ? `, ${KIND_LABEL[m.kind]} here, ${Math.round(odds(m.kind) * 100)} percent` : ''}${from ? ', your opponent just moved from here' : ''}`}
                  style={[
                    styles.cell,
                    { width: cell, height: cell, backgroundColor: (r + c) % 2 ? colors.bgRaised : colors.surface },
                    home && { backgroundColor: r === ROWS - 1 ? 'rgba(37,99,235,0.14)' : 'rgba(249,115,22,0.12)' },
                    from && { borderColor: colors.insight, borderStyle: 'dashed' },
                    m && { borderColor: KIND_TINT[m.kind], borderWidth: 2 },
                    selected && { borderColor: colors.text, borderWidth: 2 },
                  ]}>
                  {m ? (
                    <View style={styles.tag}>
                      <AppText variant="caption" weight="semibold" color={KIND_TINT[m.kind] === colors.primary ? colors.primaryText : KIND_TINT[m.kind]}>
                        {m.kind === 'step' ? '✓' : `${Math.round(odds(m.kind) * 100)}%`}
                      </AppText>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        {pieces.map(({ id, p }) => {
          const marked = !!lastBot && p.side === 'bot' && lastBot.move.to[0] === p.r && lastBot.move.to[1] === p.c;
          return <PieceDot key={id} side={p.side} size={dot} marked={marked} x={2 + p.c * pitch + (pitch - dot) / 2} y={2 + (ROWS - 1 - p.r) * pitch + (pitch - dot) / 2} />;
        })}
      </View>

      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="caption" color={colors.primaryText} tabular accessibilityLabel={`You: ${me.safe} safe moves, ${me.risky} risky, ${me.landed} of them landed.`}>
          You: {me.safe} safe · {me.risky} risky
        </AppText>
        <AppText variant="caption" color={colors.rivalText} tabular accessibilityLabel={`${rivalName}: ${them.safe} safe moves, ${them.risky} risky.`}>
          Them: {them.safe} safe · {them.risky} risky
        </AppText>
      </Row>

      <View style={{ minHeight: 40, gap: 2 }}>
        {skippedNow ? (
          <AppText variant="small" weight="semibold" color={colors.insight} accessibilityLiveRegion="polite">
            You had no legal move, so your turn was skipped.
          </AppText>
        ) : lastMine ? (
          <AppText variant="caption" color={colors.textBody} accessibilityLiveRegion="polite">
            {describe(lastMine, 'You')}
          </AppText>
        ) : null}
        {lastBot ? (
          <AppText variant="caption" color={colors.rivalText}>
            {describe(lastBot, rivalName)}
          </AppText>
        ) : null}
      </View>

      {!over ? (
        <AppText variant="caption" color={colors.textMuted}>
          {sel ? `Moves for ${square(...sel)}. ` : 'Tap a blue piece. '}Step ✓ always works · Dash {Math.round(DASH_P * 100)}% (miss: stays) · Strike {Math.round(STRIKE_P * 100)}% (miss: knocked back). First {HOME_TO_WIN} home to the top row wins.
        </AppText>
      ) : null}

      {state.turns.length > 1 ? (
        <MatchLog title="Moves so far" summary={`${them.risky} of ${them.safe + them.risky} of its moves were risky`}>
          {state.turns.slice(-12).map((t: GTurn, i) => (
            <AppText key={i} variant="caption" color={t.side === 'player' ? colors.textBody : colors.rivalText}>
              {describe({ ...t, move: t.move as GMove }, t.side === 'player' ? 'You' : 'They')}
            </AppText>
          ))}
        </MatchLog>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', padding: 2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, boxSizing: 'content-box' },
  cell: { margin: M, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  piece: { position: 'absolute', left: 0, top: 0 },
  tag: { position: 'absolute', bottom: 2, right: 3 },
});
