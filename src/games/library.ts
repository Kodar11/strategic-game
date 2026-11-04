import type { ArenaGameId } from '../arena/core.ts';
import type { GameId } from './core.ts';

/**
 * How the Games tab groups the library, by the strategic idea each game is about. Every game sits in exactly one group
 * (a test checks it), so nothing can be lost by filtering.
 */
export type LibraryEntry = { kind: 'classic'; id: GameId } | { kind: 'arena'; id: ArenaGameId };

const classic = (id: GameId): LibraryEntry => ({ kind: 'classic', id });
const arena = (id: ArenaGameId): LibraryEntry => ({ kind: 'arena', id });

export interface LibraryGroup {
  id: string;
  title: string;
  blurb: string;
  games: LibraryEntry[];
}

export const LIBRARY_GROUPS: LibraryGroup[] = [
  { id: 'trust', title: 'Cooperation and trust', blurb: 'What you can build together, and what tempts you not to.', games: [classic('split-steal'), classic('stag-hunt'), arena('cooperation'), arena('travelers'), arena('commons')] },
  { id: 'bluff', title: 'Bluffing and reading', blurb: 'Claims, habits and who to believe.', games: [classic('rps'), arena('bluff'), arena('liars-dice'), arena('power-play'), arena('signal'), arena('inspector')] },
  { id: 'bargain', title: 'Bargaining and alliances', blurb: 'Who gets what, and who has the power to say no.', games: [classic('ultimatum'), arena('ultimatum-game'), arena('coalition')] },
  { id: 'market', title: 'Markets and crowds', blurb: 'Your best move depends on everyone else’s.', games: [classic('two-thirds'), arena('auction'), arena('market')] },
  { id: 'deduce', title: 'Deduction and teamwork', blurb: 'Hidden facts, shared problems and weak clues.', games: [arena('mole'), arena('saboteur'), arena('defusal'), arena('codebreaker')] },
  { id: 'risk', title: 'Risk under pressure', blurb: 'Decide with the odds in front of you.', games: [arena('gambit'), arena('last-stand')] },
];

export const LIBRARY_COUNT = LIBRARY_GROUPS.reduce((t, g) => t + g.games.length, 0);
