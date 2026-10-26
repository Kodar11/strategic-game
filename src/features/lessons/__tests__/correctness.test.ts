/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chooseAnswer, emptyPrediction, lockPrediction, rateConfidence } from '../../../components/lesson/prediction-state.ts';
import { MEETUP_GAME, meetupAnalysis } from '../../../game/coordination.ts';
import { BASE_PRICING_GAME, type IncentiveRules, PENALTY_RANGE, REWARD_RANGE, regimeFor, withDetection } from '../../../game/incentives.ts';
import { playSeries } from '../../../game/mixed-strategy.ts';
import { mixedEquilibrium2x2, payoffAt } from '../../../game/payoff-matrix.ts';
import { bestGuessForPopulation, opponentPicks, playRound } from '../../../game/two-thirds-game.ts';
import * as l1 from '../cooperation-trap/copy.ts';
import * as l2 from '../strategy-detective/copy.ts';
import * as l3 from '../coordination-problem/copy.ts';
import * as l4 from '../predictability-trap/copy.ts';
import * as l5 from '../incentive-shift/copy.ts';

const grid = (r: { min: number; max: number; step: number }) =>
  Array.from({ length: Math.round((r.max - r.min) / r.step) + 1 }, (_, i) => r.min + i * r.step);

// ── Lesson 5 ─────────────────────────────────────────────────────────────────

describe('Lesson 5 — the stress test agrees with the engine at, below and above the threshold', () => {
  const at = (rules: IncentiveRules, d: number) => regimeFor(withDetection(rules, d));

  it('d·p + r against 2 decides the regime, with equality as its own case', () => {
    // 50% detected: p = 3 → 1.5 (below), p = 4 → 2 (exactly), p = 5 → 2.5 (above).
    assert.equal(at({ cutPenalty: 3, maintainReward: 0 }, 0.5), 'cut-dominant');
    assert.equal(at({ cutPenalty: 4, maintainReward: 0 }, 0.5), 'tie');
    assert.equal(at({ cutPenalty: 3, maintainReward: 0.5 }, 0.5), 'tie');
    assert.equal(at({ cutPenalty: 5, maintainReward: 0 }, 0.5), 'maintain-dominant');
    // 0% detected: only the reward counts.
    assert.equal(at({ cutPenalty: 5, maintainReward: 1.5 }, 0), 'cut-dominant');
    assert.equal(at({ cutPenalty: 5, maintainReward: 2 }, 0), 'tie');
    assert.equal(at({ cutPenalty: 5, maintainReward: 2.5 }, 0), 'maintain-dominant');
    // 100% detected: the penalty counts in full.
    assert.equal(at({ cutPenalty: 1.5, maintainReward: 0 }, 1), 'cut-dominant');
    assert.equal(at({ cutPenalty: 2, maintainReward: 0 }, 1), 'tie');
    assert.equal(at({ cutPenalty: 2.5, maintainReward: 0 }, 1), 'maintain-dominant');
    // Range extremes.
    assert.equal(at({ cutPenalty: PENALTY_RANGE.min, maintainReward: REWARD_RANGE.min }, 1), 'cut-dominant');
    assert.equal(at({ cutPenalty: PENALTY_RANGE.max, maintainReward: REWARD_RANGE.max }, 0), 'maintain-dominant');
    // The slider sends whole percentages; 50 → 0.5 is the stress-test rate.
    assert.equal(l5.HALF_DETECTED, 50 / 100);
  });

  it('for every rule on the slider grid, the model answer, its grading and its wording agree', () => {
    for (const p of grid(PENALTY_RANGE)) {
      for (const r of grid(REWARD_RANGE)) {
        const rules = { cutPenalty: p, maintainReward: r };
        const regime = l5.detectionRegime(rules);
        const truth = l5.detectionOutcome(rules);
        assert.equal(truth, regime === 'maintain-dominant' ? 'yes' : regime === 'cut-dominant' ? 'no' : 'depends', `${p}/${r}`);
        assert.equal(l5.detectionHolds(rules), regime === 'maintain-dominant');
        const fb = l5.detectionFeedback(truth, rules);
        assert.equal(fb.verdict, 'match', `${p}/${r}`);
        for (const pick of ['yes', 'no', 'depends'] as const) {
          const text = l5.detectionFeedback(pick, rules).text;
          if (regime === 'tie') {
            assert.doesNotMatch(text, /Above zero|Still below zero/, `${p}/${r}/${pick}: a tie is neither`);
            assert.match(text, /= 0\. Exactly zero/, `${p}/${r}/${pick}`);
          }
          if (regime === 'cut-dominant') assert.match(text, /Above zero, so cutting pays again/);
          if (regime === 'maintain-dominant') assert.match(text, /Still below zero, so maintaining still wins/);
          if (pick !== truth) assert.notEqual(l5.detectionFeedback(pick, rules).verdict, 'match', `${p}/${r}/${pick}`);
        }
      }
    }
  });

  it('grades the tie honestly: "can’t tell" matches, "price war returns" is close, "still keeps prices" is not', () => {
    const tie = { cutPenalty: 4, maintainReward: 0 };
    assert.equal(l5.detectionFeedback('depends', tie).verdict, 'match');
    assert.equal(l5.detectionFeedback('no', tie).verdict, 'defensible');
    assert.equal(l5.detectionFeedback('yes', tie).verdict, 'misconception');
  });

  it('the recap agrees with the grading in all three cases', () => {
    const cases = [
      { rules: { cutPenalty: 3, maintainReward: 0 }, truth: 'no' },
      { rules: { cutPenalty: 4, maintainReward: 0 }, truth: 'depends' },
      { rules: { cutPenalty: 5, maintainReward: 0 }, truth: 'yes' },
    ] as const;
    for (const { rules, truth } of cases) {
      const right = l5.incentiveRecap({ proposalPick: null, rules, detectionPick: truth });
      assert.ok(right.some((l) => l.includes('You predicted correctly')), JSON.stringify(rules));
      const wrong = l5.incentiveRecap({ proposalPick: null, rules, detectionPick: truth === 'yes' ? 'no' : 'yes' });
      assert.ok(wrong.some((l) => l.includes('differently from what you predicted')), JSON.stringify(rules));
    }
  });
});

