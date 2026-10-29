import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DIFFICULTIES, GAME_IDS, type Difficulty, type GameId } from '../core.ts';
import { CLASSIC_READ, classicEvidence, classicTakeaway, lockRead, pickHidden, readIsAwaited, readIsOpen, readMinRounds, readOptions, readPoints } from '../reads.ts';
import { ENGINES } from '../registry.ts';
import { RPS_INSIGHT } from '../rps.ts';

/** Plays a practice match with a fixed player policy. */
function play(game: GameId, bot: string, difficulty: Difficulty, pick: (prompt: any, n: number) => unknown, seed = 11) {
  const e = ENGINES[game];
  const spec = { bot, difficulty, seed };
  const rounds: unknown[] = [];
  while (rounds.length < e.rounds) {
    const prompt = e.prompt(spec, rounds);
    const move = e.parseMove(pick(prompt, rounds.length), prompt);
    assert.notEqual(move, null, `${game}: illegal test move`);
    rounds.push(e.resolve(spec, rounds, move));
  }
  return rounds as any[];
}

const CLASSIC = GAME_IDS.filter((g) => g !== 'rps') as Exclude<GameId, 'rps'>[];
const anyMove = (game: GameId) => (p: any, n: number) =>
  game === 'split-steal' ? (n % 3 ? 'split' : 'steal') : game === 'stag-hunt' ? (n % 3 ? 'stag' : 'hare') : game === 'ultimatum' ? (p.role === 'propose' ? 4 : 'accept') : 30;

describe('reads for every practice game', () => {
  it('has four honest descriptions per game and difficulty, in the engine’s order', () => {
    for (const game of GAME_IDS)
      for (const d of DIFFICULTIES) {
        const opts = readOptions(game, ENGINES[game].bots, d);
        assert.deepEqual(opts.map((o) => o.id), [...ENGINES[game].bots]);
        for (const o of opts) assert.ok(o.name.length > 3 && o.description.length > 8, `${game}/${o.id}/${d}`);
        assert.equal(new Set(opts.map((o) => o.description)).size, opts.length, `${game} ${d}: descriptions must differ`);
      }
  });

  it('opens a read only after the threshold, accepts one guess from the game’s bots, and waits at the end', () => {
    const bots = ENGINES['split-steal'].bots;
    const min = readMinRounds('split-steal');
    const s = (roundsPlayed: number) => ({ mystery: true, roundsPlayed, totalRounds: 10, revealed: false });
    assert.equal(readIsOpen(null, s(min - 1), min), false);
    assert.equal(readIsOpen(null, s(min), min), true);
    assert.equal(lockRead(null, 'cooperator', s(min - 1), min, bots), null, 'too early');
    assert.equal(lockRead(null, 'repeater', s(min), min, bots), null, 'not a personality of this game');
    const r = lockRead(null, 'retaliator', s(min), min, bots)!;
    assert.deepEqual(r, { guess: 'retaliator', round: min });
    assert.equal(lockRead(r, 'cooperator', s(min + 1), min, bots), r, 'locked');
    assert.equal(readIsAwaited(null, s(10), min), true);
    assert.equal(readIsAwaited(r, s(10), min), false);
    assert.equal(readIsOpen(null, { ...s(min), mystery: false }, min), false, 'chosen opponents have no read');
  });

  it('scores a right read with Insight Points and a wrong one with none', () => {
    assert.deepEqual(readPoints({ guess: 'fair', round: 4 }, 'fair'), { correct: true, points: RPS_INSIGHT.points });
    assert.deepEqual(readPoints({ guess: 'fair', round: 4 }, 'hardliner'), { correct: false, points: 0 });
    assert.equal(readPoints(null, 'fair'), null);
  });

  it('picks every personality as a hidden opponent', () => {
    for (const game of GAME_IDS) {
      const bots = ENGINES[game].bots;
      assert.deepEqual(new Set(Array.from({ length: 100 }, (_, i) => pickHidden(bots, i / 100))), new Set(bots));
    }
  });

  it('keeps the thresholds within each match', () => {
    for (const game of CLASSIC) assert.ok(CLASSIC_READ[game].minRounds >= 2 && CLASSIC_READ[game].minRounds < ENGINES[game].rounds, game);
  });
});

describe('descriptions match the engines', () => {
  it('Split or Steal: easy Cooperator always splits; hard Retaliator never splits after your first steal', () => {
    assert.ok(play('split-steal', 'cooperator', 'easy', () => 'steal').every((r) => r.b === 'split'));
    const r = play('split-steal', 'retaliator', 'hard', (_p, n) => (n === 2 ? 'steal' : 'split'));
    assert.ok(r.slice(3).every((x) => x.b === 'steal'));
  });

  it('Stag Hunt: easy Cautious always hare, easy Optimist always stag', () => {
    assert.ok(play('stag-hunt', 'cautious', 'easy', () => 'stag').every((r) => r.b === 'hare'));
    assert.ok(play('stag-hunt', 'optimist', 'easy', () => 'hare').every((r) => r.b === 'stag'));
  });

  it('Ultimatum: the Fair Player offers 5 and the Hardliner on Hard offers 3', () => {
    const fair = play('ultimatum', 'fair', 'easy', (p) => (p.role === 'propose' ? 5 : 'accept'));
    assert.ok(fair.filter((r) => r.proposer === 'bot').every((r) => r.offer === 5));
    const hard = play('ultimatum', 'hardliner', 'hard', (p) => (p.role === 'propose' ? 5 : 'accept'));
    assert.ok(hard.filter((r) => r.proposer === 'bot').every((r) => r.offer === 3));
  });

  it('Two-Thirds: a shallow crowd starts near 33, a deep one lower', () => {
    const shallow = play('two-thirds', 'shallow', 'medium', () => 30)[0].bots.slice(0, 5);
    const deep = play('two-thirds', 'deep', 'medium', () => 30)[0].bots.slice(0, 5);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    assert.ok(Math.abs(avg(shallow) - 33) <= 5, `${avg(shallow)}`);
    assert.ok(avg(deep) < avg(shallow));
  });
});

describe('the reveal’s evidence', () => {
  it('counts from the recorded rounds', () => {
    const rounds = play('split-steal', 'opportunist', 'medium', anyMove('split-steal'));
    const steals = rounds.filter((r) => r.b === 'steal').length;
    assert.ok(classicEvidence('split-steal', rounds)[0].includes(`${steals} of ${rounds.length}`));
    const ult = play('ultimatum', 'negotiator', 'hard', anyMove('ultimatum'));
    assert.ok(classicEvidence('ultimatum', ult)[0].includes(ult.filter((r) => r.proposer === 'bot').map((r) => r.offer).join(', ')));
  });

  it('every game and personality has evidence and a takeaway', () => {
    for (const game of CLASSIC)
      for (const bot of ENGINES[game].bots) {
        const ev = classicEvidence(game, play(game, bot, 'medium', anyMove(game)));
        assert.ok(ev.length >= 1 && /\d/.test(ev[0]), `${game}/${bot}: the first line counts something`);
        assert.ok(classicTakeaway(game, bot).length > 20);
      }
  });
});
