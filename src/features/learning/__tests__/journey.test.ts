/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Confidence } from '../../../components/lesson/prediction-state.ts';
import { allLessons, allModules, lessonsInModule } from '../../../content/lessons.ts';
import { installSeedCatalog } from '../../../content/seed.ts';
import { allChallenges } from '../../challenges/content.ts';
import { EVIDENCE } from '../evidence-policy.ts';
import { accuracy, answerHistory, areaCards, areaNext, areaTrend, calibration, growthSnapshot, learningProgress, progressSeries, recommendation } from '../journey.ts';
import { buildProfile, type ProfileInput } from '../profile.ts';
import { type Evaluation, type LearningAttempt, itemMeta } from '../records.ts';

installSeedCatalog();

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 30);

/** A record for a real catalog item. */
function rec(item: string, evaluation: Evaluation, at: number, attempt = 1, confidence: Confidence = 3, answer = 'x'): LearningAttempt {
  const meta = itemMeta(item);
  assert.ok(meta, `unknown item ${item}`);
  return {
    id: `${item}@${at}`,
    schemaVersion: 2,
    kind: meta.kind,
    lesson: meta.lesson,
    prediction: item,
    skill: meta.skill,
    basis: meta.basis,
    answer,
    confidence,
    evaluation,
    outcome: 'What happened',
    lockedAt: at,
    attempt,
    lessonCompleted: null,
    contentVersion: meta.kind === 'challenge' ? 1 : null,
  };
}

/** A calculable first answer about `skill` with a unique item id (as the profile tests do). */
function item(n: number, skill: LearningAttempt['skill'], evaluation: Evaluation, at: number, confidence: Confidence = 3): LearningAttempt {
  return { ...rec('l1.rival', evaluation, at, 1, confidence), id: `x${n}@${at}`, prediction: `x${n}`, kind: 'challenge', skill, basis: 'calculable', contentVersion: 1 };
}

const empty: ProfileInput = { attempts: [], completed: [], inProgress: [], goal: null, now: NOW };
const all = allLessons().map((l) => l.id);

describe('Learning progress', () => {
  it('welcomes a new learner with the first lesson and no invented progress', () => {
    const p = learningProgress([], []);
    assert.equal(p.completed, 0);
    assert.equal(p.fraction, 0);
    assert.equal(p.stage, 'Getting started');
    assert.match(p.sentence, new RegExp(allLessons()[0].title));
    assert.equal(p.milestone, null);
    const second = allLessons()[1];
    assert.match(learningProgress([], [second.id]).sentence, new RegExp(`partway through ${second.title}`), 'names the lesson actually in progress');
  });

  it('counts lessons and finished modules from the real curriculum', () => {
    const m1 = lessonsInModule(allModules()[0].id).map((l) => l.id);
    const p = learningProgress(m1, []);
    assert.equal(p.completed, m1.length);
    assert.equal(p.total, all.length);
    assert.equal(p.modulesDone, 1);
    assert.equal(p.milestone, `1 of ${allModules().length} modules complete`);
    assert.match(p.sentence, /Module 1 complete/);
    assert.match(p.stage, /^Module 2/);
  });

  it('says "nearly through" only when two or fewer lessons are left, and marks the finished library', () => {
    assert.match(learningProgress(all.slice(0, -2), []).sentence, /nearly through .* 2 lessons to go/);
    assert.doesNotMatch(learningProgress(all.slice(0, -3), []).sentence, /nearly/);
    const done = learningProgress(all, []);
    assert.equal(done.stage, 'Lesson library complete');
    assert.equal(done.fraction, 1);
  });
});

