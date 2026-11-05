import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { signInFailure } from '@/src/auth/errors';
import { browserSignInRunning, completeBrowserSignIn, signInWithGoogleInBrowser } from '@/src/auth/browser-sign-in';
import { forgetGoogleAccount, googleSignInMode, requestGoogleIdToken } from '@/src/auth/google';
import type { AuthUser } from '@/src/auth/state';
import { dispatchAuth, useAuth } from '@/src/auth/store';
import { type Catalog, installCatalog } from '@/src/content/catalog';
import { installCategories } from '@/src/content/categories';
import { monthOf } from '@/src/features/daily/dates';
import { currentScreen, errorCode, flushTelemetry, reportError, setCommonProperties, track } from '@/src/observability/api';
import { useProgress } from '@/src/store/progress';
import { EMPTY_PROGRESS, type ProgressData } from '@/src/store/progress-state';
import { accountRepository } from './account';
import { arenaUploads } from './arena-session';
import { diffProgress } from './changes';
import { useDaily } from './daily-session';
import { clearAccountDeviceData } from './device-data';
import { type Owner, reconcileOwner, setOwner } from './device-owner';
import { DataError, toDataError } from './errors';
import { useGames } from './games-session';
import { guestProgressStore } from './guest-progress';
import { Outbox, type OutboxStatus } from './outbox';
import { categoryRepository, contentRepository, progressRepository } from './repositories';
import { endLocalSession, removeLegacySession, subscribeAuth, supabase, supabaseRpc } from './supabase';

/**
 * The app's connection to its data and to the player's identity.
 *
 * Start-up loads the published content (anyone may read it) and checks the saved Supabase session with the server.
 * - **Signed in** (Google, through Supabase): progress loads from Supabase and every change is diffed and queued in
 *   the outbox, which writes it in order (see outbox.ts for retry and conflict behaviour).
 * - **Guest**: progress lives on this device (guest-progress.ts). Lessons, practice games, Arena and Stories all work;
 *   features that keep per-player records on the server (Daily Challenge, Game of the Week, friend challenges,
 *   nickname) answer with a `signedOut` error, which screens turn into a sign-in invitation.
 *
 * Signing in hands the guest's progress to the account; signing out, deleting the account or finding the device's
 * data owned by someone else clears everything the device held for that person (device-data.ts, device-owner.ts).
 * There is no anonymous account: a guest has no server identity at all.
 */

export type AppDataState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: DataError };

export const useAppData = create<AppDataState>(() => ({ status: 'loading' }));
export const useSyncStatus = create<OutboxStatus>(() => ({ pending: 0, state: 'idle', message: null }));

const OUTBOX_KEY = 'strategic-game/outbox';
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

const progress = progressRepository(supabaseRpc);
const content = contentRepository(supabaseRpc);
const categories = categoryRepository(supabaseRpc);
const account = accountRepository(supabaseRpc);
const guest = guestProgressStore(AsyncStorage);

export const outbox = new Outbox({
  send: async (changes) => {
    await progress.apply(changes);
  },
  classify: (e) => {
    const d = toDataError(e);
    return { kind: d.transient ? 'transient' : 'permanent', message: d.message };
  },
  storage: {
    load: () => AsyncStorage.getItem(OUTBOX_KEY),
    save: (v) => (v === null ? AsyncStorage.removeItem(OUTBOX_KEY) : AsyncStorage.setItem(OUTBOX_KEY, v)),
  },
  onStatus: (s) => useSyncStatus.setState(s),
});

const EMPTY_DATA: ProgressData = progressOf(EMPTY_PROGRESS);

function progressOf(s: ProgressData): ProgressData {
  const { completed, runtime, learning, goal, challengeDrafts, scenarioRuns, scenarioDone, assessmentRuns } = s;
  return { completed, runtime, learning, goal, challengeDrafts, scenarioRuns, scenarioDone, assessmentRuns };
}

// ── Keeping progress: to the server when signed in, on the device for a guest ──────────────────────────────────

