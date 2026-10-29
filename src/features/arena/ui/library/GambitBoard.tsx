import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { COLS, DASH_P, type GMove, type GambitState, HOME_TO_WIN, ROWS, STRIKE_P, legalMoves, odds, square } from '@/src/arena/gambit';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row } from '../parts';
import { Overline } from './kit';

type Sq = [number, number];
const KIND_LABEL = { step: 'Step', dash: 'Dash', strike: 'Strike' } as const;
const VERB = { step: 'stepped', dash: 'dashed', strike: 'struck' } as const;
const KIND_TINT = { step: colors.primary, dash: colors.insight, strike: colors.danger } as const;

export function GambitBoard({ state, act, over, rivalName }: BoardProps<GambitState, { from: Sq; to: Sq }>) {
  const reduced = useMotionReduced();
  const { width } = useWindowDimensions();
  const [sel, setSel] = useState<Sq | null>(null);
  const cell = Math.floor(Math.min(width - space.lg * 2, MAX_CONTENT_WIDTH) / COLS) - 4;
  const moves = over ? [] : legalMoves(state, 'player');
  const mine = sel ? moves.filter((m) => m.from[0] === sel[0] && m.from[1] === sel[1]) : [];
  const target = (r: number, c: number) => mine.find((m) => m.to[0] === r && m.to[1] === c);
  const lastTwo = state.turns.slice(-2);
  const lastBot = lastTwo.find((t) => t.side === 'bot');
  const lastMine = lastTwo.find((t) => t.side === 'player');

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

  const describe = (t: { side: string; move: GMove; success: boolean; captured: boolean; home: boolean }, who: string) =>
    `${who} ${VERB[t.move.kind]} ${square(...t.move.from)} → ${square(...t.move.to)}${t.move.kind === 'step' ? '' : t.success ? ' — it worked' : ' — it failed'}${t.captured ? ', capturing a piece' : ''}${t.home ? ', and reached home' : ''}.`;

  return (
    <View style={{ gap: space.lg }}>
      {lastMine ? (
        <Reveal revealKey={state.turns.length} tone={lastMine.move.kind !== 'step' ? (lastMine.success ? 'good' : 'bad') : 'plain'} overline={`Turn ${Math.ceil(state.turns.length / 2)}`}>
          <AppText variant="small" color={colors.textBody} accessibilityLiveRegion="polite">
            {describe(lastMine, 'You')}
          </AppText>
          {lastBot ? (
            <AppText variant="small" color={colors.rivalText}>
              {describe(lastBot, rivalName)}
            </AppText>
          ) : null}
        </Reveal>
      ) : null}

      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="caption" color={colors.primaryText}>
          You · home {state.home.player}/{HOME_TO_WIN}
        </AppText>
        <AppText variant="caption" color={colors.rivalText}>
          {rivalName} · home {state.home.bot}/{HOME_TO_WIN}
        </AppText>
      </Row>

      <View style={[styles.board, { width: (cell + 4) * COLS + 4 }]} accessibilityLabel="Game board">
        {Array.from({ length: ROWS }, (_, k) => ROWS - 1 - k).map((r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {Array.from({ length: COLS }, (_, c) => {
              const piece = state.pieces.find((x) => x.r === r && x.c === c);
              const m = target(r, c);
              const selected = sel && sel[0] === r && sel[1] === c;
              const wasBot = lastBot && lastBot.move.to[0] === r && lastBot.move.to[1] === c;
              const home = r === ROWS - 1 || r === 0;
              return (
                <Pressable
                  key={c}
                  onPress={() => tap(r, c)}
                  disabled={over}
                  accessibilityRole="button"
                  accessibilityLabel={`${square(r, c)}${piece ? `, ${piece.side === 'player' ? 'your piece' : 'opponent piece'}` : ''}${m ? `, ${KIND_LABEL[m.kind]} here, ${Math.round(odds(m.kind) * 100)} percent` : ''}`}
                  style={[
                    styles.cell,
                    { width: cell, height: cell, backgroundColor: (r + c) % 2 ? colors.bgRaised : colors.surface },
                    home && { backgroundColor: r === ROWS - 1 ? 'rgba(37,99,235,0.10)' : 'rgba(249,115,22,0.10)' },
                    m && { borderColor: KIND_TINT[m.kind], borderWidth: 2 },
                    selected && { borderColor: colors.text, borderWidth: 2 },
                  ]}>
                  {piece ? (
                    <Animated.View key={`${piece.side}-${r}-${c}`} entering={reduced ? undefined : ZoomIn.duration(160)} style={[styles.piece, { width: cell * 0.62, height: cell * 0.62, borderRadius: cell * 0.31, backgroundColor: piece.side === 'player' ? colors.primary : colors.rival }, wasBot && { borderWidth: 2, borderColor: colors.insight }]} />
                  ) : null}
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
      </View>

      {!over ? (
        <View style={{ gap: 4 }}>
          <Overline>{sel ? `Moves for ${square(...sel)}` : 'Tap one of your blue pieces'}</Overline>
          <AppText variant="caption" color={colors.textMuted}>
            Step ✓ always works · Dash {Math.round(DASH_P * 100)}% (two squares; on a miss it stays) · Strike {Math.round(STRIKE_P * 100)}% (diagonal; on a miss it’s knocked back). Your pieces head for the top row.
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', padding: 2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  cell: { margin: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  piece: { alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', bottom: 2, right: 3 },
});
