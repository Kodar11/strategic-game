import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FlipInYLeft } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Luggage } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { CLAIM_MAX, CLAIM_MIN, type TravelerState, bonusOf, travelPayoff } from '@/src/arena/travelers';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row } from '../parts';
import { Overline, Panel } from './kit';

function Tag({ who, claim, pay, tint, k }: { who: string; claim: number; pay: number; tint: string; k: string }) {
  const reduced = useMotionReduced();
  return (
    <Animated.View key={k} entering={reduced ? undefined : FlipInYLeft.duration(260)} style={[styles.tag, { borderColor: tint }]}>
      <View style={[styles.hole, { borderColor: tint }]} />
      <AppText variant="caption" color={tint}>
        {who} claimed
      </AppText>
      <AppText variant="number" tabular>
        {claim}
      </AppText>
      <AppText variant="small" color={colors.textBody} tabular>
        paid {pay}
      </AppText>
    </Animated.View>
  );
}

export function TravelersBoard({ state, act, over, rivalName }: BoardProps<TravelerState, number>) {
  const h = state.rounds;
  const last = h[h.length - 1];
  const [claim, setClaim] = useState(last ? last.claims[0] : CLAIM_MAX);
  const r = bonusOf(state.setup.variant);
  const ifSame = claim;
  const ifUnder = travelPayoff(state.setup.variant, claim, Math.max(CLAIM_MIN, claim - 1))[0];
  const ifOver = travelPayoff(state.setup.variant, claim, Math.min(CLAIM_MAX, claim + 1))[0];
  return (
    <View style={{ gap: space.lg }}>
      {last ? (
        <Reveal revealKey={h.length} tone={last.pay[0] >= last.pay[1] ? 'good' : 'bad'} overline={`Round ${h.length} · the airline pays the lower claim`}>
          <Row style={{ justifyContent: 'center', gap: space.md }}>
            <Tag k={`y${h.length}`} who="You" claim={last.claims[0]} pay={last.pay[0]} tint={colors.primaryText} />
            <Tag k={`t${h.length}`} who={rivalName.replace(/^The /, '')} claim={last.claims[1]} pay={last.pay[1]} tint={colors.rivalText} />
          </Row>
          <AppText variant="small" color={colors.textBody} accessibilityLiveRegion="polite">
            {last.claims[0] === last.claims[1] ? `Equal claims: ${last.claims[0]} each.` : `Lower claim ${Math.min(...last.claims)}: +${r} to the lower claimant, −${r} to the higher.`}
          </AppText>
        </Reveal>
      ) : null}

      {!over ? (
        <Panel accent="rgba(249,115,22,0.35)">
          <Row>
            <Luggage size={18} color={colors.rivalText} />
            <Overline color={colors.rivalText}>
              Round {h.length + 1} of {state.total} · your claim
            </Overline>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText variant="number" tabular>
              {claim}
            </AppText>
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="caption" color={colors.textMuted}>
                if they claim the same: {ifSame}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                if one less: {ifUnder} · if one more: {ifOver}
              </AppText>
            </View>
          </Row>
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
        <View style={{ gap: 4 }}>
          <Overline>Claims so far · you / them</Overline>
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
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { width: 120, alignItems: 'center', gap: 2, paddingTop: space.lg, paddingBottom: space.md, borderRadius: radius.lg, borderWidth: 1.5, backgroundColor: colors.bgRaised },
  hole: { position: 'absolute', top: 6, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  chart: { height: 90, flexDirection: 'row', gap: 6, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.border },
  col: { flex: 1, alignItems: 'center', gap: 2 },
  bar: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
});
