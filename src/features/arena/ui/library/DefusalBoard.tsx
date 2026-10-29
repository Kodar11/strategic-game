import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Bomb, MessageCircle, Scissors, Send } from '@/src/components/ui/icons';
import { type DefusalAction, type DefusalState, WIRE_COLORS, clueText, defusalPrompt, fuseLeft, safeLeft, sharedClues } from '@/src/arena/defusal';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row } from '../parts';
import { Overline, Panel } from './kit';

const WIRE_HEX: Record<string, string> = { Red: '#EF4444', Blue: '#3B82F6', Yellow: '#FACC15', Green: '#22C55E', White: '#E2E8F0', Black: '#1E293B', Orange: '#F97316' };

function ClueCard({ text, from, onPress, selected, dim }: { text: string; from: string; onPress?: () => void; selected?: boolean; dim?: boolean }) {
  const body = (
    <View style={[styles.clue, selected && { borderColor: colors.success, backgroundColor: colors.successSoft }, dim && { opacity: 0.5 }]}>
      <AppText variant="caption" color={colors.textMuted}>
        {from}
      </AppText>
      <AppText variant="small" color={colors.text}>
        {text}
      </AppText>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: !!selected }} accessibilityLabel={`${from}: ${text}`}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function DefusalBoard({ state, act, over, rivalName }: BoardProps<DefusalState, DefusalAction>) {
  const reduced = useMotionReduced();
  const p = defusalPrompt(state);
  const [wire, setWire] = useState<number | null>(null);
  const [share, setShare] = useState<number | null>(null);
  const sh = sharedClues(state);
  const botShared = [...sh.bot, ...(p?.phase === 'cut' && p.shared !== null ? [p.shared] : [])];
  const cut = new Map(state.turns.filter((t) => t.cut !== null).map((t) => [t.cut!, t]));
  const last = state.turns[state.turns.length - 1];
  const mate = rivalName === 'Your teammate' ? 'your teammate' : rivalName.replace(/^The /, 'the ');

  return (
    <View style={{ gap: space.lg }}>
      <Panel accent={over ? (safeLeft(state) === 0 ? colors.success : colors.danger) : 'rgba(74,222,128,0.35)'}>
        <Row>
          <Bomb size={18} color={colors.success} />
          <Overline color={colors.success}>
            Fuse {Math.max(0, fuseLeft(state))} · {safeLeft(state)} safe wire{safeLeft(state) === 1 ? '' : 's'} to cut · 2 live
          </Overline>
        </Row>
        <View style={{ gap: 6 }}>
          {Array.from({ length: state.wires }, (_, i) => {
            const t = cut.get(i);
            const color = WIRE_HEX[WIRE_COLORS[i]];
            const canPick = p?.phase === 'cut' && !t;
            const on = wire === i;
            const live = over && (state.live[0] === i || state.live[1] === i);
            return (
              <Pressable
                key={i}
                disabled={!canPick}
                onPress={() => {
                  haptic.select();
                  setWire(i);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: !canPick }}
                accessibilityLabel={`Wire ${i + 1}, ${WIRE_COLORS[i]}${t ? `, cut by ${t.cutter === 'player' ? 'you' : 'your teammate'}: ${t.live ? 'live' : 'safe'}` : ''}${live && !t ? ', live' : ''}`}
                style={[styles.wireRow, on && { borderColor: colors.rival, backgroundColor: colors.rivalSoft }]}>
                <AppText variant="small" weight="semibold" tabular style={{ width: 22 }}>
                  {i + 1}
                </AppText>
                <View style={{ flex: 1, height: 14, justifyContent: 'center' }}>
                  {t ? (
                    <Row style={{ gap: 0 }}>
                      <View style={[styles.wire, { backgroundColor: color, flex: 1 }]} />
                      <View style={{ width: 22, alignItems: 'center' }}>
                        <Scissors size={14} color={t.live ? colors.danger : colors.textMuted} />
                      </View>
                      <View style={[styles.wire, { backgroundColor: color, flex: 1, opacity: 0.35 }]} />
                    </Row>
                  ) : (
                    <View style={[styles.wire, { backgroundColor: color }, live && { shadowColor: colors.danger, shadowOpacity: 0.9, shadowRadius: 6 }]} />
                  )}
                </View>
                <AppText variant="caption" color={t ? (t.live ? colors.danger : colors.success) : live ? colors.danger : colors.textFaint} style={{ width: 44, textAlign: 'right' }}>
                  {t ? (t.live ? 'LIVE' : 'safe') : live ? 'live' : ''}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Panel>

      {last ? (
        <Reveal revealKey={state.turns.length} tone={last.live ? 'bad' : last.cut === null ? 'insight' : 'good'} overline={`Turn ${state.turns.length}`}>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            {last.cut === null ? `${mate[0].toUpperCase()}${mate.slice(1)} held — not sure enough to cut.` : `${last.cutter === 'player' ? 'You' : mate[0].toUpperCase() + mate.slice(1)} cut wire ${last.cut + 1}: ${last.live ? 'LIVE.' : 'safe.'}`}
          </AppText>
        </Reveal>
      ) : null}

      {p?.phase === 'cut' ? (
        <Panel accent="rgba(249,115,22,0.35)">
          <Overline color={colors.rivalText}>Your turn · cut a wire</Overline>
          {p.shared !== null ? (
            <Animated.View entering={reduced ? undefined : FadeIn.duration(220)}>
              <Row>
                <MessageCircle size={16} color={colors.success} />
                <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
                  {mate[0].toUpperCase() + mate.slice(1)} shares: <AppText variant="small" weight="semibold">{clueText(state.hands.bot[p.shared])}</AppText>
                </AppText>
              </Row>
            </Animated.View>
          ) : (
            <AppText variant="small" color={colors.textMuted}>
              {mate[0].toUpperCase() + mate.slice(1)} has no clues left to share.
            </AppText>
          )}
          <Button
            label={wire === null ? 'Choose a wire above' : `Cut wire ${wire + 1}`}
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
        </Panel>
      ) : null}

      {p?.phase === 'share' ? (
        <Panel accent="rgba(74,222,128,0.35)">
          <Overline color={colors.success}>{mate[0].toUpperCase() + mate.slice(1)} cuts next · share one clue first</Overline>
          {p.options.length ? (
            p.options.map((k) => <ClueCard key={k} text={clueText(state.hands.player[k])} from="Your clue" selected={share === k} onPress={() => setShare(k)} />)
          ) : (
            <AppText variant="small" color={colors.textMuted}>
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

      <View style={{ gap: space.xs }}>
        <Overline>What you know</Overline>
        {state.hands.player.map((c, k) => (
          <ClueCard key={`p${k}`} text={clueText(c)} from={sh.player.includes(k) ? 'Your clue · shared' : 'Your clue · private'} dim={sh.player.includes(k)} />
        ))}
        {botShared.map((k) => (
          <ClueCard key={`b${k}`} text={clueText(state.hands.bot[k])} from={`From ${mate}`} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wireRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent' },
  wire: { height: 6, borderRadius: 3 },
  clue: { gap: 2, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
});
