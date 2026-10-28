import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { addUser, createDatabase, pgRpc } from '../../../supabase/__tests__/pg.ts';
import { chooseAnswer, emptyPrediction, rateConfidence } from '../../components/lesson/prediction-state.ts';
import { installSeedCatalog } from '../../content/seed.ts';
import { submitChallenge } from '../../features/challenges/progress.ts';
import { mergeAttempts } from '../../features/learning/records.ts';
import { applyScenarioInput, lockScenarioPrediction, restartScenario, setScenarioPrediction } from '../../features/scenarios/runtime.ts';
import { getScenario } from '../../features/scenarios/index.ts';
import { EMPTY_PROGRESS, type ProgressData, sanitizeProgress } from '../../store/progress-state.ts';
import { type ProgressChanges, diffProgress, isEmpty, mergeChanges } from '../changes.ts';
import { DataError, toDataError } from '../errors.ts';
import { Outbox, type OutboxStatus } from '../outbox.ts';
import { contentRepository, progressRepository } from '../repositories.ts';

/**
 * The persistence path end to end: the same pure state transitions the store runs, diffed into change batches, sent
 * through the outbox and the repositories to the real SQL (PGlite), and loaded back as a fresh start-up would.
 */

installSeedCatalog();

const USER = '00000000-0000-4000-8000-0000000000c1';
const OTHER = '00000000-0000-4000-8000-0000000000c2';
let db: PGlite;
before(async () => {
  db = await createDatabase();
  await addUser(db, USER);
  await addUser(db, OTHER);
});
after(async () => {
  await db.close();
});

const outboxes: Outbox[] = [];
afterEach(() => outboxes.splice(0).forEach((o) => o.stop()));
const track = (o: Outbox) => (outboxes.push(o), o);

const memoryStorage = () => {
  let value: string | null = null;
  return { load: async () => value, save: async (v: string | null) => void (value = v), peek: () => value };
};

const classify = (e: unknown) => {
  const d = toDataError(e);
  return { kind: d.transient ? ('transient' as const) : ('permanent' as const), message: d.message };
};

/** A learner session: the store's transitions, each one diffed and queued exactly as src/data/session.ts does. */
function session(outbox: Outbox, start: ProgressData = EMPTY_PROGRESS) {
  let state = start;
  const commit = (next: ProgressData, reset = false) => {
    outbox.enqueue(diffProgress(state, next, reset));
    state = next;
  };
  return {
    get state() {
      return state;
    },
    playScenario(id: string, answer: string, inputs: (string | number)[], lockedAt: number) {
      // "Play again" starts a fresh run, as the screen does.
      if (state.scenarioRuns[id]) commit({ ...state, scenarioRuns: restartScenario(state, id, 99)! });
      let runs = setScenarioPrediction(state, id, chooseAnswer(emptyPrediction<string>(), answer))!;
      commit({ ...state, scenarioRuns: runs });
      runs = setScenarioPrediction(state, id, rateConfidence(state.scenarioRuns[id]!.prediction, 3))!;
      commit({ ...state, scenarioRuns: runs });
      commit({ ...state, scenarioRuns: lockScenarioPrediction(state, id, lockedAt)! });
      for (const x of inputs) commit({ ...state, ...applyScenarioInput(state, id, x)! });
    },
    answerChallenge(id: string, answer: string, lockedAt: number) {
      commit({ ...state, challengeDrafts: { ...state.challengeDrafts, [id]: rateConfidence(chooseAnswer(emptyPrediction<string>(), answer), 5) } });
      const submitted = submitChallenge(state, id, lockedAt);
      assert.ok(submitted, `${id}: ${answer} could not be submitted`);
      commit({ ...state, ...submitted });
    },
    saveRuntime(lesson: 'cooperation-trap', step: number) {
      commit({ ...state, runtime: { ...state.runtime, [lesson]: { step, total: 15, data: { step }, updatedAt: step } } });
    },
    complete(lesson: 'cooperation-trap') {
      const runtime = { ...state.runtime };
      delete runtime[lesson];
      commit({ ...state, completed: [...state.completed, lesson], runtime });
    },
    setGoal(goal: ProgressData['goal']) {
      commit({ ...state, goal });
    },
    reset() {
      commit({ ...EMPTY_PROGRESS, goal: state.goal }, true);
    },
  };
}

