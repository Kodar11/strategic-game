import { memo, useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { Mood } from '@/src/stories/crossing/direction';
import type { Sky } from '@/src/stories/crossing/story';

/**
 * The close-up: the same people as the small figures in the wide shot, now near enough to read. Lit from one side by
 * lantern light, with the rest of the face left to shadow. Feeling is carried by very little: the set of the brow and
 * mouth, where she's looking, and how much of the scarf she shows. They breathe and blink. Under reduced motion they
 * simply hold still.
 */

const BACKDROP: Record<Sky, [string, string]> = {
  dusk: ['#2a2036', '#0b0d17'],
  night: ['#0f1a2e', '#05070e'],
  storm: ['#0c1119', '#030408'],
  frost: ['#16263c', '#060b14'],
  dawn: ['#3a2c3d', '#0f0f18'],
};

interface Face {
  browL: string;
  browR: string;
  mouth: string;
  lookX: number;
  lookY: number;
  tilt: number;
  turn: number;
}

const FACES: Record<Mood, Face> = {
  guarded: { browL: 'M78 106 Q 88 102 98 105', browR: 'M114 105 Q 124 102 134 106', mouth: 'M95 150 Q 106 151 117 149', lookX: 1, lookY: 0, tilt: 0, turn: 0 },
  open: { browL: 'M78 103 Q 88 98 98 102', browR: 'M114 102 Q 124 98 134 103', mouth: 'M94 149 Q 106 154 118 148', lookX: 1, lookY: -0.4, tilt: -1.5, turn: 0 },
  warm: { browL: 'M78 104 Q 88 99 98 103', browR: 'M114 103 Q 124 99 134 104', mouth: 'M92 148 Q 106 157 120 147', lookX: 0.5, lookY: 0, tilt: -2.5, turn: 0 },
  hurt: { browL: 'M78 108 Q 88 104 98 103', browR: 'M114 103 Q 124 104 134 108', mouth: 'M96 152 Q 106 149 116 152', lookX: -2, lookY: 1.6, tilt: 3, turn: -7 },
  cold: { browL: 'M78 107 Q 88 106 98 108', browR: 'M114 108 Q 124 106 134 107', mouth: 'M96 151 L 116 151', lookX: -1, lookY: 0.4, tilt: 0.5, turn: -4 },
};

function BustView({ who, mood, width, height, sky, light, reduced }: { who: 'mira' | 'hollis'; mood: Mood; width: number; height: number; sky: Sky; light: boolean; reduced: boolean }) {
  const breath = useSharedValue(0);
  const blink = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    breath.set(withRepeat(withSequence(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2800, easing: Easing.inOut(Easing.sin) })), -1, false));
    blink.set(withRepeat(withSequence(withDelay(3800, withTiming(1, { duration: 70 })), withTiming(0, { duration: 110 }), withDelay(5200, withTiming(1, { duration: 70 })), withTiming(0, { duration: 110 })), -1, false));
    return () => {
      cancelAnimation(breath);
      cancelAnimation(blink);
    };
  }, [reduced, breath, blink]);
  const k = height / 240;
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: breath.get() * -1.6 * k }] }));
  const lids = useAnimatedStyle(() => ({ opacity: blink.get() }));
  const size = 212 * k;
  const left = (width - size) / 2 + (who === 'mira' ? width * 0.12 : -width * 0.12);
  const [glow, edge] = BACKDROP[sky];
  const f = FACES[mood];
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
        <Defs>
          <RadialGradient id="bust-bg" cx={who === 'mira' ? '62%' : '38%'} cy="46%" r="75%">
            <Stop offset="0" stopColor={glow} stopOpacity={0.96} />
            <Stop offset="1" stopColor={edge} stopOpacity={0.99} />
          </RadialGradient>
          <RadialGradient id="bust-lamp" cx={who === 'mira' ? '82%' : '14%'} cy="82%" r="60%">
            <Stop offset="0" stopColor="#FFD08A" stopOpacity={light ? 0.26 : 0.03} />
            <Stop offset="1" stopColor="#FFD08A" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#bust-bg)" />
        <Rect width={width} height={height} fill="url(#bust-lamp)" />
      </Svg>
      <Animated.View style={[{ position: 'absolute', left, top: 4 * k, width: size, height: 240 * k }, body]}>
        <Svg width={size} height={240 * k} viewBox="0 0 212 240">
          {who === 'mira' ? <Mira f={f} light={light} mood={mood} /> : <Hollis f={f} />}
        </Svg>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: 240 * k }, lids]}>
          <Svg width={size} height={240 * k} viewBox="0 0 212 240">
            <G transform={`rotate(${f.tilt} 106 130) translate(${f.turn} 0)`}>
              <Path d="M80 118 Q 88 113 97 118 Q 88 123 80 118 Z M115 118 Q 124 113 132 118 Q 124 123 115 118 Z" fill={who === 'mira' ? '#8c6246' : '#7d5a44'} />
              <Path d="M80 118 Q 88 122 97 118 M115 118 Q 124 122 132 118" stroke="#2a1a12" strokeWidth={1.2} fill="none" />
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export const Bust = memo(BustView);

