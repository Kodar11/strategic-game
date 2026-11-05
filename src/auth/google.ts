import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import type { OneTapResponse } from 'react-native-nitro-google-signin';

import { SignInError, failure } from './errors';

/**
 * How Tactiqo gets a Google identity for Supabase. Two interchangeable paths, chosen once per build:
 *
 * - `browser` (the default, everywhere — Expo Go, development builds, APK and store builds): Supabase's OAuth flow in
 *   the system browser with PKCE (src/auth/browser-sign-in.ts). Needs only the Supabase Google provider and the app's
 *   redirect URL in Supabase's allow list — no Android OAuth client, no SHA-1, no client id inside the app.
 * - `native` (opt-in: `EXPO_PUBLIC_GOOGLE_SIGN_IN=native`): Android Credential Manager's account sheet, then
 *   `signInWithIdToken` with a nonce. Smoother, but it only works when the Android OAuth client in Google Cloud has the
 *   SHA-1 of the exact key that signed the installed build (EAS keystore, Play App Signing key) — otherwise Google
 *   cancels right after the account is picked and nothing reaches Supabase. Not available in Expo Go.
 *
 * Both end in the same Supabase user for the same Google account. Nothing here is stored: the ID token (native) is
 * used once and dropped, and only `openid email profile` are requested. The web build resolves google.web.ts.
 *
 * Native replay protection: each attempt makes a fresh random nonce. Google receives its SHA-256 (the ID token's
 * `nonce` claim) and Supabase receives the raw value, hashes it and checks it matches.
 */

export type GoogleIdToken = { type: 'success'; idToken: string; nonce: string } | { type: 'cancelled' };

/** The Web OAuth client id (public; it is the audience Supabase checks). Native path only. Inlined at build time. */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
/** iOS only, for later: the iOS OAuth client id. Unused on Android. */
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
/** `native` opts this build into the Credential Manager path; anything else (or unset) uses the browser. */
const WANT_NATIVE = process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN === 'native';

type GoogleModule = typeof import('react-native-nitro-google-signin');

const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function loadNative(): GoogleModule | null {
  // Expo Go doesn't contain the native module; loading it there would throw at start-up.
  if (!WANT_NATIVE || inExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-nitro-google-signin') as GoogleModule;
  } catch {
    return null;
  }
}

const native = loadNative();

/** How this build signs in (see above). `native` falls back to `browser` where the module isn't available. */
export const googleSignInMode: 'native' | 'browser' | 'none' = native ? 'native' : 'browser';

export const googleSignInAvailable = true;

/** Shown under the Google button; nothing to say on phones. */
export const googleSignInNote: string | null = null;

async function newNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = Crypto.getRandomBytes(32);
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw, { encoding: Crypto.CryptoEncoding.HEX });
  return { raw, hashed };
}

function tokenFrom(r: OneTapResponse, nonce: string): GoogleIdToken | null {
  if (r.type === 'cancelled') return { type: 'cancelled' };
  if (r.type === 'success' && r.data?.idToken) return { type: 'success', idToken: r.data.idToken, nonce };
  if (r.type === 'success') throw new SignInError(failure('rejected', 'no id token'));
  return null;
}

/**
 * Show Google's account picker and return an ID token for the chosen account, or `cancelled`. Throws a SignInError
 * for everything else (no Play services, no account, misconfiguration, network, no native module).
 */
export async function requestGoogleIdToken(): Promise<GoogleIdToken> {
  if (!native) throw new SignInError(failure('unsupported', 'native module missing'));
  if (!WEB_CLIENT_ID) throw new SignInError(failure('config', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set'));
  const { GoogleOneTapSignIn } = native;
  const nonce = await newNonce();
  // Configured per attempt so every request carries its own nonce. No offline access, no extra scopes.
  GoogleOneTapSignIn.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID ?? null, nonce: nonce.hashed, autoSelectOnSignIn: false });

  await GoogleOneTapSignIn.checkPlayServices(true);
  // Every Google account on the device, so a different account can be chosen when switching. With none saved,
  // Google's explicit "Sign in with Google" dialog lets the player add one.
  const picked = tokenFrom(await GoogleOneTapSignIn.createAccount(), nonce.raw);
  if (picked) return picked;
  const explicit = tokenFrom(await GoogleOneTapSignIn.presentExplicitSignIn(), nonce.raw);
  if (explicit) return explicit;
  throw new SignInError(failure('noAccount', 'noSavedCredentialFound'));
}

/**
 * Forget the Google choice on this device (Android: turns off automatic re-selection), so the next sign-in shows the
 * picker again. Best effort: the Supabase sign-out is what ends the session.
 */
export async function forgetGoogleAccount(): Promise<void> {
  if (!native || !WEB_CLIENT_ID) return;
  try {
    native.GoogleOneTapSignIn.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID ?? null });
    await native.GoogleOneTapSignIn.signOut();
  } catch {
    // Nothing to forget, or the native side is unavailable: the app session is already gone either way.
  }
}
