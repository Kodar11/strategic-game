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
  { id: 'bargain', title: 'Bargaining and alliances', blurb: 'Who gets what, and who has the power to say no.', games: [arena('ultimatum-game'), classic('ultimatum'), arena('coalition')] },
  { id: 'market', title: 'Markets and crowds', blurb: 'Your best move depends on everyone else’s.', games: [classic('two-thirds'), arena('auction'), arena('market')] },
  { id: 'deduce', title: 'Deduction and teamwork', blurb: 'Hidden facts, shared problems and weak clues.', games: [arena('mole'), arena('saboteur'), arena('defusal'), arena('codebreaker')] },
  { id: 'risk', title: 'Risk under pressure', blurb: 'Decide with the odds in front of you.', games: [arena('gambit'), arena('last-stand')] },
];

/**
 * Games that are versions of one another. The classic Ultimatum stays its own game — it is in the Game of the Week
 * rotation with rules ported to the server, and match records name it — but it is presented as the quick version of
 * The Ultimatum Game, and each setup screen points to the other.
 */
export interface RelatedGame {
  entry: LibraryEntry;
  /** One line for the link on the other game's setup screen. */
  pitch: string;
  label: string;
}
export const RELATED: Partial<Record<string, RelatedGame>> = {
  'classic:ultimatum': { entry: arena('ultimatum-game'), label: 'Play The Ultimatum Game', pitch: 'Want more depth? The full game adds a changing pool and walk-away values that shift who holds the power.' },
  'arena:ultimatum-game': { entry: classic('ultimatum'), label: 'Play the Quick Ultimatum', pitch: 'Short on time? The quick version: six rounds over 10 coins, nothing to lose by saying no but the deal. It’s also a Game of the Week.' },
};
export const relatedTo = (e: LibraryEntry) => RELATED[`${e.kind}:${e.id}`] ?? null;
export const entryHref = (e: LibraryEntry) => (e.kind === 'classic' ? (`/games/${e.id}` as const) : (`/arena/${e.id}` as const));

export const LIBRARY_COUNT = LIBRARY_GROUPS.reduce((t, g) => t + g.games.length, 0);
