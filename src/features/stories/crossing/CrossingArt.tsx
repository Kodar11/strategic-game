import { memo, useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { MiraPose, Sky, Stage } from '@/src/stories/crossing/story';
import { useMotionReduced } from '@/src/utils/feedback';

/**
 * The Ashgill gorge, drawn in vector so every beat can restage it: sky and weather, the posts and lanterns, what
 * crosses the gap (cable, guide line, hand-line, the finished span, or a cut line), and Mira on the far cliff.
 * The basket glides along the cable on the UI thread; rain and snow drift; all of it holds still under reduced
 * motion. Original artwork; see docs/STORIES.md.
 */

export const ART_W = 400;
export const ART_H = 280;

export const MIRA_AMBER = '#F2A65A';
export const LANTERN = '#FFD08A';

const SKIES: Record<Sky, [string, string, string]> = {
  dusk: ['#141a33', '#4a3554', '#d9824f'],
  night: ['#04070f', '#0b1426', '#1b2b47'],
  storm: ['#030409', '#0b0f19', '#232b3a'],
  frost: ['#081322', '#1a3150', '#6f8fae'],
  dawn: ['#1a2547', '#7a5f7d', '#f0b285'],
};

// Cable endpoints (the tops of the posts) and the sag control point.
const L = { x: 120, y: 132 };
const R = { x: 282, y: 128 };
const SAG = { x: 201, y: 168 };

/** Point on the main cable at t ∈ [0, 1] (quadratic Bézier). */
function onCable(t: number) {
  'worklet';
  const u = 1 - t;
  return { x: u * u * L.x + 2 * u * t * SAG.x + t * t * R.x, y: u * u * L.y + 2 * u * t * SAG.y + t * t * R.y };
}

const BASKET_T = { east: 0.1, middle: 0.5, west: 0.9, gone: 0.5 } as const;

const STARS = [
  [22, 18], [64, 40], [96, 12], [140, 30], [180, 9], [232, 26], [268, 14], [310, 38], [352, 20], [384, 46], [44, 66], [208, 52], [336, 64], [120, 58],
] as const;

function CrossingArtView({ stage, maxHeight }: { stage: Stage; maxHeight?: number }) {
  const { width: screenW } = useWindowDimensions();
  const reduced = useMotionReduced();
  const w = Math.min(screenW, 720);
  const scale = maxHeight ? Math.min(w / ART_W, maxHeight / ART_H) : w / ART_W;
  const width = ART_W * scale;
  const height = ART_H * scale;
  const [top, mid, low] = SKIES[stage.sky];
  const stars = stage.sky === 'night' || stage.sky === 'frost';
  const peaksSnow = stage.night >= 4;

  // Basket position along the cable, animated between beats.
  const t = useSharedValue<number>(BASKET_T[stage.basket]);
  useEffect(() => {
    const to = BASKET_T[stage.basket];
    if (reduced) t.set(to);
    else t.set(withTiming(to, { duration: 1400, easing: Easing.inOut(Easing.cubic) }));
  }, [stage.basket, reduced, t]);
  const basketStyle = useAnimatedStyle(() => {
    const p = onCable(t.get());
    return { transform: [{ translateX: p.x * scale - 9 * scale }, { translateY: p.y * scale + 1 * scale }] };
  });

  const label = describe(stage);
  return (
    <View style={{ width: '100%', height, alignItems: 'center', backgroundColor: top, overflow: 'hidden' }} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Animated.View key={`${stage.sky}-${stage.night}`} entering={reduced ? undefined : FadeIn.duration(700)} style={{ width, height }}>
        <Svg width={width} height={height} viewBox={`0 0 ${ART_W} ${ART_H}`}>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={top} />
              <Stop offset="0.55" stopColor={mid} />
              <Stop offset="1" stopColor={low} />
            </LinearGradient>
            <LinearGradient id="gorge" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#050810" stopOpacity={0.2} />
              <Stop offset="1" stopColor="#020306" />
            </LinearGradient>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={LANTERN} stopOpacity={0.75} />
              <Stop offset="0.4" stopColor={LANTERN} stopOpacity={0.22} />
              <Stop offset="1" stopColor={LANTERN} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="moon" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#f4f1e8" stopOpacity={0.9} />
              <Stop offset="1" stopColor="#f4f1e8" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={ART_W} height={ART_H} fill="url(#sky)" />
          {stars ? STARS.map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.1 : 0.7} fill="#dfe8ff" opacity={0.75} />) : null}
          {stage.sky === 'night' || stage.sky === 'frost' ? (
            <G>
              <Circle cx={318} cy={48} r={26} fill="url(#moon)" opacity={0.5} />
              <Circle cx={318} cy={48} r={9} fill="#f3efe4" opacity={0.9} />
            </G>
          ) : null}
          {stage.sky === 'storm' ? <Path d="M0 30 Q 80 10 160 34 T 320 26 T 400 40 L 400 0 L 0 0 Z" fill="#0d1220" opacity={0.9} /> : null}

          {/* Far peaks */}
          <Path d="M0 150 L40 112 L70 128 L112 84 L150 120 L188 96 L222 126 L262 80 L300 114 L338 92 L372 118 L400 104 L400 170 L0 170 Z" fill="#1a2438" opacity={stage.sky === 'dawn' || stage.sky === 'dusk' ? 0.75 : 0.95} />
          {peaksSnow ? <Path d="M104 92 L112 84 L121 94 L114 91 Z M254 88 L262 80 L271 90 L263 87 Z M331 99 L338 92 L346 101 L339 98 Z" fill="#dfe7f2" opacity={0.8} /> : null}

          {/* The gorge */}
          <Path d="M0 140 L118 136 L128 150 L138 280 L0 280 Z" fill="#0c1220" />
          <Path d="M400 136 L284 132 L272 150 L262 280 L400 280 Z" fill="#0c1220" />
          <Path d="M128 150 L138 280 L262 280 L272 150 Q 200 176 128 150 Z" fill="url(#gorge)" />
          <Path d="M168 266 Q 200 258 232 266" stroke="#5b7fa6" strokeWidth={1} opacity={0.35} fill="none" />
          {/* Rock rims, rim-lit */}
          <Path d="M0 140 L118 136 L128 150" stroke={stage.sky === 'dusk' || stage.sky === 'dawn' ? '#e8a46b' : '#3b5a85'} strokeWidth={1.4} opacity={0.6} fill="none" />
          <Path d="M400 136 L284 132 L272 150" stroke={stage.sky === 'dusk' || stage.sky === 'dawn' ? '#e8a46b' : '#3b5a85'} strokeWidth={1.4} opacity={0.6} fill="none" />
          {/* Stumps of the old Long Bridge */}
          <Path d="M128 150 L150 158 L146 163 L130 158 Z M272 150 L250 158 L254 163 L270 158 Z" fill="#1b2232" />

          {/* What crosses the gap */}
          <Built stage={stage} />
          <Path d={`M${L.x} ${L.y} Q ${SAG.x} ${SAG.y} ${R.x} ${R.y}`} stroke="#8b97ab" strokeWidth={1.3} fill="none" />

          {/* Posts and winches */}
          <Rect x={L.x - 3} y={L.y - 2} width={6} height={20} fill="#2a2f3a" />
          <Rect x={R.x - 3} y={R.y - 2} width={6} height={20} fill="#2a2f3a" />
          <Circle cx={L.x - 9} cy={L.y + 12} r={4} fill="#2a2f3a" stroke="#4a5263" strokeWidth={0.8} />
          <Circle cx={R.x + 9} cy={R.y + 12} r={4} fill="#2a2f3a" stroke="#4a5263" strokeWidth={0.8} />

          {/* Your lantern and you, from behind */}
          <Circle cx={L.x - 22} cy={L.y + 2} r={22} fill="url(#glow)" />
          <Keeper x={L.x - 22} y={L.y + 4} />

          {/* Mira's side */}
          {stage.miraLight ? <Circle cx={stage.mira === 'lantern-up' ? R.x + 18 : R.x + 22} cy={stage.mira === 'lantern-up' ? R.y - 14 : R.y + 2} r={22} fill="url(#glow)" /> : null}
          <Mira pose={stage.mira} light={stage.miraLight} />

          {/* Town lights behind you */}
          <G opacity={stage.sky === 'dawn' ? 0.35 : 0.8}>
            <Rect x={20} y={176} width={3} height={3} fill={LANTERN} opacity={0.7} />
            <Rect x={46} y={190} width={3} height={3} fill={LANTERN} opacity={0.5} />
            <Rect x={74} y={182} width={3} height={3} fill={LANTERN} opacity={0.6} />
          </G>
          {stage.snow ? <Path d="M0 140 L118 136 L128 150 L0 152 Z M400 136 L284 132 L272 150 L400 150 Z" fill="#e6edf5" opacity={0.85} /> : null}
          {stage.sky === 'frost' ? <Path d={`M${L.x} ${L.y} Q ${SAG.x} ${SAG.y} ${R.x} ${R.y}`} stroke="#e8f2ff" strokeWidth={0.6} opacity={0.6} fill="none" /> : null}
        </Svg>
        {stage.basket !== 'gone' ? (
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 18 * scale, height: 14 * scale }, basketStyle]} pointerEvents="none">
            <Svg width={18 * scale} height={14 * scale} viewBox="0 0 18 14">
              <Line x1={9} y1={0} x2={3} y2={5} stroke="#8b97ab" strokeWidth={0.8} />
              <Line x1={9} y1={0} x2={15} y2={5} stroke="#8b97ab" strokeWidth={0.8} />
              <Path d="M2 5 L16 5 L14 13 L4 13 Z" fill="#6b4a2c" stroke="#a37548" strokeWidth={0.8} />
              <Line x1={3} y1={8} x2={15} y2={8} stroke="#a37548" strokeWidth={0.5} />
            </Svg>
          </Animated.View>
        ) : null}
        {stage.rain ? <Precip kind="rain" width={width} height={height} reduced={reduced} heavy={stage.sky === 'storm'} /> : null}
        {stage.snow ? <Precip kind="snow" width={width} height={height} reduced={reduced} /> : null}
      </Animated.View>
    </View>
  );
}

