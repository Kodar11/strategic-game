import { useCallback, useEffect, useRef, useState } from 'react';
import type { z } from 'zod';

import type { LessonId } from '@/src/content/lessons';
import type { NewAttempt } from '@/src/features/learning/records';
import { useProgress } from '@/src/store/progress';

/**
 * Runtime state for one lesson: current step plus lesson-specific data.
 * Saved after every change so leaving mid-lesson resumes where the learner was.
 * Persisted data is validated with the lesson's schema; anything invalid restarts the lesson cleanly.
 */
export function useLessonFlow<S extends z.ZodType>(
  lessonId: LessonId,
  schema: S,
  initial: z.infer<S>,
  totalSteps: number,
  /**
   * The lesson's evaluated predictions for the current state (null for anything not evaluated yet). A module-level
   * pure function; records are deduplicated by attempt id, so calling it on every change is safe.
   */
  records?: (data: z.infer<S>) => (NewAttempt | null)[],
) {
  type Data = z.infer<S>;

  const [state, setState] = useState<{ step: number; data: Data }>(() => {
    const saved = useProgress.getState().runtime[lessonId];
    if (saved) {
      const parsed = schema.safeParse(saved.data);
      // Never resume onto the completion screen; that state is recorded as "completed" instead.
      if (parsed.success && saved.step >= 0 && saved.step < totalSteps - 1) {
        return { step: saved.step, data: parsed.data as Data };
      }
    }
    return { step: 0, data: initial };
  });

  const completedRef = useRef(false);
  const saveRuntime = useProgress((s) => s.saveRuntime);
  const markComplete = useProgress((s) => s.markComplete);
  const recordAttempts = useProgress((s) => s.recordAttempts);

  // Add newly evaluated predictions to the learning record. Restored and re-rendered states produce the same ids,
  // so nothing is recorded twice; a retry or replay locks a new attempt with a new id.
  useEffect(() => {
    if (records) recordAttempts(records(state.data));
  }, [records, recordAttempts, state.data]);

  // Reaching the final step (only possible after every gated step) completes the lesson and clears its runtime.
  useEffect(() => {
    if (state.step === totalSteps - 1) {
      if (!completedRef.current) {
        completedRef.current = true;
        markComplete(lessonId);
      }
      return;
    }
    completedRef.current = false;
    saveRuntime(lessonId, state.step, totalSteps, state.data);
  }, [lessonId, markComplete, saveRuntime, state, totalSteps]);

  const update = useCallback((patch: Partial<Data> | ((d: Data) => Partial<Data>)) => {
    setState((s) => ({ ...s, data: { ...(s.data as object), ...(typeof patch === 'function' ? patch(s.data) : patch) } as Data }));
  }, []);

  const goTo = useCallback(
    (step: number) => setState((s) => ({ ...s, step: Math.max(0, Math.min(totalSteps - 1, step)) })),
    [totalSteps],
  );

  const restart = useCallback(() => {
    setState({ step: 0, data: initial });
    // `initial` is a module-level constant for each lesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { step: state.step, data: state.data, update, goTo, restart };
}
