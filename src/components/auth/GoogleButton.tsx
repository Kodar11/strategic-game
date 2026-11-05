import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/src/components/ui/AppText';
import { radius, space } from '@/src/theme/tokens';

/**
 * "Continue with Google", drawn to Google's sign-in branding guidelines for a dark theme: the standard four-colour
 * "G" on a #131314 pill with a #8E918F outline and #E3E3E3 label. The logo is never recoloured or restyled.
 * While a sign-in runs the logo gives way to a spinner and the button is disabled, so a second tap can't start a
 * second request.
 */
export function GoogleButton({ onPress, busy, disabled, label = 'Continue with Google' }: { onPress: () => void; busy?: boolean; disabled?: boolean; label?: string }) {
  const off = !!busy || !!disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={busy ? 'Signing in with Google' : label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      style={({ pressed }) => [styles.button, pressed && !off && styles.pressed, off && !busy && styles.disabled]}>
      <View style={styles.logo} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {busy ? <ActivityIndicator size="small" color="#E3E3E3" /> : <GoogleLogo />}
      </View>
      <AppText variant="bodyStrong" color="#E3E3E3" style={{ flexShrink: 1 }}>
        {busy ? 'Signing in…' : label}
      </AppText>
    </Pressable>
  );
}

/** Google's "G" mark, unmodified. */
function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#8E918F',
    backgroundColor: '#131314',
  },
  pressed: { backgroundColor: '#1F1F20' },
  disabled: { opacity: 0.6 },
  logo: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
});
