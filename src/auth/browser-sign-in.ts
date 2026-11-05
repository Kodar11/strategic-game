import type { SupabaseClient, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { parseAuthCallback } from './browser-callback';
import { SignInError, failure } from './errors';

/**
 * Google sign-in through Supabase's OAuth flow in the system browser, with PKCE — the default path everywhere
 * (src/auth/google.ts): Expo Go, development builds, the APK and store builds.
 *
 *   signInWithOAuth (skipBrowserRedirect) → Google's page in a browser tab → https://<ref>.supabase.co/auth/v1/callback
 *   → redirect to the app with ?code=… → exchangeCodeForSession(code, { flowId })
 *
 * The app's return address (`redirectTo`) is:
 * - Expo Go:            exp://<dev machine IP>:<port>/--/auth-callback   (changes with the network)
 * - any installed build: tactiqo://auth-callback
 * Both must be allowed in Supabase → Authentication → URL Configuration → Redirect URLs, or Supabase silently sends the
 * browser to the Site URL instead and the app never gets the code. Google Cloud needs only the Web client, with
 * https://<ref>.supabase.co/auth/v1/callback as an authorized redirect URI; Supabase holds its id and secret.
 *
 * Android quirks handled here: the auth session can report "dismiss" a moment before the redirect link is delivered,
 * so the link is also caught directly; and Expo Go may restart the JavaScript when the link opens it, in which case
 * app/auth-callback.tsx finishes the sign-in from the link (the PKCE verifier is in secure storage).
 */

export const BROWSER_REDIRECT_PATH = 'auth-callback';
/** The scheme installed builds answer to (app.json lists two; this one is the canonical). Expo Go uses exp:// instead. */
export const APP_SCHEME = 'tactiqo';

/** How long to keep waiting for the redirect link after the browser reports it closed. */
const LATE_REDIRECT_MS = 2500;

export type BrowserSignIn = { type: 'success'; user: User } | { type: 'cancelled' };

/** True while signInWithGoogleInBrowser is waiting for Google in this JavaScript context. */
let running = false;
export function browserSignInRunning(): boolean {
  return running;
}

/** Auth codes already exchanged (or being exchanged): a code is single-use, so it must never be sent twice. */
const consumed = new Set<string>();

/**
 * Turn a redirect back from Supabase into a session. Used by the running sign-in, and by app/auth-callback.tsx when
 * Expo Go restarted the JavaScript on the way back (it does on Android): the PKCE verifier is in secure storage, so
 * the exchange still works after the restart. Without a flow id, supabase-js uses the most recently stored verifier.
 * Returns null when this code was already handled.
 */
export async function completeBrowserSignIn(client: SupabaseClient, url: string, flowId?: string | null): Promise<BrowserSignIn | null> {
  const callback = parseAuthCallback(url);
  if (callback.type === 'cancelled') return { type: 'cancelled' };
  if (callback.type === 'error') throw new SignInError(failure('rejected', `callback ${callback.code}`));
  if (consumed.has(callback.code)) return null;
  consumed.add(callback.code);

  const exchanged = await client.auth.exchangeCodeForSession(callback.code, flowId ? { flowId } : undefined);
  if (exchanged.error) throw exchanged.error;
  if (!exchanged.data.user) throw new SignInError(failure('rejected', 'no user'));
  return { type: 'success', user: exchanged.data.user };
}

export async function signInWithGoogleInBrowser(client: SupabaseClient): Promise<BrowserSignIn | null> {
  running = true;
  try {
    return await runBrowserSignIn(client);
  } finally {
    running = false;
  }
}

async function runBrowserSignIn(client: SupabaseClient): Promise<BrowserSignIn | null> {
  const redirectTo = Linking.createURL(BROWSER_REDIRECT_PATH, { scheme: APP_SCHEME });
  // The exact address Supabase must allow (Authentication → URL Configuration → Redirect URLs).
  if (__DEV__) console.info(`[auth] Google sign-in redirectTo = ${redirectTo}`);
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Always show the account chooser, so switching accounts works.
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
  if (!data.url) throw new SignInError(failure('config', 'no authorize url'));

  // Catch the redirect link however it arrives: as the auth session's result, or as an ordinary deep link.
  const link: { url: string | null; notify: (() => void) | null } = { url: null, notify: null };
  const isRedirect = (url: string) => url.startsWith(redirectTo) || /[?#&](code|error)=/.test(url);
  const sub = Linking.addEventListener('url', ({ url }) => {
    if (!link.url && isRedirect(url)) {
      link.url = url;
      link.notify?.();
    }
  });

  let returned: string | null = null;
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'success') returned = result.url;
    else if (link.url) returned = link.url;
    else {
      // The browser closed first; give a redirect that is still on its way a moment to arrive.
      returned = await new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => resolve(link.url), LATE_REDIRECT_MS);
        link.notify = () => {
          clearTimeout(timer);
          resolve(link.url);
        };
      });
    }
  } finally {
    sub.remove();
  }

  if (!returned) {
    // Closed the tab without signing in — or Supabase sent the browser somewhere else because this address isn't in its
    // Redirect URLs (it then falls back to the Site URL). Said out loud rather than treated as a silent cancel; the
    // detail (shown in development builds) names the exact address Supabase must allow.
    if (__DEV__) console.warn(`[auth] browser sign-in ended without a redirect to ${redirectTo}; add it (or a wildcard) to Supabase → Authentication → URL Configuration → Redirect URLs`);
    throw new SignInError(failure('incomplete', `no redirect back to ${redirectTo} (${result.type})`));
  }

  return completeBrowserSignIn(client, returned, data.flowId);
}
