import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LESSONS, MODULES } from '../../../content/lessons.ts';
import { ASSESSMENTS, getAssessment, hilltopInvests, riverbendValue } from '../content.ts';
import { answerItem, assessmentScore, emptyRun, finalUnlocked, itemScore, retakeAssessment, sanitizeAssessmentRuns, submitAssessment } from '../scoring.ts';

describe('Assessments — structure', () => {
  it('has one checkpoint per module plus a separate final assessment', () => {
    assert.deepEqual(ASSESSMENTS.map((a) => a.id), [...MODULES.map((m) => m.id), 'final']);
    assert.ok(getAssessment('final')!.case, 'the final assessment presents its own case');
    assert.ok(getAssessment('final')!.reflection, 'the final assessment asks for a written explanation');
  });

  it('every item has unique options, at least one matching answer and a real lesson', () => {
    const lessonIds = new Set(LESSONS.map((l) => l.id));
    for (const a of ASSESSMENTS) {
      assert.equal(new Set(a.items.map((i) => i.id)).size, a.items.length, a.id);
      for (const i of a.items) {
        assert.ok(lessonIds.has(i.lesson), i.id);
        assert.equal(new Set(i.options.map((o) => o.id)).size, i.options.length, i.id);
        const matches = i.options.filter((o) => o.verdict === 'match');
        assert.ok(matches.length >= 1, `${i.id} has a matching answer`);
        if (!i.multi) assert.equal(matches.length, 1, `${i.id}: single-answer items have one match`);
        assert.ok(i.options.some((o) => o.verdict !== 'match'), `${i.id} has real alternatives`);
      }
    }
  });

  it('every engine-solved item agrees with the option marked as matching', () => {
    for (const a of ASSESSMENTS) {
      for (const i of a.items.filter((x) => x.solve)) {
        assert.equal(i.solve!(), i.options.find((o) => o.verdict === 'match')!.id, i.id);
      }
    }
  });

  it('checkpoint items cover the module’s own lessons', () => {
    for (const m of MODULES) {
      const a = getAssessment(m.id)!;
      for (const i of a.items) assert.equal(LESSONS.find((l) => l.id === i.lesson)!.module, m.id, i.id);
    }
  });
});

describe('Final assessment — the case is internally consistent', () => {
  it('Hilltop’s replies follow from its costs', () => {
    assert.equal(hilltopInvests(true, 4), true); // 12 − 4 = 8 > 7
    assert.equal(hilltopInvests(true, 7), false); // 12 − 7 = 5 < 7
    assert.equal(hilltopInvests(false, 4), false); // 5 − 4 = 1 < 3
    assert.equal(hilltopInvests(false, 7), false);
  });

  it('Riverbend’s expected values are 4.5 and 3, and the advice flips above ≈ 71% cost-7 Hilltops', () => {
    assert.equal(riverbendValue(true), 4.5);
    assert.equal(riverbendValue(false), 3);
    assert.ok(riverbendValue(true, 0.7) > riverbendValue(false, 0.7));
    assert.ok(riverbendValue(true, 0.72) < riverbendValue(false, 0.72));
  });
});

describe('Assessments — scoring', () => {
  const m1 = getAssessment('m1')!;
  const final = getAssessment('final')!;

  it('scores single answers by verdict: 1, ½ or 0', () => {
    const q = m1.items[0];
    assert.equal(itemScore(q, ['both-low']), 1);
    assert.equal(itemScore(q, ['both-high']), 0);
    assert.equal(itemScore(q, []), 0);
    const half = getAssessment('m3')!.items[3];
    assert.equal(itemScore(half, ['50']), 0.5);
  });

  it('multi-select accepts every valid answer without rewarding “choose everything”', () => {
    const q = final.items.find((i) => i.id === 'final.assumptions')!;
    assert.equal(itemScore(q, ['prior', 'subsidy', 'simultaneous']), 1);
    assert.ok(itemScore(q, ['prior']) > 0 && itemScore(q, ['prior']) < 1);
    assert.ok(itemScore(q, ['prior', 'subsidy', 'simultaneous', 'units']) < 1);
    const players = final.items.find((i) => i.id === 'final.players')!;
    assert.equal(itemScore(players, ['riverbend', 'hilltop', 'nature']), 1, 'a defensible extra never costs marks');
  });

  it('submits only complete runs, once, and keeps the first score through retakes', () => {
    let run = emptyRun(m1);
    assert.equal(submitAssessment(run, m1), null, 'incomplete');
    for (const i of m1.items) run = answerItem(run, i, i.options.find((o) => o.verdict === 'misconception')!.id);
    const first = submitAssessment(run, m1, 1)!;
    assert.equal(first.firstScore, 0);
    assert.equal(submitAssessment(first, m1), null, 'double submit is a no-op');
    assert.equal(answerItem(first, m1.items[0], 'both-low'), first, 'answers lock once submitted');
    let again = retakeAssessment(first);
    for (const i of m1.items) again = answerItem(again, i, i.options.find((o) => o.verdict === 'match')!.id);
    const second = submitAssessment(again, m1, 2)!;
    assert.equal(second.firstScore, 0);
    assert.equal(second.bestScore, m1.items.length);
    assert.equal(second.lastScore, m1.items.length);
    assert.equal(second.attempts, 2);
    assert.ok(assessmentScore(m1, second.answers).passed);
  });

  it('opens the final assessment only after every checkpoint was submitted once', () => {
    const runs: Record<string, ReturnType<typeof emptyRun>> = {};
    assert.equal(finalUnlocked(runs), false);
    for (const m of MODULES) runs[m.id] = { ...emptyRun(getAssessment(m.id)!), attempts: 1 };
    assert.equal(finalUnlocked(runs), true);
  });

  it('sanitising drops unknown assessments, outdated versions and answers to options that no longer exist', () => {
    const good = { ...emptyRun(m1), answers: { 'm1.q1': ['both-low'], 'm1.q2': ['ghost'] } };
    const out = sanitizeAssessmentRuns({ m1: good, nope: good, m2: { ...emptyRun(getAssessment('m2')!), version: 99 }, m3: 'junk' });
    assert.deepEqual(Object.keys(out), ['m1']);
    assert.deepEqual(out.m1!.answers, { 'm1.q1': ['both-low'] });
  });
});
