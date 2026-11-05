import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Telemetry, type TelemetryClient } from '../core.ts';
import type { EventName } from '../events.ts';
import { type Emit, LessonTracker, type MatchMeta, MatchTracker } from '../lifecycle.ts';
import { screenOf } from '../routes.ts';

const ALICE = '00000000-0000-4000-8000-0000000000a1';

function recorder() {
  const events: [EventName, Record<string, unknown>][] = [];
  const emit: Emit = (name, props) => void events.push([name, props as Record<string, unknown>]);
  return { events, emit, names: () => events.map((e) => e[0]) };
}

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (s: number) => void (t += s * 1000) };
}

const META: MatchMeta = { game_id: 'liars-dice', system: 'arena', mode: 'practice', level: 'normal', variant: 'standard', length: 'short', mystery: true };
const p = (round: number, finished = false, outcome: 'win' | 'draw' | 'loss' | null = null) => ({ round, roundsTotal: 5, finished, outcome });

describe('match lifecycle', () => {
  it('started once, finished once with outcome, rounds and duration; no exit after finishing', () => {
    const r = recorder();
    const c = clock();
    const m = new MatchTracker(r.emit, c.now);
    m.update(META, p(0));
    m.update(META, p(0));
    m.update(META, p(3));
    c.advance(95);
    m.update(META, p(5, true, 'win'));
    m.update(META, p(5, true, 'win'));
    m.close();
    assert.deepEqual(r.names(), ['game_started', 'game_finished']);
    assert.deepEqual(r.events[0][1], { ...META, resumed: false });
    assert.deepEqual(r.events[1][1], { ...META, outcome: 'win', rounds: 5, duration_s: 95 });
  });

  it('leaving mid-match is one exit with the round reached', () => {
    const r = recorder();
    const c = clock();
    const m = new MatchTracker(r.emit, c.now);
    m.update(META, p(0));
    m.update(META, p(2));
    c.advance(40);
    m.close();
    m.close();
    assert.deepEqual(r.names(), ['game_started', 'game_exited']);
    assert.deepEqual(r.events[1][1], { ...META, round: 2, rounds_total: 5, duration_s: 40 });
  });

  it('a server match: nothing until it loads; a resumed match says so; a finished one opened later sends nothing', () => {
    const r = recorder();
    const m = new MatchTracker(r.emit);
    m.update(null, p(0));
    assert.equal(r.events.length, 0);
    m.update({ ...META, mode: 'ranked', attempt_number: 2 }, p(3));
    assert.equal(r.events[0][1].resumed, true);
    assert.equal(r.events[0][1].attempt_number, 2);

    const look = recorder();
    const done = new MatchTracker(look.emit);
    done.update({ ...META, mode: 'ranked' }, p(5, true, 'loss'));
    done.close();
    assert.equal(look.events.length, 0);
  });

  it('closing before the match was known sends nothing', () => {
    const r = recorder();
    const m = new MatchTracker(r.emit);
    m.update(null, p(0));
    m.close();
    assert.equal(r.events.length, 0);
  });
});

