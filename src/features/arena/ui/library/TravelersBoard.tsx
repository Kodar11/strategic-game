import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CompactReveal, MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Luggage } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { CLAIM_MAX, CLAIM_MIN, type TravelerState, bonusOf, travelPayoff } from '@/src/arena/travelers';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Row } from '../parts';
import { Panel } from './kit';

const STEPS = Array.from({ length: CLAIM_MAX - CLAIM_MIN + 1 }, (_, i) => CLAIM_MIN + i);

/** The staircase from the minimum to the maximum claim, with both travellers' last claims on it. */
function Staircase({ you, them }: { you: number; them: number | null }) {
  return (
    <View style={styles.stairs} accessible accessibilityLabel={`Claim range ${CLAIM_MIN} to ${CLAIM_MAX}. You ${you}${them !== null ? `, they claimed ${them} last round` : ''}.`}>
      {STEPS.map((v) => {
        const mine = v === you;
        const theirs = v === them;
        return <View key={v} style={[styles.step, { height: 6 + (v - CLAIM_MIN) * 2 }, v <= you && { backgroundColor: 'rgba(37,99,235,0.35)' }, theirs && { backgroundColor: colors.rival }, mine && { backgroundColor: colors.primary }]} />;
      })}
    </View>
  );
}

export function TravelersBoard({ state, act, over, rivalName }: BoardProps<TravelerState, number>) {
  const h = state.rounds;
  const last = h[h.length - 1];
  const [claim, setClaim] = useState(last ? last.claims[0] : CLAIM_MAX);
  const r = bonusOf(state.setup.variant);
  const ifUnder = travelPayoff(state.setup.variant, claim, Math.max(CLAIM_MIN, claim - 1))[0];
  const ifOver = travelPayoff(state.setup.variant, claim, Math.min(CLAIM_MAX, claim + 1))[0];
  return (
    <View style={{ gap: space.sm }}>
      {last ? (
        <CompactReveal revealKey={h.length} tone={last.pay[0] >= last.pay[1] ? 'good' : 'bad'} overline={`Round ${h.length} · the airline pays the lower claim`} summary={`You claimed ${last.claims[0]}, they claimed ${last.claims[1]}. Paid: you ${last.pay[0]}, them ${last.pay[1]}.`}>
          <AppText variant="caption" color={colors.textBody}>
            {last.claims[0] === last.claims[1] ? `Equal claims: ${last.claims[0]} each.` : `Lower claim ${Math.min(...last.claims)}: +${r} to the lower claimant, −${r} to the higher.`}
          </AppText>
        </CompactReveal>
      ) : null}

      {!over ? (
        <Panel accent="rgba(249,115,22,0.35)" style={{ padding: space.md, gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <AppText variant="overline" color={colors.rivalText}>
                Your claim
              </AppText>
              <AppText variant="number" tabular>
                {claim}
              </AppText>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <AppText variant="caption" color={colors.textBody} tabular>
                they claim the same: {claim}
              </AppText>
              <AppText variant="caption" color={colors.textBody} tabular>
                they claim one less: {ifUnder}
              </AppText>
              <AppText variant="caption" color={colors.textBody} tabular>
                they claim one more: {ifOver}
              </AppText>
            </View>
          </Row>
          <Staircase you={claim} them={last ? last.claims[1] : null} />
          <Slider value={claim} min={CLAIM_MIN} max={CLAIM_MAX} step={1} onChange={setClaim} label="Your claim" hideLabel showValue={false} tone="orange" />
          <Button
            label={`Claim ${claim}`}
            icon={Luggage}
            iconPosition="left"
            onPress={() => {
              haptic.commit();
              act(claim);
            }}
          />
        </Panel>
      ) : null}

      {h.length ? (
        <MatchLog title="Claims so far" summary={`You ${h.map((x) => x.claims[0]).join(', ')} · them ${h.map((x) => x.claims[1]).join(', ')}`} defaultOpen={over}>
          <View style={styles.chart} accessible accessibilityLabel={`Your claims ${h.map((x) => x.claims[0]).join(', ')}; theirs ${h.map((x) => x.claims[1]).join(', ')}.`}>
            {h.map((x, i) => (
              <View key={i} style={styles.col}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                  <View style={[styles.bar, { height: `${(x.claims[0] / CLAIM_MAX) * 100}%`, backgroundColor: colors.primary }]} />
                  <View style={[styles.bar, { height: `${(x.claims[1] / CLAIM_MAX) * 100}%`, backgroundColor: colors.rival }]} />
                </View>
                <AppText variant="caption" color={colors.textFaint}>
                  {i + 1}
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" color={colors.textFaint}>
            Blue: you · orange: {rivalName.replace(/^The /, '')}
          </AppText>
        </MatchLog>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stairs: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 46, paddingHorizontal: 14 },
  step: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: colors.surfaceHigh },
  chart: { height: 90, flexDirection: 'row', gap: 6, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface },
  col: { flex: 1, alignItems: 'center', gap: 2 },
  bar: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
});
