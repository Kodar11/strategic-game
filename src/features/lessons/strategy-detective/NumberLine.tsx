import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import type { Pick } from '@/src/game/two-thirds-game';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';

const DOT = 12;

/** Every pick on a 0–100 line, plus the target. Overlapping picks stack upward. */
export function NumberLine({ picks, target, average }: { picks: Pick[]; target: number; average?: number }) {
  const [width, setWidth] = useState(0);
  const reduced = useMotionReduced();
  const x = (v: number) => (v / 100) * Math.max(0, width - DOT);

  // Stack picks that would overlap (within one dot width).
  const sorted = [...picks].sort((a, b) => a.guess - b.guess);
  const placed: { pick: Pick; level: number }[] = [];
  for (const p of sorted) {
    let level = 0;
    while (placed.some((q) => q.level === level && Math.abs(x(q.pick.guess) - x(p.guess)) < DOT)) level++;
    placed.push({ pick: p, level });
  }
  const maxLevel = Math.max(0, ...placed.map((p) => p.level));
  const height = 34 + (maxLevel + 1) * (DOT + 2);

  return (
    <View
      accessible
      accessibilityLabel={`Number line. Target ${target.toFixed(1)}${average !== undefined ? `, average ${average.toFixed(1)}` : ''}. ${picks.length} picks.`}>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={[styles.axis, { top: height - 20 }]} />
        {width > 0 ? (
          <>
            <View style={[styles.target, { left: x(target) + DOT / 2 - 1, height: height - 12 }]} />
            {average !== undefined ? <View style={[styles.avg, { left: x(average) + DOT / 2 - 1, height: height - 16 }]} /> : null}
            {placed.map(({ pick, level }, i) => (
              <Animated.View
                key={pick.id}
                entering={reduced ? undefined : ZoomIn.delay(i * 30)}
                style={[
                  styles.dot,
                  {
                    left: x(pick.guess),
                    top: height - 20 - DOT / 2 - level * (DOT + 2) - (pick.type === 'you' ? 2 : 0),
                    backgroundColor: pick.type === 'you' ? colors.primary : pick.isWinner ? colors.insight : colors.slateDot,
                  },
                  pick.type === 'you' && styles.you,
                ]}
              />
            ))}
          </>
        ) : null}
      </View>
      <View style={styles.labels}>
        {[0, 50, 100].map((n) => (
          <AppText key={n} variant="caption" color={colors.textFaint} tabular>
            {n}
          </AppText>
        ))}
      </View>
      <View style={styles.legend}>
        <Legend color={colors.primary} label="You" />
        <Legend color={colors.insight} label="Closest" />
        <Legend color={colors.slateDot} label="Others" />
        <Legend color={colors.insight} label="Target" line />
      </View>
    </View>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={line ? { width: 2, height: 12, backgroundColor: color } : { width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { position: 'absolute', left: DOT / 2, right: DOT / 2, height: 2, backgroundColor: colors.surfaceHigh, borderRadius: 1 },
  target: { position: 'absolute', top: 0, width: 2, backgroundColor: colors.insight, borderRadius: 1 },
  avg: { position: 'absolute', top: 4, width: 2, backgroundColor: colors.textFaint, opacity: 0.6 },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2 },
  you: { width: DOT + 4, height: DOT + 4, borderRadius: (DOT + 4) / 2, marginLeft: -2, borderWidth: 2, borderColor: '#fff' },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.sm, borderRadius: radius.sm },
});
