import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ARENA_ORDER } from '@/src/arena/catalog';
import type { ArenaGameId } from '@/src/arena/core';
import { LessonArt } from '@/src/components/art/LessonArt';
import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { BookOpen, Compass, Play } from '@/src/components/ui/icons';
import type { LessonMeta } from '@/src/content/lessons';
import { allLessons } from '@/src/content/lessons';
import { ArenaArt } from '@/src/features/arena/ui/parts';
import { GameArt } from '@/src/features/games/ui/GameArt';
import { allScenarios } from '@/src/features/scenarios';
import { GAME_ORDER } from '@/src/games/catalog';
import type { GameId } from '@/src/games/core';
import { colors, radius, space } from '@/src/theme/tokens';
import { BRIDGE_LESSON, showcaseScenarios } from '../next-step';

/** A few games with visibly different mechanics: a trust game, a mind game, a bluffing game, an auction. */
const SHOWCASE_GAMES: ({ kind: 'classic'; id: GameId } | { kind: 'arena'; id: ArenaGameId })[] = [
  { kind: 'arena', id: 'cooperation' },
  { kind: 'classic', id: 'rps' },
  { kind: 'arena', id: 'liars-dice' },
  { kind: 'arena', id: 'auction' },
  { kind: 'classic', id: 'two-thirds' },
];

/** The two stories in the Lessons tab, by the titles its cards show. */
const STORY_TITLES = ['The Distance Between Us', 'The Rules of the Game'] as const;

/**
 * Stages 4 and 5: the three pillars — named after what the Lessons and Games tabs hold — each with real catalog content and its own look (an illustration, a row of game
 * tiles, a stack of situations), then one recommended next step into the real app. Nothing here is a tutorial.
 */
export function WorldStage({ next, onStart, onExplore }: { next: LessonMeta | undefined; onStart: () => void; onExplore: () => void }) {
  const enter = useEnter();
  const lessons = allLessons();
  const scenarios = showcaseScenarios(allScenarios());
  const gameCount = GAME_ORDER.length + ARENA_ORDER.length;
  const games = SHOWCASE_GAMES.filter((g) => (g.kind === 'classic' ? GAME_ORDER.includes(g.id) : ARENA_ORDER.includes(g.id)));

  return (
    <>
      <Animated.View entering={enter(0)} style={{ gap: space.xs }}>
        <AppText variant="title" accessibilityRole="header">
          That was one decision.
        </AppText>
        <AppText color={colors.textMuted}>Here’s where the rest of them live.</AppText>
      </Animated.View>

      <Animated.View entering={enter(60)} style={styles.pillar} accessible accessibilityLabel={`Lessons tab. Understand the ideas. ${lessons.length} interactive lessons, plus ${allScenarios().length} decision scenarios to explore, such as ${scenarios.map((s) => s.title).join(', ')}.`}>
        <LessonArt lesson={lessons[0]?.id ?? 'cooperation-trap'} height={88} style={{ borderRadius: radius.lg }} />
        <View style={{ gap: space.xs }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {scenarios.slice(0, 2).map((s) => (
            <View key={s.id} style={styles.scenario}>
              <Compass size={14} color={colors.accent} />
              <AppText variant="small" color={colors.textBody} numberOfLines={1} style={{ flexShrink: 1 }}>
                {s.title}
              </AppText>
            </View>
          ))}
        </View>
        <PillarText overline="Lessons" tone={colors.primaryText} title="Understand the ideas." body={`${lessons.length} interactive lessons, plus ${allScenarios().length} decision scenarios about trust, negotiation and uncertainty.`} />
      </Animated.View>

      <Animated.View entering={enter(120)} style={styles.pillar} accessible accessibilityLabel={`Games tab. Put your decisions to the test. ${gameCount} games against opponents with different personalities.`}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {games.map((g) => (g.kind === 'classic' ? <GameArt key={g.id} game={g.id} size={56} /> : <ArenaArt key={g.id} game={g.id} size={56} />))}
        </ScrollView>
        <PillarText overline="Games" tone={colors.rivalText} title="Put your decisions to the test." body={`${gameCount} games, each against opponents with their own personalities.`} />
      </Animated.View>

      <Animated.View entering={enter(180)} style={styles.pillar} accessible accessibilityLabel={`Stories, in the Lessons tab. Step inside a situation. ${STORY_TITLES.length} interactive stories: ${STORY_TITLES.join(' and ')}.`}>
        <View style={{ gap: space.xs }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {STORY_TITLES.map((t, i) => (
            <View key={t} style={{ paddingLeft: i * space.md }}>
              <View style={styles.scenario}>
                <BookOpen size={14} color={colors.accent} />
                <AppText variant="small" color={colors.textBody} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {t}
                </AppText>
              </View>
            </View>
          ))}
        </View>
        <PillarText overline="Stories" tone={colors.accent} title="Step inside a situation." body={`${STORY_TITLES.length} interactive stories: you decide first and meet the idea afterwards.`} />
      </Animated.View>

      <Animated.View entering={enter(240)} style={{ gap: space.sm, marginTop: space.sm }}>
        {next ? (
          <>
            <AppText variant="small" color={colors.textMuted} align="center">
              {next.id === BRIDGE_LESSON ? 'Recommended next: the same trap, with a whole market at stake.' : 'Recommended next: pick up where you left off.'}
            </AppText>
            <Button kicker={`Lesson ${next.number} · ${next.minutes} min`} label={next.title} icon={Play} iconPosition="left" onPress={onStart} />
          </>
        ) : null}
        <Button label="Explore on my own" variant={next ? 'ghost' : 'primary'} onPress={onExplore} />
      </Animated.View>
    </>
  );
}

function PillarText({ overline, tone, title, body }: { overline: string; tone: string; title: string; body: string }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="overline" color={tone}>
        {overline}
      </AppText>
      <AppText variant="bodyStrong">{title}</AppText>
      <AppText variant="small" color={colors.textMuted}>
        {body}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pillar: { gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  scenario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.24)',
  },
});
