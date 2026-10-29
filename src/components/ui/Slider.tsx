import { Minus, Plus } from '@/src/components/ui/icons';
import { useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { clamp } from '@/src/game/rng';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { AppText, keepTogether } from './AppText';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  label: string;
  formatValue?: (value: number) => string;
  tone?: 'blue' | 'orange' | 'cyan';
  /** Optional marker drawn on the track, e.g. a threshold. */
  marker?: { value: number; label: string };
  showValue?: boolean;
  /** Keep the label for screen readers but don't print it, when the same question is already shown above the slider. */
  hideLabel?: boolean;
}

const THUMB = 28;

function snap(raw: number, min: number, max: number, step: number) {
  const snapped = Math.round((raw - min) / step) * step + min;
  // Avoid floating-point drift such as 1.5000000002.
  return clamp(Number(snapped.toFixed(4)), min, max);
}

/** Draggable slider with +/− buttons and screen-reader increment/decrement support. */
export function Slider({ value, min, max, step, onChange, label, formatValue, tone = 'blue', marker, showValue = true, hideLabel = false }: SliderProps) {
  const [width, setWidth] = useState(0);
  const latest = useRef({ value, min, max, step, onChange, width });
  useLayoutEffect(() => {
    latest.current = { value, min, max, step, onChange, width };
  });
  const startX = useRef(0);

  const accent = tone === 'orange' ? colors.rival : tone === 'cyan' ? colors.accent : colors.primary;
  const fmt = formatValue ?? ((v: number) => String(v));

  const setFromX = (x: number) => {
    const { min: lo, max: hi, step: st, width: w, value: current, onChange: cb } = latest.current;
    if (w <= 0) return;
    const ratio = clamp((x - THUMB / 2) / (w - THUMB), 0, 1);
    const next = snap(lo + ratio * (hi - lo), lo, hi, st);
    if (next !== current) {
      latest.current.value = next;
      haptic.select();
      cb(next);
    }
  };

  // Handlers only read refs inside gesture events, never during render.
  /* eslint-disable react-hooks/refs */
  const [responder] = useState(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          startX.current = e.nativeEvent.locationX;
          setFromX(startX.current);
        },
        onPanResponderMove: (_, g) => setFromX(startX.current + g.dx),
      }),
  );
  /* eslint-enable react-hooks/refs */

  const nudge = (dir: 1 | -1) => {
    const next = snap(value + dir * step, min, max, step);
    if (next !== value) {
      haptic.select();
      onChange(next);
    }
  };

  const ratio = max === min ? 0 : (value - min) / (max - min);
  const usable = Math.max(0, width - THUMB);
  const markerRatio = marker ? clamp((marker.value - min) / (max - min), 0, 1) : 0;

  return (
    <View>
      {!hideLabel || showValue ? (
        <View style={styles.labelRow}>
          {!hideLabel ? (
            <AppText variant="small" color={colors.textMuted} style={styles.label}>
              {label}
            </AppText>
          ) : null}
          {showValue ? (
            <AppText variant="bodyStrong" color={colors.text} tabular style={styles.value}>
              {keepTogether(fmt(value))}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <View style={styles.row}>
        <StepButton icon="minus" label={`Decrease ${label}`} onPress={() => nudge(-1)} disabled={value <= min} />
        <View
          style={styles.trackArea}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: value, text: fmt(value) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          {...responder.panHandlers}>
          <View pointerEvents="none" style={[styles.track, { left: THUMB / 2, right: THUMB / 2 }]}>
            <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: accent }]} />
          </View>
          {marker ? (
            <View pointerEvents="none" style={[styles.marker, { left: THUMB / 2 + markerRatio * usable - 1 }]} />
          ) : null}
          <View
            pointerEvents="none"
            style={[styles.thumb, { left: ratio * usable, borderColor: accent }]}
          />
        </View>
        <StepButton icon="plus" label={`Increase ${label}`} onPress={() => nudge(1)} disabled={value >= max} />
      </View>
      {marker ? (
        <View style={{ marginLeft: 44 + space.sm, marginRight: 44 + space.sm, height: 16 }}>
          <AppText
            variant="caption"
            color={colors.insight}
            numberOfLines={1}
            // Centred under the marker, but never pushed past either end of the track.
            style={{ position: 'absolute', left: clamp(THUMB / 2 + markerRatio * usable - 40, 0, Math.max(0, width - 80)), width: 80, textAlign: 'center' }}>
            {marker.label}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function StepButton({ icon, label, onPress, disabled }: { icon: 'plus' | 'minus'; label: string; onPress: () => void; disabled: boolean }) {
  const Icon = icon === 'plus' ? Plus : Minus;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && { backgroundColor: colors.surfaceHigh }, disabled && { opacity: 0.4 }]}>
      <Icon size={18} color={colors.text} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Label and value share a line while both fit; on narrow screens or with large text the value drops below.
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.md, rowGap: space.xxs, marginBottom: space.sm },
  label: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  value: { flexShrink: 0, marginLeft: 'auto', maxWidth: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  trackArea: { flex: 1, height: 44, justifyContent: 'center' },
  track: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.text,
    borderWidth: 4,
  },
  marker: { position: 'absolute', width: 2, height: 18, backgroundColor: colors.insight, borderRadius: 1 },
  step: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
