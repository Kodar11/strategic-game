import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { addUser, as, createDatabase, failure, importContent, seedDocument } from './pg.ts';

/**
 * The repository's migrations and seed, run in a real Postgres (PGlite) prepared like a Supabase project. Covers what
 * only the database can guarantee: the seed import policy, published-only reads, ownership (row level security),
 * append-only records, idempotent and atomic progress writes.
 */

const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';

let db: PGlite;
before(async () => {
  db = await createDatabase();
  await addUser(db, ALICE);
  await addUser(db, BOB);
});
after(async () => {
  await db.close();
});

const published = async (id: string | null = null) => (await as(db, id, (tx) => tx.query<{ d: Record<string, unknown[]> }>('select public.get_published_content() as d'))).rows[0].d;
const progressOf = async (id: string) => (await as(db, id, (tx) => tx.query<{ p: Record<string, unknown> }>('select public.get_my_progress() as p'))).rows[0].p;
const apply = (id: string, changes: unknown) => as(db, id, (tx) => tx.query<{ r: { ok: boolean; skipped: number } }>('select public.apply_progress_changes($1::jsonb) as r', [JSON.stringify(changes)])).then((r) => r.rows[0].r);

const attempt = (item: string, lockedAt: number, n = 1, extra: Record<string, unknown> = {}) => ({
  id: `${item}@${lockedAt}`,
  schemaVersion: 2,
  kind: 'scenario',
  lesson: 'cooperation-trap',
  prediction: item,
  skill: 'incentives',
  basis: 'calculable',
  answer: 'confess',
  confidence: 4,
  evaluation: 'correct',
  outcome: 'Confess — it shortens their sentence whatever you do.',
  lockedAt,
  attempt: n,
  lessonCompleted: false,
  contentVersion: 1,
  ...extra,
});

describe('Content seed', () => {
  it('imports the complete catalog and validates clean', async () => {
    const counts = Object.fromEntries((await db.query<{ entity: string; total: number }>('select * from content_admin.content_counts()')).rows.map((r) => [r.entity, Number(r.total)]));
    const seed = seedDocument() as Record<string, any[]>;
    assert.equal(counts.lessons, 22);
    assert.equal(counts.scenarios, 66);
    assert.equal(counts.challenges, 15);
    assert.equal(counts.assessments, 7);
    assert.equal(counts.modules, seed.modules.length);
    assert.equal(counts['curriculum specs'], 17);
    assert.equal(counts.labs, 17);
    assert.equal(counts['scenario options'], seed.scenarios.reduce((n, s) => n + s.predict.options.length, 0));
    assert.equal(counts['assessment items'], seed.assessments.reduce((n, a) => n + a.items.length, 0));
    assert.deepEqual((await db.query('select * from content_admin.validate_content()')).rows, []);
  });

  it('returns exactly the seed from get_published_content (same ids, order, text and structure)', async () => {
    assert.deepStrictEqual(await published(), seedDocument());
  });

  it('is idempotent: a second run inserts and changes nothing', async () => {
    const rows = await importContent(db, seedDocument());
    assert.ok(rows.length > 0 && rows.every((r) => r.action === 'unchanged'));
    assert.deepStrictEqual(await published(), seedDocument());
  });

  it('never overwrites a database edit unless the seed carries a higher revision', async () => {
    await db.query(`update public.content_lessons set title = 'Edited in the dashboard', revision = 2 where id = 'cooperation-trap'`);
    await importContent(db, seedDocument());
    assert.equal((await db.query<{ title: string }>(`select title from public.content_lessons where id = 'cooperation-trap'`)).rows[0].title, 'Edited in the dashboard');

    const doc = structuredClone(seedDocument()) as Record<string, any[]>;
    doc.lessons[0].revision = 3;
    doc.lessons[0].title = 'Shipped from the repository';
    doc.scenarios[0].revision = 2;
    doc.scenarios[0].predict.options = doc.scenarios[0].predict.options.slice().reverse();
    const actions = await importContent(db, doc);
    assert.equal(actions.find((r) => r.entity === 'lesson' && r.id === 'cooperation-trap')!.action, 'updated');
    assert.equal(actions.find((r) => r.entity === 'scenario' && r.id === doc.scenarios[0].id)!.action, 'updated');
    const after = (await published()) as Record<string, any[]>;
    assert.equal(after.lessons[0].title, 'Shipped from the repository');
    assert.deepEqual(after.scenarios[0].predict.options, doc.scenarios[0].predict.options, 'options were replaced in the new order');
    // Put the original back for the remaining tests.
    const restore = structuredClone(seedDocument()) as Record<string, any[]>;
    restore.lessons[0].revision = 4;
    restore.scenarios[0].revision = 3;
    await importContent(db, restore);
  });

  it('seeds a fresh database from supabase/seed.sql, the file run in the SQL editor', async () => {
    const fresh = await createDatabase({ seed: false });
    try {
      const results = await fresh.exec(readFileSync(new URL('../seed.sql', import.meta.url), 'utf8'));
      assert.ok(results[0].rows.every((r) => r.action === 'inserted'), 'first run inserts everything');
      assert.deepEqual(results[1].rows, [], 'validate_content reports no problems');
      const doc = await as(fresh, null, (tx) => tx.query<{ d: unknown }>('select public.get_published_content() as d'));
      assert.deepStrictEqual(doc.rows[0].d, seedDocument(), 'seed.sql is in step with content.json (run npm run content:seed-sql)');
    } finally {
      await fresh.close();
    }
  });

  it('refuses a document that is not a content document', async () => {
    await assert.rejects(importContent(db, { format: 'something-else' }), /Not a strategic-game-content document/);
  });
});

