import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { addUser, as, createDatabase, failure, pgRpc } from '../../../supabase/__tests__/pg.ts';
import { chooseAnswer, emptyPrediction, rateConfidence } from '../../components/lesson/prediction-state.ts';
import { buildCatalog } from '../../content/build.ts';
import { installSeedCatalog, readSeed } from '../../content/seed.ts';
import { submitChallenge } from '../../features/challenges/progress.ts';
import { applyScenarioInput, lockScenarioPrediction, setScenarioPrediction } from '../../features/scenarios/runtime.ts';
import { EMPTY_PROGRESS, type ProgressData, sanitizeProgress } from '../../store/progress-state.ts';
import { type ProgressChanges, applyProgressChanges, diffProgress } from '../changes.ts';
import { contentVersion, loadStartupDocument, refreshDocument } from '../content-cache.ts';
import { gamesRepository } from '../games.ts';
import { kvStore } from '../local/kv-store.ts';
import { type LocalStore, sqlStore } from '../local/local-store.ts';
import { migrate } from '../local/schema.ts';
import { Outbox, type OutboxEntry } from '../outbox.ts';
import { progressRepository } from '../repositories.ts';
import { indicatorFor, looksOffline, networkOf } from '../sync/indicator.ts';
import { OperationQueue } from '../sync/operation-queue.ts';
import { localOutboxStore } from '../sync/outbox-store.ts';
import { RETRY_STEPS_MS, classifySyncError, retryDelay } from '../sync/retry-policy.ts';
import { nodeSql } from './node-sql.ts';

/**
 * Offline-first sync end to end: the device queue (real SQLite schema), the outbox and the practice-game queue, and
 * the server's exactly-once function (real SQL in PGlite). Network failures are simulated at the Rpc boundary.
 */

installSeedCatalog();

const USER = '00000000-0000-4000-8000-0000000000d1';
const OTHER = '00000000-0000-4000-8000-0000000000d2';
const THIRD = '00000000-0000-4000-8000-0000000000d3';
let db: PGlite;
before(async () => {
  db = await createDatabase();
  for (const u of [USER, OTHER, THIRD]) await addUser(db, u);
});
after(async () => {
  await db.close();
});

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));

const offline = () => new TypeError('Failed to fetch');
const classify = (e: unknown) => {
  const f = classifySyncError(e);
  return { kind: f.retry ? ('transient' as const) : ('permanent' as const), message: f.message };
};

async function device(path = ':memory:'): Promise<{ store: LocalStore; close: () => void }> {
  const sql = nodeSql(path);
  await migrate(sql);
  return { store: sqlStore(sql), close: () => sql.close() };
}

function outboxFor(store: LocalStore, sendOps: (ops: readonly OutboxEntry[]) => Promise<void>) {
  const o = new Outbox({ sendOps, classify, store: localOutboxStore(async () => store), debounceMs: 1e9, retryDelay: () => 1e9 });
  cleanup.push(() => o.stop());
  return o;
}

/** A learner's actions, each diffed exactly as src/data/session.ts does. */
function learner(start: ProgressData = EMPTY_PROGRESS) {
  let state = start;
  const batches: ProgressChanges[] = [];
  const commit = (next: ProgressData, reset = false) => {
    batches.push(diffProgress(state, next, reset));
    state = next;
  };
  return {
    batches,
    get state() {
      return state;
    },
    scenario(id: string, answer: string, inputs: (string | number)[], at: number) {
      commit({ ...state, scenarioRuns: setScenarioPrediction(state, id, rateConfidence(chooseAnswer(emptyPrediction<string>(), answer), 3))! });
      commit({ ...state, scenarioRuns: lockScenarioPrediction(state, id, at)! });
      for (const x of inputs) commit({ ...state, ...applyScenarioInput(state, id, x)! });
    },
    challenge(id: string, answer: string, at: number) {
      commit({ ...state, challengeDrafts: { ...state.challengeDrafts, [id]: rateConfidence(chooseAnswer(emptyPrediction<string>(), answer), 4) } });
      commit({ ...state, ...submitChallenge(state, id, at)! });
    },
    step(step: number) {
      commit({ ...state, runtime: { ...state.runtime, 'cooperation-trap': { step, total: 15, data: { step }, updatedAt: step } } });
    },
    complete() {
      const runtime = { ...state.runtime };
      delete runtime['cooperation-trap'];
      commit({ ...state, completed: [...state.completed, 'cooperation-trap'], runtime });
    },
    reset() {
      commit({ ...EMPTY_PROGRESS, goal: state.goal }, true);
    },
  };
}

