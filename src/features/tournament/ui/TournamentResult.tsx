import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, RotateCcw, Swords, Trophy } from '@/src/components/ui/icons';
import { getLesson } from '@/src/content/lessons';
import type { Outcome } from '@/src/games/core';
import { type Level, type Recorded, findMatch, recordOf, share, stars } from '@/src/tournament/progress';
import { colors, radius, space } from '@/src/theme/tokens';
import { rivalOf, useTournamentContent } from '../content';
import { useTournament } from '../store';
import { useTournamentStats } from '../sync';
import { Kicker, RivalMark, StarRow, toneColors } from './parts';

export interface ResultDebrief {
  /** What actually happened in this match, from the engine's own analysis. */
  moments?: readonly string[];
  insight?: string;
}

/**
 * The tournament layer over a finished match on the existing play screens: records the game once, then shows the
 * reveal (a win: how the rival was beaten) or the debrief (a loss: the trap, the idea, a rematch). The play screen's
 * own result stays below it with the full score.
 */
export function TournamentResult({ matchId, outcome, level, readCorrect, debrief, onRematch, replay = false }: { matchId: string; outcome: Outcome; level: Level; readCorrect: boolean; debrief?: ResultDebrief; onRematch: () => void; replay?: boolean }) {
  const { doc, season } = useTournamentContent();
  const found = findMatch(season, matchId);
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const once = useRef(false);
  const stats = useTournamentStats((st) => st.stats[matchId]);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void useTournament
      .getState()
      .load()
      .then(() => setRecorded(useTournament.getState().record(matchId, { outcome, level, read: readCorrect, replay })));
  }, [matchId, outcome, level, readCorrect, replay]);

  if (!found) return null;
  const { stage, match } = found;
  const rival = rivalOf(doc, stage.rival);
  const tone = toneColors(rival.tone);
  const rec = recorded ? recordOf(recorded.progress, match.id) : null;
  const win = outcome === 'win';
  const games = rec ? rec.wins + rec.losses + rec.draws : 1;
  const pool = win ? rival.lines.onPlayerWin : rival.lines.onPlayerLoss;
  const line = pool[(games - 1) % pool.length];
  const gained = recorded ? recorded.starsAfter - recorded.starsBefore : 0;
  const lesson = match.intel.lesson ? getLesson(match.intel.lesson) : undefined;
  const toStage = () => router.dismissTo({ pathname: '/tournament/[stageId]', params: { stageId: stage.id } });
  const moments = (debrief?.moments ?? []).slice(0, 3);
  const beatenShare = stats ? share(stats.won, stats.players) : null;
  const readShare = stats ? share(stats.read, stats.players) : null;
  const rare = readCorrect && readShare !== null && readShare <= 35 ? `Only ${readShare}% of players have read ${rival.name}’s style here.` : win && beatenShare !== null && beatenShare <= 50 ? `Only ${beatenShare}% of players have beaten this match.` : null;

  return (
    <View style={[styles.panel, { borderColor: win ? tone.solid : colors.borderStrong }]} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {match.duel ? <Swords size={14} color={tone.fg} /> : null}
        <Kicker tone={rival.tone}>{`${replay ? 'Hard Replay · ' : ''}${stage.title} · ${rival.name}`}</Kicker>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <RivalMark rival={rival} size={56} expression={recorded?.rivalDefeated ? 'surprised' : win ? 'frustrated' : 'satisfied'} />
        <View style={{ flex: 1, gap: space.xs }}>
          <AppText variant="title" accessibilityRole="header">
            {recorded?.rivalDefeated ? `${rival.name} is out` : win ? 'You won' : outcome === 'draw' ? 'Not quite a win' : `${rival.name} won this one`}
          </AppText>
          <AppText color={colors.textBody} style={{ fontStyle: 'italic' }}>
            “{recorded?.rivalDefeated ? rival.lines.defeated : line}”
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <StarRow count={rec ? stars(rec) : 0} size={18} />
        {gained > 0 ? (
          <AppText variant="caption" color={colors.insight}>
            +{gained} {gained === 1 ? 'star' : 'stars'}
          </AppText>
        ) : null}
        {readCorrect ? (
          <AppText variant="caption" color={colors.success}>
            Read correctly
          </AppText>
        ) : null}
      </View>

      {rare ? (
        <AppText variant="small" color={colors.insight}>
          {rare}
        </AppText>
      ) : null}

      {win ? (
        <View style={styles.section}>
          <AppText variant="overline" color={tone.fg}>
            How you beat them
          </AppText>
          {moments.length ? (
            moments.map((m, i) => (
              <AppText key={i} variant="small" color={colors.textBody}>
                · {m}
              </AppText>
            ))
          ) : (
            <AppText variant="small" color={colors.textBody}>
              {match.intel.counter}
            </AppText>
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <AppText variant="overline" color={colors.rivalText}>
            The trap
          </AppText>
          <AppText variant="small" color={colors.textBody}>
            {match.intel.tendency}
          </AppText>
          <AppText variant="small" color={colors.text}>
            {debrief?.insight ?? match.intel.counter}
          </AppText>
        </View>
      )}

      {recorded?.replayCleared ? (
        <View style={[styles.banner, { backgroundColor: colors.insightSoft }]}>
          <Trophy size={16} color={colors.insight} />
          <AppText variant="small" color={colors.insight} style={{ flex: 1 }}>
            Cleared in the Hard Replay.
          </AppText>
        </View>
      ) : null}

      {recorded?.stageCleared ? (
        <View style={[styles.banner, { backgroundColor: colors.successSoft }]}>
          <Trophy size={16} color={colors.success} />
          <AppText variant="small" color={colors.success} style={{ flex: 1 }}>
            {stage.title} cleared. The next stage is open.
          </AppText>
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        {win ? (
          <Button label="Back to the bracket" icon={ArrowRight} onPress={toStage} />
        ) : (
          <>
            <Button label="Rematch" icon={RotateCcw} iconPosition="left" onPress={onRematch} />
            {lesson && games >= 2 ? <Button label={`Full lesson: ${lesson.title}`} variant="secondary" onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: lesson.id } })} /> : null}
            <Button label="Back to the bracket" variant="ghost" onPress={toStage} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, backgroundColor: colors.surface },
  section: { gap: space.xs },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.md },
});
