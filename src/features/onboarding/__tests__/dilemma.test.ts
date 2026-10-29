/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MOVES,
  PAYOFFS,
  alternatives,
  explainOutcome,
  lockIn,
  mayaBestReply,
  mayaDecides,
  mayaDominantMove,
  mayaReasoning,
  outcomeRows,
  payoff,
  pick,
  startRound,
  visibleMayaMove,
  type Move,
} from '../dilemma.ts';

const CELLS: [Move, Move][] = MOVES.flatMap((y) => MOVES.map((m) => [y, m] as [Move, Move]));

describe('First-session dilemma: payoffs', () => {
  it('pays exactly the published rules in every cell', () => {
    assert.deepEqual(payoff('share', 'share'), { you: 3, maya: 3 });
    assert.deepEqual(payoff('share', 'take'), { you: 0, maya: 5 });
    assert.deepEqual(payoff('take', 'share'), { you: 5, maya: 0 });
    assert.deepEqual(payoff('take', 'take'), { you: 1, maya: 1 });
  });

  it('is symmetric and a genuine prisoner’s dilemma (T > R > P > S)', () => {
    for (const [y, m] of CELLS) assert.deepEqual([payoff(y, m).you, payoff(y, m).maya], [payoff(m, y).maya, payoff(m, y).you]);
    const { you: T } = PAYOFFS.take.share;
    const { you: R } = PAYOFFS.share.share;
    const { you: P } = PAYOFFS.take.take;
    const { you: S } = PAYOFFS.share.take;
    assert.ok(T > R && R > P && P > S);
  });

  it('the rules shown before choosing list all four outcomes with the model’s numbers', () => {
    const rows = outcomeRows();
    assert.equal(rows.length, 4);
    assert.deepEqual(new Set(rows.map((r) => `${r.you}/${r.maya}`)).size, 4);
    for (const r of rows) assert.deepEqual(r.result, payoff(r.you, r.maya));
  });
});

describe('First-session dilemma: Maya’s rule', () => {
  it('her best reply to either move is to take, so taking is dominant', () => {
    assert.equal(mayaBestReply('share'), 'take');
    assert.equal(mayaBestReply('take'), 'take');
    assert.equal(mayaDominantMove(), 'take');
  });

  it('decides without any input from the learner, and the same way every time', () => {
    assert.equal(mayaDecides.length, 0);
    for (let i = 0; i < 20; i++) assert.equal(mayaDecides(), 'take');
  });

  it('her reasoning quotes the real payoffs', () => {
    assert.deepEqual(mayaReasoning(), ['If you share, taking gets her 5 coins instead of 3 coins.', 'If you take, taking gets her 1 coin instead of 0 coins.']);
  });
});

describe('First-session dilemma: a round', () => {
  it('Maya’s move is sealed at the start and hidden until the reveal', () => {
    let r = startRound();
    assert.equal(r.phase, 'choosing');
    assert.equal(visibleMayaMove(r), null);
    const sealed = r.phase === 'choosing' ? r.sealed : null;
    for (const m of ['share', 'take', 'share'] as Move[]) {
      r = pick(r, m);
      assert.equal(visibleMayaMove(r), null);
      assert.equal(r.phase === 'choosing' && r.sealed, sealed, 'changing your selection never changes her committed move');
    }
  });

  it('cannot be locked in without a choice', () => {
    const r = startRound();
    assert.equal(lockIn(r), r);
  });

  for (const you of MOVES) {
    it(`resolves "${you}" against the sealed move with the real payoff`, () => {
      const r = lockIn(pick(startRound(), you));
      assert.equal(r.phase, 'revealed');
      if (r.phase !== 'revealed') return;
      assert.equal(r.you, you);
      assert.equal(r.maya, 'take');
      assert.deepEqual(r.result, payoff(you, 'take'));
      assert.equal(visibleMayaMove(r), 'take');
    });
  }

  it('a revealed round ignores further input', () => {
    const r = lockIn(pick(startRound(), 'share'));
    assert.equal(pick(r, 'take'), r);
    assert.equal(lockIn(r), r);
  });

  it('replaying starts clean and resolves identically', () => {
    const results = Array.from({ length: 5 }, () => lockIn(pick(startRound(), 'share')));
    for (const r of results) assert.deepEqual(r, results[0]);
    const fresh = startRound();
    assert.equal(fresh.phase === 'choosing' && fresh.pick, null);
  });
});

describe('First-session dilemma: explanations', () => {
  it('every outcome has its own explanation, quoting its own numbers', () => {
    const seen = new Set<string>();
    for (const [y, m] of CELLS) {
      const e = explainOutcome(y, m);
      const r = payoff(y, m);
      assert.ok(e.happened.includes(String(r.you)), `${y}/${m} mentions your coins`);
      assert.ok(!seen.has(e.happened));
      seen.add(e.happened);
    }
  });

  it('matches the example wording for share vs take', () => {
    assert.match(explainOutcome('share', 'take').happened, /^You chose to share, but Maya chose to take\./);
  });

  it('alternatives are hypothetical cells, never the actual one, with the model’s numbers', () => {
    for (const [y, m] of CELLS) {
      const alts = alternatives(y, m);
      assert.ok(alts.length >= 1);
      for (const a of alts) {
        assert.ok(!(a.you === y && a.maya === m), 'not the actual outcome');
        assert.ok(a.text.includes(String(payoff(a.you, a.maya).you)));
      }
    }
  });

  it('always offers "both shared" unless that is what happened', () => {
    assert.equal(alternatives('share', 'take')[0].title, 'What if you had both shared?');
    assert.match(alternatives('share', 'take')[0].text, /^3 coins each — 6 in total, against the 5/);
    assert.match(alternatives('take', 'take')[0].text, /against the 2 you two actually got/);
    assert.ok(alternatives('share', 'share').every((a) => !(a.you === 'share' && a.maya === 'share')));
  });

  it('the "other move" alternative keeps Maya’s actual move', () => {
    const [, alt] = alternatives('share', 'take');
    assert.deepEqual([alt.you, alt.maya], ['take', 'take']);
    assert.match(alt.text, /you’d get 1 coin instead of 0 coins/);
  });
});

describe('First-session dilemma: isolation', () => {
  it('the model imports nothing — no saved progress, no game engines', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../dilemma.ts', import.meta.url), 'utf8');
    assert.equal(/^\s*import\s/m.test(source), false);
  });
});
