import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { auctionPrompt, posteriorMean } from '../../../arena/auction.ts';
import { ARENA_IDS, type AnyArenaEngine } from '../../../arena/core.ts';
import { ARENA_ENGINES } from '../../../arena/registry.ts';
import { signalPrompt } from '../../../arena/signal.ts';
import { ultPrompt } from '../../../arena/ultimatum-game.ts';
import { restorePractice } from '../practice.ts';
import { replayArena } from '../replay.ts';
import { RESUME_TTL_MS, type SavedMatch, cleanParams, contextOf, isFresh, parseSaved, sameParams, slotOf } from '../rules.ts';

/** A legal move for any arena game (the same simple policy as src/arena/__tests__/arena.test.ts). */
function anyMove(id: string, s: any, k: number): unknown {
  switch (id) {
    case 'cooperation':
      return { move: k % 3 === 0 ? 'D' : 'C', round: s.rounds.length };
    case 'ultimatum-game': {
      const p = ultPrompt(s)!;
      return p.terms.proposer === 'player' ? Math.floor(p.terms.pool / 2) : k % 2 ? 'accept' : 'reject';
    }
    case 'auction': {
      const p = auctionPrompt(s)!;
      return Math.min(p.cash, Math.max(0, Math.round(posteriorMean(p.lot, p.estimate) * 0.8)));
    }
    case 'market':
      return 8 + (k % 6);
    case 'signal': {
      const p = signalPrompt(s)!;
      if (p.role === 'send') return p.strong ? 'stake' : k % 2 ? 'pitch' : 'warn';
      if (p.test === null && k % 3 === 0) return 'investigate';
      return p.signal === 'warn' ? 'pass' : 'invest';
    }
  }
  const ms = ARENA_ENGINES[id as keyof typeof ARENA_ENGINES].moves?.(s);
  if (ms?.length) return ms[k % ms.length];
  throw new Error(id);
}

const saved = (over: Partial<SavedMatch> = {}): SavedMatch => ({
  system: 'arena',
  game: 'market',
  context: 'practice',
  params: { game: 'market', level: 'normal' },
  seed: 7,
  inputs: [10],
  guess: null,
  played: 1,
  total: 8,
  savedAt: 1_000,
  build: '1.0.0',
  ...over,
});

describe('saved-match rules', () => {
  it('one slot per system, game and context; the context comes from the tournament or gauntlet param', () => {
    assert.equal(slotOf('arena', 'market', 'practice'), 'arena:market:practice');
    assert.equal(contextOf({}), 'practice');
    assert.equal(contextOf({ t: 'm1' }), 'tournament');
    assert.equal(contextOf({ g: 'x' }), 'gauntlet');
  });

  it('params compare equal regardless of order and empty values', () => {
    const a = cleanParams({ level: 'hard', game: 'mole', t: undefined, g: '' });
    assert.deepEqual(Object.keys(a), ['game', 'level']);
    assert.ok(sameParams(a, cleanParams({ game: 'mole', level: 'hard' })));
    assert.ok(!sameParams(a, cleanParams({ game: 'mole', level: 'easy' })));
    assert.ok(!sameParams(a, cleanParams({ game: 'mole', level: 'hard', t: 'm1' })));
  });

  it('a saved match expires after a day, on another app version, and once every round is played', () => {
    const m = saved();
    assert.ok(isFresh(m, 1_000 + RESUME_TTL_MS - 1, '1.0.0'));
    assert.ok(!isFresh(m, 1_000 + RESUME_TTL_MS, '1.0.0'));
    assert.ok(!isFresh(m, 500, '1.0.0'), 'a clock that went backwards');
    assert.ok(!isFresh(m, 2_000, '1.1.0'));
    assert.ok(!isFresh(saved({ played: 8 }), 2_000, '1.0.0'));
  });

  it('reading the stored blob keeps only valid, fresh entries under their own slot', () => {
    const good = saved();
    const raw = JSON.stringify({
      'arena:market:practice': good,
      'arena:mole:practice': saved({ game: 'market' }),
      'arena:bluff:practice': { ...saved({ game: 'bluff' }), seed: 'x' },
      'arena:auction:practice': saved({ game: 'auction', build: 'old' }),
    });
    assert.deepEqual(parseSaved(raw, 2_000, '1.0.0'), { 'arena:market:practice': good });
    assert.deepEqual(parseSaved('not json', 2_000, '1.0.0'), {});
    assert.deepEqual(parseSaved(null, 2_000, '1.0.0'), {});
  });
});

