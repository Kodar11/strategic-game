/// <reference types="node" />
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { type AudioAsset, type AudioBackend, NarrationController } from '../controller.ts';

/** Records what the backend was asked to do; lets a test finish or fail the current clip. */
class FakeBackend implements AudioBackend {
  played: AudioAsset[] = [];
  stops = 0;
  pauses = 0;
  resumes = 0;
  disposed = false;
  throwOnPlay = false;
  private callbacks: { onEnd: () => void; onError: (e: unknown) => void } | null = null;
  private stale: { onEnd: () => void; onError: (e: unknown) => void }[] = [];

  play(asset: AudioAsset, onEnd: () => void, onError: (e: unknown) => void) {
    if (this.throwOnPlay) throw new Error('decoder exploded');
    if (this.callbacks) this.stale.push(this.callbacks);
    this.played.push(asset);
    this.callbacks = { onEnd, onError };
  }
  stop() {
    this.stops += 1;
  }
  pause() {
    this.pauses += 1;
  }
  resume() {
    this.resumes += 1;
  }
  dispose() {
    this.disposed = true;
  }
  finish() {
    const c = this.callbacks;
    this.callbacks = null;
    c?.onEnd();
  }
  fail() {
    const c = this.callbacks;
    this.callbacks = null;
    c?.onError(new Error('load failed'));
  }
  /** Fire callbacks from clips that were already replaced — must be ignored. */
  fireStale() {
    for (const c of this.stale) c.onEnd();
  }
}

/** Manual timers so deferred cleanup and watchdogs are deterministic. */
function manualTimers() {
  let id = 0;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      id += 1;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimer: (h: unknown) => {
      pending.delete(h as number);
    },
    /** Run every pending timer with delay <= ms. */
    run(ms = 0) {
      for (const [k, t] of [...pending]) {
        if (t.ms <= ms) {
          pending.delete(k);
          t.fn();
        }
      }
    },
  };
}

const ASSETS: Record<string, number> = { a: 1, b: 2, c: 3, react: 4 };

let backend: FakeBackend;
let timers: ReturnType<typeof manualTimers>;
let warnings: string[];
let n: NarrationController;
let backendsCreated: number;

beforeEach(() => {
  backend = new FakeBackend();
  timers = manualTimers();
  warnings = [];
  backendsCreated = 0;
  n = new NarrationController({
    createBackend: () => {
      backendsCreated += 1;
      return backend;
    },
    resolveAsset: (clip) => ASSETS[clip],
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    maxClipMs: 30_000,
    onWarn: (m) => warnings.push(m),
  });
});

const RUN = 1;

describe('Narration controller — clip selection and ordering', () => {
  it('plays the requested clip through a single shared player', () => {
    assert.equal(n.request({ clip: 'a', run: RUN, context: 10 }), true);
    assert.deepEqual(backend.played, [1]);
    assert.equal(n.playing, 'a');
    n.request({ clip: 'b', run: RUN, context: 11 });
    assert.equal(backendsCreated, 1);
  });

  it('queues lines on the same step and plays them in order without overlap', () => {
    n.request({ clip: 'a', run: RUN, context: 10, mode: 'queue' });
    n.request({ clip: 'b', run: RUN, context: 10, mode: 'queue' });
    assert.deepEqual(backend.played, [1]);
    assert.deepEqual(n.queued, ['b']);
    backend.finish();
    assert.deepEqual(backend.played, [1, 2]);
    assert.equal(n.playing, 'b');
  });

  it('a reaction replaces whatever is playing and drops the queue', () => {
    n.request({ clip: 'a', run: RUN, context: 10 });
    n.request({ clip: 'b', run: RUN, context: 10 });
    n.request({ clip: 'react', run: RUN, context: 10, mode: 'replace' });
    assert.deepEqual(backend.played, [1, 4]);
    assert.deepEqual(n.queued, []);
  });

  it('a new step stops the previous step and ignores requests from older steps', () => {
    n.request({ clip: 'a', run: RUN, context: 10 });
    n.request({ clip: 'b', run: RUN, context: 10 });
    n.request({ clip: 'c', run: RUN, context: 11 });
    assert.equal(n.playing, 'c');
    assert.deepEqual(n.queued, []);
    assert.equal(n.request({ clip: 'b', key: 'late', run: RUN, context: 10 }), false);
    assert.equal(n.playing, 'c');
  });

  it('entering a silent step stops the previous narration', () => {
    n.request({ clip: 'a', run: RUN, context: 10 });
    n.enterContext(11);
    assert.equal(n.playing, null);
    assert.equal(backend.stops, 1);
  });
});

