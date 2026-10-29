import { type ArenaGameId, draw } from './core.ts';

/**
 * "Think you've figured them out?" — the hidden-personality layer shared by every Strategy Arena game.
 *
 * - **Mystery opponent.** With `persona=mystery` the play screen picks one of the game's opponents from the match seed
 *   (`hiddenOpponent`), so a rematch (a new seed) draws again and nothing in the URL, name, icon or colour gives the
 *   personality away. Bots get the same policy either way; the pick only decides which policy.
 * - **Prediction.** Optional. It opens once `READ_RULES[game].after(total)` rounds are complete — enough decisions to
 *   tell the personalities apart — and may be changed until the match ends; the last guess before the end is the one
 *   scored. If the match ends without a guess the player is offered one, once, before the reveal (skippable).
 * - **Scoring.** Right, wrong or unscored (`scoreRead`). Nothing else: no points, no effect on the bot, the match score
 *   or the outcome. Changing a guess is free, and only the final one counts, so guessing repeatedly earns nothing.
 * - **Reveal.** The result screen names the real personality, the guess and the verdict, then the evidence the engine's
 *   debrief (`opponentRead`) cites from this match's recorded decisions.
 */

export const MYSTERY = 'mystery';

export interface ReadRule {
  /** Completed rounds before a prediction can be made (capped at the match length: a short match predicts at the end). */
  after: (total: number) => number;
  /** Who the prediction is about, as the panel says it. */
  target: string;
  /** Why the threshold is where it is: what the player needs to have seen. */
  evidence: string;
}

const atLeast = (n: number, share: number) => (total: number) => Math.min(total, Math.max(n, Math.ceil(total * share)));

export const READ_RULES: Record<ArenaGameId, ReadRule> = {
  cooperation: { after: atLeast(3, 0.4), target: 'your opponent', evidence: 'how it answers your cooperation and your defections' },
  'ultimatum-game': { after: atLeast(4, 0), target: 'your opponent', evidence: 'two offers it made and two of yours it answered' },
  auction: { after: atLeast(2, 0.4), target: 'your main rival', evidence: 'how far below its estimate it bids' },
  market: { after: atLeast(3, 0.35), target: 'your main rival', evidence: 'how its price moves after yours' },
  signal: { after: atLeast(4, 0), target: 'your opponent', evidence: 'two signals it sent and two of yours it judged' },
  mole: { after: atLeast(2, 0.4), target: 'the Mole', evidence: 'who each suspect accused, round after round' },
  commons: { after: atLeast(3, 0.3), target: 'Ash', evidence: 'how much it takes as the lake changes' },
  coalition: { after: atLeast(4, 0), target: 'your main rival', evidence: 'its offers and what it accepted, over a full rotation' },
  inspector: { after: atLeast(4, 0), target: 'your opponent', evidence: 'its choices in both roles' },
  travelers: { after: atLeast(3, 0.3), target: 'your opponent', evidence: 'how its claim moves after yours' },
  saboteur: { after: atLeast(3, 0.5), target: 'the saboteur', evidence: 'which missions failed, and who was on them' },
  bluff: { after: atLeast(4, 0), target: 'your opponent', evidence: 'two of its claims and how it answered two of yours' },
  defusal: { after: atLeast(3, 0), target: 'your teammate', evidence: 'the clues it shared and the wires it cut' },
  'power-play': { after: atLeast(4, 0), target: 'your opponent', evidence: 'the roles it claimed and the claims it challenged' },
  'last-stand': { after: atLeast(3, 0.3), target: 'your teammate', evidence: 'where it chose to spend its actions' },
  'liars-dice': { after: atLeast(2, 0.3), target: 'your opponent', evidence: 'its bids and when it called' },
  codebreaker: { after: atLeast(2, 0.3), target: 'your teammate', evidence: 'one clue it gave and one of yours it read' },
  gambit: { after: atLeast(4, 0.3), target: 'your opponent', evidence: 'how often it chose the risky move' },
};

/** The hidden opponent for a mystery match: one of the game's opponents, fixed by the seed. */
export function hiddenOpponent(opponents: readonly string[], seed: number): string {
  return opponents[Math.min(opponents.length - 1, Math.floor(draw(seed, 7777, 0) * opponents.length))];
}

/** Rounds needed before predicting, for a match of `total` rounds. */
export const readAfter = (game: ArenaGameId, total: number) => READ_RULES[game].after(total);

/** Whether a prediction can be made or changed now (mid-match). After the end, see `awaitingRead`. */
export const readOpen = (game: ArenaGameId, played: number, total: number, over: boolean) => !over && played >= readAfter(game, total);

/** The match is over, nothing was guessed and the player hasn't skipped: offer one guess before the reveal. */
export const awaitingRead = (mystery: boolean, over: boolean, guess: string | null, skipped: boolean) => mystery && over && guess === null && !skipped;

export type ReadVerdict = 'correct' | 'incorrect' | 'unscored';

export function scoreRead(guess: string | null, actual: string): ReadVerdict {
  return guess === null ? 'unscored' : guess === actual ? 'correct' : 'incorrect';
}
