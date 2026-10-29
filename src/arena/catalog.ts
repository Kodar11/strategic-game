import { BUDGET_PER_LOT, auctionLots } from './auction.ts';
import { COOP_PAYOFFS, coopRounds } from './cooperation.ts';
import type { ArenaGameId, Level, MatchLength, Persona } from './core.ts';
import { PRICE_MAX, PRICE_MIN, marketRounds } from './market.ts';
import { FEE, GAIN, LOSS, STAKE, TEST_COST, signalRounds } from './signal.ts';
import { ultRounds } from './ultimatum-game.ts';

/**
 * What the player reads about each Strategy Arena game. Behaviour lives in the engines; every line here must stay
 * true to them (persona summaries describe tendencies, not the exact rule to beat).
 */

export interface VariantInfo {
  id: string;
  name: string;
  summary: string;
  /** Challenge variants unlock after one finished match of the game. */
  challenge: boolean;
}

export interface ArenaInfo {
  id: ArenaGameId;
  title: string;
  /** One sentence: the challenge. */
  tagline: string;
  /** The central strategic question. */
  question: string;
  /** A preview of the decisions the player makes. */
  decisions: string[];
  rules: string[];
  unit: string;
  tone: 'blue' | 'orange' | 'amber' | 'cyan' | 'success';
  personas: Record<Persona, string>;
  variants: VariantInfo[];
  rounds: (length: MatchLength) => number;
  roundWord: string;
  /** Coach tips for a first-time player, shown in the first rounds. */
  coach: string[];
}

export const LEVEL_LABEL: Record<Level, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
export const LEVEL_HINT: Record<Level, string> = {
  easy: 'Readable habits and the odd mistake',
  normal: 'Reacts to what you do and punishes obvious patterns',
  hard: 'Models you, plans ahead, exploits repetition — without seeing your move',
};
export const LENGTH_LABEL: Record<MatchLength, string> = { short: 'Quick', standard: 'Standard', long: 'Long' };

const C = COOP_PAYOFFS.classic;
const H = COOP_PAYOFFS['high-stakes'];

