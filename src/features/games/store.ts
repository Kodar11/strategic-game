import { create } from 'zustand';

import { DataError, toDataError } from '../../data/errors.ts';
import { type GamesOverview, type GamesRepository, type GlobalBoard, type HallOfFameEntry, type MyGames, type PracticeRecord, type WeeklyBoard, GameError } from '../../data/games.ts';

/**
 * Games state for the screens: the Games home (featured competition), leaderboards, the Hall of Fame and the player's
 * own game record. A cache of what Supabase returned, kept in memory only, and separate from the lesson progress
 * store. Practice games never wait on any of this: they run on the device.
 */

export type Loadable<T> = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; data: T; loadedAt: number } | { status: 'error'; error: DataError };

export interface GamesState {
  overview: Loadable<GamesOverview>;
  weekly: Record<string, Loadable<WeeklyBoard>>;
  global: Loadable<GlobalBoard>;
  hall: Loadable<HallOfFameEntry[]>;
  mine: Loadable<MyGames>;
  loadOverview: (opts?: { force?: boolean }) => Promise<void>;
  /** '' = the featured week. */
  loadWeekly: (competitionId?: string, opts?: { force?: boolean }) => Promise<void>;
  loadGlobal: (opts?: { force?: boolean }) => Promise<void>;
  loadHall: (opts?: { force?: boolean }) => Promise<void>;
  loadMine: (opts?: { force?: boolean }) => Promise<void>;
  setNickname: (name: string) => Promise<string>;
  /** Best effort: practice is logged for "your recent games"; a failure is retried once and otherwise dropped. */
  recordPractice: (r: PracticeRecord) => Promise<void>;
}

/** Boards are reused this long before a visit refetches them. */
export const GAMES_TTL_MS = 30_000;

export function createGamesStore(repo: GamesRepository, now: () => number = Date.now) {
  const inflight = new Map<string, Promise<void>>();

  return create<GamesState>()((set, get) => {
    /** Load into a slot, keeping stale data on screen while refreshing and showing an error only when there's none. */
    function load<T>(key: string, read: () => Loadable<T>, write: (v: Loadable<T>) => void, fetch: () => Promise<T>, force?: boolean): Promise<void> {
      const cur = read();
      if (!force && cur.status === 'ready' && now() - cur.loadedAt < GAMES_TTL_MS) return Promise.resolve();
      const pending = inflight.get(key);
      if (pending) return pending;
      if (cur.status !== 'ready') write({ status: 'loading' });
      const p = fetch()
        .then((data) => write({ status: 'ready', data, loadedAt: now() }))
        .catch((e: unknown) => {
          const d = toDataError(e);
          // A read can't lose anything, so say what failed instead of the generic "refused a change".
          const error = d.transient || d instanceof GameError ? d : new DataError(d.kind, d.detail, 'Games data isn’t available from the server right now. Try again later.');
          if (read().status !== 'ready') write({ status: 'error', error });
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    }

    return {
      overview: { status: 'idle' },
      weekly: {},
      global: { status: 'idle' },
      hall: { status: 'idle' },
      mine: { status: 'idle' },
      loadOverview: (opts) => load('overview', () => get().overview, (overview) => set({ overview }), () => repo.overview(), opts?.force),
      loadWeekly: (competitionId = '', opts) =>
        load(
          `weekly:${competitionId}`,
          () => get().weekly[competitionId] ?? { status: 'idle' },
          (v) => set((s) => ({ weekly: { ...s.weekly, [competitionId]: v } })),
          () => repo.weekly(competitionId || undefined),
          opts?.force,
        ),
      loadGlobal: (opts) => load('global', () => get().global, (global) => set({ global }), () => repo.global(), opts?.force),
      loadHall: (opts) => load('hall', () => get().hall, (hall) => set({ hall }), () => repo.hallOfFame(), opts?.force),
      loadMine: (opts) => load('mine', () => get().mine, (mine) => set({ mine }), () => repo.myGames(), opts?.force),
      setNickname: async (name) => {
        const saved = await repo.setNickname(name);
        set((s) => ({
          overview: s.overview.status === 'ready' ? { ...s.overview, data: { ...s.overview.data, nickname: saved } } : s.overview,
          mine: s.mine.status === 'ready' ? { ...s.mine, data: { ...s.mine.data, nickname: saved } } : s.mine,
          // Boards show nicknames: refetch on next visit.
          weekly: {},
          global: { status: 'idle' },
          hall: { status: 'idle' },
        }));
        return saved;
      },
      recordPractice: async (r) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await repo.recordPractice(r);
            const mine = get().mine;
            if (mine.status === 'ready') {
              const entry = { game: r.game, bot: r.bot, difficulty: r.difficulty, playerScore: r.playerScore, botScore: r.botScore, outcome: r.outcome, playedAt: now() };
              set({ mine: { ...mine, data: { ...mine.data, practice: [entry, ...mine.data.practice].slice(0, 30) } } });
            }
            return;
          } catch (e) {
            if (!toDataError(e).transient) return;
          }
        }
      },
    };
  });
}
