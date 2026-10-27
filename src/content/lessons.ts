import { z } from 'zod';

import { catalog } from './catalog.ts';

/**
 * The lessons the app can run: each id has a registered implementation (`src/features/lessons/index.ts`). Titles,
 * order, modules and the rest of each lesson's metadata are content, loaded from the database. IDs are stable (they
 * appear in saved progress and exported learning data), so they never change meaning: the five original lessons
 * keep their original IDs even where the curriculum moved them.
 * In particular `strategy-detective` is the Two-Thirds-Average lesson (now Lesson 14, "Reasoning from Beliefs"),
 * and the curriculum's Lesson 2 "Strategy Detective" (dominance) is the new `iterated-dominance`.
 */
export const LESSON_IDS = [
  'cooperation-trap',
  'iterated-dominance',
  'best-response',
  'coordination-problem',
  'predictability-trap',
  'market-competition',
  'evolution',
  'sequential-moves',
  'credibility',
  'incentive-shift',
  'bargaining',
  'war-of-attrition',
  'repeated-cooperation',
  'strategy-detective',
  'bayesian-uncertainty',
  'signaling',
  'auctions',
  'market-quality',
  'coalitions',
  'voting',
  'brinkmanship',
  'strategic-practice',
] as const;

/** The five original lessons are hand-built components; the rest share the curriculum runner. */
export const ORIGINAL_LESSON_IDS = ['cooperation-trap', 'coordination-problem', 'predictability-trap', 'incentive-shift', 'strategy-detective'] as const satisfies readonly LessonId[];

export const lessonIdSchema = z.enum(LESSON_IDS);
export type LessonId = z.infer<typeof lessonIdSchema>;

export type SceneId = 'market' | 'crowd' | 'meetup' | 'shootout' | 'policy';

export type ModuleId = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6';

export interface ModuleMeta {
  id: ModuleId;
  number: number;
  title: string;
  objective: string;
}

export interface LessonMeta {
  id: LessonId;
  number: number;
  module: ModuleId;
  title: string;
  concept: string;
  description: string;
  minutes: number;
  scene: SceneId;
  accent: 'blue' | 'orange' | 'cyan' | 'amber';
}

export function allModules(): readonly ModuleMeta[] {
  return catalog().modules;
}

/** The published lessons, in curriculum order. */
export function allLessons(): readonly LessonMeta[] {
  return catalog().lessons;
}

export function getLesson(id: string | undefined): LessonMeta | undefined {
  return allLessons().find((l) => l.id === id);
}

export function nextLesson(id: LessonId): LessonMeta | undefined {
  const all = allLessons();
  const i = all.findIndex((l) => l.id === id);
  return i >= 0 ? all[i + 1] : undefined;
}

export function lessonsInModule(module: ModuleId): LessonMeta[] {
  return allLessons().filter((l) => l.module === module);
}

export function getModule(id: ModuleId): ModuleMeta {
  return allModules().find((m) => m.id === id)!;
}
