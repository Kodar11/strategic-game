/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { addUser, createDatabase, pgRpc } from './pg.ts';

/** set_nickname's impersonation and offensive-name rules, against the real migrations. */

let db: PGlite;
const USER = '00000000-0000-4000-8000-00000000c0de';

before(async () => {
  db = await createDatabase({ seed: false });
  await addUser(db, USER);
});

after(async () => {
  await db.close();
});

const set = (nickname: string) =>
  pgRpc(db, USER)
    .call('set_nickname', { request: { nickname } })
    .then(
      () => 'ok',
      (e: Error) => /games:(nickname_[a-z_]+)/.exec(e.message)?.[1] ?? e.message,
    );

describe('nickname rules', () => {
  it('refuses names that impersonate Tactiqo or its staff, disguised or not', async () => {
    for (const name of ['Tactiqo', 'Tactiqo_Team', 'TactiqoOfficial', 'tact1qo', 'The.Tactiqo', 'Admin', 'AdminBob', 'bob_support', 'Support Team', 'Official Ada', 'Moderator', 'm0derator', 'Tactiqo Staff', 'Founder', 'Ada Verified'])
      assert.equal(await set(name), 'nickname_reserved', name);
  });

  it('refuses offensive names, including digit look-alikes and separators', async () => {
    for (const name of ['fuckface', 'F.U.C.K', 'sh1tlord', 'b1tch99', 'Hitler88', 'n4zi', 'chutiya', 'bhenchod', 'big dick', 'Ass', 'r4pe'])
      assert.equal(await set(name), 'nickname_not_allowed', name);
  });

  it('allows ordinary names that only contain those letters inside other words', async () => {
    for (const name of ['Badminton Ace', 'Dickens Fan', 'Cassandra', 'Grapefruit', 'Torpedo', 'Titan', 'Classic', 'Sussex Sam', 'Dev Patel', 'Team Rocket', 'Scunthorpe Utd', 'Ada_Lovelace', 'Priya 21'])
      assert.equal(await set(name), 'ok', name);
  });

  it('keeps the existing rules and codes', async () => {
    assert.equal(await set('ab'), 'nickname_length');
    assert.equal(await set('_lead'), 'nickname_characters');
    assert.equal(await set('a.-_'), 'nickname_reserved');
    assert.equal(await set('Strategic Game'), 'nickname_reserved');
  });

  it('clients can’t call the checker directly', async () => {
    const r = await pgRpc(db, USER).call('set_nickname', { request: { nickname: 'Fine Name' } });
    assert.deepEqual(r, { nickname: 'Fine Name' });
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.exec('set local role authenticated');
        await tx.query(`select game_engine.nickname_problem('x')`);
      }),
      /permission denied/,
    );
  });
});