describe('Change batches', () => {
  it('describe exactly what changed', () => {
    const s = session(track(new Outbox({ send: async () => undefined, classify, storage: memoryStorage(), debounceMs: 1e9 })));
    const before = s.state;
    s.playScenario('l1.a.classic-dilemma', 'confess', ['silent'], 1000);
    const c = diffProgress(before, s.state);
    assert.deepEqual(Object.keys(c).sort(), ['attempts', 'scenarioRuns', 'scenariosDone']);
    assert.equal(c.attempts![0].id, 'l1.a.classic-dilemma@1000');
    assert.deepEqual(c.scenariosDone, ['l1.a.classic-dilemma']);
    assert.ok(isEmpty(diffProgress(s.state, s.state)));
  });

  it('merge to the same result as applying them one by one', async () => {
    const batches: ProgressChanges[] = [];
    const s = session(track(new Outbox({ send: async () => undefined, classify, storage: memoryStorage(), debounceMs: 1e9 })));
    const record = (fn: () => void) => {
      const before = s.state;
      fn();
      batches.push(diffProgress(before, s.state));
    };
    record(() => s.saveRuntime('cooperation-trap', 2));
    record(() => s.playScenario('l1.b.shared-project', '0', [0], 2000));
    record(() => s.saveRuntime('cooperation-trap', 5));
    record(() => s.complete('cooperation-trap'));
    record(() => s.setGoal('coordination'));

    const one = progressRepository(pgRpc(db, USER));
    const two = progressRepository(pgRpc(db, OTHER));
    for (const b of batches) await one.apply(b);
    await two.apply(batches.reduce(mergeChanges));
    assert.deepEqual(await two.load(), await one.load());
    await one.apply({ reset: true, goal: { value: null } });
    await two.apply({ reset: true, goal: { value: null } });
  });

  it('let a reset discard what came before it', () => {
    const m = mergeChanges({ lessonsCompleted: ['voting'], attempts: [] }, { reset: true, lessonsCompleted: ['auctions'] });
    assert.deepEqual(m, { reset: true, lessonsCompleted: ['auctions'] });
    const kept = mergeChanges({ reset: true }, { lessonsCompleted: ['auctions'] });
    assert.deepEqual(kept, { reset: true, lessonsCompleted: ['auctions'] });
  });

  it('let a later runtime delete cancel an earlier upsert, and the reverse', () => {
    const rt = { step: 1, total: 2, data: null, updatedAt: 1 };
    assert.deepEqual(mergeChanges({ runtimeUpsert: [{ lesson: 'voting', runtime: rt }] }, { runtimeDelete: ['voting'] }), { runtimeDelete: ['voting'] });
    assert.deepEqual(mergeChanges({ runtimeDelete: ['voting'] }, { runtimeUpsert: [{ lesson: 'voting', runtime: rt }] }), { runtimeUpsert: [{ lesson: 'voting', runtime: rt }] });
  });
});