describe('Rebuilding progress from queued changes', () => {
  it('a snapshot plus the queued changes gives exactly what the learner saw, even if the snapshot already has some', () => {
    const l = learner();
    l.step(2);
    l.scenario('l1.a.classic-dilemma', 'confess', ['silent'], 1000);
    l.challenge('l1.c1.discount-war', 'both-discount', 1100);
    const midway = l.state;
    const firstHalf = l.batches.length;
    l.step(7);
    l.complete();
    l.scenario('l1.b.shared-project', '10', [7], 1200);
    // From nothing, everything replays to the final state.
    assert.deepEqual(sanitizeProgress(l.batches.reduce(applyProgressChanges, EMPTY_PROGRESS)), sanitizeProgress(l.state));
    // A snapshot taken midway with the whole queue still pending: re-applying what it already has changes nothing.
    assert.deepEqual(sanitizeProgress(l.batches.reduce(applyProgressChanges, midway)), sanitizeProgress(l.state));
    // A snapshot taken midway with only the later changes pending.
    assert.deepEqual(sanitizeProgress(l.batches.slice(firstHalf).reduce(applyProgressChanges, midway)), sanitizeProgress(l.state));
  });

  it('a queued reset clears everything before it, and later changes survive it', () => {
    const l = learner();
    l.complete();
    l.reset();
    l.scenario('l1.a.classic-dilemma', 'silent', [], 2000);
    const fromSnapshot = l.batches.reduce(applyProgressChanges, { ...l.state, completed: ['cooperation-trap'] });
    assert.deepEqual(sanitizeProgress(fromSnapshot), sanitizeProgress(l.state));
    assert.deepEqual(fromSnapshot.completed, []);
  });

  it('applies server-style rules: attempts and completions are never removed by an older copy', () => {
    const l = learner();
    l.scenario('l1.a.classic-dilemma', 'confess', ['silent'], 1000);
    // Another device's server copy has one more completion; the local queue only adds.
    const server: ProgressData = { ...EMPTY_PROGRESS, completed: ['cooperation-trap'] };
    const merged = l.batches.reduce(applyProgressChanges, server);
    assert.deepEqual(merged.completed, ['cooperation-trap']);
    assert.equal(merged.learning.length, 1);
    assert.deepEqual(applyProgressChanges(merged, l.batches[l.batches.length - 1]), merged);
  });
});

