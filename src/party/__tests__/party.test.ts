/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { banish, canStart, cleanNames, murder, scoreGuesses, scorePot, seeded, standings, startTraitors, traitorCount, victims } from '../party.ts';

const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

describe('Party mode', () => {
  it('cleans names and checks player counts', () => {
    assert.deepEqual(cleanNames(['  Asha ', 'asha', '', 'Ravi  Kumar', 'x'.repeat(30)]), ['Asha', 'Ravi Kumar', 'x'.repeat(16)]);
    assert.equal(canStart('traitors', names(3)), false);
    assert.equal(canStart('traitors', names(4)), true);
    assert.equal(canStart('pot', names(11)), false);
  });

  it('The Traitors: deals the right number of Traitors and ends when they are gone', () => {
    for (const n of [4, 6, 7, 10]) {
      const s = startTraitors(names(n), seeded(n));
      assert.equal(s.roles.filter((r) => r === 'traitor').length, traitorCount(n));
    }
    let s = startTraitors(names(5), seeded(3));
    const traitor = s.roles.indexOf('traitor');
    s = banish(s, traitor);
    assert.equal(s.phase, 'over');
    assert.equal(s.winner, 'faithful');
    assert.equal(s.last?.role, 'traitor');
  });

  it('The Traitors: Traitors win once they equal the Faithful; illegal moves change nothing', () => {
    let s = startTraitors(names(4), seeded(9));
    const traitor = s.roles.indexOf('traitor');
    const faithful = s.roles.map((r, i) => (r === 'faithful' ? i : -1)).filter((i) => i >= 0);
    assert.equal(murder(s, faithful[0]), s, 'no murder by day');
    s = banish(s, faithful[0]);
    assert.equal(s.phase, 'night');
    assert.equal(murder(s, traitor), s, 'Traitors cannot remove a Traitor');
    assert.ok(!victims(s).includes(faithful[0]));
    s = murder(s, faithful[1]);
    assert.equal(s.winner, 'traitor');
  });

  it('Two-Thirds and The Pot score as the rules say', () => {
    const r = scoreGuesses([30, 30, 30]);
    assert.equal(r.target, 20);
    assert.deepEqual(r.winners, [0, 1, 2]);
    assert.deepEqual(scoreGuesses([0, 50, 100]).winners, [1]); // target 33.3
    const pot = scorePot([true, true, false]);
    assert.equal(pot.shared, 2);
    assert.deepEqual(pot.payout, [13.3, 13.3, 23.3]);
    assert.deepEqual(scorePot([true, true, true]).payout, [20, 20, 20]);
    assert.deepEqual(standings(['A', 'B', 'C'], [5, 9, 5]).map((x) => [x.name, x.place]), [['B', 1], ['A', 2], ['C', 2]]);
  });
});
