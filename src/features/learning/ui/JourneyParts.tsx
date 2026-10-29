import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ArrowRight, Award, ChevronDown, ChevronRight, CircleCheck, CircleDashed, CircleX, Compass, Gamepad2, type LucideIcon, Minus, Sprout, TrendingUp } from '@/src/components/ui/icons';
import type { AreaCard, ConfidenceBand, Growth, LearningProgress, Recommendation, SeriesPoint } from '@/src/features/learning/journey';
import type { AttemptResult } from '@/src/features/learning/summary';
import { openLesson } from '@/src/features/learning/ui/ProfileParts';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';

/**
 * Building blocks for the profile overview and the detailed report. Every number and sentence comes from
 * journey.ts; these components only lay it out. Anything that looks tappable is tappable, and nothing else is.
 */

export function openRecommendation(rec: Recommendation) {
  if (rec.kind === 'game' && rec.game) router.push({ pathname: '/games/[gameId]', params: { gameId: rec.game } });
  else if (rec.kind === 'challenges' && rec.lesson) router.push({ pathname: '/challenges/[lessonId]', params: { lessonId: rec.lesson } });
  else if (rec.lesson) openLesson(rec.lesson);
}

/** Words carry the result; the icon only repeats it. */
export const RESULT: Record<AttemptResult, { label: string; icon: LucideIcon; color: string }> = {
  matched: { label: 'Matched the model', icon: CircleCheck, color: colors.success },
  partly: { label: 'Partly matched', icon: Minus, color: colors.accent },
  reasonable: { label: 'A reasonable answer', icon: Minus, color: colors.textBody },
  different: { label: 'Different from the model', icon: CircleX, color: colors.textMuted },
  'not-compared': { label: 'Not compared — depended on the unknowable', icon: CircleDashed, color: colors.textMuted },
};

export const openArea = (skill: string) => router.push({ pathname: '/report/[skill]', params: { skill } });

/** A thin progress track. Animates its fill once, unless motion is reduced. Decorative: the caller gives the text. */
export function ProgressBar({ value, color = colors.primary, height = 6, style }: { value: number; color?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useMotionReduced();
  const v = Math.max(0, Math.min(1, value));
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: withTiming(v, { duration: reduced ? 0 : 520 }) }] }));
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={[styles.fill, { backgroundColor: color, borderRadius: height / 2 }, fill]} />
    </View>
  );
}

/** A card that opens something: the whole surface is the touch target, with a chevron as the affordance. */
export function TapCard({ onPress, label, hint, children, style }: { onPress: () => void; label: string; hint?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.tapCard, pressed && styles.pressed, style]}>
      <View style={{ flex: 1, gap: space.sm }}>{children}</View>
      <ChevronRight size={18} color={colors.textMuted} style={{ alignSelf: 'center' }} />
    </Pressable>
  );
}

/** Overview, first card: where the learner is, as one number, one bar and one sentence. Opens the detailed report. */
export function LearningProgressCard({ progress, onPress }: { progress: LearningProgress; onPress: () => void }) {
  const { completed, total, stage, sentence, milestone, fraction } = progress;
  return (
    <TapCard onPress={onPress} label={`${stage}. ${completed} of ${total} lessons completed. ${sentence}${milestone ? ` ${milestone}.` : ''}`} hint="Opens your learning activity">
      <AppText variant="overline" color={colors.primaryText}>
        {stage}
      </AppText>
      <View style={styles.progressHead}>
        <AppText variant="title" tabular>
          {completed}
          <AppText variant="heading" color={colors.textMuted} tabular>
            {` / ${total}`}
          </AppText>
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          lessons
        </AppText>
      </View>
      <ProgressBar value={fraction} />
      <AppText variant="small" color={colors.textBody}>
        {sentence}
      </AppText>
      {milestone ? (
        <View style={styles.inline}>
          <Award size={14} color={colors.insight} />
          <AppText variant="caption" color={colors.insight}>
            {milestone}
          </AppText>
        </View>
      ) : null}
    </TapCard>
  );
}

const GROWTH_ICON: Record<Growth['kind'], { icon: LucideIcon; color: string }> = {
  improving: { icon: TrendingUp, color: colors.success },
  encouraging: { icon: Sprout, color: colors.success },
  exploring: { icon: Compass, color: colors.primaryText },
  started: { icon: Sprout, color: colors.textMuted },
};

