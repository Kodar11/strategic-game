import { Image } from 'expo-image';
import { useEffect, useId } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useMotionReduced } from '@/src/utils/feedback';
import { palette } from '@/src/theme/tokens';
import { CAST, type CharacterId, type CharacterSpec, type Expression } from './cast';

export interface PortraitProps {
  character: CharacterId;
  expression?: Expression;
  size?: number;
  /** Ring colour; defaults to none. */
  ring?: string;
  mirrored?: boolean;
}

/**
 * Illustrated character portrait. Uses approved artwork from the cast manifest when present,
 * otherwise a consistent vector rendering of the character spec with cinematic blue/orange rim light.
 * A small spring reaction plays whenever the expression changes.
 */
export function Portrait({ character, expression = 'neutral', size = 56, ring, mirrored }: PortraitProps) {
  const spec = CAST[character];
  const reduced = useMotionReduced();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    scale.set(withSequence(withTiming(1.06, { duration: 120 }), withSpring(1, { damping: 12, stiffness: 220 })));
  }, [expression, reduced, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const image = spec.images?.[expression] ?? spec.images?.neutral;

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${spec.name}, ${expression}`}
      style={[
        { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' },
        ring ? { borderWidth: 2, borderColor: ring } : null,
        animated,
      ]}>
      {image ? (
        <Image source={image} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
      ) : (
        <View style={mirrored ? { transform: [{ scaleX: -1 }] } : undefined}>
          <VectorPortrait spec={spec} expression={expression} size={ring ? size - 4 : size} />
        </View>
      )}
    </Animated.View>
  );
}

type Eye = 'open' | 'wide' | 'narrow' | 'soft';
type Mouth = 'smile' | 'grin' | 'flat' | 'o' | 'frown' | 'smirk' | 'talk' | 'wavy';
interface Face {
  /** Brow offsets in px: [leftOuter, leftInner, rightInner, rightOuter]; negative = raised. */
  brows: [number, number, number, number];
  eyes: Eye;
  mouth: Mouth;
  /** Pupils' horizontal look offset. */
  look?: number;
}

const FACES: Record<Expression, Face> = {
  neutral: { brows: [0, 0, 0, 0], eyes: 'open', mouth: 'flat' },
  curious: { brows: [-2, -3, -1, 0], eyes: 'open', mouth: 'smile', look: 1 },
  thinking: { brows: [0, 1, -3, -3], eyes: 'open', mouth: 'smirk', look: 1.5 },
  surprised: { brows: [-4, -4, -4, -4], eyes: 'wide', mouth: 'o' },
  happy: { brows: [-1, -1, -1, -1], eyes: 'soft', mouth: 'grin' },
  confused: { brows: [-3, 0, 2, 0], eyes: 'open', mouth: 'wavy', look: -1 },
  confident: { brows: [0, 1, 1, 0], eyes: 'narrow', mouth: 'smirk' },
  frustrated: { brows: [-1, 3, 3, -1], eyes: 'narrow', mouth: 'frown' },
  concerned: { brows: [1, -3, -3, 1], eyes: 'open', mouth: 'frown' },
  skeptical: { brows: [1, 2, -3, -4], eyes: 'narrow', mouth: 'flat', look: -1 },
  explaining: { brows: [-2, -2, -2, -2], eyes: 'open', mouth: 'talk' },
  satisfied: { brows: [0, 0, 0, 0], eyes: 'soft', mouth: 'smile' },
};

function VectorPortrait({ spec, expression, size }: { spec: CharacterSpec; expression: Expression; size: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (n: string) => `${n}${uid}`;
  const face = FACES[expression];
  const ink = '#1A0F0C';

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <RadialGradient id={id('bg')} cx="35%" cy="25%" r="85%">
          <Stop offset="0" stopColor="#1B3B5E" />
          <Stop offset="1" stopColor={palette.deepNavy} />
        </RadialGradient>
        <LinearGradient id={id('skin')} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={spec.skin} />
          <Stop offset="1" stopColor={spec.skinShade} />
        </LinearGradient>
        <LinearGradient id={id('cloth')} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={spec.clothing} />
          <Stop offset="1" stopColor={spec.clothingShade} />
        </LinearGradient>
        <ClipPath id={id('clip')}>
          <Circle cx="60" cy="60" r="60" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id('clip')})`}>
        <Rect width="120" height="120" fill={`url(#${id('bg')})`} />
        <Circle cx="96" cy="100" r="44" fill={palette.orange} opacity={0.1} />

        <HairBack spec={spec} />

        {/* Neck and shoulders */}
        <Path d="M51 70 L69 70 L70 88 L50 88 Z" fill={spec.skinShade} />
        <Path d="M10 124 C12 98 32 87 48 84 L72 84 C88 87 108 98 110 124 Z" fill={`url(#${id('cloth')})`} />
        <Outfit spec={spec} />
        {/* Blue key light on the left shoulder, orange rim on the right */}
        <Path d="M14 112 C18 98 30 90 44 86" stroke={palette.blue} strokeWidth={2} opacity={0.7} fill="none" strokeLinecap="round" />
        <Path d="M78 86 C92 90 102 98 106 110" stroke={palette.orange} strokeWidth={2} opacity={0.65} fill="none" strokeLinecap="round" />

        {/* Head */}
        <Ellipse cx="39.5" cy="57" rx="3.5" ry="5" fill={spec.skin} />
        <Ellipse cx="80.5" cy="57" rx="3.5" ry="5" fill={spec.skinShade} />
        <Ellipse cx="60" cy="54" rx="21" ry="25" fill={`url(#${id('skin')})`} />
        <Path d="M75 36 C83 45 84 63 74 76" stroke={palette.orange} strokeWidth={1.6} opacity={0.6} fill="none" strokeLinecap="round" />

        {spec.beard ? (
          <Path d="M40 56 C41 74 49 81 60 81 C71 81 79 74 80 56 C77 64 73 69 67 70 C63 66 57 66 53 70 C47 69 43 64 40 56 Z" fill={spec.hair} opacity={0.92} />
        ) : null}

        {/* Brows */}
        <Path
          d={`M46 ${48 + face.brows[0]} Q50 ${46 + (face.brows[0] + face.brows[1]) / 2} 55 ${48 + face.brows[1]}`}
          stroke={spec.hairStyle === 'receding' ? '#8D9199' : ink}
          strokeWidth={2.2}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d={`M65 ${48 + face.brows[2]} Q70 ${46 + (face.brows[2] + face.brows[3]) / 2} 74 ${48 + face.brows[3]}`}
          stroke={spec.hairStyle === 'receding' ? '#8D9199' : ink}
          strokeWidth={2.2}
          strokeLinecap="round"
          fill="none"
        />

        <Eyes kind={face.eyes} look={face.look ?? 0} ink={ink} />

        {/* Nose */}
        <Path d="M60 57 Q58 63 61 64" stroke={spec.skinShade} strokeWidth={1.6} fill="none" strokeLinecap="round" />

        <MouthShape kind={face.mouth} />

        {spec.glasses ? (
          <G stroke="#0E1116" strokeWidth={1.6} fill="rgba(255,255,255,0.06)">
            <Rect x="43.5" y="50.5" width="14" height="10" rx="3.5" />
            <Rect x="62.5" y="50.5" width="14" height="10" rx="3.5" />
            <Path d="M57.5 54 Q60 52.5 62.5 54" fill="none" />
          </G>
        ) : null}

        <HairFront spec={spec} />
      </G>
    </Svg>
  );
}

