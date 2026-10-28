/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { accountDeletionError, accountRepository } from '../../src/data/account.ts';
import { DataError } from '../../src/data/errors.ts';
import { addUser, as, createDatabase, failure, pgRpc } from './pg.ts';

/**
 * delete_my_account against the real migrations: it deletes the caller's account and every row tied to it, never
 * anyone else's, and only for a signed-in caller.
 */

let db: PGlite;
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ALICE = uid(0xa1);
const BOB = uid(0xb2);

before(async () => {
  db = await createDatabase();
});

after(async () => {
  await db.close();
});

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

/** Every column that points at auth.users, read from the catalog, so a table added later is covered automatically. */
async function userColumns(): Promise<{ table: string; column: string }[]> {
  const r = await db.query<{ table: string; column: string }>(`
    select c.conrelid::regclass::text as table, a.attname as column
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass`);
  return r.rows;
}

async function rowsFor(id: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const { table, column } of await userColumns()) {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${column} = $1`, [id]);
    out[`${table}.${column}`] = r.rows[0].n;
  }
  return out;
}

/** Give a player data in every kind of table: progress, a nickname, practice games, a challenge and a match on another's. */
async function populate(id: string, name: string, n: number) {
  await addUser(db, id);
  await apply(id, {
    goal: { value: 'incentives' },
    attempts: [attempt('l1.a.classic-dilemma', 1000 + n)],
    scenariosDone: ['l1.a.classic-dilemma'],
    lessonsCompleted: ['cooperation-trap'],
  });
  await rpc(id, 'set_nickname', { nickname: name });
  await rpc(id, 'record_practice_game', { id: `0f8fad5b-d9cb-469f-a165-7086772895${n.toString().padStart(2, '0')}`, game: 'ultimatum', bot: 'fair', difficulty: 'easy', playerScore: 30, botScore: 30, outcome: 'draw' });
  const challenge = await rpc(id, 'create_challenge', { game: 'rps', bot: 'mind-reader', difficulty: 'hard' });
  await rpc(id, 'start_match', { kind: 'challenge', token: challenge.token });
  return challenge.token as string;
}

describe('delete_my_account', () => {
  let aliceToken: string;
  let bobToken: string;

  before(async () => {
    aliceToken = await populate(ALICE, 'Alice A', 1);
    bobToken = await populate(BOB, 'Bob B', 2);
    // Each plays the other's friend challenge.
    await rpc(ALICE, 'start_match', { kind: 'challenge', token: bobToken });
    await rpc(BOB, 'start_match', { kind: 'challenge', token: aliceToken });
  });

  it('every user table is populated for both players before deletion', async () => {
    for (const id of [ALICE, BOB]) {
      const rows = await rowsFor(id);
      for (const key of ['learner_profiles.user_id', 'learning_attempts.user_id', 'player_profiles.user_id', 'game_practice_results.user_id', 'game_challenges.created_by', 'game_matches.user_id']) {
        assert.ok(rows[key] > 0, `${id} ${key}`);
      }
    }
  });

  it('refuses a signed-out caller, and anon can’t even call it', async () => {
    assert.match((await failure(db, null, 'select public.delete_my_account()'))!, /permission denied/);
    // A signed-in role without a user id in its token.
    const noSub = await db
      .transaction(async (tx) => {
        await tx.exec('set local role authenticated');
        await tx.query(`select set_config('request.jwt.claims', '{"role":"authenticated"}', true)`);
        await tx.query('select public.delete_my_account()');
      })
      .then(() => null)
      .catch((e: Error) => e.message);
    assert.match(noSub!, /account:not_signed_in/);
  });

  it('takes no arguments, so a client can’t name another account', async () => {
    assert.ok(await failure(db, ALICE, 'select public.delete_my_account($1::uuid)', [BOB]));
    assert.ok(await failure(db, ALICE, `select public.delete_my_account(request => $1::jsonb)`, [JSON.stringify({ user_id: BOB })]));
    assert.equal((await db.query('select 1 from auth.users where id = $1', [BOB])).rows.length, 1);
  });

  it('deletes the caller’s account and all of its rows, leaving the other player intact', async () => {
    const bobBefore = await rowsFor(BOB);
    const r = await accountRepository(pgRpc(db, ALICE) as never).deleteMyAccount();
    assert.equal(r, undefined);

    assert.equal((await db.query('select 1 from auth.users where id = $1', [ALICE])).rows.length, 0);
    for (const [key, n] of Object.entries(await rowsFor(ALICE))) assert.equal(n, 0, key);

    // Bob keeps everything except his match on Alice's challenge, which went with the challenge.
    const bobAfter = await rowsFor(BOB);
    assert.deepEqual({ ...bobAfter, 'game_matches.user_id': 0 }, { ...bobBefore, 'game_matches.user_id': 0 });
    assert.equal(bobAfter['game_matches.user_id'], bobBefore['game_matches.user_id'] - 1);
    assert.equal((await rpc(BOB, 'get_challenge', { token: bobToken })).players, 0);
  });

  it('frees the nickname for someone else', async () => {
    const carol = uid(0xc3);
    await addUser(db, carol);
    assert.deepEqual(await rpc(carol, 'set_nickname', { nickname: 'Alice A' }), { nickname: 'Alice A' });
  });

  it('a retried request for an already deleted account is refused by the server, and the app reads it as done', async () => {
    assert.match((await failure(db, ALICE, 'select public.delete_my_account()'))!, /account:not_found/);
    await accountRepository(pgRpc(db, ALICE) as never).deleteMyAccount();
  });

  it('an unexpected answer or a transport failure is never reported as success', async () => {
    const answering = (r: unknown) => accountRepository({ call: async () => r });
    await assert.rejects(answering(null).deleteMyAccount(), (e: unknown) => e instanceof DataError && e.kind === 'server');
    await assert.rejects(answering({ deleted: false }).deleteMyAccount(), (e: unknown) => e instanceof DataError);
    const offline = accountRepository({
      call: async () => {
        throw new TypeError('Network request failed');
      },
    });
    await assert.rejects(offline.deleteMyAccount(), (e: unknown) => e instanceof DataError && e.kind === 'network');
    assert.match(accountDeletionError(new DataError('network')), /wasn’t deleted/);
    assert.match(accountDeletionError({ code: 'PGRST301', message: 'JWT expired' }), /nothing was deleted/);
  });

  it('a new anonymous account starts empty', async () => {
    const fresh = uid(0xd4);
    await addUser(db, fresh);
    const p = (await as(db, fresh, (tx) => tx.query<{ p: any }>('select public.get_my_progress() as p'))).rows[0].p;
    assert.deepEqual([p.completed, p.learning, p.goal], [[], [], null]);
  });
});
