/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { allPlans } from '../crossing/narration.ts';
import { beatTiming, decisionPending, isFinalBeat, previous, progressIndex } from '../crossing/playback.ts';
import { type Beat, type Choices, type Position, START, beatAt, choose, next } from '../crossing/story.ts';
import { AdvanceGate, readingMs } from '../playback.ts';

/** A manual clock: timers fire only when time is moved on. */
function clock() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        timers.set(++id, { at: now + ms, fn });
        return id;
      },
      clear: (h: unknown) => void timers.delete(h as number),
    },
    run(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
    pending: () => timers.size,
  };
}

function rig() {
  const c = clock();
  const state = { speaking: false, fired: 0 };
  const gate = new AdvanceGate(() => state.speaking, () => void state.fired++, c.timers);
  return { c, state, gate };
}

const T = { minMs: 2000, breathMs: 700 };

describe('the advance gate', () => {
  it('waits for the minimum time and a breath, then fires exactly once', () => {
    const { c, state, gate } = rig();
    gate.arm(T);
    c.run(2699);
    assert.equal(state.fired, 0);
    c.run(1);
    assert.equal(state.fired, 1);
    c.run(60_000);
    assert.equal(state.fired, 1);
    assert.equal(c.pending(), 0);
  });

  it('never moves on while a voice is speaking, however long it takes', () => {
    const { c, state, gate } = rig();
    state.speaking = true;
    gate.arm(T);
    c.run(600_000);
    assert.equal(state.fired, 0);
    state.speaking = false;
    gate.speechChanged();
    c.run(699);
    assert.equal(state.fired, 0);
    c.run(1);
    assert.equal(state.fired, 1);
  });

  it('waits again when a queued line follows, or a voice starts late', () => {
    const { c, state, gate } = rig();
    gate.arm(T);
    c.run(2300);
    state.speaking = true;
    gate.speechChanged();
    c.run(5000);
    assert.equal(state.fired, 0);
    state.speaking = false;
    gate.speechChanged();
    c.run(300);
    state.speaking = true;
    gate.speechChanged();
    c.run(5000);
    assert.equal(state.fired, 0);
  });

  it('holds the minimum even when a short line ends first', () => {
    const { c, state, gate } = rig();
    state.speaking = true;
    gate.arm(T);
    c.run(500);
    state.speaking = false;
    gate.speechChanged();
    c.run(2100);
    assert.equal(state.fired, 0);
    c.run(100);
    assert.equal(state.fired, 1);
  });

  it('does not fire if a voice began in the same moment as the breath ended', () => {
    const { c, state, gate } = rig();
    gate.arm(T);
    c.run(2000);
    state.speaking = true; // no notification yet
    c.run(700);
    assert.equal(state.fired, 0);
  });

  it('cancelling leaves nothing behind: no stale advance, no live timers', () => {
    const { c, state, gate } = rig();
    gate.arm(T);
    c.run(2100);
    gate.cancel();
    assert.equal(c.pending(), 0);
    c.run(60_000);
    gate.speechChanged();
    c.run(60_000);
    assert.equal(state.fired, 0);
  });

  it('re-arming replaces the old wait, so rapid changes can’t advance twice', () => {
    const { c, state, gate } = rig();
    for (let i = 0; i < 20; i++) {
      gate.arm(T);
      c.run(100);
    }
    assert.ok(c.pending() <= 1);
    c.run(2700);
    assert.equal(state.fired, 1);
  });

  it('after firing it stays quiet until armed again', () => {
    const { c, state, gate } = rig();
    gate.arm(T);
    c.run(2700);
    assert.equal(gate.isArmed, false);
    state.speaking = true;
    gate.speechChanged();
    state.speaking = false;
    gate.speechChanged();
    c.run(10_000);
    assert.equal(state.fired, 1);
  });
});

/** Every position in a run, in order. */
function positions(plan: Choices) {
  const out: { pos: Position; c: Choices; beat: Beat }[] = [];
  let pos: Position = START;
  let c: Choices = {};
  for (let guard = 0; guard < 600; guard++) {
    const beat = beatAt(pos, c)!;
    out.push({ pos, c, beat });
    if (beat.kind === 'choice') {
      const r = choose(pos, c, beat.id, plan[beat.id] as string)!;
      pos = r.pos;
      c = r.choices;
      continue;
    }
    const n = next(pos, c);
    if (!n) return out;
    pos = n;
  }
  throw new Error('did not finish');
}

