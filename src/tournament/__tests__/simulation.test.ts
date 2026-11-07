/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { auctionPrompt, posteriorMean } from '../../arena/auction.ts';
import type { AnyArenaEngine, Level as ArenaLevel } from '../../arena/core.ts';
import { hiddenOpponent } from '../../arena/reads.ts';
import { ARENA_ENGINES } from '../../arena/registry.ts';
import { signalPrompt } from '../../arena/signal.ts';
import { ultPrompt } from '../../arena/ultimatum-game.ts';
import type { AnyEngine, Difficulty, GameId, Outcome } from '../../games/core.ts';
import { ENGINES } from '../../games/registry.ts';
import { LESSON_IDS } from '../../content/lessons.ts';
import { EMPTY_PROGRESS, type Level, SKIP_AFTER, type TournamentProgress, allStages, canSkip, recordGame, recordOf, seasonCleared, skipMatch, stageStatus, strategistRating } from '../progress.ts';
import { type ResolvedMatch, liveSeason, resolveMatch } from '../schema.ts';
import { SEASON_ONE } from '../season1.ts';

/**
 * Simulations of every Season 1 match on the real engines, as the play screens set them up: a hidden opponent drawn
 * from the match seed, the match's level, variant and length. Simple scripted players stand in for people — they are
 * not good players, so the win rates below are a floor, not a balance verdict — but they prove every match runs to a
 * valid result, can be won at its level and on Hard, and that a whole season can be played through the rules.
 */

const season = liveSeason(SEASON_ONE)!;
const MATCHES: ResolvedMatch[] = season.stages.flatMap((s) => s.matches.map((m) => resolveMatch(s, m)));
const SEEDS = 60;
const seedOf = (i: number) => (i * 2654435761 + 97) >>> 0;

/** A small deterministic generator for the scripted players' choices. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

type Policy = 0 | 1 | 2;

/** A legal arena move. Policy 0 and 1 are fixed habits (as in src/arena/__tests__/arena.test.ts); policy 2 is random. */
function arenaMove(id: string, s: any, k: number, policy: Policy, r: () => number): unknown {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  switch (id) {
    case 'cooperation':
      return { move: policy === 2 ? pick(['C', 'D'] as const) : (k + policy) % 3 === 0 ? 'D' : 'C', round: s.rounds.length };
    case 'ultimatum-game': {
      const p = ultPrompt(s)!;
      if (p.terms.proposer === 'player') return Math.floor((p.terms.pool * (policy === 2 ? 0.3 + r() * 0.4 : policy === 1 ? 0.4 : 0.5)));
      return policy === 2 ? pick(['accept', 'reject']) : policy === 0 ? 'accept' : (k % 2 ? 'accept' : 'reject');
    }
    case 'auction': {
      const p = auctionPrompt(s)!;
      const share = policy === 2 ? 0.5 + r() * 0.4 : policy === 1 ? 0.7 : 0.8;
      return Math.min(p.cash, Math.max(0, Math.round(posteriorMean(p.lot, p.estimate) * share)));
    }
    case 'market':
      return policy === 2 ? 6 + Math.floor(r() * 9) : 8 + ((k + policy * 3) % 6);
    case 'signal': {
      const p = signalPrompt(s)!;
      if (p.role === 'send') return p.strong ? 'stake' : policy === 2 ? pick(['pitch', 'warn']) : (k + policy) % 2 ? 'pitch' : 'warn';
      if (p.test === null && (policy === 2 ? r() < 0.3 : k % 3 === policy)) return 'investigate';
      return p.signal === 'warn' ? 'pass' : 'invest';
    }
  }
  const ms = ARENA_ENGINES[id as keyof typeof ARENA_ENGINES].moves?.(s);
  if (!ms?.length) throw new Error(`${id}: no legal move`);
  return policy === 2 ? pick(ms) : ms[(k + policy) % ms.length];
}

function playArena(m: ResolvedMatch, level: Level, seed: number, policy: Policy): Outcome {
  const engine: AnyArenaEngine = ARENA_ENGINES[m.game.id as keyof typeof ARENA_ENGINES];
  const persona = hiddenOpponent(engine.opponents, seed);
  let s = engine.create({ persona, level: level as ArenaLevel, variant: m.variant, length: m.length, seed });
  const r = rng(seed ^ (policy * 7919));
  for (let k = 0; !engine.isOver(s); k++) {
    if (k > 600) throw new Error(`${m.id}: did not finish`);
    s = engine.apply(s, arenaMove(m.game.id, s, k, policy, r));
  }
  const result = engine.result(s);
  assert.ok(['win', 'loss', 'draw'].includes(result.outcome), m.id);
  assert.ok(Number.isFinite(result.player) && Number.isFinite(result.rival), m.id);
  assert.ok(engine.debrief(s).headline.length > 0, `${m.id}: every result has a debrief`);
  return result.outcome;
}