function Eyes({ kind, look, ink }: { kind: Eye; look: number; ink: string }) {
  if (kind === 'soft') {
    return (
      <G stroke={ink} strokeWidth={2} fill="none" strokeLinecap="round">
        <Path d="M47.5 56.5 Q50.5 53.5 53.5 56.5" />
        <Path d="M66.5 56.5 Q69.5 53.5 72.5 56.5" />
      </G>
    );
  }
  const ry = kind === 'wide' ? 3.6 : kind === 'narrow' ? 1.6 : 2.8;
  const rx = kind === 'wide' ? 3 : 2.5;
  return (
    <G>
      <Ellipse cx={50.5 + look} cy="55.5" rx={rx} ry={ry} fill={ink} />
      <Ellipse cx={69.5 + look} cy="55.5" rx={rx} ry={ry} fill={ink} />
      {kind !== 'narrow' ? (
        <G fill="#fff" opacity={0.85}>
          <Circle cx={51.4 + look} cy="54.3" r="0.8" />
          <Circle cx={70.4 + look} cy="54.3" r="0.8" />
        </G>
      ) : null}
    </G>
  );
}

function MouthShape({ kind }: { kind: Mouth }) {
  const lip = '#6B2E2A';
  switch (kind) {
    case 'smile':
      return <Path d="M53.5 67 Q60 72 66.5 67" stroke={lip} strokeWidth={2} fill="none" strokeLinecap="round" />;
    case 'grin':
      return (
        <G>
          <Path d="M52.5 66 Q60 76 67.5 66 Z" fill={lip} />
          <Path d="M54 66.4 L66 66.4 Q65 68.5 60 68.5 Q55 68.5 54 66.4 Z" fill="#F4EDE6" />
        </G>
      );
    case 'flat':
      return <Path d="M55 68.5 Q60 69.3 65 68.5" stroke={lip} strokeWidth={2} fill="none" strokeLinecap="round" />;
    case 'o':
      return <Ellipse cx="60" cy="69.5" rx="3" ry="3.8" fill={lip} />;
    case 'frown':
      return <Path d="M54.5 70.5 Q60 66 65.5 70.5" stroke={lip} strokeWidth={2} fill="none" strokeLinecap="round" />;
    case 'smirk':
      return <Path d="M54.5 68.5 Q61 70.5 66.5 66" stroke={lip} strokeWidth={2} fill="none" strokeLinecap="round" />;
    case 'talk':
      return <Path d="M54.5 67 Q60 73.5 65.5 67 Q60 68.8 54.5 67 Z" fill={lip} />;
    case 'wavy':
      return <Path d="M54 69 Q57 66.5 60 69 Q63 71.5 66 68.5" stroke={lip} strokeWidth={2} fill="none" strokeLinecap="round" />;
  }
}