describe('Content access', () => {
  it('lets anonymous and signed-in clients read published content, and nobody write it', async () => {
    assert.equal(((await published(null)) as Record<string, unknown[]>).scenarios.length, 66);
    assert.equal(((await published(ALICE)) as Record<string, unknown[]>).scenarios.length, 66);
    assert.match((await failure(db, ALICE, `update public.content_lessons set title = 'x'`))!, /permission denied/);
    assert.match((await failure(db, null, `insert into public.content_goals (id, position, label) values ('none', 99, 'x')`))!, /permission denied/);
    assert.match((await failure(db, ALICE, `delete from public.content_scenario_options`))!, /permission denied/);
    assert.match((await failure(db, ALICE, `select * from content_admin.import_content('{}'::jsonb)`))!, /permission denied/);
  });

  it('hides draft content, and its options, from every public path', async () => {
    await db.query(`update public.content_scenarios set status = 'draft' where id = 'l1.c.neighbours'`);
    try {
      const visible = await as(db, ALICE, (tx) => tx.query(`select id from public.content_scenarios where id = 'l1.c.neighbours'`));
      const options = await as(db, null, (tx) => tx.query(`select * from public.content_scenario_options where scenario_id = 'l1.c.neighbours'`));
      assert.equal(visible.rows.length, 0);
      assert.equal(options.rows.length, 0);
      const doc = (await published()) as Record<string, { id: string }[]>;
      assert.ok(!doc.scenarios.some((s) => s.id === 'l1.c.neighbours'));
    } finally {
      await db.query(`update public.content_scenarios set status = 'published' where id = 'l1.c.neighbours'`);
    }
  });

  it('leaves out everything under a draft lesson, so the app never sees dangling references', async () => {
    await db.query(`update public.content_lessons set status = 'draft' where id = 'voting'`);
    try {
      const doc = (await published()) as Record<string, { lesson?: string; id?: string }[]>;
      assert.ok(!doc.lessons.some((l) => l.id === 'voting'));
      assert.ok(!doc.scenarios.some((s) => s.lesson === 'voting'));
      assert.ok(!doc.labs.some((s) => s.lesson === 'voting'));
      assert.ok(!doc.curriculumSpecs.some((s) => s.lesson === 'voting'));
    } finally {
      await db.query(`update public.content_lessons set status = 'published' where id = 'voting'`);
    }
  });
});

