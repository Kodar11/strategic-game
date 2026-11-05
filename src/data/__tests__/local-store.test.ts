import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { kvStore } from '../local/kv-store.ts';
import { type LocalStore, sqlStore } from '../local/local-store.ts';
import { MIGRATIONS, SCHEMA_VERSION, migrate } from '../local/schema.ts';
import { nodeSql } from './node-sql.ts';

/**
 * The local database: migrations, transactions, and the store both engines implement (SQLite on phones, key-value on
 * web) — persistence across a restart, deduplication, and strict per-user isolation.
 */

const ALICE = '00000000-0000-4000-8000-00000000a11c';
const BOB = '00000000-0000-4000-8000-000000000b0b';
const dir = mkdtempSync(join(tmpdir(), 'tactiqo-local-'));
after(() => rmSync(dir, { recursive: true, force: true }));

async function sqliteStore(path = ':memory:') {
  const db = nodeSql(path);
  await migrate(db);
  return { store: sqlStore(db), db };
}

function memoryKv() {
  const m = new Map<string, string>();
  return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v), removeItem: async (k: string) => void m.delete(k), map: m };
}

describe('local database schema', () => {
  it('migrates a new database to the current version, and again is a no-op', async () => {
    const db = nodeSql();
    assert.equal(await migrate(db), SCHEMA_VERSION);
    assert.equal(await migrate(db), SCHEMA_VERSION);
    const tables = (await db.all<{ name: string }>(`select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name`)).map((t) => t.name);
    assert.deepEqual(tables, ['content_cache', 'game_history', 'progress_snapshots', 'sync_queue']);
  });

  it('a failing migration rolls back entirely and leaves the version where it was', async () => {
    const db = nodeSql();
    await migrate(db);
    const broken = [...MIGRATIONS, { version: SCHEMA_VERSION + 1, sql: 'create table half_done (x integer); this is not sql;' }];
    await assert.rejects(migrate(db, broken));
    assert.equal((await db.first<{ user_version: number }>('pragma user_version'))!.user_version, SCHEMA_VERSION);
    assert.equal(await db.first(`select name from sqlite_master where name = 'half_done'`), null);
  });

  it('transactions commit together or not at all, and nothing interleaves with them', async () => {
    const { db } = await sqliteStore();
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.run(`insert into content_cache (key, version, revision, payload, fetched_at) values ('a', 'v', 0, '{}', 0)`);
        throw new Error('boom');
      }),
    );
    assert.equal(await db.first(`select key from content_cache`), null);
    // A write issued while a transaction runs waits for it rather than joining it.
    let release!: () => void;
    const tx = db.transaction(async (t) => {
      await t.run(`insert into content_cache (key, version, revision, payload, fetched_at) values ('b', 'v', 0, '{}', 0)`);
      await new Promise<void>((r) => (release = r));
      throw new Error('rolled back');
    });
    const outside = db.run(`insert into content_cache (key, version, revision, payload, fetched_at) values ('c', 'v', 0, '{}', 0)`);
    await new Promise((r) => setTimeout(r, 5));
    release();
    await assert.rejects(tx);
    await outside;
    assert.deepEqual((await db.all<{ key: string }>(`select key from content_cache order by key`)).map((r) => r.key), ['c']);
  });

  it('concurrent first use migrates once (one shared opening promise in the app; migrate itself is idempotent)', async () => {
    const db = nodeSql();
    const [a, b] = await Promise.all([migrate(db), migrate(db)]);
    assert.equal(a, SCHEMA_VERSION);
    assert.equal(b, SCHEMA_VERSION);
  });
});

const engines: [string, () => Promise<LocalStore>][] = [
  ['sqlite', async () => (await sqliteStore()).store],
  ['kv', async () => kvStore(memoryKv())],
];

