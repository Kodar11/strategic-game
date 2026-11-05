import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CHUNK_SIZE, chunkedStorage, safeKey } from '../chunked-storage.ts';
import { SignInError, failure, signInFailure } from '../errors.ts';
import { type AuthState, INITIAL_AUTH, authReducer, isBusy } from '../state.ts';
import { currentUserId, dispatchAuth, useAuth } from '../store.ts';

const ALICE = { id: '00000000-0000-4000-8000-0000000000a1', email: 'alice@example.com' };
const BOB = { id: '00000000-0000-4000-8000-0000000000b2', email: 'bob@example.com' };

const run = (s: AuthState, ...events: Parameters<typeof authReducer>[1][]) => events.reduce(authReducer, s);

describe('auth state', () => {
  it('starts undecided: initializing is busy and is never a signed-out guest', () => {
    assert.equal(INITIAL_AUTH.status, 'initializing');
    assert.equal(INITIAL_AUTH.user, null);
    assert.ok(isBusy(INITIAL_AUTH));
  });

  it('restores a saved session, or a guest', () => {
    assert.deepEqual(run(INITIAL_AUTH, { type: 'restored', user: ALICE }), { status: 'signedIn', user: ALICE, error: null });
    assert.deepEqual(run(INITIAL_AUTH, { type: 'restored', user: null }), { status: 'signedOut', user: null, error: null });
  });

  it('signs in: signedOut → signingIn → signedIn', () => {
    const s = run(INITIAL_AUTH, { type: 'restored', user: null }, { type: 'signInStarted' });
    assert.equal(s.status, 'signingIn');
    assert.ok(isBusy(s));
    assert.deepEqual(authReducer(s, { type: 'signedIn', user: ALICE }), { status: 'signedIn', user: ALICE, error: null });
  });

  it('cancelling is not an error', () => {
    const s = run(INITIAL_AUTH, { type: 'restored', user: null }, { type: 'signInStarted' }, { type: 'signInCancelled' });
    assert.deepEqual(s, { status: 'signedOut', user: null, error: null });
  });

  it('a failed sign-in returns to signed out with a readable error, cleared by the next attempt', () => {
    const failed = run(INITIAL_AUTH, { type: 'restored', user: null }, { type: 'signInStarted' }, { type: 'signInFailed', message: 'No network' });
    assert.deepEqual(failed, { status: 'signedOut', user: null, error: 'No network' });
    assert.equal(authReducer(failed, { type: 'signInStarted' }).error, null);
    assert.equal(authReducer(failed, { type: 'clearError' }).error, null);
  });

  it('refuses a second sign-in while one is running, and sign-in while signed in', () => {
    const signingIn = run(INITIAL_AUTH, { type: 'restored', user: null }, { type: 'signInStarted' });
    assert.equal(authReducer(signingIn, { type: 'signInStarted' }), signingIn);
    const signedIn = run(INITIAL_AUTH, { type: 'restored', user: ALICE });
    assert.equal(authReducer(signedIn, { type: 'signInStarted' }), signedIn);
  });

  it('sign-out: keeps the user while running, restores them with the reason on failure', () => {
    const out = run(INITIAL_AUTH, { type: 'restored', user: ALICE }, { type: 'signOutStarted' });
    assert.deepEqual(out, { status: 'signingOut', user: ALICE, error: null });
    assert.deepEqual(authReducer(out, { type: 'signOutFailed', message: 'unsaved' }), { status: 'signedIn', user: ALICE, error: 'unsaved' });
    assert.deepEqual(authReducer(out, { type: 'signedOut' }), { status: 'signedOut', user: null, error: null });
  });

  it('deletion: deleting → signedIn on failure, signedOut on success', () => {
    const del = run(INITIAL_AUTH, { type: 'restored', user: ALICE }, { type: 'deleteStarted' });
    assert.equal(del.status, 'deleting');
    assert.ok(isBusy(del));
    assert.deepEqual(authReducer(del, { type: 'deleteFailed', message: 'offline' }), { status: 'signedIn', user: ALICE, error: 'offline' });
    assert.deepEqual(authReducer(del, { type: 'signedOut' }), { status: 'signedOut', user: null, error: null });
    // Can't delete a guest.
    const guest = run(INITIAL_AUTH, { type: 'restored', user: null });
    assert.equal(authReducer(guest, { type: 'deleteStarted' }), guest);
  });

  it('a session ending on its own (revoked, expired) makes the app a guest from any state', () => {
    for (const s of [run(INITIAL_AUTH, { type: 'restored', user: ALICE }), run(INITIAL_AUTH, { type: 'restored', user: ALICE }, { type: 'signOutStarted' })]) {
      assert.deepEqual(authReducer(s, { type: 'signedOut' }), { status: 'signedOut', user: null, error: null });
    }
  });

  it('account switching: the next user replaces the previous one entirely', () => {
    const s = run(INITIAL_AUTH, { type: 'restored', user: ALICE }, { type: 'signOutStarted' }, { type: 'signedOut' }, { type: 'signInStarted' }, { type: 'signedIn', user: BOB });
    assert.deepEqual(s.user, BOB);
    // An update for a different user (a late event from the previous session) is ignored.
    assert.deepEqual(authReducer(s, { type: 'userUpdated', user: { ...ALICE, email: 'x@example.com' } }).user, BOB);
    assert.deepEqual(authReducer(s, { type: 'userUpdated', user: { ...BOB, email: 'new@example.com' } }).user, { ...BOB, email: 'new@example.com' });
  });

  it('the store exposes the user id only once signed in', () => {
    useAuth.setState(INITIAL_AUTH, true);
    assert.equal(currentUserId(), null);
    dispatchAuth({ type: 'restored', user: ALICE });
    assert.equal(currentUserId(), ALICE.id);
    dispatchAuth({ type: 'signedOut' });
    assert.equal(currentUserId(), null);
    useAuth.setState(INITIAL_AUTH, true);
  });
});