const kind: Choices = { open: 'plain', basket: 'full', rope: 'all', answer: 'empty', again: 'stop', load: 'agreed', signal: 'ask', offer: 'ask', after: 'staged' };

describe('going back through Story One', () => {
  it('on every path, previous is the exact reverse of next', () => {
    let checked = 0;
    for (const plan of allPlans()) {
      const run = positions(plan);
      const final = run.at(-1)!.c;
      for (let i = 1; i < run.length; i++) {
        assert.deepEqual(previous(run[i].pos, final), run[i - 1].pos);
        assert.deepEqual(next(run[i - 1].pos, final), run[i].pos);
        checked++;
      }
    }
    assert.ok(checked > 100_000);
  });

  it('stops at the first beat', () => {
    assert.equal(previous(START, kind), null);
  });

  it('skips scenes this run never saw', () => {
    const c: Choices = { ...kind, answer: 'half', again: undefined };
    const first = positions(c).find((x) => x.pos.scene === 'f')!;
    assert.equal(previous(first.pos, c)!.scene, 'e');
  });

  it('a decision already made can’t be made again, or reversed by going back', () => {
    const run = positions(kind);
    const final = run.at(-1)!.c;
    const choice = run.find((x) => x.beat.kind === 'choice' && x.beat.id === 'basket')!;
    assert.equal(decisionPending(choice.beat, final), false);
    assert.equal(choose(choice.pos, final, 'basket', 'short'), null);
    assert.equal(final.basket, 'full');
    // From a revisited choice, moving on carries on past it.
    assert.deepEqual(next(choice.pos, final), { scene: choice.pos.scene, beat: choice.pos.beat + 1 });
  });

  it('progress always increases along a run', () => {
    const run = positions(kind);
    const final = run.at(-1)!.c;
    run.forEach((x, i) => assert.equal(progressIndex(x.pos, final), i));
  });
});

describe('where autoplay must stop', () => {
  it('stops at every decision that is still open, on every path', () => {
    for (const plan of allPlans()) {
      for (const { beat, c } of positions(plan)) {
        if (beat.kind === 'choice') assert.equal(decisionPending(beat, c), true);
        else assert.equal(decisionPending(beat, c), false);
      }
    }
  });

  it('can’t move past an open decision even if asked', () => {
    const run = positions(kind);
    const choice = run.find((x) => x.beat.kind === 'choice')!;
    assert.deepEqual(next(choice.pos, choice.c), choice.pos);
  });

  it('only the very last beat counts as final, on every ending', () => {
    for (const offer of ['staged', 'alone', 'keep'] as const) {
      const c: Choices = { ...kind, offer, after: undefined };
      const run = positions(c);
      const final = run.at(-1)!.c;
      run.forEach((x, i) => assert.equal(isFinalBeat(x.pos, final), i === run.length - 1));
      assert.equal(run.at(-1)!.pos.scene, 'h');
    }
  });
});

describe('beat timing', () => {
  const beat = (text: string, who = 'narrator') => ({ ...positions(kind)[0].beat, text, who }) as Beat;

  it('gives silent lines reading time in proportion to their length, within limits', () => {
    const short = beatTiming(beat('Right.'), null, false, false).minMs;
    const long = beatTiming(beat('x'.repeat(200)), null, false, false).minMs;
    assert.ok(short >= 2000 && long > short);
    assert.equal(readingMs('x'.repeat(9000)), 16000);
  });

  it('waits for pictures that take time to arrive', () => {
    const a = positions(kind)[0].beat;
    const moved = { ...a, stage: { ...a.stage, basket: 'middle' as const } };
    assert.ok(beatTiming(moved, a, true, false).minMs >= 2600);
    assert.ok(beatTiming(a, a, true, true).minMs >= 2400);
  });

  it('leaves a longer silence after an insight or the note', () => {
    assert.ok(beatTiming(beat('x', 'insight'), null, true, false).breathMs > beatTiming(beat('x'), null, true, false).breathMs);
    assert.ok(beatTiming(beat('x', 'note'), null, true, false).breathMs > beatTiming(beat('x'), null, true, false).breathMs);
  });
});
