import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { addUser, as, createDatabase, failure, pgRpc, seedDocument } from './pg.ts';

/**
 * Lesson categories and the Daily Strategic Challenge, run against the real migrations in PGlite: the category
 * taxonomy, publishing rules, release dates, private answer keys, server-side grading, one official attempt per day,
 * history, and isolation from lesson progress.
 */

const ALICE = '00000000-0000-4000-8000-0000000000a1';
const BOB = '00000000-0000-4000-8000-0000000000b2';

let db: PGlite;
let today: string;
const shift = (days: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

before(async () => {
  db = await createDatabase();
  await addUser(db, ALICE);
  await addUser(db, BOB);
  today = (await db.query<{ d: string }>(`select public.daily_challenge_today()::text as d`)).rows[0].d;
});
after(async () => {
  await db.close();
});

const publish = async (doc: unknown) =>
  (await db.query<{ action: string; id: string; version: number; status: string }>('select * from content_admin.publish_daily_challenge($1::jsonb)', [JSON.stringify(doc)])).rows[0];
const publishError = async (doc: unknown) => {
  try {
    await publish(doc);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const rpc = (user: string | null, fn: string, request: unknown) => pgRpc(db, user).call(fn, { request }) as Promise<any>;
const rpcError = async (user: string | null, fn: string, request: unknown) => {
  try {
    await rpc(user, fn, request);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

const choice = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id,
  date,
  version: 1,
  title: `Challenge ${id}`,
  intro: 'Two shops sell the same thing.',
  prompt: 'What happens to prices?',
  interaction: 'choice',
  config: { options: [{ id: 'up', label: 'Up' }, { id: 'down', label: 'Down' }, { id: 'same', label: 'Same' }] },
  skill: 'incentives',
  basis: 'calculable',
  key: {
    evaluation: {
      options: {
        up: { verdict: 'misconception', feedback: 'Not up.' },
        down: { verdict: 'defensible', feedback: 'Partly.' },
        same: { verdict: 'match', feedback: 'Right: matching removes the gain from undercutting.' },
      },
    },
    modelAnswer: 'They stay the same.',
    explanation: ['Matching removes the reward for a cut.'],
    takeaway: 'Ask how a rule changes the other side’s best reply.',
  },
  ...extra,
});

const number = (id: string, date: string) => ({
  id,
  date,
  version: 1,
  title: 'Inspection odds',
  intro: 'Skip a ₹30 fee or risk a ₹120 fine.',
  prompt: 'Lowest inspection chance that deters?',
  interaction: 'number',
  config: { min: 0, max: 100, step: 5, initial: 50, unit: '%' },
  skill: 'incentives',
  key: {
    evaluation: {
      bands: [
        { min: 0, max: 15, verdict: 'misconception', feedback: 'Too low.' },
        { min: 20, max: 20, verdict: 'match', feedback: 'Exactly.' },
        { min: 25, max: 100, verdict: 'defensible', feedback: 'Deters, but more than needed.' },
      ],
    },
    modelAnswer: '20%',
    explanation: ['30 − 30p = 120p.'],
    takeaway: 'Expected penalties deter.',
  },
});

describe('Lesson categories', () => {
  it('seeds five categories and gives every one of the 22 lessons exactly one', async () => {
    const r = await as(db, null, (tx) => tx.query<{ d: { categories: { id: string; position: number }[]; assignments: Record<string, string> } }>('select public.get_lesson_categories() as d'));
    const { categories, assignments } = r.rows[0].d;
    assert.deepEqual(
      categories.map((c) => c.id),
      ['strategic-foundations', 'cooperation-competition', 'incentives-decisions', 'negotiation-bargaining', 'information-uncertainty'],
    );
    const lessons = (seedDocument() as { lessons: { id: string }[] }).lessons.map((l) => l.id);
    assert.equal(lessons.length, 22);
    assert.deepEqual(Object.keys(assignments).sort(), [...lessons].sort());
    const counts = Object.values(assignments).reduce<Record<string, number>>((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {});
    assert.deepEqual(counts, { 'strategic-foundations': 5, 'cooperation-competition': 6, 'incentives-decisions': 3, 'negotiation-bargaining': 4, 'information-uncertainty': 4 });
  });

  it('re-seeding is idempotent and never moves an edited assignment', async () => {
    await db.query(`update public.content_lesson_categories set category_id = 'negotiation-bargaining' where lesson_id = 'credibility'`);
    assert.equal((await db.query<{ n: number }>('select content_admin.seed_lesson_categories() as n')).rows[0].n, 0);
    const r = await db.query<{ category_id: string }>(`select category_id from public.content_lesson_categories where lesson_id = 'credibility'`);
    assert.equal(r.rows[0].category_id, 'negotiation-bargaining');
    const d = await as(db, null, (tx) => tx.query<{ d: { assignments: Record<string, string> } }>('select public.get_lesson_categories() as d'));
    assert.equal(d.rows[0].d.assignments.credibility, 'negotiation-bargaining', 'an edit in the database is what the app reads');
    await db.query(`update public.content_lesson_categories set category_id = 'incentives-decisions' where lesson_id = 'credibility'`);
  });

  it('hides a draft category and its assignments, and lets no client write', async () => {
    await db.query(`update public.content_categories set status = 'draft' where id = 'information-uncertainty'`);
    const d = await as(db, ALICE, (tx) => tx.query<{ d: { categories: { id: string }[]; assignments: Record<string, string> } }>('select public.get_lesson_categories() as d'));
    assert.ok(!d.rows[0].d.categories.some((c) => c.id === 'information-uncertainty'));
    assert.ok(!Object.values(d.rows[0].d.assignments).includes('information-uncertainty'));
    await db.query(`update public.content_categories set status = 'published' where id = 'information-uncertainty'`);
    assert.match((await failure(db, ALICE, `update public.content_lesson_categories set category_id = 'strategic-foundations'`))!, /permission denied/);
    assert.match((await failure(db, null, `insert into public.content_categories (id, position, title, description) values ('x', 9, 'X', 'Y')`))!, /permission denied/);
  });

  it('keeps a lesson in at most one category (it is the primary key)', async () => {
    assert.equal((await db.query<{ n: number }>(`select count(*)::int as n from public.content_lesson_categories`)).rows[0].n, 22);
    await assert.rejects(db.query(`insert into public.content_lesson_categories (lesson_id, category_id) values ('voting', 'strategic-foundations')`), /duplicate key/);
  });
});

describe('Daily challenge publishing', () => {
  it('publishes the documented examples with one statement each, idempotently', async () => {
    const sql = readFileSync(new URL('../daily/examples.sql', import.meta.url), 'utf8');
    const first = await db.exec(sql);
    assert.deepEqual(first.map((r) => r.rows[0]?.action), ['inserted', 'inserted', 'inserted']);
    const again = await db.exec(sql);
    assert.deepEqual(again.map((r) => r.rows[0]?.action), ['unchanged', 'unchanged', 'unchanged']);
    // The scenario example takes its skill, basis and lesson from the scenario.
    const s = await db.query<{ skill_id: string; basis: string; lesson_id: string }>(`select skill_id, basis, lesson_id from public.daily_challenges where id = 'splitting-the-bonus'`);
    assert.deepEqual(s.rows[0], { skill_id: 'anticipating', basis: 'calculable', lesson_id: 'sequential-moves' });
    assert.deepEqual((await db.query('select * from content_admin.validate_daily_challenges()')).rows, []);
  });

  it('explains every problem with a malformed challenge instead of publishing it', async () => {
    const bad = choice('bad-one', today, { interaction: 'choice', config: { options: [{ id: 'a', label: 'A' }] }, color: 'red' });
    const msg = (await publishError(bad))!;
    assert.match(msg, /unknown field color/);
    assert.match(msg, /config.options must list 2 to 6 options/);

    const missingKey = choice('missing-key', today);
    delete (missingKey.key.evaluation.options as Record<string, unknown>).down;
    assert.match((await publishError(missingKey))!, /exactly one entry per option id/);

    const noMatch = choice('no-match', today);
    noMatch.key.evaluation.options.same.verdict = 'defensible';
    assert.match((await publishError(noMatch))!, /calculable challenge needs at least one option with verdict match/);

    const gap = number('gap', today);
    gap.key.evaluation.bands.splice(1, 1);
    assert.match((await publishError(gap))!, /no band covers the value 20/);

    assert.match((await publishError({ ...choice('x', today), interaction: 'essay' }))!, /interaction must be choice, number or scenario/);
    assert.match((await publishError({ ...choice('y', '2026-02-30') }))!, /not a real calendar date/);
    assert.match(
      (await publishError({ id: 'old-scenario', date: today, version: 1, title: 'T', intro: 'I', prompt: 'P', interaction: 'scenario', config: { scenario: 'l8.c.first-offer', version: 9 }, key: {} }))!,
      /config.version must be 1/,
    );
    const count = await db.query<{ n: number }>(`select count(*)::int as n from public.daily_challenges where id in ('bad-one', 'missing-key', 'no-match', 'gap', 'x', 'y', 'old-scenario')`);
    assert.equal(count.rows[0].n, 0, 'nothing half-published');
  });

  it('never replaces another published challenge on the same date', async () => {
    assert.equal((await publish(choice('today-one', today))).action, 'inserted');
    assert.match((await publishError(choice('today-two', today)))!, /today-one is already published for/);
    // A draft for the same date is fine while it is being prepared.
    assert.equal((await publish(choice('today-two', today, { status: 'draft' }))).action, 'inserted');
  });

  it('needs a higher version to change a challenge, and keeps every version in the history', async () => {
    const changed = choice('today-one', today, { title: 'A better title' });
    assert.match((await publishError(changed))!, /give it "version": 2 or higher/);
    assert.equal((await publish({ ...changed, version: 2 })).action, 'updated');
    const h = await db.query<{ version: number }>(`select version from public.daily_challenge_history where challenge_id = 'today-one' and source = 'challenge' order by seq`);
    assert.deepEqual(h.rows.map((r) => r.version), [1, 2]);
    assert.match((await publishError({ ...changed, version: 1 }))!, /differs from the stored version 2/);
  });

  it('gives clients no way to publish or edit challenges', async () => {
    assert.match((await failure(db, ALICE, `select * from content_admin.publish_daily_challenge('{}'::jsonb)`))!, /permission denied/);
    assert.match((await failure(db, ALICE, `update public.daily_challenges set title = 'x'`))!, /permission denied/);
    assert.match((await failure(db, null, `insert into public.daily_challenges (id, challenge_date, title, intro, prompt, interaction, config) values ('z', current_date, 't', 'i', 'p', 'choice', '{}')`))!, /permission denied/);
  });
});

describe('Daily challenge release and secrecy', () => {
  before(async () => {
    await publish(choice('future-one', shift(40)));
    await publish(choice('past-one', shift(-12)));
    await publish(number('past-number', shift(-11)));
  });

  it('sends nothing scheduled after today, and no drafts', async () => {
    const r = await rpc(ALICE, 'get_daily_challenges', { from: shift(-20), to: shift(41) });
    const ids = r.challenges.map((c: { id: string }) => c.id);
    assert.ok(ids.includes('today-one') && ids.includes('past-one') && ids.includes('past-number'));
    assert.ok(!ids.includes('future-one'), 'future challenge is not released');
    assert.ok(!ids.includes('today-two'), 'draft is not released');
    assert.equal(r.today, today);
    assert.equal(r.timezone, 'UTC');
    const direct = await as(db, ALICE, (tx) => tx.query<{ id: string }>(`select id from public.daily_challenges where id = 'future-one'`));
    assert.equal(direct.rows.length, 0, 'row level security hides it from direct reads too');
  });

  it('never exposes answer keys or history to clients', async () => {
    for (const who of [ALICE, null]) {
      assert.match((await failure(db, who, 'select * from public.daily_challenge_keys'))!, /permission denied/);
      assert.match((await failure(db, who, 'select * from public.daily_challenge_history'))!, /permission denied/);
    }
    const r = await rpc(ALICE, 'get_daily_challenges', { from: today, to: today });
    const text = JSON.stringify(r.challenges);
    assert.ok(!text.includes('verdict') && !text.includes('matching removes the gain'), 'published content carries no verdicts or feedback');
  });

  it('refuses practice and the explanation for today before the official answer', async () => {
    assert.match((await rpcError(ALICE, 'check_daily_practice', { challengeId: 'today-one', version: 2, answer: { option: 'same' } }))!, /daily:locked/);
    assert.match((await rpcError(ALICE, 'get_daily_reveal', { challengeId: 'today-one' }))!, /daily:locked/);
    assert.match((await rpcError(ALICE, 'get_daily_reveal', { challengeId: 'future-one' }))!, /daily:not_found/);
  });
});

describe('Official attempts', () => {
  it('grades on the server and records exactly one attempt per learner and day', async () => {
    assert.match((await rpcError(ALICE, 'submit_daily_challenge', { challengeId: 'today-one', version: 2, answer: { option: 'same' } }))!, /daily:confidence/);
    assert.match((await rpcError(ALICE, 'submit_daily_challenge', { challengeId: 'today-one', version: 2, answer: { option: 'nope' }, confidence: 4 }))!, /daily:invalid_answer/);
    assert.match((await rpcError(ALICE, 'submit_daily_challenge', { challengeId: 'today-one', version: 1, answer: { option: 'same' }, confidence: 4 }))!, /daily:stale/);

    const first = await rpc(ALICE, 'submit_daily_challenge', { challengeId: 'today-one', version: 2, answer: { option: 'same' }, confidence: 4 });
    assert.equal(first.status, 'recorded');
    assert.equal(first.attempt.evaluation, 'correct');
    assert.equal(first.attempt.result.feedback, 'Right: matching removes the gain from undercutting.');
    assert.equal(first.attempt.result.title, 'A better title');

    // A retry, or a different answer from another device, returns the recorded attempt unchanged.
    const retry = await rpc(ALICE, 'submit_daily_challenge', { challengeId: 'today-one', version: 2, answer: { option: 'up' }, confidence: 1 });
    assert.equal(retry.status, 'existing');
    assert.deepEqual(retry.attempt, first.attempt);
    const n = await db.query<{ n: number }>(`select count(*)::int as n from public.daily_challenge_attempts where user_id = $1`, [ALICE]);
    assert.equal(n.rows[0].n, 1);
  });

  it('opens practice and the explanation after answering, without recording anything', async () => {
    const p = await rpc(ALICE, 'check_daily_practice', { challengeId: 'today-one', version: 2, answer: { option: 'up' } });
    assert.equal(p.evaluation, 'misconception');
    const reveal = await rpc(ALICE, 'get_daily_reveal', { challengeId: 'today-one' });
    assert.equal(reveal.modelAnswer, 'They stay the same.');
    const r = await rpc(ALICE, 'get_daily_challenges', { from: today, to: today });
    assert.equal(r.attempts.length, 1);
    assert.equal(r.attempts[0].evaluation, 'correct', 'practice never overwrites the official result');
  });

  it('closes a past day for official answers but keeps it open for review and practice', async () => {
    assert.match((await rpcError(BOB, 'submit_daily_challenge', { challengeId: 'past-one', version: 1, answer: { option: 'same' }, confidence: 3 }))!, /daily:closed/);
    const p = await rpc(BOB, 'check_daily_practice', { challengeId: 'past-one', version: 1, answer: { option: 'same' } });
    assert.equal(p.verdict, 'match');
    const n = await rpc(BOB, 'check_daily_practice', { challengeId: 'past-number', version: 1, answer: { value: 0.1 + 0.2 + 19.7 } });
    assert.equal(n.verdict, 'match', 'floating-point noise is snapped to the grid');
    assert.equal(n.answerLabel, '20%');
    assert.match((await rpcError(BOB, 'check_daily_practice', { challengeId: 'past-number', version: 1, answer: { value: 22 } }))!, /daily:invalid_answer/);
    assert.match((await rpcError(BOB, 'submit_daily_challenge', { challengeId: 'future-one', version: 1, answer: { option: 'same' }, confidence: 3 }))!, /daily:not_found/);
  });

  it('shows each learner only their own attempts and lets nobody write them directly', async () => {
    const bob = await rpc(BOB, 'get_daily_challenges', { from: shift(-20), to: today });
    assert.equal(bob.attempts.length, 0);
    assert.equal(bob.history.length, 0);
    const alice = await rpc(ALICE, 'get_daily_challenges', { from: shift(-20), to: today });
    assert.equal(alice.history.length, 1);
    assert.equal(alice.history[0].skill, 'incentives');
    assert.match((await failure(db, BOB, `insert into public.daily_challenge_attempts (user_id, challenge_id, challenge_date, content_version, interaction, answer, evaluation, basis, result) values ($1, 'past-one', $2, 1, 'choice', '{}', 'correct', 'calculable', '{}')`, [BOB, shift(-12)]))!, /permission denied/);
    assert.match((await failure(db, ALICE, `update public.daily_challenge_attempts set evaluation = 'correct'`))!, /permission denied/);
    assert.match((await failure(db, ALICE, `delete from public.daily_challenge_attempts`))!, /permission denied/);
    assert.match((await rpcError(null, 'submit_daily_challenge', { challengeId: 'today-one', version: 2, answer: { option: 'same' }, confidence: 4 }))!, /permission denied|Not signed in/);
  });

  it('keeps the official result stable when the content is edited afterwards', async () => {
    // Changing how an answered challenge is graded needs a new version, even from the SQL editor.
    await assert.rejects(db.query(`update public.daily_challenge_keys set evaluation = '{"options": {}}' where challenge_id = 'today-one'`), /raise its version/);
    await assert.rejects(db.query(`update public.daily_challenges set challenge_date = challenge_date + 1 where id = 'today-one'`), /date can't change/);
    const v3 = choice('today-one', today, { version: 3, title: 'Edited again' });
    v3.key.evaluation.options.same.verdict = 'misconception';
    v3.key.evaluation.options.up.verdict = 'match';
    await publish(v3);
    const r = await rpc(ALICE, 'get_daily_challenges', { from: today, to: today });
    assert.equal(r.attempts[0].evaluation, 'correct');
    assert.equal(r.attempts[0].version, 2);
    assert.equal(r.attempts[0].result.title, 'A better title', 'the snapshot shows what applied when it was graded');
  });

  it('grades a scenario challenge from the scenario’s own options', async () => {
    await db.query(`update public.daily_challenges set status = 'draft' where id = 'today-one'`);
    await publish({ id: 'scenario-today', date: today, version: 1, title: 'Split', intro: 'I', prompt: 'P', interaction: 'scenario', config: { scenario: 'l8.c.first-offer', version: 1 }, key: {} });
    const r = await rpc(BOB, 'submit_daily_challenge', { challengeId: 'scenario-today', version: 1, answer: { option: '3', seed: 7, inputs: [3] }, confidence: 5 });
    assert.equal(r.status, 'recorded');
    assert.equal(r.attempt.evaluation, 'correct');
    assert.equal(r.attempt.interaction, 'scenario');
    assert.deepEqual(r.attempt.answer.inputs, [3]);
  });
});

describe('Daily challenges and lesson progress', () => {
  it('never changes lesson progress, and a progress reset leaves official attempts alone', async () => {
    const before = await as(db, BOB, (tx) => tx.query<{ p: unknown }>('select public.get_my_progress() as p'));
    assert.deepEqual(before.rows[0].p, { completed: [], runtime: {}, learning: [], goal: null, challengeDrafts: {}, scenarioRuns: {}, scenarioDone: [], assessmentRuns: {} });
    await as(db, BOB, (tx) => tx.query('select public.apply_progress_changes($1::jsonb)', [JSON.stringify({ reset: true })]));
    const r = await rpc(BOB, 'get_daily_challenges', { from: today, to: today });
    assert.equal(r.attempts.length, 1);
  });

  it('refuses ranges that are too long or malformed', async () => {
    assert.match((await rpcError(ALICE, 'get_daily_challenges', { from: shift(-100), to: today }))!, /daily:bad_range/);
    assert.ok(await rpcError(ALICE, 'get_daily_challenges', { from: 'not-a-date', to: today }));
  });
});
