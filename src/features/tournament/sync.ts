import { create } from 'zustand';

import { useAuth } from '@/src/auth/store';
import { toDataError } from '@/src/data/errors';
import { call } from '@/src/data/repositories';
import { supabaseRpc } from '@/src/data/supabase';
import { type MatchStats, mergeProgress, sanitizeProgress } from '@/src/tournament/progress';
import { snapshot, useTournament } from './store';

/**
 * Keeps a signed-in player's tournament progress on their account: fetch the server copy, merge it with this phone's
 * (mergeProgress never loses anything earned), keep the merge here and write it back. Runs when a tournament screen
 * opens and a couple of seconds after any change. Offline or failing, the phone's copy simply waits for the next
 * sync. Guests are never synced.
 */

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Set while a merged copy is being adopted, so adopting it doesn't schedule another sync. */
let adopting = false;
let lastSynced = 0;

/** On opening a tournament screen: sync unless that already happened in the last minute. */
export function syncSoon(): void {
  if (Date.now() - lastSynced < 60_000) return;
  void syncTournament();
}

export async function syncTournament(): Promise<void> {
  const user = useAuth.getState().user;
  if (!user) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    await useTournament.getState().load();
    const remote = sanitizeProgress((await call(supabaseRpc, 'get_my_tournament')) ?? {});
    // Signed out or switched account while the request was in flight: leave this phone's copy alone.
    if (useAuth.getState().user?.id !== user.id) return;
    const merged = mergeProgress(snapshot(useTournament.getState()), remote);
    adopting = true;
    useTournament.getState().adopt(merged);
    adopting = false;
    await call(supabaseRpc, 'save_my_tournament', { progress: merged });
    lastSynced = Date.now();
  } catch (e) {
    adopting = false;
    if (__DEV__) console.warn(`[tournament] sync: ${toDataError(e).detail}`);
  } finally {
    running = false;
    if (again) {
      again = false;
      void syncTournament();
    }
  }
}

function scheduleSync() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncTournament(), 2000);
}

// Any change to loaded progress (a game, a skip, a check) is synced shortly after.
useTournament.subscribe((s, prev) => {
  if (!adopting && s.loaded && prev.loaded && (s.matches !== prev.matches || s.checks !== prev.checks || s.seen !== prev.seen || s.mind !== prev.mind)) scheduleSync();
});

// ── Stats ───────────────────────────────────────────────────────────────────────────────────────────────────────

interface StatsState {
  stats: Record<string, MatchStats>;
  at: number;
}

export const useTournamentStats = create<StatsState>(() => ({ stats: {}, at: 0 }));

const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** Published per-match counts (matches with 200+ players), refreshed at most every 30 minutes. Never throws. */
export async function loadTournamentStats(): Promise<void> {
  if (Date.now() - useTournamentStats.getState().at < 30 * 60_000) return;
  try {
    const raw = await call(supabaseRpc, 'get_tournament_stats');
    const stats: Record<string, MatchStats> = {};
    for (const [id, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
      const o = (v ?? {}) as Record<string, unknown>;
      if (isCount(o.players) && isCount(o.won) && isCount(o.read) && o.players > 0) stats[id] = { players: o.players, won: o.won, read: o.read };
    }
    useTournamentStats.setState({ stats, at: Date.now() });
  } catch {
    // Offline or not deployed yet: no percentages are shown, which is the honest default.
  }
}
