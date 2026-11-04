import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Line, Polyline } from 'react-native-svg';

import { CompactReveal, MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Fish } from '@/src/components/ui/icons';
import { CAPACITY, COLLAPSE_BELOW, type CommonsState, type CommonsVariant, MAX_TAKE, SUSTAINABLE_SHARE, boatName, dividend, regrow } from '@/src/arena/commons';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Row, Stat } from '../parts';
import { Avatar, Panel, Stepper } from './kit';

/** The lake: water height is the stock; the dashed line is half capacity, where it regrows fastest. */
function Lake({ lake, before, variant }: { lake: number; before: number | null; variant: CommonsVariant }) {
  const reduced = useMotionReduced();
  const h = useSharedValue(reduced ? lake / CAPACITY : (before ?? lake) / CAPACITY);
  useEffect(() => {
    h.set(reduced ? lake / CAPACITY : withTiming(lake / CAPACITY, { duration: 600 }));
  }, [lake, reduced, h]);
  const water = useAnimatedStyle(() => ({ height: `${Math.max(0, h.get()) * 100}%` }));
  const fish = Math.round(lake / 10);
  return (
    <View style={styles.lake} accessible accessibilityLabel={`The lake holds ${lake} fish of ${CAPACITY}. ${lake === 0 ? 'It has collapsed.' : `It regrows to about ${regrow(variant, lake)} if nobody fishes.`}`}>
      <Animated.View style={[styles.water, water]} />
      <View style={[styles.half, { bottom: '50%' }]} />
      <AppText variant="caption" color={colors.accent} style={{ position: 'absolute', right: 8, bottom: '50%', marginBottom: 1 }}>
        best regrowth
      </AppText>
      <View style={styles.fishRow}>
        {Array.from({ length: fish }, (_, i) => (
          <Fish key={i} size={13} color={colors.text} style={{ opacity: 0.85, transform: [{ scaleX: i % 2 ? -1 : 1 }] }} />
        ))}
      </View>
      <View style={styles.lakeLabel}>
        <AppText variant="heading" tabular>
          {lake}
        </AppText>
        <AppText variant="caption" color={colors.textBody}>
          {lake === 0 ? 'collapsed' : 'fish'}
        </AppText>
      </View>
    </View>
  );
}

