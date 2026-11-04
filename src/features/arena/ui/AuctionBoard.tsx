import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { MatchLog } from '@/src/components/game/MatchLog';
import { useRevealStep } from '@/src/components/game/Reveal';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, Crown, Gavel, Package } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { type AuctionRound, type AuctionState, type Lot, auctionPrompt, openingBid, seatName as auctionSeatName } from '@/src/arena/auction';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row, signed } from './parts';

/** The public range, the band your estimate allows, and the estimate itself. */
const ValueRange = memo(function ValueRange({ lot, estimate }: { lot: Lot; estimate: number }) {
  const span = lot.hi - lot.lo;
  const pos = (x: number) => `${Math.max(0, Math.min(100, ((x - lot.lo) / span) * 100))}%` as const;
  const a = Math.max(lot.lo, estimate - lot.u);
  const b = Math.min(lot.hi, estimate + lot.u);
  return (
    <View style={{ gap: 2 }} accessible accessibilityLabel={`Public range ${lot.lo} to ${lot.hi}. Your estimate ${estimate}, so the true value is between ${a} and ${b}.`}>
      <View style={{ height: 22, justifyContent: 'center' }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh }} />
        <View style={{ position: 'absolute', left: pos(a), width: `${((b - a) / span) * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.rivalSoft, borderWidth: 1, borderColor: colors.rival }} />
        <View style={{ position: 'absolute', left: pos(estimate), marginLeft: -2, width: 4, height: 22, borderRadius: 2, backgroundColor: colors.insight }} />
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="caption" color={colors.textMuted} tabular>
          {lot.lo}
        </AppText>
        <AppText variant="caption" color={colors.insight} tabular>
          your estimate {estimate} · true value {a}–{b}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} tabular>
          {lot.hi}
        </AppText>
      </Row>
    </View>
  );
});

function BidPanel({ lot, estimate, cash, act }: { lot: Lot; estimate: number; cash: number; act: (bid: number) => void }) {
  const [bid, setBid] = useState(() => openingBid(lot, cash));
  const place = (b: number) => {
    haptic.commit();
    act(b);
  };
  return (
    <View style={{ gap: space.xs }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="overline" color={colors.rivalText}>
          Your sealed bid · budget {cash}
        </AppText>
        <AppText variant="heading" tabular>
          {bid}
        </AppText>
      </Row>
      <Slider value={bid} min={0} max={cash} step={1} onChange={setBid} label="Your bid" hideLabel showValue={false} tone="orange" marker={{ value: Math.min(cash, estimate), label: 'estimate' }} />
      <AppText variant="caption" color={colors.textMuted}>
        Win and you pay {bid}. The lot is worth somewhere from {Math.max(lot.lo, estimate - lot.u)} to {Math.min(lot.hi, estimate + lot.u)}.
      </AppText>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Pass" variant="secondary" onPress={() => place(0)} style={{ flex: 1 }} />
        <Button label={bid === 0 ? 'Pass (bid 0)' : `Bid ${bid}`} icon={Gavel} onPress={() => place(bid)} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

/** Paddles go up lowest first, the winning bid last; then the hammer falls and the lot's true value is shown. */
function LotReveal({ s, r, n, nameOf }: { s: AuctionState; r: AuctionRound; n: number; nameOf?: (seat: number) => string }) {
  const seatName = (i: number) => nameOf?.(i) ?? auctionSeatName(s, i);
  const reduced = useMotionReduced();
  const order = r.bids.map((b, i) => ({ b, i })).sort((x, y) => x.b - y.b);
  const shown = useRevealStep(n, order.length + 1, 380, 200);
  const hammer = shown > order.length;
  const won = r.winner === 0;
  const profit = r.winner === null ? 0 : r.value - r.price;
  const top = Math.max(1, ...r.bids);
  return (
    <Reveal revealKey={n} tone={hammer && won ? (profit >= 0 ? 'good' : 'bad') : 'plain'} overline={`Lot ${n} · ${r.lot.name}`}>
      <View style={styles.room} accessible accessibilityLabel={`Bids: ${order.map(({ b, i }) => `${seatName(i)} ${b === 0 ? 'passed' : b}`).join(', ')}.`}>
        {order.map(({ b, i }, k) => (
          <View key={i} style={styles.seat}>
            {k < shown ? (
              <Animated.View entering={reduced ? undefined : FadeInUp.duration(240)} style={{ alignItems: 'center', gap: 2 }}>
                {hammer && r.winner === i ? <Crown size={14} color={colors.insight} /> : null}
                <View style={[styles.paddle, { height: 18 + (b / top) * 44, backgroundColor: b === 0 ? 'transparent' : i === 0 ? colors.primary : colors.rival, borderColor: b === 0 ? colors.borderStrong : 'transparent' }, hammer && r.winner === i && { borderColor: colors.insight }]}>
                  <AppText variant="caption" weight="bold" color={b === 0 ? colors.textMuted : colors.text} tabular>
                    {b === 0 ? '–' : b}
                  </AppText>
                </View>
              </Animated.View>
            ) : null}
            <AppText variant="caption" color={i === 0 ? colors.primaryText : colors.textMuted} numberOfLines={1}>
              {i === 0 ? 'You' : seatName(i).replace(/^(The |Bidder )/, '')}
            </AppText>
          </View>
        ))}
      </View>
      {hammer ? (
        <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
          {r.winner === null ? 'Nobody bid. The lot goes unsold.' : won ? `You won at ${r.price}. It was worth ${r.value}: ${signed(profit)}.` : `${seatName(r.winner)} won at ${r.price}. It was worth ${r.value}: ${signed(profit)} for them.`}
        </AppText>
      ) : null}
      {hammer && won && profit < 0 && r.estimates[0] > r.value ? (
        <AppText variant="small" color={colors.insight}>
          Your estimate ({r.estimates[0]}) was above the true value. Winning with the most optimistic estimate is the winner’s curse.
        </AppText>
      ) : null}
    </Reveal>
  );
}

export function AuctionBoard({ state, act, over, nameOf }: BoardProps<AuctionState, number>) {
  const seatName = (st: AuctionState, i: number) => nameOf?.(i) ?? auctionSeatName(st, i);
  const h = state.rounds;
  const last = h[h.length - 1];
  const p = auctionPrompt(state);
  const [seen, setSeen] = useState(0);
  const table = state.seats.map((_, i) => ({ i, profit: state.profit[i] })).sort((a, b) => b.profit - a.profit);
  // A sold lot gets the screen to itself, then the next lot does.
  const showingReveal = !!last && seen < h.length;

  return (
    <View style={{ gap: space.sm }}>
      {last && (showingReveal || over) ? <LotReveal s={state} r={last} n={h.length} nameOf={nameOf} /> : null}
      {showingReveal && !over ? <Button label={h.length + 1 >= state.total ? 'Final lot' : 'Next lot'} icon={ArrowRight} onPress={() => setSeen(h.length)} /> : null}

      {!over && p && !showingReveal ? (
        <View style={styles.lot}>
          <Row>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.rivalSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Package size={18} color={colors.rivalText} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={colors.textMuted}>
                Lot {p.lotNumber} of {state.total} · estimate {p.estimate} ± {p.lot.u}
              </AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {p.lot.name}
              </AppText>
            </View>
          </Row>
          <ValueRange lot={p.lot} estimate={p.estimate} />
          <BidPanel key={h.length} lot={p.lot} estimate={p.estimate} cash={p.cash} act={act} />
        </View>
      ) : null}

      <MatchLog title="Profit table" summary={`You ${signed(state.profit[0])}`} defaultOpen={over}>
        <View accessible accessibilityLabel={`Profit standings: ${table.map((t) => `${seatName(state, t.i)} ${t.profit}`).join(', ')}.`}>
          {table.map(({ i, profit }) => (
            <Row key={i} style={{ paddingVertical: 3 }}>
              <AppText variant="small" weight={i === 0 ? 'semibold' : 'regular'} color={i === 0 ? colors.primaryText : i === 1 ? colors.rivalText : colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
                {seatName(state, i)}
                {i === 1 ? ' · your rival' : ''}
              </AppText>
              <AppText variant="caption" color={colors.textMuted} tabular>
                budget {state.cash[i]}
              </AppText>
              <AppText variant="small" weight="semibold" tabular color={profit >= 0 ? colors.text : colors.rivalText} style={{ width: 48, textAlign: 'right' }}>
                {signed(profit)}
              </AppText>
            </Row>
          ))}
        </View>
      </MatchLog>

      {h.length ? (
        <MatchLog title="Lots so far" summary="What each one fetched, and what it was worth">
          {h.map((r, i) => (
            <View key={i} style={{ gap: 1, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: colors.border }} accessible accessibilityLabel={`Lot ${i + 1}, ${r.lot.name}: worth ${r.value}. ${r.winner === null ? 'Unsold.' : `${seatName(state, r.winner)} paid ${r.price}.`} Bids ${r.bids.join(', ')}.`}>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="caption" color={colors.textBody} numberOfLines={1} style={{ flex: 1 }}>
                  {i + 1}. {r.lot.name}
                </AppText>
                <AppText variant="caption" color={colors.insight} tabular>
                  worth {r.value}
                </AppText>
              </Row>
              <AppText variant="caption" color={colors.textMuted} tabular>
                {r.winner === null ? 'unsold' : `${r.winner === 0 ? 'you' : seatName(state, r.winner)} at ${r.price}`} · your estimate {r.estimates[0]}, your bid {r.bids[0] === 0 ? 'pass' : r.bids[0]}
              </AppText>
            </View>
          ))}
        </MatchLog>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lot: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(249,115,22,0.35)', backgroundColor: colors.surface },
  room: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, minHeight: 96, paddingTop: space.xs },
  seat: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4, minWidth: 0 },
  paddle: { width: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
});