describe('Learner progress', () => {
  it('starts empty', async () => {
    const p = await progressOf(ALICE);
    assert.deepEqual(p.completed, []);
    assert.deepEqual(p.learning, []);
    assert.deepEqual(p.scenarioRuns, {});
    assert.equal(p.goal, null);
  });

  it('applies a batch atomically and returns it in the store’s shape', async () => {
    const run = { prediction: { answer: 'confess', confidence: 4, locked: true, lockedAt: 1000 }, inputs: ['confess'], seed: 7, version: 1 };
    const r = await apply(ALICE, {
      goal: { value: 'incentives' },
      attempts: [attempt('l1.a.classic-dilemma', 1000)],
      scenarioRuns: [{ scenario: 'l1.a.classic-dilemma', run }],
      scenariosDone: ['l1.a.classic-dilemma'],
      runtimeUpsert: [{ lesson: 'cooperation-trap', runtime: { step: 3, total: 15, data: { a: 1 }, updatedAt: 5 } }],
    });
    assert.deepEqual(r, { ok: true, skipped: 0 });
    const p = await progressOf(ALICE);
    assert.equal(p.goal, 'incentives');
    assert.deepEqual(p.learning, [attempt('l1.a.classic-dilemma', 1000)]);
    assert.deepEqual(p.scenarioRuns, { 'l1.a.classic-dilemma': run });
    assert.deepEqual(p.scenarioDone, ['l1.a.classic-dilemma']);
    assert.deepEqual(p.runtime, { 'cooperation-trap': { step: 3, total: 15, data: { a: 1 }, updatedAt: 5 } });
  });

  it('is idempotent: a retried batch adds no duplicates', async () => {
    const batch = { attempts: [attempt('l1.a.classic-dilemma', 1000)], scenariosDone: ['l1.a.classic-dilemma'], lessonsCompleted: ['cooperation-trap'] };
    await apply(ALICE, batch);
    await apply(ALICE, batch);
    const p = await progressOf(ALICE);
    assert.equal((p.learning as unknown[]).length, 1);
    assert.deepEqual(p.scenarioDone, ['l1.a.classic-dilemma']);
    assert.deepEqual(p.completed, ['cooperation-trap']);
  });

  it('keeps the first record for an id and the first record for an attempt number', async () => {
    await apply(ALICE, { attempts: [attempt('l1.a.classic-dilemma', 1000, 1, { answer: 'silent', evaluation: 'misconception' })] });
    await apply(ALICE, { attempts: [attempt('l1.a.classic-dilemma', 2000, 1)] });
    const learning = (await progressOf(ALICE)).learning as { answer: string; lockedAt: number }[];
    assert.equal(learning.length, 1);
    assert.equal(learning[0].answer, 'confess');
  });

  it('keeps completion order across batches and within one', async () => {
    await apply(ALICE, { lessonsCompleted: ['best-response', 'iterated-dominance'] });
    await apply(ALICE, { lessonsCompleted: ['evolution'] });
    assert.deepEqual((await progressOf(ALICE)).completed, ['cooperation-trap', 'best-response', 'iterated-dominance', 'evolution']);
  });

  it('replaces in-progress state, and clears runtime on request', async () => {
    await apply(ALICE, { runtimeUpsert: [{ lesson: 'cooperation-trap', runtime: { step: 4, total: 15, data: null, updatedAt: 6 } }] });
    assert.equal(((await progressOf(ALICE)).runtime as Record<string, { step: number }>)['cooperation-trap'].step, 4);
    await apply(ALICE, { runtimeDelete: ['cooperation-trap'] });
    assert.deepEqual((await progressOf(ALICE)).runtime, {});
  });

  it('never lets a later write change an assessment’s first score', async () => {
    const run = (first: number | null, last: number) => ({ version: 1, answers: {}, submitted: true, attempts: 1, firstScore: first, bestScore: last, lastScore: last, submittedAt: 1, reflection: '', rubric: [] });
    await apply(ALICE, { assessmentRuns: [{ assessment: 'm1', run: run(2, 2) }] });
    await apply(ALICE, { assessmentRuns: [{ assessment: 'm1', run: run(4, 4) }] });
    const saved = ((await progressOf(ALICE)).assessmentRuns as Record<string, { firstScore: number; lastScore: number }>).m1;
    assert.equal(saved.firstScore, 2);
    assert.equal(saved.lastScore, 4);
  });

  it('skips rows that reference content the database does not have, without failing the batch', async () => {
    const r = await apply(ALICE, { scenariosDone: ['no.such.scenario'], lessonsCompleted: ['no-such-lesson'], attempts: [attempt('x', 3, 1, { lesson: 'no-such-lesson' })] });
    assert.deepEqual(r, { ok: true, skipped: 2 });
  });

  it('rejects malformed records as a whole batch (nothing half-applied)', async () => {
    const before = await progressOf(ALICE);
    await assert.rejects(apply(ALICE, { lessonsCompleted: ['voting'], attempts: [attempt('l1.b.shared-project', 9, 1, { confidence: 9 })] }), /check constraint/);
    assert.deepEqual(await progressOf(ALICE), before, 'the valid part of the failed batch was rolled back');
  });

  it('resets everything but the goal, then applies the rest of the batch', async () => {
    await apply(ALICE, { reset: true, lessonsCompleted: ['voting'] });
    const p = await progressOf(ALICE);
    assert.deepEqual(p.completed, ['voting']);
    assert.deepEqual(p.learning, []);
    assert.deepEqual(p.scenarioRuns, {});
    assert.deepEqual(p.scenarioDone, []);
    assert.deepEqual(p.assessmentRuns, {});
    assert.equal(p.goal, 'incentives');
  });
});

