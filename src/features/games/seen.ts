import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { GameId } from '@/src/games/core';

/**
 * Which games' rules the player has already read on this device, so the full rules show before the first match and
 * stay one tap away after that. A device preference like the settings; losing it only means seeing the rules again.
 */

const KEY = 'strategic-game/games-seen';

interface SeenState {
  seen: Partial<Record<GameId, true>>;
  loaded: boolean;
  load: () => Promise<void>;
  markSeen: (id: GameId) => void;
}

export const useSeenRules = create<SeenState>()((set, get) => ({
  seen: {},
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      set({ seen: parsed && typeof parsed === 'object' ? (parsed as SeenState['seen']) : {}, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  markSeen: (id) => {
    const seen = { ...get().seen, [id]: true as const };
    set({ seen });
    AsyncStorage.setItem(KEY, JSON.stringify(seen)).catch(() => undefined);
  },
}));
