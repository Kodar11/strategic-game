import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Check, X } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { NicknameInput, useNickname, useNicknameForm } from '@/src/features/profile/nickname';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

/**
 * Edit the public nickname, from Settings or the Games screen. Optional: without one you appear as "Anonymous player".
 * Checked here for quick feedback and again by the server, which also keeps names unique.
 */
export default function NicknameScreen() {
  const { name, failed, reload } = useNickname();
  if (name === undefined) {
    return <MessageScreen loading={!failed} title="Couldn’t load your profile" body="Check your connection and try again." onRetry={reload} />;
  }
  return <NicknameEditor current={name} />;
}

function NicknameEditor({ current }: { current: string | null }) {
  const insets = useSafeAreaInsets();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/games'));
  const form = useNicknameForm(current, close);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              Edit profile
            </AppText>
            <IconButton icon={X} label="Close" onPress={close} />
          </View>
          <AppText color={colors.textBody}>Your nickname is public: it appears on leaderboards and challenges you send.</AppText>
          <NicknameInput form={form} autoFocus />
          <Button
            label={form.saving ? 'Saving…' : 'Save'}
            icon={Check}
            iconPosition="left"
            disabled={form.saving || (form.touched && !!form.problem)}
            onPress={() => void form.save()}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
});
