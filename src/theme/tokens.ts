/**
 * Design tokens. Colours are semantic: blue = the learner / strategic info,
 * orange = the competing side / tension, amber = key insights, cyan = secondary emphasis.
 */
export const palette = {
  deepNavy: '#081220',
  navy: '#0F2A44',
  blue: '#2563EB',
  orange: '#F97316',
  amber: '#FDBA74',
  slate: '#94A3B8',
  light: '#E2E8F0',
  cyan: '#22D3EE',
} as const;

export const colors = {
  bg: palette.deepNavy,
  bgRaised: '#0B1A2E',
  surface: palette.navy,
  surfaceHigh: '#163657',
  border: 'rgba(148, 163, 184, 0.16)',
  borderStrong: 'rgba(148, 163, 184, 0.32)',
  text: '#F1F5F9',
  textBody: palette.light,
  textMuted: palette.slate,
  textFaint: '#64748B',
  slateDot: '#64748B',
  primary: palette.blue,
  primaryPressed: '#1D4ED8',
  primarySoft: 'rgba(37, 99, 235, 0.16)',
  primaryText: '#93B4F8',
  rival: palette.orange,
  rivalSoft: 'rgba(249, 115, 22, 0.14)',
  rivalText: '#FDA766',
  insight: palette.amber,
  insightSoft: 'rgba(253, 186, 116, 0.10)',
  accent: palette.cyan,
  accentSoft: 'rgba(34, 211, 238, 0.12)',
  success: '#4ADE80',
  successSoft: 'rgba(74, 222, 128, 0.12)',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.12)',
  overlay: 'rgba(8, 18, 32, 0.82)',
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export type FontWeightName = keyof typeof fonts;

export const type = {
  display: { size: 32, line: 38, weight: 'bold' as FontWeightName, tracking: -0.6 },
  title: { size: 24, line: 30, weight: 'bold' as FontWeightName, tracking: -0.4 },
  heading: { size: 19, line: 25, weight: 'semibold' as FontWeightName, tracking: -0.2 },
  body: { size: 16, line: 24, weight: 'regular' as FontWeightName, tracking: 0 },
  bodyStrong: { size: 16, line: 24, weight: 'semibold' as FontWeightName, tracking: 0 },
  small: { size: 14, line: 20, weight: 'regular' as FontWeightName, tracking: 0 },
  caption: { size: 12, line: 16, weight: 'medium' as FontWeightName, tracking: 0.2 },
  overline: { size: 11, line: 14, weight: 'semibold' as FontWeightName, tracking: 1.2 },
  number: { size: 40, line: 46, weight: 'bold' as FontWeightName, tracking: -1 },
} as const;

export type TypeVariant = keyof typeof type;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export const MAX_CONTENT_WIDTH = 560;
