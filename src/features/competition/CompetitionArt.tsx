import { isArenaId } from '@/src/arena/core';
import type { CompetitionGameId } from '@/src/competition/catalog';
import { ArenaArt } from '@/src/features/arena/ui/parts';
import { GameArt } from '@/src/features/games/ui/GameArt';

/** The game's own artwork, for any of the 23 Game of the Week games. */
export function CompetitionArt({ game, size }: { game: CompetitionGameId; size: number }) {
  return isArenaId(game) ? <ArenaArt game={game} size={size} /> : <GameArt game={game} size={size} />;
}
