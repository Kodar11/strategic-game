import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { Coins, Hand, HandFist, Handshake, Rabbit, Scale, Scissors, Swords } from '@/src/components/ui/icons';
import type { GameId } from '@/src/games/core';
import { colors, radius } from '@/src/theme/tokens';

/** Each game's accent, from the existing semantic palette. */
export const GAME_TINT: Record<GameId, { fg: string; bg: string }> = {
  rps: { fg: colors.primaryText, bg: colors.primarySoft },
  'two-thirds': { fg: colors.accent, bg: colors.accentSoft },
  'split-steal': { fg: colors.rivalText, bg: colors.rivalSoft },
  ultimatum: { fg: colors.insight, bg: colors.insightSoft },
  'stag-hunt': { fg: colors.success, bg: colors.successSoft },
};

/** A stag's antlers — the one symbol Lucide doesn't have. */
export function Antlers({ size = 24, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 21v-6" />
      <Path d="M9 13c-3-1-5-4-5-8M4 9l-2-2M5 6V3M7 8l1-3" />
      <Path d="M15 13c3-1 5-4 5-8M20 9l2-2M19 6V3M17 8l-1-3" />
      <Path d="M9 13a3 3 0 0 0 6 0" />
    </Svg>
  );
}

/** A compact emblem for cards and headers. Decorative: hidden from screen readers. */
export function GameArt({ game, size = 64 }: { game: GameId; size?: number }) {
  const t = GAME_TINT[game];
  const icon = Math.round(size * 0.34);
  return (
    <View
      style={{ width: size, height: size, borderRadius: radius.lg, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {game === 'rps' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: icon * 2.1, justifyContent: 'center', gap: 2 }}>
          <HandFist size={icon} color={t.fg} strokeWidth={2} />
          <Hand size={icon} color={t.fg} strokeWidth={2} />
          <Scissors size={icon} color={t.fg} strokeWidth={2} />
        </View>
      ) : game === 'two-thirds' ? (
        <Svg width={size * 0.8} height={size * 0.5} viewBox="0 0 80 40">
          <Line x1={4} y1={28} x2={76} y2={28} stroke={t.fg} strokeOpacity={0.5} strokeWidth={2} />
          {[12, 20, 26, 31, 44, 58].map((x, i) => (
            <Circle key={i} cx={x} cy={28} r={3.5} fill={t.fg} fillOpacity={0.55} />
          ))}
          <Rect x={23} y={8} width={3} height={26} rx={1.5} fill={colors.insight} />
          <Circle cx={24.5} cy={8} r={4} fill={colors.insight} />
        </Svg>
      ) : game === 'split-steal' ? (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Handshake size={icon} color={colors.primaryText} strokeWidth={2} />
          <Swords size={icon} color={t.fg} strokeWidth={2} />
        </View>
      ) : game === 'ultimatum' ? (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Coins size={icon} color={t.fg} strokeWidth={2} />
          <Scale size={icon} color={t.fg} strokeWidth={2} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Antlers size={icon} color={t.fg} />
          <Rabbit size={icon} color={colors.textBody} strokeWidth={2} />
        </View>
      )}
    </View>
  );
}
