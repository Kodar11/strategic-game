import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { LESSON_IDS, type LessonId, lessonIdSchema } from '@/src/content/lessons';
import { type ChallengeDrafts, retryChallenge, sanitizeChallengeDrafts, submitChallenge } from '@/src/features/challenges/progress';
import type { PredictionAttempt } from '@/src/components/lesson/prediction-state';
import { type AssessmentId, getAssessment } from '@/src/features/assessments/content';
import { type AssessmentRuns, answerItem, currentAssessmentRun, retakeAssessment, sanitizeAssessmentRuns, submitAssessment } from '@/src/features/assessments/scoring';
import { type ScenarioRuns, applyScenarioInput, lockScenarioPrediction, restartScenario, sanitizeScenarioDone, sanitizeScenarioRuns, setScenarioPrediction } from '@/src/features/scenarios/runtime';
import type { Input } from '@/src/features/scenarios/types';
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
  /** The current run of each paired scenario (prediction, inputs, seed). Finished predictions also go to `learning`. */
  scenarioRuns: ScenarioRuns;
  /** Scenarios finished at least once; replays never remove one. */
  scenarioDone: string[];
  /** Module checkpoints and the final assessment: answers and first / best / latest scores. */
  assessmentRuns: AssessmentRuns;
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
      scenarioRuns: {},
      scenarioDone: [],
      assessmentRuns: {},
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
      resetProgress: () => set({ completed: [], runtime: {}, learning: [], challengeDrafts: {}, scenarioRuns: {}, scenarioDone: [], assessmentRuns: {} }),
    }),
    {
      name: 'strategic-game/progress',
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: ({ completed, runtime, settings, learning, goal, challengeDrafts, scenarioRuns, scenarioDone, assessmentRuns }) => ({
        completed,
        runtime,
        settings,
        learning,
        goal,
        challengeDrafts,
        scenarioRuns,
        scenarioDone,
        assessmentRuns,
      }),
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
        // Saves from before the 22-lesson curriculum simply have no scenario or assessment state yet.
        const scenarioRuns = sanitizeScenarioRuns(p.scenarioRuns);
        const scenarioDone = sanitizeScenarioDone(p.scenarioDone);
        const assessmentRuns = sanitizeAssessmentRuns(p.assessmentRuns);
        return { ...current, completed, runtime, settings, learning, goal, challengeDrafts, scenarioRuns, scenarioDone, assessmentRuns };
      },
      onRehydrateStorage: () => () => {
        useProgress.setState({ hydrated: true });
      },
    },
  ),
);
