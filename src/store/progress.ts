import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import type { LessonId } from '@/src/content/lessons';
import { retryChallenge, submitChallenge } from '@/src/features/challenges/progress';
import type { PredictionAttempt } from '@/src/components/lesson/prediction-state';
import { type AssessmentId, getAssessment } from '@/src/features/assessments/content';
import { answerItem, currentAssessmentRun, retakeAssessment, submitAssessment } from '@/src/features/assessments/scoring';
import { applyScenarioInput, lockScenarioPrediction, restartScenario, setScenarioPrediction } from '@/src/features/scenarios/runtime';
import type { Input } from '@/src/features/scenarios/types';
import { type GoalId, type NewAttempt, mergeAttempts } from '@/src/features/learning/records';
import { EMPTY_PROGRESS, type ProgressData, sanitizeProgress } from './progress-state';
import { DEFAULT_SETTINGS, type Settings, sanitizeSettings } from './settings';

export type { Settings } from './settings';
export type { LessonRuntime } from './progress-state';

/**
 * The app's progress state. Learner progress (`ProgressData`) is loaded from Supabase at start-up and every change
 * is written back through the sync outbox (src/data/session.ts); the store itself stays synchronous, so screens
 * behave exactly as before. Only `settings` — device preferences — is kept on the device.
 */
interface ProgressState extends ProgressData {
  settings: Settings;
  /** True once the learner's progress has been loaded from the server. */
  hydrated: boolean;
  /** Counts progress resets, so the sync layer can tell a reset from ordinary changes. */
  resets: number;
  /** Replace the learner's progress with what the server returned (validated as saved progress always was). */
  hydrate: (saved: unknown) => void;
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
  setScenarioPrediction: (id: string, attempt: PredictionAttempt<string>) => void;
  lockScenarioPrediction: (id: string) => void;
  /** Apply one move. Finishing the game records the prediction and marks the scenario done, in one update. */
  scenarioInput: (id: string, input: Input) => void;
  restartScenario: (id: string) => void;
  answerAssessment: (id: AssessmentId, itemId: string, optionId: string) => void;
  submitAssessment: (id: AssessmentId) => void;
  retakeAssessment: (id: AssessmentId) => void;
  setAssessmentReflection: (id: AssessmentId, text: string) => void;
  toggleAssessmentRubric: (id: AssessmentId, index: number) => void;
  resetProgress: () => void;
}

/** Static web rendering runs in Node where there is no localStorage; fall back to a no-op store there. */
const noopStorage: StateStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
const deviceStorage = Platform.OS === 'web' && typeof window === 'undefined' ? noopStorage : AsyncStorage;

/** Before the migration everything was saved under this key. Only its settings are read (once); then it is removed. */
const LEGACY_KEY = 'strategic-game/progress';
const storage: StateStorage = {
  getItem: async (name) => (await deviceStorage.getItem(name)) ?? (await deviceStorage.getItem(LEGACY_KEY)),
  setItem: async (name, value) => {
    await deviceStorage.setItem(name, value);
    await deviceStorage.removeItem(LEGACY_KEY);
  },
  removeItem: (name) => deviceStorage.removeItem(name),
};

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      ...EMPTY_PROGRESS,
      settings: DEFAULT_SETTINGS,
      hydrated: false,
      resets: 0,
      hydrate: (saved) => set({ ...sanitizeProgress(saved), hydrated: true }),
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
      setScenarioPrediction: (id, attempt) =>
        set((s) => {
          const scenarioRuns = setScenarioPrediction(s, id, attempt);
          return scenarioRuns ? { scenarioRuns } : s;
        }),
      lockScenarioPrediction: (id) =>
        set((s) => {
          const scenarioRuns = lockScenarioPrediction(s, id);
          return scenarioRuns ? { scenarioRuns } : s;
        }),
      scenarioInput: (id, input) => set((s) => applyScenarioInput(s, id, input) ?? s),
      restartScenario: (id) =>
        set((s) => {
          const scenarioRuns = restartScenario(s, id);
          return scenarioRuns ? { scenarioRuns } : s;
        }),
      answerAssessment: (id, itemId, optionId) =>
        set((s) => {
          const a = getAssessment(id);
          const item = a?.items.find((i) => i.id === itemId);
          if (!a || !item) return s;
          const run = currentAssessmentRun(s.assessmentRuns, a);
          const next = answerItem(run, item, optionId);
          return next === run ? s : { assessmentRuns: { ...s.assessmentRuns, [id]: next } };
        }),
      submitAssessment: (id) =>
        set((s) => {
          const a = getAssessment(id);
          const next = a ? submitAssessment(currentAssessmentRun(s.assessmentRuns, a), a) : null;
          return next ? { assessmentRuns: { ...s.assessmentRuns, [id]: next } } : s;
        }),
      retakeAssessment: (id) =>
        set((s) => {
          const a = getAssessment(id);
          return a ? { assessmentRuns: { ...s.assessmentRuns, [id]: retakeAssessment(currentAssessmentRun(s.assessmentRuns, a)) } } : s;
        }),
      setAssessmentReflection: (id, text) =>
        set((s) => {
          const a = getAssessment(id);
          if (!a) return s;
          const run = currentAssessmentRun(s.assessmentRuns, a);
          return run.submitted ? s : { assessmentRuns: { ...s.assessmentRuns, [id]: { ...run, reflection: text.slice(0, 4000) } } };
        }),
      toggleAssessmentRubric: (id, index) =>
        set((s) => {
          const a = getAssessment(id);
          if (!a?.reflection || index < 0 || index >= a.reflection.rubric.length) return s;
          const run = currentAssessmentRun(s.assessmentRuns, a);
          const rubric = run.rubric.includes(index) ? run.rubric.filter((i) => i !== index) : [...run.rubric, index];
          return { assessmentRuns: { ...s.assessmentRuns, [id]: { ...run, rubric } } };
        }),
      // Resetting progress also clears the learning history built from it; the goal is a preference and stays.
      resetProgress: () => set((s) => ({ completed: [], runtime: {}, learning: [], challengeDrafts: {}, scenarioRuns: {}, scenarioDone: [], assessmentRuns: {}, resets: s.resets + 1 })),
    }),
    {
      // Device preferences only. Learner progress lives in Supabase.
      name: 'strategic-game/settings',
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: ({ settings }) => ({ settings }),
      merge: (persisted, current) => ({ ...current, settings: sanitizeSettings((persisted as { settings?: unknown } | null)?.settings) }),
    },
  ),
);
