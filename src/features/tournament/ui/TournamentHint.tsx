import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ARENA } from '@/src/arena/catalog';
import { isArenaId } from '@/src/arena/core';
import { AppText } from '@/src/components/ui/AppText';
import { Layers, Lock } from '@/src/components/ui/icons';
import { getLesson } from '@/src/content/lessons';
import { GAMES } from '@/src/games/catalog';
import { isGameId } from '@/src/games/core';
import { useProgress } from '@/src/store/progress';
import { findMatch, hasKeyCard } from '@/src/tournament/progress';
import { colors, radius, space } from '@/src/theme/tokens';
import { useTournamentContent } from '../content';
import { useTournament } from '../store';

/**
 * One strategy-card hint per tournament game: the idea that beats this rival, plus a pointer for this game. Held
 * when the match's lesson card is owned (the lesson is finished) or the stage's key card is. A hint never changes
 * the bot, the score or the stars — it only helps the player think.
 */
export function TournamentHint({ matchId }: { matchId: string }) {
  const { doc, season } = useTournamentContent();
  const completed = useProgress((s) => s.completed);
  const progress = useTournament();
  const [open, setOpen] = useState(false);
  const found = findMatch(season, matchId);
  if (!found) return null;
  const { stage, match } = found;
  const lesson = match.intel.lesson ? getLesson(match.intel.lesson) : undefined;
  const owned = (!!lesson && completed.includes(lesson.id)) || (stage.lessons.length > 0 && hasKeyCard(stage, completed, progress));
  const id = match.game.id;
  const tip = isArenaId(id) ? ARENA[id].coach[ARENA[id].coach.length - 1] : isGameId(id) ? GAMES[id].concept : null;

  if (!owned) {
    return lesson ? (
      <Pressable onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: lesson.id } })} accessibilityRole="link" accessibilityLabel={`Card hint locked. Finish lesson ${lesson.number}, ${lesson.title}, to use it.`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs }}>
        <Lock size={13} color={colors.textFaint} />
        <AppText variant="caption" color={colors.textMuted}>
          Card hint: finish “{lesson.title}” to unlock
        </AppText>
      </Pressable>
    ) : null;
  }

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Use your ${lesson?.concept ?? 'strategy'} card for a hint. One per game.`} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.insightSoft }, pressed && { opacity: 0.85 }]}>
        <Layers size={14} color={colors.insight} />
        <AppText variant="caption" color={colors.insight}>
          Use a card hint · one per game
        </AppText>
      </Pressable>
    );
  }

  return (
    <View style={{ gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.insightSoft }} accessibilityLiveRegion="polite">
      <AppText variant="overline" color={colors.insight}>
        {lesson ? `${lesson.concept} card` : 'Card hint'} · {doc.rivals.find((r) => r.id === stage.rival)?.name ?? ''}
      </AppText>
      <AppText variant="small" color={colors.text}>
        {match.intel.counter}
      </AppText>
      {tip ? (
        <AppText variant="small" color={colors.textBody}>
          {tip}
        </AppText>
      ) : null}
    </View>
  );
}
