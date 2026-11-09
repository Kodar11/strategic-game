import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { ArenaUploader, type ArenaSummary, parseSummary } from '../arena.ts';

const summary = (n: number, over: Partial<ArenaSummary> = {}): ArenaSummary => ({
  id: `3f8fad5b-d9cb-469f-a165-${n.toString().padStart(12, '0')}`,
  game: 'market',
  opponent: 'banker',
  level: 'hard',
  variant: 'standard',
  length: 'standard',
  outcome: 'win',
  playerScore: 1200,
  rivalScore: 1100,
  rounds: 8,
  playedAt: 1_780_000_000_000 + n,
  ...over,
});

function memory(initial: string | null = null) {
  let v = initial;
  return { load: async () => v, save: async (x: string | null) => void (v = x), get value() { return v; } };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('arena summary uploads', () => {
  it('sends a finished match, then forgets it once the server has it', async () => {
    const sent: ArenaSummary[][] = [];
    const storage = memory();
    const u = new ArenaUploader({ send: async (b) => void sent.push(b), storage, transient: () => true });
    await u.restore('alice');
    u.enqueue(summary(1));
    assert.ok(storage.value?.includes('alice'), 'saved, owner-scoped, before sending');
    assert.equal(await u.drain(), true);
    assert.equal(sent.flat().length, 1);
    assert.equal(u.pending, 0);
    assert.equal(storage.value, null);
  });

  it('keeps the batch through transient failures and retries it (the server dedupes ids)', async () => {
    let fail = 2;
    const sent: string[] = [];
    const u = new ArenaUploader({ send: async (b) => { if (fail-- > 0) throw new Error('offline'); sent.push(...b.map((x) => x.id)); }, storage: memory(), transient: () => true, retryBaseMs: 1, maxRetryMs: 2 });
    await u.restore('alice');
    u.enqueue(summary(1));
    u.enqueue(summary(1)); // a double record of the same match is ignored
    u.enqueue(summary(2));
    for (let i = 0; i < 40 && u.pending; i++) await tick();
    assert.equal(u.pending, 0);
    assert.deepEqual(sent, [summary(1).id, summary(2).id]);
  });

  it('drops a batch the server refuses outright, so it can’t block later ones', async () => {
    const sent: string[] = [];
    const u = new ArenaUploader({ send: async (b) => { if (b.some((x) => x.id === summary(1).id)) throw new Error('arena:invalid_request'); sent.push(...b.map((x) => x.id)); }, storage: memory(), transient: () => false, batchSize: 1 });
    await u.restore('alice');
    u.enqueue(summary(1));
    u.enqueue(summary(2));
    await u.drain();
    assert.deepEqual(sent, [summary(2).id]);
    assert.equal(u.pending, 0);
  });

  it('a queue saved for another user is never sent', async () => {
    const storage = memory(JSON.stringify({ owner: 'alice', queue: [summary(1)] }));
    const sent: ArenaSummary[] = [];
    const u = new ArenaUploader({ send: async (b) => void sent.push(...b), storage, transient: () => true });
    await u.restore('bob');
    await u.drain();
    assert.equal(sent.length, 0);
    assert.equal(storage.value, null, 'and it is discarded');
  });

  it('a saved queue for the same user survives a restart and is sent', async () => {
    const storage = memory(JSON.stringify({ owner: 'alice', queue: [summary(1), { id: 'junk' }] }));
    const sent: ArenaSummary[] = [];
    const u = new ArenaUploader({ send: async (b) => void sent.push(...b), storage, transient: () => true });
    await u.restore('alice');
    await u.drain();
    assert.deepEqual(sent.map((s) => s.id), [summary(1).id], 'malformed entries are dropped');
  });

  it('stopped (account being deleted): nothing new is queued or sent; clear forgets everything', async () => {
    const sent: ArenaSummary[] = [];
    const storage = memory();
    const u = new ArenaUploader({ send: async (b) => void sent.push(...b), storage, transient: () => true });
    await u.restore('alice');
    u.stop();
    u.enqueue(summary(1));
    await tick();
    assert.equal(u.pending, 0);
    await u.clear();
    u.enqueue(summary(2));
    assert.equal(u.pending, 0, 'no owner until the next restore');
    assert.equal(storage.value, null);
    assert.equal(sent.length, 0);
  });

  it('a response that arrives after the account changed doesn’t touch the new queue', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const storage = memory();
    const u = new ArenaUploader({ send: async () => gate, storage, transient: () => true });
    await u.restore('alice');
    u.enqueue(summary(1));
    const pending = u.drain();
    await tick();
    const cleared = u.clear();
    release();
    await pending;
    await cleared;
    await u.restore('bob');
    assert.equal(u.pending, 0);
    assert.equal(storage.value, null);
  });

  it('validates summaries: no stray fields survive, bad ones are refused', () => {
    assert.deepEqual(parseSummary({ ...summary(1), seed: 42, rounds: 8.4 }), { ...summary(1), rounds: 8 });
    assert.equal(parseSummary({ ...summary(1), game: 'chess' }), null);
    assert.equal(parseSummary({ ...summary(1), opponent: 'Robert); drop' }), null);
    assert.equal(parseSummary({ ...summary(1), id: 'x' }), null);
  });
});

describe('device data inventory', () => {
  const root = join(import.meta.dirname, '..', '..', '..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return f === '__tests__' || f === 'node_modules' ? [] : files(p);
      return /\.(ts|tsx)$/.test(f) ? [p] : [];
    });

  it('every storage key in the app is listed in device-data.ts, with what deletion does to it', () => {
    const inventory = readFileSync(join(root, 'src', 'data', 'device-data.ts'), 'utf8');
    const keys = new Set<string>();
    for (const f of [...files(join(root, 'src')), ...files(join(root, 'app'))]) {
      for (const m of readFileSync(f, 'utf8').matchAll(/['"`]((?:tactiqo|strategic-game)\/[a-z0-9/-]+)['"`]/g)) keys.add(m[1]);
    }
    assert.ok(keys.size >= 8, [...keys].join(', '));
    const constants: Record<string, string> = { 'tactiqo/arena-uploads/v1': 'ARENA_UPLOADS_KEY', 'tactiqo/arena-records/v1': 'ARENA_RECORDS_KEY', 'strategic-game/games-seen': 'GAMES_SEEN_KEY', 'tactiqo/tournament/v1': 'TOURNAMENT_KEY', 'tactiqo/reminders/v1': 'REMINDERS_KEY', 'tactiqo/style/v1': 'STYLE_KEY', 'tactiqo/daily-mix/v1': 'DAILY_MIX_KEY', 'tactiqo/gauntlet/v1': 'GAUNTLET_KEY', 'tactiqo/resume/v1': 'RESUME_KEY', 'tactiqo/mastery/v1': 'MASTERY_KEY' };
    for (const k of keys) assert.ok(inventory.includes(`'${k}'`) || (constants[k] && inventory.includes(constants[k])), `${k} is not in DEVICE_DATA`);
  });
});
