import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AuthChangeEvent, type Session, type SupabaseClient, createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { installCryptoPolyfill } from '@/src/auth/crypto-polyfill';
import { sessionStorage } from '@/src/auth/session-storage';
import { currentUserId } from '@/src/auth/store';
import { errorCode, reportError } from '@/src/observability/api';
import type { Database, Json } from './database.types';
import { DataError, toDataError } from './errors';
import { PUBLIC_RPCS } from './public-rpcs';
import type { Rpc } from './repositories';
import { noteBackend } from './sync/connectivity';

/**
 * The one Supabase client. It uses only the project URL and the publishable (anon) key — values meant to ship in the
 * app; row level security decides what they can reach. A secret / service-role key is refused outright.
 *
 * Identity is Google only (src/auth/google.ts → `signInWithIdToken` in src/data/session.ts). Supabase owns the session:
 * it issues and refreshes the access and refresh tokens and keeps them in OS-backed secure storage
 * (src/auth/session-storage.ts). The app never stores, logs or forwards a token itself.
 *
 * `EXPO_PUBLIC_*` variables are inlined at build time, so they must be read with these literal names.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

/** Static web rendering runs in Node where there is no storage; sessions only exist in a real client. */
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

function isPrivilegedKey(k: string): boolean {
  if (k.startsWith('sb_secret_')) return true;
  const payload = k.split('.')[1];
  if (!payload || typeof atob !== 'function') return false;
  try {
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role';
  } catch {
    return false;
  }
}

/**
 * supabase-js sets no timeout, so a connection that stalls (weak mobile signal) would leave start-up loading forever
 * instead of offering "Try again". Covers the wait for a response; aborted requests surface as transient network
 * errors, which the outbox retries.
 */
const REQUEST_TIMEOUT_MS = 30_000;

const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const outer = init?.signal;
  if (outer?.aborted) controller.abort();
  else outer?.addEventListener('abort', () => controller.abort());
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal })
    .then(
      // Any HTTP answer, even an error status, proves the server is reachable; no answer at all says it isn't.
      (res) => (noteBackend(true), res),
      (e: unknown) => {
        if (!outer?.aborted) noteBackend(false);
        throw e;
      },
    )
    .finally(() => clearTimeout(timer));
};

let client: SupabaseClient<Database> | null = null;
let appStateHooked = false;

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;
const authListeners = new Set<AuthListener>();

/**
 * Follow auth changes (sign-in, refresh, sign-out — including a session that ends by itself) on whichever client is
 * current. Supabase runs these callbacks inside its session lock, so a listener must not await Supabase calls itself;
 * src/data/session.ts defers its work.
 */
