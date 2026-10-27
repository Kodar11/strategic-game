import { createGamesStore } from '@/src/features/games/store';
import { gamesRepository } from './games';
import { supabaseRpc } from './supabase';

/** The app's games store, backed by Supabase. Separate from the lesson progress store and its outbox. */
export const gamesRepo = gamesRepository(supabaseRpc);
export const useGames = createGamesStore(gamesRepo);