describe('Areas', () => {
  it('lists all four areas, with lesson activity kept separate from answers', () => {
    const cards = areaCards(buildProfile(empty), [allLessons()[0].id]);
    assert.equal(cards.length, 4);
    assert.ok(cards.every((c) => c.level === 'none' && c.summary === 'Not explored yet'));
    assert.ok(cards.some((c) => c.lessons.done === 1), 'a completed lesson shows as lesson activity');
  });

  it('shows raw counts for one answer and a qualifier only for tentative evidence', () => {
    const one = areaCards(buildProfile({ ...empty, attempts: [item(1, 'coordination', 'correct', NOW - DAY)] }), []).find((c) => c.id === 'coordination')!;
    assert.equal(one.level, 'activity');
    assert.equal(one.summary, '1 first attempt so far');
    assert.equal(one.qualifier, null);

    const three = areaCards(buildProfile({ ...empty, attempts: [1, 2, 3].map((n) => item(n, 'coordination', n === 1 ? 'misconception' : 'correct', NOW - n)) }), []).find((c) => c.id === 'coordination')!;
    assert.equal(three.summary, '2 of 3 first attempts matched');
    assert.equal(three.qualifier, 'Early evidence');
  });

  it('describes change within an area only with enough answers in each half and a clear gap', () => {
    const seven = Array.from({ length: 7 }, (_, i) => item(i, 'incentives', i < 3 ? 'misconception' : 'correct', NOW - (10 - i) * DAY));
    assert.equal(areaTrend(buildProfile({ ...empty, attempts: seven }), 'incentives').ready, false);

    const eight = Array.from({ length: 8 }, (_, i) => item(i, 'incentives', i < 4 ? (i === 0 ? 'correct' : 'misconception') : 'correct', NOW - (10 - i) * DAY));
    const t = areaTrend(buildProfile({ ...empty, attempts: eight }), 'incentives');
    assert.equal(t.ready, true);
    assert.deepEqual(t.earlier, { judged: 4, matched: 1 });
    assert.deepEqual(t.later, { judged: 4, matched: 4 });
    assert.equal(t.direction, 'higher');

    const flat = Array.from({ length: 8 }, (_, i) => item(i, 'incentives', i % 2 ? 'correct' : 'misconception', NOW - (10 - i) * DAY));
    assert.equal(areaTrend(buildProfile({ ...empty, attempts: flat }), 'incentives').direction, 'steady');
  });

  it('ignores retries when looking for change', () => {
    const first = Array.from({ length: 4 }, (_, i) => rec(allChallenges()[i].id, 'misconception', NOW - (20 - i) * DAY));
    const retries = first.map((a, i) => rec(a.prediction, 'correct', NOW - (5 - i) * DAY, 2));
    assert.equal(areaTrend(buildProfile({ ...empty, attempts: [...first, ...retries] }), first[0].skill).ready, false);
  });
});

describe('Growth snapshot', () => {
  it('says nothing without answers', () => {
    assert.equal(growthSnapshot(buildProfile(empty), null), null);
  });

  it('describes a single answer as activity, never as a pattern', () => {
    const g = growthSnapshot(buildProfile({ ...empty, attempts: [item(1, 'anticipating', 'misconception', NOW - DAY)] }), null)!;
    assert.equal(g.kind, 'started');
    assert.equal(g.early, true);
    assert.match(g.caption, /too few/);
  });

  it('labels a two-answer pattern as early', () => {
    const g = growthSnapshot(buildProfile({ ...empty, attempts: [item(1, 'anticipating', 'correct', NOW - 2), item(2, 'anticipating', 'correct', NOW - 1)] }), null)!;
    assert.equal(g.kind, 'encouraging');
    assert.equal(g.early, true);
    assert.match(g.title, /encouraging start/);
  });

  it('frames a mixed area neutrally, with no fixed label', () => {
    const attempts = [1, 2, 3, 4, 5].map((n) => item(n, 'coordination', n <= 1 ? 'correct' : 'misconception', NOW - n));
    const g = growthSnapshot(buildProfile({ ...empty, attempts }), null)!;
    assert.equal(g.kind, 'exploring');
    assert.match(g.title, /explore further/);
    assert.doesNotMatch(`${g.title} ${g.meaning}`, /bad|poor|weak/i);
  });

  it('prefers a supported improvement over other observations', () => {
    const attempts = Array.from({ length: 8 }, (_, i) => item(i, 'coordination', i < 4 ? 'misconception' : 'correct', NOW - (10 - i) * DAY));
    const g = growthSnapshot(buildProfile({ ...empty, attempts }), null)!;
    assert.equal(g.kind, 'improving');
    assert.equal(g.skill, 'coordination');
    assert.match(g.caption, /Earlier: 0 of 4\. Recent: 4 of 4/);
  });
});

