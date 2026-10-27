import type { Difficulty, GameId, Outcome, Totals } from './core.ts';
import { RPS_ROUNDS } from './rps.ts';
import { SPLIT_PAYOFFS, SPLIT_ROUNDS } from './split-steal.ts';
import { STAG_PAYOFFS, STAG_ROUNDS } from './stag-hunt.ts';
import { TT_GROUP, TT_ROUNDS } from './two-thirds.ts';
import { ULT_MAX_OFFER, ULT_MIN_OFFER, ULT_PIE, ULT_ROUNDS } from './ultimatum.ts';

/**
 * What the player reads about each game: names, what you do, the idea it explores, the rules, and each bot
 * personality. The behaviour itself is in the engines; descriptions here must stay true to them.
 */

export interface Personality {
  id: string;
  name: string;
  /** One line the player sees when choosing. Says what the bot does, not how to beat it. */
  summary: string;
}

export interface GameInfo {
  id: GameId;
  title: string;
  /** What the player actually does. */
  action: string;
  /** The strategic idea being explored. */
  concept: string;
  rules: string[];
  /** How the score works, in one line. */
  scoring: string;
  personalities: Personality[];
  tone: 'blue' | 'orange' | 'amber' | 'cyan' | 'success';
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: 'Simple habits you can spot quickly',
  medium: 'Adapts a little to what you do',
  hard: 'Reads your history more closely',
};

export const GAMES: Record<GameId, GameInfo> = {
  rps: {
    id: 'rps',
    title: 'Rock, Paper, Scissors',
    action: `Throw rock, paper or scissors for ${RPS_ROUNDS} rounds against a bot with habits.`,
    concept: 'Patterns are exploitable. Being hard to predict is a strategy.',
    rules: [
      'Rock beats scissors, scissors beats paper, paper beats rock. The same throw is a tie.',
      `A match is exactly ${RPS_ROUNDS} rounds. A win is worth 3 points, a tie 1, a loss 0 — for you and for the bot.`,
      'More points after the last round wins the match. Equal points is a draw.',
      'The bot chooses before seeing your throw. It only knows the rounds already played.',
    ],
    scoring: 'Win 3 · tie 1 · loss 0 per round',
    personalities: [
      { id: 'repeater', name: 'The Repeater', summary: 'Sticks with what it knows — watch what it does after it wins or loses.' },
      { id: 'counter', name: 'The Counter', summary: 'Counts your favourite throw and plays what beats it.' },
      { id: 'mind-reader', name: 'The Mind Reader', summary: 'Learns what you tend to throw next after each throw.' },
      { id: 'randomizer', name: 'The Randomizer', summary: 'Plays every throw equally often. Hard is truly random.' },
    ],
    tone: 'blue',
  },
  'two-thirds': {
    id: 'two-thirds',
    title: 'Two-Thirds Guess',
    action: `Pick a whole number 0–100. Get closest to ⅔ of the group’s average, ${TT_ROUNDS} rounds.`,
    concept: 'How many steps ahead is everyone else thinking?',
    rules: [
      `You and a simulated group of ${TT_GROUP} bots each pick a whole number from 0 to 100.`,
      'The target is ⅔ of the average of all picks, yours included. Closest to the target wins the round; exact ties share it.',
      'Points per round: 10 for a sole win, 5 for a shared win, plus up to 10 for closeness (10 minus how far you were, rounded down).',
      'Everyone sees all the picks after each round, and the bots use them.',
      `This group is simulated: named reasoning strategies, not real people.`,
    ],
    scoring: 'Up to 20 points a round',
    personalities: [
      { id: 'crowd-follower', name: 'Crowd Followers', summary: 'Expect the group to land near where it was last time.' },
      { id: 'shallow', name: 'Shallow Thinkers', summary: 'Think one step ahead: ⅔ of what they expect others to pick.' },
      { id: 'deep', name: 'Deep Thinkers', summary: 'Think several steps ahead and pick low.' },
      { id: 'chaos', name: 'Chaos Agents', summary: 'Pick plausible numbers with no plan you can model.' },
    ],
    tone: 'cyan',
  },
  'split-steal': {
    id: 'split-steal',
    title: 'Split or Steal',
    action: `Choose Split or Steal in secret, ${SPLIT_ROUNDS} times, against the same opponent.`,
    concept: 'Trust, temptation and retaliation in a repeated relationship.',
    rules: [
      `Both split: ${SPLIT_PAYOFFS.bothSplit} coins each.`,
      `You steal, they split: you get ${SPLIT_PAYOFFS.temptation}, they get ${SPLIT_PAYOFFS.sucker}. (And the other way round.)`,
      `Both steal: ${SPLIT_PAYOFFS.bothSteal} coin each.`,
      'Both choices stay hidden until the reveal. The bot remembers this match only — a rematch starts fresh.',
      `The match lasts ${SPLIT_ROUNDS} rounds, and both of you know it. Most coins wins.`,
    ],
    scoring: 'Coins: 5/5 · 8/0 · 1/1',
    personalities: [
      { id: 'cooperator', name: 'The Cooperator', summary: 'Starts with trust and values the mutual reward.' },
      { id: 'opportunist', name: 'The Opportunist', summary: 'Steals when it thinks it can get away with it.' },
      { id: 'retaliator', name: 'The Retaliator', summary: 'Answers a steal with steals of its own.' },
      { id: 'strategist', name: 'The Strategist', summary: 'Watches how you play and adapts to it.' },
    ],
    tone: 'orange',
  },
  ultimatum: {
    id: 'ultimatum',
    title: 'The Ultimatum',
    action: `Split ${ULT_PIE} coins: propose a division, or accept or reject one. ${ULT_ROUNDS} rounds, roles swap.`,
    concept: 'Money versus fairness — and what a credible “no” is worth.',
    rules: [
      `Each round divides ${ULT_PIE} coins. The proposer offers the responder ${ULT_MIN_OFFER} to ${ULT_MAX_OFFER} coins and keeps the rest.`,
      'If the responder accepts, the division happens. If they reject, both get nothing that round.',
      'You propose in rounds 1, 3 and 5; the bot proposes in rounds 2, 4 and 6.',
      'Most coins after six rounds wins.',
    ],
    scoring: `Coins out of ${ULT_PIE} each round`,
    personalities: [
      { id: 'maximizer', name: 'The Maximizer', summary: 'Wants the most coins: takes any offer, offers little.' },
      { id: 'fair', name: 'The Fair Player', summary: 'Offers an even split and expects a reasonable one.' },
      { id: 'hardliner', name: 'The Hardliner', summary: 'Rejects low offers even though it costs it coins.' },
      { id: 'negotiator', name: 'The Negotiator', summary: 'Adjusts its offers and demands to how you respond.' },
    ],
    tone: 'amber',
  },
  'stag-hunt': {
    id: 'stag-hunt',
    title: 'Stag Hunt',
    action: `Hunt the stag together or take a safe hare alone. ${STAG_ROUNDS} rounds.`,
    concept: 'Coordination under risk: the best outcome needs trust.',
    rules: [
      `Both hunt stag: ${STAG_PAYOFFS.together} each — the best outcome.`,
      `Hunt hare: a sure ${STAG_PAYOFFS.hare}, whatever the other does.`,
      `Hunt stag alone: ${STAG_PAYOFFS.alone}. The stag needs two hunters.`,
      'Choices stay hidden until the reveal. Most points after the last round wins.',
    ],
    scoring: `Stag together ${STAG_PAYOFFS.together} · hare ${STAG_PAYOFFS.hare} · stag alone ${STAG_PAYOFFS.alone}`,
    personalities: [
      { id: 'cautious', name: 'The Cautious Hunter', summary: 'Prefers the safe hare until it is very sure of you.' },
      { id: 'optimist', name: 'The Optimist', summary: 'Goes for the stag often, even after a miss.' },
      { id: 'opportunistic', name: 'The Opportunist', summary: 'Hunts stag only when the odds make it pay.' },
      { id: 'conditional', name: 'The Conditional Partner', summary: 'Offers trust first, then keeps it only if you do.' },
    ],
    tone: 'success',
  },
};

