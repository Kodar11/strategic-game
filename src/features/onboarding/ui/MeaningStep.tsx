import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { APP_NAME } from '@/src/brand';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight } from '@/src/components/ui/icons';
import { colors, space } from '@/src/theme/tokens';
import { useMotionReduced } from '@/src/utils/feedback';

import { SCRIPT } from '../script';
import { Card, SCENE_ICON, StepKicker } from './parts';

const S = SCRIPT.meaning;

/** Part 3: what the two games were, in everyday life, then the one-line promise. */
export function MeaningStep({ onNext }: { onNext: () => void }) {
  const reduced = useMotionReduced();
  const enter = (i: number) => (reduced ? undefined : FadeInDown.delay(200 + i * 260).duration(280));
  return (
    <View style={{ gap: space.xl }}>
      <View style={{ gap: space.sm }}>
        <StepKicker>{S.kicker}</StepKicker>
        <AppText variant="display" align="center" accessibilityRole="header">
          {S.title}
        </AppText>
      </View>

      <View style={{ gap: space.md }}>
        {S.scenes.map((s, i) => {
          const Icon = SCENE_ICON[s.icon];
          return (
            <Animated.View key={s.place} entering={enter(i)}>
              <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
                <View style={{ paddingTop: 2 }}>
                  <Icon size={22} color={colors.accent} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="small" color={colors.textMuted}>
                    {s.place}
                  </AppText>
                  <AppText variant="bodyStrong">{s.idea}</AppText>
                </View>
              </Card>
            </Animated.View>
          );
        })}
      </View>

      <Animated.View entering={enter(S.scenes.length)} style={{ gap: space.lg }}>
        <AppText variant="heading" color={colors.insight} align="center">
          {S.promise(APP_NAME)}
        </AppText>
        <Button label={S.next} icon={ArrowRight} onPress={onNext} />
      </Animated.View>
    </View>
  );
}