/** Overview, second card: one observation with its evidence. Opens the area it is about. */
export function GrowthCard({ growth, onPress }: { growth: Growth; onPress: () => void }) {
  const { icon: Icon, color } = GROWTH_ICON[growth.kind];
  return (
    <TapCard onPress={onPress} label={`${growth.title}. ${growth.meaning} ${growth.caption}`} hint="Opens this area in detail">
      <View style={styles.inline}>
        <Icon size={16} color={color} strokeWidth={2.2} />
        <AppText variant="overline" color={colors.textMuted}>
          {growth.early ? 'Early observation' : 'What we’re noticing'}
        </AppText>
      </View>
      <AppText variant="bodyStrong" color={colors.text}>
        {growth.title}
      </AppText>
      <AppText variant="small" color={colors.textBody}>
        {growth.meaning}
      </AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {growth.caption}
      </AppText>
    </TapCard>
  );
}

/** The single recommendation: the most prominent action on the overview. `children` holds the optional goal control. */
export function RecommendationCard({ rec, kicker = 'Recommended next', children }: { rec: Recommendation; kicker?: string; children?: ReactNode }) {
  return (
    <View style={styles.next}>
      <View style={styles.inline}>
        {rec.kind === 'game' ? <Gamepad2 size={16} color={colors.primaryText} strokeWidth={2.2} /> : <Compass size={16} color={colors.primaryText} strokeWidth={2.2} />}
        <AppText variant="overline" color={colors.primaryText}>
          {kicker}
        </AppText>
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="heading">{rec.title}</AppText>
        {rec.meta ? (
          <AppText variant="caption" color={colors.textMuted} tabular>
            {rec.meta}
          </AppText>
        ) : null}
      </View>
      <AppText variant="small" color={colors.textBody}>
        {rec.body}
      </AppText>
      <Button label={rec.cta} icon={ArrowRight} onPress={() => openRecommendation(rec)} />
      {children}
    </View>
  );
}

/** One area: name, lesson progress, one line about answers, and a thin lesson-progress bar. Opens the area. */
export function AreaRow({ area, last }: { area: AreaCard; last?: boolean }) {
  const lessons = `${area.lessons.done} of ${area.lessons.total} lessons`;
  return (
    <Pressable
      onPress={() => openArea(area.id)}
      accessibilityRole="button"
      accessibilityLabel={`${area.label}. ${area.summary}${area.qualifier ? `, ${area.qualifier.toLowerCase()}` : ''}. ${lessons} completed.`}
      accessibilityHint="Opens this area in detail"
      style={({ pressed }) => [styles.area, !last && styles.divider, pressed && styles.pressed]}>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.areaHead}>
          <AppText variant="small" weight="semibold" color={colors.text} style={{ flex: 1 }}>
            {area.label}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} tabular>
            {lessons}
          </AppText>
        </View>
        <ProgressBar value={area.lessons.total ? area.lessons.done / area.lessons.total : 0} height={4} color={colors.primary} />
        <AppText variant="caption" color={area.level === 'none' ? colors.textMuted : colors.textBody} tabular>
          {area.summary}
          {area.qualifier ? <AppText variant="caption" color={colors.textMuted}>{` · ${area.qualifier}`}</AppText> : null}
        </AppText>
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export function AreaList({ areas }: { areas: AreaCard[] }) {
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      {areas.map((a, i) => (
        <AreaRow key={a.id} area={a} last={i === areas.length - 1} />
      ))}
    </Card>
  );
}

