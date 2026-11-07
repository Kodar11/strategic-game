import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { ArrowLeft, KeyRound } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { rivalOf } from '@/src/features/tournament/content';
import { useTournament } from '@/src/features/tournament/store';
import { Quiz, quizPool } from '@/src/features/tournament/ui/Quiz';
import { useLoadTournament, useTournamentStatus } from '@/src/features/tournament/useStatus';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

const ITEMS = 3;
/** Two of three: enough to show the idea is understood, without one slip costing the key card. */
const passMark = (total: number) => Math.ceil((total * 2) / 3);

/** The key-card check: three questions on the stage's lessons, for players who know the idea already. */
export default function KeyCheckScreen() {
  const { stageId } = useLocalSearchParams<{ stageId?: string }>();
  const insets = useSafeAreaInsets();
  useLoadTournament();
  const t = useTournamentStatus();
  const stage = t.season.stages.find((s) => s.id === stageId);
  const items = useMemo(() => (stage ? quizPool(stage.lessons).slice(0, ITEMS) : []), [stage]);
  const [result, setResult] = useState<{ correct: number; total: number; passed: boolean } | null>(null);

  if (!stage || stage.lessons.length === 0) return <MessageScreen title="No check here" body="This stage doesn’t need a key card." />;
  if (items.length === 0) return <MessageScreen title="No questions yet" body="Finish one of the stage’s lessons to earn its key card." />;
  const rival = rivalOf(t.doc, stage.rival);
  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/tournament/[stageId]', params: { stageId: stage.id } }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.huge }}>
        <View style={{ maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <IconButton icon={ArrowLeft} label="Back" onPress={back} />
            <AppText variant="bodyStrong" color={colors.textMuted}>
              Key card · {stage.title}
            </AppText>
          </View>
          <AppText variant="title" accessibilityRole="header">
            Prove you know {rival.name}’s game
          </AppText>
          {result ? (
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <KeyRound size={20} color={result.passed ? colors.success : colors.textMuted} />
                <AppText variant="heading" color={result.passed ? colors.success : colors.text}>
                  {result.passed ? 'Key card earned' : 'Not this time'}
                </AppText>
              </View>
              <AppText color={colors.textBody}>
                {result.correct} of {result.total} right.{' '}
                {result.passed ? `You can face ${rival.name} once the other matches are cleared.` : `You need ${passMark(result.total)}. Try again, or finish one of the stage’s lessons.`}
              </AppText>
              <Button label="Back to the stage" onPress={back} />
            </View>
          ) : (
            <>
              <AppText color={colors.textMuted}>
                {items.length} questions. Get {passMark(items.length)} right to earn the key card.
              </AppText>
              <Quiz
                items={items}
                onDone={(correct, total) => {
                  const passed = correct >= passMark(total);
                  useTournament.getState().saveCheck(stage.id, correct, total, passed);
                  setResult({ correct, total, passed });
                }}
              />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