export function subscribeAuth(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

export function supabase(): SupabaseClient<Database> {
  if (client) return client;
  if (!url || !key) throw new DataError('config', 'EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY is not set');
  if (isPrivilegedKey(key)) throw new DataError('config', 'EXPO_PUBLIC_SUPABASE_KEY is a secret key; the app must use the publishable key');
  // Before the client exists: PKCE then gets real random values and an SHA-256 challenge (React Native has no WebCrypto).
  installCryptoPolyfill();
  client = createClient<Database>(url, key, {
    auth: {
      storage: isServer ? undefined : sessionStorage,
      autoRefreshToken: !isServer,
      persistSession: !isServer,
      detectSessionInUrl: false,
      // PKCE for the browser Google sign-in (src/auth/browser-sign-in.ts): the code that comes back through the
      // redirect is useless without the verifier kept on this device; the SHA-256 challenge comes from
      // installCryptoPolyfill above. The native ID-token sign-in that release builds use doesn't involve PKCE. Session refreshes are coordinated by supabase-js itself
      // (2.118+: the old `lock` option is deprecated), so no lock is configured.
      flowType: 'pkce',
    },
    global: { fetch: fetchWithTimeout },
  });
  const created = client;
  created.auth.onAuthStateChange((event, session) => {
    // A client replaced by endLocalSession may still emit; only the current one speaks for the app.
    if (created !== client) return;
    authListeners.forEach((l) => l(event, session));
  });
  // Refresh tokens only while the app is in the foreground (Supabase's guidance for React Native). One listener for
  // the app's lifetime; it follows whichever client is current.
  if (Platform.OS !== 'web' && !appStateHooked) {
    appStateHooked = true;
    if (AppState.currentState === 'active') client.auth.startAutoRefresh();
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}

/**
 * End the session on this device even when the server can't be reached. supabase-js keeps the session if its
 * sign-out request fails for lack of a network, so the saved session is then removed directly and the client
 * replaced: the next `supabase()` starts from empty storage. Only this device is signed out (`scope: 'local'`).
 */
export async function endLocalSession(): Promise<void> {
  const c = supabase();
  const { error } = await c.auth.signOut({ scope: 'local' }).catch((e: unknown) => ({ error: e }));
  if (!error) return;
  await c.auth.stopAutoRefresh().catch(() => undefined);
  if (url) await sessionStorage.removeItem(storageKeyFor(url)).catch(() => undefined);
  client = null;
  supabase();
}

/** supabase-js's storage key for a project: `sb-<project ref>-auth-token`. */
export function storageKeyFor(projectUrl: string): string {
  const ref = new URL(projectUrl).hostname.split('.')[0];
  return `sb-${ref}-auth-token`;
}

/**
 * The user the saved session belongs to, read from secure storage without any network request — or null when there is
 * no saved session. Only an identity hint for working offline (src/data/session.ts checks it against the device-owner
 * marker): it is not a fresh authentication, and the server still validates every request's token.
 */
export async function storedSessionUser(): Promise<{ id: string; email: string | null } | null> {
  if (!url || isServer) return null;
  try {
    const raw = await sessionStorage.getItem(storageKeyFor(url));
    const s = raw ? (JSON.parse(raw) as { user?: { id?: unknown; email?: unknown } }) : null;
    const id = s?.user?.id;
    return typeof id === 'string' && id ? { id, email: typeof s?.user?.email === 'string' ? s.user.email : null } : null;
  } catch {
    return null;
  }
}

/**
 * Builds before Google sign-in kept an anonymous session in AsyncStorage. It is never used again; remove it so no
 * token outlives the model it belonged to.
 */
export async function removeLegacySession(): Promise<void> {
  if (!url || isServer) return;
  await AsyncStorage.removeItem(storageKeyFor(url)).catch(() => undefined);
}

/** Every database call. A guest asking for a per-player function gets a `signedOut` error without a request. */
export const supabaseRpc: Rpc = {
  async call(fn, args) {
    if (!PUBLIC_RPCS.has(fn) && !currentUserId()) throw new DataError('signedOut', `${fn} needs a signed-in user`);
    // supabase-js returns a fetch failure as an error object rather than throwing; the fetch wrapper above has already
    // recorded that the server didn't answer.
    const { data, error } = await supabase().rpc(fn, (args ?? {}) as { changes: Json });
    if (error) {
      reportRpcFailure(fn, error);
      throw error;
    }
    return data;
  },
};

/**
 * Report a database call that failed in a way the app didn't expect (src/observability). Reported: a missing function
 * or table (PGRST2xx — a deployment out of step with the app), bad data or permission errors (22/23/42), and server
 * errors. Not reported: no connection (the player's situation), an expired session (refreshed), and the functions'
 * own business refusals (P0xxx: "already answered", "week closed"), which screens explain to the player.
 * Only the function name and the error code are sent — never the arguments or the response.
 */
function reportRpcFailure(fn: string, error: unknown): void {
  const d = toDataError(error);
  const code = errorCode(d.detail);
  if (d.kind === 'network' || d.kind === 'auth' || code?.startsWith('P0')) return;
  reportError('rpc_failed', d, { rpc: fn, error_code: code ?? d.kind }, d.kind === 'server' ? 'warning' : 'error');
}
