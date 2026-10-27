/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { addUser, createDatabase, pgRpc } from '../../../../supabase/__tests__/pg.ts';
import { installSeedCatalog } from '../../../content/seed.ts';
import { DailyError, dailyRepository } from '../../../data/daily.ts';
import { buildProfile } from '../../learning/profile.ts';
import { getScenario } from '../../scenarios/index.ts';
import { parseChallenge, parseRange } from '../content.ts';
import { addMonths, compareDays, dayLabel, daysInMonth, formatDay, monthGrid, monthRange, parseDay, utcToday, weekday } from '../dates.ts';
import { completionSummary, dayState } from '../day-state.ts';
import { dailyEvidence } from '../evidence.ts';
import { INTERACTION_TYPES, choiceEngine, numberEngine, scenarioEngine, scenarioPhase, snapNumber } from '../interactions.ts';
import { createDailyStore } from '../store.ts';

installSeedCatalog();

const day = (s: string) => parseDay(s)!;

describe('Daily challenge dates (UTC calendar days)', () => {
  it('parses only real calendar days', () => {
    assert.deepEqual(parseDay('2024-02-29'), { y: 2024, m: 2, d: 29 });
    assert.equal(parseDay('2026-02-29'), null);
    assert.equal(parseDay('2026-13-01'), null);
    assert.equal(parseDay('2026-1-01'), null);
    assert.equal(parseDay(20261027), null);
    assert.equal(formatDay(day('2026-03-07')), '2026-03-07');
  });

  it('moves across month and year boundaries', () => {
    assert.deepEqual(addMonths({ y: 2026, m: 12 }, 1), { y: 2027, m: 1 });
    assert.deepEqual(addMonths({ y: 2026, m: 1 }, -1), { y: 2025, m: 12 });
    assert.deepEqual(addMonths({ y: 2026, m: 10 }, -22), { y: 2024, m: 12 });
    assert.equal(daysInMonth({ y: 2024, m: 2 }), 29);
    assert.equal(daysInMonth({ y: 2026, m: 2 }), 28);
    assert.deepEqual(monthRange({ y: 2026, m: 12 }), { from: '2026-12-01', to: '2026-12-31' });
    assert.ok(compareDays(day('2026-12-31'), day('2027-01-01')) < 0);
    assert.equal(compareDays(day('2027-01-01'), day('2026-12-31')), 1);
  });

  it('lays a month out Monday first, in whole weeks', () => {
    // 1 October 2026 is a Thursday.
    assert.equal(weekday(day('2026-10-01')), 3);
    const grid = monthGrid({ y: 2026, m: 10 });
    assert.ok(grid.every((w) => w.length === 7));
    assert.deepEqual(grid[0].slice(0, 4), [null, null, null, { y: 2026, m: 10, d: 1 }]);
    assert.equal(grid.flat().filter(Boolean).length, 31);
    assert.equal(dayLabel(day('2026-10-27'), day('2026-01-01')), 'Tuesday 27 October');
    assert.equal(dayLabel(day('2025-12-31'), day('2026-01-01')), 'Wednesday 31 December 2025');
  });

  it('takes today from the UTC clock, not the device time zone', () => {
    assert.deepEqual(utcToday(Date.UTC(2026, 9, 27, 23, 59)), { y: 2026, m: 10, d: 27 });
    assert.deepEqual(utcToday(Date.UTC(2026, 9, 28, 0, 0)), { y: 2026, m: 10, d: 28 });
  });
});

describe('Daily challenge calendar states', () => {
  const today = day('2026-10-27');
  const entry = { ok: true as const, challenge: {} as never };
  const attempt = {} as never;

  it('separates completed, available, missed, no challenge and future days', () => {
    assert.equal(dayState(today, today, entry, undefined), 'today');
    assert.equal(dayState(today, today, entry, attempt), 'completed');
    assert.equal(dayState(today, today, undefined, undefined), 'none');
    assert.equal(dayState(day('2026-10-20'), today, entry, undefined), 'missed');
    assert.equal(dayState(day('2026-10-20'), today, undefined, undefined), 'none', 'a day without a challenge is not a missed day');
    assert.equal(dayState(day('2026-10-20'), today, undefined, attempt), 'completed', 'an attempt stands even if the challenge was later unpublished');
    assert.equal(dayState(day('2026-10-28'), today, entry, undefined), 'future');
    assert.equal(dayState(day('2026-11-01'), today, undefined, undefined), 'future');
  });

  it('summarises completed days and the current run of days from attempts only', () => {
    const h = (s: string) => ({ date: day(s), evaluation: 'correct' });
    assert.deepEqual(completionSummary([], today), { total: 0, streak: 0 });
    assert.deepEqual(completionSummary([h('2026-10-25'), h('2026-10-26'), h('2026-10-27')], today), { total: 3, streak: 3 });
    assert.deepEqual(completionSummary([h('2026-10-25'), h('2026-10-26')], today), { total: 2, streak: 2 }, 'today not answered yet keeps the run');
    assert.deepEqual(completionSummary([h('2026-10-24'), h('2026-10-26')], today), { total: 2, streak: 1 });
  });
});