describe('apply_progress_ops: each operation exactly once', () => {
  const rpc = (id: string | null) => pgRpc(db, id);
  const op = (id: string, changes: ProgressChanges) => ({ id, changes });

  it('a resent operation is recognised and not applied again', async () => {
    const repo = progressRepository(rpc(USER));
    const first = await repo.applyOps([op('11111111-1111-4111-8111-111111111111', { lessonsCompleted: ['cooperation-trap'] })]);
    assert.deepEqual([first.applied.length, first.duplicates.length], [1, 0]);
    const again = await repo.applyOps([op('11111111-1111-4111-8111-111111111111', { lessonsCompleted: ['cooperation-trap'] }), op('22222222-2222-4222-8222-222222222222', { goal: { value: 'coordination' } })]);
    assert.deepEqual(again.duplicates, ['11111111-1111-4111-8111-111111111111']);
    assert.deepEqual(again.applied, ['22222222-2222-4222-8222-222222222222']);
    assert.equal((await repo.load()).goal, 'coordination');
  });

  it('a reset whose answer was lost is not replayed over another device’s later progress', async () => {
    const a = progressRepository(rpc(OTHER));
    await a.apply({ lessonsCompleted: ['cooperation-trap'] });
    const reset = op('33333333-3333-4333-8333-333333333333', { reset: true });
    // Device A resets; the request succeeds on the server but A never hears back.
    await a.applyOps([reset]);
    // Meanwhile device B completes a lesson.
    await a.apply({ lessonsCompleted: ['voting'] });
    // Device A, back online, resends the same operation.
    const r = await a.applyOps([reset]);
    assert.deepEqual(r.duplicates, [reset.id]);
    assert.deepEqual((await a.load()).completed, ['voting'], 'B’s completion survives the resend');
  });

  it('an operation and its id land together: a refused batch records nothing', async () => {
    const repo = progressRepository(rpc(THIRD));
    const bad = [op('44444444-4444-4444-8444-444444444444', { lessonsCompleted: ['cooperation-trap'] }), { id: 'not-a-uuid', changes: {} }];
    await assert.rejects(repo.applyOps(bad as never));
    assert.deepEqual((await repo.load()).completed, []);
    const ok = await repo.applyOps([bad[0] as { id: string; changes: ProgressChanges }]);
    assert.deepEqual(ok.applied, ['44444444-4444-4444-8444-444444444444'], 'the id was not consumed by the failed attempt');
  });

  it('is for signed-in users only, scoped to them, bounded, and the ids go with the account', async () => {
    assert.match((await failure(db, null, `select public.apply_progress_ops('[]'::jsonb)`)) ?? '', /permission denied/);
    // The same operation id from another account is that account's own, independent operation.
    const theirs = await progressRepository(rpc(OTHER)).applyOps([op('11111111-1111-4111-8111-111111111111', { goal: { value: 'uncertainty' } })]);
    assert.deepEqual(theirs.applied, ['11111111-1111-4111-8111-111111111111']);
    const seen = await as(db, USER, (tx) => tx.query<{ user_id: string }>('select user_id from public.progress_sync_ops'));
    assert.ok(seen.rows.length > 0 && seen.rows.every((r) => r.user_id === USER), 'a user sees only their own ids');
    const many = Array.from({ length: 101 }, (_, i) => op(`55555555-5555-4555-8555-${String(i).padStart(12, '0')}`, {}));
    await assert.rejects(progressRepository(rpc(USER)).applyOps(many), (e: { detail?: string }) => /too many/.test(e.detail ?? ''));
    const temp = '00000000-0000-4000-8000-0000000000d9';
    await addUser(db, temp);
    await progressRepository(rpc(temp)).applyOps([op('66666666-6666-4666-8666-666666666666', {})]);
    await db.query('delete from auth.users where id = $1', [temp]);
    assert.equal((await db.query<{ n: number }>('select count(*)::int as n from public.progress_sync_ops where user_id = $1', [temp])).rows[0].n, 0);
  });
});

