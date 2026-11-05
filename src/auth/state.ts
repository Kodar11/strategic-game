/**
 * Who is using the app, as one explicit state. Pure: the store (src/auth/store.ts) applies these transitions and the
 * screens read the result. The Supabase session is the source of truth; this only mirrors it for rendering.
 *
 * - `initializing` — the saved session hasn't been checked yet. Never treated as signed out: nothing user-specific
 *   renders until start-up has decided.
 * - `signedOut` — exploring as a guest. Progress is kept on this device only.
 * - `signingIn` / `signingOut` / `deleting` — a request is running; the buttons that would start another are disabled.
 * - `signedIn` — a verified Supabase user.
 *
 * `error` is a recoverable, readable message from the last action (shown next to the button that failed); it is
 * cleared by the next action. `user.email` is what Google verified; it is display-only and never an identifier.
 */

export type AuthStatus = 'initializing' | 'signedOut' | 'signingIn' | 'signedIn' | 'signingOut' | 'deleting';

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
}

export type AuthEvent =
  | { type: 'restored'; user: AuthUser | null }
  | { type: 'signInStarted' }
  | { type: 'signInCancelled' }
  | { type: 'signInFailed'; message: string }
  | { type: 'signedIn'; user: AuthUser }
  | { type: 'signOutStarted' }
  | { type: 'signOutFailed'; message: string }
  | { type: 'deleteStarted' }
  | { type: 'deleteFailed'; message: string }
  | { type: 'signedOut' }
  | { type: 'userUpdated'; user: AuthUser }
  | { type: 'clearError' };

export const INITIAL_AUTH: AuthState = { status: 'initializing', user: null, error: null };

/** Busy states: another sign-in, sign-out or deletion can't start while one of these is running. */
export function isBusy(s: AuthState): boolean {
  return s.status === 'initializing' || s.status === 'signingIn' || s.status === 'signingOut' || s.status === 'deleting';
}

export function authReducer(s: AuthState, e: AuthEvent): AuthState {
  switch (e.type) {
    case 'restored':
      return e.user ? { status: 'signedIn', user: e.user, error: null } : { status: 'signedOut', user: null, error: null };
    case 'signInStarted':
      return s.status === 'signedOut' ? { status: 'signingIn', user: null, error: null } : s;
    case 'signInCancelled':
      return s.status === 'signingIn' ? { status: 'signedOut', user: null, error: null } : s;
    case 'signInFailed':
      return s.status === 'signingIn' ? { status: 'signedOut', user: null, error: e.message } : s;
    case 'signedIn':
      return { status: 'signedIn', user: e.user, error: null };
    case 'signOutStarted':
      return s.status === 'signedIn' ? { ...s, status: 'signingOut', error: null } : s;
    case 'signOutFailed':
      return s.status === 'signingOut' ? { ...s, status: 'signedIn', error: e.message } : s;
    case 'deleteStarted':
      return s.status === 'signedIn' ? { ...s, status: 'deleting', error: null } : s;
    case 'deleteFailed':
      return s.status === 'deleting' ? { ...s, status: 'signedIn', error: e.message } : s;
    case 'signedOut':
      // Also the session ending by itself (revoked, expired): whatever was running, the app is now a guest.
      return { status: 'signedOut', user: null, error: null };
    case 'userUpdated':
      return s.user && s.user.id === e.user.id ? { ...s, user: e.user } : s;
    case 'clearError':
      return s.error ? { ...s, error: null } : s;
  }
}
