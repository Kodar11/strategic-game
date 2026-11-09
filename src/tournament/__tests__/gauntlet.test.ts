/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GAUNTLET_BOUTS, LEVELS_BY_BOUT, boutLevel, boutsWon, newRun, parseRun, reportBout, takePerk } from '../gauntlet.ts';
import { SEASON_ONE } from '../season1.ts';

const season = SEASON_ONE.seasons[0];

describe('The Gauntlet', () => {
  it('draws six bouts from the season, escalating, never the same stage twice in a row', () => {
    for (const seed of [1, 2, 3, 99, 123456]) {
      const run = newRun(season, seed);
      assert.equal(run.bouts.length, GAUNTLET_BOUTS);
      assert.deepEqual(run.bouts.map((b) => b.level), LEVELS_BY_BOUT);
      run.bouts.forEach((b, i) => i && assert.notEqual(b.stageId, run.bouts[i - 1].stageId));
      assert.equal(new Set(run.bouts.map((b) => b.matchId)).size, GAUNTLET_BOUTS);
      assert.deepEqual(newRun(season, seed), run);
    }
  });

  it('a win offers two different perks; a loss with one life ends the run', () => {
    let run = newRun(season, 7);
    run = reportBout(run, 'win');
    assert.ok(run.choice && run.choice[0] !== run.choice[1]);
    assert.equal(reportBout(run, 'win'), run, 'no next bout until the perk is chosen');
    run = takePerk(run, run.choice![0]);
    assert.equal(run.choice, null);
    run = reportBout(run, 'draw');
    assert.equal(run.choice, null);
    assert.equal(run.over, false);
    run = reportBout(run, 'loss');
    assert.equal(run.over, true);
    assert.equal(boutsWon(run), 1);
  });

  it('Second chance survives a loss; Calm mind lowers the next bout; perks last one bout', () => {
    let run = reportBout(newRun(season, 11), 'win');
    run = { ...run, choice: ['life', 'calm'] };
    const withLife = takePerk(run, 'life');
    assert.equal(withLife.lives, 2);
    assert.equal(reportBout(withLife, 'loss').over, false);
    const calm = takePerk(run, 'calm');
    assert.equal(boutLevel(calm), 'easy'); // bout 2 is normal
    assert.equal(reportBout(calm, 'draw').calm, false);
  });

  it('ends after the last bout, and drops a stored run that no longer fits the season', () => {
    let run = newRun(season, 5);
    for (let i = 0; i < GAUNTLET_BOUTS; i++) {
      run = reportBout(run, 'win');
      if (run.choice) run = takePerk(run, run.choice[0]);
    }
    assert.equal(run.over, true);
    assert.equal(boutsWon(run), GAUNTLET_BOUTS);
    assert.deepEqual(parseRun(JSON.parse(JSON.stringify(run)), season), run);
    assert.equal(parseRun({ ...run, bouts: run.bouts.map((b) => ({ ...b, matchId: 'gone' })) }, season), null);
    assert.equal(parseRun(null, season), null);
  });
});