export const CrossingArt = memo(CrossingArtView);

function Built({ stage }: { stage: Stage }) {
  const frayDash = stage.frayed ? '10 3 4 6' : undefined;
  switch (stage.built) {
    case 'line2':
      return <Path d={`M${L.x} ${L.y - 9} Q ${SAG.x} ${SAG.y - 24} ${R.x} ${R.y - 9}`} stroke="#c9a46a" strokeWidth={1.2} strokeDasharray={frayDash} fill="none" />;
    case 'rail':
      return <Path d={`M${L.x} ${L.y - 6} Q ${SAG.x} ${SAG.y - 14} ${R.x} ${R.y - 6}`} stroke="#c9a46a" strokeWidth={0.8} strokeDasharray={frayDash} fill="none" opacity={0.85} />;
    case 'span': {
      const planks = [];
      for (let i = 0; i <= 26; i++) {
        const t = i / 26;
        const u = 1 - t;
        const x = u * u * L.x + 2 * u * t * SAG.x + t * t * R.x;
        const y = u * u * (L.y + 2) + 2 * u * t * (SAG.y - 18) + t * t * (R.y + 2);
        planks.push(<Rect key={i} x={x - 2.5} y={y - 1} width={5} height={2.6} fill="#9c7448" stroke="#5c4128" strokeWidth={0.4} />);
      }
      return (
        <G>
          <Path d={`M${L.x} ${L.y - 9} Q ${SAG.x} ${SAG.y - 28} ${R.x} ${R.y - 9}`} stroke="#c9a46a" strokeWidth={1.1} fill="none" />
          {planks}
          {[0.25, 0.5, 0.75].map((t) => {
            const u = 1 - t;
            const x = u * u * L.x + 2 * u * t * SAG.x + t * t * R.x;
            return <Circle key={t} cx={x} cy={u * u * (L.y - 12) + 2 * u * t * (SAG.y - 32) + t * t * (R.y - 12)} r={1.6} fill={LANTERN} />;
          })}
        </G>
      );
    }
    case 'cut':
      return <Path d={`M${L.x} ${L.y - 9} Q ${L.x + 14} ${L.y + 30} ${L.x + 8} ${L.y + 60}`} stroke="#c9a46a" strokeWidth={1} fill="none" opacity={0.7} />;
    default:
      return null;
  }
}

