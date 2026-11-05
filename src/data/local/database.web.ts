import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { kvStore } from './kv-store';
import type { LocalStore } from './local-store';

/**
 * On web the local store is the key-value one over localStorage: expo-sqlite's web build needs WebAssembly and
 * cross-origin isolation headers that the static site doesn't send. Static rendering (Node, no window) gets an
 * in-memory store that is never used for real data.
 */

export const DATABASE_NAME = 'tactiqo.db';

const memory = new Map<string, string>();
const memoryStorage = {
  getItem: async (k: string) => memory.get(k) ?? null,
  setItem: async (k: string, v: string) => void memory.set(k, v),
  removeItem: async (k: string) => void memory.delete(k),
};

let store: LocalStore | null = null;

export function localStore(): Promise<LocalStore> {
  store ??= kvStore(Platform.OS === 'web' && typeof window === 'undefined' ? memoryStorage : AsyncStorage);
  return Promise.resolve(store);
}
