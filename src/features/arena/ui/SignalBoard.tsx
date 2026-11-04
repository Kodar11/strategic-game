import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { CompactReveal, MatchLog } from '@/src/components/game/MatchLog';
import { ChoiceTile } from '@/src/components/game/MatchChrome';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Check, Eye, EyeOff, HandCoins, type LucideIcon, Megaphone, ScanSearch, ShieldAlert, X } from '@/src/components/ui/icons';
import { FEE, GAIN, PITCH_REFUND, STAKE, type Signal, type SignalAction, type SignalRound, type SignalState, TEST_COST, afterTest, signalPar, signalPrompt, testAccuracy, weakLoss } from '@/src/arena/signal';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Row, signed } from './parts';

const SIG: Record<Signal, { name: string; icon: LucideIcon; claim: string; cost: string; tint: string; bg: string }> = {
  warn: { name: 'Warn', icon: ShieldAlert, claim: '“This one is weak.”', cost: 'Free to send.', tint: colors.rivalText, bg: colors.rivalSoft },
  pitch: { name: 'Pitch', icon: Megaphone, claim: '“This one is strong.”', cost: `Free to send. If false and you invest, the sender refunds ${PITCH_REFUND}.`, tint: colors.insight, bg: colors.insightSoft },
  stake: { name: 'Stake', icon: HandCoins, claim: '“Strong, and I’ll back it.”', cost: `If false and you invest, the sender pays you ${STAKE}.`, tint: colors.success, bg: colors.successSoft },
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Strong vs Weak as one split bar. */
function Odds({ p, label }: { p: number; label: string }) {
  return (
    <View style={{ gap: 2 }} accessible accessibilityLabel={`${label}: ${pct(p)} Strong, ${pct(1 - p)} Weak.`}>
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
      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surfaceHigh }}>
        <View style={{ width: `${p * 100}%`, backgroundColor: colors.success }} />
        <View style={{ flex: 1, backgroundColor: 'rgba(248,113,113,0.55)' }} />
      </View>
    </View>
  );
}

