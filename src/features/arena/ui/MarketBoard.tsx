import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';

import { CompactReveal, MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Tag } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { type Conditions, type MarketRound, type MarketState, PRICE_MAX, PRICE_MIN, marketOutcome, marketPar, marketPrompt, marketSeatName as seatNameOf, moodName } from '@/src/arena/market';
import { haptic } from '@/src/utils/feedback';
import { colors, fonts, radius, space } from '@/src/theme/tokens';
import { AnimatedBar, type BoardProps, Row, Stat, signed } from './parts';

const SEAT_COLOR = [colors.primary, colors.rival, colors.accent];
const PRICES = Array.from({ length: PRICE_MAX - PRICE_MIN + 1 }, (_, i) => PRICE_MIN + i);

/** Projected profit at every price, assuming rivals charge `assumed`. The selected price is highlighted. */
const ProfitCurve = memo(function ProfitCurve({ cond, assumed, price }: { cond: Conditions; assumed: number[]; price: number }) {
  const profits = useMemo(() => PRICES.map((p) => marketOutcome(cond, [p, ...assumed.slice(1)]).profits[0]), [cond, assumed]);
  const max = Math.max(1, ...profits);
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`Projected profit by price. At ${price}: ${profits[price - PRICE_MIN]}.`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 56, gap: 2 }}>
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

