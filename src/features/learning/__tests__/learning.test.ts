/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Confidence, chooseAnswer, emptyPrediction, lockPrediction, rateConfidence } from '../../../components/lesson/prediction-state.ts';
import { allLessons } from '../../../content/lessons.ts';
import * as l1 from '../../lessons/cooperation-trap/copy.ts';
import * as l2 from '../../lessons/strategy-detective/copy.ts';
import * as l3 from '../../lessons/coordination-problem/copy.ts';
import * as l4 from '../../lessons/predictability-trap/copy.ts';
import * as l5 from '../../lessons/incentive-shift/copy.ts';
import { buildProfile, latestAttempts } from '../profile.ts';
import {
  EXPORT_FORMAT,
  type Evaluation,
  type LearningAttempt,
  MAX_ATTEMPTS,
  predictionMeta,
  type PredictionKey,
  buildLearningExport,
  evaluationFromVerdict,
  exportFileName,
  mergeAttempts,
  recordAttempt,
  sanitizeAttempts,
  sanitizeGoal,
} from '../records.ts';
import { installSeedCatalog } from '../../../content/seed.ts';

installSeedCatalog();

const locked = <T extends string>(answer: T, confidence: Confidence, at: number) =>
  lockPrediction(rateConfidence(chooseAnswer(emptyPrediction<T>(), answer), confidence), at);

/** A hand-made record for profile tests. */
function rec(prediction: PredictionKey, evaluation: Evaluation, confidence: Confidence, at: number, attempt = 1): LearningAttempt {
  const meta = predictionMeta(prediction)!;
  return { id: `${prediction}@${at}`, schemaVersion: 1, lesson: meta.lesson, prediction, skill: meta.skill, basis: meta.basis, answer: 'x', confidence, evaluation, outcome: '', lockedAt: at, kind: 'lesson', attempt, lessonCompleted: null, contentVersion: null };
}

describe('Learning records', () => {
  it('records only locked, rated, timestamped attempts, with a stable id', () => {
    assert.equal(recordAttempt('l1.rival', emptyPrediction(), 'match', ''), null);
    assert.equal(recordAttempt('l1.rival', chooseAnswer(emptyPrediction(), 'cut'), 'match', ''), null, 'a draft is never recorded');
    const legacy = { answer: 'cut', confidence: 3 as const, locked: true };
    assert.equal(recordAttempt('l1.rival', legacy, 'match', ''), null, 'attempts saved before lock times existed are skipped');
    const r = recordAttempt('l1.rival', locked('cut', 4, 1000), 'match', 'Rohan chose to cut');
    assert.deepEqual(r, {
      id: 'l1.rival@1000',
      schemaVersion: 2,
      kind: 'lesson',
      lesson: 'cooperation-trap',
      prediction: 'l1.rival',
      skill: 'anticipating',
      basis: 'calculable',
      answer: 'cut',
      confidence: 4,
      evaluation: 'correct',
      outcome: 'Rohan chose to cut',
      lockedAt: 1000,
      contentVersion: null,
    });
    // The attempt number and lesson-completion context are added when it joins the history.
    const [joined] = mergeAttempts([], [r], { completed: ['cooperation-trap'] });
    assert.equal(joined.attempt, 1);
    assert.equal(joined.lessonCompleted, true);
  });

  it('maps verdicts to evaluations, keeping reasonable misses apart from misconceptions', () => {
    assert.equal(evaluationFromVerdict('match'), 'correct');
    assert.equal(evaluationFromVerdict('reasonable'), 'reasonable-miss');
    assert.equal(evaluationFromVerdict('misconception'), 'misconception');
    assert.equal(evaluationFromVerdict('defensible'), 'partial');
    assert.equal(evaluationFromVerdict('depends'), 'partial');
  });

  it('never duplicates: re-renders and reruns keep the first record for an attempt', () => {
    const a = rec('l1.rival', 'correct', 4, 1);
    const later = { ...a, evaluation: 'misconception' as const };
    const once = mergeAttempts([], [a, null, a]);
    assert.equal(once.length, 1);
    assert.equal(mergeAttempts(once, [later])[0].evaluation, 'correct');
    assert.equal(mergeAttempts(once, [a]), once, 'unchanged history keeps its identity (no store update)');
    const replay = mergeAttempts(once, [rec('l1.rival', 'misconception', 2, 2)]);
    assert.equal(replay.length, 2, 'a replay locks a new attempt with a new id');
    assert.deepEqual(replay.map((x) => x.attempt), [1, 2], 'numbered per item; the first stays attempt 1');
  });

  it('keeps history bounded and ordered, never dropping a first attempt', () => {
    const many = Array.from({ length: MAX_ATTEMPTS + 5 }, (_, i) => rec('l1.rival', 'correct', 3, MAX_ATTEMPTS + 5 - i));
    const kept = mergeAttempts([], many);
    assert.equal(kept.length, MAX_ATTEMPTS);
    assert.equal(kept[0].lockedAt, 1, 'the first attempt is kept');
    assert.equal(kept[0].attempt, 1);
    assert.equal(kept[1].lockedAt, 7, 'the oldest retries are dropped');
  });

  it('loads old, missing or malformed saved data safely', () => {
    assert.deepEqual(sanitizeAttempts(undefined), [], 'saves from before the learning record');
    assert.deepEqual(sanitizeAttempts('garbage'), []);
    const good = rec('l3.round1', 'reasonable-miss', 2, 5);
    const kept = sanitizeAttempts([good, { ...good, id: 'x', confidence: 9 }, { ...good, id: 'y', prediction: 'l9.nope' }, null, good]);
    assert.deepEqual(kept, [good]);
    assert.equal(sanitizeGoal('coordination'), 'coordination');
    assert.equal(sanitizeGoal('psychic'), null);
    assert.equal(sanitizeGoal(undefined), null);
  });
});