describe('Progress outbox on the device', () => {
  it('offline work survives the app being killed and syncs exactly once when the network returns', async () => {
    const user = '00000000-0000-4000-8000-0000000000e1';
    await addUser(db, user);
    const repo = progressRepository(pgRpc(db, user));
    const path = `${process.env.TEMP ?? '/tmp'}/tactiqo-outbox-${Date.now()}.db`;
    let online = false;
    let sends = 0;
    const send = async (ops: readonly OutboxEntry[]) => {
      sends++;
      if (!online) throw offline();
      await repo.applyOps(ops);
    };

    // Session 1, offline: a lesson finished and a scenario played. Every change is saved before anything is sent.
    const one = await device(path);
    const o1 = outboxFor(one.store, send);
    await o1.restore(user);
    const l = learner();
    l.step(3);
    l.complete();
    l.scenario('l1.a.classic-dilemma', 'confess', ['silent'], 1000);
    for (const b of l.batches) await o1.enqueue(b);
    assert.equal(await o1.drain(), false, 'offline: kept for later');
    o1.stop();
    one.close(); // the process dies

    // Session 2, back online: the queue is restored from the database file and sent.
    online = true;
    const two = await device(path);
    const o2 = outboxFor(two.store, send);
    await o2.restore(user);
    assert.equal(o2.pending, l.batches.filter((b) => Object.keys(b).length).length);
    assert.ok(await o2.drain());
    assert.equal(o2.pending, 0);
    assert.deepEqual(await two.store.pending(user, 'progress'), []);
    assert.deepEqual(await repo.load(), sanitizeProgress(l.state));
    assert.ok(sends >= 2);
    two.close();
  });

  it('a timeout after the server applied the write is resent and recognised — no duplicates', async () => {
    const user = '00000000-0000-4000-8000-0000000000e2';
    await addUser(db, user);
    const repo = progressRepository(pgRpc(db, user));
    let loseAnswer = true;
    const { store, close } = await device();
    const o = outboxFor(store, async (ops) => {
      const r = await repo.applyOps(ops);
      if (loseAnswer) {
        loseAnswer = false;
        throw new Error('AbortError: timeout');
      }
      assert.deepEqual(r.applied, [], 'the second send applies nothing new');
    });
    await o.restore(user);
    await o.enqueue({ reset: true });
    await o.enqueue({ lessonsCompleted: ['cooperation-trap'] });
    assert.equal(await o.drain(), false);
    // Another device completes a lesson before this one retries.
    await repo.apply({ lessonsCompleted: ['voting'] });
    o.retryNow();
    assert.ok(await o.drain());
    assert.deepEqual((await repo.load()).completed, ['cooperation-trap', 'voting']);
    close();
  });

  it('a refused operation is set aside and the rest still sync', async () => {
    const { store, close } = await device();
    const sent: string[] = [];
    const o = outboxFor(store, async (ops) => {
      if (ops.some((x) => x.changes.goal)) throw Object.assign(new Error('bad'), { code: '22023' });
      sent.push(...ops.map((x) => x.id));
    });
    await o.restore(USER);
    await o.enqueue({ goal: { value: 'coordination' } });
    assert.ok(await o.drain());
    await o.enqueue({ lessonsCompleted: ['voting'] });
    assert.ok(await o.drain());
    assert.equal(sent.length, 1);
    assert.equal(await store.pendingCount(USER), 0);
    close();
  });

  it('never loads, sends or clears another account’s queued work', async () => {
    const { store, close } = await device();
    const sentBy: string[] = [];
    let as = USER;
    const o = outboxFor(store, async () => void sentBy.push(as));
    await o.restore(USER);
    await o.enqueue({ lessonsCompleted: ['voting'] });
    // The session ended by itself: the queue is kept for USER, not shown to anyone else.
    o.detach();
    as = OTHER;
    await o.restore(OTHER);
    assert.equal(o.pending, 0);
    assert.deepEqual(o.entries, []);
    await o.clear();
    assert.equal(await store.pendingCount(USER), 1, 'clearing OTHER leaves USER’s work');
    as = USER;
    await o.restore(USER);
    assert.equal(o.pending, 1);
    assert.ok(await o.drain());
    assert.deepEqual(sentBy, [USER]);
    close();
  });

  it('only one send runs at a time, however often it is kicked', async () => {
    const { store, close } = await device();
    let concurrent = 0;
    let max = 0;
    const o = outboxFor(store, async () => {
      concurrent++;
      max = Math.max(max, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
    });
    await o.restore(USER);
    for (let i = 0; i < 5; i++) await o.enqueue({ lessonsCompleted: [`l${i}` as never] });
    await Promise.all([o.drain(), o.drain(), o.drain()]);
    o.retryNow();
    await o.drain();
    assert.equal(max, 1);
    close();
  });

  it('holds sends while the server copy is read, then resumes', async () => {
    const { store, close } = await device();
    let sent = 0;
    const o = new Outbox({ sendOps: async () => void sent++, classify, store: localOutboxStore(async () => store), debounceMs: 0 });
    cleanup.push(() => o.stop());
    await o.restore(USER);
    o.pause();
    await o.enqueue({ lessonsCompleted: ['voting'] });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sent, 0);
    o.resume();
    await o.idle();
    assert.equal(sent, 1);
    close();
  });
});

