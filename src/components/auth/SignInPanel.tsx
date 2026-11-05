import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { googleSignInAvailable, googleSignInNote } from '@/src/auth/google';
import { useAuth } from '@/src/auth/store';
import { AppText } from '@/src/components/ui/AppText';
import { Card } from '@/src/components/ui/Card';
import { X } from '@/src/components/ui/icons';
import { noteSignInSource, signInWithGoogle } from '@/src/data/session';
import { LINKS } from '@/src/features/settings/about';
import { colors, space } from '@/src/theme/tokens';
import { GoogleButton } from './GoogleButton';

/**
 * The one sign-in invitation, used wherever an account helps: Settings, the post-onboarding card on Learn, the
 * sign-in screen and features that keep per-player records (Daily Challenge, Game of the Week, friend challenges).
 * It never blocks anything; `onDismiss` adds a close button where the invitation is optional.
 *
 * Cancelling Google's picker is not an error and shows nothing; a real failure shows a plain-language reason
 * (src/auth/errors.ts) under the button.
 */
export function SignInPanel({
  title,
  body,
  onDismiss,
  legal = true,
  card = true,
  source,
}: {
  title?: string;
  body?: string;
  onDismiss?: () => void;
  legal?: boolean;
  card?: boolean;
  /** Where sign-in was offered, for analytics (default: the screen on show, e.g. "settings", "daily_play"). */
  source?: string;
}) {
  const status = useAuth((s) => s.status);
  const error = useAuth((s) => s.error);
  const busy = status === 'signingIn';

  const content = (
    <View style={{ gap: space.md }}>
      {title || onDismiss ? (
        <View style={styles.head}>
          {title ? (
            <AppText variant="heading" style={{ flex: 1 }} accessibilityRole="header">
              {title}
            </AppText>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {onDismiss ? (
            <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Not now" style={styles.close}>
              <X size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {body ? (
        <AppText variant="small" color={colors.textBody}>
          {body}
        </AppText>
      ) : null}
      <GoogleButton
        onPress={() => {
          noteSignInSource(source ?? null);
          void signInWithGoogle();
        }}
        busy={busy} disabled={!googleSignInAvailable || status !== 'signedOut'} />
      {googleSignInNote ? (
        <AppText variant="caption" color={colors.textMuted}>
          {googleSignInNote}
        </AppText>
      ) : null}
      {error && status === 'signedOut' ? (
        <AppText variant="small" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      {legal ? <LegalLine /> : null}
    </View>
  );

  return card ? <Card>{content}</Card> : content;
}

function open(url: string) {
  if (Platform.OS === 'web') void Linking.openURL(url);
  else WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
}

export function LegalLine() {
  return (
    <AppText variant="caption" color={colors.textMuted}>
      By continuing, you agree to our{' '}
      <AppText variant="caption" color={colors.primaryText} accessibilityRole="link" onPress={() => open(LINKS.terms)}>
        Terms of Service
      </AppText>{' '}
      and{' '}
      <AppText variant="caption" color={colors.primaryText} accessibilityRole="link" onPress={() => open(LINKS.privacy)}>
        Privacy Policy
      </AppText>
      .
    </AppText>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -4 },
});
