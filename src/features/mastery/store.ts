import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { type MasteryMap, type MatchFacts, type StarKind, award, gameKey, parseMastery } from '@/src/mastery/rules';

/**
 * Rival mastery stars on this device (rules in src/mastery/rules.ts). Recorded when a device match ends and when a
 * mystery read is scored; stars are never removed except by clearing the device's account data.
 */

export const MASTERY_KEY = 'tactiqo/mastery/v1';

export interface FreshStar {
  key: string;
  opponent: string;
  kind: StarKind;
  at: number;
}

interface MasteryState {
  loaded: boolean;
  stars: MasteryMap;
  /** Stars earned since the app started, for the "new star" line on the result screen. */
  fresh: FreshStar[];
  load: () => Promise<void>;
  record: (f: MatchFacts) => StarKind[];
  reset: () => Promise<void>;
}

let loading: Promise<void> | null = null;

export const useMastery = create<MasteryState>((set, get) => ({
  loaded: false,
  stars: {},
  fresh: [],
  load: () => {
    if (get().loaded) return Promise.resolve();
    loading ??= AsyncStorage.getItem(MASTERY_KEY)
      .catch(() => null)
      .then((raw) => {
        let stored: MasteryMap = {};
        try {
          stored = raw ? parseMastery(JSON.parse(raw)) : {};
        } catch {
          stored = {};
        }
        // Stars earned before the read finished are merged in, never lost.
        let stars = stored;
        for (const [key, rivals] of Object.entries(get().stars))
          for (const [opponent, held] of Object.entries(rivals)) stars = { ...stars, [key]: { ...stars[key], [opponent]: { ...stars[key]?.[opponent], ...held } } };
        set({ loaded: true, stars });
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  },
  record: (f) => {
    const { map, fresh } = award(get().stars, f);
    if (!fresh.length) return fresh;
    const at = Date.now();
    set((s) => ({ stars: map, fresh: [...s.fresh, ...fresh.map((kind) => ({ key: gameKey(f.system, f.game), opponent: f.opponent, kind, at }))] }));
    // Written only once the stored copy has been read, so an early win can't overwrite older stars.
    void get()
      .load()
      .then(() => AsyncStorage.setItem(MASTERY_KEY, JSON.stringify(get().stars)))
      .catch(() => undefined);
    return fresh;
  },
  reset: async () => {
    set({ stars: {}, fresh: [] });
    await AsyncStorage.removeItem(MASTERY_KEY).catch(() => undefined);
  },
}));
