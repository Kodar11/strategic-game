import { useId } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { SceneId } from '@/src/content/lessons';
import { palette } from '@/src/theme/tokens';

/**
 * Lesson scene illustrations (vector). These are environment plates only — all labels, numbers and
 * choices are rendered as native text on top. Replace with approved raster scenes via docs/ASSETS.md.
 */
export function SceneArt({ scene, height = 160, style }: { scene: SceneId; height?: number; style?: StyleProp<ViewStyle> }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (n: string) => `${n}${uid}`;
  return (
    <View style={[{ height, overflow: 'hidden' }, style]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0B1F38" />
            <Stop offset="1" stopColor={palette.deepNavy} />
          </LinearGradient>
          <RadialGradient id={id('glowB')} cx="20%" cy="10%" r="70%">
            <Stop offset="0" stopColor={palette.blue} stopOpacity={0.35} />
            <Stop offset="1" stopColor={palette.blue} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={id('glowO')} cx="85%" cy="90%" r="60%">
            <Stop offset="0" stopColor={palette.orange} stopOpacity={0.3} />
            <Stop offset="1" stopColor={palette.orange} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="360" height="180" fill={`url(#${id('sky')})`} />
        <Rect width="360" height="180" fill={`url(#${id('glowB')})`} />
        <Rect width="360" height="180" fill={`url(#${id('glowO')})`} />
        {scene === 'market' && <Market />}
        {scene === 'crowd' && <Crowd />}
        {scene === 'meetup' && <Meetup />}
        {scene === 'shootout' && <Shootout />}
        {scene === 'policy' && <Policy />}
      </Svg>
    </View>
  );
}

const far = '#10243D';
const mid = '#132E4D';
const near = '#0A1A2E';

function Skyline() {
  return (
    <G>
      <Path d="M0 120 L0 78 L18 78 L18 64 L34 64 L34 86 L52 86 L52 52 L70 52 L70 92 L92 92 L92 70 L110 70 L110 98 L128 98 L128 60 L150 60 L150 100 L360 100 L360 120 Z" fill={far} />
      <Path d="M200 100 L200 58 L222 58 L222 44 L240 44 L240 90 L262 90 L262 66 L286 66 L286 84 L306 84 L306 50 L328 50 L328 92 L360 92 L360 120 L200 120 Z" fill={far} />
      <G fill={palette.amber} opacity={0.35}>
        <Rect x="56" y="60" width="3" height="4" />
        <Rect x="63" y="70" width="3" height="4" />
        <Rect x="132" y="68" width="3" height="4" />
        <Rect x="226" y="52" width="3" height="4" />
        <Rect x="310" y="58" width="3" height="4" />
        <Rect x="318" y="72" width="3" height="4" />
      </G>
    </G>
  );
}

function Market() {
  return (
    <G>
      <Skyline />
      {/* Street */}
      <Rect x="0" y="146" width="360" height="34" fill={near} />
      <Path d="M0 160 L360 156" stroke={palette.blue} strokeWidth={1.5} opacity={0.5} />
      <Path d="M40 170 L200 164" stroke={palette.orange} strokeWidth={1.5} opacity={0.45} />
      {/* QuickEats storefront (blue) */}
      <Rect x="28" y="92" width="120" height="56" rx="4" fill={mid} />
      <Path d="M24 92 L152 92 L146 104 L30 104 Z" fill={palette.blue} />
      <Rect x="40" y="110" width="44" height="30" rx="2" fill="#1E3A8A" opacity={0.85} />
      <Rect x="92" y="110" width="44" height="38" rx="2" fill="#0B2547" />
      <Rect x="42" y="112" width="40" height="26" fill={palette.blue} opacity={0.25} />
      {/* FoodKart storefront (orange) */}
      <Rect x="212" y="92" width="120" height="56" rx="4" fill={mid} />
      <Path d="M208 92 L336 92 L330 104 L214 104 Z" fill={palette.orange} />
      <Rect x="224" y="110" width="44" height="38" rx="2" fill="#2A1A10" />
      <Rect x="276" y="110" width="44" height="30" rx="2" fill="#7C2D12" opacity={0.85} />
      <Rect x="278" y="112" width="40" height="26" fill={palette.orange} opacity={0.22} />
      {/* Delivery scooters */}
      <Scooter x={160} y={150} color={palette.blue} />
      <Scooter x={188} y={156} color={palette.orange} flip />
    </G>
  );
}

function Scooter({ x, y, color, flip }: { x: number; y: number; color: string; flip?: boolean }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <Circle cx="-8" cy="6" r="4" fill="#020617" stroke={palette.slate} strokeWidth={1} />
      <Circle cx="10" cy="6" r="4" fill="#020617" stroke={palette.slate} strokeWidth={1} />
      <Path d="M-8 4 L4 4 L8 -6 L12 -6" stroke={palette.slate} strokeWidth={2} fill="none" />
      <Rect x="-12" y="-10" width="11" height="10" rx="2" fill={color} />
    </G>
  );
}

