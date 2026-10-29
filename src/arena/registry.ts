import { auction } from './auction.ts';
import { bluff } from './bluff.ts';
import { coalition } from './coalition.ts';
import { codebreaker } from './codebreaker.ts';
import { commons } from './commons.ts';
import { cooperation } from './cooperation.ts';
import type { AnyArenaEngine, ArenaGameId } from './core.ts';
import { defusal } from './defusal.ts';
import { gambit } from './gambit.ts';
import { inspector } from './inspector.ts';
import { lastStand } from './last-stand.ts';
import { liarsDice } from './liars-dice.ts';
import { market } from './market.ts';
import { mole } from './mole.ts';
import { powerPlay } from './power-play.ts';
import { saboteur } from './saboteur.ts';
import { hiddenSignal } from './signal.ts';
import { travelers } from './travelers.ts';
import { ultimatumGame } from './ultimatum-game.ts';

export const ARENA_ENGINES: Record<ArenaGameId, AnyArenaEngine> = {
  cooperation,
  'ultimatum-game': ultimatumGame,
  auction,
  market,
  signal: hiddenSignal,
  mole,
  commons,
  coalition,
  inspector,
  travelers,
  saboteur,
  bluff,
  defusal,
  'power-play': powerPlay,
  'last-stand': lastStand,
  'liars-dice': liarsDice,
  codebreaker,
  gambit,
};

export const arenaEngine = (id: ArenaGameId): AnyArenaEngine => ARENA_ENGINES[id];
