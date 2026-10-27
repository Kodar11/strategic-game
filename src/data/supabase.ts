import AsyncStorage from '@react-native-async-storage/async-storage';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database, Json } from './database.types';
import { DataError, toDataError } from './errors';
import type { Rpc } from './repositories';

/**
 * The one Supabase client. It uses only the project URL and the publishable (anon) key — values meant to ship in the
 * app; row level security decides what they can reach. A secret / service-role key is refused outright.
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

let client: SupabaseClient<Database> | null = null;

export function supabase(): SupabaseClient<Database> {
  if (client) return client;
  if (!url || !key) throw new DataError('config', 'EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY is not set');
  if (isPrivilegedKey(key)) throw new DataError('config', 'EXPO_PUBLIC_SUPABASE_KEY is a secret key; the app must use the publishable key');
  client = createClient<Database>(url, key, {
    auth: {
      storage: isServer ? undefined : AsyncStorage,
      autoRefreshToken: !isServer,
      persistSession: !isServer,
      detectSessionInUrl: false,
    },
  });
  // Refresh tokens only while the app is in the foreground (Supabase's guidance for React Native).
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}

/**
 * The signed-in user's id, signing in anonymously the first time. The session is kept on the device, so the same
 * learner comes back on every launch until the app's storage is cleared (see docs/DATA_ARCHITECTURE.md).
 */
export async function ensureUser(): Promise<string> {
  const auth = supabase().auth;
  const { data: current, error: sessionError } = await auth.getSession();
  if (sessionError) throw toDataError(sessionError);
  if (current.session?.user) return current.session.user.id;
  const { data, error } = await auth.signInAnonymously();
  if (error?.code === 'anonymous_provider_disabled')
    throw new DataError('config', error.message, 'Anonymous sign-in is turned off for this Supabase project. Turn it on under Authentication → Sign In / Providers, then try again.');
  if (error || !data.user) throw new DataError('auth', error ? `${error.code ?? ''} ${error.message}` : 'no user returned');
  return data.user.id;
}

export const supabaseRpc: Rpc = {
  async call(fn, args) {
    const { data, error } = await supabase().rpc(fn, (args ?? {}) as { changes: Json });
    if (error) throw error;
    return data;
  },
};
