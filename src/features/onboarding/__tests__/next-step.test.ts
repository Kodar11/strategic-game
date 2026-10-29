/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BRIDGE_LESSON, recommendedLesson, showcaseScenarios } from '../next-step.ts';

const lessons = [{ id: BRIDGE_LESSON }, { id: 'iterated-dominance' }, { id: 'best-response' }];

describe('First-session next step', () => {
  it('a new player is pointed at the Prisoner’s Dilemma lesson', () => {
    assert.equal(recommendedLesson(lessons, [])?.id, BRIDGE_LESSON);
  });

  it('someone replaying the intro gets their first unfinished lesson instead', () => {
    assert.equal(recommendedLesson(lessons, [BRIDGE_LESSON])?.id, 'iterated-dominance');
  });

  it('falls back to the first published lesson, and handles an empty catalog', () => {
    assert.equal(recommendedLesson(lessons, lessons.map((l) => l.id))?.id, BRIDGE_LESSON);
    assert.equal(recommendedLesson([{ id: 'best-response' }], [])?.id, 'best-response');
    assert.equal(recommendedLesson([], []), undefined);
  });

  it('previews only published scenarios, preferred ones first', () => {
    const all = [
      { id: 'x', title: 'X' },
      { id: 'l5.c.tax-audit', title: 'Tax' },
      { id: 'y', title: 'Y' },
    ];
    assert.deepEqual(showcaseScenarios(all).map((s) => s.id), ['l5.c.tax-audit', 'x', 'y']);
    assert.deepEqual(showcaseScenarios(all, 1).map((s) => s.id), ['l5.c.tax-audit']);
    assert.deepEqual(showcaseScenarios([]), []);
  });
});