describe('Daily challenge interaction registry', () => {
  const base = { id: 'c1', date: '2026-10-27', version: 1, title: 'T', intro: 'I', prompt: 'P', askConfidence: true, difficulty: 2, basis: 'calculable' };

  it('registers exactly the interaction types the database accepts', () => {
    assert.deepEqual(INTERACTION_TYPES, ['choice', 'number', 'scenario']);
  });

  it('accepts valid content and turns invalid content into a recoverable problem for that day', () => {
    const ok = parseChallenge({ ...base, interaction: 'choice', config: { options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } });
    assert.equal(ok?.ok, true);
    const unknown = parseChallenge({ ...base, interaction: 'essay', config: {} });
    assert.equal(unknown?.ok, false);
    assert.match(unknown && !unknown.ok ? unknown.problem : '', /doesn’t support yet/);
    const dupes = parseChallenge({ ...base, interaction: 'choice', config: { options: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] } });
    assert.equal(dupes?.ok, false);
    const extra = parseChallenge({ ...base, interaction: 'number', config: { min: 0, max: 10, step: 1, initial: 5, code: 'alert(1)' } });
    assert.equal(extra?.ok, false, 'unknown config fields are rejected');
    const offGrid = parseChallenge({ ...base, interaction: 'number', config: { min: 0, max: 10, step: 3, initial: 3 } });
    assert.equal(offGrid?.ok, false);
    const newer = parseChallenge({ ...base, interaction: 'scenario', config: { scenario: 'l8.c.first-offer', version: 99 } });
    assert.match(newer && !newer.ok ? newer.problem : '', /plays version 1/);
    const missing = parseChallenge({ ...base, interaction: 'scenario', config: { scenario: 'nope', version: 1 } });
    assert.match(missing && !missing.ok ? missing.problem : '', /doesn't have/);
    assert.equal(parseChallenge({ title: 'no id or date' }), null, 'without an id and a date there is no day to show it on');
    assert.equal(parseChallenge({ ...base, date: '2026-02-30', interaction: 'choice', config: {} }), null);
  });

  it('choice: only listed options, complete once one is chosen', () => {
    const c = { options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
    let d = choiceEngine.draft();
    assert.equal(choiceEngine.complete(c, d), null);
    d = choiceEngine.choose(c, d, 'zzz');
    assert.equal(d.option, null);
    d = choiceEngine.choose(c, d, 'b');
    assert.deepEqual(choiceEngine.complete(c, d), { option: 'b' });
  });

  it('number: snaps to the slider grid and clamps to its range', () => {
    const c = { min: 0, max: 1, step: 0.1, initial: 0.5 };
    assert.equal(snapNumber(c, 0.1 + 0.2), 0.3);
    assert.equal(snapNumber(c, 7), 1);
    assert.deepEqual(numberEngine.complete(c, numberEngine.set(c, numberEngine.draft(c), 0.24)), { value: 0.2 });
  });

  it('scenario: predict, lock, then play through the scenario’s own engine', () => {
    const spec = getScenario('l8.c.first-offer')!;
    let d = scenarioEngine.draft(1);
    assert.equal(scenarioPhase(spec, d), 'predict');
    d = scenarioEngine.lock(d);
    assert.equal(d.locked, false, 'nothing to lock without a prediction');
    d = scenarioEngine.lock(scenarioEngine.predict(spec, d, '3'));
    assert.equal(scenarioPhase(spec, d), 'play');
    assert.equal(scenarioEngine.predict(spec, d, '5').option, '3', 'a locked prediction never changes');
    assert.equal(scenarioEngine.complete(spec, d), null);
    const bad = scenarioEngine.play(spec, d, 'not-a-move');
    assert.deepEqual(bad, d, 'an illegal move is ignored');
    while (scenarioPhase(spec, d) === 'play') d = scenarioEngine.play(spec, d, 3);
    assert.equal(scenarioPhase(spec, d), 'done');
    assert.deepEqual(scenarioEngine.complete(spec, d), { option: '3', seed: 1, inputs: d.inputs });
  });
});

describe('Daily challenge evidence in the Thinking Profile', () => {
  const h = (over: Record<string, unknown>) => ({
    challengeId: 'c',
    date: day('2026-10-20'),
    version: 1,
    interaction: 'choice',
    confidence: 4 as const,
    evaluation: 'correct' as const,
    skill: 'incentives' as const,
    basis: 'calculable' as const,
    lesson: null,
    submittedAt: Date.UTC(2026, 9, 20),
    ...over,
  });

  it('counts only server-graded, skill-tagged, confidence-rated answers', () => {
    const ev = dailyEvidence([
      h({ challengeId: 'ok' }),
      h({ challengeId: 'scenario', interaction: 'scenario' }),
      h({ challengeId: 'no-skill', skill: null }),
      h({ challengeId: 'no-confidence', confidence: null }),
    ] as never);
    assert.deepEqual(ev.map((e) => e.prediction), ['daily/ok']);
    assert.equal(ev[0].lesson, 'incentive-shift', 'without a lesson, the skill’s own lesson');
    assert.equal(ev[0].attempt, 1);
  });

  it('feeds skills and confidence, but never lesson progress or practice', () => {
    const empty = { attempts: [], completed: [], inProgress: [], goal: null } as const;
    const daily = dailyEvidence([h({ challengeId: 'a' }), h({ challengeId: 'b', evaluation: 'misconception' }), h({ challengeId: 'c', basis: 'uncertain', evaluation: 'reasonable' })] as never);
    const p = buildProfile({ ...empty, daily });
    const incentives = p.skills.find((s) => s.id === 'incentives')!;
    assert.equal(incentives.judged, 2, 'uncertain daily answers are not judged');
    assert.equal(incentives.matched, 1);
    assert.equal(p.progress.dailyCounted, 3);
    assert.equal(p.progress.predictions, 0);
    assert.equal(p.progress.completed, 0);
    assert.equal(p.practice.first.judged, 0, 'first tries and practice stay lesson-only');
    assert.deepEqual(buildProfile(empty).skills, buildProfile({ ...empty, daily: [] }).skills);
  });
});

describe('Daily challenge repository and store (against the real SQL)', () => {
  const USER = '00000000-0000-4000-8000-0000000000c3';
  let db: PGlite;
  let today: string;
  before(async () => {
    db = await createDatabase();
    await addUser(db, USER);
    today = (await db.query<{ d: string }>('select public.daily_challenge_today()::text as d')).rows[0].d;
    await db.query('select * from content_admin.publish_daily_challenge($1::jsonb)', [
      JSON.stringify({
        id: 'repo-today',
        date: today,
        version: 1,
        title: 'Today',
        intro: 'Intro',
        prompt: 'Prompt',
        interaction: 'number',
        config: { min: 0, max: 10, step: 1, initial: 5 },
        skill: 'uncertainty',
        key: { evaluation: { bands: [{ min: 0, max: 6, verdict: 'misconception', feedback: 'Low.' }, { min: 7, max: 10, verdict: 'match', feedback: 'Yes.' }] }, modelAnswer: '7 or more', explanation: ['Because.'], takeaway: 'Take this.' },
      }),
    ]);
  });
  after(async () => {
    await db.close();
  });

  it('loads a month, submits once, and keeps the first result on retry', async () => {
    const repo = dailyRepository(pgRpc(db, USER));
    const store = createDailyStore(repo);
    const t = parseDay(today)!;
    await store.getState().loadMonth({ y: t.y, m: t.m });
    const m = store.getState().months[`${t.y}-${String(t.m).padStart(2, '0')}`];
    assert.equal(m.status, 'ready');
    const data = m.status === 'ready' ? m.data : null;
    assert.equal(store.getState().todayConfirmed, true);
    assert.ok(data!.entries.get(today)?.ok);

    await assert.rejects(store.getState().submit({ challengeId: 'repo-today', version: 1, answer: { value: 8 }, confidence: null, date: t }), (e) => e instanceof DailyError && e.refusal === 'confidence');
    const first = await store.getState().submit({ challengeId: 'repo-today', version: 1, answer: { value: 8 }, confidence: 3, date: t });
    assert.equal(first.status, 'recorded');
    assert.equal(first.attempt.result.verdict, 'match');
    const retry = await store.getState().submit({ challengeId: 'repo-today', version: 1, answer: { value: 1 }, confidence: 1, date: t });
    assert.equal(retry.status, 'existing');
    assert.equal(retry.attempt.result.verdict, 'match');
    assert.equal(store.getState().history?.length, 1);
    const after = store.getState().months[`${t.y}-${String(t.m).padStart(2, '0')}`];
    assert.equal(after.status === 'ready' && after.data.attempts.get(today)?.evaluation, 'correct');

    const practice = await repo.practice({ challengeId: 'repo-today', version: 1, answer: { value: 2 } });
    assert.equal(practice.verdict, 'misconception');
    const reveal = await repo.reveal('repo-today');
    assert.equal(reveal.modelAnswer, '7 or more');
  });

  it('parses a range defensively', () => {
    assert.equal(parseRange(null), null);
    const r = parseRange({ today: '2026-10-27', timezone: 'UTC', challenges: [{ broken: true }], attempts: [{ nope: 1 }], history: [] });
    assert.equal(r?.entries.size, 0);
    assert.equal(r?.attempts.size, 0);
  });
});
