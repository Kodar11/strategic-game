import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { DEFAULT_HOST, resolveConfig } from '../config.ts';
import { SAME_ERROR_LIMIT, SESSION_ERROR_LIMIT, Telemetry, type TelemetryClient, errorCode, normalizeError } from '../core.ts';
import { EVENTS, type EventName, SCREENS, isSendable } from '../events.ts';
import { BANNED_KEYS, ERROR_CONTEXT, cleanProps, isBannedKey, scrubMessage } from '../privacy.ts';
import { routeKey, screenOf } from '../routes.ts';

const ALICE = '00000000-0000-4000-8000-0000000000a1';
const BOB = '00000000-0000-4000-8000-0000000000b2';

type Call = [string, ...unknown[]];

function fakeClient(opts: { throwOn?: string } = {}) {
  const calls: Call[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      if (opts.throwOn === name) throw new Error(`${name} exploded`);
      calls.push([name, ...args]);
    };
  const client: TelemetryClient = {
    capture: rec('capture'),
    screen: rec('screen'),
    captureException: rec('captureException'),
    addExceptionStep: rec('step'),
    identify: rec('identify'),
    reset: rec('reset'),
    optIn: rec('optIn'),
    optOut: rec('optOut'),
    register: rec('register'),
  };
  const named = (n: string) => calls.filter((c) => c[0] === n);
  return { client, calls, named };
}

function onTelemetry() {
  const warnings: string[] = [];
  const t = new Telemetry((m) => warnings.push(m));
  const f = fakeClient();
  t.install(f.client);
  f.calls.length = 0;
  return { t, ...f, warnings };
}

describe('event catalogue', () => {
  it('no event allows a banned property name', () => {
    for (const [name, spec] of Object.entries(EVENTS)) {
      for (const k of Object.keys(spec.props)) assert.ok(!isBannedKey(k), `${name}.${k} is a banned name`);
    }
    for (const k of Object.keys(ERROR_CONTEXT)) assert.ok(!isBannedKey(k), `error context ${k} is a banned name`);
  });

  it('every event documents its trigger and privacy class; reserved billing events cannot be sent', () => {
    for (const [name, spec] of Object.entries(EVENTS)) {
      assert.ok(spec.trigger.length > 5, `${name} has no trigger`);
      assert.ok(['behaviour', 'account', 'performance', 'reserved'].includes(spec.privacy));
    }
    for (const n of ['paywall_viewed', 'plan_selected', 'checkout_started', 'checkout_result', 'purchase_restored']) assert.equal(isSendable(n), false);
    assert.equal(isSendable('lesson_started'), true);
    assert.equal(isSendable('made_up_event'), false);
    assert.equal(isSendable('__proto__'), false);
  });

  it('is a deliberate list: adding or removing an event changes this snapshot', () => {
    assert.deepEqual(Object.keys(EVENTS).sort(), [
      'account_deleted', 'analytics_opted_out', 'app_ready', 'challenge_link_created', 'challenge_link_opened', 'checkout_result',
      'checkout_started', 'checkpoint_submitted', 'daily_submitted', 'game_exited', 'game_finished', 'game_started', 'lesson_completed',
      'lesson_exited', 'lesson_started', 'nickname_set', 'onboarding_finished', 'onboarding_step', 'paywall_viewed', 'plan_selected',
      'purchase_restored', 'reflection_link_opened', 'scenario_completed', 'sign_in_finished', 'sign_in_invite_dismissed',
      'sign_in_started', 'signed_out', 'story_finished', 'story_started',
    ]);
  });
});