describe('Lesson 5 — sandbox rules are always judged on their current values', () => {
  type State = { penalty: number; reward: number } & typeof l5.ENFORCEMENT_RESET;
  const start: State = { penalty: 0, reward: 0, ...l5.ENFORCEMENT_RESET };
  const apply = (s: State, patch: Partial<{ penalty: number; reward: number }>): State => ({ ...s, ...l5.changeRules(s, patch) });
  const rulesOf = (s: State) => ({ cutPenalty: s.penalty, maintainReward: s.reward });
  const lockedDetection = lockPrediction(rateConfidence(chooseAnswer(emptyPrediction<'yes' | 'no' | 'depends'>(), 'yes'), 4));

  it('finding, breaking, resetting and re-finding a rule keeps progression and recap in step', () => {
    // 1. Find a configuration that works, then make a stress-test prediction for it.
    let s = apply(start, { penalty: 3 });
    assert.equal(l5.ruleWorks(rulesOf(s)), true);
    s = { ...s, detectionPrediction: lockedDetection, detection: 40, detectionTouched: true };
    assert.ok(l5.incentiveRecap({ proposalPick: null, rules: rulesOf(s), detectionPick: 'yes' }).some((l) => l.startsWith('Your final rules: penalty 3')));

    // 2. Change a parameter so the rule no longer holds: progression is blocked and the stress test is cleared.
    s = apply(s, { penalty: 1 });
    assert.equal(l5.ruleWorks(rulesOf(s)), false, 'Continue must be blocked');
    assert.deepEqual(s.detectionPrediction, emptyPrediction());
    assert.equal(s.detectionTouched, false);
    assert.equal(s.detection, 100);

    // 3 & 4. Back to the starting rules: nothing claims a working rule.
    s = apply(s, { penalty: 0, reward: 0 });
    assert.equal(l5.ruleWorks(rulesOf(s)), false);
    const recap = l5.incentiveRecap({ proposalPick: 'cut', rules: rulesOf(s), detectionPick: null });
    assert.ok(!recap.some((l) => /final rules|relies on|mixes both/.test(l)), recap.join(' | '));

    // 5. Find a valid configuration again.
    s = apply(s, { reward: 2.5 });
    assert.equal(l5.ruleWorks(rulesOf(s)), true);
    assert.ok(l5.incentiveRecap({ proposalPick: null, rules: rulesOf(s), detectionPick: null }).some((l) => l.includes('relies on a reward')));
  });

  it('exactly on the line (p + r = 2) does not count as a working rule', () => {
    assert.equal(l5.ruleWorks({ cutPenalty: 2, maintainReward: 0 }), false);
    assert.equal(l5.ruleWorks({ cutPenalty: 1, maintainReward: 1 }), false);
    assert.equal(l5.ruleWorks({ cutPenalty: 1.5, maintainReward: 1 }), true);
  });

  it('a no-op change keeps the stress test; out-of-range values are clamped', () => {
    const s: State = { penalty: 3, reward: 0, ...l5.ENFORCEMENT_RESET, detectionPrediction: lockedDetection, detectionTouched: true };
    const same = l5.changeRules(s, { penalty: 3 });
    assert.equal('detectionPrediction' in same, false);
    assert.deepEqual(l5.changeRules(s, { penalty: 99, reward: -1 }).penalty, PENALTY_RANGE.max);
    assert.deepEqual(l5.changeRules(s, { penalty: 99, reward: -1 }).reward, REWARD_RANGE.min);
  });

  it('the recap names the lever the rule actually relies on', () => {
    assert.equal(l5.leverMix({ cutPenalty: 3, maintainReward: 0 }), 'penalty');
    assert.equal(l5.leverMix({ cutPenalty: 0, maintainReward: 3 }), 'reward');
    assert.equal(l5.leverMix({ cutPenalty: 3, maintainReward: 0.5 }), 'both');
  });
});

