import { z } from 'zod';

import type { LessonId, LessonMeta } from './lessons.ts';

/**
 * Lesson categories: a browsing lens over the existing lessons, loaded from Supabase (`get_lesson_categories()`).
 * Each lesson has at most one primary category; lessons keep their ids, order, modules and progress. Categories are
 * optional for the app: if they can't be loaded or don't check out, the lesson list simply shows no category filter.
 */

export interface Category {
  id: string;
  title: string;
  description: string;
}

export interface CategoryIndex {
  /** Display order. Categories with no published lesson are left out. */
  categories: readonly Category[];
  /** The primary category of each assigned lesson. */
  byLesson: ReadonlyMap<LessonId, string>;
}

const documentSchema = z.strictObject({
  categories: z.array(
    z.strictObject({
      id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      position: z.number().int().nonnegative(),
      title: z.string().min(1).max(80),
      description: z.string().min(1).max(400),
    }),
  ),
  assignments: z.record(z.string(), z.string()),
});

export type CategoryBuild = { ok: true; index: CategoryIndex; warnings: string[] } | { ok: false; problems: string[] };

/**
 * Validate the database's categories against the installed catalog. Assignments to lessons this catalog doesn't have
 * are ignored (with a warning), as are categories nobody is assigned to; an unassigned lesson still appears under
 * "All". A malformed document is refused as a whole.
 */
export function buildCategoryIndex(raw: unknown, lessons: readonly LessonMeta[]): CategoryBuild {
  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  const doc = parsed.data;
  const ids = new Set<string>();
  for (const c of doc.categories) {
    if (ids.has(c.id)) return { ok: false, problems: [`duplicate category ${c.id}`] };
    ids.add(c.id);
  }
  const warnings: string[] = [];
  const known = new Set<string>(lessons.map((l) => l.id));
  const byLesson = new Map<LessonId, string>();
  for (const [lesson, category] of Object.entries(doc.assignments)) {
    if (!known.has(lesson)) warnings.push(`category assignment for unknown lesson ${lesson}`);
    else if (!ids.has(category)) warnings.push(`lesson ${lesson} is assigned to unknown category ${category}`);
    else byLesson.set(lesson as LessonId, category);
  }
  for (const l of lessons) if (!byLesson.has(l.id)) warnings.push(`lesson ${l.id} has no category`);
  const used = new Set(byLesson.values());
  const categories = [...doc.categories]
    .sort((a, b) => a.position - b.position)
    .filter((c) => used.has(c.id))
    .map(({ id, title, description }) => ({ id, title, description }));
  return { ok: true, index: { categories, byLesson }, warnings };
}

/** The lessons of one category, in curriculum order. */
export function lessonsInCategory(index: CategoryIndex, category: string, lessons: readonly LessonMeta[]): LessonMeta[] {
  return lessons.filter((l) => index.byLesson.get(l.id) === category);
}

/** Completed / total lessons per category, counting only lessons that exist in the catalog. */
export function categoryProgress(index: CategoryIndex, lessons: readonly LessonMeta[], completed: readonly LessonId[]): Map<string, { done: number; total: number }> {
  const out = new Map(index.categories.map((c) => [c.id, { done: 0, total: 0 }]));
  for (const l of lessons) {
    const p = out.get(index.byLesson.get(l.id) ?? '');
    if (!p) continue;
    p.total += 1;
    if (completed.includes(l.id)) p.done += 1;
  }
  return out;
}

let current: CategoryIndex | null = null;

export function installCategories(index: CategoryIndex | null): void {
  current = index;
}

/** The installed categories, or null when they couldn't be loaded (the lesson list then shows no filter). */
export function lessonCategories(): CategoryIndex | null {
  return current;
}
