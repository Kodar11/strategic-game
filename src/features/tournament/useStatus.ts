import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { useProgress } from '@/src/store/progress';
import { type StageStatus, allStages, currentStage, playStyle, strategistRating, titleFor } from '@/src/tournament/progress';
import { useTournamentContent } from './content';
import { useTournament } from './store';
import { loadTournamentStats, syncSoon } from './sync';

/** Loads saved progress when a screen gains focus (once per app run). */
export function useLoadTournament() {
  useFocusEffect(
    useCallback(() => {
      void useTournament
        .getState()
        .load()
        .then(syncSoon);
      void loadTournamentStats();
    }, []),
  );
}

/** Everything a tournament screen shows, derived from the installed season, saved progress and finished lessons. */
export function useTournamentStatus() {
  const { doc, season } = useTournamentContent();
  const progress = useTournament();
  const completed = useProgress((s) => s.completed);
  return useMemo(() => {
    const stages: StageStatus[] = allStages(season, progress, completed);
    const rating = strategistRating(progress.history);
    return {
      doc,
      season,
      progress,
      completed,
      stages,
      current: currentStage(season, progress, completed),
      rating,
      title: titleFor(rating),
      style: playStyle(season, progress.history),
      started: progress.history.length > 0,
    };
  }, [doc, season, progress, completed]);
}