describe('Saving and loading progress', () => {
  it('round-trips a learning session: what a restart loads equals what the learner left', async () => {
    const repo = progressRepository(pgRpc(db, USER));
    const outbox = track(new Outbox({ send: (c) => repo.apply(c).then(() => undefined), classify, storage: memoryStorage(), debounceMs: 0 }));
    await outbox.restore(USER);
    const s = session(outbox);
    s.setGoal('uncertainty');
    s.saveRuntime('cooperation-trap', 3);
    s.playScenario('l1.a.classic-dilemma', 'confess', ['confess'], 1000);
    s.playScenario('l1.b.shared-project', '10', [7], 1100);
    s.answerChallenge('l1.c1.discount-war', 'both-discount', 1200);
    s.saveRuntime('cooperation-trap', 9);
    s.complete('cooperation-trap');
    // A replay is a new attempt; the first stays.
    s.playScenario('l1.a.classic-dilemma', 'silent', [], 1300);
    assert.ok(await outbox.drain());

    const loaded = await repo.load();
    assert.deepEqual(loaded, sanitizeProgress(s.state));
    assert.deepEqual(loaded.completed, ['cooperation-trap']);
    assert.deepEqual(loaded.runtime, {});
    assert.equal(loaded.learning.length, 3);
    assert.deepEqual(
      loaded.learning.map((a) => [a.prediction, a.attempt]),
      [
        ['l1.a.classic-dilemma', 1],
        ['l1.b.shared-project', 1],
        ['l1.c1.discount-war', 1],
      ],
    );
    // The replayed scenario's run is in progress (locked, not finished) and replays through the engine.
    assert.equal(loaded.scenarioRuns['l1.a.classic-dilemma']!.prediction.answer, 'silent');
    assert.ok(getScenario('l1.a.classic-dilemma'));
  });

  it('records the replay as attempt 2 when it finishes, keeping attempt 1', async () => {
    const repo = progressRepository(pgRpc(db, USER));
    const outbox = track(new Outbox({ send: (c) => repo.apply(c).then(() => undefined), classify, storage: memoryStorage(), debounceMs: 0 }));
    await outbox.restore(USER);
    const s = session(outbox, await repo.load());
    const state = s.state;
    const next = applyScenarioInput(state, 'l1.a.classic-dilemma', 'silent')!;
    outbox.enqueue(diffProgress(state, { ...state, ...next }));
    assert.ok(await outbox.drain());
    const learning = (await repo.load()).learning.filter((a) => a.prediction === 'l1.a.classic-dilemma');
    assert.deepEqual(
      learning.map((a) => [a.attempt, a.answer]),
      [
        [1, 'confess'],
        [2, 'silent'],
      ],
    );
    assert.deepEqual(mergeAttempts(learning, learning), learning, 'merging again adds nothing');
  });

  it('a reset clears the learner’s progress on the server, keeping the goal', async () => {
    const repo = progressRepository(pgRpc(db, USER));
    const outbox = track(new Outbox({ send: (c) => repo.apply(c).then(() => undefined), classify, storage: memoryStorage(), debounceMs: 0 }));
    await outbox.restore(USER);
    const s = session(outbox, await repo.load());
    s.reset();
    assert.ok(await outbox.drain());
    assert.deepEqual(await repo.load(), { ...EMPTY_PROGRESS, goal: 'uncertainty' });
  });

  it('loads the content catalog through the content repository', async () => {
    const c = await contentRepository(pgRpc(db, null)).fetchCatalog();
    assert.equal(c.scenarios.length, 66);
    assert.equal(c.lessons.length, 22);
  });
});

