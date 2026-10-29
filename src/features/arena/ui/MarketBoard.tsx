import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Gauge, Store, Tag, Users } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { type Conditions, type MarketRound, type MarketState, PRICE_MAX, PRICE_MIN, marketOutcome, marketPar, marketPrompt, marketSeatName as seatNameOf } from '@/src/arena/market';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { AnimatedBar, type BoardProps, Reveal, Row, Stat, signed } from './parts';

const SEAT_COLOR = [colors.primary, colors.rival, colors.accent];
const PRICES = Array.from({ length: PRICE_MAX - PRICE_MIN + 1 }, (_, i) => PRICE_MIN + i);

/** Projected profit at every price, assuming rivals charge `assumed`. The selected price is highlighted. */
const ProfitCurve = memo(function ProfitCurve({ cond, assumed, price }: { cond: Conditions; assumed: number[]; price: number }) {
  const profits = useMemo(() => PRICES.map((p) => marketOutcome(cond, [p, ...assumed.slice(1)]).profits[0]), [cond, assumed]);
  const max = Math.max(1, ...profits);
  const best = PRICES[profits.indexOf(Math.max(...profits))];
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`Projected profit by price. Highest at ${best}. At ${price}: ${profits[price - PRICE_MIN]}.`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 64, gap: 2 }}>
        {profits.map((v, i) => (
          <View key={i} style={{ flex: 1, height: `${Math.max(3, (Math.max(0, v) / max) * 100)}%`, borderRadius: 2, backgroundColor: v < 0 ? colors.danger : PRICES[i] === price ? colors.accent : 'rgba(34,211,238,0.28)' }} />
        ))}
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="caption" color={colors.textFaint} tabular>
          {PRICE_MIN}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          projected profit by price
        </AppText>
        <AppText variant="caption" color={colors.textFaint} tabular>
          {PRICE_MAX}
        </AppText>
      </Row>
    </View>
  );
});

function PricePanel({ s, cond, last, act }: { s: MarketState; cond: Conditions; last: number[] | null; act: (p: number) => void }) {
  const [price, setPrice] = useState(last ? last[0] : cond.cost + 5);
  const assumed = useMemo(() => last ?? s.seats.map(() => cond.cost + 6), [last, s.seats, cond.cost]);
  const proj = marketOutcome(cond, [price, ...assumed.slice(1)]);
  return (
    <View style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="overline" color={colors.accent}>
          Your price
        </AppText>
        <AppText variant="heading" tabular>
          {price}
        </AppText>
      </Row>
      <Slider value={price} min={PRICE_MIN} max={PRICE_MAX} step={1} onChange={setPrice} label="Your price" hideLabel showValue={false} tone="cyan" marker={{ value: cond.cost, label: 'cost' }} />
      <ProfitCurve cond={cond} assumed={assumed} price={price} />
      <View style={{ padding: space.md, borderRadius: radius.md, backgroundColor: colors.bgRaised, gap: 4 }}>
        <AppText variant="caption" color={colors.textMuted}>
          {last ? `If rivals repeat ${assumed.slice(1).join(' and ')}` : `If rivals open at ${cond.cost + 6}`}
        </AppText>
        <Row style={{ flexWrap: 'wrap' }}>
          <Stat label="Sales" value={`${proj.units[0]}`} />
          <Stat label="Share" value={`${Math.round(proj.shares[0] * 100)}%`} />
          <Stat label="Margin" value={signed(price - cond.cost)} />
          <Stat label="Profit" value={signed(proj.profits[0])} color={proj.profits[0] >= 0 ? colors.accent : colors.danger} />
        </Row>
        <AppText variant="caption" color={colors.textFaint}>
          A projection, not a promise: rivals choose at the same time as you.
        </AppText>
      </View>
      <Button
        label={`Set price ${price}`}
        icon={Tag}
        onPress={() => {
          haptic.commit();
          act(price);
        }}
      />
    </View>
  );
}