describe('Row level security', () => {
  it('shows each learner only their own progress', async () => {
    await apply(BOB, { lessonsCompleted: ['auctions'], attempts: [attempt('l1.a.classic-dilemma', 77)] });
    assert.deepEqual((await progressOf(BOB)).completed, ['auctions']);
    assert.ok(!((await progressOf(ALICE)).completed as string[]).includes('auctions'));
    const rows = await as(db, ALICE, (tx) => tx.query<{ user_id: string }>('select user_id from public.learning_attempts'));
    assert.ok(rows.rows.every((r) => r.user_id === ALICE));
  });

  it('refuses writes into another learner’s rows', async () => {
    assert.match(
      (await failure(db, ALICE, `insert into public.lesson_progress (user_id, lesson_id, completed_at, completed_seq) values ($1, 'evolution', now(), 1)`, [BOB]))!,
      /row-level security/,
    );
    const changed = await as(db, ALICE, (tx) => tx.query(`update public.lesson_progress set runtime = null where user_id = $1`, [BOB]));
    assert.equal(changed.affectedRows, 0);
    const deleted = await as(db, ALICE, (tx) => tx.query(`delete from public.learning_attempts where user_id = $1`, [BOB]));
    assert.equal(deleted.affectedRows, 0);
    assert.equal(((await progressOf(BOB)).learning as unknown[]).length, 1);
  });

  it('makes learning records append-only, even for their owner', async () => {
    assert.match((await failure(db, BOB, `update public.learning_attempts set evaluation = 'correct'`))!, /permission denied/);
  });

  it('gives anonymous (signed-out) clients no access to progress at all', async () => {
    assert.match((await failure(db, null, 'select public.get_my_progress()'))!, /permission denied/);
    assert.match((await failure(db, null, `select public.apply_progress_changes('{}'::jsonb)`))!, /permission denied/);
    assert.match((await failure(db, null, 'select * from public.learning_attempts'))!, /permission denied/);
  });
});
