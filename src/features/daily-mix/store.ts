import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export const DAILY_MIX_KEY = 'tactiqo/daily-mix/v1';

/** What happened on a Crowd or Read Rush day, on this device. Challenge days live on the server. */
export type MixDay =
  | { format: 'rush'; score: number; answered: number }
  | { format: 'crowd'; questionId: string; value: number };

interface Stored {
  days: Record<string, MixDay>;
  rushBest: number;
}

interface MixState extends Stored {
  loaded: boolean;
  load: () => Promise<void>;
  /** The first run of the day is the day's result; later runs are practice and only move the best. */
  recordRush: (day: string, score: number, answered: number) => { official: boolean; best: boolean };
  recordCrowd: (day: string, questionId: string, value: number) => void;
  reset: () => Promise<void>;
}

const EMPTY: Stored = { days: {}, rushBest: 0 };
const KEEP_DAYS = 120;

function parse(raw: unknown): Stored {
  const r = raw as Partial<Stored> | null;
  if (!r || typeof r !== 'object' || typeof r.days !== 'object' || r.days === null) return EMPTY;
  const days: Record<string, MixDay> = {};
  for (const [k, v] of Object.entries(r.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== 'object') continue;
    if (v.format === 'rush' && Number.isInteger(v.score) && Number.isInteger(v.answered)) days[k] = { format: 'rush', score: v.score, answered: v.answered };
    if (v.format === 'crowd' && typeof v.questionId === 'string' && Number.isInteger(v.value)) days[k] = { format: 'crowd', questionId: v.questionId, value: v.value };
  }
  return { days, rushBest: Number.isInteger(r.rushBest) && r.rushBest! >= 0 ? r.rushBest! : 0 };
}

/** Only the most recent days are kept: enough for the streak and the calendar, never an ever-growing log. */
function trim(days: Record<string, MixDay>): Record<string, MixDay> {
  const keys = Object.keys(days).sort().slice(-KEEP_DAYS);
  return Object.fromEntries(keys.map((k) => [k, days[k]]));
}

export const useDailyMix = create<MixState>()((set, get) => {
  const save = () => {
    const { days, rushBest } = get();
    void AsyncStorage.setItem(DAILY_MIX_KEY, JSON.stringify({ days, rushBest })).catch(() => undefined);
  };
  return {
    ...EMPTY,
    loaded: false,
    load: async () => {
      if (get().loaded) return;
      try {
        const raw = await AsyncStorage.getItem(DAILY_MIX_KEY);
        const stored = parse(raw ? JSON.parse(raw) : null);
        // Anything recorded before the load finished wins over the stored copy.
        set((s) => ({ days: { ...stored.days, ...s.days }, rushBest: Math.max(stored.rushBest, s.rushBest), loaded: true }));
      } catch {
        set({ loaded: true });
      }
    },
    recordRush: (day, score, answered) => {
      const s = get();
      const official = !s.days[day];
      const best = score > s.rushBest;
      set({ days: official ? trim({ ...s.days, [day]: { format: 'rush', score, answered } }) : s.days, rushBest: Math.max(s.rushBest, score) });
      save();
      return { official, best };
    },
    recordCrowd: (day, questionId, value) => {
      set((s) => ({ days: trim({ ...s.days, [day]: { format: 'crowd', questionId, value } }) }));
      save();
    },
    reset: async () => {
      set({ ...EMPTY });
      await AsyncStorage.removeItem(DAILY_MIX_KEY).catch(() => undefined);
    },
  };
});
