import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EMPTY_PROGRESS, findMatch, recordGame, type TournamentProgress } from '../progress.ts';
import { EMPTY_REMINDERS, NUDGE_HOUR, nudgeDate, recordVisit, rivalNudge, sanitizeReminders, shouldOffer } from '../reminders.ts';
import { liveSeason } from '../schema.ts';
import { SEASON_ONE } from '../season1.ts';

const season = liveSeason(SEASON_ONE)!;
const play = (p: TournamentProgress, id: string, outcome: 'win' | 'loss' = 'win') => {
  const f = findMatch(season, id)!;
  return recordGame(p, f.stage, f.match, { outcome, level: 'normal', read: false }, 1).progress;
};

describe('reminder offer', () => {
  it('appears from the second day of use, never twice, never once answered', () => {
    let s = recordVisit(EMPTY_REMINDERS, '2026-11-08');
    assert.equal(shouldOffer(s), false);
    assert.equal(recordVisit(s, '2026-11-08'), s, 'a second visit the same day changes nothing');
    s = recordVisit(s, '2026-11-09');
    assert.equal(shouldOffer(s), true);
    assert.equal(shouldOffer({ ...s, asked: true }), false);
    assert.equal(shouldOffer({ ...s, enabled: true }), false);
  });

  it('keeps the last 14 days only, and drops malformed saves', () => {
    let s = EMPTY_REMINDERS;
    for (let d = 1; d <= 20; d++) s = recordVisit(s, `2026-11-${String(d).padStart(2, '0')}`);
    assert.equal(s.days.length, 14);
    assert.equal(s.days.at(-1), '2026-11-20');
    assert.deepEqual(sanitizeReminders({ enabled: 'yes', days: ['nope', '2026-11-01', 3] }), { enabled: false, asked: false, days: ['2026-11-01'] });
  });
});

describe('rival nudge', () => {
  it('says nothing before the first game, or once the stage is cleared', () => {
    assert.equal(rivalNudge(SEASON_ONE, EMPTY_PROGRESS, []), null);
    let p = EMPTY_PROGRESS;
    for (const m of season.stages[0].matches) p = play(p, m.id);
    assert.equal(rivalNudge(SEASON_ONE, p, []), null, 'Arc 1 is open but untouched');
  });

  it('names the waiting rival and the progress when a stage is part-way done', () => {
    const p = play(EMPTY_PROGRESS, 's1.q.rps', 'loss');
    assert.deepEqual(rivalNudge(SEASON_ONE, p, []), { title: 'The Host is waiting', body: '0 of 3 matches cleared in Qualifiers. Pick up where you left off.' });
  });

  it('fires two days later at 18:00 local time', () => {
    const d = nudgeDate(new Date(2026, 10, 8, 22, 15));
    assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 10, 10, NUDGE_HOUR, 0]);
  });
});