const CANDIDATES: unknown[] = ['rock', 'paper', 'scissors', 'split', 'steal', 'stag', 'hare', 'accept', 'reject', ...Array.from({ length: 101 }, (_, i) => i)];

function playClassic(m: ResolvedMatch, level: Level, seed: number, policy: Policy): Outcome {
  const engine: AnyEngine = ENGINES[m.game.id as GameId];
  const r = rng(seed ^ (policy * 104729));
  const spec = { bot: engine.bots[Math.floor(r() * engine.bots.length)], difficulty: (level === 'normal' ? 'medium' : level) as Difficulty, seed };
  const history: unknown[] = [];
  for (let k = 0; k < engine.rounds; k++) {
    const prompt = engine.prompt(spec, history);
    // Two-Thirds: a guess between 15 and 40 (one or two steps of reasoning), not any number from 0 to 100.
    const legal = CANDIDATES.filter((c) => engine.parseMove(c, prompt) !== null && (m.game.id !== 'two-thirds' || ((c as number) >= 15 && (c as number) <= 40)));
    assert.ok(legal.length > 0, `${m.id}: no legal move`);
    const raw = policy === 2 ? legal[Math.floor(r() * legal.length)] : legal[(k * (policy + 1) + policy) % legal.length];
    history.push(engine.resolve(spec, history, engine.parseMove(raw, prompt)));
  }
  return engine.outcome(history);
}

const playOnce = (m: ResolvedMatch, level: Level, seed: number, policy: Policy) => (m.game.system === 'arena' ? playArena(m, level, seed, policy) : playClassic(m, level, seed, policy));

function winRate(m: ResolvedMatch, level: Level): number {
  let wins = 0;
  let n = 0;
  for (const policy of [0, 1, 2] as const)
    for (let i = 0; i < SEEDS; i++) {
      if (playOnce(m, level, seedOf(i), policy) === 'win') wins++;
      n++;
    }
  return wins / n;
}

describe('every Season 1 match, simulated on its engine', () => {
  const rates = new Map<string, { level: number; hard: number }>();
  for (const m of MATCHES) {
    it(`${m.id}: finishes with a valid result, and can be won at ${m.level} and on Hard`, () => {
      const atLevel = winRate(m, m.level);
      const hard = m.level === 'hard' ? atLevel : winRate(m, 'hard');
      rates.set(m.id, { level: atLevel, hard });
      assert.ok(atLevel > 0, `${m.id}: never won at ${m.level} by any scripted player`);
      assert.ok(hard > 0, `${m.id}: never won on Hard by any scripted player`);
    });
  }
  it('prints the scripted players’ win rates (a floor for balance review, not a verdict)', () => {
    const rows = [...rates.entries()].map(([id, r]) => `${id.padEnd(28)} ${(r.level * 100).toFixed(0).padStart(3)}%  hard ${(r.hard * 100).toFixed(0).padStart(3)}%`);
    console.log(`\nScripted win rates (${SEEDS * 3} games each):\n${rows.join('\n')}`);
    assert.equal(rates.size, MATCHES.length);
  });
});

describe('a whole season, played through the rules', () => {
  it('a scripted player who retries, skips when stuck and earns key cards clears Season 1', () => {
    let p: TournamentProgress = EMPTY_PROGRESS;
    let seed = 1;
    const completed: string[] = [];
    for (let i = 0; i < season.stages.length; i++) {
      const stage = season.stages[i];
      assert.equal(stageStatus(season, i, p, completed).unlocked, true, `${stage.id} should be open`);
      // The key card: the first of the stage's lessons is "finished" before the duel.
      if (stage.lessons.length) completed.push(stage.lessons[0]);
      for (const m of stage.matches) {
        const r = resolveMatch(stage, m);
        for (let attempt = 0; !recordOf(p, m.id).won && !recordOf(p, m.id).skipped; attempt++) {
          if (canSkip(m, recordOf(p, m.id)) && attempt >= SKIP_AFTER) {
            p = skipMatch(p, m);
            break;
          }
          assert.ok(attempt < 400, `${m.id}: no win in 400 games`);
          const outcome = playOnce(r, m.level, seedOf(seed++), (attempt % 3) as Policy);
          p = recordGame(p, stage, m, { outcome, level: m.level, read: false }, seed).progress;
        }
      }
      assert.equal(stageStatus(season, i, p, completed).cleared, true, `${stage.id} cleared`);
    }
    assert.equal(seasonCleared(season, p), true);
    assert.ok(allStages(season, p, [...LESSON_IDS]).every((s) => s.cleared));
    assert.ok(p.history.length >= MATCHES.length);
    assert.ok(Number.isFinite(strategistRating(p.history)));
  });
});
