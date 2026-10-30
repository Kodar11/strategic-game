import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { IconButton } from '@/src/components/ui/Button';
import { ArrowRight, Settings } from '@/src/components/ui/icons';
import { CrossingArt } from '@/src/features/stories/crossing/CrossingArt';
import { HallArt } from '@/src/features/stories/meridian/MeridianArt';
import { useStories } from '@/src/features/stories/store';
import { ENDING_TITLE, SCENE_TITLE, beatAt, ending } from '@/src/stories/crossing/story';
import { STEPS, STEP_TITLE } from '@/src/stories/meridian/run';
import type { StoryId } from '@/src/stories/save';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

function openStory(id: StoryId) {
  router.push({ pathname: '/story/[storyId]', params: { storyId: id } });
}

/**
 * Stories: the third way to learn, next to lessons (an idea, explained) and games (a decision, practised). Here the
 * player is inside a situation first and meets the idea afterwards. Progress is kept on this device.
 */
export default function StoriesScreen() {
  const insets = useSafeAreaInsets();
  const enter = useEnter();
  const s = useStories();

  useFocusEffect(
    useCallback(() => {
      void useStories.getState().load();
    }, []),
  );

  const crossingStatus = (() => {
    const c = s.crossing;
    if (c?.reflecting) {
      const e = ending(c.choices);
      return `Finished · ${e ? ENDING_TITLE[e.id] : ''}`;
    }
    if (c && (c.pos.scene !== 'a' || c.pos.beat > 0)) return `In progress · Night ${beatAt(c.pos, c.choices)?.stage.night ?? 1}, ${SCENE_TITLE[c.pos.scene].toLowerCase()}`;
    return s.finishes.crossing > 0 ? 'Finished' : 'About 15 minutes · 9 decisions';
  })();
  const endings = s.endings.length;

  const meridianStatus = (() => {
    const m = s.meridian;
    if (m?.reflecting) return 'Finished';
    if (m && m.run.step > 0) return `In progress · ${STEP_TITLE[STEPS[m.run.step]]}`;
    return s.finishes.meridian > 0 ? 'Finished' : 'About 15 minutes · experiments';
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.2} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: space.huge }}>
        <View style={styles.column}>
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
                Stories
              </AppText>
              <IconButton icon={Settings} label="Settings" onPress={() => router.navigate('/settings')} />
            </View>
            <AppText variant="small" color={colors.textMuted}>
              Lessons explain an idea. Games let you practise it. Stories put you inside one — you care about what happens first, and understand why it matters afterwards.
            </AppText>
          </View>

          {!s.loaded ? null : (
            <>
              <Animated.View entering={enter(60)}>
                <StoryCard
                  kicker="Story one · Trust"
                  title="The Distance Between Us"
                  body="A storm has split a town across a gorge. One cable, one basket, and a courier on the other side with her own reasons. What you send across becomes what you have."
                  status={crossingStatus + (endings > 0 ? ` · ${endings} of 3 endings seen` : '')}
                  accent="#F2A65A"
                  art={<CrossingArt stage={{ night: 1, sky: 'dusk', rain: false, snow: false, mira: 'lantern-up', miraLight: true, basket: 'middle', built: 'none', frayed: false }} maxHeight={170} still />}
                  onPress={() => openStory('crossing')}
                />
              </Animated.View>
              <Animated.View entering={enter(140)}>
                <StoryCard
                  kicker="Story two · Strategy"
                  title="The Rules of the Game"
                  body="A tournament where rules play instead of people. Enter one, predict how it does, then change the room and watch the answer change with it."
                  status={meridianStatus}
                  accent="#7DD3FC"
                  art={<HallArt height={170} />}
                  onPress={() => openStory('meridian')}
                />
              </Animated.View>
            </>
          )}
          <AppText variant="caption" color={colors.textMuted} align="center">
            Stories are saved on this device and work offline. Leave any time — you’ll pick up where you left off.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

function StoryCard({ kicker, title, body, status, accent, art, onPress }: { kicker: string; title: string; body: string; status: string; accent: string; art: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${body} ${status}.`} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      <View style={{ height: 170, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none">
        {art}
      </View>
      <View style={{ padding: space.lg, gap: space.xs }}>
        <AppText variant="overline" color={accent}>
          {kicker}
        </AppText>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="small" color={colors.textBody}>
          {body}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.sm, gap: space.sm }}>
          <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
            {status}
          </AppText>
          <ArrowRight size={18} color={accent} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: space.lg },
  card: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
