import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/auth/store';
import { SignInPanel } from '@/src/components/auth/SignInPanel';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { IconButton } from '@/src/components/ui/Button';
import { X } from '@/src/components/ui/icons';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

/**
 * The sign-in screen: one Google button, nothing else to fill in. Opened as a modal from anywhere that invites the
 * player to sign in; it closes itself once the account is ready. Never required — closing it keeps the guest
 * experience exactly as it was.
 */
export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const status = useAuth((s) => s.status);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  useEffect(() => {
    if (status === 'signedIn') close();
  }, [status]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          <View style={styles.head}>
            <IconButton icon={X} label="Close" onPress={close} />
          </View>
          <View style={styles.body}>
            <AppText variant="title" accessibilityRole="header">
              Welcome back
            </AppText>
            <AppText color={colors.textBody}>Sign in to save your progress and continue your strategic-thinking journey.</AppText>
            <SignInPanel card={false} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'flex-end' },
  body: { flex: 1, justifyContent: 'center', gap: space.lg, paddingBottom: space.huge },
});
