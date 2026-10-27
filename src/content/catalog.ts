import type { Assessment } from '../features/assessments/content.ts';
import type { Challenge } from '../features/challenges/content.ts';
import type { GoalId, PredictionMeta, SkillMeta } from '../features/learning/records.ts';
import type { LabSpec } from '../features/lessons/curriculum/labs.ts';
import type { CurriculumLessonSpec } from '../features/lessons/curriculum/specs.ts';
import type { ScenarioSpec } from '../features/scenarios/types.ts';
import type { LessonId, LessonMeta, ModuleMeta } from './lessons.ts';

/**
 * The content catalog the app runs on: the published content from the database, validated and joined with the
 * registered engines (see build.ts). There is exactly one, installed once at start-up before any screen renders;
 * there is no built-in fallback. Content getters across the app (`lessons()`, `getScenario()`, …) read it.
 */

export interface Catalog {
  modules: readonly ModuleMeta[];
  lessons: readonly LessonMeta[];
  skills: readonly SkillMeta[];
  goals: readonly { id: GoalId; label: string }[];
  lessonPredictions: ReadonlyMap<string, PredictionMeta>;
  curriculum: ReadonlyMap<LessonId, CurriculumLessonSpec>;
  labs: ReadonlyMap<LessonId, LabSpec>;
  scenarios: readonly ScenarioSpec[];
  scenarioById: ReadonlyMap<string, ScenarioSpec>;
  challenges: readonly Challenge[];
  challengeById: ReadonlyMap<string, Challenge>;
  conceptReviews: Partial<Record<LessonId, { concept: string; summary: string }>>;
  assessments: readonly Assessment[];
}

let current: Catalog | null = null;

export function installCatalog(c: Catalog): void {
  current = c;
}

export function hasCatalog(): boolean {
  return current !== null;
}

export function catalog(): Catalog {
  if (!current) throw new Error('The content catalog has not been loaded yet.');
  return current;
}
