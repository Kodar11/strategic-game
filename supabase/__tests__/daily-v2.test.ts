import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { addUser, as, createDatabase, failure, pgRpc, seedDocument } from './pg.ts';

/**
 * Daily Challenge v2 against the real migrations and the real 66 scenarios: India-time days, the hybrid content
 * source (manual first, else an automatic scenario pick), cooldown and lesson spread, idempotent and concurrent
 * activation, recovery when the scheduled job didn't run, answer-key secrecy for adapted scenarios, scoring, the
 * leaderboard, history, and the lesson content left untouched.
 */

let db: PGlite;
const ALICE = '00000000-0000-4000-8000-00000000d0a1';
const BOB = '00000000-0000-4000-8000-00000000d0b2';
const CAROL = '00000000-0000-4000-8000-00000000d0c3';
let today: string;

before(async () => {
  db = await createDatabase();
  for (const u of [ALICE, BOB, CAROL]) await addUser(db, u);
  today = (await db.query<{ d: string }>(`select public.daily_challenge_today()::text as d`)).rows[0].d;
});
after(async () => {
  await db.close();
});

const rpc = (user: string | null, fn: string, request: unknown) => pgRpc(db, user).call(fn, { request }) as Promise<any>;
const rpcError = async (user: string | null, fn: string, request: unknown) => {
  try {
    await rpc(user, fn, request);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const one = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const rows = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const ensure = (d: string) => one<{ id: string | null }>('select content_admin.ensure_daily_challenge($1::date) as id', [d]).then((r) => r.id);

describe('the product day', () => {
  it('is the calendar date in Asia/Kolkata, and the timezone is configuration', async () => {
    const r = await one(`select public.daily_challenge_today()::text as d, (now() at time zone 'Asia/Kolkata')::date::text as ist`);
    assert.equal(r.d, r.ist);
    await db.query(`update public.competition_settings set daily_timezone = 'Pacific/Kiritimati'`);
    assert.equal((await one(`select public.daily_challenge_today()::text as d`)).d, (await one(`select (now() at time zone 'Pacific/Kiritimati')::date::text as d`)).d);
    await db.query(`update public.competition_settings set daily_timezone = 'Asia/Kolkata'`);
    await assert.rejects(db.query(`update public.competition_settings set daily_timezone = 'Mars/Olympus'`), /time zone/);
  });

  it('turns over at 00:00 India time (18:30 UTC)', async () => {
    const r = await one(`select ('2030-01-01 18:29:59+00'::timestamptz at time zone 'Asia/Kolkata')::date::text as before,
                                ('2030-01-01 18:30:00+00'::timestamptz at time zone 'Asia/Kolkata')::date::text as after`);
    assert.deepEqual(r, { before: '2030-01-01', after: '2030-01-02' });
  });
});

describe('the scenario pool', () => {
  it('holds all 66 lesson scenarios, every one adaptable as a standalone challenge', async () => {
    const doc = seedDocument() as { scenarios: { id: string }[] };
    const pool = await rows<{ scenario_id: string }>('select scenario_id from public.daily_scenario_pool');
    assert.equal(pool.length, 66);
    assert.deepEqual(pool.map((p) => p.scenario_id).sort(), doc.scenarios.map((s) => s.id).sort());
    assert.deepEqual(await rows('select * from content_admin.validate_scenario_pool()'), []);
  });

  it('adapts a scenario without changing it: setup, rules, visual, question, shuffled opaque options, private key', async () => {
    const before = await rows(`select * from public.content_scenarios s join public.content_scenario_options o on o.scenario_id = s.id where s.id = 'l1.a.classic-dilemma' order by o.position`);
    const doc = (await one(`select content_admin.daily_doc_from_scenario('l1.a.classic-dilemma', '2031-05-05') as d`)).d;
    assert.equal(doc.interaction, 'choice');
    assert.equal(doc.intro, before[0].setup);
    assert.equal(doc.prompt, before[0].prediction_question);
    assert.deepEqual(doc.config.rules, before[0].rules);
    assert.deepEqual(doc.config.visual, before[0].visual);
    assert.deepEqual(doc.config.options.map((o: any) => o.id), ['a', 'b', 'c']);
    assert.deepEqual(doc.config.options.map((o: any) => o.label).sort(), before.map((o) => o.label).sort());
    assert.equal(doc.sourceScenario.id, 'l1.a.classic-dilemma');
    // The same option keeps its verdict under its new letter.
    for (const o of doc.config.options) {
      const src = before.find((b) => b.label === o.label)!;
      assert.equal(doc.key.evaluation.options[o.id].verdict, src.verdict);
    }
    // Another date shuffles differently (somewhere in a few dates).
    const orders = new Set<string>();
    for (const d of ['2031-05-05', '2031-05-06', '2031-05-07', '2031-05-08']) {
      orders.add((await one(`select content_admin.daily_doc_from_scenario('l1.a.classic-dilemma', $1::date) as d`, [d])).d.config.options.map((o: any) => o.label).join('|'));
    }
    assert.ok(orders.size > 1);
    assert.deepEqual(await rows(`select * from public.content_scenarios s join public.content_scenario_options o on o.scenario_id = s.id where s.id = 'l1.a.classic-dilemma' order by o.position`), before);
  });
});

describe('automatic selection', () => {
  it('publishes one challenge per date, once, whoever asks and however often', async () => {
    const d = '2032-01-01';
    const ids = await Promise.all([ensure(d), ensure(d), ensure(d)]);
    assert.ok(ids[0]);
    assert.ok(ids.every((x) => x === ids[0]));
    assert.equal((await one(`select count(*)::int as n from public.daily_challenges where challenge_date = $1 and status = 'published'`, [d])).n, 1);
    assert.equal((await one(`select count(*)::int as n from public.daily_scenario_usage where challenge_date = $1`, [d])).n, 1);
    const c = await one('select * from public.daily_challenges where id = $1', [ids[0]]);
    assert.equal(c.source, 'scenario');
    assert.ok(c.format && c.concept && c.source_scenario_id);
  });

  it('spreads 66 days over all 66 scenarios and all 22 lessons, respects the cooldown, then reuses', async () => {
    const start = '2032-02-01';
    for (let i = 0; i < 80; i++) await ensure(addDays(start, i));
    const used = await rows<{ d: string; s: string; l: string; diff: number }>(
      `select u.challenge_date::text as d, u.scenario_id as s, u.lesson_id as l, c.difficulty as diff
       from public.daily_scenario_usage u join public.daily_challenges c on c.id = u.challenge_id
       where u.challenge_date >= $1 and u.superseded_at is null order by 1`,
      [start],
    );
    assert.equal(used.length, 80);
    // The first 66 days: 66 different scenarios (2032-01-01 used one already, so 65 fresh + it after cooldown).
    assert.ok(new Set(used.slice(0, 65).map((u) => u.s)).size === 65);
    assert.equal(new Set(used.slice(0, 22).map((u) => u.l)).size, 22, 'the first 22 days cover all 22 lessons');
    // No scenario twice within the 30-day cooldown.
    for (let i = 0; i < used.length; i++) for (let j = i + 1; j < Math.min(used.length, i + 30); j++) assert.notEqual(used[i].s, used[j].s, `${used[i].d} and ${used[j].d}`);
    // No lesson within 7 days of itself while the pool allows it.
    for (let i = 0; i < 60; i++) for (let j = i + 1; j < i + 7; j++) assert.notEqual(used[i].l, used[j].l, `lesson ${used[i].l} on ${used[i].d} and ${used[j].d}`);
    // No two Hard days in a row.
    for (let i = 1; i < used.length; i++) assert.ok(!(used[i].diff === 3 && used[i - 1].diff === 3), `Hard twice: ${used[i].d}`);
  });

  it('never fails to publish when every scenario is cooling down: the least recently used is reused', async () => {
    await db.query('update public.competition_settings set daily_cooldown_days = 365');
    try {
      const d = '2032-06-01';
      const id = await ensure(d);
      assert.ok(id, 'published anyway');
      const pick = (await one(`select scenario_id from public.daily_scenario_usage where challenge_date = $1`, [d])).scenario_id;
      const counts = await rows<{ s: string; n: number; last: string }>(
        `select scenario_id as s, count(*)::int as n, max(challenge_date)::text as last from public.daily_scenario_usage where challenge_date < $1 and superseded_at is null group by 1`, [d]);
      const min = Math.min(...counts.map((c) => c.n));
      const mine = counts.find((c) => c.s === pick)!;
      assert.equal(mine.n, min, 'one of the least used');
      assert.ok(mine.last < addDays(d, -30), 'and not one used recently');
    } finally {
      await db.query('update public.competition_settings set daily_cooldown_days = 30');
    }
  });

  it('a disabled scenario is never picked automatically', async () => {
    await db.query(`update public.daily_scenario_pool set enabled = false, exclusion_reason = 'test' where scenario_id <> 'l2.a.dominant-action'`);
    try {
      await db.query('update public.competition_settings set daily_cooldown_days = 365');
      const id = await ensure('2032-07-01');
      assert.match(id!, /l2-a-dominant-action$/);
    } finally {
      await db.query(`update public.daily_scenario_pool set enabled = true, exclusion_reason = null`);
      await db.query('update public.competition_settings set daily_cooldown_days = 30');
    }
  });
});

describe('manual challenges', () => {
  const manual = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
    id,
    date,
    version: 1,
    title: 'The bakery price war',
    intro: 'Two bakeries on one street both sell croissants for 3.',
    prompt: 'If one cuts to 2, what does the other do?',
    interaction: 'choice',
    format: 'prediction',
    concept: 'Bertrand competition',
    difficulty: 2,
    config: { options: [{ id: 'match', label: 'Matches the cut' }, { id: 'hold', label: 'Holds at 3' }], rules: ['Customers buy from the cheaper bakery.'] },
    skill: 'incentives',
    key: {
      evaluation: { options: { match: { verdict: 'match', feedback: 'Holding loses every customer.' }, hold: { verdict: 'misconception', feedback: 'At 3 it sells nothing.' } } },
      modelAnswer: 'It matches the cut.',
      explanation: ['Undercutting steals the whole market, so the rival must answer.'],
      takeaway: 'Price competition between identical sellers races down.',
    },
    ...extra,
  });
  const publish = (doc: unknown) => one('select * from content_admin.publish_daily_challenge($1::jsonb)', [JSON.stringify(doc)]);

  it('a manual challenge scheduled for a date wins over automatic selection', async () => {
    const d = '2033-03-03';
    await publish(manual('bakery-war', d));
    assert.equal(await ensure(d), 'bakery-war');
    assert.equal((await one(`select count(*)::int as n from public.daily_scenario_usage where challenge_date = $1`, [d])).n, 0);
  });

  it('replaces an unanswered automatic pick for its date, and records the change; never one with attempts', async () => {
    const d = '2033-04-04';
    const auto = await ensure(d);
    await publish(manual('bakery-war-2', d, { sourceScenario: { id: 'l6.b.bertrand', version: 1 } }));
    assert.equal((await one('select status from public.daily_challenges where id = $1', [auto])).status, 'draft');
    const usage = await rows(`select challenge_id, selection, superseded_at from public.daily_scenario_usage where challenge_date = $1 order by seq`, [d]);
    assert.equal(usage.length, 2);
    assert.ok(usage[0].superseded_at);
    assert.deepEqual([usage[1].challenge_id, usage[1].selection, usage[1].superseded_at], ['bakery-war-2', 'manual', null]);
    // Another manual one for the same date is refused: nothing manual is replaced silently.
    await assert.rejects(publish(manual('bakery-war-3', d)), /already published/);
  });

  it('validates new fields and refuses invalid content', async () => {
    const bad = [
      [manual('x1', '2033-05-05', { format: 'quiz' }), /format/],
      [manual('x2', '2033-05-05', { config: { options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], rules: [] } }), /config.rules/],
      [manual('x3', '2033-05-05', { config: { options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], visual: { kind: 'chart' } } }), /config.visual/],
      [manual('x4', '2033-05-05', { sourceScenario: { id: 'nope', version: 1 } }), /sourceScenario/],
      [manual('x5', '2033-05-05', { minutes: 30 }), /minutes/],
    ] as const;
    for (const [doc, re] of bad) await assert.rejects(publish(doc), re);
    const preview = (await one(`select content_admin.preview_daily_challenge($1::jsonb) as p`, [JSON.stringify(manual('x6', '2033-05-05', { format: 'quiz' }))])).p;
    assert.ok(preview.problems.some((p: string) => /format/.test(p)));
    assert.equal(preview.shown.key, undefined);
  });

  it('the SQL Editor views show the schedule and scenario usage', async () => {
    const s = await rows(`select * from content_admin.daily_schedule where challenge_date = '2033-03-03'`);
    assert.equal(s[0].lifecycle, 'scheduled');
    const r = await rows(`select * from content_admin.daily_scenario_report order by uses desc limit 3`);
    assert.ok(r[0].uses >= 1 && r[0].last_used);
  });
});

