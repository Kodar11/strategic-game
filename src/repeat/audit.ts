import type { ArenaGameId } from '../arena/core.ts';
import type { GameId } from '../games/core.ts';

/**
 * The repeat-play audit of every game in the library, kept next to the strategies so a test can hold them together:
 * a game classified A–C must offer strategies of that kind, and a manual (D) or not-applicable (E) game must offer none.
 * The reasoning is written out in docs/REPEAT_PLAY.md.
 *
 * A fixed decision · B pattern · C conditional · D manual only · E not applicable.
 */
export type RepeatCategory = 'A' | 'B' | 'C' | 'D' | 'E';

export interface AuditEntry {
  title: string;
  /** Every category the game supports (A–C), or the single reason it has none (D or E). */
  categories: readonly RepeatCategory[];
  why: string;
}

export const REPEAT_AUDIT: Record<GameId | ArenaGameId, AuditEntry> = {
  'split-steal': { title: 'Split or Steal', categories: ['A', 'C'], why: 'One simultaneous Split/Steal choice every round; the bot reads only revealed rounds, so a fixed choice or tit for tat is a clean experiment.' },
  rps: { title: 'Rock, Paper, Scissors', categories: ['A', 'B', 'C'], why: 'Twelve identical throws; the bots exploit habits, so fixed throws, a cycle and “beat its last” are exactly the patterns worth testing.' },
  'two-thirds': { title: 'Two-Thirds Guess', categories: ['A'], why: 'One number per round from 0–100; repeating a pick (say 0, the equilibrium) shows how the crowd moves. Adjusting to the target stays manual.' },
  ultimatum: { title: 'The Ultimatum', categories: ['D'], why: 'Roles alternate every round and each response reacts to an offer revealed only in that round; only three decisions of each kind.' },
  'stag-hunt': { title: 'Stag Hunt', categories: ['A', 'C'], why: 'One simultaneous Stag/Hare choice every round; committing to stag (or hare) for a stretch is the trust experiment the game is about.' },
  cooperation: { title: 'The Cooperation Game', categories: ['A', 'C'], why: 'A repeated prisoner’s dilemma with one secret choice per round; Always C/D and tit for tat are the textbook strategies.' },
  'ultimatum-game': { title: 'The Ultimatum Game', categories: ['D'], why: 'Pools and walk-away values change every round, roles alternate, and responses depend on an offer revealed only that round.' },
  auction: { title: 'The Auction House', categories: ['D'], why: 'Every lot brings a fresh private estimate and value range; a repeated bid would ignore the information each lot is about.' },
  market: { title: 'Market Rivals', categories: ['D'], why: 'Customers, cost and sensitivity are announced fresh each round; pricing is meant to respond to them (and the Volatile line can put a fixed price below cost).' },
  signal: { title: 'The Hidden Signal', categories: ['D'], why: 'Roles alternate; as investor you react to the signal and the prior shown that round, as sender to the hidden state only you see.' },
  mole: { title: 'The Mole', categories: ['D'], why: 'Interrogations and the final accusation depend on each round’s new clue and accusations — a deduction game.' },
  commons: { title: 'The Commons', categories: ['A', 'C'], why: 'One simultaneous catch request (0–10) every round; a steady request or matching Ash is the sustainability experiment. Collapse still ends it early.' },
  coalition: { title: 'The Coalition', categories: ['D'], why: 'Proposals rotate; you build coalitions and answer specific bills as they are tabled — negotiation, not a repeated choice.' },
  inspector: { title: 'The Inspector', categories: ['A'], why: 'Roles alternate, but each role is a simultaneous two-way choice from history only; a plan names one choice per role.' },
  travelers: { title: 'The Traveler’s Dilemma', categories: ['A', 'C'], why: 'One simultaneous claim (2–20) every round; a fixed claim, matching or undercutting its last claim are the strategies the dilemma is about.' },
  saboteur: { title: 'The Saboteur', categories: ['D'], why: 'Hidden roles: benching, energy budgeting across missions and the final accusation all depend on each mission’s revealed total.' },
  bluff: { title: 'Bluff', categories: ['D'], why: 'Several steps per round (press, claim, believe or call) on privately drawn tokens; repeating would bypass the bluffing itself.' },
  defusal: { title: 'The Defusal', categories: ['D'], why: 'A cooperative deduction puzzle: every cut depends on the clues shared so far, and a wrong cut ends the match.' },
  'power-play': { title: 'The Power Play', categories: ['D'], why: 'Turn phases (act, challenge, block) react to the opponent’s claims and to hidden cards.' },
  'last-stand': { title: 'The Last Stand', categories: ['D'], why: 'Each round reacts to the fire map and the teammate’s announced plan; a fixed action would ignore the spread.' },
  'liars-dice': { title: 'Liar’s Dice', categories: ['D'], why: 'Bids depend on a fresh private roll and the bids already made; rounds have a variable number of turns.' },
  codebreaker: { title: 'The Codebreaker', categories: ['D'], why: 'A fresh word board every round; clues and guesses are about that board.' },
  gambit: { title: 'The Gambit', categories: ['D'], why: 'Board positions change every turn; moves are about pieces and squares, not a repeated choice.' },
};