describe('Lessons record what they evaluated, and only then', () => {
  it('Lesson 1: the rival prediction once Rohan has moved; the penalty guess once the threshold is found', () => {
    const base = { prediction: locked('cut' as const, 5, 10), rival: null, penaltyPrediction: locked('two' as const, 2, 20), foundFlip: false };
    assert.deepEqual(l1.cooperationRecords(base), [null, null]);
    const [rival, penalty] = l1.cooperationRecords({ ...base, rival: 'cut', foundFlip: true });
    assert.equal(rival?.evaluation, 'correct');
    assert.equal(penalty?.evaluation, 'partial', 'exactly 2 is graded "depends"');
  });

  it('Lesson 2: the crowd forecast is uncertain and a sensible miss is a reasonable miss', () => {
    const d = { crowdPrediction: locked('random' as const, 4, 1), guess1: 50, committed1: true, labPrediction: emptyPrediction<'up' | 'down' | 'same'>(), labTouched: false };
    const [crowd, lab] = l2.detectiveRecords(d);
    assert.equal(crowd?.basis, 'uncertain');
    assert.equal(crowd?.evaluation, 'reasonable-miss');
    assert.equal(lab, null);
    assert.equal(l2.detectiveRecords({ ...d, committed1: false })[0], null, 'not recorded before the round is played');
  });

  it('Lesson 3: both rounds, with the same evaluation as the feedback', () => {
    const [r1, r2] = l3.coordinationRecords({
      predict1: locked('cafe' as const, 3, 1),
      pick1: 'cafe',
      committed1: true,
      predict2: locked('park' as const, 3, 2),
      pick2: 'park',
      committed2: true,
    });
    assert.equal(r1?.evaluation, 'reasonable-miss');
    assert.equal(r2?.evaluation, 'misconception');
    assert.match(r2?.outcome ?? '', /Nina went to Clocktower Café/);
  });

  it('Lesson 4: the lab only once its simulation has revealed the answer', () => {
    const lab = { ...l4.MIX_LAB_RESET, labPrediction: locked('low' as const, 3, 7) };
    const d = { ...lab, comparePrediction: emptyPrediction<'repeat' | 'alternate' | 'random'>(), compareSeed: null };
    assert.deepEqual(l4.predictabilityRecords(d), [null, null]);
    const [, recorded] = l4.predictabilityRecords({ ...d, simSeed: 1 });
    assert.equal(recorded?.evaluation, 'correct');
    const [compare] = l4.predictabilityRecords({ ...d, comparePrediction: locked('random' as const, 4, 8), compareSeed: 1 });
    assert.equal(compare?.evaluation, 'correct');
  });

  it('Lesson 5: the stress test after the slider has been used, graded against the rule it was made for', () => {
    const d = { proposal: locked('cut' as const, 2, 1), penalty: 4, reward: 0, detectionPrediction: locked('depends' as const, 3, 2), detectionTouched: false };
    const [proposal, none] = l5.incentiveRecords(d);
    assert.equal(proposal?.evaluation, 'correct');
    assert.equal(none, null);
    const [, detection] = l5.incentiveRecords({ ...d, detectionTouched: true });
    assert.equal(detection?.evaluation, 'correct', 'p = 4 half-caught is a tie, and "can’t tell" is right');
    assert.match(detection?.outcome ?? '', /exactly balanced/);
  });
});