describe("today's challenge for players", () => {
  let challengeId: string;
  let options: { id: string; label: string }[];

  it('exists even when no scheduled job ran (recovery on read), and reveals neither key nor source', async () => {
    assert.equal((await one(`select count(*)::int as n from public.daily_challenges where challenge_date = $1`, [today])).n, 0);
    const r = await rpc(ALICE, 'get_daily_challenges', { from: today, to: today });
    assert.equal(r.challenges.length, 1);
    const c = r.challenges[0];
    challengeId = c.id;
    options = c.config.options;
    const text = JSON.stringify(c);
    for (const secret of ['verdict', 'feedback', 'modelAnswer', 'takeaway', 'explanation']) assert.equal(text.includes(secret), false, secret);
    assert.equal(c.lesson, undefined, 'the source lesson is withheld until answered');
    assert.equal(c.concept, undefined);
    assert.equal(c.sourceScenario, undefined);
    assert.ok(c.format && c.difficulty && c.minutes);
    assert.match((await rpcError(ALICE, 'check_daily_practice', { challengeId, version: 1, answer: { option: 'a' } }))!, /daily:locked/, 'no practice before the official answer');
    assert.match((await rpcError(ALICE, 'get_daily_reveal', { challengeId }))!, /daily:locked/);
  });

  it('every player gets the same challenge', async () => {
    const b = await rpc(BOB, 'get_daily_challenges', { from: today, to: today });
    assert.equal(b.challenges[0].id, challengeId);
    assert.deepEqual(b.challenges[0].config.options, options);
  });

  it('scores the official answer on the server: correctness first, calibration second; one ranked attempt', async () => {
    const key = (await one(`select evaluation from public.daily_challenge_keys where challenge_id = $1`, [challengeId])).evaluation.options;
    const right = Object.keys(key).find((k) => key[k].verdict === 'match')!;
    const wrong = Object.keys(key).find((k) => key[k].verdict === 'misconception')!;
    const a = await rpc(ALICE, 'submit_daily_challenge', { challengeId, version: 1, answer: { option: right }, confidence: 5 });
    assert.equal(a.status, 'recorded');
    assert.equal(a.attempt.score, 100);
    assert.equal(a.attempt.calibration, 100); // 95 % sure and right: 100 × (1 − 0.05²) = 99.75 → 100
    assert.ok(a.attempt.result.lesson && a.attempt.result.concept, 'the lesson connection appears after answering');
    const b = await rpc(BOB, 'submit_daily_challenge', { challengeId, version: 1, answer: { option: right }, confidence: 2 });
    assert.equal(b.attempt.calibration, 64); // 40 % sure and right: 100 × (1 − 0.6²)
    const c = await rpc(CAROL, 'submit_daily_challenge', { challengeId, version: 1, answer: { option: wrong }, confidence: 1 });
    assert.equal(c.attempt.score, 0);
    assert.equal(c.attempt.calibration, 96);
    // A retry, another device or a changed answer can't make a second ranked attempt.
    const again = await rpc(CAROL, 'submit_daily_challenge', { challengeId, version: 1, answer: { option: right }, confidence: 5 });
    assert.equal(again.status, 'existing');
    assert.equal(again.attempt.score, 0);
    assert.equal((await one(`select count(*)::int as n from public.daily_challenge_attempts where user_id = $1`, [CAROL])).n, 1);
  });

  it('ranks the leaderboard by score, then calibration, then earliest; nicknames only; practice never counts', async () => {
    await rpc(ALICE, 'set_nickname', { nickname: 'Daily Ada' });
    // Practice after answering is graded but never recorded.
    await rpc(CAROL, 'check_daily_practice', { challengeId, version: 1, answer: { option: options[0].id } });
    const lb = await rpc(BOB, 'get_daily_leaderboard', {});
    assert.equal(lb.participants, 3);
    assert.deepEqual(lb.entries.map((e: any) => [e.rank, e.score]), [[1, 100], [2, 100], [3, 0]]);
    assert.equal(lb.entries[0].nickname, 'Daily Ada');
    assert.equal(lb.entries[1].isMe, true);
    assert.equal(lb.me.rank, 2);
    assert.equal(lb.status, 'completed');
    for (const u of [ALICE, BOB, CAROL]) assert.equal(JSON.stringify(lb).includes(u), false);
    const guest = await rpc(null, 'get_daily_leaderboard', {});
    assert.equal(guest.me, null);
    assert.equal(guest.status, 'signed_out');
  });

  it('an uncertain challenge (no single right answer) is not scored or ranked', async () => {
    const r = await one(`select * from content_admin.daily_score('reasonable', 'uncertain', 3::smallint)`);
    assert.deepEqual([r.score, r.calibration], [null, null]);
  });

  it('history lists past days with the caller’s result, paginated and bounded', async () => {
    const h = await rpc(ALICE, 'get_daily_history', { before: addDays(today, 1), limit: 1 });
    assert.equal(h.items.length, 0, 'today is not history yet');
    for (let i = 1; i <= 8; i++) await ensure(addDays(today, -i));
    const past = await rpc(ALICE, 'get_daily_history', { limit: 5 });
    assert.equal(past.items.length, 5);
    assert.ok(past.next);
    assert.ok(past.items.every((x: any) => x.date < today && x.participants === 0 && !x.mine));
    // Future (already scheduled) days never appear, whatever `before` says.
    const future = await rpc(ALICE, 'get_daily_history', { before: '2040-01-01', limit: 30 });
    assert.ok(future.items.every((x: any) => x.date < today));
    const later = await rpc(ALICE, 'get_daily_history', { before: past.next, limit: 5 });
    assert.ok(later.items.every((x: any) => x.date < past.next));
  });

  it('the scheduled job ensures today and tomorrow, logs its run, and is idempotent', async () => {
    const r1 = (await one('select content_admin.run_scheduled_jobs() as r')).r;
    const r2 = (await one('select content_admin.run_scheduled_jobs() as r')).r;
    assert.equal(r1.daily.challenge, challengeId);
    assert.equal(r2.daily.tomorrow, r1.daily.tomorrow);
    assert.equal((await one(`select count(*)::int as n from public.daily_challenges where challenge_date = $1::date + 1 and status = 'published'`, [today])).n, 1);
    const health = await rows('select * from content_admin.scheduler_health order by step');
    assert.deepEqual(health.map((h) => [h.step, h.ok]), [['daily', true], ['finalize', true], ['weekly', true]]);
    // Tomorrow's is not visible to players yet.
    const r = await rpc(ALICE, 'get_daily_challenges', { from: today, to: addDays(today, 1) });
    assert.equal(r.challenges.length, 1);
  });

  it('clients can’t read the pool, usage, settings or keys, or run any of the admin functions', async () => {
    for (const sql of [
      'select * from public.daily_scenario_pool',
      'select * from public.daily_scenario_usage',
      'select * from public.competition_settings',
      'select * from public.daily_challenge_keys',
      `select content_admin.ensure_daily_challenge(current_date)`,
      `select * from content_admin.daily_schedule`,
      `select content_admin.unpublish_daily_challenge('x')`,
    ]) {
      for (const who of [null, ALICE]) assert.match((await failure(db, who, sql)) ?? 'allowed', /permission denied/, sql);
    }
    assert.match((await failure(db, ALICE, `update public.daily_challenge_attempts set score = 100`))!, /permission denied/);
    // Own attempts only.
    const own = await as(db, BOB, (tx) => tx.query('select user_id from public.daily_challenge_attempts'));
    assert.ok(own.rows.every((r: any) => r.user_id === BOB));
  });
});