// ── Lesson 4 ─────────────────────────────────────────────────────────────────

describe('Lesson 4 — the mix lab reveals nothing before its simulation', () => {
  const drafted = (lab: l4.MixLabState): l4.MixLabState => ({
    ...lab,
    labPrediction: rateConfidence(chooseAnswer(lab.labPrediction, 'high'), 2),
  });

  it('predict → experiment → review, with feedback only in review', () => {
    let lab: l4.MixLabState = { ...l4.MIX_LAB_RESET };
    assert.equal(l4.mixLabPhase(lab), 'predict');
    lab = drafted(lab);
    assert.equal(l4.mixLabFeedback(lab), null, 'choosing an answer reveals nothing');
    assert.deepEqual(l4.simulateMixRun(lab), {}, 'cannot simulate before locking');

    lab = { ...lab, labPrediction: lockPrediction(lab.labPrediction) };
    assert.equal(l4.mixLabPhase(lab), 'experiment');
    assert.equal(l4.mixLabFeedback(lab), null, 'locking reveals nothing');

    lab = { ...lab, q: 0.35 }; // slider works before the reveal
    assert.equal(l4.mixLabPhase(lab), 'experiment');
    assert.equal(l4.mixLabFeedback(lab), null);

    lab = { ...lab, ...l4.simulateMixRun(lab) };
    assert.equal(lab.simSeed, 1);
    assert.equal(l4.mixLabPhase(lab), 'review');
    const fb = l4.mixLabFeedback(lab);
    assert.ok(fb);
    assert.equal(fb.verdict, 'misconception');
    assert.match(fb.text, /0\.20 goals a shot/, 'feedback is about the 80% mix that was predicted, whatever the slider shows');

    lab = { ...lab, ...l4.simulateMixRun(lab) };
    assert.equal(lab.simSeed, 2, 'simulating again uses a new run');
  });

  it('starting over returns to the initial lab and does not leak the previous answer', () => {
    const reviewed: l4.MixLabState = { labPrediction: lockPrediction(drafted(l4.MIX_LAB_RESET).labPrediction), q: 0.5, simSeed: 3 };
    assert.equal(l4.mixLabPhase(reviewed), 'review');
    const again: l4.MixLabState = { ...reviewed, ...l4.MIX_LAB_RESET };
    assert.deepEqual(again, { labPrediction: emptyPrediction(), q: l4.LAB_START_Q, simSeed: null });
    assert.equal(l4.mixLabPhase(again), 'predict');
    assert.equal(l4.mixLabFeedback(again), null);
  });

  it('the comparison only runs once its prediction is complete, and reruns keep the prediction', () => {
    const draft = chooseAnswer(emptyPrediction<'repeat' | 'alternate' | 'random'>(), 'random');
    assert.deepEqual(l4.runComparison({ comparePrediction: draft, compareSeed: null }), {});
    const first = l4.runComparison({ comparePrediction: rateConfidence(draft, 3), compareSeed: null });
    assert.equal(first.compareSeed, 1);
    assert.equal(first.comparePrediction?.locked, true);
    const rerun = l4.runComparison({ comparePrediction: first.comparePrediction!, compareSeed: 1 });
    assert.equal(rerun.compareSeed, 2);
    assert.equal(rerun.comparePrediction, first.comparePrediction);
  });

  it('Maya reads "always left" after two shots, as the copy now says', () => {
    const { shots } = playSeries(['L', 'L', 'L', 'L'], 1);
    assert.deepEqual(shots[2], { shot: 'L', dive: 'L', reason: 'favourite-side', scored: false });
    assert.ok(shots.slice(2).every((s) => s.dive === 'L'));
    const fb = l4.comparePredictionFeedback('repeat', [
      { id: 'repeat', goals: 0 },
      { id: 'random', goals: 20 },
    ]);
    assert.match(fb.text, /two shots of history/);
  });
});

// ── Lesson 2 ─────────────────────────────────────────────────────────────────

