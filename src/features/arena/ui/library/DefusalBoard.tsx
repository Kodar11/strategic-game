import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CompactReveal } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Bomb, Flame, MessageCircle, Scissors, Send, TriangleAlert } from '@/src/components/ui/icons';
import { type DefusalAction, type DefusalState, WIRE_COLORS, clueText, defusalPrompt, fuseLeft, fuseOf, safeLeft, sharedClues } from '@/src/arena/defusal';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Row } from '../parts';
import { Overline, Panel } from './kit';

/** Wire colours, with an outline where a wire would otherwise melt into the dark panel. Each row also names its colour. */
const WIRE_LOOK: Record<string, { fill: string; outline?: string }> = {
  Red: { fill: '#EF4444' },
  Blue: { fill: '#3B82F6' },
  Yellow: { fill: '#FACC15' },
  Green: { fill: '#22C55E' },
  White: { fill: '#E2E8F0' },
  Black: { fill: '#020617', outline: '#94A3B8' },
  Orange: { fill: '#F97316' },
};

type Mark = 'unknown' | 'safe' | 'live';
const NEXT_MARK: Record<Mark, Mark> = { unknown: 'safe', safe: 'live', live: 'unknown' };
const MARK_LOOK: Record<Mark, { label: string; fg: string; bg: string }> = {
  unknown: { label: '?', fg: colors.textMuted, bg: colors.bgRaised },
  safe: { label: 'Safe', fg: colors.success, bg: colors.successSoft },
  live: { label: 'Live', fg: colors.danger, bg: colors.dangerSoft },
};

function ClueCard({ text, from, onPress, selected, dim }: { text: string; from: string; onPress?: () => void; selected?: boolean; dim?: boolean }) {
  const body = (
    <View style={[styles.clue, selected && { borderColor: colors.success, backgroundColor: colors.successSoft }, dim && { opacity: 0.55 }]}>
      <AppText variant="caption" color={colors.textMuted} style={{ width: 54 }}>
        {from}
      </AppText>
      <AppText variant="caption" color={colors.text} style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: !!selected }} accessibilityLabel={`${from}: ${text}`}>
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={`${from}: ${text}`}>
      {body}
    </View>
  );
}

/**
 * Wires and clues on one screen. The Safe / Live marks are only the player's own reasoning: they are kept on this
 * screen, never checked and never sent to the engine, so they can't reveal anything.
 */
