/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { encounterSound, roomCue, stepCue } from '../meridian/direction.ts';
import { ROOMS, STARTER_DESIGN, replayFrames, runRoom, yours } from '../meridian/engine.ts';
import { STEPS } from '../meridian/run.ts';

describe('tournament replay', () => {
  for (const room of Object.values(ROOMS)) {
    it(`${room.id}: the last frame is exactly the real standings`, () => {
      const t = runRoom(room, yours(STARTER_DESIGN.mirror));
      const last = replayFrames(t).at(-1)!.order;
      assert.deepEqual(last.map((x) => x.id), t.standings.map((s) => s.id));
      last.forEach((x, i) => assert.ok(Math.abs(x.score - t.standings[i].score) < 1e-9, x.id));
    });
  }

  it('reveals every pairing exactly once, including each twin match', () => {
    const t = runRoom(ROOMS.open, yours(STARTER_DESIGN['iron-wall']));
    const n = t.ids.length;
    const pairs = replayFrames(t).slice(1).map((f) => f.pair!);
    assert.equal(pairs.length, (n * (n + 1)) / 2);
    assert.equal(new Set(pairs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)].join(':'))).size, pairs.length);
  });

  it('each frame only counts pairings revealed so far', () => {
    const t = runRoom(ROOMS.open, yours(STARTER_DESIGN.mirror));
    const frames = replayFrames(t);
    assert.ok(frames[0].order.every((x) => x.score === 0));
    const [a, b] = frames[1].pair!;
    for (const x of frames[1].order) {
      if (x.index === a) assert.equal(x.score, t.avg[a][b]);
      else if (x.index === b) assert.equal(x.score, t.avg[b][a]);
      else assert.equal(x.score, 0);
    }
  });

  it('the table really does move: the leader changes during the Open Trials', () => {
    const frames = replayFrames(runRoom(ROOMS.open, yours(STARTER_DESIGN.mirror)));
    assert.ok(new Set(frames.slice(5).map((f) => f.order[0].id)).size > 1);
  });
});

describe('sound follows the mechanics', () => {
  it('each outcome of a round has its own sound', () => {
    assert.equal(encounterSound('C', 'C'), 'accord');
    assert.equal(encounterSound('D', 'D'), 'clash');
    assert.equal(encounterSound('C', 'D'), 'take');
    assert.equal(encounterSound('D', 'C'), 'take');
  });

  it('every step has a cue, and the three halls sound different from each other and from the opening', () => {
    for (const s of STEPS) assert.ok(stepCue(s).music);
    const halls = new Set((['friendly', 'hostile', 'noisy', 'open'] as const).map((r) => roomCue(r).music));
    assert.equal(halls.size, 4);
    assert.ok(roomCue('noisy').beds.fog > 0, 'fog is audible only in the room that has noise');
    assert.equal(roomCue('hostile').beds.fog, undefined);
  });
});
