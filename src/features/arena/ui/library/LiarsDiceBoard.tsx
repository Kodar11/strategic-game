import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, Dice5, Megaphone, TriangleAlert } from '@/src/components/ui/icons';
import { type DiceAction, type DiceRound, type DiceState, FACES, bidText, isRaise, liveBids, pAtLeast, roll } from '@/src/arena/liars-dice';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row } from '../parts';
import { Die, Stepper } from './kit';

function RoundReveal({ r, n, rivalName }: { r: DiceRound; n: number; rivalName: string }) {
  const reduced = useMotionReduced();
  const bid = r.bids[r.bids.length - 1];
  return (
    <Reveal revealKey={n} tone={r.loser === 'player' ? 'bad' : 'good'} overline={`Round ${n} · ${r.caller === 'player' ? 'you called' : 'they called'} “Liar!”`}>
      <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
        Bid: {bidText(bid)}. On the table: {r.count}. {r.loser === 'player' ? 'You lose a die.' : `${rivalName} loses a die.`}
      </AppText>
      {(['player', 'bot'] as const).map((side) => (
        <Row key={side} style={{ flexWrap: 'wrap', gap: 4 }}>
          <AppText variant="caption" color={side === 'player' ? colors.primaryText : colors.rivalText} style={{ width: 44 }}>
            {side === 'player' ? 'You' : 'Them'}
          </AppText>
          {r.dice[side].map((d, i) => (
            <Animated.View key={`${n}-${side}-${i}`} entering={reduced ? undefined : ZoomIn.duration(180).delay((side === 'bot' ? 200 : 0) + i * 70)}>
              <Die face={d} size={32} highlight={d === bid.f} />
            </Animated.View>
          ))}
        </Row>
      ))}
    </Reveal>
  );
}