export function DefusalBoard({ state, act, over, rivalName }: BoardProps<DefusalState, DefusalAction>) {
  const reduced = useMotionReduced();
  const p = defusalPrompt(state);
  const [wire, setWire] = useState<number | null>(null);
  const [share, setShare] = useState<number | null>(null);
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const sh = sharedClues(state);
  const botShared = [...sh.bot, ...(p?.phase === 'cut' && p.shared !== null ? [p.shared] : [])];
  const cut = new Map(state.turns.filter((t) => t.cut !== null).map((t) => [t.cut!, t]));
  const last = state.turns[state.turns.length - 1];
  const mate = rivalName === 'Your teammate' ? 'your teammate' : rivalName.replace(/^The /, 'the ');
  const Mate = mate[0].toUpperCase() + mate.slice(1);
  const fuse = Math.max(0, fuseLeft(state));
  const fuseTotal = fuseOf(state.wires);
  const markedLive = wire !== null && marks[wire] === 'live';

  return (
    <View style={{ gap: space.sm }}>
      <Row accessible accessibilityLabel={`Fuse: ${fuse} of ${fuseTotal} turns left. ${safeLeft(state)} safe wires to cut. 2 wires are live.`}>
        <Bomb size={16} color={fuse <= 2 ? colors.danger : colors.success} />
        <View style={{ flexDirection: 'row', flex: 1, gap: 3 }}>
          {Array.from({ length: fuseTotal }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < fuse ? (fuse <= 2 ? colors.danger : colors.insight) : colors.surfaceHigh }} />
          ))}
        </View>
        <Flame size={14} color={fuse <= 2 ? colors.danger : colors.insight} />
        <AppText variant="caption" color={colors.textMuted} tabular>
          {safeLeft(state)} safe left · 2 live
        </AppText>
      </Row>

      <View style={{ gap: 2 }}>
        {Array.from({ length: state.wires }, (_, i) => {
          const t = cut.get(i);
          const name = WIRE_COLORS[i];
          const look = WIRE_LOOK[name];
          const canPick = p?.phase === 'cut' && !t;
          const on = wire === i;
          const live = over && (state.live[0] === i || state.live[1] === i);
          const mark = marks[i] ?? 'unknown';
          const M = MARK_LOOK[mark];
          const wireStyle = [styles.wire, { backgroundColor: look.fill }, look.outline ? { borderWidth: 1, borderColor: look.outline, height: 8 } : null];
          return (
            <View key={i} style={[styles.wireRow, on && { borderColor: colors.rival, backgroundColor: colors.rivalSoft }]}>
              <Pressable
                disabled={!canPick}
                onPress={() => {
                  haptic.select();
                  setWire(i);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: !canPick }}
                accessibilityLabel={`Wire ${i + 1}, ${name}${t ? `, cut by ${t.cutter === 'player' ? 'you' : 'your teammate'}: ${t.live ? 'live' : 'safe'}` : ''}${live && !t ? ', live' : ''}`}
                style={styles.wireHit}>
                <AppText variant="small" weight="semibold" tabular style={{ width: 16 }}>
                  {i + 1}
                </AppText>
                <AppText variant="caption" color={colors.textMuted} style={{ width: 44 }} numberOfLines={1}>
                  {name}
                </AppText>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  {t ? (
                    <Row style={{ gap: 0 }}>
                      <View style={[wireStyle, { flex: 1 }]} />
                      <View style={{ width: 20, alignItems: 'center' }}>
                        <Scissors size={13} color={t.live ? colors.danger : colors.textMuted} />
                      </View>
                      <View style={[wireStyle, { flex: 1, opacity: 0.35 }]} />
                    </Row>
                  ) : (
                    <View style={wireStyle} />
                  )}
                </View>
              </Pressable>
              {t || live ? (
                <AppText variant="caption" weight="semibold" color={t?.live || live ? colors.danger : colors.success} align="center" style={{ width: 48 }}>
                  {t ? (t.live ? 'LIVE' : 'safe') : 'live'}
                </AppText>
              ) : (
                <Pressable
                  disabled={over}
                  onPress={() => {
                    haptic.select();
                    setMarks({ ...marks, [i]: NEXT_MARK[mark] });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Your note on wire ${i + 1}: ${mark}. Tap to change.`}
                  style={[styles.mark, { backgroundColor: M.bg, borderColor: mark === 'unknown' ? colors.border : M.fg }]}>
                  <AppText variant="caption" weight="semibold" color={M.fg}>
                    {M.label}
                  </AppText>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {last ? <CompactReveal revealKey={state.turns.length} tone={last.live ? 'bad' : last.cut === null ? 'insight' : 'good'} summary={last.cut === null ? `${Mate} held: not sure enough to cut.` : `${last.cutter === 'player' ? 'You' : Mate} cut wire ${last.cut + 1}: ${last.live ? 'LIVE.' : 'safe.'}`} /> : null}

      {p?.phase === 'cut' ? (
        <View style={{ gap: space.xs }}>
          {p.shared !== null ? (
            <Animated.View entering={reduced ? undefined : FadeIn.duration(220)}>
              <Row style={{ alignItems: 'flex-start', gap: 6 }}>
                <MessageCircle size={14} color={colors.success} style={{ marginTop: 2 }} />
                <AppText variant="caption" color={colors.textBody} style={{ flex: 1 }}>
                  {Mate} shares: <AppText variant="caption" weight="semibold">{clueText(state.hands.bot[p.shared])}</AppText>
                </AppText>
              </Row>
            </Animated.View>
          ) : (
            <AppText variant="caption" color={colors.textMuted}>
              {Mate} has no clues left to share.
            </AppText>
          )}
          {markedLive ? (
            <Row style={{ gap: 6 }}>
              <TriangleAlert size={14} color={colors.danger} />
              <AppText variant="caption" color={colors.danger} style={{ flex: 1 }}>
                You marked this wire Live. One live cut ends the match.
              </AppText>
            </Row>
          ) : null}
          <Button
            label={wire === null ? 'Tap a wire to cut' : `Cut wire ${wire + 1} (${WIRE_COLORS[wire]})`}
            icon={Scissors}
            iconPosition="left"
            disabled={wire === null}
            onPress={() => {
              if (wire === null) return;
              haptic.commit();
              act({ kind: 'cut', wire });
              setWire(null);
            }}
          />
        </View>
      ) : null}

      {p?.phase === 'share' ? (
        <Panel accent="rgba(74,222,128,0.35)" style={{ padding: space.md, gap: space.xs }}>
          <Overline color={colors.success}>{Mate} cuts next · share one clue</Overline>
          {p.options.length ? (
            p.options.map((k) => <ClueCard key={k} text={clueText(state.hands.player[k])} from="Yours" selected={share === k} onPress={() => setShare(k)} />)
          ) : (
            <AppText variant="caption" color={colors.textMuted}>
              You’ve shared all your clues.
            </AppText>
          )}
          <Button
            label={p.options.length ? (share === null ? 'Choose a clue to share' : 'Share and let it cut') : 'Let it cut'}
            icon={Send}
            iconPosition="left"
            disabled={p.options.length > 0 && share === null}
            onPress={() => {
              haptic.commit();
              act({ kind: 'share', clue: p.options.length ? share : null });
              setShare(null);
            }}
          />
        </Panel>
      ) : null}

      <View style={{ gap: 3 }}>
        <Overline>What you know</Overline>
        {state.hands.player.map((c, k) => (
          <ClueCard key={`p${k}`} text={clueText(c)} from={sh.player.includes(k) ? 'Shared' : 'Yours'} dim={sh.player.includes(k)} />
        ))}
        {botShared.map((k) => (
          <ClueCard key={`b${k}`} text={clueText(state.hands.bot[k])} from="Theirs" />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wireRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingLeft: space.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  wireHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
  wire: { height: 6, borderRadius: 3 },
  mark: { width: 48, minHeight: 36, marginVertical: 4, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  clue: { flexDirection: 'row', gap: 4, paddingHorizontal: space.sm, paddingVertical: 5, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
});