for (const [name, make] of engines) {
  describe(`local store (${name})`, () => {
    it('queues operations per user, in order, and never duplicates an id', async () => {
      const s = await make();
      await s.enqueue(ALICE, { id: 'op-1', kind: 'progress', payload: { a: 1 } });
      await s.enqueue(ALICE, { id: 'op-2', kind: 'progress', payload: { a: 2 } });
      await s.enqueue(ALICE, { id: 'op-1', kind: 'progress', payload: { a: 'again' } });
      // The same id from another account is ignored, never reassigned to them.
      await s.enqueue(BOB, { id: 'op-1', kind: 'progress', payload: { b: 1 } });
      await s.enqueue(BOB, { id: 'op-3', kind: 'progress', payload: { b: 3 } });
      assert.deepEqual((await s.pending(ALICE, 'progress')).map((o) => [o.id, o.payload]), [['op-1', { a: 1 }], ['op-2', { a: 2 }]]);
      assert.deepEqual((await s.pending(BOB, 'progress')).map((o) => o.id), ['op-3']);
      assert.deepEqual(await s.pending(ALICE, 'practice_game'), []);
    });

    it('acknowledging, noting attempts and failing touch only the owner’s rows', async () => {
      const s = await make();
      await s.enqueue(ALICE, { id: 'a1', kind: 'progress', payload: {} });
      await s.enqueue(ALICE, { id: 'a2', kind: 'progress', payload: {} });
      await s.enqueue(BOB, { id: 'b1', kind: 'progress', payload: {} });
      await s.acknowledge(BOB, ['a1']);
      assert.equal((await s.pending(ALICE, 'progress')).length, 2);
      await s.noteAttempt(ALICE, ['a1'], 10, 20, 'timeout');
      const [a1] = await s.pending(ALICE, 'progress');
      assert.deepEqual([a1.attempts, a1.lastAttemptAt, a1.nextAttemptAt, a1.lastError], [1, 10, 20, 'timeout']);
      await s.fail(ALICE, ['a2'], 'validation_failed');
      await s.acknowledge(ALICE, ['a1']);
      assert.deepEqual(await s.pending(ALICE, 'progress'), []);
      assert.equal(await s.pendingCount(ALICE), 0);
      assert.equal(await s.pendingCount(BOB), 1);
    });

    it('clearing a user keeps or drops their queue as asked, and never touches anyone else', async () => {
      const s = await make();
      await s.enqueue(ALICE, { id: 'a1', kind: 'progress', payload: {} });
      await s.enqueue(BOB, { id: 'b1', kind: 'practice_game', payload: {} });
      await s.saveSnapshot(ALICE, { completed: ['x'] });
      await s.saveSnapshot(BOB, { completed: ['y'] });
      await s.recordGame(ALICE, { sessionId: 'g1', game: 'rps', payload: {}, playedAt: 1, synced: false });
      await s.clearUser(ALICE, { queue: false });
      assert.equal(await s.loadSnapshot(ALICE), null);
      assert.deepEqual(await s.games(ALICE, 10), []);
      assert.equal((await s.pending(ALICE, 'progress')).length, 1, 'kept for when they sign in again');
      await s.clearUser(ALICE, { queue: true });
      assert.equal(await s.pendingCount(ALICE), 0);
      assert.deepEqual((await s.loadSnapshot(BOB))?.payload, { completed: ['y'] });
      assert.equal(await s.pendingCount(BOB), 1);
      await s.clearOthers(ALICE);
      assert.equal(await s.loadSnapshot(BOB), null);
      assert.equal(await s.pendingCount(BOB), 1, 'queues survive clearOthers');
    });

    it('purges old failed operations and long-abandoned pending ones only', async () => {
      const s = await make();
      await s.enqueue(ALICE, { id: 'old', kind: 'progress', payload: {}, createdAt: 1 });
      await s.enqueue(ALICE, { id: 'new', kind: 'progress', payload: {}, createdAt: 1_000 });
      await s.purge(0, 500);
      assert.deepEqual((await s.pending(ALICE, 'progress')).map((o) => o.id), ['new']);
    });

    it('snapshots keep when the server copy was last loaded', async () => {
      const s = await make();
      await s.saveSnapshot(ALICE, { v: 1 }, { serverLoaded: true });
      const first = (await s.loadSnapshot(ALICE))!;
      assert.ok(first.serverLoadedAt);
      await s.saveSnapshot(ALICE, { v: 2 });
      const second = (await s.loadSnapshot(ALICE))!;
      assert.deepEqual(second.payload, { v: 2 });
      assert.equal(second.serverLoadedAt, first.serverLoadedAt);
    });

    it('content is replaced as a whole, and game history is per user, newest first, deduplicated', async () => {
      const s = await make();
      await s.saveContent('catalog', { version: 'v1', revision: 1, payload: { lessons: [1] }, fetchedAt: 1 });
      await s.saveContent('catalog', { version: 'v2', revision: 2, payload: { lessons: [1, 2] }, fetchedAt: 2 });
      assert.deepEqual(await s.loadContent('catalog'), { version: 'v2', revision: 2, payload: { lessons: [1, 2] }, fetchedAt: 2 });
      await s.recordGame(ALICE, { sessionId: 'g1', game: 'rps', payload: { n: 1 }, playedAt: 1, synced: false });
      await s.recordGame(ALICE, { sessionId: 'g2', game: 'rps', payload: { n: 2 }, playedAt: 2, synced: false });
      await s.recordGame(ALICE, { sessionId: 'g1', game: 'rps', payload: { n: 'dup' }, playedAt: 3, synced: false });
      await s.recordGame(BOB, { sessionId: 'g3', game: 'rps', payload: {}, playedAt: 4, synced: false });
      await s.markGamesSynced(ALICE, ['g1']);
      assert.deepEqual((await s.games(ALICE, 10)).map((g) => [g.sessionId, g.synced]), [['g2', false], ['g1', true]]);
    });
  });
}

