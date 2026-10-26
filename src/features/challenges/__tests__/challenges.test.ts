/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Confidence, chooseAnswer, emptyPrediction, rateConfidence } from '../../../components/lesson/prediction-state.ts';
import { LESSONS, type LessonId } from '../../../content/lessons.ts';
import { buildProfile } from '../../learning/profile.ts';
import { type LearningAttempt, buildLearningExport, firstAttempts, mergeAttempts, recordAttempt, sanitizeAttempts } from '../../learning/records.ts';
import { CHALLENGES, CONCEPT_REVIEW, challengesFor, getChallenge } from '../content.ts';
import {
  type ChallengeDrafts,
  type ChallengeState,
  attemptsAt,
  challengeFeedback,
  resumeIndex,
  retryChallenge,
  sanitizeChallengeDrafts,
  submitChallenge,
  summaryTakeaway,
  triedCount,
} from '../progress.ts';

const SKILL_IDS = ['anticipating', 'incentives', 'coordination', 'uncertainty'];
const sentences = (s: string) => s.split(/(?<=[.!?”])\s+(?=[A-Z“"])/).length;

/** Answer a challenge through the real store transitions: draft → rate → submit. */
function answer(state: ChallengeState, id: string, option: string, confidence: Confidence, at: number): ChallengeState {
  const draft = rateConfidence(chooseAnswer(state.challengeDrafts[id] ?? emptyPrediction<string>(), option), confidence);
  const withDraft = { ...state, challengeDrafts: { ...state.challengeDrafts, [id]: draft } };
  const next = submitChallenge(withDraft, id, at);
  assert.ok(next, `${id}: submit should succeed`);
  return { ...withDraft, ...next };
}
const fresh = (completed: LessonId[] = []): ChallengeState => ({ challengeDrafts: {}, learning: [], completed });

describe('Challenge content', () => {
  it('has fifteen challenges: exactly three per lesson, ordered 1–3, with unique ids', () => {
    assert.equal(CHALLENGES.length, 15);
    assert.equal(new Set(CHALLENGES.map((c) => c.id)).size, 15);
    for (const l of LESSONS) {
      const list = challengesFor(l.id);
      assert.equal(list.length, 3, l.id);
      assert.deepEqual(list.map((c) => c.order), [1, 2, 3], l.id);
      assert.ok(CONCEPT_REVIEW[l.id].summary.length > 0, l.id);
    }
  });

  it('every challenge references a real lesson and skill, and is short enough to read in seconds', () => {
    for (const c of CHALLENGES) {
      assert.ok(LESSONS.some((l) => l.id === c.lesson), c.id);
      assert.ok(SKILL_IDS.includes(c.skill), c.id);
      assert.ok(c.concept.length > 0 && c.takeaway.length > 0 && c.question.length > 0, c.id);
      assert.ok(c.version >= 1, c.id);
      assert.ok(sentences(c.scenario) <= 4, `${c.id}: ${sentences(c.scenario)} sentences`);
      assert.ok(c.scenario.length <= 330, `${c.id}: ${c.scenario.length} chars`);
      assert.ok(c.options.length >= 2 && c.options.length <= 3, c.id);
    }
  });

  it('every option has feedback and a verdict; ids are unique within a challenge', () => {
    for (const c of CHALLENGES) {
      assert.equal(new Set(c.options.map((o) => o.id)).size, c.options.length, c.id);
      for (const o of c.options) {
        assert.ok(['match', 'defensible', 'depends', 'reasonable', 'misconception'].includes(o.verdict), `${c.id}/${o.id}`);
        assert.ok(o.feedback.length > 40 && sentences(o.feedback) <= 3, `${c.id}/${o.id}: feedback should be 1–3 sentences`);
        assert.ok(o.label.length > 0 && o.id.length <= 40, `${c.id}/${o.id}`);
      }
    }
  });

  it('evaluable challenges have exactly one strongest answer; unknowable ones have none', () => {
    for (const c of CHALLENGES) {
      const strongest = c.options.filter((o) => o.verdict === 'match').length;
      if (c.basis === 'calculable') {
        assert.equal(strongest, 1, c.id);
        assert.ok(!c.options.some((o) => o.verdict === 'reasonable'), `${c.id}: "reasonable" is for unknowable answers`);
      } else {
        assert.equal(strongest, 0, `${c.id}: no fabricated right answer`);
        assert.ok(c.options.some((o) => o.verdict === 'reasonable'), c.id);
      }
      assert.ok(c.options.some((o) => o.verdict !== 'match'), c.id);
    }
    assert.ok(CHALLENGES.some((c) => c.basis === 'uncertain'), 'at least one unknowable challenge');
    assert.ok(CHALLENGES.some((c) => c.options.filter((o) => o.verdict === 'defensible' || o.verdict === 'depends').length > 0), 'defensible answers exist');
  });

  it('feedback is deterministic and comes straight from the data', () => {
    const c = getChallenge('l1.c1.discount-war')!;
    assert.deepEqual(challengeFeedback(c, 'both-discount'), challengeFeedback(c, 'both-discount'));
    assert.equal(challengeFeedback(c, 'both-discount')?.verdict, 'match');
    assert.equal(challengeFeedback(c, 'both-hold')?.verdict, 'misconception');
    assert.equal(challengeFeedback(c, 'nope'), null);
  });
});

describe('First attempts and retries', () => {
  const id = 'l5.c2.new-penalty';

  it('records a submission exactly once, even with double taps', () => {
    let s = answer(fresh(), id, 'yes', 4, 100);
    assert.equal(s.learning.length, 1);
    assert.equal(s.learning[0].attempt, 1);
    assert.equal(s.learning[0].kind, 'challenge');
    assert.equal(s.learning[0].evaluation, 'misconception');
    assert.equal(s.learning[0].contentVersion, getChallenge(id)!.version);
    assert.equal(submitChallenge(s, id, 200), null, 'a second tap on an already-submitted answer does nothing');
    // Re-recording the same lock (a re-render or resumed screen) is deduplicated by id.
    s = { ...s, learning: mergeAttempts(s.learning, [s.learning[0]]) };
    assert.equal(s.learning.length, 1);
  });

  it('opening, selecting or leaving before submitting records nothing', () => {
    const draft = chooseAnswer(emptyPrediction<string>(), 'yes');
    const s = { ...fresh(), challengeDrafts: { [id]: draft } };
    assert.equal(submitChallenge(s, id, 100), null, 'no confidence yet');
    assert.equal(submitChallenge(fresh(), id, 100), null, 'nothing chosen');
    assert.equal(triedCount(s.learning), 0);
    assert.equal(resumeIndex(s.learning, s.challengeDrafts, 'incentive-shift'), 1, 'resumes on the half-made answer');
  });

  it('a retry is recorded separately and never overwrites the first answer', () => {
    let s = answer(fresh(), id, 'yes', 5, 100);
    s = { ...s, challengeDrafts: retryChallenge(s.challengeDrafts, id) };
    assert.equal(s.challengeDrafts[id]?.locked, false);
    assert.equal(s.learning.length, 1, 'retrying records nothing by itself');
    s = answer(s, id, 'mostly-not', 3, 200);
    const history = attemptsAt(s.learning, id);
    assert.deepEqual(
      history.map((a) => [a.attempt, a.answer, a.evaluation, a.confidence]),
      [
        [1, 'yes', 'misconception', 5],
        [2, 'mostly-not', 'correct', 3],
      ],
    );
    assert.equal(firstAttempts(s.learning)[0].answer, 'yes', 'the first attempt is preserved');
    assert.equal(triedCount(s.learning), 1, 'a retry does not count as another challenge');
  });

  it('records whether the lesson had been taken, and challenges never require it', () => {
    const before = answer(fresh([]), id, 'mostly-not', 3, 100);
    assert.equal(before.learning[0].lessonCompleted, false);
    const after = answer(fresh(['incentive-shift']), id, 'mostly-not', 3, 100);
    assert.equal(after.learning[0].lessonCompleted, true);
  });

  it('resumes on the first untried challenge, then the summary', () => {
    let s = fresh();
    assert.equal(resumeIndex(s.learning, s.challengeDrafts, 'coordination-problem'), 0);
    s = answer(s, 'l3.c1.meetup-point', 'info-desk', 3, 1);
    assert.equal(resumeIndex(s.learning, s.challengeDrafts, 'coordination-problem'), 1);
    s = answer(s, 'l3.c2.two-standards', 'announce', 3, 2);
    s = answer(s, 'l3.c3.unusual-option', 'food-truck', 3, 3);
    assert.equal(resumeIndex(s.learning, s.challengeDrafts, 'coordination-problem'), 'summary');
    assert.equal(triedCount(s.learning, 'coordination-problem'), 3);
  });

  it('the summary takeaway comes from what was attempted', () => {
    let s = fresh();
    assert.equal(summaryTakeaway(s.learning, 'predictability-trap'), null);
    s = answer(s, 'l4.c1.repeated-defender', 'mix', 3, 1);
    s = answer(s, 'l4.c3.no-opponent', 'yes', 3, 2);
    assert.equal(summaryTakeaway(s.learning, 'predictability-trap'), getChallenge('l4.c3.no-opponent')!.takeaway, 'the idea a first answer most needed');
  });

  it('loads old saves: no drafts, v1 records upgraded, malformed drafts dropped', () => {
    assert.deepEqual(sanitizeChallengeDrafts(undefined), {});
    const drafts: ChallengeDrafts = sanitizeChallengeDrafts({
      [id]: { answer: 'yes', confidence: 2, locked: false },
      'l9.c9.unknown': { answer: 'x', confidence: 2, locked: false },
      'l1.c1.discount-war': { answer: 'not-an-option', confidence: 2, locked: false },
      'l3.c1.meetup-point': { answer: 'cafe', confidence: null, locked: true },
    });
    assert.deepEqual(Object.keys(drafts), [id]);

    const v1 = [
      { id: 'l1.rival@5', schemaVersion: 1, lesson: 'cooperation-trap', prediction: 'l1.rival', skill: 'anticipating', basis: 'calculable', answer: 'cut', confidence: 3, evaluation: 'correct', outcome: '', lockedAt: 5 },
      { id: 'l1.rival@9', schemaVersion: 1, lesson: 'cooperation-trap', prediction: 'l1.rival', skill: 'anticipating', basis: 'calculable', answer: 'maintain', confidence: 3, evaluation: 'misconception', outcome: '', lockedAt: 9 },
    ];
    const upgraded = sanitizeAttempts(v1);
    assert.deepEqual(
      upgraded.map((a) => [a.kind, a.attempt, a.lessonCompleted, a.contentVersion]),
      [
        ['lesson', 1, null, null],
        ['lesson', 2, null, null],
      ],
    );
  });
});

describe('Profile evidence from first attempts', () => {
  const profileOf = (learning: LearningAttempt[], completed: LessonId[] = []) => buildProfile({ attempts: learning, completed, inProgress: [], goal: null });

  it('retrying until correct never upgrades the evidence', () => {
    const id = 'l4.c3.no-opponent';
    let s = answer(fresh(), id, 'yes', 5, 1);
    for (let i = 0; i < 3; i++) {
      s = { ...s, challengeDrafts: retryChallenge(s.challengeDrafts, id) };
      s = answer(s, id, 'no', 3, 10 + i);
    }
    const p = profileOf(s.learning);
    const area = p.skills.find((x) => x.id === 'uncertainty')!;
    assert.equal(area.judged, 1, 'one challenge = one piece of evidence, however many tries');
    assert.equal(area.matched, 0, 'the first answer counts, not the last');
    assert.equal(p.practice.first.ready, false);
    assert.match(p.practice.first.text, /^Not enough evidence yet/);
  });

  it('unknowable answers stay out of every accuracy figure', () => {
    const s = answer(fresh(), 'l2.c1.crowded-cafe', 'earlier', 5, 1);
    assert.equal(s.learning[0].evaluation, 'reasonable');
    assert.equal(s.learning[0].basis, 'uncertain');
    const p = profileOf(s.learning);
    assert.equal(p.practice.first.judged, 0);
    assert.equal(p.confidence.judged, 0);
    assert.equal(p.skills.find((x) => x.id === 'anticipating')!.judged, 0);
    assert.equal(p.primary, null, 'a challenge answer is never treated as a reasonable lesson miss');
  });

  it('an untried challenge is not a failure', () => {
    const p = profileOf([]);
    assert.ok(p.skills.every((x) => x.status === 'not-started' && x.judged === 0));
    assert.equal(p.practice.transfer.ready, false);
  });

  it('summarises first tries only with enough evidence', () => {
    let s = fresh();
    s = answer(s, 'l1.c1.discount-war', 'both-discount', 3, 1);
    s = answer(s, 'l1.c2.shared-project', 'coast', 3, 2);
    s = answer(s, 'l3.c1.meetup-point', 'cafe', 3, 3);
    assert.equal(profileOf(s.learning).practice.first.ready, false);
    s = answer(s, 'l5.c1.bonus-scheme', 'close-fast', 3, 4);
    const p = profileOf(s.learning);
    assert.equal(p.practice.first.ready, true);
    assert.equal(p.practice.first.text, 'On your first tries, 3 of 4 answers you could work out from the information given matched the model.');
  });

  it('practice compares first and latest only on comparable, retried questions', () => {
    let s = fresh();
    for (const [id, wrong, right, t] of [
      ['l5.c2.new-penalty', 'yes', 'mostly-not', 1],
      ['l5.c3.rat-bounty', 'works', 'breeding', 3],
    ] as const) {
      s = answer(s, id, wrong, 4, t);
      s = { ...s, challengeDrafts: retryChallenge(s.challengeDrafts, id) };
      s = answer(s, id, right, 3, t + 1);
    }
    // Same wrong answer again on a third question: noted as repeated.
    s = answer(s, 'l4.c1.repeated-defender', 'keep-left', 4, 10);
    s = { ...s, challengeDrafts: retryChallenge(s.challengeDrafts, 'l4.c1.repeated-defender') };
    s = answer(s, 'l4.c1.repeated-defender', 'keep-left', 4, 11);
    const p = profileOf(s.learning);
    assert.equal(p.practice.improvement.ready, true);
    assert.equal(p.practice.improvement.retried, 3);
    assert.equal(p.practice.improvement.nowMatch, 2);
    assert.equal(p.practice.improvement.repeated, 1);
    assert.match(p.practice.improvement.text, /first tries are the better guide/);

    // A record answered on an older content version isn't compared with today's.
    const aged = s.learning.map((a) => (a.prediction === 'l5.c2.new-penalty' && a.attempt === 1 ? { ...a, contentVersion: 0 } : a));
    assert.equal(profileOf(aged).practice.improvement.retried, 2);
  });

  it('transfer needs different scenarios — one challenge retried is not transfer', () => {
    let s = answer(fresh(), 'l3.c1.meetup-point', 'info-desk', 3, 1);
    s = { ...s, challengeDrafts: retryChallenge(s.challengeDrafts, 'l3.c1.meetup-point') };
    s = answer(s, 'l3.c1.meetup-point', 'info-desk', 3, 2);
    assert.equal(profileOf(s.learning).practice.transfer.ready, false);

    s = answer(s, 'l3.c2.two-standards', 'announce', 3, 3);
    const p = profileOf(s.learning, ['coordination-problem']);
    assert.equal(p.practice.transfer.ready, true);
    assert.equal(p.practice.transfer.lines[0].text, 'The Coordination Problem: matched the model on your first try in 2 of 2 new situations (2 before taking the lesson).');
    assert.ok([p.primary?.id, p.secondary?.id].includes('transfer'));
  });

  it('suggests the challenges of a completed lesson once lessons are done', () => {
    const all = LESSONS.map((l) => l.id);
    const p = profileOf([], all);
    assert.equal(p.next.kind, 'challenges');
    assert.equal(p.next.lesson, 'cooperation-trap');
    assert.equal(p.next.cta, 'Start challenges');
  });

  it('lesson predictions and challenges share one history, and lesson replays become later attempts', () => {
    const lessonFirst = recordAttempt('l1.rival', { answer: 'maintain', confidence: 4, locked: true, lockedAt: 1 }, 'misconception', '');
    const lessonReplay = recordAttempt('l1.rival', { answer: 'cut', confidence: 4, locked: true, lockedAt: 2 }, 'match', '');
    const learning = mergeAttempts([], [lessonFirst, lessonReplay], { completed: [] });
    assert.deepEqual(learning.map((a) => [a.attempt, a.evaluation]), [
      [1, 'misconception'],
      [2, 'correct'],
    ]);
    assert.equal(profileOf(learning).skills.find((x) => x.id === 'anticipating')!.matched, 0, 'the replay does not upgrade the evidence');
  });
});

describe('Export v2', () => {
  it('distinguishes first attempts from retries and names the scenario', () => {
    const id = 'l1.c3.changed-reward';
    let s = answer(fresh(), id, 'no', 2, Date.UTC(2026, 9, 1));
    s = { ...s, challengeDrafts: retryChallenge(s.challengeDrafts, id) };
    s = answer(s, id, 'yes', 4, Date.UTC(2026, 9, 2));
    const data = JSON.parse(JSON.stringify(buildLearningExport({ attempts: s.learning, completed: [], inProgress: [], goal: null, now: new Date(0) })));
    assert.equal(data.schemaVersion, 2);
    assert.deepEqual(
      data.attempts.map((a: Record<string, unknown>) => [a.kind, a.prediction, a.question, a.attempt, a.isFirstAttempt, a.answer, a.lessonCompleted, a.contentVersion]),
      [
        ['challenge', id, 'The Changed Reward', 1, true, 'no', false, 1],
        ['challenge', id, 'The Changed Reward', 2, false, 'yes', false, 1],
      ],
    );
    assert.equal(data.lessons[0].challengesTried, 1);
    assert.equal(data.lessons[0].challengesTotal, 3);
    assert.ok(!('challengeDrafts' in data), 'drafts are not attempts and are not exported');
  });
});
