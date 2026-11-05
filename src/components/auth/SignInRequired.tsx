import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/auth/store';
import { Portrait } from '@/src/components/characters/Portrait';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button } from '@/src/components/ui/Button';
import { ArrowLeft } from '@/src/components/ui/icons';
import { type DataError, toDataError } from '@/src/data/errors';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';
import { SignInPanel } from './SignInPanel';

/** True for the error a guest gets from a feature that keeps per-player records on the server. */
export function isSignedOutError(e: unknown): boolean {
  return toDataError(e).kind === 'signedOut';
}

export function needsSignIn(error: DataError | null | undefined): boolean {
  return error?.kind === 'signedOut';
}

/** True while nobody is signed in (a guest, or a sign-in still running). */
export function useIsGuest(): boolean {
  return useAuth((s) => s.status === 'signedOut' || s.status === 'signingIn');
}

/**
 * A feature that needs an account, asked for by a guest: what it is, why an account is needed, and "Continue with
 * Google" — instead of an error. Once signed in, the screen that showed this re-renders with the real feature.
 */
export function SignInRequiredScreen({ title, body }: { title: string; body: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.xxl, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xxl }}>
        <View style={{ maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg }}>
          <View style={{ alignItems: 'center', gap: space.lg }}>
            <Portrait character="sen" expression="thinking" size={88} />
            <AppText variant="title" align="center" accessibilityRole="header">
              {title}
            </AppText>
            <AppText align="center" color={colors.textMuted} style={{ maxWidth: 380 }}>
              {body}
            </AppText>
          </View>
          <SignInPanel />
          <Button label="Back" variant="ghost" icon={ArrowLeft} iconPosition="left" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
      </ScrollView>
    </View>
  );
}
