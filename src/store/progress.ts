import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { LESSON_IDS, type LessonId, lessonIdSchema } from '@/src/content/lessons';
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
  hydrated: boolean;
  saveRuntime: (id: LessonId, step: number, total: number, data: unknown) => void;
  clearRuntime: (id: LessonId) => void;
  markComplete: (id: LessonId) => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
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
      resetProgress: () => set({ completed: [], runtime: {} }),
    }),
    {
      name: 'strategic-game/progress',
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: ({ completed, runtime, settings }) => ({ completed, runtime, settings }),
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
        return { ...current, completed, runtime, settings };
      },
      onRehydrateStorage: () => () => {
        useProgress.setState({ hydrated: true });
      },
    },
  ),
);