describe('privacy rules', () => {
  it('bans sensitive names, including inside compound names, but keeps the defined ids', () => {
    for (const k of ['email', 'user_email', 'nickname', 'answer', 'confidence', 'reflection_text', 'access_token', 'refresh_token', 'seed', 'persona', 'request_body', 'Authorization', 'hidden_role'])
      assert.ok(isBannedKey(k), k);
    for (const k of ['game_id', 'lesson_id', 'story_id', 'ending_id', 'outcome', 'mode', 'duration_s']) assert.ok(!isBannedKey(k), k);
    assert.ok(BANNED_KEYS.length >= 17);
  });

  it('keeps only listed, well-typed properties', () => {
    const spec = EVENTS.game_finished.props;
    const { props, dropped } = cleanProps(spec, {
      game_id: 'liars-dice',
      outcome: 'win',
      rounds: 7,
      mystery: true,
      level: 'Hard level, I picked it because…',
      duration_s: 12.5,
      persona: 'calculator',
      seed: 1234,
      extra: 'x',
      nested: { a: 1 },
      email: 'a@b.co',
    });
    assert.deepEqual(props, { game_id: 'liars-dice', outcome: 'win', rounds: 7, mystery: true });
    assert.equal(dropped.length, 7);
  });

  it('refuses free text, emails, long numbers and over-long strings in id properties, and unlisted enum values', () => {
    const spec = { a: 'id', b: ['win', 'loss'] } as const;
    for (const bad of ['two words', 'me@example.com', 'x'.repeat(65), 'order-1234567890', '', '../etc']) assert.deepEqual(cleanProps(spec, { a: bad }).props, {}, bad);
    assert.deepEqual(cleanProps(spec, { b: 'tie' }).props, {});
    assert.deepEqual(cleanProps(spec, ['a']).props, {});
    assert.deepEqual(cleanProps(spec, null).props, {});
  });

  it('scrubs error messages', () => {
    const m = scrubMessage('failed for me@example.com with eyJhbGciOi.eyJzdWIiOi.abc123 key sb_publishable_abc and 9876543210 at https://x.co/a?token=1\nline two');
    for (const leak of ['me@example.com', 'eyJ', 'sb_publishable', '9876543210', 'token=1', '\n']) assert.ok(!m.includes(leak), `${leak} in ${m}`);
    assert.ok(scrubMessage('x'.repeat(500)).length <= 160);
  });
});

describe('configuration', () => {
  const base = { platform: 'android', enabledFlag: 'true', apiKey: 'phc_abc', host: 'https://eu.i.posthog.com', environment: 'production', replaySampleRate: undefined, gitSha: 'abcdef1234567890' };

  it('is on only with the explicit flag, a project key and a native platform', () => {
    const on = resolveConfig(base);
    assert.equal(on.enabled, true);
    if (on.enabled) {
      assert.equal(on.environment, 'production');
      assert.equal(on.replaySampleRate, 0, 'session replay is off unless a rate is configured');
      assert.equal(on.gitSha, 'abcdef123456');
    }
    assert.deepEqual(resolveConfig({ ...base, platform: 'web' }), { enabled: false, reason: 'web', environment: 'production' });
    for (const flag of [undefined, '', '1', 'TRUE', 'yes']) assert.equal(resolveConfig({ ...base, enabledFlag: flag }).enabled, false);
    assert.equal(resolveConfig({ ...base, apiKey: '  ' }).enabled, false);
  });

  it('refuses a personal API key and a non-https host', () => {
    assert.deepEqual(resolveConfig({ ...base, apiKey: 'phx_secret' }), { enabled: false, reason: 'personal_key', environment: 'production' });
    assert.equal(resolveConfig({ ...base, host: 'http://eu.i.posthog.com' }).enabled, false);
    assert.equal(resolveConfig({ ...base, host: 'https://eu.i.posthog.com/path?x' }).enabled, false);
  });

  it('defaults to the EU host, development environment and clamps the replay rate', () => {
    const c = resolveConfig({ ...base, host: undefined, environment: undefined, replaySampleRate: '7' });
    assert.ok(c.enabled);
    if (c.enabled) {
      assert.equal(c.host, DEFAULT_HOST);
      assert.equal(c.environment, 'development');
      assert.equal(c.replaySampleRate, 1);
    }
    const bad = resolveConfig({ ...base, environment: 'staging', replaySampleRate: 'abc' });
    assert.ok(bad.enabled && bad.environment === 'development' && bad.replaySampleRate === 0);
  });
});

describe('screens', () => {
  it('normalizes routes and keeps only named ids', () => {
    assert.equal(routeKey(['(tabs)']), '');
    assert.equal(routeKey(['(tabs)', 'games']), 'games');
    assert.deepEqual(screenOf(['(tabs)'], {}), { screen: 'learn', props: {}, key: 'learn' });
    assert.deepEqual(screenOf(['lesson', '[lessonId]'], { lessonId: 'cooperation-trap', utm: 'x' }), { screen: 'lesson', props: { lesson_id: 'cooperation-trap' }, key: 'lesson|cooperation-trap' });
    assert.deepEqual(screenOf(['arena', 'play'], { game: 'market', persona: 'mystery', seed: '9' })?.props, { game_id: 'market' });
    assert.deepEqual(screenOf(['challenge', '[token]'], { token: 'secret-token' }), { screen: 'friend_challenge', props: {}, key: 'friend_challenge' });
    assert.equal(screenOf(['auth-callback'], { code: 'x' }), null);
    assert.equal(screenOf(['+not-found'], {}), null);
  });

  it('every app route is either a tracked screen or deliberately ignored', () => {
    const root = join(import.meta.dirname, '..', '..', '..', 'app');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx$/.test(f) && !f.startsWith('_') && !f.startsWith('+')) files.push(p.slice(root.length + 1).replace(/\\/g, '/').replace(/\.tsx$/, ''));
      }
    };
    walk(root);
    const ignored = new Set(['auth-callback']);
    for (const f of files) {
      const segs = f.split('/');
      if (ignored.has(routeKey(segs))) continue;
      const view = screenOf(segs, {});
      assert.ok(view, `${f} is neither tracked nor ignored`);
      assert.ok((SCREENS as readonly string[]).includes(view!.screen));
    }
  });
});