function HairBack({ spec }: { spec: CharacterSpec }) {
  const c = spec.hair;
  switch (spec.hairStyle) {
    case 'long':
      return <Path d="M36 50 C34 27 48 19 60 19 C73 19 87 27 84 50 L89 94 C80 100 71 97 67 90 L53 90 C49 97 40 100 31 94 Z" fill={c} />;
    case 'longSide':
      return <Path d="M36 50 C34 27 48 19 61 19 C74 19 87 28 84 52 C86 66 90 80 92 96 C84 101 74 98 69 90 L52 90 C47 97 39 99 31 94 C33 80 35 66 36 50 Z" fill={c} />;
    case 'bob':
      return <Path d="M36 50 C34 28 48 21 60 21 C73 21 86 28 84 50 L85 75 C79 79 73 77 70 72 L50 72 C47 77 41 79 35 75 Z" fill={c} />;
    case 'bun':
      return (
        <G fill={c}>
          <Circle cx="60" cy="22" r="9.5" />
          <Path d="M38 52 C36 30 48 25 60 25 C72 25 84 30 82 52 L80 44 C77 35 70 31 60 31 C50 31 43 35 40 44 Z" />
        </G>
      );
    default:
      return null;
  }
}

function HairFront({ spec }: { spec: CharacterSpec }) {
  const c = spec.hair;
  switch (spec.hairStyle) {
    case 'tousled':
      return (
        <G fill={c}>
          <Path d="M38.5 50 C37 30 50 22 62 23 C75 24 85 32 81.5 50 C79 43 76 39 72 37 L70 42 L65 35.5 L60 41 L55.5 35.5 L50 42 L47 38.5 C43 41 40 45 38.5 50 Z" />
          <Path d="M58 23 C62 18 70 18 72 22 C68 21 63 22 58 23 Z" />
        </G>
      );
    case 'long':
      return <Path d="M39 50 C38 31 48 25 60 25 C72 25 82 31 81 50 C78 40 71 33 62 31.5 C60.5 31.5 59.5 31.5 58 31.5 C49 33 42 40 39 50 Z" fill={c} />;
    case 'longSide':
      return <Path d="M39 52 C37 31 49 24 61 24 C73 24 83 31 81 48 C76 38 68 32 54 33 C48 36 42 43 39 52 Z" fill={c} />;
    case 'short':
      return <Path d="M39 46 C39 30 50 24.5 61 24.5 C72 24.5 81 30 81 46 C78 39 72 34.5 64 34 C58 33 51 34 46 37 C43 39 40.5 42 39 46 Z" fill={c} />;
    case 'bun':
      return <Path d="M39 50 C38 33 48 27 60 27 C72 27 82 33 81 50 C77 40 69 34 56 35 C49 37 43 42 39 50 Z" fill={c} />;
    case 'receding':
      return (
        <G fill={c}>
          <Path d="M38.5 58 C37 46 39.5 40 44.5 36.5 L46 51 C43 52 40.5 54.5 38.5 58 Z" />
          <Path d="M81.5 58 C83 46 80.5 40 75.5 36.5 L74 51 C77 52 79.5 54.5 81.5 58 Z" />
          <Path d="M46 34 C52 29.5 68 29.5 74 34 C68 32.5 52 32.5 46 34 Z" opacity={0.85} />
        </G>
      );
    case 'bob':
      return <Path d="M39 47 C39 30 50 25 60 25 C71 25 81 30 81 47 L78.5 45 C70 42 50 42 41.5 45 Z" fill={c} />;
  }
}