describe('Recommendation', () => {
  it('starts a new learner on the first lesson', () => {
    const r = recommendation(buildProfile(empty), []);
    assert.equal(r.kind, 'lesson');
    assert.equal(r.lesson, allLessons()[0].id);
  });

  it('names how many untried challenges a completed lesson has', () => {
    const p = buildProfile({ ...empty, completed: all });
    const r = recommendation(p, []);
    assert.equal(r.kind, 'challenges', 'with every lesson done, untried challenges come next');
    const total = allChallenges().filter((c) => c.lesson === r.lesson).length;
    assert.equal(r.cta, `Try ${total} challenges`);
    assert.equal(r.lesson, p.next.lesson, 'the same lesson the profile’s next step chose');
  });

  it('suggests a game instead of a replay once every lesson and challenge is done', () => {
    const attempts = allChallenges().map((c, i) => rec(c.id, c.basis === 'calculable' ? 'correct' : 'reasonable', NOW - i * 1000));
    const p = buildProfile({ ...empty, completed: all, attempts });
    assert.equal(p.next.reason, 'replay');
    const r = recommendation(p, attempts);
    assert.equal(r.kind, 'game');
    assert.ok(r.game);
  });

  it('suggests the next lesson within an area, then its challenges, then its game', () => {
    const first = areaNext('coordination', { attempts: [], completed: [], inProgress: [] })!;
    assert.equal(first.kind, 'lesson');
    const afterLessons = areaNext('coordination', { attempts: [], completed: all, inProgress: [] })!;
    assert.equal(afterLessons.kind, 'challenges');
    const tried = allChallenges().map((c, i) => rec(c.id, 'correct', NOW - i));
    assert.equal(areaNext('coordination', { attempts: tried, completed: all, inProgress: [] })!.kind, 'game');
  });
});

describe('Prediction accuracy', () => {
  it('counts each first attempt once and never lets retries in', () => {
    const attempts = [
      rec('l1.rival', 'misconception', NOW - 5 * DAY),
      rec('l1.rival', 'correct', NOW - 4 * DAY, 2),
      rec('l1.rival', 'correct', NOW - 3 * DAY, 3),
      rec('l1.penalty', 'correct', NOW - 2 * DAY),
      rec('l2.crowd', 'reasonable-miss', NOW - DAY),
    ];
    const a = accuracy(buildProfile({ ...empty, attempts }), attempts);
    assert.equal(a.comparable, 2);
    assert.equal(a.matched, 1);
    assert.equal(a.excluded, 1, 'the unknowable outcome is excluded, not counted as wrong');
    assert.equal(a.retries, 2);
    assert.equal(a.matched + a.partly + a.other, a.comparable);
    assert.equal(a.percent, null, 'no percentage on two answers');
    assert.equal(a.ready, false);
  });

  it('adds a percentage once the denominator is meaningful', () => {
    const attempts = Array.from({ length: EVIDENCE.percent }, (_, i) => item(i, 'anticipating', i < 7 ? 'correct' : i === 7 ? 'partial' : 'misconception', NOW - i));
    const a = accuracy(buildProfile({ ...empty, attempts }), attempts);
    assert.equal(a.percent, 70);
    assert.equal(a.partly, 1);
    assert.equal(a.other, 2);
  });
});

