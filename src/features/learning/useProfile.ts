import { useMemo } from 'react';

import { type LessonId, allLessons } from '@/src/content/lessons';
import { useDaily } from '@/src/data/daily-session';
import { dailyEvidence } from '@/src/features/daily/evidence';
import { useProgress } from '@/src/store/progress';
import { buildProfile } from './profile';
import { summariseProfile } from './summary';

/**
 * The Strategic Thinking Profile for the profile screens: built from the learning record, lesson progress and
 * qualifying Daily Challenge answers (src/features/daily/evidence.ts). Nothing here is stored.
 */
export function useProfile() {
  const hydrated = useProgress((s) => s.hydrated);
  const learning = useProgress((s) => s.learning);
  const completed = useProgress((s) => s.completed);
  // Which lessons are in progress, as a string so the selector result is stable: the runtime map itself changes on every
  // saved lesson step, and the profile only cares when a lesson starts or finishes.
  const inProgressKey = useProgress((s) =>
    allLessons()
      .filter((l) => (s.runtime[l.id]?.step ?? 0) > 0)
      .map((l) => l.id)
      .join(','),
  );
  const goal = useProgress((s) => s.goal);
  const dailyHistory = useDaily((s) => s.history);

  const inProgress = useMemo(() => (inProgressKey ? (inProgressKey.split(',') as LessonId[]) : []), [inProgressKey]);
  const daily = useMemo(() => (dailyHistory ? dailyEvidence(dailyHistory) : []), [dailyHistory]);
  const profile = useMemo(() => buildProfile({ attempts: learning, completed, inProgress, goal, daily }), [learning, completed, inProgress, goal, daily]);
  const summary = useMemo(() => summariseProfile(profile, completed), [profile, completed]);

  return { hydrated, profile, summary, attempts: learning, completed, goal };
}
