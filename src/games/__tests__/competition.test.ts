/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  competitionPhase,
  nicknameKey,
  nicknameProblem,
  placementPoints,
  timeLeft,
  weekLabel,
  weekWindow,
  weeklyPoints,
} from '../competition.ts';

describe('competition week (Asia/Kolkata)', () => {
  it('runs Monday 00:00 IST to the next Monday 00:00 IST, as UTC timestamps', () => {
    const w = weekWindow('2026-10-26');
    assert.equal(new Date(w.startsAt).toISOString(), '2026-10-25T18:30:00.000Z');
    assert.equal(new Date(w.endsAt).toISOString(), '2026-11-01T18:30:00.000Z');
    assert.throws(() => weekWindow('2026-10-27'), /Monday/);
    assert.throws(() => weekWindow('next week'));
  });

  it('decides the phase from explicit timestamps, not the device clock', () => {
    const w = { ...weekWindow('2026-10-26'), finalized: false };
    assert.equal(competitionPhase(w, w.startsAt - 1), 'upcoming');
    assert.equal(competitionPhase(w, w.startsAt), 'active');
    assert.equal(competitionPhase(w, w.endsAt - 1), 'active');
    assert.equal(competitionPhase(w, w.endsAt), 'closed');
    assert.equal(competitionPhase({ ...w, finalized: true }, w.endsAt - 1), 'finalized');
  });

  it('labels the week and the time left', () => {
    const w = weekWindow('2026-10-26');
    assert.equal(weekLabel(w.startsAt, w.endsAt), '26 Oct – 1 Nov');
    assert.equal(timeLeft(0), 'closed');
    assert.equal(timeLeft(30_000), 'under a minute left');
    assert.equal(timeLeft(5 * 60_000), '5m left');
    assert.equal(timeLeft((26 * 60 + 3) * 60_000), '1d 2h left');
  });
});

describe('weekly points', () => {
  it('gives 40 placement points for first and a share for everyone else', () => {
    assert.equal(placementPoints(1, 1), 40);
    assert.equal(placementPoints(1, 10), 40);
    assert.equal(placementPoints(10, 10), 4);
    assert.equal(placementPoints(5, 10), 24);
    assert.equal(placementPoints(0, 10), 0);
    assert.equal(placementPoints(11, 10), 0);
  });

  it('keeps one win from overwhelming steady participation', () => {
    const winner = weeklyPoints(1, 20, true);
    const second = weeklyPoints(2, 20, false);
    assert.equal(winner, 10 + 40 + 25);
    assert.equal(second, 10 + 38);
    // Three solid weeks beat one win.
    assert.ok(3 * weeklyPoints(5, 20, false) > winner);
  });
});

describe('nicknames', () => {
  it('accepts reasonable names', () => {
    for (const ok of ['Ada', 'Ada Lovelace', 'ravi_k', 'r.k-42', '  padded  ']) assert.equal(nicknameProblem(ok), null, ok);
  });

  it('refuses blank, long, odd and reserved names', () => {
    assert.equal(nicknameProblem(''), 'length');
    assert.equal(nicknameProblem('ab'), 'length');
    assert.equal(nicknameProblem('x'.repeat(21)), 'length');
    assert.equal(nicknameProblem('two  spaces'), 'characters');
    assert.equal(nicknameProblem('-dash'), 'characters');
    assert.equal(nicknameProblem('bell\u0007'), 'characters');
    assert.equal(nicknameProblem('Adмin'), 'characters');
    assert.equal(nicknameProblem('ADMIN'), 'reserved');
    assert.equal(nicknameProblem('Strategic-Game'), 'reserved');
  });

  it('normalizes for uniqueness', () => {
    assert.equal(nicknameKey('Ada Lovelace'), nicknameKey('ada_lovelace'));
    assert.equal(nicknameKey('A.d-a'), 'ada');
  });
});