/** The player: a small figure seen from behind, at the near post. */
function Keeper({ x, y }: { x: number; y: number }) {
  return (
    <G>
      <Path d={`M${x - 5} ${y + 14} Q ${x - 6} ${y + 2} ${x} ${y} Q ${x + 6} ${y + 2} ${x + 5} ${y + 14} Z`} fill="#141a26" />
      <Circle cx={x} cy={y - 3} r={3.4} fill="#141a26" />
      <Circle cx={x + 6} cy={y + 6} r={1.8} fill={LANTERN} />
    </G>
  );
}

/** Mira: tall, hooded courier's coat, amber scarf, satchel. Her pose carries the expression. */
function Mira({ pose, light }: { pose: MiraPose; light: boolean }) {
  if (pose === 'none') return null;
  const crossing = pose === 'crossing';
  const x = crossing ? 226 : R.x + 18;
  const y = crossing ? 132 : R.y + 1;
  const turned = pose === 'turned';
  const rim = light ? LANTERN : '#5d7aa3';
  return (
    <G>
      {/* Coat */}
      <Path d={`M${x - 6} ${y + 16} Q ${x - 7} ${y + 2} ${x} ${y - 1} Q ${x + 7} ${y + 2} ${x + 6} ${y + 16} Z`} fill="#121826" />
      <Path d={`M${x + (turned ? -6 : 6)} ${y + 16} Q ${x + (turned ? -7 : 7)} ${y + 2} ${x} ${y - 1}`} stroke={rim} strokeWidth={0.7} opacity={0.8} fill="none" />
      {/* Satchel strap */}
      <Line x1={x - 4} y1={y + 1} x2={x + 4} y2={y + 11} stroke="#3a2d22" strokeWidth={1.1} />
      {/* Hood */}
      <Path d={`M${x - 4} ${y - 1} Q ${x - 4.5} ${y - 9} ${x} ${y - 9.5} Q ${x + 4.5} ${y - 9} ${x + 4} ${y - 1} Z`} fill="#161d2c" />
      {/* Scarf — the one bright note of her silhouette, hidden when she turns away */}
      {!turned ? <Path d={`M${x - 4} ${y - 1.5} Q ${x} ${y + 1.5} ${x + 4} ${y - 1.5} L ${x + 3} ${y + 4} L ${x + 1.5} ${y + 1.5} Z`} fill={MIRA_AMBER} /> : <Path d={`M${x - 4} ${y - 1} Q ${x} ${y + 0.5} ${x + 4} ${y - 1}`} stroke={MIRA_AMBER} strokeWidth={0.8} opacity={0.5} fill="none" />}
      {/* Lantern arm */}
      {pose === 'lantern-up' ? (
        <G>
          <Line x1={x - 3} y1={y + 2} x2={x} y2={y - 13} stroke="#121826" strokeWidth={2} />
          <Circle cx={x} cy={y - 15} r={2} fill={light ? LANTERN : '#2a3140'} />
        </G>
      ) : light && !turned ? (
        <Circle cx={x + 4} cy={y + 1} r={1.8} fill={LANTERN} />
      ) : null}
    </G>
  );
}

