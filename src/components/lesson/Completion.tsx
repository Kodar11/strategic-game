import { router } from 'expo-router';
import { ArrowRight, House, RotateCcw, Trophy } from '@/src/components/ui/icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Portrait } from '@/src/components/characters/Portrait';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Badge, Card } from '@/src/components/ui/Card';
import { type LessonMeta, nextLesson } from '@/src/content/lessons';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, space } from '@/src/theme/tokens';
import { useEnter } from './motion';

/** Final step of every lesson: takeaway, then next / replay / home. */
export function Completion({
  lesson,
  takeaway,
  remember,
  onReplay,
}: {
  lesson: LessonMeta;
  takeaway: string;
  remember: string[];
  onReplay: () => void;
}) {
  const enter = useEnter();
  const reduced = useMotionReduced();
  const next = nextLesson(lesson.id);

  useEffect(() => {
    haptic.success();
  }, []);

  return (
    <View style={{ gap: space.xl }}>
      <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.lg }}>
        <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(14)} style={styles.trophy}>
          <Trophy size={34} color={colors.insight} strokeWidth={2} />
        </Animated.View>
        <Badge label={`Lesson ${lesson.number} complete`} tone="amber" style={{ alignSelf: 'center' }} />
        <AppText variant="title" align="center" accessibilityRole="header">
          {lesson.title}
        </AppText>
      </View>

      <Animated.View entering={enter(120)}>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <Portrait character="sen" expression="satisfied" size={44} />
            <AppText variant="overline" color={colors.insight}>
              The takeaway
            </AppText>
          </View>
          <AppText variant="heading">{takeaway}</AppText>
          <View style={{ gap: space.sm }}>
            {remember.map((r) => (
              <View key={r} style={{ flexDirection: 'row', gap: space.sm }}>
                <AppText color={colors.insight}>—</AppText>
                <AppText variant="small" style={{ flex: 1 }}>
                  {r}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      </Animated.View>

      <Animated.View entering={enter(220)} style={{ gap: space.sm }}>
        {next ? (
          <Button
            label={`Next: ${next.title}`}
            icon={ArrowRight}
            onPress={() => router.replace({ pathname: '/lesson/[lessonId]', params: { lessonId: next.id } })}
          />
        ) : (
          <Button label="Back to all lessons" icon={House} iconPosition="left" onPress={() => router.replace('/')} />
        )}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="Replay" variant="secondary" icon={RotateCcw} iconPosition="left" onPress={onReplay} style={{ flex: 1 }} />
          {next ? (
            <Button label="Home" variant="secondary" icon={House} iconPosition="left" onPress={() => router.replace('/')} style={{ flex: 1 }} />
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  trophy: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.insightSoft,
    borderWidth: 1,
    borderColor: 'rgba(253,186,116,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
