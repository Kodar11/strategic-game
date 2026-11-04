import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { CompactReveal, MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Droplets, Flame, Radio, Shield } from '@/src/components/ui/icons';
import { BURNED, DISTRICTS, MAX_WATER, N, type Plan, type StandState, burnedOut, neighbours, planText, previewFire, refillAmount, teammatePlan } from '@/src/arena/last-stand';
import { haptic } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';
import { AnimatedBar, type BoardProps, Row } from '../parts';

const FIRE_TINT = ['rgba(74,222,128,0.14)', 'rgba(253,186,116,0.20)', 'rgba(249,115,22,0.30)', 'rgba(239,68,68,0.40)', 'rgba(15,23,42,0.9)'];

/** The valley: six districts on a ring, joined by the roads fire travels along. Tap a district to act on it. */
function Valley({ s, pick, onPick, plan }: { s: StandState; pick: number | null; onPick: (d: number) => void; plan: Plan | null }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - space.lg * 2, MAX_CONTENT_WIDTH - 64, 300);
  const tile = Math.max(76, Math.min(92, size / 3.3));
  const r = size / 2 - tile / 2;
  const tileH = tile * 0.72;
  const yR = (size * 0.86) / 2 - tileH / 2;
  const at = (d: number) => {
    const a = (Math.PI * 2 * d) / N - Math.PI / 2;
    return { x: size / 2 + r * Math.cos(a), y: (size * 0.86) / 2 + yR * Math.sin(a) };
  };
  const preview = plan ? previewFire(s.fire, plan) : s.fire;
  return (
    <View style={{ width: size, height: size * 0.86, alignSelf: 'center' }}>
      <Svg width={size} height={size * 0.86} style={{ position: 'absolute' }}>
        {DISTRICTS.map((_, d) => {
          const e = (d + 1) % N;
          const hot = (s.fire[d] >= 2 && s.fire[d] < BURNED) || (s.fire[e] >= 2 && s.fire[e] < BURNED);
          return <Line key={d} x1={at(d).x} y1={at(d).y} x2={at(e).x} y2={at(e).y} stroke={hot ? colors.rival : colors.textFaint} strokeWidth={hot ? 3 : 2} />;
        })}
      </Svg>
      {DISTRICTS.map((name, d) => {
        const f = s.fire[d];
        const burned = f >= BURNED;
        const on = pick === d;
        const planned = plan && plan.kind !== 'refill' && plan.d === d;
        const grows = !burned && preview[d] > f;
        const lost = !burned && preview[d] >= BURNED;
        const near = neighbours(d).filter((x) => s.fire[x] >= 2 && s.fire[x] < BURNED).map((x) => DISTRICTS[x]);
        return (
          <Pressable
            key={d}
            disabled={burned}
            onPress={() => {
              haptic.select();
              onPick(d);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: burned }}
            accessibilityLabel={`${name}: ${burned ? 'burned out' : `fire level ${f} of 3`}${planned ? `, your teammate plans to ${plan!.kind} here` : ''}${grows ? `, reaches ${Math.min(preview[d], BURNED)} next round if nothing changes` : ''}${near.length ? `, next to fire in ${near.join(' and ')}` : ''}`}
            style={[styles.district, { width: tile, height: tileH, left: at(d).x - tile / 2, top: at(d).y - tileH / 2, backgroundColor: colors.bgRaised }, planned && { borderColor: colors.accent, borderStyle: 'dashed', borderWidth: 2 }, on && { borderColor: colors.text, borderWidth: 2 }]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: FIRE_TINT[Math.min(f, 4)], borderRadius: radius.md - 1 }]} />
            <AppText variant="caption" weight="semibold" color={colors.text} numberOfLines={1}>
              {name}
            </AppText>
            {burned ? (
              <AppText variant="caption" color={colors.textMuted}>
                burned out
              </AppText>
            ) : (
              <Row style={{ gap: 1 }}>
                {[0, 1, 2].map((k) => (
                  <Flame key={k} size={13} color={k < f ? (f >= 3 ? colors.danger : colors.rival) : colors.textFaint} fill={k < f ? (f >= 3 ? colors.danger : colors.rival) : 'none'} />
                ))}
                {grows ? (
                  <AppText variant="caption" weight="bold" color={lost ? colors.danger : colors.insight} style={{ marginLeft: 2, fontSize: 10 }}>
                    {lost ? '!' : `→${preview[d]}`}
                  </AppText>
                ) : null}
              </Row>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function LastStandBoard({ state, act, over, rivalName }: BoardProps<StandState, Plan>) {
  const [pick, setPick] = useState<number | null>(null);
  const plan = over ? null : teammatePlan(state);
  const last = state.rounds[state.rounds.length - 1];
  const mate = rivalName === 'Your teammate' ? 'Your teammate' : rivalName.replace(/^The /, '');
  const waterAfterMate = state.water - (plan?.kind === 'douse' ? 1 : 0);
  const commit = (p: Plan) => {
    haptic.commit();
    act(p);
    setPick(null);
  };
  const place = pick !== null ? DISTRICTS[pick] : null;
  return (
    <View style={{ gap: space.sm }}>
      <Row>
        <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`Water ${state.water} of ${MAX_WATER}.`}>
          <Row style={{ gap: 4 }}>
            <Droplets size={13} color={colors.accent} />
            <AppText variant="caption" color={colors.accent}>
              Water {state.water}/{MAX_WATER}
            </AppText>
          </Row>
          <AnimatedBar ratio={state.water / MAX_WATER} color={colors.accent} height={6} />
        </View>
        <AppText variant="caption" color={burnedOut(state) ? colors.danger : colors.textMuted} tabular>
          {burnedOut(state)} of 2 burned out
        </AppText>
      </Row>

      <Valley s={state} pick={pick} onPick={setPick} plan={plan} />

      {last ? (
        <CompactReveal revealKey={state.rounds.length} tone={last.newlyBurned.length ? 'bad' : 'plain'} summary={`${mate}: ${planText(last.bot)} · You: ${planText(last.you)}. New fire in ${last.ignited.map((d) => DISTRICTS[d]).join(' and ') || 'nowhere'}.${last.newlyBurned.length ? ` ${last.newlyBurned.map((d) => DISTRICTS[d]).join(' and ')} burned out.` : ''}`} />
      ) : null}

      {plan ? (
        <View style={{ gap: space.xs }}>
          <Row style={{ gap: 6 }}>
            <Radio size={14} color={colors.accent} />
            <AppText variant="caption" color={colors.textBody} style={{ flex: 1 }}>
              {mate} radios: <AppText variant="caption" weight="semibold">“{planText(plan)}.”</AppText> →N shows next round’s fire if nothing else changes.
            </AppText>
          </Row>
          <Row>
            <Button label={place ? `Douse ${place}` : 'Tap a district'} kicker={place ? '−2 fire · 1 water' : undefined} compact icon={Droplets} iconPosition="left" disabled={pick === null || waterAfterMate <= 0} onPress={() => pick !== null && commit({ kind: 'douse', d: pick })} style={{ flex: 1 }} />
            <Button label={place ? `Firebreak` : 'Firebreak'} kicker={place ? `blocks spread` : undefined} variant="secondary" compact icon={Shield} iconPosition="left" disabled={pick === null} onPress={() => pick !== null && commit({ kind: 'firebreak', d: pick })} style={{ flex: 1 }} />
          </Row>
          <Button label={`Refill +${refillAmount(state.setup.variant)} water`} variant="secondary" compact icon={Droplets} iconPosition="left" onPress={() => commit({ kind: 'refill' })} />
        </View>
      ) : null}

      {state.rounds.length ? (
        <MatchLog title="Actions by round" summary="Who did what, and where the fire started">
          {state.rounds.map((r, i) => (
            <AppText key={i} variant="caption" color={r.newlyBurned.length ? colors.rivalText : colors.textBody}>
              {i + 1}. {mate}: {planText(r.bot)} · You: {planText(r.you)} · new fire: {r.ignited.map((d) => DISTRICTS[d]).join(', ') || 'none'}
              {r.newlyBurned.length ? ` · lost ${r.newlyBurned.map((d) => DISTRICTS[d]).join(', ')}` : ''}
            </AppText>
          ))}
        </MatchLog>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  district: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 2, overflow: 'hidden' },
});