export function LiarsDiceBoard({ state, act, over, rivalName }: BoardProps<DiceState, DiceAction>) {
  const reduced = useMotionReduced();
  const bids = over ? [] : liveBids(state);
  const prev = bids[bids.length - 1];
  const total = state.count.player + state.count.bot;
  const mine = over ? [] : roll(state).player;
  const last = state.rounds[state.rounds.length - 1];
  const [seen, setSeen] = useState(0);
  const [helper, setHelper] = useState(false);
  const go = (a: DiceAction) => {
    haptic.commit();
    act(a);
  };
  // A finished round gets the screen to itself, then the next bid does: dice revealed, decision in reach.
  const showingReveal = !!last && seen < state.rounds.length;

  if (showingReveal && !over) {
    return (
      <View style={{ gap: space.md }}>
        <RoundReveal r={last} n={state.rounds.length} rivalName={rivalName} />
        <Button label="Next round" icon={ArrowRight} onPress={() => setSeen(state.rounds.length)} />
      </View>
    );
  }

  const hiddenOdds = prev ? pAtLeast(state.count.bot, prev.q - mine.filter((d) => d === prev.f).length) : null;

  return (
    <View style={{ gap: space.sm }}>
      {over && last ? <RoundReveal r={last} n={state.rounds.length} rivalName={rivalName} /> : null}
      <View style={styles.table}>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="caption" color={colors.rivalText}>
            Their cup · {state.count.bot} {state.count.bot === 1 ? 'die' : 'dice'}
          </AppText>
          <Row style={{ gap: 4 }}>
            {Array.from({ length: state.count.bot }, (_, i) => (
              <Die key={i} face={0} hidden size={22} />
            ))}
          </Row>
        </Row>
        <View style={styles.bid} accessible accessibilityLabel={prev ? `Current bid by ${prev.by === 'player' ? 'you' : rivalName}: at least ${prev.q} dice showing ${prev.f}.` : 'No bid yet.'}>
          {prev ? (
            <Animated.View key={bids.length} entering={reduced ? undefined : ZoomIn.duration(200)}>
              <Row style={{ gap: space.sm }}>
                <AppText variant="caption" color={colors.textMuted}>
                  {prev.by === 'player' ? 'Your bid' : 'They bid'}
                </AppText>
                <AppText variant="title" tabular>
                  {prev.q} ×
                </AppText>
                <Die face={prev.f} size={32} />
                <AppText variant="caption" color={colors.textMuted}>
                  on the table
                </AppText>
              </Row>
            </Animated.View>
          ) : (
            <AppText variant="small" color={colors.textMuted}>
              {over ? 'Match over.' : 'You open the bidding.'}
            </AppText>
          )}
        </View>
        {!over ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText variant="caption" color={colors.primaryText}>
              Your cup
            </AppText>
            <Row style={{ gap: 6 }}>
              {mine.map((d, i) => (
                <Die key={i} face={d} size={30} />
              ))}
            </Row>
          </Row>
        ) : null}
      </View>

      {!over ? <BidPicker key={`${state.rounds.length}-${bids.length}`} prev={prev} total={total} mine={mine} onBid={(q, f) => go({ kind: 'bid', q, f })} onCall={() => go({ kind: 'liar' })} /> : null}

      {!over && prev ? (
        <Pressable onPress={() => setHelper((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: helper }} style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText variant="caption" color={colors.accent}>
            {helper
              ? `You hold ${mine.filter((d) => d === prev.f).length} of those. If their ${state.count.bot} hidden ${state.count.bot === 1 ? 'die is' : 'dice are'} fair, this bid is true about ${Math.round((hiddenOdds ?? 0) * 100)}% of the time. Hide`
              : 'Show the odds from what you can see'}
          </AppText>
        </Pressable>
      ) : null}

      {bids.length || state.rounds.length ? (
        <MatchLog title="Bids and past rounds" summary={bids.length ? `This round: ${bids.map((b) => `${b.q}×${b.f}`).join(' → ')}` : `${state.rounds.length} rounds played`}>
          {bids.length ? (
            <Row style={{ flexWrap: 'wrap', gap: 6 }}>
              {bids.map((b, i) => (
                <AppText key={i} variant="small" tabular color={b.by === 'player' ? colors.primaryText : colors.rivalText}>
                  {b.by === 'player' ? 'You' : 'They'} {bidText(b)}
                  {i < bids.length - 1 ? ' →' : ''}
                </AppText>
              ))}
            </Row>
          ) : null}
          {state.rounds.map((r, i) => (
            <View key={i} style={{ gap: 2, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
              <AppText variant="caption" color={colors.textMuted}>
                Round {i + 1}: {r.bids.map((b) => `${b.by === 'player' ? 'you' : 'they'} ${b.q}×${b.f}`).join(', ')}
              </AppText>
              <AppText variant="caption" color={colors.textBody}>
                {r.caller === 'player' ? 'You' : 'They'} called, {r.count} on the table. {r.loser === 'player' ? 'You' : 'They'} lost a die.
              </AppText>
            </View>
          ))}
        </MatchLog>
      ) : null}
    </View>
  );
}

function BidPicker({ prev, total, mine, onBid, onCall }: { prev: { q: number; f: number } | undefined; total: number; mine: number[]; onBid: (q: number, f: number) => void; onCall: () => void }) {
  const { width } = useWindowDimensions();
  const lowestFor = (f: number) => (!prev ? 1 : f > prev.f ? prev.q : prev.q + 1);
  const start = prev ? prev.f : (mine[0] ?? 1);
  const [face, setFace] = useState(start);
  const [q, setQ] = useState(Math.min(total, lowestFor(start)));
  const legal = isRaise({ q, f: face }, prev) && q <= total;
  // Six 44 pt faces need 288 of width: on the narrowest phones they sit in two rows of three.
  const faceBasis = width - space.lg * 2 < 288 ? '31%' : undefined;
  return (
    <View style={{ gap: space.sm }}>
      <View style={[styles.faces, faceBasis ? { flexWrap: 'wrap', justifyContent: 'center' } : null]}>
        {Array.from({ length: FACES }, (_, i) => i + 1).map((f) => (
          <Pressable
            key={f}
            onPress={() => {
              haptic.select();
              setFace(f);
              setQ(Math.min(total, Math.max(q, lowestFor(f))));
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: face === f }}
            accessibilityLabel={`Face ${f}`}
            style={[styles.face, faceBasis ? { flexBasis: faceBasis } : { flex: 1 }, face === f && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
            <Die face={f} size={30} />
          </Pressable>
        ))}
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Stepper value={q} min={1} max={total} onChange={setQ} label="How many dice" />
        <Button label={`Bid ${q} × ${face}`} icon={Dice5} iconPosition="left" compact disabled={!legal} onPress={() => onBid(q, face)} />
      </Row>
      {!legal && prev ? (
        <Row>
          <TriangleAlert size={14} color={colors.insight} />
          <AppText variant="caption" color={colors.insight} style={{ flex: 1 }}>
            Raise to more than {prev.q}, or {prev.q} of a face above {prev.f}.
          </AppText>
        </Row>
      ) : null}
      <Pressable onPress={onCall} disabled={!prev} accessibilityRole="button" accessibilityState={{ disabled: !prev }} accessibilityLabel="Liar!" style={({ pressed }) => [styles.liar, !prev && { opacity: 0.4 }, pressed && { backgroundColor: colors.rivalSoft }]}>
        <Megaphone size={18} color={colors.rivalText} />
        <AppText variant="bodyStrong" color={colors.rivalText}>
          Liar!
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  table: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)', backgroundColor: colors.surface },
  bid: { alignItems: 'center', justifyContent: 'center', minHeight: 56, borderRadius: radius.md, backgroundColor: colors.bgRaised },
  faces: { flexDirection: 'row', gap: 4 },
  face: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1.5, borderColor: 'transparent' },
  liar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 48, borderRadius: radius.md, borderWidth: 2, borderColor: colors.rival },
});
