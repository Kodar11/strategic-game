import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Check, X } from '@/src/components/ui/icons';
import { toDataError } from '@/src/data/errors';
import { useGames } from '@/src/data/games-session';
import { NICKNAME_MAX, NICKNAME_MESSAGES, nicknameProblem } from '@/src/games/competition';
import { MAX_CONTENT_WIDTH, colors, fonts, radius, space } from '@/src/theme/tokens';

/**
 * The public name shown on leaderboards and challenges. Optional: without one you appear as "Anonymous player".
 * Checked here for quick feedback and again by the server, which also keeps names unique.
 */
export default function NicknameScreen() {
  const insets = useSafeAreaInsets();
  const current = useGames((s) => (s.overview.status === 'ready' ? s.overview.data.nickname : s.mine.status === 'ready' ? s.mine.data.nickname : null));
  const setNickname = useGames((s) => s.setNickname);
  const [value, setValue] = useState(current ?? '');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = nicknameProblem(value);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/games'));

  const save = async () => {
    setTouched(true);
    if (problem) return;
    setSaving(true);
    setError(null);
    try {
      await setNickname(value.trim());
      close();
    } catch (e) {
      setError(toDataError(e).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              Your public name
            </AppText>
            <IconButton icon={X} label="Close" onPress={close} />
          </View>
          <AppText color={colors.textBody}>
            Shown on leaderboards, the Hall of Fame and challenges you send. Nothing else about you is shown — not your account or device.
          </AppText>
          <TextInput
            value={value}
            onChangeText={(t) => {
              setValue(t);
              setError(null);
            }}
            onBlur={() => setTouched(true)}
            onSubmitEditing={() => void save()}
            placeholder="e.g. Ada L"
            placeholderTextColor={colors.textFaint}
            maxLength={NICKNAME_MAX + 4}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="done"
            accessibilityLabel="Public name"
            accessibilityHint="3 to 20 characters: letters, numbers, spaces, and _ . -"
            style={[styles.input, touched && problem ? { borderColor: colors.danger } : null]}
          />
          {(touched && problem) || error ? (
            <AppText variant="small" color={colors.danger} accessibilityLiveRegion="polite">
              {error ?? NICKNAME_MESSAGES[problem!]}
            </AppText>
          ) : (
            <AppText variant="caption" color={colors.textMuted}>
              3–{NICKNAME_MAX} characters: letters, numbers, single spaces, and _ . -. Names that could pass for the app or its staff are reserved.
            </AppText>
          )}
          <Button label={saving ? 'Saving…' : 'Save name'} icon={Check} iconPosition="left" disabled={saving || (touched && !!problem)} onPress={() => void save()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  input: {
    minHeight: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 17,
    fontFamily: fonts.medium,
  },
});
