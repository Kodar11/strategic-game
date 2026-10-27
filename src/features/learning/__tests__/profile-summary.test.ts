/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installSeedCatalog } from '../../../content/seed.ts';
import { allLessons } from '../../../content/lessons.ts';
import { EVIDENCE, evidenceLevel } from '../evidence-policy.ts';
import { MIN_AREA_EVIDENCE, MIN_FIRST_ATTEMPTS, MIN_TREND_PERIOD, TREND_WINDOW_DAYS, buildProfile, type ProfileInput } from '../profile.ts';
import type { Confidence } from '../../../components/lesson/prediction-state.ts';
import { type Evaluation, type LearningAttempt, itemMeta } from '../records.ts';
import { areaDetail, summariseProfile } from '../summary.ts';

installSeedCatalog();

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 28);

/** A record for a real catalog item (lesson prediction, scenario or challenge). */
function rec(item: string, evaluation: Evaluation, at: number, attempt = 1, confidence: Confidence = 3): LearningAttempt {
  const meta = itemMeta(item)!;
  assert.ok(meta, `unknown item ${item}`);
  return {
    id: `${item}@${at}`,
    schemaVersion: 2,
    kind: meta.kind,
    lesson: meta.lesson,
    prediction: item,
    skill: meta.skill,
    basis: meta.basis,
    answer: 'x',
    confidence,
    evaluation,
    outcome: '',
    lockedAt: at,
    attempt,
    lessonCompleted: null,
    contentVersion: meta.kind === 'challenge' ? 1 : null,
  };
}

/** A qualifying Daily Challenge answer, shaped as `dailyEvidence` produces it. */
function daily(n: number, skill: LearningAttempt['skill'], evaluation: Evaluation, at: number): LearningAttempt {
  return { ...rec('l1.rival', evaluation, at), id: `daily/d${n}@${at}`, prediction: `daily/d${n}`, kind: 'challenge', skill, lesson: 'cooperation-trap', basis: 'calculable', contentVersion: 1 };
}

const empty: ProfileInput = { attempts: [], completed: [], inProgress: [], goal: null, now: NOW };
const view = (input: ProfileInput) => {
  const profile = buildProfile(input);
  return { profile, summary: summariseProfile(profile, input.completed) };
};

/**
 * Scenario B: one lesson done; 4 of 7 first attempts matched; anticipating 2 of 2, incentives 2 of 4, one daily
 * answer in coordination; 6 predictions (one is a replay) and 1 daily challenge; no history for a trend.
 */
const sparse: ProfileInput = {
  ...empty,
  completed: ['cooperation-trap'],
  attempts: [
    rec('l1.rival', 'correct', NOW - 3 * DAY),
    rec('l1.penalty', 'correct', NOW - 3 * DAY + 1),
    rec('l1.a.classic-dilemma', 'misconception', NOW - 3 * DAY + 2),
    rec('l1.a.classic-dilemma', 'correct', NOW - 3 * DAY + 3, 2),
    rec('l1.b.shared-project', 'correct', NOW - 3 * DAY + 4),
    rec('l1.c.community-fund', 'misconception', NOW - 3 * DAY + 5),
    rec('l1.c1.discount-war', 'correct', NOW - 2 * DAY),
  ],
  daily: [daily(1, 'coordination', 'misconception', NOW - DAY)],
};

describe('Evidence policy', () => {
  it('separates nothing, raw activity, tentative and established evidence', () => {
    assert.equal(evidenceLevel(0, 0, EVIDENCE.area), 'none');
    assert.equal(evidenceLevel(3, 0, EVIDENCE.area), 'activity', 'answers about unknowable outcomes are activity, not evidence');
    assert.equal(evidenceLevel(1, 1, EVIDENCE.area), 'activity', 'a single answer is an event, not a pattern');
    assert.equal(evidenceLevel(2, 2, EVIDENCE.area), 'tentative');
    assert.equal(evidenceLevel(5, 5, EVIDENCE.area), 'established');
    assert.equal(evidenceLevel(9, 9, EVIDENCE.firstAttempts), 'tentative', 'no established level unless the policy defines one');
  });

  it('is the single source of the profile thresholds', () => {
    assert.equal(MIN_AREA_EVIDENCE, EVIDENCE.area.tentative);
    assert.equal(MIN_FIRST_ATTEMPTS, EVIDENCE.firstAttempts.tentative);
    assert.equal(MIN_TREND_PERIOD, EVIDENCE.trend.perPeriod);
    assert.equal(TREND_WINDOW_DAYS, EVIDENCE.trend.windowDays);
  });
});

