import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { toDataError } from '@/src/data/errors';
import { useGames } from '@/src/data/games-session';
import { NICKNAME_MAX, NICKNAME_MESSAGES, type NicknameProblem, nicknameProblem } from '@/src/games/competition';
import { colors, fonts, radius, space } from '@/src/theme/tokens';

/**
 * The public nickname (leaderboards, Hall of Fame, challenges). It lives on the server with the games record, which
 * also keeps names unique; null means the player shows as "Anonymous player".
 * `undefined` while it has not loaded yet (or could not be loaded).
 */
export function useNickname(): { name: string | null | undefined; failed: boolean; reload: () => void } {
  const name = useGames((s) => (s.overview.status === 'ready' ? s.overview.data.nickname : s.mine.status === 'ready' ? s.mine.data.nickname : undefined));
  const failed = useGames((s) => s.overview.status === 'error' && s.mine.status !== 'ready');
  const loadOverview = useGames((s) => s.loadOverview);
  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);
  return { name, failed, reload: () => void loadOverview({ force: true }) };
}

/**
 * Editing state for the nickname: checked on the device for quick feedback with the server's own rules, then saved
 * through the games store, whose answer (e.g. "taken") is shown as is. `onSaved` runs only after the server accepted it.
 */
export function useNicknameForm(initial: string | null | undefined, onSaved: (name: string) => void) {
  const setNickname = useGames((s) => s.setNickname);
  const [value, setValue] = useState(initial ?? '');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = nicknameProblem(value);

  const save = async () => {
    if (saving) return;
    setTouched(true);
    if (problem) return;
    const name = value.trim();
    if (name === initial) return onSaved(name);
    setSaving(true);
    setError(null);
    try {
      onSaved(await setNickname(name));
    } catch (e) {
      setError(toDataError(e).message);
    } finally {
      setSaving(false);
    }
  };

  const change = (text: string) => {
    setValue(text);
    setError(null);
  };

  return { value, change, touched, setTouched, saving, error, problem, save };
}

export type NicknameFormState = ReturnType<typeof useNicknameForm>;

/** The input with its one line of guidance, or the validation / server error in its place. */
export function NicknameInput({ form, autoFocus }: { form: NicknameFormState; autoFocus?: boolean }) {
  const shownProblem: NicknameProblem | null = form.touched ? form.problem : null;
  const message = form.error ?? (shownProblem ? NICKNAME_MESSAGES[shownProblem] : null);
  return (
    <View style={{ gap: space.sm }}>
      <TextInput
        value={form.value}
        onChangeText={form.change}
        onBlur={() => form.setTouched(true)}
        onSubmitEditing={() => void form.save()}
        placeholder="e.g. Ada L"
        placeholderTextColor={colors.textFaint}
        maxLength={NICKNAME_MAX + 4}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="off"
        autoFocus={autoFocus}
        editable={!form.saving}
        returnKeyType="done"
        accessibilityLabel="Nickname"
        accessibilityHint={`3 to ${NICKNAME_MAX} characters: letters, numbers, spaces, and _ . -`}
        style={[styles.input, message ? { borderColor: colors.danger } : null]}
      />
      {message ? (
        <AppText variant="small" color={colors.danger} accessibilityLiveRegion="polite">
          {message}
        </AppText>
      ) : (
        <AppText variant="caption" color={colors.textMuted}>
          3–{NICKNAME_MAX} characters: letters, numbers, spaces, and _ . -
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