/** Every firm's price by round: where a price war or a truce shows up. Past prices only. */
function PriceChart({ s, name }: { s: MarketState; name: (i: number) => string }) {
  const [w, setW] = useState(0);
  const H = 96;
  const h = s.rounds;
  const lo = Math.min(...h.flatMap((r) => r.prices), h[0]?.cond.cost ?? PRICE_MIN);
  const hi = Math.max(...h.flatMap((r) => r.prices));
  const span = Math.max(1, hi - lo);
  const x = (i: number) => 22 + ((w - 30) * i) / Math.max(1, s.total - 1);
  const y = (p: number) => 8 + ((H - 16) * (hi - p)) / span;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }} accessible accessibilityLabel={s.seats.map((_, i) => `${name(i)}: ${h.map((r) => r.prices[i]).join(', ')}`).join('. ')}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          <SvgText x={0} y={y(hi) + 4} fill={colors.textFaint} fontSize={10} fontFamily={fonts.medium}>
            {hi}
          </SvgText>
          <SvgText x={0} y={y(lo) + 4} fill={colors.textFaint} fontSize={10} fontFamily={fonts.medium}>
            {lo}
          </SvgText>
          <Line x1={20} x2={w} y1={y(lo)} y2={y(lo)} stroke={colors.border} />
          {s.seats.map((_, i) => (
            <Polyline key={i} points={h.map((r, n) => `${x(n)},${y(r.prices[i])}`).join(' ')} fill="none" stroke={SEAT_COLOR[i]} strokeWidth={i === 0 ? 3 : 2} strokeDasharray={i === 2 ? '5 3' : undefined} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

function PricePanel({ s, cond, last, act }: { s: MarketState; cond: Conditions; last: number[] | null; act: (p: number) => void }) {
  const [price, setPrice] = useState(last ? last[0] : cond.cost + 5);
  const assumed = useMemo(() => last ?? s.seats.map(() => cond.cost + 6), [last, s.seats, cond.cost]);
  const proj = marketOutcome(cond, [price, ...assumed.slice(1)]);
  return (
    <View style={{ gap: space.xs }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="overline" color={colors.accent}>
          Your price
        </AppText>
        <AppText variant="heading" tabular>
          {price}
        </AppText>
      </Row>
      <Slider value={price} min={PRICE_MIN} max={PRICE_MAX} step={1} onChange={setPrice} label="Your price" hideLabel showValue={false} tone="cyan" marker={{ value: cond.cost, label: 'cost' }} />
      <AppText variant="small" color={colors.textBody} accessibilityLiveRegion="polite">
        {last ? `If rivals repeat ${assumed.slice(1).join(' and ')}: ` : `If rivals open at ${cond.cost + 6}: `}
        <AppText variant="small" weight="semibold" color={proj.profits[0] >= 0 ? colors.accent : colors.danger}>
          {proj.units[0]} sold × {signed(price - cond.cost)} = {signed(proj.profits[0])}
        </AppText>
      </AppText>
      <Button
        label={`Set price ${price}`}
        icon={Tag}
        onPress={() => {
          haptic.commit();
          act(price);
        }}
      />
      <MatchLog title="Profit at every price" summary="A projection, not a promise: rivals choose at the same time">
        <ProfitCurve cond={cond} assumed={assumed} price={price} />
        <Row style={{ flexWrap: 'wrap' }}>
          <Stat label="Sales" value={`${proj.units[0]}`} />
          <Stat label="Share" value={`${Math.round(proj.shares[0] * 100)}%`} />
          <Stat label="Margin" value={signed(price - cond.cost)} />
        </Row>
      </MatchLog>
    </View>
  );
}

function RoundDetail({ r, name }: { r: MarketRound; name: (i: number) => string }) {
  return (
    <>
      {r.prices.map((p, i) => (
        <View key={i} style={{ gap: 2, paddingVertical: 2 }}>
          <Row>
            <AppText variant="small" weight={i === 0 ? 'semibold' : 'regular'} color={i === 0 ? colors.primaryText : colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
              {name(i)}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} tabular>
              at {p} · {r.units[i]} sold
            </AppText>
            <AppText variant="small" weight="semibold" tabular color={r.profits[i] >= 0 ? colors.text : colors.danger} style={{ width: 48, textAlign: 'right' }}>
              {signed(r.profits[i])}
            </AppText>
          </Row>
          <AnimatedBar ratio={r.units[i] / Math.max(1, r.cond.customers)} color={SEAT_COLOR[i]} height={5} />
        </View>
      ))}
    </>
  );
}

export function MarketBoard({ state, act, over, nameOf }: BoardProps<MarketState, number>) {
  const name = (i: number) => nameOf?.(i) ?? seatNameOf(state, i);
  const h = state.rounds;
  const last = h[h.length - 1];
  const p = marketPrompt(state);
  const par = marketPar(state);
  const max = Math.max(1, par, ...state.profit);
  const best = last ? last.profits.indexOf(Math.max(...last.profits)) : 0;
  return (
    <View style={{ gap: space.sm }}>
      {last ? (
        <CompactReveal revealKey={h.length} tone={best === 0 ? 'good' : 'plain'} summary={`You charged ${last.prices[0]}, rivals ${last.prices.slice(1).join(' and ')}. You ${signed(last.profits[0])}, top rival ${signed(Math.max(...last.profits.slice(1)))}.`}>
          <RoundDetail r={last} name={name} />
          <AppText variant="caption" color={colors.textMuted}>
            {last.units.reduce((a, b) => a + b, 0)} of {last.cond.customers} customers bought.
          </AppText>
        </CompactReveal>
      ) : null}

      {!over && p ? (
        <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)', backgroundColor: colors.surface }}>
          <AppText variant="caption" color={colors.textBody} tabular>
            {p.cond.customers} customers · unit cost {p.cond.cost} · {moodName(state.setup.variant, p.cond.beta)}
          </AppText>
          <PricePanel key={h.length} s={state} cond={p.cond} last={p.lastPrices} act={act} />
        </View>
      ) : null}

      {h.length > 1 ? (
        <MatchLog title="Prices over time" summary={`Last round: ${last.prices.map((x, i) => `${i === 0 ? 'you' : name(i).replace(/^(The |Bidder )/, '')} ${x}`).join(', ')}`}>
          <PriceChart s={state} name={name} />
          <Row style={{ flexWrap: 'wrap' }}>
            {state.seats.map((_, i) => (
              <Row key={i} style={{ gap: 4 }}>
                <View style={{ width: 12, height: 3, backgroundColor: SEAT_COLOR[i] }} />
                <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {i === 0 ? 'You' : name(i)}
                </AppText>
              </Row>
            ))}
          </Row>
        </MatchLog>
      ) : null}

      <MatchLog title={`Season profit · win benchmark ${par}`} summary={`You ${state.profit[0]}, top rival ${Math.max(...state.profit.slice(1))}`} defaultOpen={over}>
        {state.profit.map((v, i) => (
          <View key={i} style={{ gap: 3 }}>
            <Row>
              <AppText variant="small" color={i === 0 ? colors.primaryText : colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
                {name(i)}
              </AppText>
              <AppText variant="small" weight="semibold" tabular>
                {v}
              </AppText>
            </Row>
            <AnimatedBar ratio={Math.max(0, v) / max} color={SEAT_COLOR[i]} height={6} />
          </View>
        ))}
      </MatchLog>
    </View>
  );
}
