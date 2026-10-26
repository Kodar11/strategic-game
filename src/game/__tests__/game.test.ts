/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BASE_PRICING_GAME,
  applyCutPenalty,
  applyRules,
  evaluatePolicy,
  regimeFor,
  rivalPolicy,
  withDetection,
} from '../incentives.ts';
import {
  colBestResponses,
  colDominance,
  payoffAt,
  pureNashEquilibria,
  rowBestResponses,
  rowDominance,
} from '../payoff-matrix.ts';
import {
  EMPTY_POPULATION,
  bestGuess,
  bestGuessForPopulation,
  eliminationBound,
  opponentPicks,
  playRound,
  sanitizeGuess,
  shiftPopulation,
  targetFor,
} from '../two-thirds-game.ts';
import { MEETUP_GAME, friendPolicy, meetupAnalysis, resolveMeetup } from '../coordination.ts';
import {
  expectedPayoff,
  guaranteedPayoff,
  keeperRead,
  playSeries,
  simulateMix,
  strategySequence,
} from '../mixed-strategy.ts';
import { createRng } from '../rng.ts';

describe('Lesson 1 — pricing game', () => {
  it('has the exact payoffs for all four combinations', () => {
    assert.deepEqual(payoffAt(BASE_PRICING_GAME, 'maintain', 'maintain'), [8, 8]);
    assert.deepEqual(payoffAt(BASE_PRICING_GAME, 'maintain', 'cut'), [3, 10]);
    assert.deepEqual(payoffAt(BASE_PRICING_GAME, 'cut', 'maintain'), [10, 3]);
    assert.deepEqual(payoffAt(BASE_PRICING_GAME, 'cut', 'cut'), [5, 5]);
  });

  it('cutting is strictly dominant for both companies', () => {
    assert.deepEqual(rowDominance(BASE_PRICING_GAME), { kind: 'strict', action: 'cut' });
    assert.deepEqual(colDominance(BASE_PRICING_GAME), { kind: 'strict', action: 'cut' });
    assert.deepEqual(rowBestResponses(BASE_PRICING_GAME, 'maintain'), ['cut']);
    assert.deepEqual(colBestResponses(BASE_PRICING_GAME, 'cut'), ['cut']);
    assert.deepEqual(pureNashEquilibria(BASE_PRICING_GAME), [{ row: 'cut', col: 'cut' }]);
    assert.equal(rivalPolicy(), 'cut');
  });

  it('subtracts the penalty only from companies that cut', () => {
    const g = applyCutPenalty(3);
    assert.deepEqual(payoffAt(g, 'maintain', 'maintain'), [8, 8]);
    assert.deepEqual(payoffAt(g, 'maintain', 'cut'), [3, 7]);
    assert.deepEqual(payoffAt(g, 'cut', 'maintain'), [7, 3]);
    assert.deepEqual(payoffAt(g, 'cut', 'cut'), [2, 2]);
  });

  it('penalty below 2 keeps cutting strictly dominant', () => {
    for (const p of [0, 0.5, 1, 1.5, 1.99]) {
      assert.equal(regimeFor({ cutPenalty: p, maintainReward: 0 }), 'cut-dominant', `p=${p}`);
      assert.deepEqual(rowDominance(applyCutPenalty(p)), { kind: 'strict', action: 'cut' });
    }
  });

  it('penalty of exactly 2 makes the choices tie', () => {
    const g = applyCutPenalty(2);
    assert.equal(regimeFor({ cutPenalty: 2, maintainReward: 0 }), 'tie');
    assert.deepEqual(rowBestResponses(g, 'maintain'), ['maintain', 'cut']);
    assert.deepEqual(rowBestResponses(g, 'cut'), ['maintain', 'cut']);
    assert.equal(rowDominance(g).kind, 'none');
    assert.equal(pureNashEquilibria(g).length, 4);
    assert.equal(evaluatePolicy({ cutPenalty: 2, maintainReward: 0 }).predicted, null);
  });

  it('penalty above 2 makes maintaining strictly dominant', () => {
    for (const p of [2.01, 2.5, 3, 5]) {
      assert.equal(regimeFor({ cutPenalty: p, maintainReward: 0 }), 'maintain-dominant', `p=${p}`);
      assert.deepEqual(pureNashEquilibria(applyCutPenalty(p)), [{ row: 'maintain', col: 'maintain' }]);
    }
    assert.equal(rivalPolicy(applyCutPenalty(3)), 'maintain');
  });

  it('clamps out-of-range penalties', () => {
    assert.deepEqual(payoffAt(applyCutPenalty(-4), 'cut', 'cut'), [5, 5]);
    assert.deepEqual(payoffAt(applyCutPenalty(99), 'cut', 'cut'), [0, 0]);
  });
});