/** The lake level at the start of each round and now, against the collapse line. */
function LakeTrend({ s }: { s: CommonsState }) {
  const [w, setW] = useState(0);
  const H = 64;
  const points = [...s.rounds.map((r) => r.lakeBefore), s.lake];
  const x = (i: number) => 4 + ((w - 8) * i) / Math.max(1, s.total);
  const y = (v: number) => 4 + ((H - 8) * (CAPACITY - v)) / CAPACITY;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }} accessible accessibilityLabel={`Lake level by round: ${points.join(', ')}.`}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          <Line x1={0} x2={w} y1={y(COLLAPSE_BELOW)} y2={y(COLLAPSE_BELOW)} stroke={colors.danger} strokeDasharray="4 3" strokeWidth={1} />
          <Line x1={0} x2={w} y1={y(50)} y2={y(50)} stroke={colors.accent} strokeDasharray="4 3" strokeWidth={1} opacity={0.5} />
          <Polyline points={points.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={colors.accent} strokeWidth={2.5} />
        </Svg>
      ) : null}
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
  const fleet = last ? last.catches.reduce((a, b) => a + b, 0) : 0;
  return (
    <View style={{ gap: space.sm }}>
      <Lake lake={state.lake} before={last ? last.lakeBefore : null} variant={state.setup.variant} />
      {last ? (
        <CompactReveal revealKey={h.length} tone={last.lakeAfter === 0 ? 'bad' : last.lakeAfter >= last.lakeBefore ? 'good' : 'plain'} summary={last.lakeAfter === 0 ? `The fleet took ${fleet}: fewer than ${COLLAPSE_BELOW} fish were left. The lake has collapsed.` : `The fleet took ${fleet}. Lake ${last.lakeBefore} → ${last.lakeAfter} after regrowth.`}>
          <Row style={{ flexWrap: 'wrap' }}>
            {last.requests.map((r, i) => (
              <AppText key={i} variant="caption" color={i === 0 ? colors.primaryText : colors.textBody}>
                {boatName(i)} {last.catches[i]}
                {last.catches[i] < r ? ` (asked ${r})` : ''}
                {i < 3 ? ' · ' : ''}
              </AppText>
            ))}
          </Row>
        </CompactReveal>
      ) : null}

      <View style={styles.boats}>
        {state.seats.map((_, i) => (
          <View key={i} style={[styles.boat, i === 1 && { borderColor: 'rgba(249,115,22,0.4)' }]} accessible accessibilityLabel={`${boatName(i)}${i === 1 ? ', the boat you are reading' : ''}: ${state.caught[i]} fish caught${last ? `, asked for ${last.requests[i]} last round` : ''}.`}>
            <Avatar name={boatName(i)} size={20} seat={i} />
            <AppText variant="caption" color={colors.textBody} tabular numberOfLines={1}>
              {state.caught[i]}
              {last ? <AppText variant="caption" color={i === 1 ? colors.rivalText : colors.textFaint}>{` · ${last.requests[i]}`}</AppText> : null}
            </AppText>
          </View>
        ))}
      </View>

      {!over ? (
        <Panel accent="rgba(34,211,238,0.35)" style={{ padding: space.md, gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stepper value={take} min={0} max={MAX_TAKE} onChange={setTake} label="Fish to request" />
            <Button label={`Fish for ${take}`} icon={Fish} iconPosition="left" onPress={commit} compact />
          </Row>
          <AppText variant="caption" color={colors.textMuted}>
            {SUSTAINABLE_SHARE}–4 each keeps the lake going. Ending now would pay each boat {dividend(state.lake)} from the fish left.
          </AppText>
        </Panel>
      ) : (
        <Row style={{ flexWrap: 'wrap' }}>
          <Stat label="Lake left" value={String(state.lake)} color={state.lake ? colors.accent : colors.danger} />
          <Stat label="Dividend each" value={String(state.lake ? dividend(state.lake) : 0)} />
          <Stat label="You caught" value={String(state.caught[0])} color={colors.primaryText} />
        </Row>
      )}

      {h.length ? (
        <MatchLog title="Lake and requests by round" summary="Caught · last request shown on each boat above">
          <LakeTrend s={state} />
          <View style={{ flexDirection: 'row' }}>
            <AppText variant="caption" color={colors.textMuted} style={{ width: 50 }}>
              Round
            </AppText>
            {state.seats.map((_, i) => (
              <AppText key={i} variant="caption" color={i === 0 ? colors.primaryText : colors.textMuted} align="center" style={{ flex: 1 }} numberOfLines={1}>
                {boatName(i)}
              </AppText>
            ))}
            <AppText variant="caption" color={colors.accent} align="right" style={{ width: 44 }}>
              Lake
            </AppText>
          </View>
          {h.map((r, n) => (
            <View key={n} style={{ flexDirection: 'row' }} accessible accessibilityLabel={`Round ${n + 1}: requests ${r.requests.map((x, i) => `${boatName(i)} ${x}`).join(', ')}. Lake ${r.lakeAfter}.`}>
              <AppText variant="small" color={colors.textMuted} tabular style={{ width: 50 }}>
                {n + 1}
              </AppText>
              {r.requests.map((x, i) => (
                <AppText key={i} variant="small" tabular align="center" color={x >= 7 ? colors.rivalText : colors.textBody} style={{ flex: 1 }}>
                  {x}
                </AppText>
              ))}
              <AppText variant="small" tabular align="right" color={colors.accent} style={{ width: 44 }}>
                {r.lakeAfter}
              </AppText>
            </View>
          ))}
        </MatchLog>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lake: { height: 104, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(34,211,238,0.35)', backgroundColor: colors.bgRaised, justifyContent: 'flex-end' },
  water: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(34,211,238,0.22)' },
  half: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, opacity: 0.6 },
  fishRow: { position: 'absolute', left: space.md, right: space.md, bottom: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  lakeLabel: { position: 'absolute', top: 4, left: space.md, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  boats: { flexDirection: 'row', gap: space.xs },
  boat: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minWidth: 0 },
});
