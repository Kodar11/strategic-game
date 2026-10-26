/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';

import {
  CONFIDENCE_LEVELS,
  canLock,
  chooseAnswer,
  confidenceLabel,
  emptyPrediction,
  lockPrediction,
  lockedAnswer,
  missingForLock,
  predictionSchema,
  predictionStatus,
  rateConfidence,
} from '../prediction-state.ts';

type Side = 'left' | 'right';
const schema = predictionSchema(z.enum(['left', 'right']));

describe('Prediction lifecycle', () => {
  it('moves unanswered → draft → locked → evaluated', () => {
    let a = emptyPrediction<Side>();
    assert.equal(predictionStatus(a), 'unanswered');
    a = chooseAnswer(a, 'left');
    assert.equal(predictionStatus(a), 'draft');
    a = rateConfidence(a, 3);
    a = lockPrediction(a);
    assert.equal(predictionStatus(a), 'locked');
    assert.equal(predictionStatus(a, true), 'evaluated');
  });

  it('lets a draft switch answers and confidence freely, and nothing is revealed until locked', () => {
    let a = chooseAnswer(emptyPrediction<Side>(), 'left');
    a = chooseAnswer(a, 'right');
    a = rateConfidence(a, 5);
    a = rateConfidence(a, 2);
    assert.deepEqual(a, { answer: 'right', confidence: 2, locked: false });
    assert.equal(lockedAnswer(a), null, 'a draft answer is never handed to feedback');
  });

  it('refuses to lock without an answer or without a confidence', () => {
    const noAnswer = rateConfidence(emptyPrediction<Side>(), 4);
    assert.equal(canLock(noAnswer), false);
    assert.equal(missingForLock(noAnswer), 'answer');
    assert.deepEqual(lockPrediction(noAnswer), noAnswer);

    const noConfidence = chooseAnswer(emptyPrediction<Side>(), 'left');
    assert.equal(canLock(noConfidence), false);
    assert.equal(missingForLock(noConfidence), 'confidence');
    assert.equal(lockPrediction(noConfidence).locked, false);
  });

  it('never edits a locked attempt, and locking twice (double tap) changes nothing', () => {
    const locked = lockPrediction(rateConfidence(chooseAnswer(emptyPrediction<Side>(), 'left'), 4));
    assert.equal(chooseAnswer(locked, 'right'), locked);
    assert.equal(rateConfidence(locked, 1), locked);
    assert.equal(lockPrediction(locked), locked);
    assert.equal(lockedAnswer(locked), 'left');
    assert.equal(missingForLock(locked), null);
  });

  it('a retry starts from a fresh attempt with no answer or confidence carried over', () => {
    const first = emptyPrediction<Side>();
    const used = lockPrediction(rateConfidence(chooseAnswer(first, 'left'), 5));
    assert.deepEqual(first, { answer: null, confidence: null, locked: false }, 'updates never mutate the initial attempt');
    assert.notEqual(emptyPrediction<Side>(), first);
    assert.equal(used.confidence, 5);
    assert.deepEqual(emptyPrediction<Side>(), { answer: null, confidence: null, locked: false });
  });
});

describe('Confidence', () => {
  it('is a 1–5 scale with the agreed labels and no default', () => {
    assert.deepEqual(
      CONFIDENCE_LEVELS.map((l) => [l.value, l.label]),
      [
        [1, 'Just guessing'],
        [2, 'Slightly confident'],
        [3, 'Somewhat confident'],
        [4, 'Very confident'],
        [5, 'Extremely confident'],
      ],
    );
    assert.equal(confidenceLabel(4), 'Very confident');
    assert.equal(emptyPrediction().confidence, null);
  });

  it('saved attempts are validated: integers 1–5 only, and a locked attempt must be complete', () => {
    assert.ok(schema.safeParse({ answer: 'left', confidence: 3, locked: true }).success);
    assert.ok(schema.safeParse({ answer: 'left', confidence: null, locked: false }).success, 'drafts may be unrated');
    assert.ok(schema.safeParse({ answer: null, confidence: null, locked: false }).success);
    for (const confidence of [0, 6, 2.5, '3', -1]) {
      assert.equal(schema.safeParse({ answer: 'left', confidence, locked: false }).success, false, String(confidence));
    }
    assert.equal(schema.safeParse({ answer: 'left', confidence: null, locked: true }).success, false);
    assert.equal(schema.safeParse({ answer: null, confidence: 3, locked: true }).success, false);
    assert.equal(schema.safeParse({ answer: 'up', confidence: 3, locked: false }).success, false);
  });
});
