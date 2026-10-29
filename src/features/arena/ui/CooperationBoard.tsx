import { memo } from 'react';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';

import { AppText } from '@/src/components/ui/AppText';
import { Link2, Lock, Unlink } from '@/src/components/ui/icons';
import { COOP_PAYOFFS, type CoopMove, type CoopRound, type CoopState, coopPayoff, trustLevel } from '@/src/arena/cooperation';
import { MiniMatrix } from '@/src/features/games/ui/common';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { ActionTile, AnimatedBar, type BoardProps, Reveal, Row, signed } from './parts';

const LABEL: Record<CoopMove, string> = { C: 'Cooperate', D: 'Defect' };
const MOVES: readonly CoopMove[] = ['C', 'D'];
const tint = (m: CoopMove) => (m === 'C' ? colors.primary : colors.rival);

function verdict(r: CoopRound, name: string): string {
  if (r.p === 'C' && r.b === 'C') return `You both cooperated: ${signed(r.ps)} each.`;
  if (r.p === 'D' && r.b === 'C') return `You defected while ${name} cooperated: ${signed(r.ps)} for you, ${signed(r.bs)} for it.`;
  if (r.p === 'C' && r.b === 'D') return `${name} defected while you cooperated: ${signed(r.ps)} for you, ${signed(r.bs)} for it.`;
  return `You both defected: ${signed(r.ps)} each.`;
}

function relationship(t: number): { label: string; color: string; dash?: string; broken?: boolean } {
  if (t >= 70) return { label: 'Strong trust', color: colors.success };
  if (t >= 40) return { label: 'Steady', color: colors.insight };
  if (t >= 15) return { label: 'Fragile', color: colors.rivalText, dash: '6 5' };
  return { label: 'Broken', color: colors.danger, broken: true };
}

/** Two linked nodes: the link's style and the bar show how the shared history has built or broken trust. */
const Relationship = memo(function Relationship({ trust, name }: { trust: number; name: string }) {
  const r = relationship(trust);
  return (
    <View style={{ gap: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.border }} accessible accessibilityLabel={`Relationship: ${r.label}, ${trust} of 100.`}>
      <Row>
        <AppText variant="caption" color={colors.primaryText}>
          You
        </AppText>
        <View style={{ flex: 1, height: 28 }}>
          <Svg width="100%" height={28} viewBox="0 0 200 28" preserveAspectRatio="none">
            {r.broken ? (
              <>
                <Line x1={14} y1={14} x2={86} y2={14} stroke={r.color} strokeWidth={3} strokeLinecap="round" />
                <Line x1={114} y1={14} x2={186} y2={14} stroke={r.color} strokeWidth={3} strokeLinecap="round" />
              </>
            ) : (
              <Line x1={14} y1={14} x2={186} y2={14} stroke={r.color} strokeWidth={2 + trust / 25} strokeDasharray={r.dash} strokeLinecap="round" />
            )}
            <Circle cx={10} cy={14} r={9} fill={colors.primary} />
            <Circle cx={190} cy={14} r={9} fill={colors.rival} />
          </Svg>
        </View>
        <AppText variant="caption" color={colors.rivalText} numberOfLines={1} style={{ maxWidth: 110 }}>
          {name}
        </AppText>
      </Row>
      <Row>
        <AppText variant="caption" color={r.color} style={{ width: 92 }}>
          {r.label}
        </AppText>
        <View style={{ flex: 1 }}>
          <AnimatedBar ratio={trust / 100} color={r.color} height={6} />
        </View>
      </Row>
    </View>
  );
});

function Chip({ who, m, slipped, delay }: { who: string; m: CoopMove; slipped: boolean; delay: number }) {
  const reduced = useMotionReduced();
  const Icon = m === 'C' ? Link2 : Unlink;
  return (
    <Animated.View entering={reduced ? undefined : ZoomIn.duration(200).delay(delay)} style={{ flex: 1, alignItems: 'center', gap: 4, padding: space.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: tint(m), backgroundColor: colors.bgRaised }}>
      <AppText variant="caption" color={colors.textMuted}>
        {who}
      </AppText>
      <Icon size={22} color={tint(m)} strokeWidth={2.2} />
      <AppText variant="bodyStrong" color={m === 'C' ? colors.primaryText : colors.rivalText}>
        {LABEL[m]}
      </AppText>
      {slipped ? (
        <AppText variant="caption" color={colors.insight}>
          slipped
        </AppText>
      ) : null}
    </Animated.View>
  );
}

