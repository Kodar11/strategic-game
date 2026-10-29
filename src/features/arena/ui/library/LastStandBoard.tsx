import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Droplets, Flame, Radio, Shield } from '@/src/components/ui/icons';
import { BURNED, DISTRICTS, MAX_WATER, N, type Plan, type StandState, burnedOut, planText, refillAmount, teammatePlan } from '@/src/arena/last-stand';
import { haptic } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';
import { AnimatedBar, type BoardProps, Reveal, Row } from '../parts';
import { Chip, Overline, Panel } from './kit';

const FIRE_TINT = ['rgba(74,222,128,0.14)', 'rgba(253,186,116,0.20)', 'rgba(249,115,22,0.30)', 'rgba(239,68,68,0.40)', 'rgba(15,23,42,0.9)'];

type Mode = 'douse' | 'firebreak' | 'refill';

/** The valley: six districts on a ring (each touches the two beside it), positioned around a circle. */
function Valley({ s, mode, pick, onPick, plan }: { s: StandState; mode: Mode; pick: number | null; onPick: (d: number) => void; plan: Plan | null }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - space.lg * 2 - space.lg * 2, MAX_CONTENT_WIDTH - 64, 340);
  const tile = Math.max(76, Math.min(96, size / 3.4));
  const r = size / 2 - tile / 2;
  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <View style={[styles.ring, { width: r * 2, height: r * 2, left: tile / 2, top: tile / 2, borderRadius: r }]} />
      {DISTRICTS.map((name, d) => {
        const a = (Math.PI * 2 * d) / N - Math.PI / 2;
        const f = s.fire[d];
        const burned = f >= BURNED;
        const on = pick === d;
        const planned = plan && plan.kind !== 'refill' && plan.d === d;
        return (
          <Pressable
            key={d}
            disabled={burned || mode === 'refill'}
            onPress={() => {
              haptic.select();
              onPick(d);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: burned || mode === 'refill' }}
            accessibilityLabel={`${name}: ${burned ? 'burned out' : `fire level ${f} of 3`}${planned ? `, your teammate plans to ${plan!.kind} here` : ''}`}
            style={[
              styles.district,
              { width: tile, height: tile * 0.8, left: size / 2 + r * Math.cos(a) - tile / 2, top: size / 2 + r * Math.sin(a) - (tile * 0.8) / 2, backgroundColor: FIRE_TINT[Math.min(f, 4)] },
              planned && { borderColor: colors.accent, borderStyle: 'dashed' },
              on && { borderColor: colors.text, borderWidth: 2 },
            ]}>
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
                  <Flame key={k} size={14} color={k < f ? (f >= 3 ? colors.danger : colors.rival) : colors.textFaint} fill={k < f ? (f >= 3 ? colors.danger : colors.rival) : 'none'} />
                ))}
              </Row>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function LastStandBoard({ state, act, over, rivalName }: BoardProps<StandState, Plan>) {
  const [mode, setMode] = useState<Mode>('douse');
  const [pick, setPick] = useState<number | null>(null);
  const plan = over ? null : teammatePlan(state);
  const last = state.rounds[state.rounds.length - 1];
  const mate = rivalName === 'Your teammate' ? 'Your teammate' : rivalName.replace(/^The /, '');
  const waterAfterMate = state.water - (plan?.kind === 'douse' ? 1 : 0);
  const ready = mode === 'refill' || (pick !== null && (mode !== 'douse' || waterAfterMate > 0));
  const commit = () => {
    if (!ready) return;
    haptic.commit();
    act(mode === 'refill' ? { kind: 'refill' } : { kind: mode, d: pick! });
    setPick(null);
  };
  return (
    <View style={{ gap: space.lg }}>
      <Row style={{ flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 150, gap: 4 }} accessible accessibilityLabel={`Water ${state.water} of ${MAX_WATER}.`}>
          <Row style={{ gap: 4 }}>
            <Droplets size={14} color={colors.accent} />
            <AppText variant="caption" color={colors.accent}>
              Water {state.water}/{MAX_WATER}
            </AppText>
          </Row>
          <AnimatedBar ratio={state.water / MAX_WATER} color={colors.accent} />
        </View>
        <AppText variant="caption" color={burnedOut(state) ? colors.danger : colors.textMuted}>
          Round {Math.min(state.rounds.length + 1, state.total)}/{state.total} · {burnedOut(state)} of 2 burned out
        </AppText>
      </Row>

      <Valley s={state} mode={mode} pick={pick} onPick={setPick} plan={plan} />

      {last ? (
        <Reveal revealKey={state.rounds.length} tone={last.newlyBurned.length ? 'bad' : 'plain'} overline={`Round ${state.rounds.length} · the fire moved`}>
          <AppText variant="small" color={colors.textBody} accessibilityLiveRegion="polite">
            {mate}: {planText(last.bot)} · You: {planText(last.you)}. New fire in {last.ignited.map((d) => DISTRICTS[d]).join(' and ') || 'nowhere'}.
            {last.newlyBurned.length ? ` ${last.newlyBurned.map((d) => DISTRICTS[d]).join(' and ')} burned out.` : ''}
          </AppText>
        </Reveal>
      ) : null}

      {plan ? (
        <Panel accent="rgba(34,211,238,0.35)">
          <Row>
            <Radio size={16} color={colors.accent} />
            <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
              {mate} radios: <AppText variant="small" weight="semibold">“{planText(plan)}.”</AppText>
            </AppText>
          </Row>
          <Overline>Your action</Overline>
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip label="Douse −2 · 1 water" on={mode === 'douse'} onPress={() => setMode('douse')} tint={colors.accent} disabled={waterAfterMate <= 0} />
            <Chip label="Firebreak" on={mode === 'firebreak'} onPress={() => setMode('firebreak')} tint={colors.primary} />
            <Chip label={`Refill +${refillAmount(state.setup.variant)}`} on={mode === 'refill'} onPress={() => setMode('refill')} tint={colors.success} />
          </Row>
          <Button
            label={mode === 'refill' ? 'Refill the tanks' : pick === null ? 'Choose a district on the map' : `${mode === 'douse' ? 'Douse' : 'Firebreak'} ${DISTRICTS[pick]}`}
            icon={mode === 'douse' ? Droplets : mode === 'firebreak' ? Shield : Droplets}
            iconPosition="left"
            disabled={!ready}
            onPress={commit}
          />
          <AppText variant="caption" color={colors.textMuted}>
            After you both act, fires at 2+ grow and spread into each neighbour (a firebreak blocks it). Then new fires start.
          </AppText>
        </Panel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  district: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 4 },
});
