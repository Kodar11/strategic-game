import type { ArenaGameId } from '../arena/core.ts';
import type { GameId } from '../games/core.ts';
import { AUCTION, COOPERATION, MARKET, SIGNAL, ULTIMATUM_GAME } from './arena.ts';
import { RPS, SPLIT_STEAL, STAG_HUNT, TWO_THIRDS, ULTIMATUM } from './classic.ts';
import { BLUFF, COALITION, CODEBREAKER, COMMONS, DEFUSAL, GAMBIT, INSPECTOR, LAST_STAND, LIARS_DICE, MOLE, POWER_PLAY, SABOTEUR, TRAVELERS } from './library.ts';
import { selectReflection } from './select.ts';
import type { GameReflections, Reflection } from './types.ts';

export type ReflectionGame = GameId | ArenaGameId;

/**
 * Every game's reflections. Classic games (src/games/) read the match's rounds; arena games read the engine's final
 * state. The two id sets don't overlap ('ultimatum' is the classic game, 'ultimatum-game' the arena one).
 */
export const REFLECTIONS: Record<ReflectionGame, GameReflections<any>> = {
  'split-steal': SPLIT_STEAL,
  rps: RPS,
  'two-thirds': TWO_THIRDS,
  ultimatum: ULTIMATUM,
  'stag-hunt': STAG_HUNT,
  cooperation: COOPERATION,
  'ultimatum-game': ULTIMATUM_GAME,
  auction: AUCTION,
  market: MARKET,
  signal: SIGNAL,
  mole: MOLE,
  commons: COMMONS,
  coalition: COALITION,
  inspector: INSPECTOR,
  travelers: TRAVELERS,
  saboteur: SABOTEUR,
  bluff: BLUFF,
  defusal: DEFUSAL,
  'power-play': POWER_PLAY,
  'last-stand': LAST_STAND,
  'liars-dice': LIARS_DICE,
  codebreaker: CODEBREAKER,
  gambit: GAMBIT,
};

/**
 * The reflection for a finished match. `record`: the rounds (classic games) or the final engine state (arena games).
 * Only call it once the match is over and its result is on screen.
 */
export function reflect(game: ReflectionGame, record: unknown, recent: readonly string[] = []): Reflection {
  return selectReflection(REFLECTIONS[game], record, recent);
}
