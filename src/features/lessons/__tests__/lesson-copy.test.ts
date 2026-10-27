/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MEETUP_GAME, friendPolicy, resolveMeetup } from '../../../game/coordination.ts';
import { BASE_PRICING_GAME, applyCutPenalty, evaluatePolicy, regimeFor, rivalPolicy, withDetection } from '../../../game/incentives.ts';
import { guaranteedPayoff, playSeries, strategySequence } from '../../../game/mixed-strategy.ts';
import { payoffAt, rowBestResponses } from '../../../game/payoff-matrix.ts';
import { bestGuessForPopulation, playRound } from '../../../game/two-thirds-game.ts';
import * as l1 from '../cooperation-trap/copy.ts';
import * as l2 from '../strategy-detective/copy.ts';
import * as l3 from '../coordination-problem/copy.ts';
import * as l4 from '../predictability-trap/copy.ts';
import * as l5 from '../incentive-shift/copy.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('Lesson 1 — feedback follows the learner and the table', () => {
  it('the prediction check compares with what Rohan actually did', () => {
    const rival = rivalPolicy(BASE_PRICING_GAME);
    assert.equal(l1.predictionCheck('cut', rival).verdict, 'match');
    assert.equal(l1.predictionCheck('maintain', rival).verdict, 'misconception');
    assert.match(l1.predictionCheck('maintain', rival).text, /expected Rohan to maintain/);
  });

  it('reason feedback quotes the real payoffs and grades each reason differently', () => {
    assert.equal(l1.reasonFeedback('either').verdict, 'match');
    assert.equal(l1.reasonFeedback('grab').verdict, 'defensible');
    assert.equal(l1.reasonFeedback('mutual').verdict, 'misconception');
    assert.equal(l1.reasonFeedback('mirror').verdict, 'misconception');
    // FoodKart: 10 vs 8 if QuickEats maintains, 5 vs 3 if it cuts.
    assert.match(l1.reasonFeedback('either').text, /10 instead of 8.*5 instead of 3/);
  });

  it('the promise feedback reflects the temptation in the table', () => {
    assert.equal(l1.promiseFeedback('cut').verdict, 'match');
    assert.equal(l1.promiseFeedback('maintain').verdict, 'depends');
    assert.match(l1.promiseFeedback('cut').text, /10 instead of 8/);
  });

  describe('penalty threshold', () => {
    const cases = [
      { p: 0, regime: 'cut-dominant' },
      { p: 1.5, regime: 'cut-dominant' },
      { p: 2, regime: 'tie' },
      { p: 2.5, regime: 'maintain-dominant' },
      { p: 5, regime: 'maintain-dominant' },
    ] as const;
    for (const { p, regime } of cases) {
      it(`p = ${p}: explanation, regime and best replies agree (${regime})`, () => {
        const ex = l1.penaltyExplanation(p);
        assert.equal(ex.regime, regime);
        assert.equal(regimeFor({ cutPenalty: p, maintainReward: 0 }), regime);
        const g = applyCutPenalty(p);
        for (const col of ['maintain', 'cut'] as const) {
          const br = rowBestResponses(g, col);
          if (regime === 'cut-dominant') assert.deepEqual(br, ['cut']);
          if (regime === 'tie') assert.deepEqual(br, ['maintain', 'cut']);
          if (regime === 'maintain-dominant') assert.deepEqual(br, ['maintain']);
          // Every number in the explanation comes from the adjusted table.
          const [keep, cut] = [payoffAt(g, 'maintain', col)[0], payoffAt(g, 'cut', col)[0]];
          assert.ok(ex.body.includes(`${keep} vs ${cut}`) || ex.body.includes(`${keep.toFixed(1)} vs ${cut.toFixed(1)}`), `${p}/${col}: ${ex.body}`);
        }
      });
    }

    it('below 2 says cutting still wins by 2 − p', () => {
      assert.match(l1.penaltyExplanation(1.5).body, /earns 0\.5 more/);
    });

    it('at exactly 2 the copy calls it a tie and makes no prediction', () => {
      const ex = l1.penaltyExplanation(2);
      assert.match(ex.title, /tie/);
      assert.match(ex.body, /can't say which way/);
      assert.equal(evaluatePolicy({ cutPenalty: 2, maintainReward: 0 }).predicted, null);
    });

    it('above 2 says maintaining wins by p − 2 and predicts both maintain', () => {
      assert.match(l1.penaltyExplanation(2.5).body, /earns 0\.5 more.*both maintain, 8 each/);
    });

    it('the penalty guess is graded against the threshold', () => {
      assert.equal(l1.penaltyGuessFeedback('over-two').verdict, 'match');
      assert.equal(l1.penaltyGuessFeedback('two').verdict, 'depends');
      assert.equal(l1.penaltyGuessFeedback('one').verdict, 'misconception');
      assert.equal(l1.penaltyGuessFeedback('five').verdict, 'defensible');
    });
  });

  it('the completion recap only states what the learner did', () => {
    const rival = rivalPolicy(BASE_PRICING_GAME);
    const recap = l1.cooperationRecap({ predicted: 'maintain', reason: 'mutual', choice: 'cut', rival, promise: null, penaltyGuess: 'over-two' });
    assert.ok(recap.some((r) => r.includes('You predicted Rohan would maintain') && r.includes('He chose to cut')));
    assert.ok(recap.some((r) => r.includes(`earned ${payoffAt(BASE_PRICING_GAME, 'cut', rival)[0]}`)));
    assert.ok(recap.some((r) => r.startsWith('Worth watching')));
    const mismatch = l1.cooperationRecap({ predicted: 'cut', reason: 'grab', choice: 'maintain', rival, promise: null, penaltyGuess: null });
    assert.ok(mismatch.some((r) => r.includes('You expected him to cut, yet chose to maintain') && r.includes('earned you 5')));
    assert.deepEqual(l1.cooperationRecap({ predicted: null, reason: null, choice: null, rival: null, promise: null, penaltyGuess: null }), []);
  });
});