describe('local store survives a restart', () => {
  it('a reopened database file has the queue, snapshot and content exactly as left', async () => {
    const path = join(dir, 'restart.db');
    const first = await sqliteStore(path);
    await first.store.enqueue(ALICE, { id: 'op-1', kind: 'progress', payload: { lessonsCompleted: ['x'] } });
    await first.store.saveSnapshot(ALICE, { completed: ['x'] });
    first.db.close();
    const second = await sqliteStore(path);
    assert.deepEqual((await second.store.pending(ALICE, 'progress')).map((o) => o.payload), [{ lessonsCompleted: ['x'] }]);
    assert.deepEqual((await second.store.loadSnapshot(ALICE))?.payload, { completed: ['x'] });
    second.db.close();
  });

  it('a corrupted row is set aside instead of blocking the queue, and a corrupted snapshot reads as none', async () => {
    const { store, db } = await sqliteStore();
    await store.enqueue(ALICE, { id: 'good-1', kind: 'progress', payload: { a: 1 } });
    await db.run(`insert into sync_queue (id, user_id, kind, payload, created_at) values ('bad', ?, 'progress', '{not json', 0)`, [ALICE]);
    await store.enqueue(ALICE, { id: 'good-2', kind: 'progress', payload: { a: 2 } });
    assert.deepEqual((await store.pending(ALICE, 'progress')).map((o) => o.id), ['good-1', 'good-2']);
    assert.equal((await db.first<{ status: string }>(`select status from sync_queue where id = 'bad'`))!.status, 'failed');
    await db.run(`insert into progress_snapshots (user_id, payload, saved_at) values (?, '{broken', 0)`, [BOB]);
    assert.equal(await store.loadSnapshot(BOB), null);
  });

  it('the key-value store keeps its data across a new instance over the same storage', async () => {
    const kv = memoryKv();
    await kvStore(kv).enqueue(ALICE, { id: 'op-1', kind: 'progress', payload: { x: 1 } });
    assert.equal((await kvStore(kv).pending(ALICE, 'progress')).length, 1);
    // Damaged storage reads as empty rather than throwing.
    kv.map.set('tactiqo/local-queue/v1', '{oops');
    assert.deepEqual(await kvStore(kv).pending(ALICE, 'progress'), []);
  });
});