export const GAME_ORDER: readonly GameId[] = ['split-steal', 'rps', 'two-thirds', 'ultimatum', 'stag-hunt'];

export const personality = (game: GameId, bot: string) => GAMES[game].personalities.find((p) => p.id === bot);

/**
 * A short, game-specific takeaway for the result screen. It reflects what happened, never claims one strategy
 * always wins, and never reveals a bot's hidden rule.
 */
export function takeaway(game: GameId, outcome: Outcome, totals: Totals, rounds: number): string {
  switch (game) {
    case 'rps':
      return outcome === 'loss'
        ? 'The bot found a pattern in your throws. Mixing evenly is unbeatable on average — but spotting its habit is how you win.'
        : 'Winning here means you read a habit before it read yours. Against a truly random opponent, no pattern beats a third each.';
    case 'two-thirds':
      return 'The winning number depends on how far ahead the group thinks — not on how far ahead you can think. Model the people, then go one step further.';
    case 'split-steal':
      return totals.player >= rounds * SPLIT_PAYOFFS.bothSplit * 0.8
        ? 'Steady cooperation added up. Repeated play gives trust a value that a single round never has.'
        : 'A steal pays once; how your opponent answers it decides the rest. Who you face and how long you play change the best choice.';
    case 'ultimatum':
      return 'A rejected offer leaves both sides with nothing. What an offer is worth depends on what the other side will accept — money alone doesn’t decide it.';
    case 'stag-hunt':
      return outcome === 'loss'
        ? 'The stag needs two. When trust is uncertain, the safe hare is a reasonable answer — not a failure.'
        : 'Coordination paid when expectations matched. The bigger reward is only worth chasing when you believe your partner will too.';
  }
}