/** A quiet full-width row that opens a deeper screen. */
export function LinkRow({ title, subtitle, icon: Icon, onPress }: { title: string; subtitle?: string; icon?: LucideIcon; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      {Icon ? <Icon size={18} color={colors.primaryText} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="small" weight="semibold" color={colors.text}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.textMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/** An expandable block: a one-line summary that opens to more detail. */
export function Disclosure({ title, summary, children, initiallyOpen = false }: { title: string; summary?: string; children: ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.disclosure}>
      <Pressable
        onPress={() => {
          haptic.select();
          setOpen((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={summary ? `${title}. ${summary}` : title}
        style={({ pressed }) => [styles.disclosureHead, pressed && { opacity: 0.7 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="small" weight="semibold" color={colors.text}>
            {title}
          </AppText>
          {summary ? (
            <AppText variant="caption" color={colors.textMuted} tabular>
              {summary}
            </AppText>
          ) : null}
        </View>
        <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open ? <View style={{ gap: space.sm, paddingBottom: space.sm }}>{children}</View> : null}
    </View>
  );
}

/** Matched / partly / other as one stacked bar, with a legend that carries the numbers. */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return null;
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.split} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {parts.filter((p) => p.value > 0).map((p) => <View key={p.label} style={{ flex: p.value, backgroundColor: p.color }} />)}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.label} style={styles.inline}>
            <View style={[styles.swatch, { backgroundColor: p.color }]} />
            <AppText variant="caption" color={colors.textBody} tabular>
              {p.label} {p.value}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Confidence bands: each band's match rate as a bar, with its count. Bands with too few answers say so. */
export function ConfidenceBands({ bands }: { bands: ConfidenceBand[] }) {
  return (
    <View style={{ gap: space.md }}>
      {bands.map((b) => (
        <View key={b.id} style={{ gap: 4 }} accessible accessibilityLabel={b.ready ? `${b.label}: ${b.matched} of ${b.count} matched the model.` : `${b.label}: ${b.count === 0 ? 'no answers' : `${b.count} answers, too few to compare`}.`}>
          <View style={styles.areaHead}>
            <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
              {b.label}
            </AppText>
            <AppText variant="small" color={b.ready ? colors.text : colors.textMuted} tabular>
              {b.ready ? `${b.matched} of ${b.count}` : b.count === 0 ? '—' : `${b.count}, too few`}
            </AppText>
          </View>
          <ProgressBar value={b.ready ? b.matched / b.count : 0} color={b.id === 'high' ? colors.primary : b.id === 'middle' ? colors.accent : colors.textMuted} />
        </View>
      ))}
    </View>
  );
}

const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Match rate per block of first attempts, as points joined by straight lines (no smoothing), on a fixed 0–100% scale
 * so a small change never looks dramatic. The text equivalent lists every point with its count.
 */
export function SeriesChart({ points }: { points: SeriesPoint[] }) {
  const [width, setWidth] = useState(0);
  const height = 132;
  const pad = { top: 10, bottom: 10, left: 12, right: 44 };
  const LABEL = 56;
  const x = (i: number) => pad.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * (width - pad.left - pad.right));
  const y = (r: number) => pad.top + (1 - r) * (height - pad.top - pad.bottom);
  const rates = points.map((p) => p.matched / p.judged);
  const description = points.map((p, i) => `${shortDate(p.from)} to ${shortDate(p.to)}: ${p.matched} of ${p.judged} matched${i === points.length - 1 ? '' : ';'}`).join(' ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Chart of first attempts matching the model over time. ${description}`} style={{ gap: space.xs }}>
      <View style={styles.chartFrame} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {[0, 0.5, 1].map((g) => (
              <Line key={g} x1={pad.left} x2={width - pad.right} y1={y(g)} y2={y(g)} stroke={colors.border} strokeWidth={1} strokeDasharray={g === 0.5 ? '3 4' : undefined} />
            ))}
            <Polyline points={rates.map((r, i) => `${x(i)},${y(r)}`).join(' ')} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinejoin="round" />
            {rates.map((r, i) => (
              <Circle key={i} cx={x(i)} cy={y(r)} r={i === rates.length - 1 ? 5 : 4} fill={i === rates.length - 1 ? colors.primaryText : colors.surface} stroke={colors.primaryText} strokeWidth={2} />
            ))}
          </Svg>
        ) : (
          <View style={{ height }} />
        )}
        <View style={styles.chartAxis} pointerEvents="none">
          <AppText variant="caption" color={colors.textFaint}>
            100%
          </AppText>
          <AppText variant="caption" color={colors.textFaint}>
            50%
          </AppText>
          <AppText variant="caption" color={colors.textFaint}>
            0%
          </AppText>
        </View>
      </View>
      <View style={styles.chartLabels} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {width > 0 && points.map((p, i) => (
          <View key={i} style={[styles.chartLabel, { width: LABEL, left: Math.max(0, Math.min(width - LABEL, x(i) - LABEL / 2)) }]}>
            <AppText variant="caption" color={colors.textBody} tabular>
              {p.matched}/{p.judged}
            </AppText>
            <AppText variant="caption" color={colors.textFaint} numberOfLines={1}>
              {shortDate(p.to)}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { width: '100%', backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  fill: { height: '100%', width: '100%', transformOrigin: 'left' },
  tapCard: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pressed: { backgroundColor: colors.surfaceHigh },
  progressHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  next: { gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(37, 99, 235, 0.45)', backgroundColor: colors.primarySoft },
  area: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.md, paddingHorizontal: space.lg },
  areaHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: radius.lg, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: colors.border },
  disclosure: { borderTopWidth: 1, borderTopColor: colors.border },
  disclosureHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingVertical: space.sm },
  split: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  chartFrame: { position: 'relative' },
  chartAxis: { position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'space-between', paddingVertical: 2 },
  chartLabels: { height: 34 },
  chartLabel: { position: 'absolute', top: 0, alignItems: 'center' },
});
