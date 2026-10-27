/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installSeedCatalog } from '../../../content/seed.ts';
import { MIN_TREND_PERIOD, TREND_WINDOW_DAYS, buildProfile } from '../profile.ts';
import { type Evaluation, type LearningAttempt, type PredictionKey, predictionMeta } from '../records.ts';

installSeedCatalog();

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 27);

function rec(prediction: PredictionKey, evaluation: Evaluation, at: number, attempt = 1, confidence: 1 | 2 | 3 | 4 | 5 = 3): LearningAttempt {
  const meta = predictionMeta(prediction)!;
  return { id: `${prediction}@${at}`, schemaVersion: 2, lesson: meta.lesson, prediction, skill: meta.skill, basis: meta.basis, answer: 'x', confidence, evaluation, outcome: '', lockedAt: at, kind: 'lesson', attempt, lessonCompleted: null, contentVersion: null };
}

/** A calculable first answer about `skill`, as a challenge-like record with a unique item. */
function item(n: number, skill: LearningAttempt['skill'], evaluation: Evaluation, at: number): LearningAttempt {
  return { ...rec('l1.rival', evaluation, at), id: `x${n}@${at}`, prediction: `x${n}`, kind: 'challenge', skill, lesson: 'cooperation-trap', basis: 'calculable' };
}

const empty = { attempts: [], completed: [], inProgress: [], goal: null, now: NOW } as const;

describe('Thinking Profile at a glance', () => {
  it('says plainly when there is no evidence, and invents no strength or focus', () => {
    const p = buildProfile(empty);
    assert.equal(p.glance.ready, false);
    assert.equal(p.glance.judged, 0);
    assert.equal(p.glance.strength, null);
    assert.equal(p.glance.focus, null);
    assert.match(p.glance.text, /No evidence yet/);
  });

  it('needs the existing minimum before summarising, and counts first attempts only', () => {
    const attempts = [rec('l1.rival', 'misconception', NOW - 5 * DAY), rec('l1.rival', 'correct', NOW - 4 * DAY, 2), rec('l1.penalty', 'correct', NOW - 3 * DAY)];
    const p = buildProfile({ ...empty, attempts });
    assert.equal(p.glance.ready, false);
    assert.equal(p.glance.judged, 2, 'the retry adds no evidence');
    assert.equal(p.glance.matched, 1);
    assert.match(p.glance.text, /2 more answers/);
  });

  it('names one strength and one area to work on from the existing rules', () => {
    const attempts = [
      rec('l1.penalty', 'correct', 1),
      rec('l5.proposal', 'correct', 2),
      rec('l5.detection', 'correct', 3),
      rec('l4.compare', 'misconception', 4),
      rec('l4.lab', 'misconception', 5),
    ];
    const p = buildProfile({ ...empty, attempts });
    assert.equal(p.glance.ready, true);
    assert.equal(p.glance.strength?.id, 'incentives');
    assert.equal(p.glance.focus?.skill.id, 'uncertainty');
    assert.equal(p.glance.focus?.reason, 'weak');
    assert.equal(p.glance.text, '3 of 5 first answers you could work out matched the model.');
  });

  it('without a weak area, points at the least-tested one and says so', () => {
    const attempts = [rec('l5.proposal', 'correct', 1), rec('l5.detection', 'correct', 2), rec('l1.penalty', 'correct', 3)];
    const p = buildProfile({ ...empty, attempts });
    assert.equal(p.glance.focus?.reason, 'least-tested');
    assert.notEqual(p.glance.focus?.skill.id, p.glance.strength?.id);
    assert.equal(p.glance.focus?.skill.judged, 0);
  });

  it('keeps confidence and correctness apart', () => {
    const sure = [1, 2, 3, 4].map((n) => ({ ...item(n, 'incentives', 'misconception', n), confidence: 5 as const }));
    const p = buildProfile({ ...empty, attempts: sure });
    assert.equal(p.glance.matched, 0);
    assert.deepEqual(
      p.confidence.groups.map((g) => [g.label, g.count, g.matched]),
      [['Very or extremely confident (4–5)', 4, 0]],
    );
    // High confidence never raises a skill's result.
    assert.equal(p.skills.find((s) => s.id === 'incentives')!.matched, 0);
  });
});

describe('Thinking Profile trend', () => {
  it('appears only when both periods have enough answers', () => {
    const few = Array.from({ length: MIN_TREND_PERIOD }, (_, i) => item(i, 'incentives', 'correct', NOW - (i + 1) * DAY));
    const p = buildProfile({ ...empty, attempts: few });
    assert.equal(p.trend.ready, false);
    assert.equal(p.trend.recent.judged, MIN_TREND_PERIOD);
    assert.equal(p.trend.previous.judged, 0);
    assert.match(p.trend.text, /at least 5 answers/);
  });

  it('compares the latest period with the one before, from real record times', () => {
    const previous = Array.from({ length: 6 }, (_, i) => item(i, 'incentives', i < 2 ? 'correct' : 'misconception', NOW - (TREND_WINDOW_DAYS + 1 + i) * DAY));
    const recent = Array.from({ length: 5 }, (_, i) => item(10 + i, 'incentives', i < 4 ? 'correct' : 'partial', NOW - (i + 1) * DAY));
    const old = item(99, 'incentives', 'correct', NOW - 3 * TREND_WINDOW_DAYS * DAY);
    const p = buildProfile({ ...empty, attempts: [...previous, ...recent, old] });
    assert.equal(p.trend.ready, true);
    assert.deepEqual(p.trend.recent, { judged: 5, matched: 4 });
    assert.deepEqual(p.trend.previous, { judged: 6, matched: 2 });
    assert.equal(p.trend.direction, 'higher');
    assert.match(p.trend.text, /Last 4 weeks: 4 of 5 matched. The 4 weeks before: 2 of 6/);
  });

  it('never counts retries or uncertain answers in a period', () => {
    const recent = Array.from({ length: 5 }, (_, i) => item(i, 'incentives', 'correct', NOW - (i + 1) * DAY));
    const retries = recent.map((a) => ({ ...a, id: `${a.prediction}@r`, attempt: 2, lockedAt: a.lockedAt + 1000 }));
    const uncertain = recent.map((a, i) => ({ ...a, id: `u${i}`, prediction: `u${i}`, basis: 'uncertain' as const }));
    const p = buildProfile({ ...empty, attempts: [...recent, ...retries, ...uncertain] });
    assert.equal(p.trend.recent.judged, 5);
  });
});
