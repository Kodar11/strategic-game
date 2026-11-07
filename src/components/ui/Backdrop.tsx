import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/src/theme/tokens';

// Pre-rendered by scripts/generate-backdrop.mjs: the navy with its blue key light, and the orange rim light alone.
const BASE = require('@/assets/images/backdrop/base.png');
const RIM = require('@/assets/images/backdrop/rim.png');

/**
 * Atmospheric background: deep navy with a soft blue key light and a faint orange rim light.
 *
 * Two small images stretched to the screen, rather than SVG radial gradients drawn on every screen: decoded once and
 * cached, so opening a screen no longer pays for rasterising a full-screen gradient. `warm` is the rim's strength.
 */
function BackdropView({ warm = 0.12 }: { warm?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none">
      <Image source={BASE} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} cachePolicy="memory" accessible={false} />
      <Image source={RIM} style={[StyleSheet.absoluteFill, { opacity: warm }]} contentFit="fill" transition={0} cachePolicy="memory" accessible={false} />
    </View>
  );
}

// Memoized: a pure drawing of primitive props, re-rendered otherwise whenever a parent screen updates.
export const Backdrop = memo(BackdropView);