describe('replaying a saved Arena match', () => {
  for (const id of ARENA_IDS) {
    const engine: AnyArenaEngine = ARENA_ENGINES[id];
    it(`${id}: the setup plus the saved actions rebuild the exact state`, () => {
      let checked = 0;
      for (const seed of [3, 41, 977, 1234, 50_001]) {
        const setup = { persona: engine.opponents[seed % engine.opponents.length], level: 'hard' as const, length: 'standard' as const, variant: engine.variants[0], seed };
        let s = engine.create(setup);
        const actions: unknown[] = [];
        // Stop early, as a player leaving mid-match would (some games can end after a few turns).
        for (let k = 0; !engine.isOver(s) && (engine.played(s) < 1 || actions.length < 2) && k < 200; k++) {
          const a = anyMove(id, s, k);
          s = engine.apply(s, a);
          actions.push(a);
        }
        if (engine.isOver(s) || actions.length === 0) continue;
        const back = replayArena<unknown, unknown>(engine, setup, JSON.parse(JSON.stringify(actions)));
        assert.ok(back, `${id} seed ${seed}: replay refused`);
        assert.deepEqual(JSON.parse(JSON.stringify(back.state)), JSON.parse(JSON.stringify(s)));
        checked++;
      }
      assert.ok(checked > 0, `${id}: no match was still running`);
    });
  }

  it('refuses inputs that no longer fit: not a list, empty, illegal, or finishing the match', () => {
    const engine = ARENA_ENGINES.market;
    const setup = { persona: engine.opponents[0], level: 'normal' as const, length: 'short' as const, variant: engine.variants[0], seed: 5 };
    assert.equal(replayArena(engine, setup, 'x'), null);
    assert.equal(replayArena(engine, setup, []), null);
    assert.equal(replayArena(engine, setup, [999]), null);
    assert.equal(replayArena(engine, setup, Array(engine.rounds('short')).fill(10)), null);
    assert.ok(replayArena(engine, setup, [10, 11]));
  });
});

describe('restoring a classic practice match', () => {
  const bots = ['repeater', 'counter'];
  const snap = { seed: 9, bot: 'counter', mode: 'mystery', rounds: [{ p: 'rock' }], read: null, revealed: false };
  it('keeps a snapshot that fits the game and the chosen opponent', () => {
    assert.deepEqual(restorePractice(bots, 12, null, snap), snap);
    assert.ok(restorePractice(bots, 12, 'counter', { ...snap, mode: 'chosen' }));
    assert.ok(restorePractice(bots, 12, null, { ...snap, read: { guess: 'counter', round: 4 } }));
  });
  it('drops one that does not', () => {
    assert.equal(restorePractice(bots, 12, null, { ...snap, bot: 'gone' }), null);
    assert.equal(restorePractice(bots, 12, 'repeater', { ...snap, mode: 'chosen' }), null);
    assert.equal(restorePractice(bots, 12, 'counter', snap), null, 'a mystery save does not continue a chosen match');
    assert.equal(restorePractice(bots, 12, null, { ...snap, rounds: [] }), null);
    assert.equal(restorePractice(bots, 1, null, snap), null, 'already complete');
    assert.equal(restorePractice(bots, 12, null, { ...snap, revealed: true }), null);
    assert.equal(restorePractice(bots, 12, null, { ...snap, read: { round: 2 } }), null);
    assert.equal(restorePractice(bots, 12, null, null), null);
  });
});