function Outfit({ spec }: { spec: CharacterSpec }) {
  switch (spec.outfit) {
    case 'hoodie':
      return (
        <G>
          <Path d="M40 86 C44 98 76 98 80 86 C73 91 47 91 40 86 Z" fill="#3B82F6" />
          <Path d="M54 92 L53 106 M66 92 L67 106" stroke="#DBEAFE" strokeWidth={1.4} strokeLinecap="round" />
        </G>
      );
    case 'jacket':
    case 'blazer':
      return (
        <G>
          <Path d="M50 84 L60 104 L70 84 Z" fill={spec.outfit === 'blazer' ? '#E2E8F0' : '#1F2937'} />
          <Path d="M48 84 L60 106 L52 120 L40 92 Z" fill={spec.clothingShade} />
          <Path d="M72 84 L60 106 L68 120 L80 92 Z" fill={spec.clothingShade} />
        </G>
      );
    case 'sweater':
      return <Path d="M49 84 C52 91 68 91 71 84 C66 87 54 87 49 84 Z" fill="#3A4050" />;
    case 'cardigan':
      return (
        <G>
          <Path d="M50 84 C54 92 66 92 70 84 L66 120 L54 120 Z" fill="#F1E4D3" />
          <Path d="M60 92 L60 120" stroke={spec.clothingShade} strokeWidth={1.2} />
        </G>
      );
    case 'shirt':
      return (
        <G>
          <Path d="M49 84 L58 94 L54 98 L46 88 Z M71 84 L62 94 L66 98 L74 88 Z" fill={spec.clothingShade} />
          <Path d="M60 94 L60 120" stroke={spec.clothingShade} strokeWidth={1.2} />
        </G>
      );
    case 'blouse':
      return <Path d="M50 84 Q60 98 70 84 Q60 92 50 84 Z" fill={spec.clothingShade} />;
    case 'top':
      return <Path d="M50 84 C53 90 67 90 70 84 C65 87 55 87 50 84 Z" fill={spec.clothingShade} />;
  }
}
