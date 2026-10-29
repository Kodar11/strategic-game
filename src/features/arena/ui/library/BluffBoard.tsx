import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FlipInYRight, ZoomIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, Check, Hand, Megaphone, Plus } from '@/src/components/ui/icons';
import { BLUFF_FINE, type BluffAction, type BluffState, CALL_COST, CATCH_BONUS, CRACK_P, EXPECTED_TOKEN, MAX_TOKENS, type Token, bluffPrompt, tokenValue } from '@/src/arena/bluff';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row, signed } from '../parts';
import { Overline, Panel, Stepper } from './kit';

const LOOK: Record<string, { fill: string; ring: string; label: string; text: string }> = {
  '3': { fill: '#F5C451', ring: '#B8860B', label: '3', text: '#3B2A00' },
  '1': { fill: '#CBD5E1', ring: '#64748B', label: '1', text: '#0F172A' },
  '0': { fill: '#475569', ring: '#334155', label: '0', text: '#E2E8F0' },
  crack: { fill: '#7F1D1D', ring: '#F87171', label: '✕', text: '#FECACA' },
};

function TokenChip({ t, hidden, i }: { t: Token | null; hidden?: boolean; i: number }) {
  const reduced = useMotionReduced();
  const look = hidden || t === null ? { fill: colors.surfaceHigh, ring: colors.borderStrong, label: '?', text: colors.textMuted } : LOOK[String(t)];
  return (
    <Animated.View entering={reduced ? undefined : FlipInYRight.duration(220).delay(i * 60)} style={[styles.token, { backgroundColor: look.fill, borderColor: look.ring }]}>
      <AppText variant="bodyStrong" color={look.text}>
        {look.label}
      </AppText>
    </Animated.View>
  );
}

export function BluffBoard({ state, act, rivalName }: BoardProps<BluffState, BluffAction>) {
  const p = bluffPrompt(state);
  const h = state.rounds;
  const last = h[h.length - 1];
  const [claim, setClaim] = useState<number | null>(null);
  const go = (a: BluffAction) => {
    haptic.commit();
    act(a);
    setClaim(null);
  };
  const who = (side: 'player' | 'bot') => (side === 'player' ? 'You' : rivalName);

  return (
    <View style={{ gap: space.lg }}>
      {last ? (
        <Reveal revealKey={h.length} tone={last.points[0] > 0 ? 'good' : last.points[0] < 0 ? 'bad' : 'plain'} overline={`Round ${h.length} · ${who(last.claimant)} claimed`}>
          <Row style={{ flexWrap: 'wrap' }}>
            {last.tokens.map((t, i) => (
              <TokenChip key={`${h.length}-${i}`} t={t} i={i} />
            ))}
          </Row>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            {last.bust
              ? `${who(last.claimant)} pressed and drew a Crack — bust.`
              : `Claimed ${last.claim}, really ${tokenValue(last.tokens)}. ${last.call ? (last.claim! > tokenValue(last.tokens) ? 'Called — caught bluffing!' : 'Called — but it was true.') : 'Believed.'}`}
          </AppText>
          <AppText variant="small" color={colors.textMuted}>
            You {signed(last.points[0])} · {rivalName} {signed(last.points[1])}
          </AppText>
        </Reveal>
      ) : null}

      {p && p.role === 'claim' ? (
        <Panel accent="rgba(253,186,116,0.4)">
          <Overline color={colors.insight}>
            Round {p.round} of {state.total} · your tokens (only you can see them)
          </Overline>
          <Row style={{ flexWrap: 'wrap' }}>
            {p.hand.map((t, i) => (
              <TokenChip key={i} t={t} i={i} />
            ))}
            {Array.from({ length: MAX_TOKENS - p.hand.length }, (_, i) => (
              <View key={`e${i}`} style={[styles.token, styles.empty]} />
            ))}
          </Row>
          <AppText variant="small" color={colors.textBody}>
            Worth {p.value}. A token averages {EXPECTED_TOKEN.toFixed(2)}; another draw risks a Crack ({Math.round(CRACK_P * 100)}%).
          </AppText>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Stepper value={claim ?? p.value} min={0} max={p.maxClaim} onChange={setClaim} label="Your claim" />
            <Button label="Press" variant="secondary" icon={Plus} iconPosition="left" compact disabled={!p.canPress} onPress={() => go('press')} />
          </Row>
          <Button label={`Claim ${claim ?? p.value}${(claim ?? p.value) > p.value ? ' (a bluff)' : ''}`} icon={Megaphone} iconPosition="left" onPress={() => go({ claim: claim ?? p.value })} />
        </Panel>
      ) : null}

      {p && p.role === 'judge' ? (
        <Panel accent="rgba(249,115,22,0.45)">
          <Overline color={colors.rivalText}>
            Round {p.round} of {state.total} · {rivalName} claims
          </Overline>
          <Row style={{ justifyContent: 'center', gap: space.lg }}>
            <Row style={{ gap: 6 }}>
              {Array.from({ length: p.count }, (_, i) => (
                <TokenChip key={i} t={null} hidden i={i} />
              ))}
            </Row>
          </Row>
          <Animated.View entering={ZoomIn.duration(220)} style={{ alignItems: 'center' }}>
            <AppText variant="number" tabular>
              {p.claim}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              on {p.count} tokens · about {(EXPECTED_TOKEN * p.count).toFixed(1)} on average, {3 * p.count} at most
            </AppText>
          </Animated.View>
          <Row>
            <Button label="Believe" variant="secondary" icon={Check} iconPosition="left" onPress={() => go('believe')} style={{ flex: 1 }} />
            <Button label="Call it" icon={Hand} iconPosition="left" onPress={() => go('call')} style={{ flex: 1 }} />
          </Row>
          <AppText variant="caption" color={colors.textMuted}>
            A right call: you +{CATCH_BONUS}, they −{BLUFF_FINE}. A wrong call: you −{CALL_COST} and they score the claim.
          </AppText>
        </Panel>
      ) : null}

      {p && p.role === 'bust' ? (
        <Panel>
          <Overline color={colors.rivalText}>Round {p.round} · {rivalName} pressed its luck</Overline>
          <Row style={{ flexWrap: 'wrap' }}>
            {p.tokens.map((t, i) => (
              <TokenChip key={i} t={t} i={i} />
            ))}
          </Row>
          <AppText variant="bodyStrong">It drew a Crack and busted. Nothing to judge.</AppText>
          <Button label="Continue" icon={ArrowRight} onPress={() => go('continue')} />
        </Panel>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  token: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  empty: { borderStyle: 'dashed', borderColor: colors.border, backgroundColor: 'transparent', borderWidth: 1.5 },
});