describe('Scenario A · brand-new learner', () => {
  const { profile, summary } = view(empty);

  it('offers a starting point and invents nothing', () => {
    assert.equal(summary.hasActivity, false);
    assert.equal(summary.snapshot.stage, 'Getting started');
    assert.equal(summary.snapshot.firstAttempts, null);
    assert.deepEqual(summary.snapshot.lessons, { completed: 0, total: 22, inProgress: 0 });
    assert.equal(summary.observation, null);
    assert.deepEqual(summary.areas, [], 'no empty skill-area rows');
    assert.deepEqual(summary.report, { firstAttempts: false, feedback: false, transfer: false, confidence: false, trend: false });
  });

  it('routes to the first lesson', () => {
    assert.equal(profile.next.kind, 'lesson');
    assert.equal(profile.next.lesson, allLessons()[0].id);
    assert.equal(summary.nextArea, null);
  });
});

describe('Scenario B · sparse data', () => {
  const { profile, summary } = view(sparse);

  it('reproduces the screenshot counts from the record', () => {
    assert.deepEqual(summary.snapshot.lessons, { completed: 1, total: 22, inProgress: 0 });
    assert.deepEqual(summary.snapshot.firstAttempts, { matched: 4, judged: 7 });
    assert.equal(profile.progress.predictions, 6);
    assert.equal(profile.progress.dailyCounted, 1);
    assert.equal(summary.snapshot.stage, 'Module 1 · Foundations');
    assert.equal(summary.snapshot.body, 'You’ve begun exploring anticipating others, incentives and coordination.');
  });

  it('makes one cautious, sample-scoped observation — never a "strength"', () => {
    const o = summary.observation!;
    assert.equal(o.skill, 'anticipating');
    assert.equal(o.tone, 'encouraging');
    assert.equal(o.level, 'tentative');
    assert.equal(o.title, 'An encouraging start');
    assert.equal(o.body, 'You matched the model on both of your first attempts on anticipating others.');
    assert.match(o.caption, /^Based on 2 first attempts/);
    assert.doesNotMatch(`${o.title} ${o.body}`, /strength|weak|master/i);
  });

  it('recommends the mixed area, so the observation and the next step say different things', () => {
    assert.equal(profile.next.reason, 'gap');
    assert.equal(summary.nextArea, 'incentives');
    assert.notEqual(summary.observation?.skill, summary.nextArea);
    assert.equal(profile.next.lesson, 'incentive-shift');
    assert.ok(!sparse.completed.includes(profile.next.lesson), 'never a completed lesson unless it is a replay');
  });

  it('shows only areas with activity, with raw counts and their evidence level', () => {
    assert.deepEqual(
      summary.areas.map((a) => [a.id, a.measure, a.level]),
      [
        ['anticipating', '2 of 2 first attempts matched', 'tentative'],
        ['incentives', '2 of 4 first attempts matched', 'tentative'],
        ['coordination', '0 of 1 first attempt matched', 'activity'],
      ],
    );
  });

  it('keeps unsupported analytics out of the report', () => {
    assert.deepEqual(summary.report, { firstAttempts: true, feedback: false, transfer: false, confidence: false, trend: false });
  });
});

describe('Scenario C · substantial history', () => {
  // Two four-week periods with 6 calculable first answers each, across all four areas, mostly confident.
  const items = ['l1.rival', 'l1.penalty', 'l1.c1.discount-war', 'l1.c2.shared-project', 'l1.c3.changed-reward', 'l1.a.classic-dilemma', 'l1.b.shared-project', 'l1.c.community-fund'];
  const earlier = items.slice(0, 6).map((id, i) => rec(id, i % 2 ? 'correct' : 'misconception', NOW - (TREND_WINDOW_DAYS + 3 + i) * DAY, 1, 5));
  const recent = [...items.slice(6).map((id, i) => rec(id, 'correct', NOW - (2 + i) * DAY, 1, 5)), ...[1, 2, 3, 4].map((n) => daily(n, n % 2 ? 'coordination' : 'uncertainty', 'correct', NOW - (5 + n) * DAY))];
  const input: ProfileInput = { ...empty, completed: ['cooperation-trap', 'iterated-dominance'], attempts: [...earlier, ...recent.filter((a) => !a.prediction.startsWith('daily/'))], daily: recent.filter((a) => a.prediction.startsWith('daily/')) };
  const { profile, summary } = view(input);

  it('adds areas as they gain activity and shows the trend once both periods qualify', () => {
    assert.deepEqual(
      summary.areas.map((a) => a.id),
      ['anticipating', 'incentives', 'coordination', 'uncertainty'],
    );
    assert.equal(profile.trend.ready, true);
    assert.equal(summary.report.trend, true);
  });

  it('shows confidence only once a confidence group is large enough', () => {
    assert.equal(summary.report.confidence, true);
    assert.ok(profile.confidence.groups.every((g) => g.count >= EVIDENCE.confidence.group));
  });

  it('still recommends a lesson relevant to progress', () => {
    assert.ok(profile.next.kind === 'challenges' || !input.completed.includes(profile.next.lesson) || profile.next.reason === 'replay');
  });
});

