import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ARENA_IDS, LEVELS, type ArenaGameId } from '../../arena/core.ts';
import { ARENA_ENGINES } from '../../arena/registry.ts';
import { ArenaRuleError, cleanAction, configProblem, playAction, replay, viewOf } from '../arena-match.ts';
import { redact } from '../arena-views.ts';
import { SCORING_RULES, arenaCompetitionScore } from '../scoring.ts';
import { clientMove } from './client-moves.ts';

/**
 * Server-run Arena matches (src/competition): every game, at every level and variant, over many seeds, is played to
 * the end by a player who sees only the redacted view — so the view always carries enough to choose a legal action,
 * and never the seed or the game's private information.
 */

const SEED = 2_654_435_769;

function playThrough(game: ArenaGameId, cfg: any, seed: number, onView?: (v: any, full: any) => void) {
  const actions: unknown[] = [];
  let full: any = replay(game, cfg, seed, actions);
  let k = 0;
  while (!ARENA_ENGINES[game].isOver(full)) {
    const v = viewOf(game, cfg, full, actions.length);
    onView?.(v, full);
    const r = playAction(game, cfg, seed, actions, clientMove(game, v.state, k++));
    actions.push(r.action);
    full = r.state;
    if (k > 400) throw new Error(`${game} did not finish`);
  }
  return { full, actions };
}

describe('every Arena game runs on the server from a redacted view', () => {
  for (const game of ARENA_IDS) {
    const e = ARENA_ENGINES[game];
    it(`${game}: every level and variant, 12 seeds each`, () => {
      for (const level of LEVELS)
        for (const variant of e.variants)
          for (let i = 0; i < 12; i++) {
            const seed = (SEED + i * 7919) >>> 0;
            const cfg = { opponent: e.opponents[i % e.opponents.length], level, variant, length: 'standard' as const };
            assert.equal(configProblem(game, cfg), null);
            const { full, actions } = playThrough(game, cfg, seed, (v, s) => {
              const text = JSON.stringify(v.state);
              assert.equal(v.over, false);
              assert.equal(v.state.setup.seed, 0);
              assert.equal(text.includes(`"seed":${seed}`), false);
              assert.equal(v.final, null);
              if (game === 'mole') assert.equal(v.state.mole, -1);
              if (game === 'saboteur') {
                assert.equal(v.state.saboteur, -1);
                assert.ok(v.state.history.every((m: any) => m.cards.slice(1).every((c: unknown) => c === null)), 'only mission totals are public');
                assert.ok(v.state.energy.slice(1).every((x: number) => x === 0));
              }
              if (game === 'defusal') {
                assert.deepEqual(v.state.live, [-1, -1]);
                const unshared = v.state.hands.bot.filter((c: any) => !c.hidden);
                assert.ok(unshared.length <= s.hands.bot.length);
              }
              if (game === 'power-play') {
                assert.ok(v.state.deck.every((c: any) => c.id >= 1000), 'the deck order is never sent');
                for (const c of v.state.bot.hand) if (c.id < 1000) assert.ok(s.playerSaw[c.id] !== undefined, 'only cards you saw are shown');
              }
              if (game === 'codebreaker') {
                const p = v.state.served.prompt;
                if (p?.phase === 'guess') p.board.key.forEach((k: string, j: number) => p.guesses.includes(j) || assert.equal(k, 'neutral'));
              }
              if (game === 'liars-dice') assert.deepEqual(v.state.served.roll.bot, []);
              // Redaction never alters the server's state.
              assert.equal(s.setup.seed, seed);
            });
            const v = viewOf(game, cfg, full, actions.length);
            assert.equal(v.over, true);
            assert.equal(v.state, full, 'the full state once over');
            const score = arenaCompetitionScore(game, full, e.result(full));
            assert.deepEqual(v.final!.score, score);
            assert.ok(Number.isInteger(score.score) && (score.secondary === null || Number.isInteger(score.secondary)));
            // Deterministic: replaying the log reproduces the match exactly.
            assert.deepEqual(replay(game, cfg, seed, actions), full);
          }
    });
  }
});

describe('competition rules around the engines', () => {
  it('refuses an illegal action, an oversized action and moves after the end', () => {
    const cfg = { opponent: 'purist', level: 'normal' as const, variant: 'standard', length: 'short' as const };
    assert.throws(() => playAction('travelers', cfg, 1, [], 99), (e: unknown) => e instanceof ArenaRuleError && e.code === 'illegal_action');
    assert.throws(() => cleanAction('x'.repeat(5000)), (e: unknown) => e instanceof ArenaRuleError && e.code === 'invalid_action');
    assert.throws(() => cleanAction(undefined), ArenaRuleError);
    const { actions } = playThrough('travelers', cfg, 7);
    assert.throws(() => playAction('travelers', cfg, 7, actions, 10), (e: unknown) => e instanceof ArenaRuleError && e.code === 'finished');
    assert.throws(() => replay('travelers', cfg, 7, [...actions, 10]), (e: unknown) => e instanceof ArenaRuleError && e.code === 'corrupt_log');
  });

  it('refuses configurations a game doesn’t have', () => {
    assert.match(configProblem('gambit', { opponent: 'adaptive', level: 'medium', variant: 'standard', length: 'standard' })!, /level/);
    assert.match(configProblem('market', { opponent: 'adaptive', level: 'hard', variant: 'standard', length: 'standard' })!, /opponent/);
    assert.match(configProblem('rps', {})!, /not an Arena game/);
  });

  it('every game documents its competition score', () => {
    for (const game of ARENA_IDS) assert.ok(SCORING_RULES[game].score.length > 10, game);
  });

  it('the redacted view is a copy: the server state is untouched', () => {
    const cfg = { opponent: 'deceiver', level: 'hard' as const, variant: 'standard', length: 'standard' as const };
    const s: any = replay('mole', cfg, 42, []);
    const before = JSON.stringify(s);
    redact('mole', s);
    assert.equal(JSON.stringify(s), before);
  });
});
