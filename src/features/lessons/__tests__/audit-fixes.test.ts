import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type MatrixGame, colWeaklyDominatedBy, rowWeaklyDominatedBy } from '../../../game/payoff-matrix.ts';
import { getScenario } from '../../scenarios/index.ts';
import { noReturnValue, openFirmChance, PRECOMMIT } from '../../scenarios/engines/module6.ts';
import { curriculumSpec } from '../curriculum/specs.ts';
import { installSeedCatalog } from '../../../content/seed.ts';

installSeedCatalog();

/** Regression tests for defects found in the curriculum accuracy audit (October 2026). */

describe('Audit · L21.C burning the bridge', () => {
  const spec = getScenario('l21.c.point-of-no-return')!;

  it('a side that has already locked in always stands firm when you stay open', () => {
    let locked = 0;
    for (let seed = 1; seed <= 400; seed++) {
      let s = spec.play.init(seed);
      s = spec.play.apply(s, 'open');
      s = spec.play.apply(s, 'swerve');
      const r = spec.play.result(s);
      // Whenever the run says they had locked in, the outcome must be the "they stood firm" payoff (−1 after backing down).
      if (r.headline.includes('already locked in')) {
        locked += 1;
        assert.equal(r.stats[0].value, '-1', `seed ${seed}`);
      }
    }
    assert.ok(locked > 40, `expected about 20% of 400 runs to be locked in, got ${locked}`);
  });

  it('expected values follow from P(firm) = 0.2 + 0.8 × 0.1 = 0.28', () => {
    assert.ok(Math.abs(openFirmChance() - 0.28) < 1e-9);
    assert.ok(Math.abs(noReturnValue(true) - -1.2) < 1e-9);
    assert.ok(Math.abs(noReturnValue(false, 'swerve') - -0.28) < 1e-9);
    assert.ok(Math.abs(noReturnValue(false, 'straight') - -2.08) < 1e-9);
    assert.equal(spec.predict.solve!(), 'no');
    assert.equal(PRECOMMIT, 0.2);
  });

  it('locking in pays only below about an 11% chance of a prior lock-in, as the feedback says', () => {
    const best = (q: number) => Math.max(noReturnValue(false, 'swerve', q), noReturnValue(false, 'straight', q));
    assert.ok(noReturnValue(true, 'swerve', 0.1) > best(0.1));
    assert.ok(noReturnValue(true, 'swerve', 0.12) < best(0.12));
    assert.match(spec.predict.options.find((o) => o.id === 'depends')!.feedback, /11%/);
  });

  it('the rules no longer claim a flat 10% when the other side may be locked in', () => {
    assert.ok(spec.version >= 2);
    assert.ok(spec.rules.some((r) => /If they’ve locked in, they stand firm/.test(r)));
  });
});

describe('Audit · weak dominance example in Lesson 2', () => {
  // Rows T, M, B; columns L, R; (row, column) payoffs as quoted in the lesson's caution panel.
  const G: MatrixGame = {
    rows: ['T', 'M', 'B'],
    cols: ['L', 'R'],
    payoffs: [
      [[1, 1], [0, 0]],
      [[1, 1], [2, 1]],
      [[0, 0], [2, 1]],
    ],
  };
  const restrict = (rows: string[], cols: string[]): MatrixGame => ({
    rows,
    cols,
    payoffs: rows.map((r) => cols.map((c) => G.payoffs[G.rows.indexOf(r)][G.cols.indexOf(c)])),
  });

  it('deleting T first leaves the row player 2', () => {
    assert.ok(rowWeaklyDominatedBy(G, 'T', 'M'));
    const g1 = restrict(['M', 'B'], ['L', 'R']);
    assert.ok(colWeaklyDominatedBy(g1, 'L', 'R'));
    const left = restrict(['M', 'B'], ['R']);
    assert.deepEqual(left.payoffs.map((row) => row[0][0]), [2, 2]);
  });

  it('deleting B first leaves the row player 1', () => {
    assert.ok(rowWeaklyDominatedBy(G, 'B', 'M'));
    const g1 = restrict(['T', 'M'], ['L', 'R']);
    assert.ok(colWeaklyDominatedBy(g1, 'R', 'L'));
    const left = restrict(['T', 'M'], ['L']);
    assert.deepEqual(left.payoffs.map((row) => row[0][0]), [1, 1]);
  });

  it('the lesson panel quotes exactly this game', () => {
    const panel = curriculumSpec('iterated-dominance')!.concept.panels.find((p) => p.title === 'Weak dominance needs care')!;
    assert.match(panel.body, /T \(1, 1\) \(0, 0\), M \(1, 1\) \(2, 1\), B \(0, 0\) \(2, 1\)/);
  });
});

describe('Audit · finite vs infinite-horizon bargaining', () => {
  it('L11.B no longer says slight shrinkage removes the proposer’s advantage in this 3-round game', () => {
    const spec = getScenario('l11.b.alternating-offers')!;
    const text = spec.explain.join(' ');
    assert.doesNotMatch(text, /advantage of proposing first would almost disappear/);
    assert.match(text, /infinite-horizon/);
  });
});
