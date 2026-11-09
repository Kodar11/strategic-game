import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { KeyRound, Layers, Swords } from '@/src/components/ui/icons';
import { getLesson } from '@/src/content/lessons';
import { haptic } from '@/src/utils/feedback';
import { stageStatus } from '@/src/tournament/progress';
import { colors, radius, space } from '@/src/theme/tokens';
import { rivalOf } from '../content';
import { playCue } from '../sound';
import { useLoadTournament, useTournamentStatus } from '../useStatus';
import { RivalMark } from './parts';

/**
 * At the end of a lesson: what it just gave the player in the Tournament. Every lesson is a strategy card; a lesson
 * that is the first of its stage's lessons finished (and no check passed) earns that stage's key card, and the
 * button goes straight to the rival when the duel is open. "Learning makes you stronger", said where it happens.
 */
export function TournamentUnlock({ lessonId }: { lessonId: string }) {
  useLoadTournament();
  const t = useTournamentStatus();
  const lesson = getLesson(lessonId);
  // The lesson is being completed on this screen; count it whether or not the store has caught up.
  const done: readonly string[] = t.completed;
  const completed = done.includes(lessonId) ? done : [...done, lessonId];
  const index = t.season.stages.findIndex((s) => s.lessons.includes(lessonId));
  const stage = index >= 0 ? t.season.stages[index] : null;
  const status = stage ? stageStatus(t.season, index, t.progress, completed) : null;
  const firstKey = !!stage && stage.lessons.filter((l) => completed.includes(l)).length === 1 && t.progress.checks[stage.id]?.passed !== true;
  const cued = useRef(false);

  useEffect(() => {
    if (!firstKey || cued.current || !t.progress) return;
    cued.current = true;
    haptic.success();
    playCue('unlock');
  }, [firstKey, t.progress]);

  if (!lesson) return null;
  const rival = stage ? rivalOf(t.doc, stage.rival) : null;
  const duel = stage?.matches.find((m) => m.duel);
  const left = status ? status.stage.matches.filter((m) => !m.duel && !(t.progress.matches[m.id]?.won || t.progress.matches[m.id]?.skipped)).length : 0;

  return (
    <View style={styles.card} accessible={false}>
      <View style={styles.row} accessible accessibilityLabel={`Strategy card collected: ${lesson.concept}.`}>
        <Layers size={16} color={colors.insight} />
        <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
          Strategy card collected: <AppText variant="small" weight="semibold" color={colors.text}>{lesson.concept}</AppText>
        </AppText>
      </View>

      {firstKey && stage && rival && status ? (
        <>
          <View style={styles.row}>
            <RivalMark rival={rival} size={44} expression="concerned" />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <KeyRound size={13} color={colors.insight} />
                <AppText variant="overline" color={colors.insight}>
                  Key card earned
                </AppText>
              </View>
              <AppText variant="bodyStrong" accessibilityRole="header">
                {status.duelOpen ? `You can now face ${rival.name}.` : status.unlocked ? `${rival.name}’s duel needs ${left} more ${left === 1 ? 'match' : 'matches'} cleared.` : `Ready for ${rival.name} when you reach ${stage.title}.`}
              </AppText>
            </View>
          </View>
          {status.duelOpen && duel ? (
            <Button label={`Face ${rival.name}`} icon={Swords} iconPosition="left" compact onPress={() => router.push({ pathname: '/tournament/match/[matchId]', params: { matchId: duel.id } })} />
          ) : (
            <Button label={status.unlocked ? `Open ${stage.title}` : 'Open the Tournament'} variant="secondary" compact onPress={() => (status.unlocked ? router.push({ pathname: '/tournament/[stageId]', params: { stageId: stage.id } }) : router.navigate('/'))} />
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
