import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AppText } from '@/src/components/ui/AppText';
import { type MatchResult, type Move, STRATEGIES, type StrategyId, type Tournament } from '@/src/stories/meridian/engine';
import { radius, space } from '@/src/theme/tokens';
import { useMotionReduced } from '@/src/utils/feedback';

/**
 * The visual language of the Meridian Trials: every strategy has a sigil and a colour, every move is a token (a
 * round light for sharing, a sharp shard for taking), and results are drawn as bars and strips rather than tables.
 */

export const MERIDIAN = {
  bg: '#070818',
  panel: '#111330',
  border: 'rgba(129, 140, 248, 0.24)',
  text: '#EEF0FF',
  muted: '#A3A8C9',
  accent: '#7DD3FC',
  accentText: '#A5E4FF',
  share: '#5EEAD4',
  take: '#FB7185',
  gold: '#FDE68A',
} as const;

export const STRATEGY_COLOR: Record<StrategyId, string> = {
  'open-hand': '#5EEAD4',
  mirror: '#818CF8',
  'gentle-mirror': '#C7D2FE',
  'iron-wall': '#FB7185',
  'long-memory': '#FBBF24',
  weathervane: '#C084FC',
  prober: '#FB923C',
  pendulum: '#F472B6',
  'wary-mirror': '#60A5FA',
  settler: '#34D399',
  calculator: '#94A3B8',
  yours: MERIDIAN.gold,
};

export const moveWord = (m: Move) => (m === 'C' ? 'Share' : 'Take');

