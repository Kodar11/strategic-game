import { createGamesStore } from '@/src/features/games/store';
import { arenaCompetitionRepository } from './arena-competition';
import { gamesRepository } from './games';
import { supabase, supabaseRpc } from './supabase';

/** The app's games store, backed by Supabase. Separate from the lesson progress store and its outbox. */
export const gamesRepo = gamesRepository(supabaseRpc);
export const useGames = createGamesStore(gamesRepo);

/**
 * Ranked Arena matches go to the arena-match Edge Function. supabase-js attaches the signed-in user's access token;
 * the function verifies it with Supabase Auth. A non-2xx answer carries the function's JSON error body.
 */
export const arenaRepo = arenaCompetitionRepository(async (body) => {
  const { data, error } = await supabase().functions.invoke('arena-match', { body: body as Record<string, unknown> });
  if (!error) return { status: 200, body: data };
  const res = (error as { context?: unknown }).context;
  if (res instanceof Response) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // Not JSON: a gateway or network-level failure.
    }
    return { status: res.status, body: parsed };
  }
  throw error;
});
