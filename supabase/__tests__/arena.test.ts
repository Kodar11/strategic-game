/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { arenaRepository } from '../../src/data/arena.ts';
import { addUser, as, createDatabase, failure, pgRpc } from './pg.ts';

/**
 * Arena match summaries against the real migrations: owner-only, insert-only through one idempotent function,
 * validated, and removed with the account.
 */

let db: PGlite;
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ALICE = uid(0xa11);
const BOB = uid(0xb22);
const id = (n: number) => `2f8fad5b-d9cb-469f-a165-${n.toString().padStart(12, '0')}`;

const summary = (n: number, over: Record<string, unknown> = {}) => ({
  id: id(n),
  game: 'signal',
  opponent: 'opportunist',
  level: 'normal',
  variant: 'standard',
  length: 'standard',
  outcome: 'win',
  playerScore: 14,
  rivalScore: 9,
  rounds: 8,
  playedAt: Date.now() - n * 1000,
  ...over,
});
const record = (user: string | null, matches: unknown[]) => pgRpc(db, user).call('record_arena_matches', { request: { matches } }) as Promise<{ recorded: number }>;

before(async () => {
  db = await createDatabase({ seed: false });
  await addUser(db, ALICE);
  await addUser(db, BOB);
});

after(async () => {
  await db.close();
});

describe('arena match summaries', () => {
  it('records a batch for the caller and returns how many were new', async () => {
    assert.deepEqual(await record(ALICE, [summary(1), summary(2)]), { recorded: 2 });
    const mine = (await pgRpc(db, ALICE).call('get_my_arena_matches')) as { id: string; game: string; playerScore: number }[];
    assert.deepEqual(mine.map((m) => m.id).sort(), [id(1), id(2)]);
    assert.equal(mine[0].game, 'signal');
  });

  it('is idempotent: a retried upload records nothing twice', async () => {
    assert.deepEqual(await record(ALICE, [summary(1), summary(2), summary(3)]), { recorded: 1 });
    assert.deepEqual(await record(ALICE, [summary(3)]), { recorded: 0 });
    const n = await db.query<{ n: number }>('select count(*)::int as n from public.arena_matches where user_id = $1', [ALICE]);
    assert.equal(n.rows[0].n, 3);
  });

  it('a replayed id from another player can’t overwrite or take over a row', async () => {
    assert.deepEqual(await record(BOB, [summary(1, { playerScore: 999 })]), { recorded: 0 });
    const row = await db.query<{ user_id: string; player_score: number }>('select user_id, player_score from public.arena_matches where id = $1', [id(1)]);
    assert.deepEqual(row.rows[0], { user_id: ALICE, player_score: 14 });
  });

  it('owner-only reads: another player sees none of it, and anon can’t read or write', async () => {
    const seen = await as(db, BOB, (tx) => tx.query('select * from public.arena_matches'));
    assert.equal(seen.rows.length, 0);
    assert.deepEqual(await pgRpc(db, BOB).call('get_my_arena_matches'), []);
    assert.match((await failure(db, null, 'select * from public.arena_matches'))!, /permission denied/);
    assert.match((await failure(db, null, `select public.record_arena_matches('{"matches":[]}'::jsonb)`))!, /permission denied/);
  });

  it('no direct writes: clients can’t insert, update or delete rows', async () => {
    assert.match((await failure(db, ALICE, `insert into public.arena_matches (id, user_id, game_id, opponent, level, variant, match_length, outcome, player_score, rival_score, rounds_played, played_at) values ($1, $2, 'market', 'banker', 'easy', 'standard', 'short', 'win', 1, 0, 5, now())`, [id(50), BOB]))!, /permission denied/);
    assert.match((await failure(db, ALICE, 'update public.arena_matches set player_score = 0'))!, /permission denied/);
    assert.match((await failure(db, ALICE, 'delete from public.arena_matches'))!, /permission denied/);
  });

  it('refuses malformed summaries and writes nothing from a bad batch', async () => {
    const bad = [
      { game: 'chess' },
      { id: 'not-a-uuid' },
      { level: 'expert' },
      { outcome: 'won' },
      { length: 'epic' },
      { opponent: 'DROP TABLE' },
      { playerScore: '12' },
      { playedAt: Date.now() + 3 * 86400000 },
      { playedAt: 1000 },
    ];
    for (const [k, b] of bad.entries()) {
      const msg = await record(ALICE, [summary(100 + k), summary(200 + k, b)]).then(
        () => null,
        (e: Error) => e.message,
      );
      assert.match(msg ?? '', /arena:invalid_request/, JSON.stringify(b));
    }
    const n = await db.query<{ n: number }>('select count(*)::int as n from public.arena_matches where id::text like $1', ['%-0000000001__']);
    assert.equal(n.rows[0].n, 0);
    await assert.rejects(record(ALICE, []), /arena:invalid_request/);
    await assert.rejects(record(ALICE, Array.from({ length: 51 }, (_, i) => summary(300 + i))), /arena:invalid_request/);
  });

  it('the app’s repository round-trips through the real SQL', async () => {
    const repo = arenaRepository(pgRpc(db, BOB) as never);
    assert.equal(await repo.record([summary(400, { game: 'mole', opponent: 'deceiver', outcome: 'loss' }) as never]), 1);
    const mine = await repo.mine();
    assert.equal(mine.length, 1);
    assert.equal(mine[0].game, 'mole');
  });

  it('rows go with the account', async () => {
    await pgRpc(db, BOB).call('delete_my_account');
    const n = await db.query<{ n: number }>('select count(*)::int as n from public.arena_matches where user_id = $1', [BOB]);
    assert.equal(n.rows[0].n, 0);
    const a = await db.query<{ n: number }>('select count(*)::int as n from public.arena_matches where user_id = $1', [ALICE]);
    assert.equal(a.rows[0].n, 3, 'the other player keeps theirs');
  });
});
