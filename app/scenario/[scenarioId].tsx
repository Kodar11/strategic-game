import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { ArrowLeft, ArrowRight, X } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { getLesson } from '@/src/content/lessons';
import { SCENARIO_IDS, getScenario, scenariosFor } from '@/src/features/scenarios';
import { ScenarioPlayer } from '@/src/features/scenarios/ScenarioPlayer';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

// Static web export renders every page the app can show; content (loaded at run time) decides what each page holds.
export function generateStaticParams() {
  return SCENARIO_IDS.map((scenarioId) => ({ scenarioId }));
}

/** A paired scenario on its own, for practice and replay outside the lesson. Open whether or not the lesson is done. */
export default function ScenarioScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const hydrated = useProgress((s) => s.hydrated);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const spec = getScenario(scenarioId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [scenarioId]);

  if (!spec) return <MessageScreen title="Scenario not found" body="This link doesn't match any scenario. Pick one from Practice." />;
  if (!hydrated) return <MessageScreen loading />;

  const lesson = getLesson(spec.lesson)!;
  const siblings = scenariosFor(spec.lesson);
  const i = siblings.findIndex((s) => s.id === spec.id);
  const next = siblings[i + 1];
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/challenges'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.08} />
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.row}>
          <IconButton icon={X} label="Close the scenario. Your progress is saved." onPress={leave} />
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
            Practice · Lesson {lesson.number} · {lesson.title}
          </AppText>
        </View>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: insets.bottom + space.xxxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <ScenarioPlayer id={spec.id} />
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xl }}>
            <Button label="Lesson" variant="secondary" icon={ArrowLeft} iconPosition="left" onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: lesson.id } })} style={{ flex: 1 }} />
            {next ? (
              <Button label={`Scenario ${next.slot}`} icon={ArrowRight} onPress={() => router.replace({ pathname: '/scenario/[scenarioId]', params: { scenarioId: next.id } })} style={{ flex: 1 }} />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
});