describe('Scenario D · feedback and retries', () => {
  it('retries never inflate first attempts, and need two retried questions before they are summarised', () => {
    const first = [rec('l1.c1.discount-war', 'misconception', 1), rec('l1.penalty', 'misconception', 2)];
    const retries = [rec('l1.c1.discount-war', 'correct', 10, 2), rec('l1.c1.discount-war', 'correct', 11, 3)];
    const one = view({ ...empty, attempts: [...first, ...retries] });
    assert.equal(one.profile.glance.matched, 0, 'two correct retries add no first-attempt matches');
    assert.equal(one.profile.practice.improvement.retried, 1, 'repeated retries of one question count once');
    assert.equal(one.summary.report.feedback, false);

    const two = view({ ...empty, attempts: [...first, ...retries, rec('l1.penalty', 'correct', 12, 2)] });
    assert.equal(two.profile.practice.improvement.retried, 2);
    assert.equal(two.profile.practice.improvement.nowMatch, 2);
    assert.equal(two.summary.report.feedback, true);
    assert.equal(two.summary.report.transfer, false, 'retrying familiar questions is not transfer');
  });

  it('transfer counts different challenges on first tries only', () => {
    const attempts = [rec('l1.c1.discount-war', 'correct', 1), rec('l1.c2.shared-project', 'correct', 2), rec('l1.rival', 'correct', 3)];
    const { profile, summary } = view({ ...empty, attempts });
    assert.equal(summary.report.transfer, true);
    assert.deepEqual(
      profile.practice.transfer.lines.map((l) => [l.lesson, l.tried, l.matchedFirst]),
      [['cooperation-trap', 2, 2]],
    );
  });

  it('the area breakdown lists first attempts and counts retries separately', () => {
    const attempts = [rec('l1.c1.discount-war', 'misconception', 1), rec('l1.c1.discount-war', 'correct', 5, 2), rec('l2.crowd', 'reasonable-miss', 3)];
    const profile = buildProfile({ ...empty, attempts });
    const d = areaDetail(profile, 'anticipating', { attempts, completed: [] })!;
    assert.deepEqual(
      d.attempts.map((a) => a.result),
      ['not-compared', 'different'],
    );
    assert.equal(d.retries, 1);
    assert.ok(d.modules.some((m) => m.lessons.some((l) => l.id === 'strategy-detective')));
  });
});

describe('Scenario E · optional goal', () => {
  it('works without a goal, steers the next step with one, and changing or removing it alters no measure', () => {
    const none = view(sparse);
    const goal = view({ ...sparse, goal: 'coordination' });
    const removed = view({ ...sparse, goal: 'none' });
    assert.equal(goal.profile.next.reason, 'goal');
    assert.equal(goal.profile.next.lesson, 'coordination-problem');
    assert.equal(goal.summary.nextArea, 'coordination');
    assert.deepEqual(goal.summary.areas, none.summary.areas);
    assert.deepEqual(goal.summary.snapshot, none.summary.snapshot);
    assert.deepEqual(removed.profile.next, none.profile.next);
  });
});

describe('Observation wording', () => {
  it('describes a mixed area neutrally, and only says more once the evidence is established', () => {
    const mixed = view({ ...empty, attempts: [rec('l1.penalty', 'correct', 1), rec('l1.a.classic-dilemma', 'misconception', 2), rec('l1.b.shared-project', 'misconception', 3)] });
    assert.equal(mixed.summary.observation?.title, 'Still exploring incentives');
    assert.equal(mixed.summary.observation?.body, 'Your first attempts on incentives have had mixed results so far: 1 of 3 matched.');

    const many = ['l1.penalty', 'l1.a.classic-dilemma', 'l1.b.shared-project', 'l1.c.community-fund', 'l1.c3.changed-reward'].map((id, i) => rec(id, 'correct', i));
    const established = view({ ...empty, attempts: many });
    assert.equal(established.summary.observation?.level, 'established');
    assert.equal(established.summary.observation?.title, 'Going well: Understanding incentives');
  });

  it('a single answer never produces an observation', () => {
    assert.equal(view({ ...empty, attempts: [rec('l1.rival', 'correct', 1)] }).summary.observation, null);
  });
});