describe('Strategic Thinking Profile', () => {
  const empty = { attempts: [], completed: [], inProgress: [], goal: null } as const;

  it('a new user gets honest empty states and a first lesson to try', () => {
    const p = buildProfile(empty);
    assert.deepEqual(p.progress, { completed: 0, total: 22, inProgress: 0, predictions: 0, challengesTried: 0, challengesTotal: 15, dailyCounted: 0 });
    assert.equal(p.primary, null);
    assert.ok(p.skills.every((s) => s.status === 'not-started'));
    assert.equal(p.confidence.ready, false);
    assert.equal(p.next.lesson, 'cooperation-trap');
    assert.equal(p.next.reason, 'next-lesson');
  });

  it('a started-but-unfinished lesson is the next step', () => {
    const p = buildProfile({ ...empty, inProgress: ['coordination-problem'] });
    assert.equal(p.next.lesson, 'coordination-problem');
    assert.match(p.next.title, /^Continue/);
  });

  it('completed lessons with little data: no invented pattern', () => {
    const p = buildProfile({ ...empty, completed: ['cooperation-trap'], attempts: [rec('l1.rival', 'correct', 5, 1)] });
    assert.equal(p.primary, null);
    assert.equal(p.skills.find((s) => s.id === 'anticipating')?.status, 'exploring');
    // The next lesson in curriculum order (Lesson 2).
    assert.equal(p.next.lesson, 'iterated-dominance');
  });

  it('uncertain predictions are never used to judge skills or calibration', () => {
    const attempts = [rec('l2.crowd', 'reasonable-miss', 5, 1), rec('l3.round1', 'reasonable-miss', 5, 2)];
    const p = buildProfile({ ...empty, attempts });
    assert.ok(p.skills.every((s) => s.judged === 0));
    assert.equal(p.confidence.judged, 0);
    assert.equal(p.primary?.id, 'uncertain-misses');
    assert.match(p.primary?.body ?? '', /isn’t poor reasoning/);
  });

  it('flags overconfidence only with enough confident, calculable predictions', () => {
    const attempts = [
      rec('l1.rival', 'misconception', 5, 1),
      rec('l1.penalty', 'misconception', 4, 2),
      rec('l5.proposal', 'correct', 4, 3),
      rec('l5.detection', 'misconception', 5, 4),
    ];
    const p = buildProfile({ ...empty, attempts });
    const all = [p.primary, p.secondary].map((i) => i?.id);
    assert.ok(all.includes('overconfident'), JSON.stringify(all));
    assert.equal(p.confidence.ready, true);
    assert.deepEqual(
      p.confidence.groups.map((g) => [g.count, g.matched]),
      [[4, 1]],
    );
    assert.match(p.confidence.groups[0].text, /matched the model 1 of 4 times/);
  });

  it('spots a gap between a strong and a weak area, and recommends the weak one', () => {
    const attempts = [
      rec('l1.penalty', 'correct', 3, 1),
      rec('l5.proposal', 'correct', 3, 2),
      rec('l5.detection', 'correct', 3, 3),
      rec('l4.compare', 'misconception', 3, 4),
      rec('l4.lab', 'misconception', 3, 5),
    ];
    const p = buildProfile({ ...empty, attempts, completed: allLessons().map((l) => l.id) });
    assert.equal(p.primary?.id, 'gap');
    assert.equal(p.primary?.title, 'Strong on incentives; uncertain outcomes are worth practising');
    assert.equal(p.primary?.lesson, 'predictability-trap');
    // The "strength in incentives" insight would only repeat the gap, so it isn't shown as the secondary.
    assert.ok(!p.secondary || !p.secondary.mentions.some((m) => p.primary!.mentions.includes(m)), String(p.secondary?.id));
    assert.equal(p.next.reason, 'gap');
    assert.equal(p.next.lesson, 'predictability-trap');
    // The lesson is complete and its challenges are untried, so practise in new situations rather than replay.
    assert.equal(p.next.kind, 'challenges');
    assert.match(p.next.title, /^Try the challenges for The Predictability Trap/);
  });

  it('a chosen goal leads the insights and the next step, without changing any result', () => {
    const attempts = [
      rec('l1.penalty', 'correct', 3, 1),
      rec('l5.proposal', 'correct', 3, 2),
      rec('l5.detection', 'correct', 3, 3),
      rec('l4.compare', 'misconception', 3, 4),
      rec('l4.lab', 'misconception', 3, 5),
    ];
    const without = buildProfile({ ...empty, attempts });
    const withGoal = buildProfile({ ...empty, attempts, goal: 'incentives' });
    assert.equal(withGoal.primary?.skill, 'incentives');
    assert.equal(withGoal.next.lesson, 'incentive-shift');
    assert.equal(withGoal.next.reason, 'goal');
    assert.deepEqual(withGoal.skills, without.skills, 'the goal never alters skill observations');
    assert.equal(buildProfile({ ...empty, attempts, goal: 'none' }).next.reason, 'gap');
  });

  it('a replay updates a prediction rather than piling up', () => {
    const attempts = [rec('l4.lab', 'misconception', 5, 1), rec('l4.lab', 'correct', 3, 9, 2)];
    assert.equal(latestAttempts(attempts).length, 1);
    assert.equal(latestAttempts(attempts)[0].evaluation, 'correct');
    assert.equal(buildProfile({ ...empty, attempts }).progress.predictions, 2, 'progress still counts every prediction made');
  });
});