describe('telemetry engine', () => {
  it('sends catalogued events with cleaned properties and leaves a breadcrumb', () => {
    const { t, named } = onTelemetry();
    t.track('lesson_completed', { lesson_id: 'best-response', duration_s: 300, is_replay: false });
    assert.deepEqual(named('capture'), [['capture', 'lesson_completed', { lesson_id: 'best-response', duration_s: 300, is_replay: false }]]);
    assert.equal(named('step').length, 1);
  });

  it('refuses unknown and reserved events, and drops bad properties with a development warning', () => {
    const { t, named, warnings } = onTelemetry();
    t.track('not_an_event' as EventName);
    t.track('paywall_viewed', { placement: 'learn' });
    t.track('game_started', { game_id: 'rps', ...({ nickname: 'Tanmay' } as object) });
    assert.deepEqual(named('capture'), [['capture', 'game_started', { game_id: 'rps' }]]);
    assert.ok(warnings.some((w) => w.includes('nickname')));
  });

  it('buffers before the SDK is ready and replays; drops the buffer if telemetry turns out to be off', () => {
    const t = new Telemetry();
    t.track('app_ready', { result: 'ready', total_ms: 900 });
    t.screen({ screen: 'learn', props: {}, key: 'learn' });
    const f = fakeClient();
    t.install(f.client);
    assert.equal(f.named('capture').length, 1);
    assert.equal(f.named('screen').length, 1);

    const off = new Telemetry();
    off.track('app_ready', { result: 'ready' });
    off.disable('switched_off');
    off.track('lesson_started', { lesson_id: 'x' });
    const g = fakeClient();
    assert.equal(off.active, false);
    assert.equal(g.calls.length, 0);
  });

  it('a disabled engine is a no-op and never throws', () => {
    const t = new Telemetry();
    t.disable('web');
    assert.doesNotThrow(() => {
      t.track('lesson_started', { lesson_id: 'x' });
      t.screen({ screen: 'learn', props: {}, key: 'learn' });
      t.reportError('rpc_failed', new Error('x'));
      t.setUser(ALICE);
      t.setConsent(false);
      t.setSuperProps({ content_revision: 3 });
    });
  });

  it('never lets an SDK failure reach the app', () => {
    const warnings: string[] = [];
    const t = new Telemetry((m) => warnings.push(m));
    const f = fakeClient({ throwOn: 'capture' });
    t.install(f.client);
    assert.doesNotThrow(() => t.track('nickname_set'));
    assert.ok(warnings.some((w) => w.includes('exploded')));
    const g = fakeClient({ throwOn: 'register' });
    assert.doesNotThrow(() => new Telemetry().install(g.client));
  });

  it('a screen is one view until it changes', () => {
    const { t, named } = onTelemetry();
    const v = screenOf(['lesson', '[lessonId]'], { lessonId: 'voting' });
    t.screen(v);
    t.screen(v);
    t.screen(screenOf(['lesson', '[lessonId]'], { lessonId: 'auctions' }));
    t.screen(screenOf(['settings'], {}));
    assert.deepEqual(named('screen').map((c) => c[1]), ['lesson', 'lesson', 'settings']);
    assert.equal(t.currentScreen, 'settings');
    assert.equal(t.previousScreen, 'lesson');
  });
});

