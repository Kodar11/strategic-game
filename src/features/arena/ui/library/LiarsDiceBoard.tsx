import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Dice5, Megaphone, TriangleAlert } from '@/src/components/ui/icons';
import { type DiceAction, type DiceState, FACES, bidText, isRaise, liveBids, roll } from '@/src/arena/liars-dice';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row } from '../parts';
import { Die, Overline, Panel, Stepper } from './kit';

export function LiarsDiceBoard({ state, act, over, rivalName }: BoardProps<DiceState, DiceAction>) {
  const reduced = useMotionReduced();
  const bids = over ? [] : liveBids(state);
  const prev = bids[bids.length - 1];
  const total = state.count.player + state.count.bot;
  const mine = over ? [] : roll(state).player;
  const last = state.rounds[state.rounds.length - 1];
  const go = (a: DiceAction) => {
    haptic.commit();
    act(a);
  };

  return (
    <View style={{ gap: space.lg }}>
      {last ? (
        <Reveal revealKey={state.rounds.length} tone={last.loser === 'player' ? 'bad' : 'good'} overline={`Round ${state.rounds.length} · ${last.caller === 'player' ? 'you called' : `${rivalName} called`} “Liar!”`}>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            Bid: {bidText(last.bids[last.bids.length - 1])}. On the table: {last.count}. {last.loser === 'player' ? 'You lose a die.' : `${rivalName} loses a die.`}
          </AppText>
          {(['player', 'bot'] as const).map((side) => (
            <Row key={side} style={{ flexWrap: 'wrap', gap: 4 }}>
              <AppText variant="caption" color={side === 'player' ? colors.primaryText : colors.rivalText} style={{ width: 64 }}>
                {side === 'player' ? 'You' : 'Them'}
              </AppText>
              {last.dice[side].map((d, i) => (
                <Animated.View key={`${state.rounds.length}-${side}-${i}`} entering={reduced ? undefined : ZoomIn.duration(160).delay(i * 50)}>
                  <Die face={d} size={28} highlight={d === last.bids[last.bids.length - 1].f} />
                </Animated.View>
              ))}
            </Row>
          ))}
        </Reveal>
      ) : null}

      <Panel accent="rgba(34,211,238,0.35)">
        <Row style={{ justifyContent: 'space-between' }}>
          <Overline color={colors.rivalText}>{rivalName}’s cup</Overline>
          <AppText variant="caption" color={colors.textMuted}>
            {state.count.bot} {state.count.bot === 1 ? 'die' : 'dice'}
          </AppText>
        </Row>
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>
          {Array.from({ length: state.count.bot }, (_, i) => (
            <Die key={i} face={0} hidden size={30} />
          ))}
        </Row>
        <View style={styles.bid} accessible accessibilityLabel={prev ? `Current bid by ${prev.by === 'player' ? 'you' : rivalName}: at least ${prev.q} dice showing ${prev.f}.` : 'No bid yet.'}>
          {prev ? (
            <Animated.View key={bids.length} entering={reduced ? undefined : ZoomIn.duration(200)} style={{ alignItems: 'center', gap: 4 }}>
              <AppText variant="caption" color={colors.textMuted}>
                {prev.by === 'player' ? 'Your bid' : `${rivalName} bids`}
              </AppText>
              <Row style={{ gap: space.sm }}>
                <AppText variant="number" tabular>
                  {prev.q} ×
                </AppText>
                <Die face={prev.f} size={40} />
              </Row>
              <AppText variant="caption" color={colors.textMuted}>
                at least {prev.q} on the whole table · {bids.length} bid{bids.length === 1 ? '' : 's'} this round
              </AppText>
            </Animated.View>
          ) : (
            <AppText variant="small" color={colors.textMuted}>
              {over ? 'Match over.' : 'You open the bidding.'}
            </AppText>
          )}
        </View>
        {!over ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Overline color={colors.primaryText}>Your cup</Overline>
              <AppText variant="caption" color={colors.textMuted}>
                {state.count.player} {state.count.player === 1 ? 'die' : 'dice'} · only you see these
              </AppText>
            </Row>
            <Row style={{ flexWrap: 'wrap', gap: 6 }}>
              {mine.map((d, i) => (
                <Die key={i} face={d} size={34} />
              ))}
            </Row>
          </>
        ) : null}
      </Panel>

      {!over ? <BidPicker key={`${state.rounds.length}-${bids.length}`} prev={prev} total={total} mine={mine} onBid={(q, f) => go({ kind: 'bid', q, f })} onCall={() => go({ kind: 'liar' })} /> : null}
    </View>
  );
}

function BidPicker({ prev, total, mine, onBid, onCall }: { prev: { q: number; f: number } | undefined; total: number; mine: number[]; onBid: (q: number, f: number) => void; onCall: () => void }) {
  const lowestFor = (f: number) => (!prev ? 1 : f > prev.f ? prev.q : prev.q + 1);
  const start = prev ? prev.f : (mine[0] ?? 1);
  const [face, setFace] = useState(start);
  const [q, setQ] = useState(lowestFor(start));
  const legal = isRaise({ q, f: face }, prev) && q <= total;
  return (
    <Panel accent="rgba(37,99,235,0.35)">
      <Overline color={colors.primaryText}>Raise or call</Overline>
      <Row style={{ justifyContent: 'space-between' }}>
        {Array.from({ length: FACES }, (_, i) => i + 1).map((f) => (
          <Pressable
            key={f}
            onPress={() => {
              haptic.select();
              setFace(f);
              setQ(Math.max(q, lowestFor(f)));
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: face === f }}
            accessibilityLabel={`Face ${f}`}
            style={[styles.face, face === f && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
            <Die face={f} size={30} />
          </Pressable>
        ))}
      </Row>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Stepper value={q} min={1} max={total} onChange={setQ} label="How many dice" />
        <Button label={`Bid ${q} × ${face}`} icon={Dice5} iconPosition="left" compact disabled={!legal} onPress={() => onBid(q, face)} />
      </Row>
      {!legal && prev ? (
        <Row>
          <TriangleAlert size={14} color={colors.insight} />
          <AppText variant="caption" color={colors.insight}>
            Raise to more than {prev.q}, or {prev.q} of a face above {prev.f}.
          </AppText>
        </Row>
      ) : null}
      <Button label="Liar!" variant="secondary" icon={Megaphone} iconPosition="left" disabled={!prev} onPress={onCall} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  bid: { alignItems: 'center', paddingVertical: space.md, borderRadius: radius.lg, backgroundColor: colors.bgRaised, minHeight: 96, justifyContent: 'center' },
  face: { padding: 4, borderRadius: radius.sm, borderWidth: 1.5, borderColor: 'transparent', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