describe('Lesson 5 — incentive design', () => {
  it('reward for maintaining shifts the same threshold', () => {
    assert.equal(regimeFor({ cutPenalty: 1, maintainReward: 0.5 }), 'cut-dominant');
    assert.equal(regimeFor({ cutPenalty: 1, maintainReward: 1 }), 'tie');
    assert.equal(regimeFor({ cutPenalty: 1, maintainReward: 1.5 }), 'maintain-dominant');
  });

  it('only changes payoffs the rule touches', () => {
    const g = applyRules({ cutPenalty: 0, maintainReward: 3 });
    assert.deepEqual(payoffAt(g, 'cut', 'cut'), [5, 5]);
    assert.deepEqual(payoffAt(g, 'maintain', 'cut'), [6, 10]);
    assert.deepEqual(payoffAt(g, 'maintain', 'maintain'), [11, 11]);
  });

  it('imperfect detection makes a penalty act like a smaller one', () => {
    // p = 3 caught half the time behaves like p = 1.5: cutting stays dominant.
    assert.equal(regimeFor(withDetection({ cutPenalty: 3, maintainReward: 0 }, 0.5)), 'cut-dominant');
    assert.equal(regimeFor(withDetection({ cutPenalty: 4, maintainReward: 0 }, 0.5)), 'tie');
    assert.equal(regimeFor(withDetection({ cutPenalty: 5, maintainReward: 0 }, 0.5)), 'maintain-dominant');
    assert.equal(regimeFor(withDetection({ cutPenalty: 0, maintainReward: 2.5 }, 0)), 'maintain-dominant');
    assert.deepEqual(withDetection({ cutPenalty: 3, maintainReward: 0 }, 1), { cutPenalty: 3, maintainReward: 0 });
  });

  it('accounts for money collected and paid at the predicted outcome', () => {
    const fine = evaluatePolicy({ cutPenalty: 3, maintainReward: 0 });
    assert.deepEqual(fine.predicted, { row: 'maintain', col: 'maintain' });
    assert.equal(fine.penaltiesCollected, 0);
    assert.equal(fine.rewardsPaid, 0);

    const weakFine = evaluatePolicy({ cutPenalty: 1, maintainReward: 0 });
    assert.deepEqual(weakFine.predicted, { row: 'cut', col: 'cut' });
    assert.deepEqual(weakFine.companyPayoffs, [4, 4]);
    assert.equal(weakFine.penaltiesCollected, 2);

    const subsidy = evaluatePolicy({ cutPenalty: 0, maintainReward: 3 });
    assert.deepEqual(subsidy.predicted, { row: 'maintain', col: 'maintain' });
    assert.equal(subsidy.rewardsPaid, 6);
  });
});

describe('Lesson 2 — two-thirds game', () => {
  it('computes average and target', () => {
    assert.deepEqual(targetFor([60, 60, 60]), { average: 60, target: 40 });
    const { target } = targetFor([0, 100]);
    assert.ok(Math.abs(target - 100 / 3) < 1e-9);
  });

  it('includes the learner in the average and finds the winner', () => {
    const pop = { ...EMPTY_POPULATION, equilibrium: 2 };
    const r = playRound(30, pop, 1);
    assert.equal(r.playerCount, 3);
    assert.equal(r.average, 10);
    assert.ok(Math.abs(r.target - 20 / 3) < 1e-9);
    // 0s are 6.67 away, 30 is 23.3 away → bots win, learner ranked 3rd.
    assert.equal(r.winners.length, 2);
    assert.equal(r.learner.isWinner, false);
    assert.equal(r.learnerRank, 3);
  });

  it('shares the win on exact ties', () => {
    const r = playRound(0, { ...EMPTY_POPULATION, equilibrium: 3 }, 1);
    assert.equal(r.winners.length, 4);
    assert.equal(r.learnerRank, 1);
  });

  it('is deterministic for a seed', () => {
    const pop = { ...EMPTY_POPULATION, level0: 5, level1: 3 };
    assert.deepEqual(opponentPicks(pop, 42), opponentPicks(pop, 42));
    assert.notDeepEqual(opponentPicks(pop, 42), opponentPicks(pop, 43));
  });

  it('best guess lands exactly on the target', () => {
    const pop = { ...EMPTY_POPULATION, level0: 4, level1: 4, level2: 2 };
    const g = bestGuessForPopulation(pop, 7);
    const others = opponentPicks(pop, 7).map((p) => p.guess);
    const { target } = targetFor([...others, g]);
    assert.ok(Math.abs(target - g) < 1e-9);
    assert.equal(bestGuess(0, 5), 0);
    assert.equal(bestGuess(500, 0), 0);
  });

  it('shifts population one level deeper', () => {
    assert.deepEqual(shiftPopulation({ level0: 4, level1: 3, level2: 2, level3: 1, equilibrium: 1 }), {
      level0: 0,
      level1: 4,
      level2: 3,
      level3: 2,
      equilibrium: 2,
    });
  });

  it('validates guesses and elimination bound', () => {
    assert.equal(sanitizeGuess(-5), 0);
    assert.equal(sanitizeGuess(140), 100);
    assert.equal(sanitizeGuess(33.6), 34);
    assert.ok(Math.abs(eliminationBound(1) - 66.6667) < 1e-3);
    assert.ok(eliminationBound(20) < 0.1);
  });
});

