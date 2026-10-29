import { auction } from './auction.ts';
import { cooperation } from './cooperation.ts';
import type { AnyArenaEngine, ArenaGameId } from './core.ts';
import { market } from './market.ts';
import { hiddenSignal } from './signal.ts';
import { ultimatumGame } from './ultimatum-game.ts';

export const ARENA_ENGINES: Record<ArenaGameId, AnyArenaEngine> = {
  cooperation,
  'ultimatum-game': ultimatumGame,
  auction,
  market,
  signal: hiddenSignal,
};

export const arenaEngine = (id: ArenaGameId): AnyArenaEngine => ARENA_ENGINES[id];