describe('sign-in failures', () => {
  it('cancellation is not a failure', () => {
    assert.equal(signInFailure({ code: 'SIGN_IN_CANCELLED', message: '[SIGN_IN_CANCELLED] user cancelled' }), null);
  });

  it('maps the Google library’s codes', () => {
    assert.equal(signInFailure({ code: 'PLAY_SERVICES_NOT_AVAILABLE' })?.kind, 'playServices');
    assert.equal(signInFailure({ code: 'DEVELOPER_ERROR' })?.kind, 'config');
    assert.equal(signInFailure({ code: 'ONE_TAP_START_FAILED' })?.kind, 'rejected');
  });

  it('maps Supabase auth errors and network failures', () => {
    assert.equal(signInFailure({ name: 'AuthRetryableFetchError', status: 0 })?.kind, 'network');
    assert.equal(signInFailure({ name: 'TypeError', message: 'Network request failed' })?.kind, 'network');
    assert.equal(signInFailure({ name: 'AuthApiError', status: 400, code: 'provider_disabled' })?.kind, 'config');
    assert.equal(signInFailure({ name: 'AuthApiError', status: 400, code: 'bad_jwt' })?.kind, 'rejected');
    assert.equal(signInFailure({ name: 'AuthApiError', status: 502 })?.kind, 'network');
  });

  it('passes through the module’s own failures and never shows raw text', () => {
    assert.equal(signInFailure(new SignInError(failure('noAccount', 'x')))?.kind, 'noAccount');
    const f = signInFailure(new Error('eyJhbGciOi… secret token text'));
    assert.equal(f?.kind, 'unknown');
    assert.ok(!f?.message.includes('eyJ'));
    for (const k of ['unsupported', 'playServices', 'noAccount', 'network', 'config', 'rejected', 'incomplete', 'unknown'] as const) assert.ok(failure(k).message.length > 20);
  });
});

describe('chunked secure storage', () => {
  function backend(limit = CHUNK_SIZE) {
    const map = new Map<string, string>();
    return {
      map,
      getItem: async (k: string) => map.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        assert.match(k, /^[A-Za-z0-9._-]+$/, `key not allowed by SecureStore: ${k}`);
        assert.ok(v.length <= limit, `value of ${v.length} chars over the limit`);
        map.set(k, v);
      },
      removeItem: async (k: string) => void map.delete(k),
    };
  }
  const session = (n: number) => JSON.stringify({ access_token: 'a'.repeat(n), refresh_token: 'r'.repeat(40), user: { id: ALICE.id } });

  it('round-trips a session larger than one secure entry', async () => {
    const b = backend();
    const s = chunkedStorage(b);
    const value = session(5000);
    await s.setItem('sb-abc-auth-token', value);
    assert.equal(await s.getItem('sb-abc-auth-token'), value);
    assert.ok(b.map.size > 2);
  });

  it('shrinking a value removes the stale pieces; removing removes everything', async () => {
    const b = backend();
    const s = chunkedStorage(b);
    await s.setItem('k', session(6000));
    await s.setItem('k', session(10));
    assert.equal(await s.getItem('k'), session(10));
    assert.equal(b.map.size, 2);
    await s.removeItem('k');
    assert.equal(b.map.size, 0);
    assert.equal(await s.getItem('k'), null);
  });

  it('a missing piece reads as no session, never a corrupted one', async () => {
    const b = backend();
    const s = chunkedStorage(b);
    await s.setItem('k', session(4000));
    b.map.delete('k.1');
    assert.equal(await s.getItem('k'), null);
    b.map.set('k', 'garbage');
    assert.equal(await s.getItem('k'), null);
  });

  it('sanitises keys to what SecureStore accepts', () => {
    assert.equal(safeKey('sb-abc-auth-token'), 'sb-abc-auth-token');
    assert.equal(safeKey('sb:abc/auth token'), 'sb_abc_auth_token');
  });
});
