import { ARENA, opponentName } from '@/src/arena/catalog';
import { type ArenaGameId, isArenaId } from '@/src/arena/core';
import { GAMES, personality } from '@/src/games/catalog';
import { type GameId, isGameId } from '@/src/games/core';
import { CLASSIC_READ, classicTakeaway } from '@/src/games/reads';
import { RPS_READS, rpsTakeaway } from '@/src/games/rps-insight';
import { ARENA_DOSSIERS, type Dossier } from '@/src/mastery/dossiers';
import type { MasterySystem } from '@/src/mastery/rules';

/** A rival's dossier in either system: Arena from its own pages, classic games from their read descriptions. */
export function dossierFor(system: MasterySystem, game: string, opponent: string): Dossier | null {
  if (system === 'arena') return isArenaId(game) ? (ARENA_DOSSIERS[game][opponent] ?? null) : null;
  if (!isGameId(game)) return null;
  if (game === 'rps') {
    const r = RPS_READS[opponent as keyof typeof RPS_READS];
    return r ? { thinks: r.medium, hard: r.hard, beat: rpsTakeaway(opponent as keyof typeof RPS_READS, 'hard') } : null;
  }
  const d = CLASSIC_READ[game].describe[opponent];
  return d ? { thinks: d.medium, hard: d.hard, beat: classicTakeaway(game, opponent) } : null;
}

/** The opponents a game offers, with display names, in the catalog's order. */
export function rivalsOf(system: MasterySystem, game: string): { id: string; name: string }[] {
  if (system === 'arena') return isArenaId(game) ? ARENA[game as ArenaGameId].opponents.map((o) => ({ id: o.id, name: opponentName(game, o.id) })) : [];
  if (!isGameId(game)) return [];
  return GAMES[game as GameId].personalities.map((p) => ({ id: p.id, name: personality(game, p.id)?.name ?? p.id }));
}