function RoundReveal({ s, r, n, nameOf }: { s: MarketState; r: MarketRound; n: number; nameOf?: (seat: number) => string }) {
  const marketSeatName = (st: MarketState, i: number) => nameOf?.(i) ?? seatNameOf(st, i);
  const sold = r.units.reduce((a, b) => a + b, 0);
  const best = r.profits.indexOf(Math.max(...r.profits));
  return (
    <Reveal revealKey={n} tone={best === 0 ? 'good' : 'plain'} overline={`Round ${n} · ${sold} of ${r.cond.customers} customers bought`}>
      {r.prices.map((p, i) => (
        <View key={i} style={{ gap: 3, paddingVertical: 3 }}>
          <Row>
            <AppText variant="small" weight={i === 0 ? 'semibold' : 'regular'} color={i === 0 ? colors.primaryText : colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
              {marketSeatName(s, i)}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} tabular>
              at {p} · {r.units[i]} sold
            </AppText>
            <AppText variant="small" weight="semibold" tabular color={r.profits[i] >= 0 ? colors.text : colors.danger} style={{ width: 52, textAlign: 'right' }}>
              {signed(r.profits[i])}
            </AppText>
          </Row>
          <AnimatedBar ratio={r.units[i] / Math.max(1, r.cond.customers)} color={SEAT_COLOR[i]} height={6} />
        </View>
      ))}
    </Reveal>
  );
}

export function MarketBoard({ state, act, over, nameOf }: BoardProps<MarketState, number>) {
  const marketSeatName = (st: MarketState, i: number) => nameOf?.(i) ?? seatNameOf(st, i);
  const h = state.rounds;
  const last = h[h.length - 1];
  const p = marketPrompt(state);
  const par = marketPar(state);
  const max = Math.max(1, par, ...state.profit);
  return (
    <View style={{ gap: space.lg }}>
      {last ? <RoundReveal s={state} r={last} n={h.length} nameOf={nameOf} /> : null}

      {!over && p ? (
        <View style={{ gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)', backgroundColor: colors.surface }}>
          <Row style={{ flexWrap: 'wrap' }}>
            <Row style={{ flex: 1, minWidth: 90 }}>
              <Users size={16} color={colors.accent} />
              <Stat label="Customers" value={String(p.cond.customers)} />
            </Row>
            <Stat label="Unit cost" value={String(p.cond.cost)} color={colors.insight} />
            <Row style={{ flex: 1, minWidth: 90 }}>
              <Gauge size={16} color={colors.accent} />
              <Stat label="Price sensitivity" value={p.cond.beta > 0.4 ? 'High' : 'Normal'} />
            </Row>
          </Row>
          <Row>
            {state.seats.slice(1).map((_, k) => (
              <View key={k} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.bgRaised }}>
                <Store size={18} color={SEAT_COLOR[k + 1]} />
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                    {marketSeatName(state, k + 1)}
                  </AppText>
                  <AppText variant="bodyStrong" tabular>
                    {p.lastPrices ? `last ${p.lastPrices[k + 1]}` : 'no price yet'}
                  </AppText>
                </View>
              </View>
            ))}
          </Row>
          <PricePanel key={h.length} s={state} cond={p.cond} last={p.lastPrices} act={act} />
        </View>
      ) : null}

      <View style={{ gap: space.xs }}>
        <AppText variant="caption" color={colors.textMuted}>
          Season profit · win benchmark {par}
        </AppText>
        {state.profit.map((v, i) => (
          <View key={i} style={{ gap: 3 }}>
            <Row>
              <AppText variant="small" color={i === 0 ? colors.primaryText : colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
                {marketSeatName(state, i)}
              </AppText>
              <AppText variant="small" weight="semibold" tabular>
                {v}
              </AppText>
            </Row>
            <AnimatedBar ratio={Math.max(0, v) / max} color={SEAT_COLOR[i]} height={6} />
          </View>
        ))}
      </View>
    </View>
  );
}