describe('Outbox', () => {
  const flaky = (failures: number, error: unknown = new TypeError('Failed to fetch')) => {
    const sent: ProgressChanges[] = [];
    let left = failures;
    return {
      sent,
      send: async (c: ProgressChanges) => {
        if (left-- > 0) throw error;
        sent.push(c);
      },
    };
  };

  it('sends queued changes in order, merged into one request', async () => {
    const t = flaky(0);
    const o = track(new Outbox({ send: t.send, classify, storage: memoryStorage(), debounceMs: 1e9 }));
    await o.restore('u');
    o.enqueue({ lessonsCompleted: ['voting'] });
    o.enqueue({ lessonsCompleted: ['auctions'] });
    assert.ok(await o.drain());
    assert.deepEqual(t.sent, [{ lessonsCompleted: ['voting', 'auctions'] }]);
    assert.equal(o.pending, 0);
  });

  it('retries a transient failure and keeps the changes until they are accepted', async () => {
    const t = flaky(2);
    const statuses: OutboxStatus['state'][] = [];
    const o = track(new Outbox({ send: t.send, classify, storage: memoryStorage(), debounceMs: 0, retryBaseMs: 5, onStatus: (s) => statuses.push(s.state) }));
    await o.restore('u');
    o.enqueue({ scenariosDone: ['l1.a.classic-dilemma'] });
    await o.idle();
    assert.deepEqual(t.sent, [{ scenariosDone: ['l1.a.classic-dilemma'] }]);
    assert.ok(statuses.includes('retrying'));
    assert.equal(statuses.at(-1), 'idle');
  });

  it('drops a batch the database refuses, reports it, and carries on with the next', async () => {
    const t = flaky(1, { code: '23514', message: 'violates check constraint' });
    let last: OutboxStatus | null = null;
    const o = track(new Outbox({ send: t.send, classify, storage: memoryStorage(), debounceMs: 1e9, onStatus: (s) => (last = s) }));
    await o.restore('u');
    o.enqueue({ lessonsCompleted: ['voting'] });
    assert.ok(await o.drain());
    assert.equal(last!.state, 'error');
    assert.match(last!.message!, /refused a change/);
    o.enqueue({ lessonsCompleted: ['auctions'] });
    assert.ok(await o.drain());
    assert.deepEqual(t.sent, [{ lessonsCompleted: ['auctions'] }]);
    assert.equal(last!.state, 'idle');
  });

  it('survives a restart, but only for the same learner', async () => {
    const storage = memoryStorage();
    const offline = track(new Outbox({ send: flaky(Infinity).send, classify, storage, debounceMs: 1e9 }));
    await offline.restore('u1');
    offline.enqueue({ lessonsCompleted: ['voting'] });
    assert.equal(await offline.drain(), false);
    assert.ok(storage.peek());

    const t = flaky(0);
    const again = track(new Outbox({ send: t.send, classify, storage, debounceMs: 1e9 }));
    await again.restore('u1');
    assert.equal(again.pending, 1);
    assert.ok(await again.drain());
    assert.deepEqual(t.sent, [{ lessonsCompleted: ['voting'] }]);
    assert.equal(storage.peek(), null);

    const stranger = track(new Outbox({ send: flaky(0).send, classify, storage: { ...storage, load: async () => JSON.stringify({ owner: 'u1', queue: [{ reset: true }] }) }, debounceMs: 1e9 }));
    await stranger.restore('u2');
    assert.equal(stranger.pending, 0);
  });

  it('clear drops pending changes and the saved copy, and sends nothing (an account was deleted)', async () => {
    const storage = memoryStorage();
    const t = flaky(Infinity);
    const statuses: OutboxStatus[] = [];
    const o = track(new Outbox({ send: t.send, classify, storage, debounceMs: 1e9, onStatus: (s) => statuses.push(s) }));
    await o.restore('u1');
    o.enqueue({ lessonsCompleted: ['voting'] });
    assert.equal(await o.drain(), false);
    assert.ok(storage.peek());
    await o.clear();
    assert.equal(o.pending, 0);
    assert.equal(storage.peek(), null);
    assert.deepEqual(statuses.at(-1), { pending: 0, state: 'idle', message: null });
    assert.ok(await o.drain());
    assert.deepEqual(t.sent, []);
  });
});

describe('Data errors', () => {
  it('classify failures into retryable and final, with readable messages', () => {
    assert.equal(toDataError(new TypeError('Failed to fetch')).kind, 'network');
    assert.equal(toDataError({ code: 'PGRST301', message: 'JWT expired' }).kind, 'auth');
    assert.equal(toDataError({ code: '42501', message: 'permission denied' }).kind, 'refused');
    assert.equal(toDataError({ code: '', status: 503 }).kind, 'server');
    const e = toDataError({ code: '23505', message: 'duplicate key value violates unique constraint "x"' });
    assert.ok(!e.transient);
    assert.ok(!e.message.includes('duplicate key'), 'database details stay out of the message');
    assert.ok(new DataError('network').transient);
  });
});
