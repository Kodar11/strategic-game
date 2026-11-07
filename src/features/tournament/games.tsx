import { router } from 'expo-router';

import { ARENA } from '@/src/arena/catalog';
import type { ArenaGameId } from '@/src/arena/core';
import { ArenaArt } from '@/src/features/arena/ui/parts';
import { GameArt } from '@/src/features/games/ui/GameArt';
import { GAMES } from '@/src/games/catalog';
import type { GameId } from '@/src/games/core';
import type { Level } from '@/src/tournament/progress';
import { type Stage, type TournamentMatch, resolveMatch } from '@/src/tournament/schema';

/** The game a tournament match plays, as the existing catalogs name it. */
export function gameTitle(m: TournamentMatch): string {
  return m.game.system === 'arena' ? (ARENA[m.game.id as ArenaGameId]?.title ?? m.game.id) : (GAMES[m.game.id as GameId]?.title ?? m.game.id);
}

export function GameIcon({ match, size = 44 }: { match: TournamentMatch; size?: number }) {
  return match.game.system === 'arena' ? <ArenaArt game={match.game.id as ArenaGameId} size={size} /> : <GameArt game={match.game.id as GameId} size={size} />;
}

export const LEVEL_NAME: Record<Level, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

/**
 * Opens the match on the existing play screens, always against a hidden opponent (reading it is a star), with the
 * tournament match id so the result is recorded and the screen shows the reveal or the debrief.
 */
export function playMatch(stage: Stage, m: TournamentMatch, level: Level = m.level) {
  const r = resolveMatch(stage, m);
  if (m.game.system === 'arena') {
    router.push({ pathname: '/arena/play', params: { game: m.game.id, persona: 'mystery', level, length: r.length, variant: r.variant, t: m.id } });
  } else {
    router.push({ pathname: '/games/play', params: { game: m.game.id, opponent: 'mystery', difficulty: level === 'normal' ? 'medium' : level, t: m.id } });
  }
}
