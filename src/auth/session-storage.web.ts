import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SupabaseStorage } from './chunked-storage';

/**
 * The web build keeps the Supabase session in localStorage (through AsyncStorage's web implementation), the standard
 * for browser apps. Google sign-in itself is native-only for now (google.web.ts), so on web this normally stays empty.
 */
export const sessionStorage: SupabaseStorage = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};