describe('Lesson 3 — coordination', () => {
  it('meeting outcomes and misses', () => {
    assert.deepEqual(resolveMeetup('cafe', 'cafe').payoffs, [8, 7]);
    assert.deepEqual(resolveMeetup('park', 'park').payoffs, [6, 8]);
    assert.equal(resolveMeetup('cafe', 'park').met, false);
    assert.deepEqual(resolveMeetup('park', 'cafe').payoffs, [0, 0]);
  });

  it('has two equilibria and no dominant strategy', () => {
    const a = meetupAnalysis();
    assert.deepEqual(a.equilibria, [
      { row: 'cafe', col: 'cafe' },
      { row: 'park', col: 'park' },
    ]);
    assert.equal(a.rowDominance.kind, 'none');
    assert.equal(a.colDominance.kind, 'none');
  });

  it('friend policy follows the stated rules', () => {
    assert.equal(friendPolicy({ kind: 'none' }, MEETUP_GAME), 'park');
    assert.equal(friendPolicy({ kind: 'focal', place: 'cafe' }), 'cafe');
    assert.equal(friendPolicy({ kind: 'message', proposed: 'cafe' }), 'cafe');
  });
});

describe('Lesson 4 — mixed strategies', () => {
  it('pure strategies against pure dives', () => {
    assert.equal(expectedPayoff(1, 1), 0);
    assert.equal(expectedPayoff(1, 0), 1);
    assert.equal(expectedPayoff(0, 0), 0);
  });

  it('50/50 makes the payoff independent of the keeper', () => {
    assert.equal(expectedPayoff(0.5, 0), 0.5);
    assert.equal(expectedPayoff(0.5, 1), 0.5);
    assert.equal(expectedPayoff(0.5, 0.3), 0.5);
    assert.equal(guaranteedPayoff(0.5), 0.5);
    assert.ok(guaranteedPayoff(0.7) < 0.5);
    assert.ok(Math.abs(guaranteedPayoff(0.7) - 0.3) < 1e-9);
  });

  it('keeper reads repeating and alternating habits from past shots only', () => {
    const coin = createRng(1);
    assert.deepEqual(keeperRead(['L', 'L', 'L', 'L'], coin), { dive: 'L', reason: 'repeat-habit' });
    assert.deepEqual(keeperRead(['L', 'R', 'L', 'R'], coin), { dive: 'L', reason: 'switch-habit' });
    assert.equal(keeperRead([], coin).reason, 'coin');
  });

  it('predictable strategies score less than random against the adaptive keeper', () => {
    const n = 40;
    const repeat = playSeries(strategySequence('repeat', n, 1), 99);
    const alternate = playSeries(strategySequence('alternate', n, 1), 99);
    const random = playSeries(strategySequence('random', n, 5), 99);
    assert.ok(repeat.rate < 0.2, `repeat ${repeat.rate}`);
    assert.ok(alternate.rate < 0.2, `alternate ${alternate.rate}`);
    assert.ok(random.rate > repeat.rate && random.rate > alternate.rate, `random ${random.rate}`);
  });

  it('mix simulation is reproducible and observed differs from expected', () => {
    const a = simulateMix(0.5, 30, 3);
    const b = simulateMix(0.5, 30, 3);
    assert.deepEqual(a, b);
    assert.equal(a.expected, 0.5);
    assert.equal(a.running.length, 30);
    assert.equal(simulateMix(1, 20, 3).observed, 0);
  });
});
