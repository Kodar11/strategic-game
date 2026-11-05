/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { PUBLIC_RPCS } from '../../src/data/public-rpcs.ts';
import { addUser, as, createDatabase, failure, pgRpc } from './pg.ts';

/**
 * Google-only identity against the real migrations: what a guest (`anon`, no session) can reach, that two signed-in
 * accounts can't see or change each other's rows in any user table, and that an access token still in circulation
 * after its account was deleted can't write anything back (no data resurrection).
 */

let db: PGlite;
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ALICE = uid(0xa11);
const BOB = uid(0xb22);

const rpc = (user: string | null, fn: string, request?: unknown) => pgRpc(db, user).call(fn, request === undefined ? undefined : { request }) as Promise<any>;
const apply = (id: string, changes: unknown) => as(db, id, (tx) => tx.query('select public.apply_progress_changes($1::jsonb)', [JSON.stringify(changes)]));

const attempt = (item: string, lockedAt: number) => ({
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
  attempt: 1,
  lessonCompleted: false,
  contentVersion: 1,
});

const arena = (n: number) => ({
  id: `2f8fad5b-d9cb-469f-a165-7086772895${n.toString().padStart(2, '0')}`,
  game: 'market',
  opponent: 'banker',
  level: 'hard',
  variant: 'standard',
  length: 'standard',
  outcome: 'win',
  playerScore: 1200,
  rivalScore: 1100,
  rounds: 8,
  playedAt: Date.now(),
});

async function populate(id: string, name: string, n: number) {
  await addUser(db, id);
  await apply(id, { goal: { value: 'incentives' }, attempts: [attempt('l1.a.classic-dilemma', 1000 + n)], scenariosDone: ['l1.a.classic-dilemma'], lessonsCompleted: ['cooperation-trap'] });
  await rpc(id, 'set_nickname', { nickname: name });
  await rpc(id, 'record_practice_game', { id: `3f8fad5b-d9cb-469f-a165-7086772895${n.toString().padStart(2, '0')}`, game: 'ultimatum', bot: 'fair', difficulty: 'easy', playerScore: 30, botScore: 30, outcome: 'draw' });
  await rpc(id, 'record_arena_matches', { matches: [arena(n)] });
  const challenge = await rpc(id, 'create_challenge', { game: 'rps', bot: 'mind-reader', difficulty: 'hard' });
  await rpc(id, 'start_match', { kind: 'challenge', token: challenge.token });
}

/** Every (table, column) that points at auth.users, read from the catalog, so a table added later is covered. */
async function userColumns(): Promise<{ table: string; column: string }[]> {
  const r = await db.query<{ table: string; column: string }>(`
    select c.conrelid::regclass::text as table, a.attname as column
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass`);
  return r.rows;
}

before(async () => {
  db = await createDatabase();
  await populate(ALICE, 'Alice Auth', 41);
  await populate(BOB, 'Bob Auth', 42);
});

after(async () => {
  await db.close();
});

