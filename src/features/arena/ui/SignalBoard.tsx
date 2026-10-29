import { memo } from 'react';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Check, Eye, EyeOff, HandCoins, type LucideIcon, Megaphone, ScanSearch, ShieldAlert, X } from '@/src/components/ui/icons';
import { FEE, GAIN, LOSS, STAKE, type Signal, type SignalAction, type SignalRound, type SignalState, TEST_COST, afterTest, signalPrompt, testAccuracy } from '@/src/arena/signal';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { ActionTile, type BoardProps, Reveal, Row, signed } from './parts';

const SIG: Record<Signal, { name: string; icon: LucideIcon; claim: string; cost: string; tint: string; bg: string }> = {
  warn: { name: 'Warn', icon: ShieldAlert, claim: '“This one is weak.”', cost: 'Costs the sender nothing.', tint: colors.rivalText, bg: colors.rivalSoft },
  pitch: { name: 'Pitch', icon: Megaphone, claim: '“This one is strong.”', cost: 'Free to send — true or not.', tint: colors.insight, bg: colors.insightSoft },
  stake: { name: 'Stake', icon: HandCoins, claim: '“Strong — and I’ll back it.”', cost: `If false and you invest, the sender pays you ${STAKE}.`, tint: colors.success, bg: colors.successSoft },
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Strong vs Weak as one split bar. */
const Odds = memo(function Odds({ p, label }: { p: number; label: string }) {
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${label}: ${pct(p)} Strong, ${pct(1 - p)} Weak.`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="caption" color={colors.success}>
          Strong {pct(p)}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {label}
        </AppText>
        <AppText variant="caption" color={colors.danger}>
          Weak {pct(1 - p)}
        </AppText>
      </Row>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.surfaceHigh }}>
        <View style={{ width: `${p * 100}%`, backgroundColor: colors.success }} />
        <View style={{ flex: 1, backgroundColor: 'rgba(248,113,113,0.55)' }} />
      </View>
    </View>
  );
});

/** What a sender's signals have meant so far, counted from revealed rounds. */
function TrackRecord({ h, sender, title }: { h: readonly SignalRound[]; sender: 'player' | 'bot'; title: string }) {
  const mine = h.filter((r) => r.sender === sender);
  const parts = (['stake', 'pitch', 'warn'] as const)
    .map((s) => {
      const r = mine.filter((x) => x.signal === s);
      if (!r.length) return null;
      const strong = r.filter((x) => x.strong).length;
      return `${SIG[s].name}: ${strong} strong · ${r.length - strong} weak`;
    })
    .filter(Boolean);
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="caption" color={colors.textMuted}>
        {title}
      </AppText>
      <AppText variant="small" color={colors.textBody}>
        {parts.length ? parts.join('  ·  ') : 'No record yet.'}
      </AppText>
    </View>
  );
}

function Receive({ s, prior, signal, test, act, name }: { s: SignalState; prior: number; signal: Signal; test: boolean | null; act: (a: SignalAction) => void; name: string }) {
  const reduced = useMotionReduced();
  const sig = SIG[signal];
  const a = testAccuracy(s.setup.variant);
  const tap = (x: SignalAction) => {
    haptic.commit();
    act(x);
  };
  return (
    <View style={{ gap: space.md }}>
      <Odds p={prior} label="prior" />
      <Animated.View entering={reduced ? undefined : ZoomIn.duration(200)} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: sig.tint, backgroundColor: colors.bgRaised }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: sig.bg, alignItems: 'center', justifyContent: 'center' }}>
          <sig.icon size={22} color={sig.tint} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" color={colors.textMuted}>
            {name} sends
          </AppText>
          <AppText variant="bodyStrong" color={sig.tint}>
            {sig.name} — {sig.claim}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {sig.cost} It earns {FEE} if you invest, either way.
          </AppText>
        </View>
      </Animated.View>
      <TrackRecord h={s.rounds} sender="bot" title={`${name}’s record so far`} />
      {test === null ? (
        <Button label={`Investigate (−${TEST_COST}) · ${pct(a)} accurate test`} variant="secondary" icon={ScanSearch} iconPosition="left" onPress={() => tap('investigate')} />
      ) : (
        <Animated.View entering={reduced ? undefined : ZoomIn.duration(200)} style={{ gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: test ? colors.successSoft : colors.dangerSoft }}>
          <AppText variant="bodyStrong" color={test ? colors.success : colors.danger} accessibilityLiveRegion="polite">
            Test says {test ? 'Strong' : 'Weak'}
          </AppText>
          <Odds p={afterTest(prior, test, a)} label="prior + test, before the signal" />
        </Animated.View>
      )}
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <ActionTile label="Invest" hint={`${signed(GAIN)} if Strong · ${signed(signal === 'stake' ? -LOSS + STAKE : -LOSS)} if Weak`} icon={Check} tint={colors.success} bg={colors.successSoft} onPress={() => tap('invest')} />
        <ActionTile label="Pass" hint={test === null ? '0 either way' : `${signed(-TEST_COST)} (test paid)`} icon={X} tint={colors.textBody} bg={colors.surfaceHigh} onPress={() => tap('pass')} />
      </View>
    </View>
  );
}

function Send({ s, prior, strong, act, name }: { s: SignalState; prior: number; strong: boolean; act: (a: SignalAction) => void; name: string }) {
  const tap = (x: Signal) => {
    haptic.commit();
    act(x);
  };
  return (
    <View style={{ gap: space.md }}>
      <Odds p={prior} label="what they know: the prior" />
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.md, borderRadius: radius.lg, backgroundColor: strong ? colors.successSoft : colors.dangerSoft }}>
        <Eye size={22} color={strong ? colors.success : colors.danger} />
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color={colors.textMuted}>
            Only you can see this
          </AppText>
          <AppText variant="heading" color={strong ? colors.success : colors.danger}>
            This venture is {strong ? 'Strong' : 'Weak'}
          </AppText>
        </View>
      </View>
      <TrackRecord h={s.rounds} sender="player" title={`Your record — what ${name} has seen`} />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {(['warn', 'pitch', 'stake'] as const).map((x) => (
          <ActionTile key={x} label={SIG[x].name} hint={x === 'stake' && !strong ? `${signed(FEE - STAKE)} if they invest` : `${signed(FEE)} if they invest`} icon={SIG[x].icon} tint={SIG[x].tint} bg={SIG[x].bg} onPress={() => tap(x)} />
        ))}
      </View>
    </View>
  );
}

function verdict(r: SignalRound, name: string): string {
  const truth = r.strong ? 'Strong' : 'Weak';
  if (r.sender === 'bot') {
    const lead = `It was ${truth}. ${name} sent ${SIG[r.signal].name.toLowerCase()}.`;
    return r.invested ? `${lead} You invested: ${signed(r.ps)}.` : `${lead} You passed${r.tested ? ` after a test (${signed(r.ps)})` : ''}.`;
  }
  const lead = `It was ${truth}; you sent ${SIG[r.signal].name.toLowerCase()}.`;
  return `${lead} ${name} ${r.tested ? `investigated (test said ${r.test ? 'Strong' : 'Weak'}) and ` : ''}${r.invested ? 'invested' : 'passed'}: you ${signed(r.ps)}, it ${signed(r.bs)}.`;
}

export function SignalBoard({ state, act, over, rivalName }: BoardProps<SignalState, SignalAction>) {
  const reduced = useMotionReduced();
  const h = state.rounds;
  const last = h[h.length - 1];
  const p = signalPrompt(state);
  return (
    <View style={{ gap: space.lg }}>
      {last ? (
        <Reveal revealKey={h.length} tone={last.ps > 0 ? 'good' : last.ps < 0 ? 'bad' : 'plain'} overline={`Round ${h.length} · venture revealed`}>
          <Row>
            <Animated.View entering={reduced ? undefined : ZoomIn.duration(220)} style={{ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: last.strong ? colors.success : colors.danger }}>
              <AppText variant="small" weight="bold" color={colors.bg}>
                {last.strong ? 'STRONG' : 'WEAK'}
              </AppText>
            </Animated.View>
            <AppText variant="caption" color={colors.textMuted}>
              prior was {pct(last.prior)} strong
            </AppText>
          </Row>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            {verdict(last, rivalName)}
          </AppText>
        </Reveal>
      ) : null}

      {!over && p ? (
        <View style={{ gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)', backgroundColor: colors.surface }}>
          <Row>
            {p.role === 'receive' ? <EyeOff size={18} color={colors.success} /> : <Eye size={18} color={colors.success} />}
            <AppText variant="overline" color={colors.success}>
              {p.role === 'receive' ? 'You’re the investor — the truth is hidden' : 'You’re the sender — you know the truth'}
            </AppText>
          </Row>
          {p.role === 'receive' ? <Receive s={state} prior={p.prior} signal={p.signal} test={p.test} act={act} name={rivalName} /> : <Send s={state} prior={p.prior} strong={p.strong} act={act} name={rivalName} />}
        </View>
      ) : null}

      {h.length ? (
        <View style={{ gap: space.xs }}>
          <AppText variant="caption" color={colors.textMuted}>
            Ventures so far
          </AppText>
          {h.map((r, i) => (
            <Row key={i} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <AppText variant="caption" color={colors.textMuted} tabular style={{ width: 26 }}>
                R{i + 1}
              </AppText>
              <AppText variant="small" color={colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
                {r.sender === 'bot' ? 'They' : 'You'} sent {SIG[r.signal].name.toLowerCase()} · {r.invested ? 'invested' : 'passed'}
              </AppText>
              <AppText variant="small" weight="semibold" color={r.strong ? colors.success : colors.danger} style={{ width: 54 }}>
                {r.strong ? 'Strong' : 'Weak'}
              </AppText>
              <AppText variant="small" tabular color={colors.textMuted} style={{ width: 48, textAlign: 'right' }}>
                {signed(r.ps)}
              </AppText>
            </Row>
          ))}
        </View>
      ) : null}
    </View>
  );
}
