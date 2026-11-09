/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fromDayNumber, dayNumber, weekday } from '../../features/daily/dates.ts';
import { CROWD_QUESTIONS, crowdOutcome, validCrowdAnswer, isOptionKind } from '../crowd.ts';
import { RUSH_SIZE, rushSet } from '../rush.ts';
import { crowdQuestionFor, dailyFormat, isCrowdDay } from '../schedule.ts';

const start = dayNumber({ y: 2026, m: 11, d: 9 }); // a Monday

describe('Daily schedule', () => {
  it('a published challenge always wins; otherwise Wednesdays and Sundays are Crowd days and the rest Read Rush', () => {
    const week = Array.from({ length: 7 }, (_, i) => fromDayNumber(start + i));
    assert.deepEqual(week.map((d) => weekday(d)), [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(week.map((d) => dailyFormat(d, false)), ['rush', 'rush', 'crowd', 'rush', 'rush', 'rush', 'crowd']);
    assert.deepEqual(week.map((d) => dailyFormat(d, null)), week.map((d) => dailyFormat(d, false)));
    assert.ok(week.every((d) => dailyFormat(d, true) === 'challenge'));
  });

  it('walks through the whole Crowd bank before repeating a question', () => {
    const crowdDays = Array.from({ length: 200 }, (_, i) => fromDayNumber(start + i)).filter(isCrowdDay);
    const ids = crowdDays.slice(0, CROWD_QUESTIONS.length).map((d) => crowdQuestionFor(d).id);
    assert.equal(new Set(ids).size, CROWD_QUESTIONS.length);
    assert.equal(crowdQuestionFor(crowdDays[CROWD_QUESTIONS.length]).id, ids[0]);
  });
});

describe('The Crowd outcomes', () => {
  const q = (id: string) => CROWD_QUESTIONS.find((x) => x.id === id)!;

  it('two-thirds: closest to ⅔ of the average wins', () => {
    const o = crowdOutcome(q('c-two-thirds'), [[0, 1], [30, 2], [60, 1]], 20);
    // average 30 → target 20; nobody else is closer than 20 (20 is absent from the counts, so ties go to the crowd).
    assert.match(o.crowd, /average was 30\.0.*target was 20\.0/);
    assert.equal(o.answered, 4);
    const mine = crowdOutcome(q('c-two-thirds'), [[0, 1], [20, 1], [30, 2], [60, 1]], 20);
    assert.equal(mine.won, true);
    assert.equal(crowdOutcome(q('c-two-thirds'), [[0, 1], [20, 1], [30, 2], [60, 1]], 60).won, false);
  });

  it('lowest unique: the lowest number picked by exactly one player wins', () => {
    const o = crowdOutcome(q('c-lowest-unique'), [[1, 3], [2, 1], [3, 1]], 2);
    assert.equal(o.won, true);
    assert.equal(o.winning, '2');
    assert.equal(crowdOutcome(q('c-lowest-unique'), [[1, 2], [2, 2]], 1).won, false);
  });

  it('minority, majority, threshold and stag', () => {
    assert.equal(crowdOutcome(q('c-minority-door'), [[0, 5], [1, 2], [2, 4]], 1).won, true);
    assert.equal(crowdOutcome(q('c-majority-meet'), [[0, 5], [1, 2]], 0).won, true);
    // 70% went (limit 60%): the party was packed, so staying home won.
    assert.equal(crowdOutcome(q('c-el-farol'), [[0, 7], [1, 3]], 1).won, true);
    assert.equal(crowdOutcome(q('c-el-farol'), [[0, 7], [1, 3]], 0).won, false);
    // 80% hunted (limit 70%): the stag was caught.
    assert.equal(crowdOutcome(q('c-stag'), [[0, 8], [1, 2]], 0).won, true);
  });

  it('ignores invalid values, and nobody wins an empty day', () => {
    const o = crowdOutcome(q('c-minority-door'), [[9, 50], [0, 1]], 0);
    assert.equal(o.answered, 1);
    assert.equal(crowdOutcome(q('c-two-thirds'), [], 10).won, null);
    for (const x of CROWD_QUESTIONS) {
      assert.equal(validCrowdAnswer(x, -1), false);
      assert.equal(validCrowdAnswer(x, isOptionKind(x) ? x.options!.length : (x.max ?? 100) + 1), false);
    }
  });
});

describe('Read Rush', () => {
  it('is the same set for everyone on a day, and different the next day', () => {
    assert.deepEqual(rushSet(start), rushSet(start));
    assert.notDeepEqual(rushSet(start).map((x) => x.prompt + x.options.join()), rushSet(start + 1).map((x) => x.prompt + x.options.join()));
  });

  it('every question has distinct options and one right answer, over a year of days', () => {
    for (let d = start; d < start + 365; d++) {
      const set = rushSet(d);
      assert.equal(set.length, RUSH_SIZE);
      for (const x of set) {
        assert.ok(x.answer >= 0 && x.answer < x.options.length, x.id);
        assert.equal(new Set(x.options).size, x.options.length, `${x.id}: ${x.options}`);
        if (x.kind === 'never') {
          const rows = x.table!.cells.map((r) => r.map((c) => c[0]));
          const bad = rows[x.answer];
          assert.ok(rows.some((o, j) => j !== x.answer && o.every((v, i) => v > bad[i])));
        }
        if (x.kind === 'stable') {
          const c = x.table!.cells;
          const r = Math.floor(x.answer / 2);
          const k = x.answer % 2;
          assert.ok(c[r][k][0] > c[1 - r][k][0] && c[r][k][1] > c[r][1 - k][1]);
        }
      }
    }
  });
});
