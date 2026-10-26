import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { LESSON_IDS, type LessonId, lessonIdSchema } from '@/src/content/lessons';
import { type ChallengeDrafts, retryChallenge, sanitizeChallengeDrafts, submitChallenge } from '@/src/features/challenges/progress';
import type { PredictionAttempt } from '@/src/components/lesson/prediction-state';
import { type GoalId, type LearningAttempt, type NewAttempt, mergeAttempts, sanitizeAttempts, sanitizeGoal } from '@/src/features/learning/records';
import { DEFAULT_SETTINGS, type Settings, sanitizeSettings } from './settings';

export type { Settings } from './settings';

export interface LessonRuntime {
  /** Total steps in the lesson when saved, for progress display. */
  total: number;
  step: number;
  /** Lesson-specific state; each lesson validates it with its own schema on resume. */
  data: unknown;
  updatedAt: number;
}

interface ProgressState {
  completed: LessonId[];
  runtime: Partial<Record<LessonId, LessonRuntime>>;
  settings: Settings;
  /** Evaluated prediction attempts — the source of truth for the profile and the export. Survives completion. */
  learning: LearningAttempt[];
  /** Optional "what would you like to get better at?" answer. Null until the learner chooses. */
  goal: GoalId | null;
  /** The current attempt at each practice challenge (draft or submitted). Submissions themselves live in `learning`. */
  challengeDrafts: ChallengeDrafts;
  hydrated: boolean;
  saveRuntime: (id: LessonId, step: number, total: number, data: unknown) => void;
  clearRuntime: (id: LessonId) => void;
  markComplete: (id: LessonId) => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  recordAttempts: (attempts: readonly (NewAttempt | null)[]) => void;
  setChallengeDraft: (id: string, attempt: PredictionAttempt<string>) => void;
  /** Lock and record the current challenge answer in one update. A no-op if it is incomplete or already submitted. */
  submitChallenge: (id: string) => void;
  retryChallenge: (id: string) => void;
  setGoal: (goal: GoalId | null) => void;
  resetProgress: () => void;
}

/** Static web rendering runs in Node where there is no localStorage; fall back to a no-op store there. */
const noopStorage: StateStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
const storage = Platform.OS === 'web' && typeof window === 'undefined' ? noopStorage : AsyncStorage;

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      completed: [],
      runtime: {},
      settings: DEFAULT_SETTINGS,
      learning: [],
      goal: null,
      challengeDrafts: {},
      hydrated: false,
      saveRuntime: (id, step, total, data) =>
        set((s) => ({ runtime: { ...s.runtime, [id]: { step, total, data, updatedAt: Date.now() } } })),
      clearRuntime: (id) =>
        set((s) => {
          const runtime = { ...s.runtime };
          delete runtime[id];
          return { runtime };
        }),
      markComplete: (id) =>
        set((s) => {
          const runtime = { ...s.runtime };
          delete runtime[id];
          return { completed: s.completed.includes(id) ? s.completed : [...s.completed, id], runtime };
        }),
      setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
      // Deduplicated by attempt id, so re-renders, resumes and repeated effects never add a record twice.
      recordAttempts: (attempts) =>
        set((s) => {
          const learning = mergeAttempts(s.learning, attempts, { completed: s.completed });
          return learning === s.learning ? s : { learning };
        }),
      setChallengeDraft: (id, attempt) =>
        set((s) => (s.challengeDrafts[id]?.locked ? s : { challengeDrafts: { ...s.challengeDrafts, [id]: attempt } })),
      submitChallenge: (id) => set((s) => submitChallenge(s, id) ?? s),
      retryChallenge: (id) =>
        set((s) => {
          const challengeDrafts = retryChallenge(s.challengeDrafts, id);
          return challengeDrafts === s.challengeDrafts ? s : { challengeDrafts };
        }),
      setGoal: (goal) => set({ goal }),
      // Resetting progress also clears the learning history built from it; the goal is a preference and stays.
      resetProgress: () => set({ completed: [], runtime: {}, learning: [], challengeDrafts: {} }),
    }),
    {
      name: 'strategic-game/progress',
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: ({ completed, runtime, settings, learning, goal, challengeDrafts }) => ({ completed, runtime, settings, learning, goal, challengeDrafts }),
      // Drop anything unrecognised so a corrupted or older save can never break the app.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProgressState>;
        const completed = Array.isArray(p.completed)
          ? p.completed.filter((id): id is LessonId => lessonIdSchema.safeParse(id).success)
          : [];
        const runtime: ProgressState['runtime'] = {};
        if (p.runtime && typeof p.runtime === 'object') {
          for (const id of LESSON_IDS) {
            const r = p.runtime[id];
            if (r && Number.isFinite(r.step) && Number.isFinite(r.total)) runtime[id] = r;
          }
        }
        const settings = sanitizeSettings(p.settings);
        // Saves from before the learning record existed simply start with an empty history.
        const learning = sanitizeAttempts(p.learning);
        const goal = sanitizeGoal(p.goal);
        // Saves from before practice challenges existed have no drafts.
        const challengeDrafts = sanitizeChallengeDrafts(p.challengeDrafts);
        return { ...current, completed, runtime, settings, learning, goal, challengeDrafts };
      },
      onRehydrateStorage: () => () => {
        useProgress.setState({ hydrated: true });
      },
    },
  ),
);
