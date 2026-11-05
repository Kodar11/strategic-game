import * as SecureStore from 'expo-secure-store';

import { type SupabaseStorage, chunkedStorage } from './chunked-storage';

/**
 * Where the Supabase session (access and refresh tokens) lives on a phone: the OS keystore through expo-secure-store,
 * split into chunks by chunkedStorage. `AFTER_FIRST_UNLOCK` lets a token refresh run while the phone is locked after a
 * restart (iOS; Android's keystore has no such restriction). Nothing else in the app reads these entries.
 *
 * The web build uses session-storage.web.ts instead (SecureStore doesn't exist there).
 */
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const sessionStorage: SupabaseStorage = chunkedStorage({
  getItem: (k) => SecureStore.getItemAsync(k, options),
  setItem: (k, v) => SecureStore.setItemAsync(k, v, options),
  removeItem: (k) => SecureStore.deleteItemAsync(k, options),
});
