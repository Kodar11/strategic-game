import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { track } from '@/src/observability/api';
import {
  EMPTY_PROGRESS,
  type MindForm,
  type Played,
  type Recorded,
  type TournamentProgress,
  findMatch,
  recordGame,
  recordOf,
  sanitizeProgress,
  skipMatch,
  stars,
} from '@/src/tournament/progress';
import { useTournamentContent } from './content';

/**
 * Tournament progress on this device: match records, the game history behind the rating, key-card checks, seen
 * intro scenes and Mind Check scores. Everything shown (stars, unlocks, rating, cards) is derived from it
 * (src/tournament/progress.ts). Saved locally like the Arena records and cleared with the account's other device data.
 */
export const TOURNAMENT_KEY = 'tactiqo/tournament/v1';

interface TournamentState extends TournamentProgress {
  loaded: boolean;
  load: () => Promise<void>;
  /** Records one finished tournament game. Null when the match id isn't in the installed season. */
  record: (matchId: string, game: Played) => Recorded | null;
  skip: (matchId: string) => void;
  markSeen: (stageId: string) => void;
  saveCheck: (stageId: string, correct: number, total: number, passed: boolean) => void;
  saveMindCheck: (form: MindForm, correct: number, total: number) => void;
  reset: () => Promise<void>;
}

const snapshot = (s: TournamentProgress): TournamentProgress => ({ matches: s.matches, history: s.history, checks: s.checks, seen: s.seen, mind: s.mind });
const persist = (s: TournamentProgress) => AsyncStorage.setItem(TOURNAMENT_KEY, JSON.stringify(snapshot(s))).catch(() => undefined);

export const useTournament = create<TournamentState>()((set, get) => ({
  ...EMPTY_PROGRESS,
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(TOURNAMENT_KEY);
      set({ ...sanitizeProgress(raw ? JSON.parse(raw) : {}), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  record: (matchId, game) => {
    const season = useTournamentContent.getState().season;
    const found = findMatch(season, matchId);
    if (!found) return null;
    const attempt = (() => {
      const r = recordOf(get(), matchId);
      return r.wins + r.losses + r.draws + 1;
    })();
    const out = recordGame(snapshot(get()), found.stage, found.match, game, Date.now());
    set(out.progress);
    persist(out.progress);
    const base = { season_id: season.id, stage_id: found.stage.id };
    track('tournament_match_finished', {
      ...base,
      match_id: matchId,
      game_id: found.match.game.id,
      level: game.level,
      outcome: game.outcome,
      stars: stars(recordOf(out.progress, matchId)),
      first_clear: out.firstClear,
      read_correct: game.read,
      attempt_number: attempt,
    });
    if (out.rivalDefeated) track('tournament_rival_defeated', { ...base, rival_id: found.stage.rival, attempts: attempt });
    return out;
  },
  skip: (matchId) => {
    const season = useTournamentContent.getState().season;
    const found = findMatch(season, matchId);
    if (!found) return;
    const now = snapshot(get());
    const next = skipMatch(now, found.match);
    if (next === now) return;
    set(next);
    persist(next);
    track('tournament_match_skipped', { season_id: season.id, stage_id: found.stage.id, match_id: matchId });
  },
  markSeen: (stageId) => {
    if (get().seen.includes(stageId)) return;
    const next = { ...snapshot(get()), seen: [...get().seen, stageId] };
    set(next);
    persist(next);
  },
  saveCheck: (stageId, correct, total, passed) => {
    const prev = get().checks[stageId];
    // A pass is kept: a later, worse attempt never takes the key card away.
    const next = { ...snapshot(get()), checks: { ...get().checks, [stageId]: { passed: passed || prev?.passed === true, correct: Math.max(correct, prev?.correct ?? 0), total, at: Date.now() } } };
    set(next);
    persist(next);
    track('tournament_check_submitted', { season_id: useTournamentContent.getState().season.id, stage_id: stageId, correct, total, passed });
  },
  saveMindCheck: (form, correct, total) => {
    if (get().mind.some((m) => m.form === form)) return;
    const next = { ...snapshot(get()), mind: [...get().mind, { form, correct, total, at: Date.now() }] };
    set(next);
    persist(next);
    track('mind_check_completed', { form, correct, total });
  },
  reset: async () => {
    set({ ...EMPTY_PROGRESS, loaded: true });
    await AsyncStorage.removeItem(TOURNAMENT_KEY).catch(() => undefined);
  },
}));