/** One column per round: your choice above, the opponent's below. Slips get an amber ring. */
const Timeline = memo(function Timeline({ h, total }: { h: readonly CoopRound[]; total: number }) {
  const dot = (m: CoopMove | null, slipped: boolean) => (
    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: m ? tint(m) : 'transparent', borderWidth: m ? (slipped ? 2 : 0) : 1.5, borderColor: m ? colors.insight : colors.borderStrong }} />
  );
  return (
    <View style={{ gap: space.xs }} accessible accessibilityLabel={`History: ${h.map((r, i) => `round ${i + 1}, you ${LABEL[r.p]}, opponent ${LABEL[r.b]}`).join('; ') || 'no rounds yet'}.`}>
      <AppText variant="caption" color={colors.textMuted}>
        History · you over them · blue cooperate, orange defect
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 3, borderRadius: radius.sm, backgroundColor: i < h.length ? colors.bgRaised : 'transparent' }}>
            {dot(h[i]?.p ?? null, !!h[i] && h[i].p !== h[i].pi)}
            {dot(h[i]?.b ?? null, !!h[i] && h[i].b !== h[i].bi)}
          </View>
        ))}
      </View>
    </View>
  );
});

export function CooperationBoard({ state, act, over, rivalName }: BoardProps<CoopState, CoopMove>) {
  const pay = COOP_PAYOFFS[state.setup.variant];
  const h = state.rounds;
  const last = h[h.length - 1];
  const finalRound = h.length === state.total - 1;
  const slipNote = last
    ? [last.p !== last.pi ? `Your ${LABEL[last.pi]} slipped and was delivered as ${LABEL[last.p]}.` : null, last.b !== last.bi ? `${rivalName} meant to ${LABEL[last.bi].toLowerCase()} — its choice slipped.` : null].filter(Boolean).join(' ')
    : '';

  return (
    <View style={{ gap: space.lg }}>
      <Relationship trust={trustLevel(h)} name={rivalName} />

      {last ? (
        <Reveal revealKey={h.length} tone={last.ps > last.bs ? 'good' : last.ps < last.bs ? 'bad' : 'plain'} overline={`Round ${h.length} revealed`}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip who="You" m={last.p} slipped={last.p !== last.pi} delay={0} />
            <Chip who={rivalName} m={last.b} slipped={last.b !== last.bi} delay={140} />
          </View>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            {verdict(last, rivalName)}
          </AppText>
          {slipNote ? (
            <AppText variant="small" color={colors.insight}>
              {slipNote}
            </AppText>
          ) : null}
        </Reveal>
      ) : null}

      {!over ? (
        <View style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'center' }}>
            <Lock size={14} color={colors.textMuted} />
            <AppText variant="overline" color={finalRound ? colors.insight : colors.textMuted}>
              {finalRound ? 'Final round — no reply can follow' : `${rivalName.replace(/^The /, '')} has locked in · your move`}
            </AppText>
          </Row>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            {MOVES.map((m) => {
              const [ifC] = coopPayoff(pay, m, 'C');
              const [ifD] = coopPayoff(pay, m, 'D');
              return (
                <ActionTile
                  key={m}
                  label={LABEL[m]}
                  hint={`${signed(ifC)} if they cooperate · ${signed(ifD)} if they defect`}
                  icon={m === 'C' ? Link2 : Unlink}
                  tint={m === 'C' ? colors.primaryText : colors.rivalText}
                  bg={m === 'C' ? colors.primarySoft : colors.rivalSoft}
                  onPress={() => {
                    haptic.commit();
                    act(m);
                  }}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      <MiniMatrix moves={MOVES} labels={LABEL} payoff={(p, b) => coopPayoff(pay, p, b)} played={last ? { p: last.p, b: last.b } : undefined} />
      <Timeline h={h} total={state.total} />
    </View>
  );
}