describe('Lesson 2 — crowd predictions', () => {
  const POP = { level0: 4, level1: 3, level2: 2, level3: 1, equilibrium: 0 };

  it('buckets an average to the nearest prediction', () => {
    assert.equal(l2.nearestAverageGuess(48), 'random');
    assert.equal(l2.nearestAverageGuess(31), 'one-step');
    assert.equal(l2.nearestAverageGuess(21), 'two-step');
    assert.equal(l2.nearestAverageGuess(3), 'zero');
  });

  it('feedback compares the prediction with the other players only', () => {
    const r = playRound(90, POP, 11);
    const avg = l2.othersAverage(r);
    assert.ok(Math.abs(avg - (r.average * r.playerCount - 90) / (r.playerCount - 1)) < 1e-9);
    const right = l2.nearestAverageGuess(avg);
    assert.equal(l2.averagePredictionFeedback(right, r).verdict, 'match');
    const wrong = right === 'zero' ? 'random' : 'zero';
    assert.equal(l2.averagePredictionFeedback(wrong, r).verdict, 'misconception');
  });

  it('flags a pick that does not follow from the learner’s own forecast', () => {
    // Forecast ~33 for ten others implies a pick near 2 × 333 / 31 ≈ 21.
    assert.ok(Math.abs(l2.pickImpliedBy('one-step', 10) - (2 * 10 * 33.3) / 31) < 1e-9);
    assert.match(l2.averagePredictionFeedback('one-step', playRound(50, POP, 11)).text, /forecast pointed to a pick near 21, but you chose 50/);
    assert.doesNotMatch(l2.averagePredictionFeedback('one-step', playRound(22, POP, 11)).text, /One gap/);
  });

  it('the lab prediction is checked against the engine’s best picks', () => {
    assert.equal(bestGuessForPopulation(l2.ALL_THEORISTS, 21), 0);
    assert.ok(bestGuessForPopulation(POP, 21) > 0);
    assert.equal(l2.labPredictionFeedback('down', POP, 21).verdict, 'match');
    assert.equal(l2.labPredictionFeedback('same', POP, 21).verdict, 'misconception');
    assert.match(l2.labPredictionFeedback('up', POP, 21).text, /ten Theorists it is 0\.0/);
  });
});