function Crowd() {
  const heads = [
    [40, 140, 14],
    [78, 132, 15],
    [118, 142, 13],
    [158, 128, 16],
    [200, 140, 14],
    [240, 130, 15],
    [280, 142, 13],
    [318, 134, 15],
  ];
  const bubbles = [
    [60, 70, 'blue'],
    [130, 58, 'cyan'],
    [190, 76, 'blue'],
    [252, 56, 'orange'],
    [300, 82, 'cyan'],
  ] as const;
  return (
    <G>
      {/* Number line */}
      <Line x1="30" y1="104" x2="330" y2="104" stroke={palette.slate} strokeWidth={1} opacity={0.4} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Line key={i} x1={30 + i * 50} y1="100" x2={30 + i * 50} y2="108" stroke={palette.slate} opacity={0.4} />
      ))}
      <Path d="M150 104 L150 30" stroke={palette.amber} strokeWidth={1.5} strokeDasharray="3 4" opacity={0.8} />
      <Circle cx="150" cy="104" r="5" fill={palette.amber} />
      {bubbles.map(([x, y, c], i) => (
        <G key={i}>
          <Circle cx={x} cy={y} r="11" fill={c === 'blue' ? palette.blue : c === 'cyan' ? palette.cyan : palette.orange} opacity={0.22} />
          <Circle cx={x} cy={y} r="5" fill={c === 'blue' ? palette.blue : c === 'cyan' ? palette.cyan : palette.orange} />
        </G>
      ))}
      {heads.map(([x, y, r], i) => (
        <G key={i}>
          <Ellipse cx={x} cy={y + r + 18} rx={r * 1.5} ry={r} fill={mid} />
          <Circle cx={x} cy={y} r={r * 0.75} fill={i === 3 ? '#1E3A8A' : '#183456'} />
        </G>
      ))}
      {/* Magnifier */}
      <G transform="translate(300 38)">
        <Circle cx="0" cy="0" r="16" fill="none" stroke={palette.light} strokeWidth={3} opacity={0.8} />
        <Line x1="11" y1="11" x2="24" y2="24" stroke={palette.light} strokeWidth={4} strokeLinecap="round" opacity={0.8} />
      </G>
    </G>
  );
}

function Meetup() {
  return (
    <G>
      <Circle cx="300" cy="34" r="14" fill={palette.amber} opacity={0.8} />
      <Circle cx="306" cy="30" r="12" fill="#0B1F38" />
      {/* Clocktower */}
      <Rect x="58" y="40" width="36" height="120" fill={mid} />
      <Path d="M52 40 L76 12 L100 40 Z" fill={far} />
      <Circle cx="76" cy="62" r="11" fill={palette.amber} opacity={0.9} />
      <Path d="M76 62 L76 55 M76 62 L81 64" stroke={near} strokeWidth={2} strokeLinecap="round" />
      <Rect x="20" y="110" width="40" height="50" rx="2" fill={far} />
      <Rect x="26" y="120" width="10" height="12" fill={palette.amber} opacity={0.5} />
      <Rect x="44" y="120" width="10" height="12" fill={palette.amber} opacity={0.5} />
      <Rect x="94" y="118" width="30" height="42" fill={far} />
      {/* River */}
      <Path d="M150 160 C200 140 260 150 360 132 L360 180 L130 180 Z" fill="#0E3354" />
      <Path d="M170 164 C210 150 260 156 340 144" stroke={palette.cyan} strokeWidth={1} opacity={0.4} fill="none" />
      {/* Park trees */}
      {[
        [210, 118, 20],
        [248, 108, 26],
        [292, 116, 22],
        [330, 104, 24],
      ].map(([x, y, r], i) => (
        <G key={i}>
          <Rect x={x - 2} y={y + r - 6} width="4" height="22" fill="#0A1626" />
          <Circle cx={x} cy={y} r={r} fill={i % 2 ? '#123A3A' : '#0F3030'} />
        </G>
      ))}
      <Rect x="0" y="160" width="140" height="20" fill={near} />
      {/* Two figures, far apart */}
      <Figure x={118} y={150} color={palette.blue} />
      <Figure x={228} y={146} color={palette.orange} />
    </G>
  );
}

