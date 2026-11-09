import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { create } from 'zustand';

import { APP_BUILD_FALLBACK, type SavedMatch, isFresh, parseSaved, slotOf } from './rules';

/**
 * Matches in progress on this device, so a phone call, an app switch or the OS killing the app doesn't wipe a match.
 *
 * Every device match is deterministic from its seed, so a saved match is only its route params, its seed and the
 * player's inputs so far; reopening it replays them through the engine (see `replayArena` / the classic driver).
 * Rules: one saved match per game and context (practice, Tournament, Gauntlet), never a
 * server match, dropped when finished, after 24 hours, or when the app version changed.
 */

export * from './rules';

export const RESUME_KEY = 'tactiqo/resume/v1';
const KEY = RESUME_KEY;

export const APP_BUILD = `${Constants.expoConfig?.version ?? APP_BUILD_FALLBACK}`;

interface ResumeState {
  loaded: boolean;
  matches: Record<string, SavedMatch>;
  load: () => Promise<void>;
  save: (m: Omit<SavedMatch, 'savedAt' | 'build'>) => void;
  clear: (slot: string) => void;
  /** The saved match for a slot when it is still fresh, else null. */
  get: (slot: string) => SavedMatch | null;
  reset: () => Promise<void>;
}

let loading: Promise<void> | null = null;

const persist = (matches: Record<string, SavedMatch>) => {
  void AsyncStorage.setItem(KEY, JSON.stringify(matches)).catch(() => undefined);
};

export const useResume = create<ResumeState>((set, get) => ({
  loaded: false,
  matches: {},
  load: () => {
    if (get().loaded) return Promise.resolve();
    loading ??= AsyncStorage.getItem(KEY)
      .catch(() => null)
      .then((raw) => {
        // Anything saved in memory before the read finished is newer than the stored copy.
        set((s) => ({ loaded: true, matches: { ...parseSaved(raw, Date.now(), APP_BUILD), ...s.matches } }));
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  },
  save: (m) => {
    const slot = slotOf(m.system, m.game, m.context);
    const matches = { ...get().matches, [slot]: { ...m, savedAt: Date.now(), build: APP_BUILD } };
    set({ matches });
    persist(matches);
  },
  clear: (slot) => {
    if (!get().matches[slot]) return;
    const { [slot]: _gone, ...matches } = get().matches;
    set({ matches });
    persist(matches);
  },
  get: (slot) => {
    const m = get().matches[slot];
    return m && isFresh(m, Date.now(), APP_BUILD) ? m : null;
  },
  reset: async () => {
    set({ matches: {} });
    await AsyncStorage.removeItem(KEY).catch(() => undefined);
  },
}));
