import { SignInError, failure } from './errors';

/**
 * Web build: native Google sign-in doesn't exist in a browser, and Tactiqo ships Android first. The app on web runs as
 * a guest; the sign-in buttons explain that sign-in is in the Android app. Same exports as google.ts.
 */

export type GoogleIdToken = { type: 'success'; idToken: string; nonce: string } | { type: 'cancelled' };

export const googleSignInAvailable = false;

export const googleSignInMode: 'native' | 'browser' | 'none' = 'none';

export const googleSignInNote: string | null = 'Sign-in is available in the Tactiqo app for Android.';

export async function requestGoogleIdToken(): Promise<GoogleIdToken> {
  throw new SignInError(failure('unsupported', 'web'));
}

export async function forgetGoogleAccount(): Promise<void> {}
