import { useGlobalSearchParams, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';

import { type LessonId, getLesson } from '@/src/content/lessons';
import { useProgress } from '@/src/store/progress';
import { telemetry } from './core';
import { LessonTracker, MatchTracker, type MatchMeta, type MatchProgress } from './lifecycle';
import { screenOf } from './routes';

export type { MatchMeta, MatchProgress } from './lifecycle';

const emit: ConstructorParameters<typeof MatchTracker>[0] = (name, props) => telemetry.track(name, props);

/** Root layout: one `$screen` per allow-listed screen view (routes.ts). */
export function useScreenTracking(): void {
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const view = screenOf(segments, params);
  const key = view?.key ?? null;
  useEffect(() => {
    if (view) telemetry.screen(view);
    // The view is derived from the key; a re-render with the same key is the same screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * The game_* events for one match screen instance (MatchTracker in lifecycle.ts). `meta` null means "not known yet"
 * (a server match still loading): nothing is sent until it is.
 */
export function useGameTelemetry(meta: MatchMeta | null, progress: MatchProgress): void {
  const [tracker] = useState(() => new MatchTracker(emit));
  // Every render: the tracker ignores repeats, and keeps the latest values for the exit report.
  useEffect(() => {
    tracker.update(meta, progress);
  });
  useEffect(() => () => tracker.close(), [tracker]);
}

/** The lesson_* events, from the one hook every lesson runs on (useLessonFlow; LessonTracker in lifecycle.ts). */
export function useLessonTelemetry(lessonId: LessonId, step: number, totalSteps: number): void {
  const [tracker] = useState(() => {
    const l = getLesson(lessonId);
    return new LessonTracker({
      emit,
      info: { lesson_id: lessonId, ...(l ? { lesson_number: l.number, module: l.module } : {}) },
      totalSteps,
      completedBefore: () => useProgress.getState().completed.includes(lessonId),
      // A child's effect runs before the root layout records the new screen, so "current" is usually still the
      // screen the lesson was opened from; after a Restart it is the lesson itself.
      source: () => (telemetry.currentScreen === 'lesson' ? telemetry.previousScreen : telemetry.currentScreen),
    });
  });
  useEffect(() => {
    tracker.update(step);
  }, [tracker, step]);
  useEffect(() => () => tracker.close(), [tracker]);
}