describe('handled errors', () => {
  it('groups by kind and code, attaches safe context, and never sends the database detail', () => {
    const { t, named } = onTelemetry();
    t.screen(screenOf(['daily', 'play'], {}));
    t.reportError('rpc_failed', new Error('Could not find the function public.get_daily_history for user me@example.com'), { rpc: 'get_daily_history', error_code: 'PGRST202', answer: 'B', detail: 'secret' });
    const [, err, props] = named('captureException')[0] as [string, Error, Record<string, unknown>];
    assert.ok(!err.message.includes('me@example.com'));
    assert.deepEqual(props, { rpc: 'get_daily_history', error_code: 'PGRST202', route: 'daily_play', error_kind: 'rpc_failed', error_level: 'error', handled: true, $exception_fingerprint: 'rpc_failed:PGRST202' });
  });

  it('reports the same problem at most 3 times and 50 reports per session', () => {
    const { t, named } = onTelemetry();
    for (let i = 0; i < 10; i++) t.reportError('sync_failed', new Error(`attempt ${i}`), { sync_phase: 'error' });
    assert.equal(named('captureException').length, SAME_ERROR_LIMIT);
    for (let i = 0; i < 200; i++) t.reportError('rpc_failed', new Error('x'), { error_code: `C${String(i).padStart(3, '0')}` });
    assert.equal(named('captureException').length, SESSION_ERROR_LIMIT);
  });

  it('normalizes thrown values and reads error codes', () => {
    assert.equal(normalizeError('boom', 'audio_failed').message, 'boom');
    assert.equal(normalizeError(undefined, 'audio_failed').message, 'audio_failed');
    assert.equal(normalizeError(new TypeError('x is undefined'), 'render_error').name, 'TypeError');
    assert.equal(errorCode('PGRST202: Could not find'), 'PGRST202');
    assert.equal(errorCode('P0001: daily:not_found'), 'P0001');
    assert.equal(errorCode('something went wrong'), undefined);
    assert.equal(errorCode(undefined), undefined);
  });
});

describe('identity and consent', () => {
  it('guest → sign-in identifies; restoring the same user again changes nothing', () => {
    const { t, named } = onTelemetry();
    t.setUser(null);
    assert.equal(named('identify').length, 0);
    t.setUser(ALICE);
    t.setUser(ALICE);
    assert.deepEqual(named('identify'), [['identify', ALICE]]);
    assert.equal(named('reset').length, 0, 'a guest becoming a user keeps the guest history');
    assert.deepEqual(named('register').at(-1), ['register', { auth_state: 'signed_in' }]);
  });

  it('sign-out resets; switching accounts resets before identifying the next one', () => {
    const { t, calls } = onTelemetry();
    t.setUser(ALICE);
    calls.length = 0;
    t.setUser(BOB);
    assert.deepEqual(calls.map((c) => c[0]), ['reset', 'optIn', 'register', 'identify']);
    assert.equal(calls.at(-1)?.[1], BOB);
    calls.length = 0;
    t.setUser(null);
    assert.deepEqual(calls.map((c) => c[0]), ['reset', 'optIn', 'register']);
  });

  it('never identifies with something that is not a user id', () => {
    const { t, named } = onTelemetry();
    t.setUser('me@example.com');
    assert.equal(named('identify').length, 0);
  });

  it('identity set before the SDK is ready is applied at install', () => {
    const t = new Telemetry();
    t.setUser(ALICE);
    const f = fakeClient();
    t.install(f.client);
    assert.deepEqual(f.named('identify'), [['identify', ALICE]]);
  });

  it('opting out sends one last event, then nothing; the choice survives a sign-out reset', () => {
    const { t, calls, named } = onTelemetry();
    t.setUser(ALICE);
    t.setConsent(false);
    assert.deepEqual(named('capture').map((c) => c[1]), ['analytics_opted_out']);
    assert.equal(named('optOut').length, 1);
    t.track('lesson_started', { lesson_id: 'x' });
    t.reportError('rpc_failed', new Error('x'));
    assert.equal(named('capture').length, 1);
    assert.equal(named('captureException').length, 0);
    calls.length = 0;
    t.setUser(null);
    assert.deepEqual(calls.map((c) => c[0]), ['reset', 'optOut', 'register'], 'reset() forgets the opt-out, so it is applied again');
    t.setConsent(true);
    assert.equal(named('optIn').length, 1);
    t.track('lesson_started', { lesson_id: 'x' });
    assert.equal(named('capture').length, 1);
  });

  it('an opted-out player is opted out from install, and nothing buffered is sent', () => {
    const t = new Telemetry();
    t.setConsent(false);
    t.track('app_ready', { result: 'ready' });
    const f = fakeClient();
    t.install(f.client);
    assert.equal(f.named('optOut').length, 1);
    assert.equal(f.named('capture').length, 0);
  });
});

describe('architecture', () => {
  it('only src/observability imports the PostHog SDK', () => {
    const root = join(import.meta.dirname, '..', '..', '..');
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) {
          if (f !== 'node_modules' && f !== 'observability' && !f.startsWith('.')) walk(p);
        } else if (/\.(ts|tsx)$/.test(f) && /from ['"](posthog-react-native|@posthog\/)/.test(readFileSync(p, 'utf8'))) offenders.push(p);
      }
    };
    walk(join(root, 'src'));
    walk(join(root, 'app'));
    assert.deepEqual(offenders, []);
  });
});