/** A strategy's sigil, drawn on a 24-unit grid. */
export const Glyph = memo(function Glyph({ id, size = 24, color }: { id: StrategyId; size?: number; color?: string }) {
  const c = color ?? STRATEGY_COLOR[id];
  const sw = 2;
  let body;
  switch (id) {
    case 'open-hand':
      body = <Circle cx={12} cy={12} r={8} stroke={c} strokeWidth={sw} fill="none" />;
      break;
    case 'mirror':
      body = (
        <G>
          <Path d="M10 4 A 8 8 0 0 0 10 20" stroke={c} strokeWidth={sw} fill="none" />
          <Path d="M14 4 A 8 8 0 0 1 14 20" stroke={c} strokeWidth={sw} fill="none" />
        </G>
      );
      break;
    case 'gentle-mirror':
      body = (
        <G>
          <Path d="M10 4 A 8 8 0 0 0 10 20" stroke={c} strokeWidth={sw} fill="none" />
          <Path d="M14 4 A 8 8 0 0 1 14 20" stroke={c} strokeWidth={sw} fill="none" />
          <Circle cx={12} cy={12} r={1.8} fill={c} />
        </G>
      );
      break;
    case 'wary-mirror':
      body = (
        <G>
          <Path d="M10 4 A 8 8 0 0 0 10 20" stroke={c} strokeWidth={sw} fill="none" />
          <Path d="M14 4 A 8 8 0 0 1 14 20" stroke={c} strokeWidth={sw} fill="none" />
          <Line x1={7} y1={18} x2={17} y2={6} stroke={c} strokeWidth={sw} />
        </G>
      );
      break;
    case 'iron-wall':
      body = <Rect x={5} y={5} width={14} height={14} rx={1.5} fill={c} />;
      break;
    case 'long-memory':
      body = <Path d="M12 4 L20 19 L4 19 Z M12 11 L12 15" stroke={c} strokeWidth={sw} fill="none" strokeLinejoin="round" />;
      break;
    case 'weathervane':
      body = <Path d="M12 3 L20 12 L12 21 L4 12 Z M12 3 L12 21" stroke={c} strokeWidth={sw} fill="none" strokeLinejoin="round" />;
      break;
    case 'prober':
      body = <Path d="M5 6 L15 12 L5 18 M11 6 L21 12 L11 18" stroke={c} strokeWidth={sw} fill="none" strokeLinejoin="round" strokeLinecap="round" />;
      break;
    case 'pendulum':
      body = <Path d="M6 4 L18 4 L6 20 L18 20 Z" stroke={c} strokeWidth={sw} fill="none" strokeLinejoin="round" />;
      break;
    case 'settler':
      body = <Path d="M3 14 Q 7.5 6 12 14 T 21 14" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" />;
      break;
    case 'calculator':
      body = (
        <G>
          <Path d="M12 3 L19.8 7.5 L19.8 16.5 L12 21 L4.2 16.5 L4.2 7.5 Z" stroke={c} strokeWidth={sw} fill="none" strokeLinejoin="round" />
          <Circle cx={12} cy={12} r={2.4} stroke={c} strokeWidth={1.4} fill="none" />
        </G>
      );
      break;
    case 'yours':
      body = <Path d="M12 3 L14.4 9.3 L21 9.5 L15.8 13.6 L17.6 20 L12 16.3 L6.4 20 L8.2 13.6 L3 9.5 L9.6 9.3 Z" fill={c} />;
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
});

export function nameOf(id: StrategyId, yoursName = 'Your entrant'): string {
  return id === 'yours' ? yoursName : STRATEGIES[id].name;
}

/** One move: a round light for Share, a shard for Take. A ring marks a slip (the move came out as its opposite). */
export function MoveToken({ move, size = 16, slipped, dim }: { move: Move; size?: number; slipped?: boolean; dim?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" opacity={dim ? 0.35 : 1}>
      {move === 'C' ? <Circle cx={8} cy={8} r={5.5} fill={MERIDIAN.share} /> : <Path d="M8 1.5 L14 8 L8 14.5 L2 8 Z" fill={MERIDIAN.take} />}
      {slipped ? <Circle cx={8} cy={8} r={7.3} stroke={MERIDIAN.gold} strokeWidth={1.2} fill="none" /> : null}
    </Svg>
  );
}

/** Two rows of moves, one per side, round by round. Tokens shrink to fit long matches. */
export function MatchStrip({ match, a, b, width }: { match: MatchResult; a: { id: StrategyId; name: string }; b: { id: StrategyId; name: string }; width?: number }) {
  const { width: screenW } = useWindowDimensions();
  const avail = Math.min(width ?? screenW - space.xl * 2 - 2 * space.md, 520) - 30;
  const n = match.rounds.length;
  const size = Math.max(4, Math.min(18, Math.floor(avail / n) - 2));
  const wrap = size * n + 2 * n > avail;
  const label = `${a.name} scored ${match.a}, ${b.name} scored ${match.b} over ${n} rounds. ${a.name}: ${match.rounds.map((r) => moveWord(r.a)).join(', ')}. ${b.name}: ${match.rounds.map((r) => moveWord(r.b)).join(', ')}.`;
  const row = (side: 'a' | 'b') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Glyph id={side === 'a' ? a.id : b.id} size={20} />
      <View style={{ flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', gap: 2, flex: 1 }}>
        {match.rounds.map((r, i) => (
          <MoveToken key={i} move={r[side]} size={size} slipped={side === 'a' ? r.a !== r.ia : r.b !== r.ib} />
        ))}
      </View>
    </View>
  );
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={label}>
      {row('a')}
      {row('b')}
    </View>
  );
}

/** Points scored by each side in a match, as a pair of numbers under a strip. */
export function MatchTotals({ match, a, b }: { match: MatchResult; a: string; b: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText variant="caption" color={MERIDIAN.muted} tabular>
        {a}: {match.a} pts
      </AppText>
      <AppText variant="caption" color={MERIDIAN.muted} tabular>
        {b}: {match.b} pts
      </AppText>
    </View>
  );
}

/**
 * The standings as bars: average points per round against the whole room (0–5). Rows appear one by one from the
 * bottom of the table to the top, so the winner is revealed last; reduced motion shows them all at once.
 */
export function Leaderboard({ t, yoursName, highlight = 'yours', onSelect, selected, reveal = true }: { t: Tournament; yoursName: string; highlight?: StrategyId; onSelect?: (id: StrategyId) => void; selected?: StrategyId | null; reveal?: boolean }) {
  const reduced = useMotionReduced();
  const n = t.standings.length;
  const shown = useCountUp(n, 140, reveal && !reduced);
  const max = Math.max(...t.standings.map((s) => s.score));
  const min = Math.min(...t.standings.map((s) => s.score));
  const lo = Math.max(0, min - (max - min) * 0.6 - 0.1);
  return (
    <View style={{ gap: 4 }}>
      {t.standings.map((s, i) => {
        const visible = i >= n - shown;
        const mine = s.id === highlight;
        const frac = (s.score - lo) / (max - lo || 1);
        const count = t.counts[t.ids.indexOf(s.id)];
        const name = nameOf(s.id, yoursName) + (count > 1 ? ` ×${count}` : '');
        return (
          <Pressable
            key={s.id}
            disabled={!onSelect}
            onPress={() => onSelect?.(s.id)}
            accessibilityRole={onSelect ? 'button' : undefined}
            accessibilityState={onSelect ? { selected: selected === s.id } : undefined}
            accessibilityLabel={`${ordinal(s.rank)}: ${name}, ${s.score.toFixed(2)} points per round, out-scored ${s.won} of ${n} opponents head to head${onSelect ? '. Show your match against it' : ''}`}
            style={[styles.row, { opacity: visible ? 1 : 0, backgroundColor: selected === s.id ? 'rgba(125,211,252,0.12)' : mine ? 'rgba(253,230,138,0.08)' : 'transparent', borderColor: mine ? 'rgba(253,230,138,0.4)' : 'transparent' }]}>
            <AppText variant="caption" color={MERIDIAN.muted} tabular style={{ width: 22 }}>
              {s.rank}
            </AppText>
            <Glyph id={s.id} size={18} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
                <AppText variant="small" weight={mine ? 'semibold' : 'regular'} color={mine ? MERIDIAN.gold : MERIDIAN.text} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {name}
                </AppText>
                <AppText variant="small" color={MERIDIAN.text} tabular>
                  {s.score.toFixed(2)}
                </AppText>
              </View>
              <View style={styles.track}>
                <View style={{ width: `${Math.max(2, frac * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: STRATEGY_COLOR[s.id], opacity: mine ? 1 : 0.75 }} />
              </View>
            </View>
          </Pressable>
        );
      })}
      <AppText variant="caption" color={MERIDIAN.muted}>
        Average points per round against everyone in the room.
      </AppText>
    </View>
  );
}

/**
 * Counts from 0 up to `total`, one step per `ms`, while `active`; shows everything at once otherwise. Remount (key)
 * the component to replay it for new data.
 */
function useCountUp(total: number, ms: number, active: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setN((s) => (s >= total ? s : s + 1)), ms);
    return () => clearInterval(timer);
  }, [total, ms, active]);
  return active ? Math.min(n, total) : total;
}

export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

/**
 * Shares of the population over generations, as stacked columns. Columns appear over about two seconds (all at
 * once under reduced motion). Strategies below 3 % at the end are folded into the legend's "others".
 */
export function PopulationChart({ t, pop, yoursName }: { t: Tournament; pop: number[][]; yoursName: string }) {
  const reduced = useMotionReduced();
  const { width: screenW } = useWindowDimensions();
  const W = Math.min(screenW - space.xl * 2, 520);
  const H = 180;
  const G_ = pop.length;
  const shown = Math.max(1, useCountUp(G_, 50, !reduced));
  const colW = W / G_;
  const final = pop[Math.min(shown, G_) - 1];
  const legend = t.ids.map((id, i) => ({ id, share: final[i] })).filter((x) => x.share >= 0.03).sort((a, b) => b.share - a.share);
  return (
    <View style={{ gap: space.md }}>
      <Svg width={W} height={H}>
        {pop.slice(0, shown).map((g, gi) => {
          let y = H;
          return (
            <G key={gi}>
              {g.map((share, i) => {
                const h = share * H;
                y -= h;
                return h > 0.2 ? <Rect key={i} x={gi * colW} y={y} width={colW + 0.5} height={h} fill={STRATEGY_COLOR[t.ids[i]]} opacity={t.ids[i] === 'yours' ? 1 : 0.82} /> : null;
              })}
            </G>
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="caption" color={MERIDIAN.muted}>
          Generation 0
        </AppText>
        <AppText variant="caption" color={MERIDIAN.muted} tabular>
          Generation {Math.min(shown, G_) - 1}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }} accessible accessibilityLabel={`After ${Math.min(shown, G_) - 1} generations: ${legend.map((l) => `${nameOf(l.id, yoursName)} ${Math.round(l.share * 100)}%`).join(', ')}`}>
        {legend.map((l) => (
          <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Glyph id={l.id} size={14} />
            <AppText variant="caption" color={MERIDIAN.text} tabular>
              {nameOf(l.id, yoursName)} {Math.round(l.share * 100)}%
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The hall: concentric meridian rings and a field of sigils, for the title card. */
export function HallArt({ height = 300 }: { height?: number }) {
  const { width: screenW } = useWindowDimensions();
  // Sized to its container (a library card is narrower than the screen).
  const [width, setWidth] = useState(screenW);
  const reduced = useMotionReduced();
  const ids: StrategyId[] = ['open-hand', 'mirror', 'iron-wall', 'long-memory', 'weathervane', 'prober', 'gentle-mirror', 'pendulum', 'wary-mirror', 'settler', 'calculator', 'yours'];
  const cx = width / 2;
  const cy = height * 0.55;
  const r = Math.min(width * 0.36, height * 0.4);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%', height, backgroundColor: MERIDIAN.bg, overflow: 'hidden' }} accessible accessibilityRole="image" accessibilityLabel="A circular observatory hall. Twelve strategy sigils stand in a ring around a lit centre.">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="core" cx="50%" cy="55%" r="50%">
            <Stop offset="0" stopColor="#4f46e5" stopOpacity={0.45} />
            <Stop offset="1" stopColor="#4f46e5" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#core)" />
        {[1, 0.72, 0.46].map((k) => (
          <Circle key={k} cx={cx} cy={cy} r={r * k} stroke="#818CF8" strokeOpacity={0.22} strokeWidth={1} fill="none" />
        ))}
        {[0, 30, 60, 90, 120, 150].map((a) => (
          <Line key={a} x1={cx - Math.cos((a * Math.PI) / 180) * r * 1.15} y1={cy - Math.sin((a * Math.PI) / 180) * r * 1.15} x2={cx + Math.cos((a * Math.PI) / 180) * r * 1.15} y2={cy + Math.sin((a * Math.PI) / 180) * r * 1.15} stroke="#818CF8" strokeOpacity={0.08} />
        ))}
        <Circle cx={cx} cy={cy} r={6} fill={MERIDIAN.gold} opacity={0.9} />
      </Svg>
      {ids.map((id, i) => {
        const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
        return (
          <Animated.View key={id} entering={reduced ? undefined : FadeIn.delay(i * 70).duration(500)} style={{ position: 'absolute', left: cx + Math.cos(a) * r - 14, top: cy + Math.sin(a) * r - 14 }}>
            <Glyph id={id} size={28} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/** A simple bar comparison (e.g. what fog cost each strategy). */
export function BarList({ rows, max, unit }: { rows: { id: StrategyId; name: string; value: number; note?: string }[]; max: number; unit: string }) {
  const reduced = useMotionReduced();
  return (
    <View style={{ gap: 6 }}>
      {rows.map((r, i) => (
        <Animated.View key={r.id} entering={reduced ? undefined : FadeInRight.delay(i * 80)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessible accessibilityLabel={`${r.name}: ${r.value.toFixed(2)} ${unit}`}>
          <Glyph id={r.id} size={16} />
          <AppText variant="caption" color={MERIDIAN.text} numberOfLines={1} style={{ width: 118 }}>
            {r.name}
          </AppText>
          <View style={[styles.track, { flex: 1 }]}>
            <View style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: STRATEGY_COLOR[r.id] }} />
          </View>
          <AppText variant="caption" color={MERIDIAN.muted} tabular style={{ width: 40, textAlign: 'right' }}>
            −{r.value.toFixed(2)}
          </AppText>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 5, paddingHorizontal: space.sm, borderRadius: radius.sm, borderWidth: 1, minHeight: 44 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
});
