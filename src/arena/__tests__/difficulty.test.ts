import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { auctionPrompt, posteriorMean } from '../auction.ts';
import { coalition, coalitionPrompt, proportional } from '../coalition.ts';
import { ARENA_IDS, LEVELS, type AnyArenaEngine, type Level } from '../core.ts';
import { conditions, equilibriumPrice, market } from '../market.ts';
import { mole, molePrompt, playerPosterior } from '../mole.ts';
import { ARENA_ENGINES } from '../registry.ts';
import { saboteur, saboteurPrompt, suspicion } from '../saboteur.ts';
import { signalPrompt } from '../signal.ts';
import { ultPrompt } from '../ultimatum-game.ts';

/**
 * Difficulty must mean something: for the same player, Hard is never easier than Normal and Normal never easier than
 * Easy. Simulated players stand in for people, over fixed seeds (so the numbers are deterministic, not flaky):
 *
 * - A random player for every game — legal moves picked by a seeded generator. It ignores evidence, so in deduction
 *   games it can't feel clearer clues; those get a reasoning player below.
 * - Reasoning players for the games where reading the board is the skill (the Mole, the Saboteur, the Coalition, the
 *   Market).
 *
 * TOLERANCE absorbs sampling noise between two close levels; a real inversion (Hard Ultimatum offers without a ceiling,
 * Easy Coalition bots dealing among themselves, Easy saboteurs jamming behind noise — all fixed 2026-11-09) is larger.
 * A fixed-cycle player is deliberately not used: its "habit" depends on the order an engine lists its moves.
 */

const TOLERANCE = 0.04;
const PER_OPPONENT = 100;
const seedOf = (i: number) => (i * 2654435761 + 97) >>> 0;

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A legal move for any arena game; `k` picks among the options (the same policy family as arena.test.ts). */
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

/** Win rate of a player over every opponent at one level. */
function winRate(engine: AnyArenaEngine, level: Level, player: (s: any, r: () => number, k: number) => unknown, variant = engine.variants[0]): number {
  let wins = 0;
  let n = 0;
  for (const persona of engine.opponents)
    for (let i = 0; i < PER_OPPONENT; i++) {
      const seed = seedOf(i);
      const r = rng(seed ^ 0x9e37);
      let s = engine.create({ persona, level, length: 'standard', variant, seed });
      for (let k = 0; k < 500 && !engine.isOver(s); k++) s = engine.apply(s, player(s, r, k));
      if (engine.result(s).outcome === 'win') wins++;
      n++;
    }
  return wins / n;
}

function assertMonotone(name: string, rates: Record<Level, number>) {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const line = `${name}: easy ${pct(rates.easy)} / normal ${pct(rates.normal)} / hard ${pct(rates.hard)}`;
  assert.ok(rates.normal <= rates.easy + TOLERANCE, `Normal is easier than Easy — ${line}`);
  assert.ok(rates.hard <= rates.normal + TOLERANCE, `Hard is easier than Normal — ${line}`);
  assert.ok(rates.hard <= rates.easy + TOLERANCE, `Hard is easier than Easy — ${line}`);
}

const byLevel = (f: (level: Level) => number) => Object.fromEntries(LEVELS.map((l) => [l, f(l)])) as Record<Level, number>;

describe('difficulty: Hard is never easier than Normal, Normal never easier than Easy', () => {
  for (const id of ARENA_IDS) {
    it(`${id}: a random player`, () => {
      const engine = ARENA_ENGINES[id];
      const random = (s: any, r: () => number, k: number) => {
        const a = anyMove(id, s, Math.floor(r() * 1000));
        return engine.validate(s, a) === null ? a : anyMove(id, s, k);
      };
      assertMonotone(id, byLevel((level) => winRate(engine, level, random)));
    });
  }

  it('the Mole: a detective who follows the exact odds', () => {
    const best = (s: any) => {
      const p = playerPosterior(s);
      return p.indexOf(Math.max(...p));
    };
    const detective = (s: any) => ({ kind: molePrompt(s)!.phase === 'accuse' ? 'accuse' : 'interrogate', suspect: best(s) });
    for (const variant of mole.variants) {
      const rates = byLevel((level) => winRate(mole, level, detective, variant));
      assertMonotone(`mole (${variant})`, rates);
      assert.ok(rates.easy > rates.normal && rates.normal > rates.hard, 'each level is clearly different');
    }
  });

  it('the Saboteur: a crew member who spreads energy and accuses the most suspicious bot', () => {
    const most = (sus: number[]) => [1, 2, 3].sort((a, b) => sus[b] - sus[a] || a - b)[0];
    const careful = (s: any) => {
      const p = saboteurPrompt(s)!;
      const sus = suspicion(s.history);
      if (p.phase === 'accuse') return { kind: 'accuse', suspect: most(sus) };
      const card = Math.min(3, p.energy, Math.ceil(p.energy / Math.max(1, s.missions - s.history.length)));
      return { kind: 'mission', card, bench: p.leader === 0 ? most(sus) : undefined };
    };
    const rates = byLevel((level) => winRate(saboteur, level, careful));
    assertMonotone('saboteur (careful)', rates);
    assert.ok(rates.easy > rates.normal, 'Easy is clearly easier');
  });

  it('the Coalition: a fair negotiator', () => {
    const fair = (s: any) => {
      const p = coalitionPrompt(s)!;
      if (p.phase === 'watch') return { kind: 'watch' };
      if (p.phase === 'respond') return { kind: 'respond', accept: p.proposal.shares[0] >= proportional(s, p.proposal.members, 0) * 0.8 };
      const fairOnes = coalition.moves!(s).filter((_, i) => i % 2 === 0) as { shares: number[] }[];
      return fairOnes.reduce((a, b) => (b.shares[0] > a.shares[0] ? b : a));
    };
    const rates = byLevel((level) => winRate(coalition, level, fair));
    assertMonotone('coalition (fair)', rates);
    assert.ok(rates.easy > rates.normal + 0.1, 'Easy is clearly easier');
  });

  it('the Market: holding one price is punished more at each level; reading the round is not', () => {
    const held = byLevel((level) => winRate(market, level, () => 10));
    assertMonotone('market (always 10)', held);
    assert.ok(held.hard < held.easy - 0.3, 'a held price stops working');
    const reader = byLevel((level) => winRate(market, level, (s: any) => equilibriumPrice(conditions(s.setup, s.rounds.length))));
    assertMonotone('market (reads the round)', reader);
    assert.ok(reader.hard > 0.6, `reading each round's conditions still wins on Hard (${reader.hard})`);
  });
});
