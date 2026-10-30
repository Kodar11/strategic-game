import { memo, useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { Direction, Mood, Shot } from '@/src/stories/crossing/direction';
import type { MiraPose, Sky, Stage } from '@/src/stories/crossing/story';
import { useMotionReduced } from '@/src/utils/feedback';
import { Bust } from './Bust';

/**
 * The Ashgill gorge, drawn in vector and built in depth: sky, drifting cloud, far peaks, the gorge with its moving
 * water and mist, then the near world of posts, cable and people, then reeds in the foreground. A camera moves through
 * these layers (each by its own depth), and each beat restages what is in them. Everything that moves animates a
 * transform on the UI thread, so a moving scene costs no re-renders; under reduced motion it all holds still.
 * Original artwork; see docs/STORY_AUDIO_ASSETS.md.
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

/** Where the camera looks, as scale and an offset in art units. */
const CAMERA: Record<Shot, { s: number; x: number; y: number }> = {
  establish: { s: 1, x: 0, y: 0 },
  wide: { s: 1, x: 0, y: 0 },
  far: { s: 1.5, x: -82, y: -12 },
  near: { s: 1.3, x: 42, y: -8 },
  centre: { s: 1.28, x: 0, y: -14 },
  'bust-mira': { s: 1.5, x: -82, y: -12 },
  'bust-hollis': { s: 1.3, x: 42, y: -8 },
};

export interface ArtDirection {
  shot: Shot;
  mood: Mood;
  grade: Direction['grade'];
}

const NEUTRAL: ArtDirection = { shot: 'wide', mood: 'guarded', grade: { warm: 0, cold: 0, dark: 0 } };

function CrossingArtView({ stage, direction = NEUTRAL, maxHeight, coverHeight, still }: { stage: Stage; direction?: ArtDirection; maxHeight?: number; /** Fill this height, cropping the outer edges of the landscape if the screen is narrow. */ coverHeight?: number; still?: boolean }) {
  const { width: screenW } = useWindowDimensions();
  const reducedSetting = useMotionReduced();
  const reduced = reducedSetting || !!still;
  const w = Math.min(screenW, 720);
  const scale = coverHeight ? Math.max(w / ART_W, coverHeight / ART_H) : maxHeight ? Math.min(w / ART_W, maxHeight / ART_H) : w / ART_W;
  const width = ART_W * scale;
  const height = ART_H * scale;
  const [top] = SKIES[stage.sky];

  // The camera. A long, slow drift over the settlement on the opening beat; otherwise a measured move.
  const camS = useSharedValue(direction.shot === 'establish' && !reduced ? 1.55 : 1);
  const camX = useSharedValue(direction.shot === 'establish' && !reduced ? 88 : 0);
  const camY = useSharedValue(direction.shot === 'establish' && !reduced ? -18 : 0);
  const { shot } = direction;
  useEffect(() => {
    const c = CAMERA[shot];
    if (reduced) {
      camS.set(1);
      camX.set(0);
      camY.set(0);
      return;
    }
    const opts = { duration: shot === 'establish' ? 9000 : 1700, easing: Easing.inOut(Easing.cubic) };
    camS.set(withTiming(c.s, opts));
    camX.set(withTiming(c.x, opts));
    camY.set(withTiming(c.y, opts));
  }, [shot, reduced, camS, camX, camY]);
  /** Each layer moves by its depth, which is what makes the picture feel like a place. */
  const layer = (depth: number) => {
    'worklet';
    return { transform: [{ translateX: camX.get() * depth * scale }, { translateY: camY.get() * depth * scale }, { scale: 1 + (camS.get() - 1) * depth }] };
  };
  const farStyle = useAnimatedStyle(() => layer(0.35));
  const midStyle = useAnimatedStyle(() => layer(0.72));
  const nearStyle = useAnimatedStyle(() => layer(1));
  const foreStyle = useAnimatedStyle(() => layer(1.3));

  // Basket position along the cable, animated between beats.
  const t = useSharedValue<number>(BASKET_T[stage.basket]);
  useEffect(() => {
    const to = BASKET_T[stage.basket];
    if (reduced) t.set(to);
    else t.set(withTiming(to, { duration: 2200, easing: Easing.inOut(Easing.quad) }));
  }, [stage.basket, reduced, t]);
  const basketStyle = useAnimatedStyle(() => {
    const p = onCable(t.get());
    return { transform: [{ translateX: p.x * scale - 9 * scale }, { translateY: p.y * scale + 1 * scale }] };
  });

  const box = { position: 'absolute' as const, left: 0, top: 0, width, height };
  const bust = shot === 'bust-mira' ? 'mira' : shot === 'bust-hollis' ? 'hollis' : null;
  const sky = stage.sky;
  const mistLevel = sky === 'dawn' ? 0.5 : sky === 'frost' ? 0.42 : sky === 'storm' ? 0.34 : sky === 'dusk' ? 0.24 : 0.2;

  return (
    <View style={{ width: '100%', height, alignItems: 'center', backgroundColor: top, overflow: 'hidden' }} accessible accessibilityRole="image" accessibilityLabel={describe(stage, bust)}>
      <View style={{ width, height }}>
        <Animated.View style={[box, farStyle]}>
          <SkyFade sky={sky} night={stage.night} width={width} height={height} reduced={reduced} />
          {!still ? <Clouds sky={sky} width={width} height={height} reduced={reduced} /> : null}
          <Peaks stage={stage} width={width} height={height} />
        </Animated.View>
        <Animated.View style={[box, midStyle]}>
          <Gorge sky={sky} width={width} height={height} />
          {!still ? <RiverLight width={width} height={height} scale={scale} reduced={reduced} sky={sky} /> : null}
          {!still ? <Mist width={width} height={height} scale={scale} reduced={reduced} level={mistLevel} /> : null}
        </Animated.View>
        <Animated.View style={[box, nearStyle]}>
          <NearWorld stage={stage} width={width} height={height} />
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
          {!still ? <Lanterns stage={stage} scale={scale} reduced={reduced} /> : null}
        </Animated.View>
        {!still ? (
          <Animated.View style={[box, foreStyle]} pointerEvents="none">
            <Reeds width={width} height={height} scale={scale} reduced={reduced} snow={stage.snow} />
          </Animated.View>
        ) : null}
        <Grade grade={direction.grade} sky={sky} width={width} height={height} />
        {stage.rain ? <Precip kind="rain" width={width} height={height} reduced={reduced} heavy={sky === 'storm'} /> : null}
        {stage.snow ? <Precip kind="snow" width={width} height={height} reduced={reduced} /> : null}
        {bust ? (
          <Animated.View key={bust} entering={reduced ? undefined : FadeIn.duration(520)} exiting={reduced ? undefined : FadeOut.duration(420)} style={box} pointerEvents="none">
            <Bust who={bust} mood={direction.mood} width={width} height={height} sky={sky} light={stage.miraLight || bust === 'hollis'} reduced={reduced} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

export const CrossingArt = memo(CrossingArtView);

/** The new sky fades in over the last one, so time passes rather than cuts. */
function SkyFade({ sky, night, width, height, reduced }: { sky: Sky; night: number; width: number; height: number; reduced: boolean }) {
  const [shown, setShown] = useState(sky);
  const [behind, setBehind] = useState<Sky | null>(null);
  if (sky !== shown) {
    setBehind(shown);
    setShown(sky);
  }
  useEffect(() => {
    if (!behind) return;
    const h = setTimeout(() => setBehind(null), 2600);
    return () => clearTimeout(h);
  }, [behind]);
  return (
    <>
      {behind ? <SkyLayer sky={behind} night={night} width={width} height={height} /> : null}
      <Animated.View key={shown} entering={reduced || !behind ? undefined : FadeIn.duration(2400)} style={{ position: 'absolute', left: 0, top: 0, width, height }}>
        <SkyLayer sky={shown} night={night} width={width} height={height} />
      </Animated.View>
    </>
  );
}

const SkyLayer = memo(function SkyLayer({ sky, night, width, height }: { sky: Sky; night: number; width: number; height: number }) {
  const [top, mid, low] = SKIES[sky];
  const stars = sky === 'night' || sky === 'frost';
  const id = `sky-${sky}`;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${ART_W} ${ART_H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="0.55" stopColor={mid} />
          <Stop offset="1" stopColor={low} />
        </LinearGradient>
        <RadialGradient id={`${id}-moon`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#f4f1e8" stopOpacity={0.9} />
          <Stop offset="1" stopColor="#f4f1e8" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}-sun`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#ffd9a8" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#ffd9a8" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={ART_W} height={ART_H} fill={`url(#${id})`} />
      {stars ? STARS.map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.1 : 0.7} fill="#dfe8ff" opacity={0.75} />) : null}
      {stars ? (
        // The moon climbs a little across the sixteen nights: the one thing in the sky keeping count.
        <G>
          <Circle cx={318 - night * 2.4} cy={56 - night * 0.8} r={26} fill={`url(#${id}-moon)`} opacity={0.5} />
          <Circle cx={318 - night * 2.4} cy={56 - night * 0.8} r={9} fill="#f3efe4" opacity={0.9} />
        </G>
      ) : null}
      {sky === 'dusk' || sky === 'dawn' ? <Circle cx={sky === 'dusk' ? 70 : 318} cy={120} r={70} fill={`url(#${id}-sun)`} /> : null}
    </Svg>
  );
});

function Clouds({ sky, width, height, reduced }: { sky: Sky; width: number; height: number; reduced: boolean }) {
  const x = useSharedValue(0);
  const speed = sky === 'storm' ? 26000 : 90000;
  useEffect(() => {
    if (reduced) return;
    x.set(0);
    x.set(withRepeat(withTiming(-1, { duration: speed, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(x);
  }, [reduced, speed, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * width }] }));
  const color = sky === 'storm' ? '#0a0e18' : sky === 'dusk' || sky === 'dawn' ? '#3d2c49' : sky === 'frost' ? '#22344f' : '#0d1729';
  const opacity = sky === 'storm' ? 0.95 : sky === 'dawn' ? 0.5 : 0.65;
  const band = <Path d="M0 42 Q 40 26 88 40 T 176 34 T 270 44 T 400 36 L 400 58 Q 330 70 260 56 T 130 64 T 0 56 Z M30 88 Q 90 74 150 88 T 280 84 L 280 94 Q 200 104 130 96 T 30 96 Z" fill={color} opacity={opacity} />;
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: width * 2, height, flexDirection: 'row' }, style]} pointerEvents="none">
      <Svg width={width} height={height} viewBox={`0 0 ${ART_W} ${ART_H}`}>{band}</Svg>
      <Svg width={width} height={height} viewBox={`0 0 ${ART_W} ${ART_H}`}>{band}</Svg>
    </Animated.View>
  );
}

const Peaks = memo(function Peaks({ stage, width, height }: { stage: Stage; width: number; height: number }) {
  const snowLine = stage.night >= 4;
  const warmSky = stage.sky === 'dawn' || stage.sky === 'dusk';
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${ART_W} ${ART_H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Path d="M0 150 L40 112 L70 128 L112 84 L150 120 L188 96 L222 126 L262 80 L300 114 L338 92 L372 118 L400 104 L400 170 L0 170 Z" fill="#1a2438" opacity={warmSky ? 0.75 : 0.95} />
      {/* The nearer ridge runs on down behind the gorge: looking across the gap you see far hillside, not open sky. */}
      <Path d="M-60 158 L32 138 L66 150 L100 126 L140 148 L180 130 L232 150 L276 124 L320 146 L360 130 L460 148 L460 320 L-60 320 Z" fill={warmSky ? '#241d30' : '#111929'} />
      {snowLine ? <Path d="M104 92 L112 84 L121 94 L114 91 Z M254 88 L262 80 L271 90 L263 87 Z M331 99 L338 92 L346 101 L339 98 Z" fill="#dfe7f2" opacity={0.8} /> : null}
      {/* Orrin's Rest: one spark high on the far mountain, the place all of it is for. */}
      <Circle cx={344} cy={108} r={0.9} fill={LANTERN} opacity={stage.sky === 'dawn' ? 0.3 : 0.85} />
    </Svg>
  );
});

const Gorge = memo(function Gorge({ sky, width, height }: { sky: Sky; width: number; height: number }) {
  const rim = sky === 'dusk' || sky === 'dawn' ? '#e8a46b' : '#3b5a85';
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${ART_W} ${ART_H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Defs>
        <LinearGradient id="gorge" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#050810" stopOpacity={0} />
          <Stop offset="0.7" stopColor="#03050a" stopOpacity={0.9} />
          <Stop offset="1" stopColor="#020306" />
        </LinearGradient>
      </Defs>
      {/* Wider than the gap: the near cliffs move further than this layer, and sky must never show behind them. */}
      <Path d="M-80 150 L480 150 L480 320 L-80 320 Z" fill="url(#gorge)" />
      {/* Rock strata falling away on the far walls. */}
      <Path d="M128 160 L146 204 L136 240 M272 160 L252 200 L264 244" stroke={rim} strokeOpacity={0.14} strokeWidth={1} fill="none" />
      <Path d="M168 266 Q 200 258 232 266" stroke="#5b7fa6" strokeWidth={1} opacity={0.3} fill="none" />
    </Svg>
  );
});

function RiverLight({ width, height, scale, reduced, sky }: { width: number; height: number; scale: number; reduced: boolean; sky: Sky }) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    x.set(0);
    x.set(withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(x);
  }, [reduced, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * 34 * scale }], opacity: 0.35 + 0.25 * Math.sin(x.get() * Math.PI) }));
  const color = sky === 'dusk' || sky === 'dawn' ? '#f0b285' : '#7ea3cc';
  return (
    <View style={{ position: 'absolute', left: 150 * scale, top: 250 * scale, width: 100 * scale, height: 24 * scale, overflow: 'hidden' }} pointerEvents="none">
      <Animated.View style={[{ width: 170 * scale, marginLeft: -40 * scale }, style]}>
        <Svg width={170 * scale} height={24 * scale} viewBox="0 0 170 24">
          <Path d="M0 8 h14 m10 0 h22 m12 0 h16 m10 0 h24 m14 0 h18 m8 0 h20 M6 15 h20 m12 0 h12 m14 0 h26 m12 0 h14 m10 0 h22" stroke={color} strokeWidth={0.9} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>
    </View>
  );
}

