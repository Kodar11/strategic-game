import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Fish } from '@/src/components/ui/icons';
import { CAPACITY, COLLAPSE_BELOW, type CommonsState, MAX_TAKE, SUSTAINABLE_SHARE, boatName, dividend, regrow } from '@/src/arena/commons';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row, Stat } from '../parts';
import { Avatar, Overline, Panel, Stepper } from './kit';

/** The lake: water height is the stock; the dashed line is half capacity, where it regrows fastest. */
function Lake({ lake, before }: { lake: number; before: number | null }) {
  const reduced = useMotionReduced();
  const h = useSharedValue(reduced ? lake / CAPACITY : (before ?? lake) / CAPACITY);
  useEffect(() => {
    h.set(reduced ? lake / CAPACITY : withTiming(lake / CAPACITY, { duration: 600 }));
  }, [lake, reduced, h]);
  const water = useAnimatedStyle(() => ({ height: `${Math.max(0, h.get()) * 100}%` }));
  const fish = Math.round(lake / 10);
  return (
    <View style={styles.lake} accessible accessibilityLabel={`The lake holds ${lake} fish of ${CAPACITY}. ${lake === 0 ? 'It has collapsed.' : `It regrows to about ${regrow('standard', lake)} if nobody fishes.`}`}>
      <Animated.View style={[styles.water, water]} />
      <View style={[styles.half, { bottom: '50%' }]} />
      <AppText variant="caption" color={colors.accent} style={{ position: 'absolute', right: 8, bottom: '50%', marginBottom: 2 }}>
        best regrowth
      </AppText>
      <View style={styles.fishRow}>
        {Array.from({ length: fish }, (_, i) => (
          <Fish key={i} size={16} color={colors.text} style={{ opacity: 0.85, transform: [{ scaleX: i % 2 ? -1 : 1 }] }} />
        ))}
      </View>
      <View style={styles.lakeLabel}>
        <AppText variant="number" tabular>
          {lake}
        </AppText>
        <AppText variant="caption" color={colors.textBody}>
          {lake === 0 ? 'collapsed' : 'fish in the lake'}
        </AppText>
      </View>
    </View>
  );
}

export function CommonsBoard({ state, act, over }: BoardProps<CommonsState, number>) {
  const h = state.rounds;
  const last = h[h.length - 1];
  const [take, setTake] = useState(SUSTAINABLE_SHARE);
  const commit = () => {
    haptic.commit();
    act(take);
  };
  return (
    <View style={{ gap: space.lg }}>
      <Lake lake={state.lake} before={last ? last.lakeBefore : null} />
      {last ? (
        <Reveal revealKey={h.length} tone={last.lakeAfter === 0 ? 'bad' : last.lakeAfter >= last.lakeBefore ? 'good' : 'plain'} overline={`Round ${h.length} · the catch`}>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            {last.lakeAfter === 0
              ? `The fleet took ${last.catches.reduce((a, b) => a + b, 0)} — fewer than ${COLLAPSE_BELOW} fish were left. The lake has collapsed.`
              : `The fleet took ${last.catches.reduce((a, b) => a + b, 0)}. The lake went ${last.lakeBefore} → ${last.lakeAfter} after regrowth.`}
          </AppText>
          <Row style={{ flexWrap: 'wrap' }}>
            {last.requests.map((r, i) => (
              <AppText key={i} variant="small" color={i === 0 ? colors.primaryText : colors.textBody}>
                {boatName(i)} {last.catches[i]}
                {last.catches[i] < r ? ` (asked ${r})` : ''}
                {i < 3 ? ' · ' : ''}
              </AppText>
            ))}
          </Row>
        </Reveal>
      ) : null}

      <View style={styles.boats}>
        {state.seats.map((_, i) => (
          <View key={i} style={[styles.boat, i === 1 && { borderColor: 'rgba(249,115,22,0.4)' }]} accessible accessibilityLabel={`${boatName(i)}${i === 1 ? ', the boat you are reading' : ''}: ${state.caught[i]} fish caught${last ? `, asked for ${last.requests[i]} last round` : ''}.`}>
            <Avatar name={boatName(i)} size={28} seat={i} />
            <AppText variant="small" weight="semibold" numberOfLines={1}>
              {boatName(i)}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} tabular>
              {state.caught[i]} caught
            </AppText>
            {last ? (
              <AppText variant="caption" color={i === 1 ? colors.rivalText : colors.textFaint} tabular>
                last {last.requests[i]}
              </AppText>
            ) : null}
          </View>
        ))}
      </View>

      {!over ? (
        <Panel accent="rgba(34,211,238,0.35)">
          <Overline color={colors.accent}>Round {h.length + 1} of {state.total} · your request</Overline>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Stepper value={take} min={0} max={MAX_TAKE} onChange={setTake} label="Fish to request" />
            <Button label={`Fish for ${take}`} icon={Fish} iconPosition="left" onPress={commit} compact />
          </Row>
          <AppText variant="caption" color={colors.textMuted}>
            {SUSTAINABLE_SHARE}–4 each keeps the lake going. If the season ended now, each boat would get {dividend(state.lake)} from the fish left.
          </AppText>
        </Panel>
      ) : (
        <Row style={{ flexWrap: 'wrap' }}>
          <Stat label="Lake left" value={String(state.lake)} color={state.lake ? colors.accent : colors.danger} />
          <Stat label="Dividend each" value={String(state.lake ? dividend(state.lake) : 0)} />
          <Stat label="You caught" value={String(state.caught[0])} color={colors.primaryText} />
        </Row>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lake: { height: 170, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(34,211,238,0.35)', backgroundColor: colors.bgRaised, justifyContent: 'flex-end' },
  water: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(34,211,238,0.22)' },
  half: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, opacity: 0.6 },
  fishRow: { position: 'absolute', left: space.md, right: space.md, bottom: space.md, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  lakeLabel: { position: 'absolute', top: space.md, left: space.md },
  boats: { flexDirection: 'row', gap: space.xs },
  boat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minWidth: 0 },
});
