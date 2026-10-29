import type { ComponentType } from 'react';

import type { ArenaGameId } from '@/src/arena/core';
import type { LibraryId } from '@/src/arena/catalog-library';
import type { BoardProps } from '../parts';
import { BluffBoard } from './BluffBoard';
import { CoalitionBoard } from './CoalitionBoard';
import { CodebreakerBoard } from './CodebreakerBoard';
import { CommonsBoard } from './CommonsBoard';
import { DefusalBoard } from './DefusalBoard';
import { GambitBoard } from './GambitBoard';
import { InspectorBoard } from './InspectorBoard';
import { LastStandBoard } from './LastStandBoard';
import { LiarsDiceBoard } from './LiarsDiceBoard';
import { MoleBoard } from './MoleBoard';
import { PowerPlayBoard } from './PowerPlayBoard';
import { SaboteurBoard } from './SaboteurBoard';
import { TravelersBoard } from './TravelersBoard';

/** The play area for each library game. Each board renders only what its engine's state says. */
export const LIBRARY_BOARDS: Record<LibraryId, ComponentType<BoardProps<any, any>>> = {
  mole: MoleBoard,
  commons: CommonsBoard,
  coalition: CoalitionBoard,
  inspector: InspectorBoard,
  travelers: TravelersBoard,
  saboteur: SaboteurBoard,
  bluff: BluffBoard,
  defusal: DefusalBoard,
  'power-play': PowerPlayBoard,
  'last-stand': LastStandBoard,
  'liars-dice': LiarsDiceBoard,
  codebreaker: CodebreakerBoard,
  gambit: GambitBoard,
};

/** Cooperative games: the bot is a teammate and the result is shared. */
export const TEAM_GAMES: ReadonlySet<ArenaGameId> = new Set(['defusal', 'last-stand', 'codebreaker']);
