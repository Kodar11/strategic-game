import { type ReactNode, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { AppText } from '@/src/components/ui/AppText';
import {
  BookOpen,
  Brain,
  Castle,
  ClipboardCheck,
  Compass,
  Dices,
  Drama,
  Droplets,
  Flame,
  Footprints,
  Ghost,
  Hand,
  HandHeart,
  Handshake,
  Landmark,
  Lightbulb,
  ListOrdered,
  type LucideIcon,
  Magnet,
  MessageCircle,
  Puzzle,
  Radio,
  Rocket,
  Route,
  Scale,
  ScanEye,
  Scissors,
  Search,
  Shield,
  ShieldCheck,
  ShieldHalf,
  Shuffle,
  Siren,
  Snail,
  TreePine,
  TrendingUp,
  Turtle,
  Users,
  VenetianMask,
  WandSparkles,
  X,
  Zap,
} from '@/src/components/ui/icons';
import { LIBRARY_ART } from './library/art';
import type { ArenaGameId } from '@/src/arena/core';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';

/** Each arena game's accent, from the existing semantic palette. */
export const ARENA_TINT: Record<ArenaGameId, { fg: string; bg: string; solid: string }> = {
  cooperation: { fg: colors.primaryText, bg: colors.primarySoft, solid: colors.primary },
  'ultimatum-game': { fg: colors.insight, bg: colors.insightSoft, solid: colors.insight },
  auction: { fg: colors.rivalText, bg: colors.rivalSoft, solid: colors.rival },
  market: { fg: colors.accent, bg: colors.accentSoft, solid: colors.accent },
  signal: { fg: colors.success, bg: colors.successSoft, solid: colors.success },
  mole: { fg: colors.rivalText, bg: colors.rivalSoft, solid: colors.rival },
  commons: { fg: colors.accent, bg: colors.accentSoft, solid: colors.accent },
  coalition: { fg: colors.insight, bg: colors.insightSoft, solid: colors.insight },
  inspector: { fg: colors.primaryText, bg: colors.primarySoft, solid: colors.primary },
  travelers: { fg: colors.rivalText, bg: colors.rivalSoft, solid: colors.rival },
  saboteur: { fg: colors.insight, bg: colors.insightSoft, solid: colors.insight },
  bluff: { fg: colors.insight, bg: colors.insightSoft, solid: colors.insight },
  defusal: { fg: colors.success, bg: colors.successSoft, solid: colors.success },
  'power-play': { fg: colors.insight, bg: colors.insightSoft, solid: colors.insight },
  'last-stand': { fg: colors.rivalText, bg: colors.rivalSoft, solid: colors.rival },
  'liars-dice': { fg: colors.accent, bg: colors.accentSoft, solid: colors.accent },
  codebreaker: { fg: colors.primaryText, bg: colors.primarySoft, solid: colors.primary },
  gambit: { fg: colors.success, bg: colors.successSoft, solid: colors.success },
};

/** An icon per opponent id, across every arena game (the Cooperation Game has its own four). */
export const PERSONA_ICON: Record<string, LucideIcon> = {
  investor: TrendingUp,
  banker: Landmark,
  dealmaker: Handshake,
  opportunist: Zap,
  collaborator: Handshake,
  retaliator: Shield,
  chameleon: Shuffle,
  investigator: Search,
  'social-reader': Users,
  deceiver: VenetianMask,
  conservator: TreePine,
  'free-rider': Footprints,
  conditional: Scale,
  maximizer: TrendingUp,
  loyal: Handshake,
  broker: Landmark,
  switcher: Shuffle,
  fair: Scale,
  strict: ShieldCheck,
  calculated: Brain,
  'rule-follower': ClipboardCheck,
  'risk-taker': Dices,
  purist: Brain,
  cooperative: HandHeart,
  undercutter: Scissors,
  adaptive: Compass,
  planner: Route,
  cautious: Turtle,
  observant: ScanEye,
  performer: Drama,
  methodical: ListOrdered,
  bold: Rocket,
  sharer: MessageCircle,
  honest: ShieldCheck,
  bluffer: VenetianMask,
  challenger: Hand,
  manipulator: Magnet,
  responder: Siren,
  guardian: Droplets,
  coordinator: Radio,
  calculator: Brain,
  aggressive: Flame,
  conservative: Snail,
  psychological: Ghost,
  literal: BookOpen,
  associative: Puzzle,
  'risk-aware': ShieldHalf,
  creative: WandSparkles,
  safe: Turtle,
  gambler: Dices,
  positional: Castle,
};

/** A compact emblem per game, built from the brand palette. Decorative: hidden from screen readers. */
export function ArenaArt({ game, size = 64 }: { game: ArenaGameId; size?: number }) {
  const t = ARENA_TINT[game];
  return (
    <View
      style={{ width: size, height: size, borderRadius: radius.lg, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={size * 0.78} height={size * 0.78} viewBox="0 0 48 48">
        {game in LIBRARY_ART ? (
          LIBRARY_ART[game as keyof typeof LIBRARY_ART]
        ) : game === 'cooperation' ? (
          <>
            <Line x1={13} y1={24} x2={35} y2={24} stroke={colors.insight} strokeWidth={3} strokeDasharray="5 3" />
            <Circle cx={12} cy={24} r={8} fill={colors.primary} />
            <Circle cx={36} cy={24} r={8} fill={colors.rival} />
            <Circle cx={12} cy={24} r={3} fill={colors.bg} />
            <Circle cx={36} cy={24} r={3} fill={colors.bg} />
          </>
        ) : game === 'ultimatum-game' ? (
          <>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Circle key={i} cx={8 + (i % 3) * 16} cy={i < 3 ? 16 : 32} r={6} fill={i === 2 || i === 5 ? colors.primary : colors.insight} fillOpacity={i === 2 || i === 5 ? 1 : 0.85} />
            ))}
            <Line x1={32} y1={6} x2={32} y2={42} stroke={colors.text} strokeWidth={2} strokeLinecap="round" />
          </>
        ) : game === 'auction' ? (
          <>
            <Rect x={4} y={14} width={14} height={20} rx={3} fill={colors.surfaceHigh} stroke={colors.textMuted} strokeWidth={1.5} />
            <Rect x={17} y={10} width={14} height={20} rx={3} fill={colors.surfaceHigh} stroke={colors.textMuted} strokeWidth={1.5} />
            <Rect x={30} y={6} width={14} height={20} rx={3} fill={colors.rival} />
            <Path d="M34 14h6M34 18h4" stroke={colors.bg} strokeWidth={2} strokeLinecap="round" />
            <Line x1={4} y1={42} x2={44} y2={42} stroke={colors.rivalText} strokeWidth={2} strokeLinecap="round" />
          </>
        ) : game === 'market' ? (
          <>
            <Rect x={6} y={22} width={9} height={20} rx={2} fill={colors.accent} fillOpacity={0.55} />
            <Rect x={20} y={12} width={9} height={30} rx={2} fill={colors.accent} />
            <Rect x={34} y={28} width={9} height={14} rx={2} fill={colors.rival} fillOpacity={0.8} />
            <Path d="M4 10l12 6 12-8 14 6" stroke={colors.insight} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <Rect x={8} y={8} width={22} height={32} rx={4} fill={colors.surfaceHigh} stroke={colors.success} strokeWidth={2} />
            <Path d="M15 20a4 4 0 1 1 6 3.5c-1.2.7-2 1.4-2 2.5M19 31v.5" stroke={colors.success} strokeWidth={2.4} fill="none" strokeLinecap="round" />
            <Path d="M34 18a8 8 0 0 1 0 12M38 14a14 14 0 0 1 0 20" stroke={colors.insight} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          </>
        )}
      </Svg>
    </View>
  );
}