describe('Lesson 3 — reading Nina', () => {
  const r1 = (you: 'cafe' | 'park') => resolveMeetup(you, friendPolicy({ kind: 'none' }));
  const r2 = (you: 'cafe' | 'park') => resolveMeetup(you, friendPolicy({ kind: 'focal', place: 'cafe' }));

  it('distinguishes a correct read, a read not acted on, and a miss', () => {
    assert.equal(l3.meetupFeedback(1, 'park', r1('park')).verdict, 'match');
    assert.equal(l3.meetupFeedback(1, 'park', r1('cafe')).verdict, 'defensible');
    assert.match(l3.meetupFeedback(1, 'park', r1('cafe')).text, /best move is simply wherever you expect her/);
    // Round 1: Nina's rule was hidden, so expecting the café and going there is a reasonable call, not a flaw.
    assert.equal(l3.meetupFeedback(1, 'cafe', r1('cafe')).verdict, 'reasonable');
    assert.equal(l3.meetupFeedback(2, 'cafe', r2('cafe')).verdict, 'match');
    assert.equal(l3.meetupFeedback(2, 'park', r2('park')).verdict, 'misconception');
  });

  it('the message explanation quotes both meetings from the unchanged table', () => {
    const text = l3.messageExplanation('cafe');
    const [a, b] = payoffAt(MEETUP_GAME, 'cafe', 'cafe');
    const [c, d] = payoffAt(MEETUP_GAME, 'park', 'park');
    assert.match(text, new RegExp(`You get ${a}, Nina gets ${b}`));
    assert.match(text, new RegExp(`given you ${c} and Nina ${d}`));
  });

  it('the recap notices when only the shared expectation changed', () => {
    const lines = l3.coordinationRecap({ predict1: 'cafe', r1: r1('cafe'), predict2: 'cafe', r2: r2('cafe'), message: null });
    assert.ok(lines.some((l) => l.includes('only thing that changed')));
  });
});

describe('Lesson 4 — predictions about patterns', () => {
  it('the comparison prediction is graded on the actual run', () => {
    const seed = 1;
    const results = (['repeat', 'alternate', 'random'] as const).map((id) => ({
      id,
      goals: playSeries(strategySequence(id, 40, seed + 1), 4242 + seed).goals,
    }));
    const top = results.reduce((a, b) => (b.goals > a.goals ? b : a));
    assert.equal(top.id, 'random', 'with the lesson’s seeds the coin-flipper scores most');
    assert.equal(l4.comparePredictionFeedback('random', results).verdict, 'match');
    assert.equal(l4.comparePredictionFeedback('alternate', results).verdict, 'misconception');
  });

  it('the lab prediction matches what a keeper who knows the mix allows', () => {
    assert.ok(Math.abs(guaranteedPayoff(l4.LAB_START_Q) - 0.2) < 1e-9);
    assert.equal(l4.labPredictionFeedback('low').verdict, 'match');
    assert.equal(l4.labPredictionFeedback('half').verdict, 'misconception');
    assert.match(l4.labPredictionFeedback('high').text, /dives left every time/);
  });
});