describe('Learning data export', () => {
  const now = new Date(Date.UTC(2026, 9, 26, 12, 0, 0));

  it('is valid, versioned JSON with only learning data', () => {
    const attempts = [rec('l2.crowd', 'reasonable-miss', 2, Date.UTC(2025, 9, 25))];
    const data = buildLearningExport({ attempts, completed: ['cooperation-trap'], inProgress: ['strategy-detective'], goal: 'coordination', now });
    const parsed = JSON.parse(JSON.stringify(data));
    assert.deepEqual(Object.keys(parsed).sort(), ['assessments', 'attempts', 'exportedAt', 'format', 'goal', 'lessons', 'schemaVersion']);
    assert.equal(parsed.format, EXPORT_FORMAT);
    assert.equal(parsed.schemaVersion, 3);
    assert.equal(parsed.exportedAt, '2026-10-26T12:00:00.000Z');
    assert.equal(parsed.lessons.length, 22);
    assert.deepEqual(parsed.lessons[0], {
      id: 'cooperation-trap',
      number: 1,
      module: 'm1',
      title: 'The Cooperation Trap',
      completed: true,
      inProgress: false,
      challengesTried: 0,
      challengesTotal: 3,
      scenariosPlayed: 0,
      scenariosTotal: 3,
    });
    assert.equal(parsed.lessons.find((l: { id: string }) => l.id === 'strategy-detective').inProgress, true);
    assert.equal(parsed.assessments.length, 7);
    assert.deepEqual(parsed.assessments[0], { id: 'm1', title: 'Checkpoint 1 · Foundations', attempts: 0, firstScore: null, bestScore: null, lastScore: null, maxScore: 4 });
    assert.deepEqual(parsed.attempts[0], {
      id: 'l2.crowd@1761350400000',
      lesson: 'strategy-detective',
      prediction: 'l2.crowd',
      skill: 'anticipating',
      basis: 'uncertain',
      answer: 'x',
      confidence: 2,
      evaluation: 'reasonable-miss',
      outcome: '',
      recordSchemaVersion: 1,
      kind: 'lesson',
      attempt: 1,
      isFirstAttempt: true,
      lessonCompleted: null,
      contentVersion: null,
      question: 'What will the other ten average?',
      lockedAt: '2025-10-25T00:00:00.000Z',
    });
  });

  it('an empty history still exports lesson progress, and nothing is invented', () => {
    const data = buildLearningExport({ attempts: [], completed: [], inProgress: [], goal: null, now });
    assert.deepEqual(data.attempts, []);
    assert.equal(data.goal, null);
    assert.ok(data.lessons.every((l) => !l.completed && !l.inProgress));
  });

  it('uses a dated, descriptive file name', () => {
    assert.match(exportFileName(new Date(2026, 0, 5)), /^strategic-thinking-data-2026-01-05\.json$/);
  });
});