describe('Practice games queue', () => {
  const game = (id: string) => ({ id, game: 'rps' as const, bot: 'mirror', difficulty: 'easy' as const, playerScore: 3, botScore: 2, outcome: 'win' as const });

  it('a game played offline is recorded once, after a restart, however often it is resent', async () => {
    const user = '00000000-0000-4000-8000-0000000000f1';
    await addUser(db, user);
    const repo = gamesRepository(pgRpc(db, user));
    const bots = await db.query<{ bots: string[] }>(`select bots from public.game_definitions where id = 'rps'`);
    const r = { ...game('77777777-7777-4777-8777-777777777777'), bot: bots.rows[0].bots[0] };
    let online = false;
    let loseAnswer = true;
    const { store, close } = await device();
    const make = () =>
      new OperationQueue<typeof r>({
        kind: 'practice_game',
        store: async () => store,
        classify: classifySyncError,
        retryDelay: () => 1e9,
        send: async (x) => {
          if (!online) throw offline();
          await repo.recordPractice(x);
          if (loseAnswer) {
            loseAnswer = false;
            throw offline();
          }
        },
      });
    const q1 = make();
    await q1.restore(user);
    await q1.enqueue(r.id, r, r.id);
    assert.equal(await q1.drain(), false);
    q1.stop();
    online = true;
    const q2 = make(); // after a restart
    await q2.restore(user);
    assert.equal(await q2.drain(), false, 'the answer was lost');
    assert.ok(await q2.drain());
    q2.stop();
    const rows = await db.query<{ n: number }>('select count(*)::int as n from public.game_practice_results where user_id = $1', [user]);
    assert.equal(rows.rows[0].n, 1);
    assert.equal(await store.pendingCount(user), 0);
    close();
  });

  it('a refused game is set aside; the queue carries on; duplicates count as delivered', async () => {
    const { store, close } = await device();
    const delivered: string[] = [];
    const q = new OperationQueue<{ id: string }>({
      kind: 'practice_game',
      store: async () => store,
      classify: classifySyncError,
      send: async (x) => {
        if (x.id === 'bad') throw Object.assign(new Error('games:invalid_request'), { code: 'P0001' });
        if (x.id === 'dup') throw Object.assign(new Error('duplicate key'), { code: '23505' });
      },
      onAcknowledged: (_o, ids) => void delivered.push(...ids),
    });
    await q.restore(USER);
    await q.enqueue('bad', { id: 'bad' });
    await q.enqueue('dup', { id: 'dup' });
    await q.enqueue('ok', { id: 'ok' });
    assert.ok(await q.drain());
    q.stop();
    assert.deepEqual(delivered.sort(), ['dup', 'ok']);
    assert.equal(await store.pendingCount(USER), 0);
    close();
  });
});

describe('Content on the device', () => {
  const seed = readSeed();
  const validate = (doc: unknown) => {
    const b = buildCatalog(doc);
    return b.ok ? b.catalog : null;
  };
  const kv = () => {
    const m = new Map<string, string>();
    return kvStore({ getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) });
  };

  it('a fresh install with no network starts from the bundled content', async () => {
    const loaded = await loadStartupDocument(kv(), { key: 'catalog', fetch: async () => Promise.reject(offline()), bundled: () => seed, validate });
    assert.equal(loaded.source, 'bundled');
    assert.equal(loaded.value.lessons.length, 22);
  });

  it('caches what the server sent and uses the cache from then on, even offline', async () => {
    const store = kv();
    const first = await loadStartupDocument(store, { key: 'catalog', fetch: async () => seed, bundled: () => null, validate });
    assert.equal(first.source, 'network');
    const second = await loadStartupDocument(store, { key: 'catalog', fetch: async () => Promise.reject(offline()), validate });
    assert.equal(second.source, 'cache');
    assert.equal(second.version, contentVersion(seed));
  });

  it('a cache that no longer validates is skipped, never fatal', async () => {
    const store = kv();
    await store.saveContent('catalog', { version: 'x', revision: 0, payload: { lessons: 'broken' }, fetchedAt: 0 });
    const loaded = await loadStartupDocument(store, { key: 'catalog', fetch: async () => Promise.reject(offline()), bundled: () => seed, validate });
    assert.equal(loaded.source, 'bundled');
  });

  it('with no copy anywhere, start-up fails with the network error (the "connect once" screen)', async () => {
    await assert.rejects(loadStartupDocument(kv(), { key: 'catalog', fetch: async () => Promise.reject(offline()), validate }), /Failed to fetch/);
  });

  it('a stalled server falls back within the budget', async () => {
    const t = Date.now();
    const loaded = await loadStartupDocument(kv(), { key: 'catalog', fetch: () => new Promise(() => undefined), bundled: () => seed, validate }, { networkBudgetMs: 30 });
    assert.equal(loaded.source, 'bundled');
    assert.ok(Date.now() - t < 2000);
  });

  it('refreshing stores only a new, valid document and never removes the cached one', async () => {
    const store = kv();
    const src = (doc: unknown) => ({ key: 'catalog', fetch: async () => doc, validate });
    assert.equal(await refreshDocument(store, src(seed)), 'updated');
    assert.equal(await refreshDocument(store, src(seed)), 'unchanged');
    assert.equal(await refreshDocument(store, src({ lessons: 'nope' })), 'invalid');
    assert.equal(await refreshDocument(store, { key: 'catalog', fetch: async () => Promise.reject(offline()), validate }), 'failed');
    assert.equal((await store.loadContent('catalog'))?.version, contentVersion(seed));
  });
});

