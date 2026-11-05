import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

/** Web: no session replay, so nothing to mask (see Sensitive.tsx). */
export function Sensitive({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={style}>{children}</View>;
}
