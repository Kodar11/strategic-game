/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ARENA_IDS } from '../../arena/core.ts';
import { ARENA_ENGINES } from '../../arena/registry.ts';
import { GAME_IDS } from '../../games/core.ts';
import { ENGINES } from '../../games/registry.ts';
import { isReviewableArena, reviewArena, reviewClassic } from '../review.ts';

/** Plays a match by always taking the k-th legal choice (cycled), returning the actions. */
function playArena(id: (typeof ARENA_IDS)[number], seed: number) {
  const engine = ARENA_ENGINES[id];
  const setup = { persona: engine.opponents[seed % engine.opponents.length], level: 'normal' as const, variant: engine.variants[0], length: 'short' as const, seed };
  let s = engine.create(setup);
  const actions: unknown[] = [];
  const pool: Record<string, (s: any, k: number) => unknown> = {
    cooperation: (st, k) => ({ move: k % 3 ? 'C' : 'D', round: st.rounds.length }),
    'ultimatum-game': (_st, k) => [5, 'accept', 'reject', 3][k % 4],
    auction: (st, k) => Math.min(st.cash[0], 10 + (k % 4) * 5),
    market: (_st, k) => 8 + (k % 6),
    signal: (_st, k) => ['stake', 'pitch', 'warn', 'investigate', 'invest', 'pass'][k % 6],
  };
  for (let k = 0; !engine.isOver(s) && k < 500; k++) {
    let a = pool[id]?.(s, k) ?? engine.moves?.(s)[k % (engine.moves(s).length || 1)];
    // Fall back to any legal choice from the pool list, so the driver never stalls.
    if (engine.validate(s, a) !== null) {
      const tries = [0, 1, 2, 3, 4, 5].map((j) => pool[id]?.(s, k + j) ?? engine.moves?.(s)[j]);
      a = tries.find((t) => engine.validate(s, t) === null);
    }
    actions.push(a);
    s = engine.apply(s, a);
  }
  return { engine, setup, actions, final: engine.result(s).player };
}

describe('Game Review', () => {
  for (const id of ARENA_IDS.filter(isReviewableArena)) {
    it(`${id}: reviews a finished match, and every suggested move really ends better`, () => {
      for (const seed of [1, 7, 42]) {
        const { engine, setup, actions, final } = playArena(id, seed);
        const r = reviewArena(engine, setup, actions);
        assert.ok(r, `${id} seed ${seed}: no review`);
        assert.equal(r.steps.length, actions.length);
        assert.equal(r.final, final);
        for (const s of r.steps) if (s.better) assert.ok(s.better.final > final && s.better.gain === s.better.final - final);
        if (r.key) assert.equal(r.key.mark, 'key');
        assert.ok(r.steps.filter((s) => s.mark === 'key').length <= 1);
      }
    });
  }

  it('is not offered for games without a list of choices, or for actions that do not replay', () => {
    const mole = ARENA_ENGINES.mole;
    assert.equal(reviewArena(mole, { persona: mole.opponents[0], level: 'normal', variant: mole.variants[0], length: 'short', seed: 3 }, [{ kind: 'accuse', suspect: 0 }]), null);
    const coop = ARENA_ENGINES.cooperation;
    assert.equal(reviewArena(coop, { persona: coop.opponents[0], level: 'normal', variant: coop.variants[0], length: 'short', seed: 3 }, [{ move: 'C', round: 0 }]), null);
  });

  it('finds the costly defection against a retaliator: cooperating would have scored more', () => {
    const coop = ARENA_ENGINES.cooperation;
    const setup = { persona: coop.opponents[0], level: 'hard' as const, variant: coop.variants[0], length: 'standard' as const, seed: 11 };
    let s = coop.create(setup);
    const actions: unknown[] = [];
    while (!coop.isOver(s)) {
      const a = { move: 'D', round: s.rounds.length };
      actions.push(a);
      s = coop.apply(s, a);
    }
    const r = reviewArena(coop, setup, actions)!;
    assert.ok(r.steps.every((st) => st.played === 'Defect'));
  });

  for (const game of GAME_IDS) {
    it(`${game}: reviews a classic match`, () => {
      const engine = ENGINES[game];
      for (const seed of [2, 9]) {
        const spec = { bot: engine.bots[seed % engine.bots.length], difficulty: 'medium' as const, seed };
        const rounds: unknown[] = [];
        const raw: Record<string, (p: any, k: number) => unknown> = {
          rps: (_p, k) => ['rock', 'paper', 'scissors'][k % 3],
          'split-steal': (_p, k) => (k % 2 ? 'split' : 'steal'),
          'stag-hunt': (_p, k) => (k % 3 ? 'stag' : 'hare'),
          'two-thirds': (_p, k) => 20 + k * 3,
          ultimatum: (p, k) => (p.role === 'respond' ? (k % 2 ? 'accept' : 'reject') : 4),
        };
        for (let k = 0; rounds.length < engine.rounds; k++) {
          const prompt = engine.prompt(spec, rounds);
          rounds.push(engine.resolve(spec, rounds, engine.parseMove(raw[game](prompt, k), prompt)));
        }
        const r = reviewClassic(engine, game, spec, rounds);
        assert.ok(r, `${game}: no review`);
        assert.equal(r.steps.length, engine.rounds);
        assert.equal(r.final, engine.totals(rounds).player);
        for (const st of r.steps) if (st.better) assert.ok(st.better.final > r.final);
      }
    });
  }
});