export const ARENA: Record<ArenaGameId, ArenaInfo> = {
  cooperation: {
    id: 'cooperation',
    title: 'The Cooperation Game',
    tagline: 'Lock in Cooperate or Defect in secret, round after round, against the same opponent.',
    question: 'Can you build trust with an opponent who might exploit it?',
    decisions: ['Cooperate or defect, every round', 'When to forgive — and when to retaliate', 'Whether to trust the last round'],
    rules: [
      'Each round you and the opponent each choose Cooperate or Defect. Both choices lock in secret and are revealed together.',
      `Classic payoffs: both cooperate ${C.R} each · you defect on a cooperator ${C.T} for you, ${C.S} for them · both defect ${C.P} each.`,
      'Defecting always pays more this round — but mutual cooperation beats mutual defection, and the opponent remembers.',
      'The number of rounds is shown from the start. To win, finish level with or ahead of the opponent and score at least 70% of what cooperating every round would pay. Out-scoring it by wrecking both scores is only a hollow win.',
    ],
    unit: 'points',
    tone: 'blue',
    personas: {
      investor: 'Values a profitable long-term relationship. Patient — but not endlessly.',
      banker: 'Runs one steady rule based on your record. Trust is earned back slowly.',
      dealmaker: 'Opens with trust, answers betrayal, and offers a way back.',
      opportunist: 'Looks for an opponent it can exploit and reacts to predictable play.',
    },
    variants: [
      { id: 'classic', name: 'Classic', summary: `${C.R}/${C.R} · ${C.T}/${C.S} · ${C.P}/${C.P}`, challenge: false },
      { id: 'high-stakes', name: 'High stakes', summary: `Bigger temptation (${H.T}) and a real loss (${H.S}) for the betrayed`, challenge: true },
      { id: 'noisy', name: 'Noisy line', summary: '10% of choices are mis-delivered. Slips are revealed after each round.', challenge: true },
    ],
    rounds: coopRounds,
    roundWord: 'rounds',
    coach: [
      'The opponent has already locked its choice for this round — it can’t see yours. Pick Cooperate or Defect.',
      'Watch the reveal: what it does next often depends on what you just did.',
    ],
  },
  'ultimatum-game': {
    id: 'ultimatum-game',
    title: 'The Ultimatum Game',
    tagline: 'Split a changing pool of tokens with one offer — take it or leave it — switching roles each round.',
    question: 'How much should you offer when the other side can reject the whole deal?',
    decisions: ['How many tokens to offer', 'Whether to accept a lowball', 'How walk-away values shift power'],
    rules: [
      'Each round has a pool of 8 to 20 tokens. The proposer offers the responder any number of them and keeps the rest.',
      'Accept: the split happens. Reject: each side gets its walk-away value instead — 0 in the Standard line.',
      'You propose in rounds 1, 3, 5…; the opponent proposes in rounds 2, 4, 6…. The pool and walk-aways are shown before anyone moves.',
      'Most tokens at the end wins.',
    ],
    unit: 'tokens',
    tone: 'amber',
    personas: {
      investor: 'Thinks about the rounds still to come; a “no” early can be an investment.',
      banker: 'Keeps a steady acceptance line and makes safe, predictable offers.',
      dealmaker: 'Wants a deal both sides take and mirrors how fair you are.',
      opportunist: 'Hunts for the least you’ll accept — and may say no to train you.',
    },
    variants: [
      { id: 'standard', name: 'Standard', summary: 'Rejection leaves both with nothing', challenge: false },
      { id: 'outside-options', name: 'Outside options', summary: 'Each side has a public walk-away value up to 35% of the pool', challenge: true },
    ],
    rounds: ultRounds,
    roundWord: 'rounds',
    coach: ['Drag the slider to set how many tokens you give. Both sides’ shares update as you move it.', 'Now the opponent proposes. Rejecting costs you the offer — but it may change what it offers next.'],
  },
  auction: {
    id: 'auction',
    title: 'The Auction House',
    tagline: 'Bid in secret against three rivals for lots whose true value nobody knows exactly.',
    question: 'Can you win the auction without paying more than the lot is worth?',
    decisions: ['How far below your estimate to bid', 'Which lots to fight for', 'How to spend a limited budget'],
    rules: [
      'Each lot shows a public value range. You also get a private estimate, within ± a stated margin of the true value. Rivals get their own estimates.',
      'Everyone bids once, in secret (0 passes). The highest bid wins and pays its own bid. Equal top bids are settled by a random draw.',
      'Profit = true value − what you paid. It can be negative. Your budget only limits what you can bid.',
      `You start with ${BUDGET_PER_LOT} per lot of budget. Most profit after the last lot wins.`,
    ],
    unit: 'profit',
    tone: 'orange',
    personas: {
      investor: 'Bids for value and wants a margin on every lot.',
      banker: 'Guards its budget and goes quiet on uncertain lots.',
      dealmaker: 'Reads the room and bids what lots have been fetching.',
      opportunist: 'Strikes hard on lots it likes and when the room bids low.',
    },
    variants: [
      { id: 'standard', name: 'Standard', summary: 'Estimates within ±8 to ±16', challenge: false },
      { id: 'fog', name: 'Fog', summary: 'Estimates within ±20 to ±30 — the winner’s curse bites harder', challenge: true },
    ],
    rounds: auctionLots,
    roundWord: 'lots',
    coach: ['Your estimate is private: the true value is somewhere within the ± margin of it. Rivals have their own estimates.', 'You pay what you bid if you win. Bid below your estimate to leave room for profit.'],
  },
  market: {
    id: 'market',
    title: 'The Market Rivals',
    tagline: 'Set your price each round against two rival firms competing for the same customers.',
    question: 'Can you outprice your rivals without destroying your profits?',
    decisions: ['Your price every round', 'When to undercut and when to hold', 'Share versus margin'],
    rules: [
      `Each round you set a price from ${PRICE_MIN} to ${PRICE_MAX}; rivals set theirs at the same time. Customers and unit cost are shown first.`,
      'Lower prices win more customers — smoothly, not all-or-nothing — and very high prices send some customers away entirely. Equal prices split sales equally.',
      'Profit = units sold × (price − unit cost).',
      'The projection shows what you would earn if rivals repeated last round’s prices. To win, earn the most profit and at least the price-war-free benchmark shown on the board.',
    ],
    unit: 'profit',
    tone: 'cyan',
    personas: {
      investor: 'Prices for sustainable profit and avoids starting price wars.',
      banker: 'Protects its margin, whatever the market does.',
      dealmaker: 'Mirrors the market: holds prices when rivals do, answers cuts.',
      opportunist: 'Undercuts whenever it sees a gap worth taking.',
    },
    variants: [
      { id: 'standard', name: 'Standard', summary: 'Moderate price sensitivity, cost 6', challenge: false },
      { id: 'price-war', name: 'Price war', summary: 'Customers are far more price-sensitive', challenge: true },
      { id: 'volatile', name: 'Volatile costs', summary: 'Unit cost changes each round (4–9)', challenge: true },
    ],
    rounds: marketRounds,
    roundWord: 'rounds',
    coach: ['Move your price and watch the projection: it assumes rivals repeat their last prices.', 'Rivals react to what you charged. A cut that wins share now may start a price war.'],
  },
  signal: {
    id: 'signal',
    title: 'The Hidden Signal',
    tagline: 'Ventures are secretly Strong or Weak. Read the sender’s signal — then send your own.',
    question: 'When you can’t see the whole truth, can you make the right decision?',
    decisions: ['Invest, pass or investigate', 'How much a signal is worth', 'Whether to bluff as the sender'],
    rules: [
      'The prior shows how likely the venture is to be Strong. The sender knows the truth; the investor doesn’t.',
      `The sender warns, pitches (free to send) or stakes — a stake pays the investor ${STAKE} if it invests and the venture is Weak.`,
      `The investor may pay ${TEST_COST} to investigate (a test that is right 80% of the time — 70% in the Murky line), then invests or passes. Invest: +${GAIN} if Strong, −${LOSS} if Weak. The sender earns ${FEE} whenever the investor invests.`,
      'You invest in odd rounds and send in even rounds. The truth is revealed after every round. Most tokens wins.',
    ],
    unit: 'tokens',
    tone: 'success',
    personas: {
      investor: 'Weighs expected value and protects its reputation as a sender.',
      banker: 'Plays safe with big losses and never bluffs.',
      dealmaker: 'Judges signals by your record — and repays honesty in kind.',
      opportunist: 'Bluffs when you believe it, and adapts when you stop.',
    },
    variants: [
      { id: 'standard', name: 'Standard', summary: 'Tests are 80% accurate', challenge: false },
      { id: 'murky', name: 'Murky', summary: 'Tests are only 70% accurate', challenge: true },
    ],
    rounds: signalRounds,
    roundWord: 'rounds',
    coach: [
      'You’re the investor. Ask: what does this signal cost the sender if it’s false?',
      'Now you’re the sender: you can see the truth. The opponent sees only your signal and your record.',
    ],
  },
};

export const ARENA_ORDER: readonly ArenaGameId[] = ['cooperation', 'ultimatum-game', 'auction', 'market', 'signal'];
