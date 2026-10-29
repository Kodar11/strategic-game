import type { ReactElement } from 'react';
import { Circle, Line, Path, Rect } from 'react-native-svg';

import type { LibraryId } from '@/src/arena/catalog-library';
import { colors } from '@/src/theme/tokens';

/** A 48×48 emblem per library game, drawn from the brand palette (rendered inside ArenaArt's Svg). */
export const LIBRARY_ART: Record<LibraryId, ReactElement> = {
  mole: (
    <>
      {[0, 1, 2, 3].map((i) => (
        <Circle key={i} cx={9 + i * 10} cy={30} r={4.5} fill={i === 2 ? colors.rival : colors.surfaceHigh} stroke={colors.textMuted} strokeWidth={1} />
      ))}
      <Circle cx={30} cy={16} r={8} fill="none" stroke={colors.insight} strokeWidth={2.5} />
      <Line x1={36} y1={22} x2={42} y2={28} stroke={colors.insight} strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  commons: (
    <>
      <Path d="M4 28c6-4 10 4 16 0s10-4 16 0 6 2 8 0v14H4z" fill={colors.accent} fillOpacity={0.35} />
      <Path d="M4 28c6-4 10 4 16 0s10-4 16 0 6 2 8 0" stroke={colors.accent} strokeWidth={2} fill="none" />
      <Path d="M14 36l6-3-6-3v6zM20 33c3-3 8-3 10 0-2 3-7 3-10 0z" fill={colors.text} />
      <Path d="M30 12h12l-2 6H32z" fill={colors.rival} />
      <Line x1={36} y1={4} x2={36} y2={12} stroke={colors.textMuted} strokeWidth={2} />
    </>
  ),
  coalition: (
    <>
      <Circle cx={24} cy={24} r={16} fill="none" stroke={colors.border} strokeWidth={8} />
      <Path d="M24 8a16 16 0 0 1 15.2 11" stroke={colors.primary} strokeWidth={8} fill="none" />
      <Path d="M39.2 19A16 16 0 0 1 30 39" stroke={colors.insight} strokeWidth={8} fill="none" />
      <Path d="M30 39a16 16 0 0 1-14 0" stroke={colors.rival} strokeWidth={8} fill="none" />
      <Circle cx={24} cy={24} r={5} fill={colors.text} />
    </>
  ),
  inspector: (
    <>
      <Rect x={10} y={6} width={22} height={30} rx={3} fill={colors.surfaceHigh} stroke={colors.primaryText} strokeWidth={2} />
      <Path d="M15 15h12M15 21h12M15 27h7" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={32} cy={32} r={8} fill={colors.bg} stroke={colors.rival} strokeWidth={2.5} />
      <Line x1={38} y1={38} x2={43} y2={43} stroke={colors.rival} strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  travelers: (
    <>
      <Rect x={6} y={16} width={16} height={22} rx={3} fill={colors.primary} />
      <Rect x={26} y={12} width={16} height={26} rx={3} fill={colors.rival} />
      <Path d="M10 16v-4h8v4M30 12V8h8v4" stroke={colors.textMuted} strokeWidth={2} fill="none" />
      <Path d="M11 27h6M31 25h6" stroke={colors.bg} strokeWidth={2.4} strokeLinecap="round" />
    </>
  ),
  saboteur: (
    <>
      <Path d="M6 40L24 6l18 34z" fill="none" stroke={colors.insight} strokeWidth={2.5} strokeLinejoin="round" />
      {[0, 1, 2].map((i) => (
        <Circle key={i} cx={16 + i * 8} cy={32} r={3.5} fill={i === 1 ? colors.rival : colors.textMuted} />
      ))}
      <Path d="M24 16v8" stroke={colors.insight} strokeWidth={2.5} strokeLinecap="round" />
    </>
  ),
  bluff: (
    <>
      <Circle cx={14} cy={30} r={8} fill="#F5C451" stroke="#B8860B" strokeWidth={2} />
      <Circle cx={26} cy={26} r={8} fill="#CBD5E1" stroke="#64748B" strokeWidth={2} />
      <Circle cx={36} cy={32} r={8} fill={colors.surfaceHigh} stroke={colors.borderStrong} strokeWidth={2} />
      <Path d="M33 14a5 5 0 1 1 6 4.5c-1 .5-1.5 1-1.5 2" stroke={colors.insight} strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </>
  ),
  defusal: (
    <>
      <Circle cx={22} cy={28} r={13} fill={colors.surfaceHigh} stroke={colors.success} strokeWidth={2} />
      <Path d="M30 17l5-5" stroke={colors.textMuted} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={37} cy={10} r={3} fill={colors.rival} />
      <Path d="M14 26h16M14 31h16" stroke="#EF4444" strokeWidth={2} />
      <Path d="M14 26h6M24 31h6" stroke="#3B82F6" strokeWidth={2} />
    </>
  ),
  'power-play': (
    <>
      <Rect x={6} y={10} width={18} height={26} rx={3} fill={colors.surfaceHigh} stroke={colors.insight} strokeWidth={2} transform="rotate(-8 15 23)" />
      <Rect x={22} y={10} width={18} height={26} rx={3} fill={colors.surfaceHigh} stroke={colors.borderStrong} strokeWidth={2} transform="rotate(8 31 23)" />
      <Path d="M10 18l3 4 2-5 2 5 3-4-1 8h-8z" fill={colors.insight} />
      <Path d="M29 18a3.5 3.5 0 1 1 4 3c-.8.4-1 1-1 1.6M32 27v.5" stroke={colors.textMuted} strokeWidth={2} fill="none" strokeLinecap="round" />
    </>
  ),
  'last-stand': (
    <>
      <Path d="M4 40l12-16 8 10 6-8 14 14z" fill={colors.surfaceHigh} />
      <Path d="M24 8c4 6 8 8 8 14a8 8 0 0 1-16 0c0-4 3-6 3-9 2 2 3 3 5 5 0-4-1-6 0-10z" fill={colors.rival} />
      <Path d="M24 18c2 3 3 4 3 6a3 3 0 0 1-6 0c0-1.5 1-2.5 3-6z" fill={colors.insight} />
    </>
  ),
  'liars-dice': (
    <>
      <Rect x={6} y={14} width={20} height={20} rx={4} fill={colors.text} transform="rotate(-10 16 24)" />
      <Circle cx={12} cy={20} r={2} fill={colors.bg} />
      <Circle cx={16} cy={24} r={2} fill={colors.bg} />
      <Circle cx={20} cy={28} r={2} fill={colors.bg} />
      <Path d="M26 34l6-20h10l-4 20z" fill={colors.surfaceHigh} stroke={colors.accent} strokeWidth={2} strokeLinejoin="round" />
    </>
  ),
  codebreaker: (
    <>
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <Rect key={`${r}${c}`} x={6 + c * 13} y={6 + r * 13} width={11} height={11} rx={2.5} fill={r === 1 && c === 1 ? colors.danger : (r + c) % 3 === 0 ? colors.primary : colors.surfaceHigh} />
        )),
      )}
    </>
  ),
  gambit: (
    <>
      {[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => ((r + c) % 2 ? <Rect key={`${r}${c}`} x={6 + c * 9} y={6 + r * 9} width={9} height={9} fill={colors.surfaceHigh} /> : null)))}
      <Circle cx={15} cy={33} r={5} fill={colors.primary} />
      <Circle cx={33} cy={15} r={5} fill={colors.rival} />
      <Path d="M18 28l8-8" stroke={colors.insight} strokeWidth={2.4} strokeDasharray="3 2" strokeLinecap="round" />
    </>
  ),
};
