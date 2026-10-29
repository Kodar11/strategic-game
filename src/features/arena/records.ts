import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { ARENA } from '@/src/arena/catalog';
import { ARENA_IDS, type ArenaGameId, LENGTHS, LEVELS, type Level, type MatchLength, type Outcome, isArenaId, isLength, isLevel } from '@/src/arena/core';

/**
 * Strategy Arena records, kept on this device only: win/loss per game and per opponent, best score, the last few
 * matches, which games' coach tips have been seen, and the last setup used. Arena matches never touch the backend —
 * there is nothing competitive to verify — so a cleared device just starts fresh. Everything read back is validated.
 */

const KEY = 'tactiqo/arena-records/v1';
const RECENT = 8;

export interface Tally {
  w: number;
  l: number;
  d: number;
}

export interface RecentMatch {
  at: number;
  /** An opponent id from that game's catalog. */
  persona: string;
  level: Level;
  variant: string;
  outcome: Outcome;
  player: number;
  rival: number;
}

export interface GameRecord extends Tally {
  best: number | null;
  byPersona: Partial<Record<string, Tally>>;
  recent: RecentMatch[];
}

export interface ArenaPrefs {
  persona: string;
  level: Level;
  length: MatchLength;
  variant: string;
}

interface Stored {
  games: Partial<Record<ArenaGameId, GameRecord>>;
  coached: Partial<Record<ArenaGameId, true>>;
  prefs: Partial<Record<ArenaGameId, ArenaPrefs>>;
}

interface ArenaRecordsState extends Stored {
  loaded: boolean;
  load: () => Promise<void>;
  /** Records a finished match; returns whether it set a new best score. */
  record: (game: ArenaGameId, m: Omit<RecentMatch, 'at'>) => boolean;
  markCoached: (game: ArenaGameId) => void;
  savePrefs: (game: ArenaGameId, prefs: ArenaPrefs) => void;
}

const int = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : null);
const count = (x: unknown) => Math.max(0, int(x) ?? 0);
const tally = (x: unknown): Tally => {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  return { w: count(o.w), l: count(o.l), d: count(o.d) };
};
const isOutcome = (x: unknown): x is Outcome => x === 'win' || x === 'loss' || x === 'draw';

/** Rebuilds a stored blob from scratch, keeping only well-formed parts. */
export function sanitize(raw: unknown): Stored {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Stored = { games: {}, coached: {}, prefs: {} };
  const games = (o.games && typeof o.games === 'object' ? o.games : {}) as Record<string, unknown>;
  for (const id of ARENA_IDS) {
    const g = games[id];
    if (!g || typeof g !== 'object') continue;
    const r = g as Record<string, unknown>;
    const byPersona: GameRecord['byPersona'] = {};
    const bp = (r.byPersona && typeof r.byPersona === 'object' ? r.byPersona : {}) as Record<string, unknown>;
    // Only opponents this game still offers (the Cooperation Game changed its cast; old entries are dropped).
    const ids = ARENA[id].opponents.map((o) => o.id);
    const valid = (x: unknown): x is string => typeof x === 'string' && ids.includes(x);
    for (const p of ids) if (bp[p]) byPersona[p] = tally(bp[p]);
    const recent = (Array.isArray(r.recent) ? r.recent : [])
      .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
      .filter((m) => valid(m.persona) && isLevel(m.level) && isOutcome(m.outcome) && int(m.player) !== null && int(m.rival) !== null && int(m.at) !== null)
      .map((m) => ({ at: int(m.at)!, persona: m.persona as string, level: m.level as Level, variant: typeof m.variant === 'string' ? m.variant : '', outcome: m.outcome as Outcome, player: int(m.player)!, rival: int(m.rival)! }))
      .slice(0, RECENT);
    out.games[id] = { ...tally(r), best: int(r.best), byPersona, recent };
  }
  const coached = (o.coached && typeof o.coached === 'object' ? o.coached : {}) as Record<string, unknown>;
  for (const id of ARENA_IDS) if (coached[id] === true) out.coached[id] = true;
  const prefs = (o.prefs && typeof o.prefs === 'object' ? o.prefs : {}) as Record<string, unknown>;
  for (const id of ARENA_IDS) {
    const p = prefs[id] as Record<string, unknown> | undefined;
    if (p && typeof p.persona === 'string' && ARENA[id].opponents.some((o) => o.id === p.persona) && isLevel(p.level) && isLength(p.length) && typeof p.variant === 'string') out.prefs[id] = { persona: p.persona, level: p.level, length: p.length, variant: p.variant };
  }
  return out;
}

const persist = (s: Stored) => AsyncStorage.setItem(KEY, JSON.stringify({ games: s.games, coached: s.coached, prefs: s.prefs })).catch(() => undefined);

export const useArenaRecords = create<ArenaRecordsState>()((set, get) => ({
  games: {},
  coached: {},
  prefs: {},
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      set({ ...sanitize(raw ? JSON.parse(raw) : {}), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  record: (game, m) => {
    const prev = get().games[game] ?? { w: 0, l: 0, d: 0, best: null, byPersona: {}, recent: [] };
    const key = m.outcome === 'win' ? 'w' : m.outcome === 'loss' ? 'l' : 'd';
    const p = prev.byPersona[m.persona] ?? { w: 0, l: 0, d: 0 };
    const newBest = prev.best === null || m.player > prev.best;
    const next: GameRecord = {
      ...prev,
      [key]: prev[key] + 1,
      best: newBest ? m.player : prev.best,
      byPersona: { ...prev.byPersona, [m.persona]: { ...p, [key]: p[key] + 1 } },
      recent: [{ ...m, at: Date.now() }, ...prev.recent].slice(0, RECENT),
    };
    set({ games: { ...get().games, [game]: next } });
    persist(get());
    // The first match of a game always sets "a best"; only call it new when there was one to beat.
    return newBest && prev.best !== null;
  },
  markCoached: (game) => {
    if (get().coached[game]) return;
    set({ coached: { ...get().coached, [game]: true } });
    persist(get());
  },
  savePrefs: (game, prefs) => {
    set({ prefs: { ...get().prefs, [game]: prefs } });
    persist(get());
  },
}));

export const played = (r: GameRecord | undefined) => (r ? r.w + r.l + r.d : 0);

export { LENGTHS, LEVELS, isArenaId };