describe('guests (no session)', () => {
  it('can call exactly the functions the app treats as public, and no per-player function', async () => {
    const r = await db.query<{ name: string }>(`
      select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    assert.deepEqual(
      r.rows.map((x) => x.name),
      [...PUBLIC_RPCS].sort(),
    );
  });

  it('get nothing from the per-player functions even if the app’s own check were skipped', async () => {
    for (const sql of ['select public.get_my_progress()', `select public.apply_progress_changes('{}'::jsonb)`, `select public.get_daily_challenges('{}'::jsonb)`, `select public.set_nickname('{}'::jsonb)`, 'select public.get_my_games()', 'select public.get_my_arena_matches()', 'select public.delete_my_account()']) {
      assert.match((await failure(db, null, sql))!, /permission denied/, sql);
    }
  });

  it('can’t read any user table', async () => {
    for (const { table } of await userColumns()) {
      const err = await failure(db, null, `select count(*) from ${table}`);
      if (err) assert.match(err, /permission denied/, table);
      else {
        const n = (await as(db, null, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from ${table}`))).rows[0].n;
        assert.equal(n, 0, `${table} is readable by a guest`);
      }
    }
  });

  it('every table in the public schema has row level security on', async () => {
    const r = await db.query<{ t: string }>(`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    assert.deepEqual(r.rows, []);
  });
});

describe('two signed-in accounts', () => {
  it('each sees only their own rows in every user table', async () => {
    for (const { table, column } of await userColumns()) {
      const err = await failure(db, ALICE, `select count(*) from ${table} where ${column} = $1`, [BOB]);
      if (err) {
        assert.match(err, /permission denied/, table);
        continue;
      }
      const theirs = (await as(db, ALICE, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from ${table} where ${column} = $1`, [BOB]))).rows[0].n;
      assert.equal(theirs, 0, `${table}.${column}: Alice can read Bob's rows`);
    }
  });

  it('can’t write rows for the other account, whatever user id the request names', async () => {
    for (const { table, column } of await userColumns()) {
      const upd = await as(db, ALICE, (tx) => tx.query(`update ${table} set ${column} = ${column} where ${column} = $1`, [BOB]))
        .then((r) => r.affectedRows ?? 0)
        .catch(() => 0);
      assert.equal(upd, 0, `${table}: Alice updated Bob's rows`);
      const del = await as(db, ALICE, (tx) => tx.query(`delete from ${table} where ${column} = $1`, [BOB]))
        .then((r) => r.affectedRows ?? 0)
        .catch(() => 0);
      assert.equal(del, 0, `${table}: Alice deleted Bob's rows`);
    }
    // Inserting a row in Bob's name is refused by the owner check.
    assert.ok(await failure(db, ALICE, `insert into public.learner_profiles (user_id, goal) values ($1, 'incentives')`, [BOB]));
    assert.ok(await failure(db, ALICE, `insert into public.lesson_progress (user_id, lesson_id, runtime) values ($1, 'cooperation-trap', '{}'::jsonb)`, [BOB]));
  });

  it('progress functions act on the caller only', async () => {
    const alice = await rpc(ALICE, 'get_my_progress');
    const bob = await rpc(BOB, 'get_my_progress');
    assert.deepEqual(alice.learning.map((a: { id: string }) => a.id), ['l1.a.classic-dilemma@1041']);
    assert.deepEqual(bob.learning.map((a: { id: string }) => a.id), ['l1.a.classic-dilemma@1042']);
  });
});

describe('after deletion', () => {
  it('a still-valid access token for the deleted account can’t write anything back', async () => {
    assert.deepEqual(await rpc(ALICE, 'delete_my_account'), { deleted: true });
    // auth.uid() still names Alice (a JWT issued before the deletion), but every user table references auth.users.
    assert.ok(await failure(db, ALICE, 'select public.apply_progress_changes($1::jsonb)', [JSON.stringify({ attempts: [attempt('l1.a.classic-dilemma', 9999)] })]));
    assert.ok(await failure(db, ALICE, 'select public.record_arena_matches($1::jsonb)', [JSON.stringify({ matches: [arena(43)] })]));
    assert.ok(await failure(db, ALICE, 'select public.set_nickname($1::jsonb)', [JSON.stringify({ nickname: 'Alice Again' })]));
    for (const { table, column } of await userColumns()) {
      const n = (await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${column} = $1`, [ALICE])).rows[0].n;
      assert.equal(n, 0, `${table} has rows for the deleted account`);
    }
    // Reading returns nothing of the old account.
    const p = await rpc(ALICE, 'get_my_progress');
    assert.deepEqual([p.completed, p.learning], [[], []]);
  });

  it('signing in again with the same Google identity is a new, empty account', async () => {
    // Supabase creates a new auth.users row (a new id) for an identity whose user was deleted.
    const again = uid(0xa12);
    await addUser(db, again);
    const p = await rpc(again, 'get_my_progress');
    assert.deepEqual([p.completed, p.learning, p.goal], [[], [], null]);
  });
});