function Precip({ kind, width, height, reduced, heavy }: { kind: 'rain' | 'snow'; width: number; height: number; reduced: boolean; heavy?: boolean }) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.set(0);
    y.set(withRepeat(withTiming(1, { duration: kind === 'rain' ? (heavy ? 500 : 800) : 6000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(y);
  }, [reduced, kind, heavy, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (y.get() - 1) * height }, { translateX: kind === 'rain' ? (1 - y.get()) * 20 : Math.sin(y.get() * 6.28) * 6 }] }));
  const marks = [];
  const n = kind === 'rain' ? (heavy ? 70 : 40) : 50;
  for (let i = 0; i < n; i++) {
    const px = ((i * 97) % 100) / 100;
    const py = ((i * 61) % 100) / 100;
    marks.push(
      kind === 'rain' ? (
        <Line key={i} x1={px * width} y1={py * height} x2={px * width - 4} y2={py * height + 12} stroke="#9fb3cf" strokeWidth={0.8} opacity={0.45} />
      ) : (
        <Ellipse key={i} cx={px * width} cy={py * height} rx={1.4} ry={1.4} fill="#eef3fa" opacity={0.8} />
      ),
    );
  }
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width, height: height * 2 }, style]}>
      <Svg width={width} height={height}>{marks}</Svg>
      <Svg width={width} height={height}>{marks}</Svg>
    </Animated.View>
  );
}

/** A text description of the illustration, for screen readers. */
function describe(s: Stage): string {
  const sky = { dusk: 'Dusk', night: 'Night', storm: 'A storm', frost: 'A frosty night', dawn: 'Dawn' }[s.sky];
  const built = { none: 'a single cable crosses the gorge', rail: 'a cable and a thin hand-line cross the gorge', line2: 'a cable and a second guide line cross the gorge', span: 'a plank walkway now spans the gorge', cut: 'the guide line hangs cut against the cliff' }[s.built];
  const mira = { none: 'The far post is empty.', stand: 'Mira stands at the far post.', 'lantern-up': 'Mira raises her lantern.', turned: 'Mira has turned away.', crossing: 'Mira is out on the span.' }[s.mira];
  return `${sky} over the Ashgill gorge; ${built}${s.frayed ? ', fraying' : ''}. ${mira}${s.snow ? ' Snow is falling.' : s.rain ? ' Rain.' : ''}`;
}
