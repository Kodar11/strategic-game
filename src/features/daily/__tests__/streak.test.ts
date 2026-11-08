import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Day, formatDay } from '../dates.ts';
import { streakFrom } from '../streak.ts';

const days = (...ds: string[]) => {
  const set = new Set(ds);
  return (d: Day) => set.has(formatDay(d));
};

describe('Daily streak', () => {
  it('counts back from today, or from yesterday while today is still open', () => {
    const today = { y: 2026, m: 11, d: 8 };
    assert.equal(streakFrom(today, days('2026-11-08', '2026-11-07', '2026-11-06')), 3);
    assert.equal(streakFrom(today, days('2026-11-07', '2026-11-06')), 2);
    assert.equal(streakFrom(today, days('2026-11-06')), 0, 'a missed yesterday ends it');
  });

  it('runs across the 1st of the month, and across a new year', () => {
    assert.equal(streakFrom({ y: 2026, m: 11, d: 2 }, days('2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30')), 4);
    assert.equal(streakFrom({ y: 2027, m: 1, d: 1 }, days('2027-01-01', '2026-12-31')), 2);
  });
});
