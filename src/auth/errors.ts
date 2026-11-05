/**
 * Why a Google sign-in didn't finish, in terms the app can act on and the player can read. Pure, so it can be tested
 * without the native module: the Google library and Supabase errors are read by their codes only.
 *
 * Cancelling is not a failure: `signInFailure` returns null for it, and the screen simply goes back to how it was.
 * Raw messages, codes and tokens never reach the screen; `detail` is for development logs only.
 */

export type SignInFailureKind = 'unsupported' | 'playServices' | 'noAccount' | 'network' | 'config' | 'rejected' | 'incomplete' | 'unknown';

export interface SignInFailure {
  kind: SignInFailureKind;
  message: string;
  /** Privacy-safe diagnostic (an error code, never a token or email). */
  detail: string;
}

const MESSAGES: Record<SignInFailureKind, string> = {
  unsupported: 'Google sign-in is available in the Tactiqo app for Android. It isn’t available here yet.',
  playServices: 'Google Play services is missing or out of date on this device. Update it from the Play Store, then try again.',
  noAccount: 'No Google account was found on this device. Add one in your phone’s settings, then try again.',
  network: 'Couldn’t reach Google or our server. Check your connection and try again.',
  config: 'Google sign-in isn’t set up correctly in this build of the app. Please try again later.',
  rejected: 'Google sign-in didn’t go through. Try again, or pick a different account.',
  // The browser closed without bringing a sign-in back: the player closed it, or the app's return address isn't allowed.
  incomplete: 'Sign-in wasn’t completed. If you chose an account and still see this, please try again in a moment.',
  unknown: 'Something went wrong while signing in. Please try again.',
};

export function failure(kind: SignInFailureKind, detail = ''): SignInFailure {
  return { kind, message: MESSAGES[kind], detail };
}

/** Thrown by the platform Google module (src/auth/google.ts) with one of the kinds above. */
export class SignInError extends Error {
  readonly failure: SignInFailure;
  constructor(f: SignInFailure) {
    super(f.message);
    this.name = 'SignInError';
    this.failure = f;
  }
}

interface CodedError {
  code?: unknown;
  status?: unknown;
  name?: unknown;
  message?: unknown;
}

/** Codes from react-native-nitro-google-signin (`statusCodes`). */
const GOOGLE_CODES: Record<string, SignInFailureKind | null> = {
  SIGN_IN_CANCELLED: null,
  PLAY_SERVICES_NOT_AVAILABLE: 'playServices',
  DEVELOPER_ERROR: 'config',
  ONE_TAP_START_FAILED: 'rejected',
  IN_PROGRESS: 'rejected',
  SIGN_IN_REQUIRED: 'rejected',
};

/**
 * The failure for anything thrown while signing in, or null when the player cancelled. Understands the Google
 * library's coded errors, supabase-js auth errors (`AuthApiError` with a status, `AuthRetryableFetchError`) and fetch
 * failures. Anything unrecognised is `unknown` — never shown raw.
 */
export function signInFailure(e: unknown): SignInFailure | null {
  if (e instanceof SignInError) return e.failure;
  const x = (e ?? {}) as CodedError;
  const code = typeof x.code === 'string' ? x.code : '';
  const name = typeof x.name === 'string' ? x.name : '';
  const status = typeof x.status === 'number' ? x.status : 0;
  // For development diagnostics only: the error's name, code, status and a short message — never a token.
  const why = [name, code, status || '', typeof x.message === 'string' ? x.message.slice(0, 140) : ''].filter(Boolean).join(' ');

  if (code in GOOGLE_CODES) {
    const kind = GOOGLE_CODES[code];
    return kind === null ? null : failure(kind, code);
  }
  // supabase-js: the request never got an answer.
  if (name === 'AuthRetryableFetchError' || name === 'TypeError' || name === 'AbortError') return failure('network', why);
  // Supabase refused the ID token: provider off, client id not allowed, nonce mismatch, expired token.
  if (code === 'provider_disabled' || code === 'validation_failed') return failure('config', why);
  if (status >= 500) return failure('network', why);
  if (status >= 400) return failure('rejected', why);
  return failure('unknown', why);
}