describe('Retry policy and status', () => {
  it('classifies failures into retryable and final categories', () => {
    assert.deepEqual(classifySyncError(offline()), { category: 'network_unavailable', retry: true, message: classifySyncError(offline()).message });
    assert.equal(classifySyncError(new Error('AbortError: timeout')).category, 'timeout');
    assert.equal(classifySyncError({ status: 503, message: 'unavailable' }).category, 'server_temporary');
    assert.equal(classifySyncError({ code: 'PGRST301' }).category, 'auth_expired');
    assert.equal(classifySyncError({ code: '42501', message: 'permission denied' }).category, 'permission_denied');
    assert.equal(classifySyncError({ code: '22023', message: 'bad' }).category, 'validation_failed');
    assert.equal(classifySyncError({ code: '23505', message: 'dup' }).category, 'duplicate');
    assert.equal(classifySyncError({ code: 'P0001', message: 'games:invalid_request' }).retry, false);
  });

  it('backs off ≈2 s, 5 s, 15 s … up to 5 minutes, with jitter', () => {
    assert.equal(retryDelay(1, () => 0.5), 2000);
    assert.equal(retryDelay(2, () => 0.5), 5000);
    assert.equal(retryDelay(3, () => 0.5), 15000);
    assert.equal(retryDelay(99, () => 0.5), RETRY_STEPS_MS[RETRY_STEPS_MS.length - 1]);
    assert.equal(retryDelay(1, () => 0), 1600);
    assert.equal(retryDelay(1, () => 1), 2400);
  });

  it('the indicator only ever says Offline; syncing is silent', () => {
    const idle = { pending: 0, state: 'idle' as const };
    assert.equal(networkOf({ isConnected: true, isInternetReachable: false }), 'no_internet');
    assert.equal(networkOf(null), 'unknown');
    assert.ok(looksOffline('online', 'unreachable'));
    assert.equal(indicatorFor({ signedIn: true, network: 'online', backend: 'reachable', sync: idle }), null);
    assert.equal(indicatorFor({ signedIn: false, network: 'offline', backend: 'unknown', sync: idle })?.label, 'Offline');
    assert.equal(indicatorFor({ signedIn: true, network: 'offline', backend: 'unknown', sync: { pending: 2, state: 'retrying' } })?.label, 'Offline');
    assert.equal(indicatorFor({ signedIn: true, network: 'online', backend: 'unknown', sync: { pending: 2, state: 'saving' } }), null);
    assert.equal(indicatorFor({ signedIn: true, network: 'online', backend: 'unknown', sync: { pending: 2, state: 'retrying' } }), null);
    assert.equal(indicatorFor({ signedIn: true, network: 'online', backend: 'reachable', sync: { pending: 1, state: 'error' } }), null);
    assert.equal(indicatorFor({ signedIn: true, network: 'unknown', backend: 'unknown', sync: idle }), null);
  });
});