describe('lesson lifecycle', () => {
  const make = (r: ReturnType<typeof recorder>, c: ReturnType<typeof clock>, opts: { completed?: () => boolean } = {}) =>
    new LessonTracker({
      emit: r.emit,
      info: { lesson_id: 'best-response', lesson_number: 3, module: 'm1' },
      totalSteps: 6,
      completedBefore: opts.completed ?? (() => false),
      source: () => 'learn',
      now: c.now,
    });

  it('a first run: started from where it was opened, completed once at the last step', () => {
    const r = recorder();
    const c = clock();
    const l = make(r, c);
    for (const s of [0, 1, 2, 3, 4]) l.update(s);
    c.advance(480);
    l.update(5);
    l.update(5);
    l.close();
    assert.deepEqual(r.names(), ['lesson_started', 'lesson_completed']);
    assert.deepEqual(r.events[0][1], { lesson_id: 'best-response', lesson_number: 3, module: 'm1', is_replay: false, resumed: false, source: 'learn' });
    assert.deepEqual(r.events[1][1], { lesson_id: 'best-response', lesson_number: 3, module: 'm1', is_replay: false, duration_s: 480 });
  });

  it('leaving part-way is an exit at that step; reopening resumes', () => {
    const r = recorder();
    const c = clock();
    const l = make(r, c);
    l.update(0);
    l.update(2);
    c.advance(60);
    l.close();
    assert.deepEqual(r.events[1], ['lesson_exited', { lesson_id: 'best-response', lesson_number: 3, module: 'm1', step: 2, total_steps: 6, duration_s: 60 }]);

    const again = recorder();
    make(again, c).update(2);
    assert.equal(again.events[0][1].resumed, true);
  });

  it('Restart after finishing is a new replay run', () => {
    const r = recorder();
    let done = false;
    const l = make(r, clock(), { completed: () => done });
    l.update(0);
    l.update(5);
    done = true;
    l.update(0);
    l.update(5);
    assert.deepEqual(r.names(), ['lesson_started', 'lesson_completed', 'lesson_started', 'lesson_completed']);
    assert.equal(r.events[2][1].is_replay, true);
    assert.equal(r.events[3][1].is_replay, true);
  });
});

describe('a scripted first session through the engine', () => {
  it('guest onboarding → lesson → game → sign-in → sign-out: the right events, one identity change each way', () => {
    const calls: [string, ...unknown[]][] = [];
    const rec =
      (n: string) =>
      (...a: unknown[]) =>
        void calls.push([n, ...a]);
    const client: TelemetryClient = {
      capture: rec('capture'),
      screen: rec('screen'),
      captureException: rec('exception'),
      addExceptionStep: () => undefined,
      identify: rec('identify'),
      reset: rec('reset'),
      optIn: () => undefined,
      optOut: () => undefined,
      register: () => undefined,
    };
    const t = new Telemetry();
    const emit: Emit = (name, props) => t.track(name, props);
    t.setUser(null);
    t.track('app_ready', { result: 'ready', total_ms: 2400, signed_in: false, onboarded: false });
    t.install(client);
    t.screen(screenOf(['onboarding'], {}));
    t.track('onboarding_step', { step: 'welcome' });
    t.track('onboarding_finished', { result: 'completed', at_step: 'map', choice: 'share', next: 'lesson' });
    t.screen(screenOf(['lesson', '[lessonId]'], { lessonId: 'cooperation-trap' }));
    const lesson = new LessonTracker({ emit, info: { lesson_id: 'cooperation-trap' }, totalSteps: 3, completedBefore: () => false, source: () => 'onboarding' });
    lesson.update(0);
    lesson.update(2);
    t.screen(screenOf(['games', 'play'], { game: 'split-steal' }));
    const meta: MatchMeta = { game_id: 'split-steal', system: 'classic', mode: 'practice', level: 'medium', mystery: false };
    const match = new MatchTracker(emit);
    match.update(meta, { round: 0, roundsTotal: 10, finished: false, outcome: null });
    match.update(meta, { round: 10, roundsTotal: 10, finished: true, outcome: 'loss' });
    t.track('sign_in_started', { source: 'invite' });
    t.setUser(ALICE);
    t.track('sign_in_finished', { source: 'invite', result: 'success', is_new_account: true, method: 'browser' });
    t.track('signed_out', { forced: false });
    t.setUser(null);

    const sequence = calls.filter((c) => c[0] !== 'screen').map((c) => (c[0] === 'capture' ? c[1] : c[0]));
    assert.deepEqual(sequence, [
      'app_ready',
      'onboarding_step',
      'onboarding_finished',
      'lesson_started',
      'lesson_completed',
      'game_started',
      'game_finished',
      'sign_in_started',
      'identify',
      'sign_in_finished',
      'signed_out',
      'reset',
    ]);
    assert.deepEqual(
      calls.filter((c) => c[0] === 'screen').map((c) => c[1]),
      ['onboarding', 'lesson', 'match'],
    );
  });
});
