import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installSeedCatalog } from '../../content/seed.ts';
import { EMPTY_PROGRESS, type ProgressData } from '../../store/progress-state.ts';
import { type ProgressChanges, diffProgress } from '../changes.ts';
import { DEVICE_OWNER_KEY, ownsDeviceData, reconcileOwner } from '../device-owner.ts';
import { GUEST_PROGRESS_KEY, guestProgressStore } from '../guest-progress.ts';
import { Outbox } from '../outbox.ts';

/**
 * The device side of signing in, signing out, switching accounts and deleting: guest progress on the device, the
 * owner marker that keeps one person's device data from another, and the outbox never letting one account's write
 * touch the next account's queue.
 */

installSeedCatalog();

const ALICE = '00000000-0000-4000-8000-0000000000a1';
const BOB = '00000000-0000-4000-8000-0000000000b2';

function kv() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const attempt = (lockedAt: number) => ({
  id: `cooperation-trap/predict@${lockedAt}`,
  schemaVersion: 2,
  kind: 'prediction',
  lesson: 'cooperation-trap',
  prediction: 'predict',
  skill: 'incentives',
  basis: 'calculable',
  answer: 'confess',
  confidence: 4,
  evaluation: 'correct',
  outcome: 'x',
  lockedAt,
  attempt: 1,
  lessonCompleted: false,
  contentVersion: 1,
});

describe('guest progress on the device', () => {
  it('saves after a pause, flushes on demand and clears', async () => {
    const s = kv();
    const g = guestProgressStore(s, 20);
    const data: ProgressData = { ...EMPTY_PROGRESS, completed: ['cooperation-trap'] } as ProgressData;
    g.save(data);
    assert.equal(s.map.get(GUEST_PROGRESS_KEY), undefined, 'debounced');
    await sleep(40);
    assert.deepEqual(JSON.parse(s.map.get(GUEST_PROGRESS_KEY)!).completed, ['cooperation-trap']);
    g.save({ ...data, goal: null });
    await g.flush();
    assert.ok(s.map.has(GUEST_PROGRESS_KEY));
    assert.deepEqual((await g.load()) as { completed: string[] }, JSON.parse(s.map.get(GUEST_PROGRESS_KEY)!));
    await g.clear();
    assert.equal(s.map.has(GUEST_PROGRESS_KEY), false);
    assert.equal(await g.load(), null);
  });

  it('a save still waiting is dropped by clear (nothing comes back after sign-out)', async () => {
    const s = kv();
    const g = guestProgressStore(s, 20);
    g.save({ ...EMPTY_PROGRESS } as ProgressData);
    await g.clear();
    await sleep(40);
    assert.equal(s.map.has(GUEST_PROGRESS_KEY), false);
  });

  it('broken saved data reads as none', async () => {
    const s = kv();
    s.map.set(GUEST_PROGRESS_KEY, '{not json');
    assert.equal(await guestProgressStore(s).load(), null);
  });

  it('handing guest progress to an account is a plain diff from nothing', () => {
    const guest = { ...EMPTY_PROGRESS, completed: ['cooperation-trap'], learning: [attempt(1)] } as unknown as ProgressData;
    const c: ProgressChanges = diffProgress(EMPTY_PROGRESS, guest);
    assert.deepEqual(c.lessonsCompleted, ['cooperation-trap']);
    assert.equal(c.attempts?.length, 1);
    assert.equal(c.reset, undefined, 'never a reset: a returning account keeps what it has');
    assert.equal(c.goal, undefined, 'no goal chosen as a guest: the account’s goal is untouched');
  });
});

describe('device owner marker', () => {
  it('keeps the data for the same owner and clears it for anyone else', async () => {
    const s = kv();
    let clears = 0;
    const clear = async () => void clears++;

    assert.deepEqual(await reconcileOwner(s, 'guest', clear), { cleared: true }, 'no marker: unknown data is cleared');
    assert.equal(s.map.get(DEVICE_OWNER_KEY), 'guest');
    assert.deepEqual(await reconcileOwner(s, 'guest', clear), { cleared: false });

    s.map.set(DEVICE_OWNER_KEY, `user:${ALICE}`);
    assert.deepEqual(await reconcileOwner(s, { user: ALICE }, clear), { cleared: false });
    // Alice's session was revoked while the app was closed: the app starts as a guest and Alice's data goes.
    assert.deepEqual(await reconcileOwner(s, 'guest', clear), { cleared: true });
    s.map.set(DEVICE_OWNER_KEY, `user:${ALICE}`);
    assert.deepEqual(await reconcileOwner(s, { user: BOB }, clear), { cleared: true });
    assert.equal(s.map.get(DEVICE_OWNER_KEY), `user:${BOB}`);
    assert.equal(clears, 3);
  });

  it('an interrupted clear leaves the old marker, so the next start clears again', async () => {
    const s = kv();
    s.map.set(DEVICE_OWNER_KEY, `user:${ALICE}`);
    await assert.rejects(reconcileOwner(s, 'guest', async () => Promise.reject(new Error('storage failed'))));
    assert.equal(s.map.get(DEVICE_OWNER_KEY), `user:${ALICE}`);
    assert.equal(ownsDeviceData(s.map.get(DEVICE_OWNER_KEY)!, 'guest'), false);
  });
});

describe('outbox across accounts', () => {
  const classify = () => ({ kind: 'transient' as const, message: 'offline' });
  const storage = () => {
    let value: string | null = null;
    return { load: async () => value, save: async (v: string | null) => void (value = v), peek: () => value };
  };
  const change = (id: string): ProgressChanges => ({ lessonsCompleted: [id as never] });

  it('a send still in flight for the previous account never touches the next account’s queue', async () => {
    const st = storage();
    let release!: () => void;
    const sent: { owner: string; changes: ProgressChanges }[] = [];
    let owner = ALICE;
    const o = new Outbox({
      send: async (c) => {
        const who = owner;
        if (who === ALICE) await new Promise<void>((r) => (release = r));
        sent.push({ owner: who, changes: c });
      },
      classify,
      storage: st,
      debounceMs: 0,
    });
    await o.restore(ALICE);
    await o.enqueue(change('alice-lesson'));
    const draining = o.drain();
    await sleep(5);
    // Alice signs out while her write is in flight; Bob signs in and has his own change queued.
    await o.clear();
    owner = BOB;
    await o.restore(BOB);
    await o.enqueue(change('bob-lesson'));
    o.stop();
    release();
    await draining;
    assert.equal(o.pending >= 1 || sent.some((s) => s.owner === BOB), true);
    assert.ok(st.peek() === null || JSON.parse(st.peek()!).owner === BOB, 'the saved queue is Bob’s or empty');
    await o.drain();
    assert.equal(o.pending, 0);
    const bob = sent.filter((s) => s.owner === BOB).flatMap((s) => s.changes.lessonsCompleted ?? []);
    assert.deepEqual(bob, ['bob-lesson'], 'Bob’s change was sent, as Bob, and not lost to Alice’s late reply');
  });

  it('a saved queue is restored only for its owner', async () => {
    const st = storage();
    const o = new Outbox({ send: async () => Promise.reject(new Error('offline')), classify, storage: st, debounceMs: 10_000 });
    await o.restore(ALICE);
    await o.enqueue(change('alice-lesson'));
    o.stop();
    await o.restore(BOB);
    assert.equal(o.pending, 0);
    await o.clear();
    assert.equal(st.peek(), null);
  });
});