/** A sender's public record: every signal it has sent, stamped with what the venture turned out to be. */
function TrackRecord({ h, sender, title }: { h: readonly SignalRound[]; sender: 'player' | 'bot'; title: string }) {
  const mine = h.filter((r) => r.sender === sender);
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${title}: ${mine.length ? mine.map((r) => `${SIG[r.signal].name}, ${r.strong ? 'strong' : 'weak'}`).join('; ') : 'no signals yet'}.`}>
      <AppText variant="caption" color={colors.textMuted}>
        {title}
      </AppText>
      <Row style={{ flexWrap: 'wrap', gap: 4, minHeight: 24 }}>
        {mine.length ? (
          mine.map((r, i) => {
            const Icon = SIG[r.signal].icon;
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, height: 24, borderRadius: radius.sm, backgroundColor: colors.bgRaised, borderBottomWidth: 2, borderBottomColor: r.strong ? colors.success : colors.danger }}>
                <Icon size={12} color={SIG[r.signal].tint} />
                <AppText variant="caption" color={r.strong ? colors.success : colors.danger}>
                  {r.strong ? 'S' : 'W'}
                </AppText>
              </View>
            );
          })
        ) : (
          <AppText variant="caption" color={colors.textFaint}>
            No signals yet.
          </AppText>
        )}
      </Row>
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
    <View style={{ gap: space.sm }}>
      <Odds p={prior} label="prior" />
      <Animated.View entering={reduced ? undefined : ZoomIn.duration(200)} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: sig.tint, backgroundColor: colors.bgRaised }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: sig.bg, alignItems: 'center', justifyContent: 'center' }}>
          <sig.icon size={20} color={sig.tint} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="small" weight="semibold" color={sig.tint}>
            {sig.name}: {sig.claim}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {sig.cost} It earns {FEE} if you invest, either way.
          </AppText>
        </View>
      </Animated.View>
      <TrackRecord h={s.rounds} sender="bot" title={`${name.replace(/^The /, '')}’s record · S strong, W weak`} />
      {test === null ? (
        <Button label={`Test it (−${TEST_COST}) · ${pct(a)} accurate`} variant="secondary" compact icon={ScanSearch} iconPosition="left" onPress={() => tap('investigate')} />
      ) : (
        <View style={{ gap: 4, padding: space.sm, borderRadius: radius.md, backgroundColor: test ? colors.successSoft : colors.dangerSoft }}>
          <AppText variant="small" weight="semibold" color={test ? colors.success : colors.danger} accessibilityLiveRegion="polite">
            Test says {test ? 'Strong' : 'Weak'}
          </AppText>
          <Odds p={afterTest(prior, test, a)} label="prior + test" />
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <ChoiceTile compact label="Invest" hint={`${signed(GAIN)} Strong · ${signed(-weakLoss(signal))} Weak`} icon={<Check size={18} color={colors.success} />} tint={colors.success} bg={colors.successSoft} onPress={() => act('invest')} />
        <ChoiceTile compact label="Pass" hint={test === null ? '0 either way' : `${signed(-TEST_COST)} (test paid)`} icon={<X size={18} color={colors.textBody} />} tint={colors.textBody} bg={colors.surfaceHigh} onPress={() => act('pass')} />
      </View>
    </View>
  );
}

function Send({ s, prior, strong, act, name }: { s: SignalState; prior: number; strong: boolean; act: (a: SignalAction) => void; name: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <Odds p={prior} label="what they know" />
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.sm, borderRadius: radius.md, backgroundColor: strong ? colors.successSoft : colors.dangerSoft }}>
        <Eye size={20} color={strong ? colors.success : colors.danger} />
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color={colors.textMuted}>
            Only you can see this
          </AppText>
          <AppText variant="bodyStrong" color={strong ? colors.success : colors.danger}>
            This venture is {strong ? 'Strong' : 'Weak'}
          </AppText>
        </View>
      </View>
      <TrackRecord h={s.rounds} sender="player" title={`Your record, as ${name.replace(/^The /, '')} sees it`} />
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        {(['warn', 'pitch', 'stake'] as const).map((x) => {
          const Icon = SIG[x].icon;
          return <ChoiceTile key={x} label={SIG[x].name} hint={x === 'stake' && !strong ? `${signed(FEE - STAKE)} if invested` : x === 'pitch' && !strong ? `${signed(FEE - PITCH_REFUND)} if invested` : `${signed(FEE)} if invested`} icon={<Icon size={20} color={SIG[x].tint} />} tint={SIG[x].tint} bg={SIG[x].bg} onPress={() => act(x)} />;
        })}
      </View>
    </View>
  );
}

function verdict(r: SignalRound, name: string): string {
  const truth = r.strong ? 'Strong' : 'Weak';
  if (r.sender === 'bot') {
    const lead = `It was ${truth}. They sent ${SIG[r.signal].name.toLowerCase()}.`;
    return r.invested ? `${lead} You invested: ${signed(r.ps)}.` : `${lead} You passed${r.tested ? ` after a test (${signed(r.ps)})` : ''}.`;
  }
  const lead = `It was ${truth}; you sent ${SIG[r.signal].name.toLowerCase()}.`;
  return `${lead} ${name.replace(/^The /, '')} ${r.tested ? `tested (${r.test ? 'Strong' : 'Weak'}) and ` : ''}${r.invested ? 'invested' : 'passed'}: you ${signed(r.ps)}, them ${signed(r.bs)}.`;
}

export function SignalBoard({ state, act, over, rivalName }: BoardProps<SignalState, SignalAction>) {
  const h = state.rounds;
  const last = h[h.length - 1];
  const p = signalPrompt(state);
  const par = signalPar(state.setup, state.total);
  const mine = h.reduce((t, r) => t + r.ps, 0);
  return (
    <View style={{ gap: space.sm }}>
      <AppText variant="caption" color={colors.textMuted} tabular>
        Win benchmark: {par} tokens · you have {mine}
      </AppText>
      {last ? <CompactReveal revealKey={h.length} tone={last.ps > 0 ? 'good' : last.ps < 0 ? 'bad' : 'plain'} overline={`Venture ${h.length} · ${last.strong ? 'STRONG' : 'WEAK'} · prior ${pct(last.prior)}`} summary={verdict(last, rivalName)} /> : null}

      {!over && p ? (
        <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)', backgroundColor: colors.surface }}>
          <Row>
            {p.role === 'receive' ? <EyeOff size={16} color={colors.success} /> : <Eye size={16} color={colors.success} />}
            <AppText variant="overline" color={colors.success} style={{ flex: 1 }}>
              {p.role === 'receive' ? 'You invest · the truth is hidden' : 'You send · you know the truth'}
            </AppText>
          </Row>
          {p.role === 'receive' ? <Receive s={state} prior={p.prior} signal={p.signal} test={p.test} act={act} name={rivalName} /> : <Send s={state} prior={p.prior} strong={p.strong} act={act} name={rivalName} />}
        </View>
      ) : null}

      {h.length ? (
        <MatchLog title="Ventures so far" summary={`${h.filter((r) => r.strong).length} strong, ${h.filter((r) => !r.strong).length} weak`}>
          {h.map((r, i) => (
            <Row key={i} style={{ paddingVertical: 3 }}>
              <AppText variant="caption" color={colors.textMuted} tabular style={{ width: 24 }}>
                R{i + 1}
              </AppText>
              <AppText variant="caption" color={colors.textBody} style={{ flex: 1 }} numberOfLines={1}>
                {r.sender === 'bot' ? 'They' : 'You'} sent {SIG[r.signal].name.toLowerCase()} · {r.invested ? 'invested' : 'passed'}
              </AppText>
              <AppText variant="caption" weight="semibold" color={r.strong ? colors.success : colors.danger} style={{ width: 48 }}>
                {r.strong ? 'Strong' : 'Weak'}
              </AppText>
              <AppText variant="caption" tabular color={colors.textMuted} style={{ width: 30, textAlign: 'right' }}>
                {signed(r.ps)}
              </AppText>
            </Row>
          ))}
        </MatchLog>
      ) : null}
    </View>
  );
}
