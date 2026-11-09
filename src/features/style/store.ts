import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { EMPTY_STYLE, type StyleCounts, addStyle, parseStyle, styleFromMatch } from '@/src/style/traits';

export const STYLE_KEY = 'tactiqo/style/v1';

interface StyleState {
  counts: StyleCounts;
  loaded: boolean;
  load: () => Promise<void>;
  /** Adds one finished match (practice, tournament, Gauntlet or party seat 1). */
  record: (game: string, rounds: readonly unknown[]) => void;
  reset: () => Promise<void>;
}

/** The "How you play" tallies (src/style/traits.ts), on this device. Counts only — never the moves themselves. */
export const useStyle = create<StyleState>()((set, get) => ({
  counts: EMPTY_STYLE,
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STYLE_KEY);
      set({ counts: addStyle(parseStyle(raw ? JSON.parse(raw) : null), get().counts), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  record: (game, rounds) => {
    const add = styleFromMatch(game, rounds);
    if (add.matches === 0) return;
    const counts = addStyle(get().counts, add);
    set({ counts });
    // A record made before load finished is merged into the stored value by load(); write once loaded.
    if (get().loaded) void AsyncStorage.setItem(STYLE_KEY, JSON.stringify(counts)).catch(() => undefined);
  },
  reset: async () => {
    set({ counts: EMPTY_STYLE });
    await AsyncStorage.removeItem(STYLE_KEY).catch(() => undefined);
  },
}));
