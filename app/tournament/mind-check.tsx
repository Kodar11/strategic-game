import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { ArrowLeft } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { useTournament } from '@/src/features/tournament/store';
import { Quiz, quizPool } from '@/src/features/tournament/ui/Quiz';
import { useLoadTournament } from '@/src/features/tournament/useStatus';
import { type MindForm, mindForm } from '@/src/tournament/progress';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

const isForm = (x: unknown): x is MindForm => x === 'a' || x === 'b' || x === 'c';
const pct = (c: number, t: number) => (t > 0 ? Math.round((c / t) * 100) : 0);

/**
 * The Mind Check: ten questions, three forms that never share a question. Results are shown against the player's own
 * earlier forms only — never a percentile or a claim about intelligence.
 */
export default function MindCheckScreen() {
  const { form } = useLocalSearchParams<{ form?: string }>();
  const insets = useSafeAreaInsets();
  useLoadTournament();
  const mind = useTournament((s) => s.mind);
  const items = useMemo(() => (isForm(form) ? mindForm(quizPool(), form) : []), [form]);
  const [done, setDone] = useState<{ correct: number; total: number } | null>(null);

  if (!isForm(form) || items.length === 0) return <MessageScreen title="Mind Check not found" body="This form isn’t available." />;
  const earlier = mind.filter((m) => m.form !== form).sort((a, b) => a.at - b.at);
  const first = earlier[0];
  const taken = mind.find((m) => m.form === form);
  const shown = done ?? (taken ? { correct: taken.correct, total: taken.total } : null);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.huge }}>
        <View style={{ maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <AppText variant="bodyStrong" color={colors.textMuted}>
              Mind Check · form {form.toUpperCase()}
            </AppText>
          </View>
          {shown ? (
            <View style={{ gap: space.md }}>
              <AppText variant="title" accessibilityRole="header">
                {pct(shown.correct, shown.total)}%
              </AppText>
              <AppText color={colors.textBody}>
                {shown.correct} of {shown.total} answered as the model predicts.
                {first ? ` Your first Mind Check: ${pct(first.correct, first.total)}%.` : ' Take another after more of the Tournament to see how far you’ve come.'}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                Compared only with your own earlier checks. It measures these ideas, not intelligence.
              </AppText>
              <Button label="Done" onPress={close} />
            </View>
          ) : (
            <>
              <AppText variant="title" accessibilityRole="header">
                Mind Check
              </AppText>
              <AppText color={colors.textMuted}>{items.length} questions on the ideas behind the Tournament. About five minutes. Skip any time.</AppText>
              <Quiz
                items={items}
                onDone={(correct, total) => {
                  useTournament.getState().saveMindCheck(form, correct, total);
                  setDone({ correct, total });
                }}
              />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
