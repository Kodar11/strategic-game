import { create } from 'zustand';

import { type AuthEvent, type AuthState, INITIAL_AUTH, authReducer } from './state.ts';

/**
 * The app's one view of who is signed in (see state.ts). Only src/data/session.ts dispatches; screens read it. It
 * never holds tokens — those stay inside the Supabase client and its secure storage.
 */
export const useAuth = create<AuthState>(() => INITIAL_AUTH);

export function dispatchAuth(event: AuthEvent): void {
  useAuth.setState((s) => authReducer(s, event), true);
}

/** The signed-in user's id, or null for a guest (or while start-up hasn't decided yet). */
export function currentUserId(): string | null {
  return useAuth.getState().user?.id ?? null;
}