/** A horizontal bar whose fill animates to `ratio` (0–1). */
export function AnimatedBar({ ratio, color, height = 10, track = colors.surfaceHigh }: { ratio: number; color: string; height?: number; track?: string }) {
  const reduced = useMotionReduced();
  const w = useSharedValue(reduced ? ratio : 0);
  useEffect(() => {
    const r = Math.max(0, Math.min(1, ratio));
    w.set(reduced ? r : withTiming(r, { duration: 380 }));
  }, [ratio, reduced, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', borderRadius: height / 2, backgroundColor: color }, style]} />
    </View>
  );
}

/** "You 14 · Round 3/10 · Rival 9". */
export function ScoreStrip({ you, rival, rivalName, round, total, roundWord = 'Round', unit, target }: { you: number; rival: number; rivalName: string; round: number; total: number; roundWord?: string; unit: string; target?: string }) {
  const shown = Math.min(round, total);
  return (
    <View style={styles.strip} accessible accessibilityLabel={`${roundWord} ${shown} of ${total}. You ${you} ${unit}, ${rivalName} ${rival}.${target ? ` ${target}` : ''}`}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="caption" color={colors.primaryText}>
          You
        </AppText>
        <AppText variant="title" tabular>
          {you}
        </AppText>
      </View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <AppText variant="overline" color={colors.textMuted}>
          {roundWord}
        </AppText>
        <AppText variant="bodyStrong" tabular>
          {shown}/{total}
        </AppText>
        {target ? (
          <AppText variant="caption" color={colors.insight} align="center">
            {target}
          </AppText>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2, alignItems: 'flex-end' }}>
        <AppText variant="caption" color={colors.rivalText} numberOfLines={1}>
          {rivalName}
        </AppText>
        <AppText variant="title" tabular>
          {rival}
        </AppText>
      </View>
    </View>
  );
}

/** A one-time hint for a first-time player. Never blocks the controls. */
export function CoachTip({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const reduced = useMotionReduced();
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(220)} style={styles.coach} accessibilityLiveRegion="polite">
      <Lightbulb size={16} color={colors.insight} strokeWidth={2.2} />
      <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
        {text}
      </AppText>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Hide tip" hitSlop={10}>
        <X size={16} color={colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

/** A panel announcing what just happened. Remounts (and fades in) with `revealKey`. */
export function Reveal({ revealKey, tone = 'plain', overline, children }: { revealKey: string | number; tone?: 'plain' | 'good' | 'bad' | 'insight'; overline?: string; children: ReactNode }) {
  const reduced = useMotionReduced();
  const t = { plain: [colors.surface, colors.border, colors.textMuted], good: [colors.successSoft, 'rgba(74,222,128,0.35)', colors.success], bad: [colors.rivalSoft, 'rgba(249,115,22,0.35)', colors.rivalText], insight: [colors.insightSoft, 'rgba(253,186,116,0.35)', colors.insight] }[tone];
  return (
    <Animated.View key={revealKey} entering={reduced ? undefined : FadeIn.duration(240)} style={[styles.reveal, { backgroundColor: t[0], borderColor: t[1] }]}>
      {overline ? (
        <AppText variant="overline" color={t[2]}>
          {overline}
        </AppText>
      ) : null}
      {children}
    </Animated.View>
  );
}

/** A big decision button with a payoff hint. */
export function ActionTile({ label, hint, icon: Icon, tint, bg, onPress, disabled, selected }: { label: string; hint?: string; icon: LucideIcon; tint: string; bg: string; onPress: () => void; disabled?: boolean; selected?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { borderColor: selected ? tint : colors.border }, (pressed || selected) && { backgroundColor: bg }, disabled && { opacity: 0.45 }]}>
      <View style={[styles.tileIcon, { backgroundColor: bg }]}>
        <Icon size={24} color={tint} strokeWidth={2.1} />
      </View>
      <AppText variant="bodyStrong" align="center">
        {label}
      </AppText>
      {hint ? (
        <AppText variant="caption" color={colors.textMuted} align="center">
          {hint}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm }, style]}>{children}</View>;
}

/** A label/value pair for stat rows. */
export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 70, gap: 2 }}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" color={color} tabular>
        {value}
      </AppText>
    </View>
  );
}

export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);


const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
  coach: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.insightSoft, borderWidth: 1, borderColor: 'rgba(253,186,116,0.3)' },
  reveal: { gap: space.xs, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  tile: { flex: 1, minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: space.xs, padding: space.md, borderRadius: radius.xl, borderWidth: 1.5, backgroundColor: colors.surface },
  tileIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});

/** What every board receives from the play screen. */
export interface BoardProps<S, A> {
  state: S;
  act: (a: A) => void;
  over: boolean;
  rivalName: string;
  /** Display names by seat, when the play screen masks personalities (a mystery match). */
  nameOf?: (seat: number) => string;
}