let unsubscribe: (() => void) | null = null;

function stopSaving(): void {
  unsubscribe?.();
  unsubscribe = null;
}

/** Signed in: every store change goes to the outbox. */
function startSync(): void {
  stopSaving();
  const offStore = useProgress.subscribe((next, prev) => {
    // The update that loads progress from the server is not a change to write back.
    if (!next.hydrated || !prev.hydrated) return;
    void outbox.enqueue(diffProgress(progressOf(prev), progressOf(next), next.resets !== prev.resets));
  });
  // Send what's pending before the app is backgrounded (it may not come back). Drained a microtask later, so changes
  // other 'change' listeners save at this moment (an open lesson's latest step) are in the queue first.
  const offApp = AppState.addEventListener('change', (state) => {
    if (state !== 'active') queueMicrotask(() => void outbox.drain());
  });
  unsubscribe = () => {
    offStore();
    offApp.remove();
  };
}

/** Guest: every store change is saved on the device. */
function startGuestSave(): void {
  stopSaving();
  const offStore = useProgress.subscribe((next) => {
    if (next.hydrated) guest.save(progressOf(next));
  });
  const offApp = AppState.addEventListener('change', (state) => {
    if (state !== 'active') queueMicrotask(() => void guest.flush());
  });
  unsubscribe = () => {
    offStore();
    offApp.remove();
  };
}

/** Forget every account's data held in memory. The screens fall back to their loading or empty states. */
function resetMemory(): void {
  useProgress.setState({ ...EMPTY_PROGRESS, hydrated: false });
  useGames.getState().reset();
  useDaily.getState().reset();
}

// ── Identity ───────────────────────────────────────────────────────────────────────────────────────────────────

function userOf(u: { id: string; email?: string | null }): AuthUser {
  return { id: u.id, email: u.email ?? null };
}

/** Supabase created this account just now (a first sign-in) rather than signing in to an existing one. */
function isNewAccount(u: { created_at?: string }): boolean {
  const created = u.created_at ? Date.parse(u.created_at) : NaN;
  return Number.isFinite(created) && Date.now() - created < 5 * 60_000;
}

/**
 * A version stamp for the published content, sent with every event so a change in behaviour can be lined up with a
 * content change: the sum of every lesson's and scenario's revision, which grows whenever either is revised.
 */
function contentRevision(c: Catalog): number {
  const lessons = c.lessons.reduce((n, l) => n + ((l as { revision?: number }).revision ?? 0), 0);
  const scenarios = c.scenarios.reduce((n, s) => n + ((s as { revision?: number }).revision ?? 0), 0);
  return lessons + scenarios;
}

/** Where the current sign-in started (the screen with the button, or the Learn tab's invitation). */
let signInSource: string | null = null;

/** Called by the sign-in button just before `signInWithGoogle`, so the outcome is attributed to where it began. */
export function noteSignInSource(source: string | null): void {
  signInSource = source ?? currentScreen();
  track('sign_in_started', { source: signInSource ?? undefined });
}

function signInOutcome(result: 'success' | 'cancelled' | 'failed', isNew?: boolean): void {
  track('sign_in_finished', {
    source: signInSource ?? currentScreen() ?? undefined,
    result,
    method: googleSignInMode === 'native' ? 'native' : 'browser',
    ...(isNew === undefined ? {} : { is_new_account: isNew }),
  });
  signInSource = null;
}

interface AuthErrorLike {
  name?: string;
  status?: number;
  code?: string;
}

/** supabase-js couldn't get an answer (offline, timeout): keep the session and say so, rather than signing out. */
function isRetryable(e: AuthErrorLike | null | undefined): boolean {
  return !!e && (e.name === 'AuthRetryableFetchError' || !e.status || e.status >= 500);
}

/**
 * Who is signed in, confirmed by the server. A saved session alone isn't trusted: the account may have been deleted
 * or its session revoked since, so `getUser()` asks Supabase Auth to validate the access token (refreshing it first
 * if it has expired). A definite "no" ends the local session and the app continues as a guest; no answer at all
 * keeps the session and reports a network error, like any other start-up failure.
 */