describe('Lesson 5 — incentive predictions', () => {
  it('a 1.5 reward narrows the gap without flipping the choice, and costs nothing', () => {
    const o = evaluatePolicy(l5.PROPOSAL);
    assert.deepEqual(o.predicted, { row: 'cut', col: 'cut' });
    assert.equal(o.rewardsPaid, 0);
    assert.equal(l5.proposalOutcome(), 'cut');
    assert.match(l5.proposalExplanation(), /from 2 to 0\.5 points.*earn 5 each.*pays out 0/);
    assert.equal(l5.proposalFeedback('cut').verdict, 'match');
    assert.equal(l5.proposalFeedback('maintain').verdict, 'misconception');
  });

  it('imperfect detection scales penalties but not rewards', () => {
    assert.deepEqual(withDetection({ cutPenalty: 4, maintainReward: 1 }, 0.5), { cutPenalty: 2, maintainReward: 1 });
    assert.deepEqual(withDetection({ cutPenalty: 4, maintainReward: 0 }, 2), { cutPenalty: 4, maintainReward: 0 });
    assert.deepEqual(withDetection({ cutPenalty: 4, maintainReward: 0 }, -1), { cutPenalty: 0, maintainReward: 0 });
  });

  it('the stress-test prediction depends on the learner’s own rule', () => {
    // p = 3 works when every cut is caught, but half-caught it acts like 1.5 < 2.
    assert.equal(l5.detectionHolds({ cutPenalty: 3, maintainReward: 0 }), false);
    assert.equal(l5.detectionFeedback('no', { cutPenalty: 3, maintainReward: 0 }).verdict, 'match');
    // p = 5 half-caught acts like 2.5 > 2. A reward alone needs no detection.
    assert.equal(l5.detectionHolds({ cutPenalty: 5, maintainReward: 0 }), true);
    assert.equal(l5.detectionHolds({ cutPenalty: 0, maintainReward: 3 }), true);
    // p = 4 half-caught is exactly 2: a tie, which is not "still keeps prices".
    assert.equal(l5.detectionHolds({ cutPenalty: 4, maintainReward: 0 }), false);
    assert.equal(l5.detectionFeedback('depends', { cutPenalty: 3, maintainReward: 0 }).verdict, 'depends');
  });
});

describe('Lesson structure', () => {
  const LESSONS = {
    'cooperation-trap': 'CooperationTrap.tsx',
    'strategy-detective': 'StrategyDetective.tsx',
    'coordination-problem': 'CoordinationProblem.tsx',
    'predictability-trap': 'PredictabilityTrap.tsx',
    'incentive-shift': 'IncentiveShift.tsx',
  };
  const read = (id: string, f: string) => readFileSync(path.join(ROOT, 'src/features/lessons', id, f), 'utf8').replace(/\r\n/g, '\n');

  it('every lesson declares as many steps as it renders (plus its three paired scenarios), and Lesson 1 keeps 12 core steps', () => {
    for (const [id, f] of Object.entries(LESSONS)) {
      const src = read(id, f);
      const total = Number(/const TOTAL = (\d+);/.exec(src)?.[1]);
      const keys = src.match(/^ {6}key: '[a-z0-9-]+',$/gm) ?? [];
      const scenarios = src.includes('...pairedScenarioSteps(lesson.id, scenarioDone),') ? 3 : 0;
      assert.equal(scenarios, 3, `${id}: paired scenarios are part of the lesson`);
      assert.equal(keys.length + scenarios, total, `${id}: ${keys.length} step keys + ${scenarios} scenarios vs TOTAL ${total}`);
      assert.equal(new Set(keys).size, keys.length, `${id}: duplicate step keys`);
    }
    assert.equal(Number(/const TOTAL = (\d+);/.exec(read('cooperation-trap', LESSONS['cooperation-trap']))?.[1]), 12 + 3);
  });

  it('each transfer question has exactly one strongest answer', () => {
    for (const [id, f] of Object.entries(LESSONS)) {
      const block = /const TRANSFER: TransferOption\[\] = \[([\s\S]*?)\n\];/.exec(read(id, f))?.[1] ?? '';
      assert.equal((block.match(/verdict: 'strong'/g) ?? []).length, 1, id);
      assert.ok((block.match(/verdict: '(defensible|misconception)'/g) ?? []).length >= 2, `${id}: needs real alternatives`);
    }
  });

  it('transfer prompts do not name the concept before the learner answers', () => {
    const banned: Record<string, RegExp> = {
      'cooperation-trap': /prisoner|dominant/i,
      'strategy-detective': /level-k|steps? ahead|two-thirds/i,
      'coordination-problem': /focal|equilibri|convention/i,
      'predictability-trap': /mixed strategy|random|50\/50/i,
      'incentive-shift': /incentive|payoff/i,
    };
    for (const [id, f] of Object.entries(LESSONS)) {
      const src = read(id, f);
      const start = src.indexOf(`kicker="New situation"`);
      const prompt = src.slice(start, src.indexOf('options={TRANSFER}', start));
      assert.ok(start > 0 && prompt.length > 0, id);
      assert.doesNotMatch(prompt, banned[id], `${id} transfer prompt gives the concept away`);
    }
  });
});
