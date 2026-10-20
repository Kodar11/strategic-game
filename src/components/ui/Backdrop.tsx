import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors, palette } from '@/src/theme/tokens';

/** Atmospheric background: deep navy with a soft blue key light and a faint orange rim light. */
export function Backdrop({ warm = 0.12 }: { warm?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="key" cx="15%" cy="0%" r="75%">
            <Stop offset="0" stopColor={palette.blue} stopOpacity={0.22} />
            <Stop offset="1" stopColor={palette.blue} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="rim" cx="100%" cy="100%" r="70%">
            <Stop offset="0" stopColor={palette.orange} stopOpacity={warm} />
            <Stop offset="1" stopColor={palette.orange} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#key)" />
        <Rect width="100%" height="100%" fill="url(#rim)" />
      </Svg>
    </View>
  );
}
