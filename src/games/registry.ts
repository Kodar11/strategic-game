import type { AnyEngine, GameId } from './core.ts';
import { rps } from './rps.ts';
import { splitSteal } from './split-steal.ts';
import { stagHunt } from './stag-hunt.ts';
import { twoThirds } from './two-thirds.ts';
import { ultimatum } from './ultimatum.ts';

/** Every playable game's engine, by id. The server registers the same ids and rule versions (game_definitions). */
export const ENGINES: Record<GameId, AnyEngine> = {
  rps,
  'two-thirds': twoThirds,
  'split-steal': splitSteal,
  ultimatum,
  'stag-hunt': stagHunt,
};

export const engineFor = (id: GameId): AnyEngine => ENGINES[id];