async function confirmedUser(): Promise<AuthUser | null> {
  const auth = supabase().auth;
  const { data, error } = await auth.getSession();
  if (error) {
    if (isRetryable(error)) throw new DataError('network', `session: ${error.name}`);
    return null;
  }
  if (!data.session) return null;
  const { data: u, error: ue } = await auth.getUser();
  if (ue || !u.user) {
    if (ue && isRetryable(ue)) throw new DataError('network', `user: ${ue.name}`);
    await signOutQuietly();
    return null;
  }
  return userOf(u.user);
}

/** Set while the app itself ends a session, so its own SIGNED_OUT event isn't mistaken for a revoked one. */
let endingSession = false;

async function signOutQuietly(): Promise<void> {
  endingSession = true;
  try {
    await endLocalSession();
  } finally {
    endingSession = false;
  }
}

let listening = false;

/**
 * One listener for the app's lifetime. A session can end without the app asking — the refresh token was revoked, the
 * account was deleted elsewhere — and then the device must stop showing and sending that account's data. Supabase
 * calls this inside its session lock, so the work is deferred rather than awaited here.
 */
function listenForSessionChanges(): void {
  if (listening) return;
  listening = true;
  subscribeAuth((event, session) => {
    if (event === 'SIGNED_OUT' && !endingSession) {
      const s = useAuth.getState().status;
      if (s === 'signedIn' || s === 'signingOut') setTimeout(() => void sessionEnded(), 0);
    } else if ((event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') && session?.user) {
      dispatchAuth({ type: 'userUpdated', user: userOf(session.user) });
    }
  });
}

async function sessionEnded(): Promise<void> {
  if (useAuth.getState().status === 'signedOut') return;
  if (__DEV__) console.warn('[auth] the session ended on the server; continuing as a guest');
  stopSaving();
  outbox.stop();
  arenaUploads.stop();
  await becomeGuest({ welcomeAgain: false });
}

// ── Loading ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Lesson categories are a browsing aid, not something a lesson depends on: if they can't be loaded or don't check
 * out, the app starts anyway and the lesson list shows no category filter.
 */
async function loadCategories(catalog: Catalog): Promise<void> {
  try {
    const { index, warnings } = await categories.fetchCategories(catalog.lessons);
    if (__DEV__ && warnings.length) console.warn(`[data] categories: ${warnings.join('; ')}`);
    installCategories(index);
  } catch (e) {
    if (__DEV__) console.warn(`[data] categories not loaded: ${toDataError(e).detail}`);
    installCategories(null);
  }
}

/** The signed-in player's progress from the server, after sending whatever was still queued for them. */
async function loadAccount(userId: string): Promise<void> {
  stopSaving();
  // Changes saved before the last shutdown go first, so the progress loaded next includes them.
  await outbox.restore(userId);
  // Arena summaries waiting from earlier sessions are sent in the background; they never block start-up.
  await arenaUploads.restore(userId);
  if (!(await outbox.drain())) throw new DataError('network', 'pending progress changes could not be sent');
  const saved = await progress.load();
  useProgress.getState().hydrate(saved);
  startSync();
  // Not awaited: the Daily Challenge history (for the calendar and the profile) loads in the background, and a
  // failure here only means the profile shows lesson evidence alone until the calendar is opened.
  void useDaily.getState().loadMonth(monthOf(useDaily.getState().today));
}

async function loadGuest(): Promise<void> {
  stopSaving();
  const saved = await guest.load();
  useProgress.getState().hydrate(saved ?? EMPTY_DATA);
  startGuestSave();
}

let starting: Promise<void> | null = null;

/** Load everything the app needs. Safe to call again after an error (the "Try again" button). */
export function startAppData(): Promise<void> {
  if (isServer) return Promise.resolve();
  if (starting) return starting;
  useAppData.setState({ status: 'loading' });
  listenForSessionChanges();
  starting = (async () => {
    // Cold-start timings for `app_ready` (src/observability): the whole start, the catalogue and the categories.
    const t0 = Date.now();
    let catalogMs: number | undefined;
    let categoriesMs: number | undefined;
    try {
      await removeLegacySession();
      const [catalog, user] = await Promise.all([
        content.fetchCatalog().then((c) => {
          catalogMs = Date.now() - t0;
          return c;
        }),
        confirmedUser(),
      ]);
      installCatalog(catalog);
      setCommonProperties({ content_revision: contentRevision(catalog) });
      // Categories don't depend on progress, so they load alongside it rather than as one more round trip first.
      // loadCategories never rejects.
      const categoriesStart = Date.now();
      const categoriesLoaded = loadCategories(catalog).then(() => {
        categoriesMs = Date.now() - categoriesStart;
      });
      const owner: Owner = user ? { user: user.id } : 'guest';
      const { cleared } = await reconcileOwner(AsyncStorage, owner, async () => {
        await outbox.clear();
        await clearAccountDeviceData();
      });
      if (__DEV__ && cleared) console.info('[data] device data belonged to someone else and was cleared');
      dispatchAuth({ type: 'restored', user });
      if (user) await loadAccount(user.id);
      else await loadGuest();
      await categoriesLoaded;
      useAppData.setState({ status: 'ready' });
      track('app_ready', { result: 'ready', total_ms: Date.now() - t0, catalog_ms: catalogMs, categories_ms: categoriesMs, signed_in: !!user, onboarded: useProgress.getState().settings.onboarded });
    } catch (e) {
      const error = toDataError(e);
      if (__DEV__) console.warn(`[data] start-up failed (${error.kind}): ${error.detail}`);
      useAppData.setState({ status: 'error', error });
      track('app_ready', { result: 'error', error_kind: error.kind, total_ms: Date.now() - t0, catalog_ms: catalogMs });
      // Being offline is the player's situation, not a fault: it shows in app_ready, not as an error.
      if (error.kind !== 'network') reportError('startup_failed', error, { error_code: errorCode(error.detail) ?? error.kind });
    } finally {
      starting = null;
    }
  })();
  return starting;
}

// ── Signing in ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * "Continue with Google": one action for new and returning players. Google's account picker returns an ID token,
 * Supabase verifies it (signature, audience, nonce) and creates the account the first time or signs in to the
 * existing one — the Google identity maps to exactly one Supabase user, so nothing is merged or overwritten.
 *
 * The guest's progress on this device then goes to the account through the outbox. Its writes are idempotent
 * (attempts and completions are insert-if-absent by id), so a returning account keeps everything it had and gains
 * what was done as a guest. The outbox entry is saved before the guest copy is removed, so a failure in between
 * loses nothing.
 *
 * Never throws: the outcome is in the auth store (signedIn, back to signedOut on cancel, or an error message).
 */
export async function signInWithGoogle(): Promise<void> {
  if (useAuth.getState().status !== 'signedOut' || useAppData.getState().status !== 'ready') return;
  dispatchAuth({ type: 'signInStarted' });

  let user: AuthUser;
  let isNew: boolean;
  try {
    if (googleSignInMode === 'browser') {
      // The default everywhere: Supabase's browser OAuth flow (PKCE). Same Supabase user as the native path.
      const browser = await signInWithGoogleInBrowser(supabase());
      // null: the callback screen already finished this sign-in (completeSignInFromRedirect).
      if (!browser) return;
      if (browser.type === 'cancelled') return signInCancelled();
      user = userOf(browser.user);
      isNew = isNewAccount(browser.user);
    } else {
      const google = await requestGoogleIdToken();
      if (google.type === 'cancelled') return signInCancelled();
      const { data, error } = await supabase().auth.signInWithIdToken({ provider: 'google', token: google.idToken, nonce: google.nonce });
      if (error) throw error;
      if (!data.user) throw new Error('no user');
      user = userOf(data.user);
      isNew = isNewAccount(data.user);
    }
  } catch (e) {
    return signInFailed(e);
  }
  await finishSignIn(user, isNew);
}

/** The player closed the account picker or the browser: not a failure, and never reported as one. */
function signInCancelled(): void {
  dispatchAuth({ type: 'signInCancelled' });
  signInOutcome('cancelled');
}

function signInFailed(e: unknown): void {
  const f = signInFailure(e);
  if (!f) return signInCancelled();
  if (__DEV__) console.warn(`[auth] sign-in failed (${f.kind}): ${f.detail}`);
  signInOutcome('failed');
  // No connection is the player's situation; every other kind is a setup or provider problem worth a look.
  if (f.kind !== 'network') reportError('sign_in_failed', e, { error_code: f.kind });
  // Development builds also show the error code next to the message, so a setup problem can be identified.
  dispatchAuth({ type: 'signInFailed', message: __DEV__ && f.detail ? `${f.message} (${f.detail})` : f.message });
}

/**
 * The browser sign-in's redirect opened the app after the JavaScript restarted (Expo Go does this on Android; Android
 * can also stop an installed app while the browser is open), so the sign-in that started it no longer exists. Finish it
 * from the link: the PKCE verifier is still in secure storage. Does nothing on the native path, while a sign-in in this
 * context is still waiting (it will use the link itself), or when someone is already signed in.
 */
export async function completeSignInFromRedirect(url: string): Promise<void> {
  if (googleSignInMode !== 'browser' || browserSignInRunning()) return;
  if (useAuth.getState().status !== 'signedOut' || useAppData.getState().status !== 'ready') return;
  dispatchAuth({ type: 'signInStarted' });
  let user: AuthUser;
  let isNew: boolean;
  try {
    const browser = await completeBrowserSignIn(supabase(), url);
    if (!browser) return signInCancelled();
    if (browser.type === 'cancelled') return signInCancelled();
    user = userOf(browser.user);
    isNew = isNewAccount(browser.user);
  } catch (e) {
    return signInFailed(e);
  }
  await finishSignIn(user, isNew);
}

/** After Supabase confirmed the account: hand the guest's progress over, then load the account. */
async function finishSignIn(user: AuthUser, isNew: boolean): Promise<void> {
  // Hand the guest's progress to the account.
  stopSaving();
  await guest.flush();
  const carried = useProgress.getState().hydrated ? progressOf(useProgress.getState()) : null;
  await outbox.restore(user.id);
  if (carried) await outbox.enqueue(diffProgress(EMPTY_DATA, carried));
  await setOwner(AsyncStorage, { user: user.id });
  await guest.clear();
  // Boards and the calendar were loaded as a guest (no nickname, no attempts): load them again as this player.
  useGames.getState().reset();
  useDaily.getState().reset();
  dispatchAuth({ type: 'signedIn', user });
  // After the identity switch (src/observability follows the auth store), so the outcome belongs to the account.
  signInOutcome('success', isNew);

  try {
    await loadAccount(user.id);
  } catch (e) {
    // Signed in, but the progress couldn't load: the usual start-up error screen offers "Try again".
    const error = toDataError(e);
    if (__DEV__) console.warn(`[data] loading the account failed (${error.kind}): ${error.detail}`);
    useAppData.setState({ status: 'error', error });
  }
}

export function clearAuthError(): void {
  dispatchAuth({ type: 'clearError' });
}

// ── Signing out ────────────────────────────────────────────────────────────────────────────────────────────────

/** Back to a guest with nothing from the previous account, in memory or on the device. */
async function becomeGuest({ welcomeAgain }: { welcomeAgain: boolean }): Promise<void> {
  await outbox.clear();
  await clearAccountDeviceData();
  resetMemory();
  await setOwner(AsyncStorage, 'guest');
  if (welcomeAgain) useProgress.getState().setSetting('onboarded', false);
  dispatchAuth({ type: 'signedOut' });
  await loadGuest();
}

export type SignOutResult = 'signedOut' | 'unsaved' | 'failed';

export const UNSAVED_MESSAGE = 'Some recent progress hasn’t reached the server yet. Connect to the internet and try again, or sign out anyway and lose those changes.';

/**
 * Sign out of this device. The account and everything saved under it stay on the server; signing in again brings it
 * back. First sends anything still queued: if that can't happen (offline), nothing changes and the result is
 * `unsaved`, so the player can choose — `force` then signs out and drops those changes.
 *
 * Afterwards the device holds nothing of the account: the session, queued writes, cached boards and calendar, and
 * the device-only Stories and Arena records are cleared. The app continues as a guest.
 */
export async function signOut({ force = false }: { force?: boolean } = {}): Promise<SignOutResult> {
  const owner = useAuth.getState().user?.id;
  if (useAuth.getState().status !== 'signedIn' || !owner) return 'failed';
  dispatchAuth({ type: 'signOutStarted' });
  stopSaving();
  if (!force) {
    const sent = (await outbox.drain()) && (await arenaUploads.drain());
    if (!sent) {
      startSync();
      dispatchAuth({ type: 'signOutFailed', message: UNSAVED_MESSAGE });
      return 'unsaved';
    }
  }
  outbox.stop();
  arenaUploads.stop();
  try {
    await signOutQuietly();
  } catch (e) {
    if (__DEV__) console.warn(`[auth] sign-out failed: ${toDataError(e).detail}`);
    startSync();
    void arenaUploads.restore(owner);
    dispatchAuth({ type: 'signOutFailed', message: 'Couldn’t sign out. Please try again.' });
    return 'failed';
  }
  await forgetGoogleAccount();
  // Sent while still identified as this account; becoming a guest then resets the analytics identity.
  track('signed_out', { forced: force });
  await becomeGuest({ welcomeAgain: false });
  return 'signedOut';
}

// ── Deleting the account ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Delete the signed-in account on the server, then continue as a new guest. The server function `delete_my_account`
 * deletes the caller (from the verified JWT, never a client-supplied id) and, by cascade in the same transaction,
 * every row tied to the account (src/data/account.ts).
 *
 * Progress sync and Arena uploads stop before the request, so nothing is written for an account being deleted (an
 * upload already in flight either lands before the deletion and goes with the account, or fails because every user
 * table references auth.users). If the request fails nothing local changes, both resume, and the DataError is
 * rethrown: the account still exists. Only once the server confirms does the device forget the account.
 *
 * An access token already issued stays cryptographically valid until it expires (Supabase JWTs are stateless), but the
 * app drops it at once, and every table it could reach is owner-scoped to a user who no longer exists.
 */
export async function deleteAccount(): Promise<void> {
  const state = useAuth.getState();
  if (state.status !== 'signedIn' || !state.user) throw new DataError('signedOut', 'no account to delete');
  const owner = state.user.id;
  dispatchAuth({ type: 'deleteStarted' });
  stopSaving();
  outbox.stop();
  arenaUploads.stop();
  // Analytics already captured for this account (if the player shares them) go out BEFORE the server queues the
  // PostHog deletion, so that deletion covers them (docs/ACCOUNT_DELETION.md). Bounded; never blocks deletion.
  await flushTelemetry(3000);
  try {
    await account.deleteMyAccount();
  } catch (e) {
    startSync();
    void outbox.drain();
    await arenaUploads.restore(owner);
    const error = toDataError(e);
    dispatchAuth({ type: 'deleteFailed', message: error.message });
    if (error.kind !== 'network') reportError('delete_account_failed', error, { error_code: errorCode(error.detail) ?? error.kind });
    throw e;
  }

  // The account is gone: end the session here and forget everything this device held for it. Device preferences
  // (motion, haptics, narration) stay; the welcome shows again for whoever uses the phone next.
  await signOutQuietly().catch(() => undefined);
  await forgetGoogleAccount();
  await becomeGuest({ welcomeAgain: true });
  // Only now, as an anonymous guest event: sent under the deleted id it could re-create the PostHog person the server
  // has just queued for deletion. The server deletes that person, their events and recordings (posthog-deletion).
  track('account_deleted');
}
