import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { type BoutOutcome, type GauntletRun, type Perk, boutsWon, newRun, parseRun, reportBout, takePerk } from '@/src/tournament/gauntlet';
import type { Season } from '@/src/tournament/schema';

export const GAUNTLET_KEY = 'tactiqo/gauntlet/v1';

interface GauntletState {
  run: GauntletRun | null;
  /** Most bouts won in one run. */
  best: number;
  runs: number;
  loaded: boolean;
  load: (season: Season) => Promise<void>;
  start: (season: Season) => void;
  /**
   * The play screen reports a finished bout with the token it was opened with (`seed-at`), so a reload, a second tap
   * or an old screen can never record a bout twice or against the wrong run.
   */
  report: (token: string, outcome: BoutOutcome) => GauntletRun | null;
  pick: (perk: Perk) => void;
  abandon: () => void;
  reset: () => Promise<void>;
}

export const boutToken = (run: GauntletRun) => `${run.seed}-${run.at}`;

export const useGauntlet = create<GauntletState>()((set, get) => {
  const save = () => {
    const { run, best, runs } = get();
    void AsyncStorage.setItem(GAUNTLET_KEY, JSON.stringify({ run, best, runs })).catch(() => undefined);
  };
  const update = (run: GauntletRun | null) => {
    const best = Math.max(get().best, run ? boutsWon(run) : 0);
    set({ run, best });
    save();
  };
  return {
    run: null,
    best: 0,
    runs: 0,
    loaded: false,
    load: async (season) => {
      if (get().loaded) return;
      try {
        const raw = await AsyncStorage.getItem(GAUNTLET_KEY);
        const v = raw ? (JSON.parse(raw) as { run?: unknown; best?: unknown; runs?: unknown }) : {};
        const best = Number.isInteger(v.best) ? (v.best as number) : 0;
        const runs = Number.isInteger(v.runs) ? (v.runs as number) : 0;
        set({ run: parseRun(v.run, season), best, runs, loaded: true });
      } catch {
        set({ loaded: true });
      }
    },
    start: (season) => {
      set({ runs: get().runs + 1 });
      update(newRun(season, (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0));
    },
    report: (token, outcome) => {
      const run = get().run;
      if (!run || run.over || run.choice || boutToken(run) !== token) return null;
      const next = reportBout(run, outcome);
      update(next);
      return next;
    },
    pick: (perk) => {
      const run = get().run;
      if (run) update(takePerk(run, perk));
    },
    abandon: () => update(null),
    reset: async () => {
      set({ run: null, best: 0, runs: 0 });
      await AsyncStorage.removeItem(GAUNTLET_KEY).catch(() => undefined);
    },
  };
});
