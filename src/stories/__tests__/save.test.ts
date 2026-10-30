/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STEPS, bandOf, mirrorReply, sanitizeRun } from '../meridian/run.ts';
import { EMPTY_SAVE, sanitizeSave } from '../save.ts';

describe('stories save', () => {
  it('survives garbage', () => {
    assert.deepEqual(sanitizeSave(null), EMPTY_SAVE);
    assert.deepEqual(sanitizeSave({ crossing: 3, meridian: 'x', finishes: null, endings: 'span' }), EMPTY_SAVE);
  });

  it('round-trips a real save through JSON', () => {
    const save = {
      crossing: { pos: { scene: 'c', beat: 2 }, choices: { open: 'plain', basket: 'full' }, reflecting: false },
      meridian: { run: { step: 3, pick: 'mirror', predict: 'top', why: 'kind', single: 'D', moves: ['C'], guesses: ['C'] }, reflecting: false },
      finishes: { crossing: 2, meridian: 1 },
      endings: ['span', 'line'],
      touched: { crossing: 10 },
    };
    const out = sanitizeSave(JSON.parse(JSON.stringify(save)));
    assert.deepEqual(out.crossing, save.crossing);
    assert.equal(out.meridian!.run.step, 3);
    assert.deepEqual(out.finishes, save.finishes);
    assert.deepEqual(out.endings, ['span', 'line']);
  });

  it('only keeps “reflecting” for a finished story, and drops unknown or duplicate endings', () => {
    const out = sanitizeSave({ crossing: { pos: { scene: 'a', beat: 0 }, choices: {}, reflecting: true }, endings: ['span', 'span', 'nope'] });
    assert.equal(out.crossing!.reflecting, false);
    assert.deepEqual(out.endings, ['span']);
    const m = sanitizeSave({ meridian: { run: { step: 2, pick: 'mirror', predict: 'top', why: 'kind' }, reflecting: true } });
    assert.equal(m.meridian!.reflecting, false);
  });
});

describe('meridian run', () => {
  it('moves a saved step back to the first step whose choice is missing', () => {
    assert.equal(sanitizeRun({ step: 7 }).step, STEPS.indexOf('pick'));
    assert.equal(sanitizeRun({ step: 7, pick: 'mirror', predict: 'top', why: 'clever', single: 'C', moves: ['C', 'C'] }).step, STEPS.indexOf('repeat'));
    assert.equal(sanitizeRun({ step: 99, pick: 'mirror', predict: 'top', why: 'clever', single: 'C', moves: Array(6).fill('C') }).step, STEPS.indexOf('design'));
  });

  it('rejects designs outside the offered options', () => {
    assert.equal(sanitizeRun({ design: { opening: 'C', response: 'copy', forgive: 0.5 } }).design, undefined);
    assert.deepEqual(sanitizeRun({ design: { opening: 'D', response: 'two', forgive: 0.1 } }).design, { opening: 'D', response: 'two', forgive: 0.1 });
  });

  it('bands ranks into thirds', () => {
    assert.deepEqual([1, 4, 5, 8, 9, 12].map((r) => bandOf(r, 12)), ['top', 'top', 'middle', 'middle', 'bottom', 'bottom']);
  });

  it('the Mirror in the repeated scene copies the player’s previous move', () => {
    const moves = ['D', 'C', 'D'] as const;
    assert.deepEqual([0, 1, 2, 3].map((k) => mirrorReply(moves, k)), ['C', 'D', 'C', 'D']);
  });
});