function Figure({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <G>
      <Circle cx={x} cy={y - 22} r="5" fill="#1F2937" />
      <Path d={`M${x - 6} ${y} L${x - 5} ${y - 15} Q${x} ${y - 18} ${x + 5} ${y - 15} L${x + 6} ${y} Z`} fill={color} />
    </G>
  );
}

function Shootout() {
  const netX = (i: number) => 90 + i * 18;
  return (
    <G>
      {/* Stadium lights */}
      <G opacity={0.9}>
        <Rect x="20" y="16" width="26" height="8" rx="2" fill={palette.light} opacity={0.7} />
        <Rect x="314" y="16" width="26" height="8" rx="2" fill={palette.light} opacity={0.7} />
      </G>
      <Path d="M0 60 L360 60 L360 110 L0 110 Z" fill={far} />
      {/* Pitch */}
      <Path d="M0 120 L360 120 L360 180 L0 180 Z" fill="#0D2B26" />
      <Path d="M0 120 L360 120" stroke="#E2E8F0" strokeWidth={1.5} opacity={0.5} />
      {/* Goal */}
      <G stroke={palette.light} opacity={0.9}>
        <Path d="M86 120 L86 50 L274 50 L274 120" strokeWidth={4} fill="none" />
        {Array.from({ length: 11 }, (_, i) => (
          <Line key={`v${i}`} x1={netX(i)} y1="52" x2={netX(i)} y2="120" strokeWidth={0.6} opacity={0.35} />
        ))}
        {Array.from({ length: 4 }, (_, i) => (
          <Line key={`h${i}`} x1="88" y1={66 + i * 16} x2="272" y2={66 + i * 16} strokeWidth={0.6} opacity={0.35} />
        ))}
      </G>
      {/* Keeper silhouette */}
      <G>
        <Circle cx="180" cy="80" r="7" fill="#1F2937" />
        <Path d="M168 118 L172 90 Q180 86 188 90 L192 118 Z" fill={palette.orange} />
        <Path d="M172 92 L156 80 M188 92 L204 80" stroke={palette.orange} strokeWidth={5} strokeLinecap="round" />
      </G>
      {/* Arrows: left / right */}
      <Path d="M150 150 Q120 140 104 96" stroke={palette.blue} strokeWidth={2} strokeDasharray="4 4" fill="none" />
      <Path d="M210 150 Q240 140 256 96" stroke={palette.blue} strokeWidth={2} strokeDasharray="4 4" fill="none" opacity={0.6} />
      <Circle cx="180" cy="156" r="8" fill="#F8FAFC" />
      <Path d="M176 152 L184 152 L186 158 L180 162 L174 158 Z" fill="#0F172A" opacity={0.5} />
    </G>
  );
}

function Policy() {
  return (
    <G>
      <Skyline />
      <Rect x="0" y="150" width="360" height="30" fill={near} />
      {/* Balance */}
      <Rect x="176" y="40" width="8" height="100" fill={palette.slate} opacity={0.8} />
      <Path d="M150 150 L210 150 L196 138 L164 138 Z" fill={palette.slate} opacity={0.8} />
      <G transform="rotate(-8 180 44)">
        <Rect x="90" y="41" width="180" height="6" rx="3" fill={palette.light} />
        <Line x1="100" y1="46" x2="86" y2="92" stroke={palette.light} strokeWidth={1.2} />
        <Line x1="100" y1="46" x2="114" y2="92" stroke={palette.light} strokeWidth={1.2} />
        <Path d="M80 92 L120 92 Q100 106 80 92 Z" fill={palette.blue} />
        <Line x1="260" y1="46" x2="246" y2="92" stroke={palette.light} strokeWidth={1.2} />
        <Line x1="260" y1="46" x2="274" y2="92" stroke={palette.light} strokeWidth={1.2} />
        <Path d="M240 92 L280 92 Q260 106 240 92 Z" fill={palette.orange} />
      </G>
      <Circle cx="180" cy="40" r="7" fill={palette.amber} />
    </G>
  );
}