describe('Narration controller — duplicate prevention', () => {
  it('plays each line once per run, however often it is requested (re-renders, Strict Mode)', () => {
    for (let i = 0; i < 5; i++) n.request({ clip: 'a', run: RUN, context: 10 });
    assert.deepEqual(backend.played, [1]);
    backend.finish();
    // Revisiting the step later (Back, then Continue) does not repeat it either.
    n.request({ clip: 'a', run: RUN, context: 12 });
    assert.deepEqual(backend.played, [1]);
  });

  it('distinct keys allow the same clip for distinct events (e.g. each shot)', () => {
    n.request({ clip: 'react', key: 'shot@1', run: RUN, context: 10, mode: 'replace' });
    n.request({ clip: 'react', key: 'shot@2', run: RUN, context: 10, mode: 'replace' });
    n.request({ clip: 'react', key: 'shot@2', run: RUN, context: 10, mode: 'replace' });
    assert.deepEqual(backend.played, [4, 4]);
  });

  it('rapid successive reactions leave only the newest playing', () => {
    for (let i = 1; i <= 6; i++) n.request({ clip: i % 2 ? 'a' : 'b', key: `tap${i}`, run: RUN, context: 10, mode: 'replace' });
    assert.equal(n.playing, 'b');
    assert.deepEqual(n.queued, []);
    backend.fireStale();
    // Callbacks from replaced clips never advance or restart anything.
    assert.equal(n.playing, 'b');
    assert.equal(backend.played.length, 6);
  });

  it('a new run (new lesson mount or replay) can hear its lines again', () => {
    n.request({ clip: 'a', run: 1, context: 10 });
    n.request({ clip: 'a', run: 2, context: 11 });
    assert.deepEqual(backend.played, [1, 1]);
    // An older run can never take over again.
    assert.equal(n.request({ clip: 'b', run: 1, context: 12 }), false);
  });

  it('forgetHeard lets a replayed lesson speak its intro again', () => {
    n.request({ clip: 'a', run: RUN, context: 10 });
    n.forgetHeard();
    n.request({ clip: 'a', run: RUN, context: 11 });
    assert.deepEqual(backend.played, [1, 1]);
  });
});

describe('Narration controller — mute', () => {
  it('does not play while muted, and unmuting does not replay the backlog', () => {
    n.setMuted(true);
    assert.equal(n.request({ clip: 'a', run: RUN, context: 10 }), false);
    n.setMuted(false);
    assert.deepEqual(backend.played, []);
    n.request({ clip: 'a', run: RUN, context: 10 });
    assert.deepEqual(backend.played, [], 'a line skipped while muted counts as heard');
    n.request({ clip: 'b', run: RUN, context: 10 });
    assert.deepEqual(backend.played, [2]);
  });

  it('muting stops current narration immediately and clears the queue', () => {
    n.request({ clip: 'a', run: RUN, context: 10 });
    n.request({ clip: 'b', run: RUN, context: 10 });
    n.setMuted(true);
    assert.equal(n.playing, null);
    assert.equal(backend.stops, 1);
    backend.finish();
    assert.deepEqual(backend.played, [1]);
  });

  it('replay is refused while muted and works when unmuted', () => {
    n.request({ clip: 'a', run: RUN, context: 10 });
    backend.finish();
    n.setMuted(true);
    assert.equal(n.replay('a'), false);
    n.setMuted(false);
    assert.equal(n.replay('a'), true);
    assert.deepEqual(backend.played, [1, 1]);
    assert.equal(n.replay(), true, 'replays the last line when none is given');
  });

  it('pause and resume go to the backend only while a clip is playing', () => {
    n.pause();
    assert.equal(backend.pauses, 0);
    n.request({ clip: 'a', run: RUN, context: 10 });
    n.pause();
    n.pause();
    n.resume();
    assert.equal(backend.pauses, 1);
    assert.equal(backend.resumes, 1);
  });
});

describe('Narration controller — navigation cleanup', () => {
  it('leaving a lesson stops its narration on the next tick', () => {
    n.request({ clip: 'a', run: RUN, context: 10 });
    n.request({ clip: 'b', run: RUN, context: 10 });
    n.endRun(RUN);
    timers.run(0);
    assert.equal(n.playing, null);
    assert.deepEqual(n.queued, []);
    backend.finish();
    assert.deepEqual(backend.played, [1], 'queued line never starts after leaving');
    assert.equal(n.request({ clip: 'c', run: RUN, context: 10 }), false, 'stale step request ignored');
  });

  it('a Strict Mode unmount/remount of the same lesson keeps narration going', () => {
    n.request({ clip: 'a', run: RUN, context: 10 });
    n.endRun(RUN);
    n.beginRun(RUN);
    timers.run(0);
    assert.equal(n.playing, 'a');
  });

  it("an old lesson's cleanup does not stop the next lesson's narration", () => {
    n.request({ clip: 'a', run: 1, context: 10 });
    n.request({ clip: 'b', run: 2, context: 11 });
    n.endRun(1);
    timers.run(0);
    assert.equal(n.playing, 'b');
  });
});

describe('Narration controller — failures never block', () => {
  it('a missing asset is skipped with one warning and no crash', () => {
    assert.equal(n.request({ clip: 'missing', run: RUN, context: 10 }), false);
    assert.equal(n.request({ clip: 'missing', key: 'again', run: RUN, context: 10 }), false);
    assert.equal(warnings.length, 1);
    assert.deepEqual(backend.played, []);
  });

  it('a clip that fails to load moves on to the next queued line', () => {
    n.request({ clip: 'a', run: RUN, context: 10 });
    n.request({ clip: 'b', run: RUN, context: 10 });
    backend.fail();
    assert.equal(n.playing, 'b');
    assert.equal(warnings.length, 1);
  });

  it('a backend that throws does not throw to the caller', () => {
    backend.throwOnPlay = true;
    assert.doesNotThrow(() => n.request({ clip: 'a', run: RUN, context: 10 }));
    assert.equal(n.playing, null);
  });

  it('a clip that never reports its end is released by the watchdog', () => {
    n.request({ clip: 'a', run: RUN, context: 10 });
    n.request({ clip: 'b', run: RUN, context: 10 });
    timers.run(30_000);
    assert.equal(n.playing, 'b');
  });

  it('dispose releases the player', () => {
    n.request({ clip: 'a', run: RUN, context: 10 });
    n.dispose();
    assert.equal(backend.disposed, true);
  });
});