function Mist({ width, height, scale, reduced, level }: { width: number; height: number; scale: number; reduced: boolean; level: number }) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    x.set(0);
    x.set(withRepeat(withSequence(withTiming(1, { duration: 24000, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 24000, easing: Easing.inOut(Easing.sin) })), -1, false));
    return () => cancelAnimation(x);
  }, [reduced, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: (x.get() - 0.5) * 60 * scale }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -40 * scale, top: 186 * scale, width: width + 80 * scale, height: 74 * scale, opacity: level }, style]}>
      <Svg width={width + 80 * scale} height={74 * scale} viewBox="0 0 480 74" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="mist" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#c7d4e4" stopOpacity={0.55} />
            <Stop offset="1" stopColor="#c7d4e4" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={240} cy={40} rx={150} ry={26} fill="url(#mist)" />
        <Ellipse cx={170} cy={30} rx={110} ry={20} fill="url(#mist)" />
        <Ellipse cx={320} cy={48} rx={120} ry={18} fill="url(#mist)" />
      </Svg>
    </Animated.View>
  );
}

const NearWorld = memo(function NearWorld({ stage, width, height }: { stage: Stage; width: number; height: number }) {
  const warmSky = stage.sky === 'dusk' || stage.sky === 'dawn';
  const rim = warmSky ? '#e8a46b' : '#3b5a85';
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${ART_W} ${ART_H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={LANTERN} stopOpacity={0.75} />
          <Stop offset="0.4" stopColor={LANTERN} stopOpacity={0.22} />
          <Stop offset="1" stopColor={LANTERN} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Cliffs */}
      <Path d="M-40 140 L118 136 L128 150 L138 300 L-40 300 Z" fill="#0c1220" />
      <Path d="M440 136 L284 132 L272 150 L262 300 L440 300 Z" fill="#0c1220" />
      <Path d="M-40 140 L118 136 L128 150" stroke={rim} strokeWidth={1.4} opacity={0.6} fill="none" />
      <Path d="M440 136 L284 132 L272 150" stroke={rim} strokeWidth={1.4} opacity={0.6} fill="none" />

      {/* Luma: the lower town behind you, a few roofs on the far bank. */}
      <G opacity={0.95}>
        <Path d="M6 144 L6 128 L18 118 L30 128 L30 144 Z M34 146 L34 134 L44 126 L54 134 L54 146 Z M62 142 L62 124 L76 112 L90 124 L90 142 Z" fill="#141b2c" />
        <Path d="M6 128 L18 118 L30 128 M62 124 L76 112 L90 124" stroke={rim} strokeWidth={0.6} opacity={0.5} fill="none" />
        <Rect x={15} y={130} width={3} height={4} fill={LANTERN} opacity={stage.sky === 'dawn' ? 0.25 : 0.8} />
        <Rect x={74} y={127} width={3} height={4} fill={LANTERN} opacity={stage.sky === 'dawn' ? 0.25 : 0.7} />
        <Rect x={42} y={135} width={2.5} height={3} fill={LANTERN} opacity={stage.sky === 'dawn' ? 0.2 : 0.5} />
        <Path d="M330 142 L330 128 L342 118 L354 128 L354 142 Z M366 144 L366 132 L378 124 L392 132 L392 144 Z" fill="#141b2c" />
        <Rect x={340} y={130} width={2.5} height={3.5} fill={LANTERN} opacity={stage.sky === 'dawn' ? 0.2 : 0.55} />
      </G>

      {/* What is left of the Long Bridge: two broken ends, a few planks hanging from their ropes. */}
      <Path d="M128 150 L154 160 L150 166 L130 158 Z M272 150 L246 160 L250 166 L270 158 Z" fill="#1f1812" />
      <Path d="M138 153 L156 160 M262 153 L244 160" stroke="#5a4630" strokeWidth={0.9} />
      <G stroke="#7a6346" strokeWidth={0.5}>
        <Line x1={152} y1={162} x2={158} y2={186} />
        <Line x1={146} y1={160} x2={148} y2={178} />
        <Line x1={250} y1={162} x2={243} y2={190} />
        <Line x1={256} y1={160} x2={255} y2={174} />
      </G>
      <G fill="#2d2318" stroke="#4b3a26" strokeWidth={0.3}>
        <Rect x={153} y={185} width={9} height={2.4} transform="rotate(38 157 186)" />
        <Rect x={143} y={177} width={9} height={2.4} transform="rotate(-24 148 178)" />
        <Rect x={238} y={189} width={9} height={2.4} transform="rotate(-44 243 190)" />
        <Rect x={250} y={173} width={9} height={2.4} transform="rotate(18 255 174)" />
      </G>

      <Built stage={stage} />
      <Path d={`M${L.x} ${L.y} Q ${SAG.x} ${SAG.y} ${R.x} ${R.y}`} stroke="#8b97ab" strokeWidth={1.3} fill="none" />
      {stage.sky === 'frost' ? <Path d={`M${L.x} ${L.y} Q ${SAG.x} ${SAG.y} ${R.x} ${R.y}`} stroke="#e8f2ff" strokeWidth={0.6} opacity={0.6} fill="none" /> : null}

      {/* Posts and winches */}
      <Rect x={L.x - 3} y={L.y - 2} width={6} height={20} fill="#2a2f3a" />
      <Rect x={R.x - 3} y={R.y - 2} width={6} height={20} fill="#2a2f3a" />
      <Circle cx={L.x - 9} cy={L.y + 12} r={4} fill="#2a2f3a" stroke="#4a5263" strokeWidth={0.8} />
      <Circle cx={R.x + 9} cy={R.y + 12} r={4} fill="#2a2f3a" stroke="#4a5263" strokeWidth={0.8} />

      {/* Your lantern and you, from behind */}
      <Keeper x={L.x - 22} y={L.y + 4} />

      {/* Mira's side */}
      <Mira pose={stage.mira} light={stage.miraLight} />

      {stage.snow ? <Path d="M-40 140 L118 136 L128 150 L-40 152 Z M440 136 L284 132 L272 150 L440 150 Z" fill="#e6edf5" opacity={0.85} /> : null}
    </Svg>
  );
});

