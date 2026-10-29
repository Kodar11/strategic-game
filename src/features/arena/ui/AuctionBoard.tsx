import { memo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Crown, Gavel, Package } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { type AuctionRound, type AuctionState, type Lot, auctionPrompt, posteriorMean, seatName as auctionSeatName } from '@/src/arena/auction';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row, Stat, signed } from './parts';

/** The public range, the band your estimate allows, and the estimate itself. */
const ValueRange = memo(function ValueRange({ lot, estimate }: { lot: Lot; estimate: number }) {
  const span = lot.hi - lot.lo;
  const pos = (x: number) => `${Math.max(0, Math.min(100, ((x - lot.lo) / span) * 100))}%` as const;
  const a = Math.max(lot.lo, estimate - lot.u);
  const b = Math.min(lot.hi, estimate + lot.u);
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`Public range ${lot.lo} to ${lot.hi}. Your estimate ${estimate}, so the true value is between ${a} and ${b}.`}>
      <View style={{ height: 26, justifyContent: 'center' }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh }} />
        <View style={{ position: 'absolute', left: pos(a), width: `${((b - a) / span) * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.rivalSoft, borderWidth: 1, borderColor: colors.rival }} />
        <View style={{ position: 'absolute', left: pos(estimate), marginLeft: -2, width: 4, height: 26, borderRadius: 2, backgroundColor: colors.insight }} />
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
  const [bid, setBid] = useState(() => Math.max(0, Math.min(cash, Math.round(posteriorMean(lot, estimate) - lot.u * 0.6))));
  const atEstimate = Math.round(posteriorMean(lot, estimate)) - bid;
  const place = (b: number) => {
    haptic.commit();
    act(b);
  };
  return (
    <View style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="overline" color={colors.rivalText}>
          Your sealed bid
        </AppText>
        <AppText variant="heading" tabular>
          {bid}
        </AppText>
      </Row>
      <Slider value={bid} min={0} max={cash} step={1} onChange={setBid} label="Your bid" hideLabel showValue={false} tone="orange" marker={{ value: Math.min(cash, estimate), label: 'estimate' }} />
      <AppText variant="caption" color={colors.textMuted}>
        If you win, you pay {bid}. If the value is what your estimate suggests (~{Math.round(posteriorMean(lot, estimate))}), that’s {signed(atEstimate)} — but the true value could be anywhere from {Math.max(lot.lo, estimate - lot.u)} to {Math.min(lot.hi, estimate + lot.u)}.
      </AppText>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Pass" variant="secondary" onPress={() => place(0)} style={{ flex: 1 }} />
        <Button label={bid === 0 ? 'Pass (bid 0)' : `Bid ${bid}`} icon={Gavel} onPress={() => place(bid)} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

function LotReveal({ s, r, n, nameOf }: { s: AuctionState; r: AuctionRound; n: number; nameOf?: (seat: number) => string }) {
  const seatName = (st: AuctionState, i: number) => nameOf?.(i) ?? auctionSeatName(st, i);
  const reduced = useMotionReduced();
  const order = r.bids.map((b, i) => ({ b, i })).sort((x, y) => y.b - x.b);
  const won = r.winner === 0;
  const profit = r.winner === null ? 0 : r.value - r.price;
  return (
    <Reveal revealKey={n} tone={won ? (profit >= 0 ? 'good' : 'bad') : 'plain'} overline={`Lot ${n} · ${r.lot.name} · worth ${r.value}`}>
      <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
        {r.winner === null
          ? 'Nobody bid. The lot goes unsold.'
          : won
            ? `You won at ${r.price}. Worth ${r.value}: ${signed(profit)} profit.`
            : `${seatName(s, r.winner)} won at ${r.price}. Worth ${r.value}: ${signed(profit)} for it.`}
      </AppText>
      {order.map(({ b, i }, k) => (
        <Animated.View key={i} entering={reduced ? undefined : FadeInDown.duration(180).delay(k * 70)}>
          <Row style={{ paddingVertical: 4 }}>
            <View style={{ width: 18 }}>{r.winner === i ? <Crown size={14} color={colors.insight} /> : null}</View>
            <AppText variant="small" weight={i === 0 ? 'semibold' : 'regular'} color={i === 0 ? colors.primaryText : colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
              {seatName(s, i)}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} tabular>
              est. {r.estimates[i]}
            </AppText>
            <AppText variant="small" weight="semibold" tabular style={{ width: 56, textAlign: 'right' }}>
              {b === 0 ? 'pass' : b}
            </AppText>
          </Row>
        </Animated.View>
      ))}
      {won && profit < 0 && r.estimates[0] > r.value ? (
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
  const table = state.seats.map((_, i) => ({ i, profit: state.profit[i] })).sort((a, b) => b.profit - a.profit);
  return (
    <View style={{ gap: space.lg }}>
      {last ? <LotReveal s={state} r={last} n={h.length} nameOf={nameOf} /> : null}

      {!over && p ? (
        <View style={{ gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(249,115,22,0.35)', backgroundColor: colors.surface }}>
          <Row>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.rivalSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Package size={20} color={colors.rivalText} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={colors.textMuted}>
                Lot {p.lotNumber} of {state.total}
              </AppText>
              <AppText variant="heading">{p.lot.name}</AppText>
            </View>
          </Row>
          <ValueRange lot={p.lot} estimate={p.estimate} />
          <Row style={{ flexWrap: 'wrap' }}>
            <Stat label="Your estimate" value={`${p.estimate} ± ${p.lot.u}`} color={colors.insight} />
            <Stat label="Budget left" value={String(p.cash)} />
            <Stat label="Your profit" value={signed(state.profit[0])} color={state.profit[0] >= 0 ? colors.success : colors.rivalText} />
          </Row>
          <BidPanel key={h.length} lot={p.lot} estimate={p.estimate} cash={p.cash} act={act} />
        </View>
      ) : null}

      <View style={{ gap: space.xs }} accessible accessibilityLabel={`Profit standings: ${table.map((t) => `${seatName(state, t.i)} ${t.profit}`).join(', ')}.`}>
        <AppText variant="caption" color={colors.textMuted}>
          Profit table · budget left
        </AppText>
        {table.map(({ i, profit }) => (
          <Row key={i} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <AppText variant="small" weight={i === 0 ? 'semibold' : 'regular'} color={i === 0 ? colors.primaryText : i === 1 ? colors.rivalText : colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
              {seatName(state, i)}
              {i === 1 ? ' · your rival' : ''}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} tabular>
              {state.cash[i]}
            </AppText>
            <AppText variant="small" weight="semibold" tabular color={profit >= 0 ? colors.text : colors.rivalText} style={{ width: 56, textAlign: 'right' }}>
              {signed(profit)}
            </AppText>
          </Row>
        ))}
      </View>
    </View>
  );
}
