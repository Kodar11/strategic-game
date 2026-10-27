/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { createDatabase, pgRpc } from '../../../supabase/__tests__/pg.ts';
import { categoryRepository } from '../../data/repositories.ts';
import { buildCategoryIndex, categoryProgress, lessonsInCategory } from '../categories.ts';
import { allLessons } from '../lessons.ts';
import { installSeedCatalog } from '../seed.ts';

installSeedCatalog();

const doc = (assignments: Record<string, string>) => ({
  categories: [
    { id: 'b', position: 1, title: 'B', description: 'Second' },
    { id: 'a', position: 0, title: 'A', description: 'First' },
    { id: 'empty', position: 2, title: 'Empty', description: 'Nobody' },
  ],
  assignments,
});

describe('Lesson category index', () => {
  it('orders categories, drops empty ones, and ignores assignments it cannot honour', () => {
    const r = buildCategoryIndex(doc({ 'cooperation-trap': 'a', 'best-response': 'b', 'not-a-lesson': 'a', voting: 'nope' }), allLessons());
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.index.categories.map((c) => c.id), ['a', 'b']);
    assert.equal(r.index.byLesson.get('cooperation-trap'), 'a');
    assert.ok(r.warnings.some((w) => /unknown lesson not-a-lesson/.test(w)));
    assert.ok(r.warnings.some((w) => /voting is assigned to unknown category nope/.test(w)));
    assert.ok(r.warnings.some((w) => /lesson coalitions has no category/.test(w)));
  });

  it('refuses a malformed document as a whole', () => {
    assert.equal(buildCategoryIndex({ categories: 'x' }, allLessons()).ok, false);
    assert.equal(buildCategoryIndex({ ...doc({}), extra: 1 }, allLessons()).ok, false);
  });

  it('filters lessons in curriculum order and counts completion per category', () => {
    const r = buildCategoryIndex(doc({ 'best-response': 'a', 'cooperation-trap': 'a', voting: 'b' }), allLessons());
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(lessonsInCategory(r.index, 'a', allLessons()).map((l) => l.id), ['cooperation-trap', 'best-response']);
    const p = categoryProgress(r.index, allLessons(), ['cooperation-trap', 'evolution']);
    assert.deepEqual(p.get('a'), { done: 1, total: 2 });
    assert.deepEqual(p.get('b'), { done: 0, total: 1 });
  });
});

describe('Lesson categories from the database', () => {
  let db: PGlite;
  before(async () => {
    db = await createDatabase();
  });
  after(async () => {
    await db.close();
  });

  it('assigns every published lesson, with stable ids and order, and reflects edits made in the database', async () => {
    const repo = categoryRepository(pgRpc(db, null));
    const { index, warnings } = await repo.fetchCategories(allLessons());
    assert.deepEqual(warnings, []);
    assert.equal(index.byLesson.size, 22);
    const lessons = allLessons();
    const total = index.categories.reduce((n, c) => n + lessonsInCategory(index, c.id, lessons).length, 0);
    assert.equal(total, 22, 'every lesson appears in exactly one category');
    assert.deepEqual(lessonsInCategory(index, 'information-uncertainty', lessons).map((l) => l.id), ['bayesian-uncertainty', 'signaling', 'auctions', 'market-quality']);
    assert.deepEqual(lessonsInCategory(index, 'incentives-decisions', lessons).map((l) => l.id), ['credibility', 'incentive-shift', 'voting']);

    await db.query(`update public.content_lesson_categories set category_id = 'negotiation-bargaining' where lesson_id = 'voting'`);
    const after = await repo.fetchCategories(lessons);
    assert.equal(after.index.byLesson.get('voting'), 'negotiation-bargaining');
    await db.query(`update public.content_categories set position = case id when 'strategic-foundations' then 4 when 'information-uncertainty' then 0 else position end`);
    const reordered = await repo.fetchCategories(lessons);
    assert.equal(reordered.index.categories[0].id, 'information-uncertainty', 'order comes from the database (positions swap in one statement)');
  });
});
