import { createContext, useContext } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts, type FontWeightName, type TypeVariant, type } from '@/src/theme/tokens';

/** Whether the Inter font family loaded; falls back to the system font if not. */
export const FontsReadyContext = createContext(false);

const SYSTEM_WEIGHTS: Record<FontWeightName, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  weight?: FontWeightName;
  align?: TextStyle['textAlign'];
  tabular?: boolean;
}

export function AppText({ variant = 'body', color, weight, align, tabular, style, ...rest }: AppTextProps) {
  const fontsReady = useContext(FontsReadyContext);
  const t = type[variant];
  const w = weight ?? t.weight;
  return (
    <Text
      {...rest}
      style={[
        {
          color: color ?? (variant === 'body' || variant === 'small' ? colors.textBody : colors.text),
          fontSize: t.size,
          lineHeight: t.line,
          letterSpacing: t.tracking,
          textAlign: align,
          ...(fontsReady ? { fontFamily: fonts[w] } : { fontWeight: SYSTEM_WEIGHTS[w] }),
          ...(tabular ? { fontVariant: ['tabular-nums'] } : null),
          ...(variant === 'overline' ? { textTransform: 'uppercase' } : null),
        },
        style,
      ]}
    />
  );
}

/** Non-breaking spaces, so a value and its unit ("3.5 units") never split across lines. */
export function keepTogether(text: string) {
  return text.replace(/ /g, ' ');
}