describe('Lesson 2 — the crowd lab is the crowd the learner played', () => {
  it('uses round 1’s population and seed, so its numbers match round 1', () => {
    assert.equal(l2.LAB_SEED, l2.ROUND1_SEED);
    const round1 = playRound(50, l2.ROUND1_POP, l2.ROUND1_SEED);
    const labCrowd = opponentPicks(l2.ROUND1_POP, l2.LAB_SEED).map((p) => p.guess);
    assert.deepEqual(labCrowd, round1.picks.filter((p) => p.type !== 'you').map((p) => p.guess));
    const best = bestGuessForPopulation(l2.ROUND1_POP, l2.ROUND1_SEED);
    assert.ok(Math.abs(best - 24.72) < 0.01, String(best));
    assert.match(l2.labPredictionFeedback('down').text, new RegExp(`round-1 mix the best pick is ${best.toFixed(1)}`));
    assert.doesNotMatch(l2.labPredictionFeedback('down').text, /20\.2/);
  });

  it('only a real change of crowd counts as running the experiment', () => {
    assert.equal(l2.populationChanged(l2.ROUND1_POP, { ...l2.ROUND1_POP }), false);
    assert.equal(l2.populationChanged(l2.ROUND1_POP, l2.ALL_THEORISTS), true);
  });
});

// ── Lesson 3 ─────────────────────────────────────────────────────────────────

describe('Lesson 3 — equilibria are counted precisely', () => {
  it('finds two pure-strategy equilibria and one mixed equilibrium', () => {
    const a = meetupAnalysis();
    assert.equal(a.equilibria.length, 2);
    assert.ok(a.mixed);
    assert.ok(Math.abs(a.mixed.rowFirst - 8 / 15) < 1e-9);
    assert.ok(Math.abs(a.mixed.colFirst - 3 / 7) < 1e-9);
    // At the mix, each player is indifferent between the café and the park.
    const y = a.mixed.colFirst;
    const x = a.mixed.rowFirst;
    const you = (p: 'cafe' | 'park') => y * payoffAt(MEETUP_GAME, p, 'cafe')[0] + (1 - y) * payoffAt(MEETUP_GAME, p, 'park')[0];
    const nina = (p: 'cafe' | 'park') => x * payoffAt(MEETUP_GAME, 'cafe', p)[1] + (1 - x) * payoffAt(MEETUP_GAME, 'park', p)[1];
    assert.ok(Math.abs(you('cafe') - you('park')) < 1e-9);
    assert.ok(Math.abs(nina('cafe') - nina('park')) < 1e-9);
    assert.ok(Math.abs(a.mixed.payoffs[0] - 24 / 7) < 1e-9);
    assert.ok(Math.abs(a.mixed.payoffs[1] - 56 / 15) < 1e-9);
    assert.ok(Math.abs(a.mixed.meetChance - 52 / 105) < 1e-9);
  });

  it('a game with a dominant strategy has no fully mixed equilibrium', () => {
    assert.equal(mixedEquilibrium2x2(BASE_PRICING_GAME), null);
  });

  it('the on-screen wording says "pure-strategy" and quotes the mixed equilibrium from the engine', () => {
    const s = l3.equilibriumSummary();
    assert.equal(s.title, 'Two pure-strategy equilibria, no dominant strategy');
    assert.ok(s.mixedNote);
    assert.match(s.mixedNote, /Clocktower Café 53% of the time and Nina 43%/);
    assert.match(s.mixedNote, /about 50% of the time, expecting 3\.4 and 3\.7/);
  });
});

// ── Lesson 1 ─────────────────────────────────────────────────────────────────

describe('Lesson 1 — the recap judges follow-through against the learner’s own prediction', () => {
  const base = { reason: null, promise: null, penaltyGuess: null } as const;

  it('flags a choice that was not a best reply to the expected move, whoever Rohan turned out to be', () => {
    const same = l1.cooperationRecap({ ...base, predicted: 'maintain', choice: 'maintain', rival: 'cut' });
    assert.ok(same.some((l) => l === 'You expected him to maintain, and chose to maintain. Against that move, choosing to cut would have earned you 10 instead of 8.'));
    // A hypothetical rival who maintains: the old line would have said copying him "would have earned" more.
    const hypo = l1.cooperationRecap({ ...base, predicted: 'maintain', choice: 'cut', rival: 'maintain' });
    assert.ok(!hypo.some((l) => l.includes('would have earned')), hypo.join(' | '));
  });

  it('says nothing about follow-through when the choice was the best reply to the prediction', () => {
    for (const predicted of ['maintain', 'cut'] as const) {
      const lines = l1.cooperationRecap({ ...base, predicted, choice: 'cut', rival: 'cut' });
      assert.ok(!lines.some((l) => l.includes('would have earned')), predicted);
    }
  });
});
