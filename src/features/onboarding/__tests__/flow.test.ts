/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  EMPTY_FLOW,
  HANDS,
  HOST_PREDICTION,
  READ_MAX_ROUNDS,
  READ_TARGET,
  STEPS,
  counterTo,
  firstWeek,
  hostHand,
  nextStep,
  parseFlow,
  playRead,
  predictionRight,
  previousStep,
  readStatus,
  resultOf,
  showHint,
  winsOf,
  type Hand,
  type ReadRound,
} from '../flow.ts';

const play = (hands: Hand[]) => hands.reduce<ReadRound[]>((r, h) => playRead(r, h), []);

describe('First Read: steps', () => {
  it('runs envelope → read → meaning → goal → table → plan, and stops at the plan', () => {
    assert.deepEqual([...STEPS], ['envelope', 'read', 'meaning', 'goal', 'table', 'plan']);
    assert.equal(nextStep('envelope'), 'read');
    assert.equal(nextStep('plan'), 'plan');
    assert.equal(previousStep('envelope'), null);
    assert.equal(previousStep('plan'), 'table');
  });
});

describe('First Read: the envelope', () => {
  it('the prediction is fixed before any choice, so both answers are possible', () => {
    assert.equal(predictionRight(HOST_PREDICTION), true);
    assert.equal(predictionRight(HOST_PREDICTION === 'share' ? 'take' : 'share'), false);
  });
});

describe('First Read: the Host’s habit', () => {
  it('the Host cycles Rock, Paper, Scissors', () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(hostHand), ['rock', 'paper', 'scissors', 'rock', 'paper']);
  });

  it('results follow the usual rules', () => {
    assert.equal(resultOf('paper', 'rock'), 'win');
    assert.equal(resultOf('rock', 'paper'), 'loss');
    assert.equal(resultOf('scissors', 'scissors'), 'draw');
    for (const h of HANDS) assert.equal(resultOf(counterTo(h), h), 'win');
  });

  it('reading the habit solves it in three rounds', () => {
    const rounds = play([0, 1, 2].map((i) => counterTo(hostHand(i))));
    assert.equal(winsOf(rounds), READ_TARGET);
    assert.equal(readStatus(rounds), 'solved');
    assert.equal(playRead(rounds, 'rock').length, rounds.length, 'no rounds after it is over');
  });

  it('missing the habit ends after the last round with the habit given away', () => {
    const rounds = play(Array<Hand>(READ_MAX_ROUNDS).fill('rock'));
    assert.equal(rounds.length, READ_MAX_ROUNDS);
    assert.equal(readStatus(rounds), 'revealed');
  });

  it('a hint appears after two rounds unless both were wins', () => {
    assert.equal(showHint(play(['rock'])), false);
    assert.equal(showHint(play(['rock', 'rock'])), true);
    assert.equal(showHint(play([counterTo(hostHand(0)), counterTo(hostHand(1))])), false);
  });
});

describe('First Read: the plan', () => {
  it('today is always the Qualifiers; the rival and lesson come from the content', () => {
    const days = firstWeek({ minutes: 5, rival: 'Vesper', lesson: { title: 'Reading the room' } });
    assert.deepEqual(days.map((d) => d.when), ['Today', 'Tomorrow', 'Day 3']);
    assert.equal(days[0].title, 'The Qualifiers');
    assert.match(days[1].title, /Vesper/);
    assert.equal(days[2].title, 'Reading the room');
  });

  it('a two-minute pace keeps tomorrow to the Daily; no lesson, no third day', () => {
    const days = firstWeek({ minutes: 2, rival: 'Vesper' });
    assert.equal(days.length, 2);
    assert.doesNotMatch(days[1].title, /Vesper/);
  });
});

describe('First Read: resuming', () => {
  it('reads a saved place and ignores junk', () => {
    assert.deepEqual(parseFlow(null), EMPTY_FLOW);
    assert.deepEqual(parseFlow('{oops'), EMPTY_FLOW);
    const saved = parseFlow(JSON.stringify({ step: 'goal', choice: 'take', readSolved: true, goal: 'incentives', minutes: 10, skipped: false }));
    assert.deepEqual(saved, { step: 'goal', choice: 'take', readSolved: true, goal: 'incentives', minutes: 10, skipped: false });
    const bad = parseFlow(JSON.stringify({ step: 'nope', choice: 'steal', goal: 'iq', minutes: 7 }));
    assert.deepEqual(bad, EMPTY_FLOW);
  });
});

describe('First Read: copy rules', () => {
  // The copy only: block and line comments (which state these very rules) are left out.
  const script = readFileSync(join(import.meta.dirname, '..', 'script.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('makes no claims about other players or about intelligence', () => {
    assert.doesNotMatch(script, /\d+\s*(%|in\s+10|out of)/i, 'no statistics in the copy');
    assert.doesNotMatch(script, /\b(IQ|brain score|smarter|intelligen)/i);
  });
});