function Eyes({ f, tint }: { f: Face; tint: string }) {
  const iris = (cx: number) => <Circle cx={cx + f.lookX} cy={118 + f.lookY} r={3.6} fill={tint} />;
  return (
    <G>
      <Path d="M80 118 Q 88 113 97 118 Q 88 123 80 118 Z M115 118 Q 124 113 132 118 Q 124 123 115 118 Z" fill="#d6c8b8" />
      {iris(88.5)}
      {iris(123.5)}
      <Circle cx={88.5 + f.lookX} cy={118 + f.lookY} r={1.5} fill="#0d0a08" />
      <Circle cx={123.5 + f.lookX} cy={118 + f.lookY} r={1.5} fill="#0d0a08" />
      <Circle cx={90 + f.lookX} cy={116.6 + f.lookY} r={0.7} fill="#ffe7c4" opacity={0.85} />
      <Circle cx={125 + f.lookX} cy={116.6 + f.lookY} r={0.7} fill="#ffe7c4" opacity={0.85} />
      <Path d="M79 118 Q 88 112 98 118 M114 118 Q 124 112 133 118" stroke="#1d120c" strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Mira({ f, light, mood }: { f: Face; light: boolean; mood: Mood }) {
  const showScarf = mood !== 'hurt' && mood !== 'cold';
  return (
    <G>
      <Defs>
        <LinearGradient id="m-skin" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#5a3b2b" />
          <Stop offset="0.5" stopColor="#8f6346" />
          <Stop offset="1" stopColor={light ? '#c9926a' : '#9a7055'} />
        </LinearGradient>
        <LinearGradient id="m-coat" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#141a2a" />
          <Stop offset="1" stopColor="#2a3550" />
        </LinearGradient>
        <LinearGradient id="m-scarf" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#a8682f" />
          <Stop offset="0.6" stopColor="#E2954B" />
          <Stop offset="1" stopColor={light ? '#F7BA74' : '#c98a4a'} />
        </LinearGradient>
        <ClipPath id="m-face">
          <Path d="M72 106 Q 74 80 106 78 Q 138 80 140 106 Q 142 140 124 160 Q 112 170 100 169 Q 86 166 78 152 Q 70 134 72 106 Z" />
        </ClipPath>
      </Defs>
      {/* Coat and shoulders */}
      <Path d="M18 240 Q 22 188 62 172 Q 88 164 106 166 Q 126 164 150 172 Q 190 188 196 240 Z" fill="url(#m-coat)" />
      {/* Satchel strap across the coat */}
      <Path d="M58 176 L 150 240 L 136 240 L 48 182 Z" fill="#33261b" />
      {/* Hood, back */}
      <Path d="M56 142 Q 46 66 106 54 Q 166 66 156 142 Q 152 168 134 178 L 78 178 Q 60 168 56 142 Z" fill="#1a2233" />
      <G transform={`rotate(${f.tilt} 106 130) translate(${f.turn} 0)`}>
        {/* Face */}
        <Path d="M72 106 Q 74 80 106 78 Q 138 80 140 106 Q 142 140 124 160 Q 112 170 100 169 Q 86 166 78 152 Q 70 134 72 106 Z" fill="url(#m-skin)" />
        <G clipPath="url(#m-face)">
          {/* Hood's shadow falling across the forehead, and the dark side of the face. */}
          <Path d="M60 70 L 150 70 L 150 96 Q 106 84 60 108 Z" fill="#000" opacity={0.5} />
          <Path d="M60 88 Q 96 118 92 176 L 60 176 Z" fill="#05060c" opacity={0.46} />
          <Path d="M78 146 Q 106 168 134 148 L 134 176 L 78 176 Z" fill="#000" opacity={0.16} />
        </G>
        {/* Hair at the temple, escaping the hood */}
        <Path d="M74 110 Q 72 88 96 80 Q 82 92 80 112 Z M138 110 Q 140 90 118 80 Q 132 92 134 112 Z" fill="#17100c" />
        <Eyes f={f} tint="#3a2415" />
        <Path d={f.browL} stroke="#17100c" strokeWidth={2.6} strokeLinecap="round" fill="none" />
        <Path d={f.browR} stroke="#17100c" strokeWidth={2.6} strokeLinecap="round" fill="none" />
        {/* Nose: only the lit edge */}
        <Path d="M108 120 Q 112 132 110 138 Q 106 141 102 139" stroke="#5d3c2a" strokeWidth={1.2} fill="none" strokeLinecap="round" />
        <Path d={f.mouth} stroke="#46261c" strokeWidth={2} strokeLinecap="round" fill="none" />
      </G>
      {/* Hood, front edge */}
      <Path d="M62 148 Q 54 74 106 64 Q 158 74 150 148 Q 148 130 142 106 Q 136 78 106 74 Q 76 78 70 106 Q 64 130 62 148 Z" fill="#29344b" />
      <Path d="M150 148 Q 158 74 106 64" stroke={light ? '#FFD08A' : '#5d7aa3'} strokeOpacity={0.55} strokeWidth={1.1} fill="none" />
      {/* Scarf: high when she's guarded, slipped when she's let you nearer, tucked away when she's turned from you. */}
      {showScarf ? (
        <G>
          {/* Loose end, falling over the strap */}
          <Path d="M128 182 Q 142 198 136 232 L 118 234 Q 122 206 112 190 Z" fill="url(#m-scarf)" />
          <Path d="M124 196 Q 130 212 127 232" stroke="#8d5526" strokeWidth={1.1} fill="none" />
          {/* Winds round the neck */}
          <Path d={mood === 'open' || mood === 'warm' ? 'M68 172 Q 106 190 144 172 Q 154 186 146 198 Q 106 218 66 198 Q 58 186 68 172 Z' : 'M70 160 Q 106 180 142 160 Q 154 178 146 196 Q 106 216 66 196 Q 58 178 70 160 Z'} fill="url(#m-scarf)" />
          <Path d="M64 182 Q 106 204 148 182" stroke="#8d5526" strokeWidth={1.3} fill="none" opacity={0.8} />
          <Path d="M70 170 Q 106 190 142 170" stroke="#f8c78d" strokeWidth={1} fill="none" opacity={0.55} />
        </G>
      ) : (
        <G>
          <Path d="M70 176 Q 106 190 142 176 Q 148 186 142 194 Q 106 208 70 194 Q 64 186 70 176 Z" fill="#7d5128" />
          <Path d="M68 186 Q 106 202 144 186" stroke="#5c3a1b" strokeWidth={1.1} fill="none" />
        </G>
      )}
    </G>
  );
}

function Hollis({ f }: { f: Face }) {
  return (
    <G>
      <Defs>
        <LinearGradient id="h-skin" x1="1" y1="0" x2="0" y2="0">
          <Stop offset="0" stopColor="#5e4332" />
          <Stop offset="0.55" stopColor="#8e6a50" />
          <Stop offset="1" stopColor="#c2926c" />
        </LinearGradient>
      </Defs>
      {/* Wool coat */}
      <Path d="M16 240 Q 20 192 66 176 L 146 176 Q 192 192 196 240 Z" fill="#232b24" />
      <Path d="M86 176 L 106 214 L 126 176" stroke="#39453a" strokeWidth={3} fill="none" />
      <G transform={`rotate(${f.tilt - 1} 106 130)`}>
        {/* Face */}
        <Path d="M72 104 Q 74 80 106 78 Q 138 80 140 104 Q 142 136 128 160 Q 106 176 84 160 Q 70 136 72 104 Z" fill="url(#h-skin)" />
        {/* Lines of a long time outdoors */}
        <Path d="M84 96 Q 106 92 128 96 M86 102 Q 106 98 126 102 M76 124 Q 80 128 78 134 M136 124 Q 132 128 134 134" stroke="#4d3526" strokeWidth={0.9} fill="none" />
        <Eyes f={{ ...f, lookX: -1 }} tint="#47525a" />
        <Path d={f.browL} stroke="#a9a9a4" strokeWidth={3.4} strokeLinecap="round" fill="none" />
        <Path d={f.browR} stroke="#a9a9a4" strokeWidth={3.4} strokeLinecap="round" fill="none" />
        <Path d="M104 120 Q 100 134 102 139 Q 106 142 111 140" stroke="#5a3e2d" strokeWidth={1.3} fill="none" strokeLinecap="round" />
        {/* Beard */}
        <Path d="M74 128 Q 76 150 84 164 Q 106 188 128 164 Q 136 150 138 128 Q 130 144 118 144 Q 106 140 94 144 Q 82 144 74 128 Z" fill="#b9b8b2" />
        <Path d="M96 151 Q 106 154 116 151" stroke="#5c4a3e" strokeWidth={1.8} strokeLinecap="round" fill="none" />
        {/* Wool cap */}
        <Path d="M68 96 Q 68 50 106 48 Q 144 50 144 96 Q 106 82 68 96 Z" fill="#3e4c3a" />
        <Path d="M67 96 Q 106 80 145 96 L 145 86 Q 106 70 67 86 Z" fill="#55674f" />
        <Ellipse cx={106} cy={46} rx={7} ry={5} fill="#55674f" />
      </G>
    </G>
  );
}