describe('Confidence and calibration', () => {
  it('waits for enough rated first attempts', () => {
    const attempts = [1, 2, 3].map((n) => item(n, 'anticipating', 'correct', NOW - n, 5));
    assert.equal(calibration(buildProfile({ ...empty, attempts })).ready, false);
  });

  it('uses only calculable first attempts, and compares bands only when both are big enough', () => {
    const attempts = [
      ...[1, 2, 3].map((n) => item(n, 'anticipating', 'correct', NOW - n, 5)),
      item(4, 'anticipating', 'misconception', NOW - 4, 1),
      rec('l2.crowd', 'reasonable-miss', NOW - 5, 1, 1),
      rec('l1.rival', 'misconception', NOW - 6, 1, 1),
      rec('l1.rival', 'correct', NOW - 1, 2, 1),
    ];
    const c = calibration(buildProfile({ ...empty, attempts }));
    assert.equal(c.ready, true);
    assert.equal(c.rated, 5, 'the unknowable outcome and the retry are left out');
    assert.deepEqual(
      c.bands.map((b) => [b.id, b.count, b.matched]),
      [
        ['low', 2, 0],
        ['middle', 0, 0],
        ['high', 3, 3],
      ],
    );
    assert.equal(c.pattern, null, 'two low-confidence answers are too few to compare');
  });

  it('describes the relationship gently in either direction', () => {
    const rises = [...[1, 2, 3].map((n) => item(n, 'anticipating', 'correct', NOW - n, 5)), ...[4, 5, 6].map((n) => item(n, 'anticipating', 'misconception', NOW - n, 1))];
    assert.equal(calibration(buildProfile({ ...empty, attempts: rises })).pattern, 'rises');
    const inverted = [...[1, 2, 3].map((n) => item(n, 'anticipating', 'misconception', NOW - n, 5)), ...[4, 5, 6].map((n) => item(n, 'anticipating', 'correct', NOW - n, 1))];
    const c = calibration(buildProfile({ ...empty, attempts: inverted }));
    assert.equal(c.pattern, 'inverted');
    assert.doesNotMatch(c.text, /lower your confidence/i);
  });
});

describe('Progress over time', () => {
  it('shows no chart, and says how many more answers it needs, below the minimum', () => {
    const attempts = Array.from({ length: 14 }, (_, i) => item(i, 'anticipating', 'correct', NOW - i * DAY));
    const s = progressSeries(buildProfile({ ...empty, attempts }));
    assert.equal(s.ready, false);
    assert.equal(s.points.length, 0);
    assert.equal(s.needed, 1);
  });

  it('groups answers by when they were given, and folds a small remainder into the last block', () => {
    // Given out of order on purpose: the series sorts by lockedAt. Earliest 5 missed, the rest matched.
    const attempts = Array.from({ length: 16 }, (_, i) => item(i, 'anticipating', i < 5 ? 'misconception' : 'correct', NOW - (16 - i) * DAY)).reverse();
    const s = progressSeries(buildProfile({ ...empty, attempts }));
    assert.equal(s.ready, true);
    assert.deepEqual(
      s.points.map((p) => [p.judged, p.matched]),
      [
        [5, 0],
        [5, 5],
        [6, 6],
      ],
    );
    assert.ok(s.points.every((p, i) => i === 0 || p.from > s.points[i - 1].to), 'blocks follow real timestamps');
    assert.equal(s.direction, 'higher');
  });

  it('never draws more than the maximum number of points', () => {
    const attempts = Array.from({ length: 50 }, (_, i) => item(i, 'anticipating', 'correct', NOW - i * DAY));
    const s = progressSeries(buildProfile({ ...empty, attempts }));
    assert.ok(s.points.length <= EVIDENCE.series.maxPoints);
    assert.equal(
      s.points.reduce((n, p) => n + p.judged, 0),
      50,
    );
  });
});

describe('Answer history', () => {
  it('lists first attempts newest first, with retries shown but not changing the result', () => {
    const challenge = allChallenges().find((c) => c.basis === 'calculable')!;
    const option = challenge.options[0];
    const attempts = [
      rec(challenge.id, 'misconception', NOW - 3 * DAY, 1, 4, option.id),
      rec(challenge.id, 'correct', NOW - 2 * DAY, 2),
      rec('l2.crowd', 'reasonable-miss', NOW - DAY),
    ];
    const rows = answerHistory(buildProfile({ ...empty, attempts }), attempts);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].item, 'l2.crowd');
    assert.equal(rows[0].uncertain, true);
    assert.equal(rows[0].result, 'not-compared');
    assert.equal(rows[1].result, 'different', 'the first answer stands');
    assert.equal(rows[1].retries, 1);
    assert.equal(rows[1].latest, 'matched');
    assert.equal(rows[1].answer, option.label);
    assert.equal(rows[1].source, 'Challenge');
  });

  it('filters by area', () => {
    const attempts = [item(1, 'anticipating', 'correct', NOW - 2), item(2, 'coordination', 'correct', NOW - 1)];
    const rows = answerHistory(buildProfile({ ...empty, attempts }), attempts, 'coordination');
    assert.deepEqual(
      rows.map((r) => r.skill),
      ['coordination'],
    );
  });
});