/** Lantern light breathes very slightly. It's the one warm thing in the frame, and it should feel alive. */
function Lanterns({ stage, scale, reduced }: { stage: Stage; scale: number; reduced: boolean }) {
  const a = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    a.set(withRepeat(withSequence(withTiming(0.82, { duration: 1300, easing: Easing.inOut(Easing.sin) }), withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) })), -1, false));
    return () => cancelAnimation(a);
  }, [reduced, a]);
  const style = useAnimatedStyle(() => ({ opacity: a.get() }));
  const size = 52 * scale;
  const glow = (key: string, cx: number, cy: number) => (
    <Animated.View key={key} pointerEvents="none" style={[{ position: 'absolute', left: cx * scale - size / 2, top: cy * scale - size / 2, width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 52 52">
        <Defs>
          <RadialGradient id={`lantern-${key}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={LANTERN} stopOpacity={0.7} />
            <Stop offset="0.4" stopColor={LANTERN} stopOpacity={0.2} />
            <Stop offset="1" stopColor={LANTERN} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={26} cy={26} r={26} fill={`url(#lantern-${key})`} />
      </Svg>
    </Animated.View>
  );
  const raised = stage.mira === 'lantern-up';
  return (
    <>
      {glow('near', L.x - 16, L.y + 10)}
      {stage.miraLight && stage.mira !== 'crossing' ? glow('far', raised ? R.x + 18 : R.x + 22, raised ? R.y - 14 : R.y + 2) : null}
      {stage.mira === 'crossing' ? glow('span', 230, 134) : null}
    </>
  );
}

function Reeds({ width, height, scale, reduced, snow }: { width: number; height: number; scale: number; reduced: boolean; snow: boolean }) {
  const a = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    a.set(withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), withTiming(-1, { duration: 3100, easing: Easing.inOut(Easing.sin) })), -1, true));
    return () => cancelAnimation(a);
  }, [reduced, a]);
  const sway = useAnimatedStyle(() => ({ transform: [{ rotate: `${a.get() * 2.4}deg` }] }));
  const sway2 = useAnimatedStyle(() => ({ transform: [{ rotate: `${a.get() * -1.7}deg` }] }));
  const color = snow ? '#2a3244' : '#080c15';
  const clump = (d: string, w: number, h: number) => (
    <Svg width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`}>
      <Path d={d} stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width, height }} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', left: -6 * scale, bottom: -4 * scale, transformOrigin: 'bottom' }, sway]}>
        {clump('M8 70 Q 6 40 2 20 M14 70 Q 15 34 22 6 M20 70 Q 24 44 34 26 M26 70 Q 32 52 44 42 M4 70 Q 0 54 -2 44', 50, 72)}
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', right: -4 * scale, bottom: -4 * scale, transformOrigin: 'bottom' }, sway2]}>
        {clump('M34 60 Q 36 36 42 18 M28 60 Q 26 34 18 16 M20 60 Q 16 44 6 34 M40 60 Q 44 46 48 40', 50, 62)}
      </Animated.View>
    </View>
  );
}

/** Light over the whole frame. Warm only when something has been kept; cold when something hasn't. */
function Grade({ grade, sky, width, height }: { grade: Direction['grade']; sky: Sky; width: number; height: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: '#ff9d4d', opacity: grade.warm * 0.16 }} />
      <View style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: '#3f6fb5', opacity: grade.cold * 0.22 }} />
      <View style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: '#000', opacity: grade.dark * 0.6 }} />
      <Svg width={width} height={height} viewBox={`0 0 ${ART_W} ${ART_H}`}>
        <Defs>
          <RadialGradient id={`vig-${sky}`} cx="50%" cy="46%" r="72%">
            <Stop offset="0.55" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.55} />
          </RadialGradient>
        </Defs>
        <Rect width={ART_W} height={ART_H} fill={`url(#vig-${sky})`} />
      </Svg>
    </View>
  );
}

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
    y.set(withDelay(0, withRepeat(withTiming(1, { duration: kind === 'rain' ? (heavy ? 500 : 800) : 6000, easing: Easing.linear }), -1, false)));
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
function describe(s: Stage, bust: 'mira' | 'hollis' | null): string {
  const sky = { dusk: 'Dusk', night: 'Night', storm: 'A storm', frost: 'A frosty night', dawn: 'Dawn' }[s.sky];
  const built = { none: 'a single cable crosses the gorge', rail: 'a cable and a thin hand-line cross the gorge', line2: 'a cable and a second guide line cross the gorge', span: 'a plank walkway now spans the gorge', cut: 'the guide line hangs cut against the cliff' }[s.built];
  const mira = { none: 'The far post is empty.', stand: 'Mira stands at the far post.', 'lantern-up': 'Mira raises her lantern.', turned: 'Mira has turned away.', crossing: 'Mira is out on the span.' }[s.mira];
  const close = bust === 'mira' ? ' A close view of Mira.' : bust === 'hollis' ? ' A close view of Hollis.' : '';
  return `${sky} over the Ashgill gorge; ${built}${s.frayed ? ', fraying' : ''}. ${mira}${s.snow ? ' Snow is falling.' : s.rain ? ' Rain.' : ''}${close}`;
}
