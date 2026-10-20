import { type MatrixGame, payoffAt, pureNashEquilibria, rowDominance, colDominance } from './payoff-matrix.ts';

/** Lesson 3. Row = learner (Aarav), column = friend (Nina). */
export type Place = 'cafe' | 'park';

export const PLACES: readonly Place[] = ['cafe', 'park'];

export const MEETUP_GAME: MatrixGame<Place, Place> = {
  rows: PLACES,
  cols: PLACES,
  payoffs: [
    [
      [8, 7],
      [0, 0],
    ],
    [
      [0, 0],
      [6, 8],
    ],
  ],
};

export type FriendInfo =
  /** No shared clue: Nina heads to the place she enjoys most. */
  | { kind: 'none' }
  /** A shared reference point both remember ("our usual spot"). */
  | { kind: 'focal'; place: Place }
  /** One message got through before the phones died. */
  | { kind: 'message'; proposed: Place };

/**
 * Nina's stated policy:
 * - With a message from you she goes where you proposed: any meeting (≥ 7) beats missing (0).
 * - With a clue you both know, she goes to that shared reference point.
 * - With nothing to go on, she goes where she would most like to meet.
 */
export function friendPolicy(info: FriendInfo, game: MatrixGame<Place, Place> = MEETUP_GAME): Place {
  if (info.kind === 'message') return info.proposed;
  if (info.kind === 'focal') return info.place;
  // Favourite meeting place = the coordinated outcome with the highest column payoff.
  let favourite = game.cols[0];
  for (const p of game.cols) {
    if (payoffAt(game, p, p)[1] > payoffAt(game, favourite, favourite)[1]) favourite = p;
  }
  return favourite;
}

export interface MeetupResult {
  you: Place;
  friend: Place;
  met: boolean;
  payoffs: readonly [number, number];
}

export function resolveMeetup(you: Place, friend: Place, game = MEETUP_GAME): MeetupResult {
  return { you, friend, met: you === friend, payoffs: payoffAt(game, you, friend) };
}

export function meetupAnalysis(game = MEETUP_GAME) {
  return {
    equilibria: pureNashEquilibria(game),
    rowDominance: rowDominance(game),
    colDominance: colDominance(game),
  };
}

/** Lesson 3 transfer: meeting points in a station, scored by how many shared cues point to each. */
export interface MeetingSpot {
  id: string;
  label: string;
  cues: string[];
}

export function focalRanking(spots: readonly MeetingSpot[]): MeetingSpot[] {
  return [...spots].sort((a, b) => b.cues.length - a.cues.length);
}
