import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { z } from 'zod';

import type { LessonId } from '@/src/content/lessons';
import type { NewAttempt } from '@/src/features/learning/records';
import { useProgress } from '@/src/store/progress';

/**
 * How long after a change its resume point is saved. The save fans out to every screen that shows lesson progress and
 * to the sync queue, so it runs just after the tap's frame rather than inside it, and a burst of changes (a slider
 * drag, quick taps) is saved once.
 */
const SAVE_DELAY_MS = 250;

/**
 * Runtime state for one lesson: current step plus lesson-specific data.
 * Saved shortly after every change — and at once when the lesson is left or the app goes to the background — so
 * leaving mid-lesson resumes where the learner was.
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

  const pendingSave = useRef<(() => void) | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    pendingSave.current = null;
  }, []);
  const flushSave = useCallback(() => {
    const save = pendingSave.current;
    cancelSave();
    save?.();
  }, [cancelSave]);

  // Reaching the final step (only possible after every gated step) completes the lesson and clears its runtime.
  useEffect(() => {
    if (state.step === totalSteps - 1) {
      // A save still waiting would put back the runtime that completing the lesson clears.
      cancelSave();
      if (!completedRef.current) {
        completedRef.current = true;
        markComplete(lessonId);
      }
      return;
    }
    completedRef.current = false;
    pendingSave.current = () => saveRuntime(lessonId, state.step, totalSteps, state.data);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DELAY_MS);
  }, [cancelSave, flushSave, lessonId, markComplete, saveRuntime, state, totalSteps]);

  // Never lose the latest step: save it at once when the lesson closes or the app leaves the foreground (the sync
  // layer sends what is queued at that moment).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') flushSave();
    });
    return () => {
      sub.remove();
      flushSave();
    };
  }, [flushSave]);

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
