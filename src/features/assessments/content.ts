import type { Verdict } from '../../components/lesson/verdict.ts';
import type { LessonId, ModuleId } from '../../content/lessons.ts';
import { posterior } from '../../game/information.ts';
import { type MatrixGame, pureNashEquilibria, strictlyDominatedRows } from '../../game/payoff-matrix.ts';
import { alternatingOffers } from '../../game/bargaining.ts';
import { cournotBestResponse } from '../../game/markets.ts';
import { type PopulationGame, interiorRestPoint, longRunShare } from '../../game/evolution.ts';
import { AXELROD, grimThreshold } from '../../game/repeated.ts';
import { coreIsEmpty } from '../../game/collective.ts';

/**
 * Module checkpoints and the final cumulative assessment. Pure data: the assessment screen renders it and
 * `scoring.ts` grades it. Every graded claim is either solved by the engine (`solve`) or follows directly from the
 * situation text; tests check `solve` against the options marked `match`.
 *
 * Several options may be `match` on a multi-select item: plausible alternatives are not graded as wrong.
 */

export type AssessmentId = ModuleId | 'final';

export interface AssessmentOption {
  id: string;
  label: string;
  verdict: Verdict;
  feedback: string;
}

export interface AssessmentItem {
  id: string;
  /** The lesson whose idea this mainly tests (for “review this lesson” links). */
  lesson: LessonId;
  situation?: string;
  table?: { head: string[]; rows: string[][] };
  question: string;
  /** Multi-select: the learner may choose several; scoring rewards matches and penalises misconceptions. */
  multi?: boolean;
  options: AssessmentOption[];
  /** The reasoning, shown after submission. */
  explanation: string;
  /** For single-answer calculable items: the matching option id, from the engine. */
  solve?: () => string;
}

export interface Assessment {
  id: AssessmentId;
  version: number;
  title: string;
  intro: string;
  /** Shown above every item (the final assessment's shared case). */
  case?: string;
  items: AssessmentItem[];
  /** Share of the maximum score needed to pass. */
  passMark: number;
  /** An ungraded written explanation with a self-check list (final assessment only). */
  reflection?: { prompt: string; rubric: string[] };
}

const AIRLINES: MatrixGame = { rows: ['high', 'low'], cols: ['high', 'low'], payoffs: [[[6, 6], [1, 8]], [[8, 1], [3, 3]]] };
const THREE_ROWS: MatrixGame = { rows: ['up', 'middle', 'down'], cols: ['left', 'right'], payoffs: [[[2, 1], [4, 0]], [[1, 2], [3, 3]], [[0, 1], [5, 2]]] };
const TWO_EQ: MatrixGame = { rows: ['T', 'B'], cols: ['L', 'R'], payoffs: [[[2, 1], [0, 0]], [[0, 0], [1, 2]]] };

const m1: Assessment = {
  id: 'm1',
  version: 1,
  title: 'Checkpoint 1 · Foundations',
  intro: 'Four short situations on incentives, dominance and equilibrium. Choose the strongest reasoning; you’ll see why after you submit.',
  passMark: 0.6,
  items: [
    {
      id: 'm1.q1',
      lesson: 'cooperation-trap',
      situation: 'Two airlines set fares on one route at the same time. Profits (A, B): both high 6, 6; A high, B low 1, 8; A low, B high 8, 1; both low 3, 3.',
      question: 'What happens, and why?',
      options: [
        { id: 'both-low', label: 'Both go low — low pays more whatever the other does', verdict: 'match', feedback: 'Low beats high against high (8 > 6) and against low (3 > 1). Both go low and get 3 — worse than 6 each.' },
        { id: 'both-high', label: 'Both go high — it’s best for both', verdict: 'misconception', feedback: 'Best together, but each gains by switching to low alone.' },
        { id: 'beliefs', label: 'It depends on what each expects the other to do', verdict: 'misconception', feedback: 'Not here: low is better against either choice, so beliefs don’t matter.' },
      ],
      explanation: 'A dominant strategy makes prediction easy — and here it traps both airlines in the worse outcome.',
      solve: () => (pureNashEquilibria(AIRLINES).length === 1 && pureNashEquilibria(AIRLINES)[0].row === 'low' ? 'both-low' : 'other'),
    },
    {
      id: 'm1.q2',
      lesson: 'iterated-dominance',
      table: { head: ['You ↓ / Them →', 'Left', 'Right'], rows: [['Up', '2, 1', '4, 0'], ['Middle', '1, 2', '3, 3'], ['Down', '0, 1', '5, 2']] },
      question: 'Which of your rows can be deleted as strictly dominated? (Your payoff is first.)',
      options: [
        { id: 'middle', label: 'Middle', verdict: 'match', feedback: 'Up beats Middle in both columns (2 > 1, 4 > 3).' },
        { id: 'down', label: 'Down — it has the worst payoff (0)', verdict: 'misconception', feedback: 'Down also has the best payoff (5 against Right). No row beats it in both columns.' },
        { id: 'none', label: 'None', verdict: 'misconception', feedback: 'Compare Up with Middle column by column.' },
      ],
      explanation: 'Dominance compares two actions against each opponent choice separately — not by their best or worst cell.',
      solve: () => strictlyDominatedRows(THREE_ROWS).join(','),
    },
    {
      id: 'm1.q3',
      lesson: 'best-response',
      table: { head: ['Row ↓ / Column →', 'L', 'R'], rows: [['T', '2, 1', '0, 0'], ['B', '0, 0', '1, 2']] },
      question: 'Which cells are pure-strategy Nash equilibria?',
      options: [
        { id: 'both', label: '(T, L) and (B, R)', verdict: 'match', feedback: 'In each, neither player gains by switching alone.' },
        { id: 'tl', label: 'Only (T, L) — it’s best for the row player', verdict: 'misconception', feedback: '(B, R) is also stable: from it, each player would lose by switching alone.' },
        { id: 'none', label: 'None — the players disagree', verdict: 'misconception', feedback: 'Disagreeing about which equilibrium is better doesn’t stop both being equilibria.' },
      ],
      explanation: 'Check every cell for mutual best replies. A game can have several equilibria.',
      solve: () => (pureNashEquilibria(TWO_EQ).length === 2 ? 'both' : 'other'),
    },
    {
      id: 'm1.q4',
      lesson: 'best-response',
      situation: 'Two partners end up at an outcome where each earns 2, although an outcome where each earns 5 exists. Neither can earn more than 2 by changing only their own choice.',
      question: 'Which statement is correct?',
      options: [
        { id: 'stable', label: 'It’s an equilibrium, even though it isn’t efficient', verdict: 'match', feedback: 'Equilibrium means no profitable one-person change. It says nothing about being the best joint outcome.' },
        { id: 'not-eq', label: 'It can’t be an equilibrium, since 5 each was possible', verdict: 'misconception', feedback: 'Reaching 5 each would need both to change at once. Equilibrium only rules out one-person improvements.' },
        { id: 'mistake', label: 'The partners must be irrational', verdict: 'misconception', feedback: 'Each is choosing a best reply. The problem is in the incentives, not the reasoning.' },
      ],
      explanation: 'Stable, efficient and fair are three separate questions.',
    },
  ],
};

const m2: Assessment = {
  id: 'm2',
  version: 1,
  title: 'Checkpoint 2 · Coordination, competition, unpredictability',
  intro: 'Four situations on coordination, mixed strategies, market competition and evolution.',
  passMark: 0.6,
  items: [
    {
      id: 'm2.q1',
      lesson: 'coordination-problem',
      situation: 'Two phone makers each pick a charging-port standard. Each prefers its own design, but if they choose different standards, both lose heavily.',
      question: 'What kind of strategic problem is this?',
      options: [
        { id: 'bos', label: 'Coordination with conflicting preferences over which match', verdict: 'match', feedback: 'Two equilibria (both pick A, both pick B), ranked oppositely by the two firms.' },
        { id: 'pd', label: 'A Prisoner’s Dilemma', verdict: 'misconception', feedback: 'In a PD there’s a dominant strategy. Here each firm’s best choice is to match the other.' },
        { id: 'pennies', label: 'Matching Pennies — they should randomise', verdict: 'misconception', feedback: 'Both want to match; nobody gains from being unpredictable.' },
      ],
      explanation: 'Multiple equilibria plus disagreement about which one: a Battle of the Sexes.',
    },
    {
      id: 'm2.q2',
      lesson: 'predictability-trap',
      situation: 'A ticket costs 2. A passenger caught without one pays a fine of 10. Inspectors check a train at random.',
      question: 'At what inspection probability is a passenger exactly indifferent between buying and dodging?',
      options: [
        { id: '20', label: '20%', verdict: 'match', feedback: 'Expected fine = 10 × p. It equals the ticket price of 2 at p = 20%.' },
        { id: '50', label: '50%', verdict: 'misconception', feedback: 'Indifference depends on the fare and fine, not on ½.' },
        { id: '10', label: '10%', verdict: 'misconception', feedback: 'At 10% the expected fine is 1 — dodging is cheaper.' },
      ],
      explanation: 'Mixed strategies come from indifference conditions computed from the payoffs.',
      solve: () => String(Math.round((2 / 10) * 100)),
    },
    {
      id: 'm2.q3',
      lesson: 'market-competition',
      situation: 'Price = 20 − total quantity. Your cost is 2 per unit. Your rival produces 6.',
      question: 'What quantity maximises your profit?',
      options: [
        { id: '6', label: '6', verdict: 'match', feedback: 'Best response (a − c − q_rival)/2 = (20 − 2 − 6)/2 = 6.' },
        { id: '9', label: '9', verdict: 'misconception', feedback: '9 would be best if the rival produced nothing.' },
        { id: '12', label: '12', verdict: 'misconception', feedback: 'That pushes the price to 2 — your cost.' },
      ],
      explanation: 'In Cournot competition each firm’s best quantity falls as its rival produces more.',
      solve: () => String(cournotBestResponse({ a: 20, cost: 2 }, 6)),
    },
    {
      id: 'm2.q4',
      lesson: 'evolution',
      situation: 'In a population, strategy A earns 3 against A and 1 against B; B earns 2 against either. 90% currently play A.',
      question: 'What happens over many generations?',
      options: [
        { id: 'a', label: 'A takes over the whole population', verdict: 'match', feedback: 'At 90% A, A earns 2.8 vs B’s 2. A grows, and its advantage increases.' },
        { id: 'half', label: 'It settles at 50/50', verdict: 'misconception', feedback: '50% is where A and B earn the same — but it’s unstable: from 90% the population moves away from it.' },
        { id: 'b', label: 'B takes over', verdict: 'misconception', feedback: 'B only takes over from below 50% A.' },
      ],
      explanation: 'Population shares move towards whichever strategy earns more against the current mix.',
      solve: () => {
        const g: PopulationGame = { names: ['A', 'B'], payoff: [[3, 1], [2, 2]], background: 1 };
        return longRunShare(g, 0.9) === 1 && Math.abs((interiorRestPoint(g) ?? 0) - 0.5) < 1e-9 ? 'a' : 'other';
      },
    },
  ],
};

const m3: Assessment = {
  id: 'm3',
  version: 1,
  title: 'Checkpoint 3 · Timing, commitment, incentives',
  intro: 'Four situations on backward induction, credibility and hidden actions.',
  passMark: 0.6,
  items: [
    {
      id: 'm3.q1',
      lesson: 'sequential-moves',
      situation: 'You choose In or Out. Out: you 0, they 4. If In, they then choose Share (you 3, they 2) or Fight (you −1, they 1).',
      question: 'What does backward induction predict?',
      options: [
        { id: 'in-share', label: 'You go In, and they Share', verdict: 'match', feedback: 'After In, they compare 2 (share) with 1 (fight). Knowing they’ll share, In pays you 3 > 0.' },
        { id: 'out', label: 'You stay Out to avoid a fight', verdict: 'misconception', feedback: 'Fighting would cost them 1. Solve their choice first.' },
        { id: 'in-fight', label: 'You go In, and they Fight', verdict: 'misconception', feedback: 'Fighting gives them 1 instead of 2.' },
      ],
      explanation: 'Solve the last decision first, then work backwards.',
    },
    {
      id: 'm3.q2',
      lesson: 'credibility',
      situation: 'A landlord threatens to evict a tenant who pays late once more. Eviction would cost the landlord about 5,000 in fees and lost rent; tolerating a late payment costs about 100.',
      question: 'Is the threat credible in a one-off situation?',
      options: [
        { id: 'no', label: 'No — carrying it out costs the landlord far more', verdict: 'match', feedback: 'When the moment comes, tolerating (−100) beats evicting (−5,000).' },
        { id: 'yes', label: 'Yes — landlords have the legal right', verdict: 'misconception', feedback: 'Having the right doesn’t make using it worthwhile.' },
        { id: 'reputation', label: 'Only if other tenants are watching', verdict: 'depends', feedback: 'Reputation across many tenants could change the game — but that’s not the one-off situation described.' },
      ],
      explanation: 'A threat is credible only if carrying it out is in the threatener’s interest at that point.',
    },
    {
      id: 'm3.q3',
      lesson: 'credibility',
      question: 'Which of these makes a threat genuinely more credible?',
      options: [
        { id: 'contract', label: 'Signing a contract that pays a large penalty to a third party if you don’t follow through', verdict: 'match', feedback: 'It changes your future payoffs, so following through becomes your best choice.' },
        { id: 'loud', label: 'Repeating the threat loudly and often', verdict: 'misconception', feedback: 'Words don’t change what you’ll prefer when the time comes.' },
        { id: 'sunk', label: 'Spending heavily on an unrelated, irreversible project', verdict: 'misconception', feedback: 'Irreversibility helps only if it changes the incentives of the action being threatened.' },
      ],
      explanation: 'Credible commitments work by changing future incentives or removing options.',
    },
    {
      id: 'm3.q4',
      lesson: 'incentive-shift',
      situation: 'An agent’s hidden effort costs them 6 and raises expected sales by 30. They’re paid a commission on sales.',
      question: 'What is the smallest commission rate that makes effort pay?',
      options: [
        { id: '20', label: '20%', verdict: 'match', feedback: '20% of the extra 30 is 6 — exactly the cost of effort.' },
        { id: '6', label: '6%', verdict: 'misconception', feedback: '6% of 30 is 1.8, less than the cost of 6.' },
        { id: '50', label: '50%', verdict: 'defensible', feedback: 'It works, but pays far more than needed.' },
      ],
      explanation: 'With hidden effort, pay for an observable outcome, enough that the extra expected pay covers the effort’s cost.',
      solve: () => String(Math.round((6 / 30) * 100)),
    },
  ],
};

const m4: Assessment = {
  id: 'm4',
  version: 1,
  title: 'Checkpoint 4 · Bargaining, waiting, repetition',
  intro: 'Four situations on bargaining power, sunk costs, repeated games and hold-up.',
  passMark: 0.6,
  items: [
    {
      id: 'm4.q1',
      lesson: 'bargaining',
      situation: 'You propose a split of 100 now. If the other side rejects, it proposes a split of 40 next round, which is the last round (rejecting that leaves both with 0). Indifferent responders accept.',
      question: 'What is the smallest offer the other side accepts now?',
      options: [
        { id: '40', label: '40', verdict: 'match', feedback: 'In the last round they can keep all 40. So rejecting now is worth 40 to them.' },
        { id: '50', label: '50', verdict: 'misconception', feedback: 'They’d accept 50, but 40 is already as good as rejecting.' },
        { id: '0', label: 'Anything above 0', verdict: 'misconception', feedback: 'They have a credible alternative worth 40.' },
      ],
      explanation: 'What each side gets by waiting determines what it accepts today.',
      solve: () => String(alternatingOffers([100, 40]).minAccept[0]),
    },
    {
      id: 'm4.q2',
      lesson: 'war-of-attrition',
      situation: 'You’ve spent 8 in a patent race. Continuing one more round costs 2 and gives a 30% chance to win a patent worth 10. Quitting gives 0 from now on.',
      question: 'What should you do, and why?',
      options: [
        { id: 'continue', label: 'Continue — 30% × 10 = 3 is more than the 2 it costs', verdict: 'match', feedback: 'Only future costs and chances matter.' },
        { id: 'quit', label: 'Quit — you’ve already lost 8', verdict: 'misconception', feedback: 'The 8 is sunk whether you quit or continue.' },
        { id: 'continue-sunk', label: 'Continue — otherwise the 8 was wasted', verdict: 'defensible', feedback: 'Right action, wrong reason: the 8 is gone either way. Continue because 3 > 2.' },
      ],
      explanation: 'Compare the next round’s cost with its expected gain; ignore sunk costs.',
    },
    {
      id: 'm4.q3',
      lesson: 'repeated-cooperation',
      situation: 'A repeated Prisoner’s Dilemma with payoffs 5 (temptation), 3 (both cooperate), 1 (both defect), 0 (sucker). After each round there’s a 40% chance of another. Your partner plays grim trigger.',
      question: 'Can grim trigger sustain cooperation here?',
      options: [
        { id: 'no', label: 'No — the future is too uncertain (40% < 50%)', verdict: 'match', feedback: 'Cooperation needs δ ≥ (5 − 3)/(5 − 1) = 0.5. At 0.4, defecting pays.' },
        { id: 'yes', label: 'Yes — repetition always sustains cooperation', verdict: 'misconception', feedback: 'Repetition helps only if the future is likely enough to matter.' },
        { id: 'depends', label: 'Only with tit-for-tat instead', verdict: 'misconception', feedback: 'A gentler punishment deters less, not more.' },
      ],
      explanation: 'The shadow of the future must be long enough to outweigh one round of temptation.',
      solve: () => (0.4 < grimThreshold(AXELROD) ? 'no' : 'yes'),
    },
    {
      id: 'm4.q4',
      lesson: 'bargaining',
      situation: 'A firm hesitates to build a factory next to its only customer, even though the factory would make both much better off.',
      question: 'What is the most likely strategic reason?',
      options: [
        { id: 'hold-up', label: 'Once built, the customer could bargain the price down, since the factory has no other buyer', verdict: 'match', feedback: 'That’s the hold-up problem: a specific investment weakens your bargaining position afterwards.' },
        { id: 'cost', label: 'The factory is simply too expensive', verdict: 'misconception', feedback: 'The situation says it makes both better off — the issue is who captures the value.' },
        { id: 'trust', label: 'They don’t like each other', verdict: 'misconception', feedback: 'Even with goodwill, the incentive to renegotiate after the investment remains.' },
      ],
      explanation: 'Agree terms before making investments that only pay off with one partner.',
    },
  ],
};

const m5: Assessment = {
  id: 'm5',
  version: 1,
  title: 'Checkpoint 5 · Information and beliefs',
  intro: 'Five situations on beliefs, Bayesian updating, signals and auctions.',
  passMark: 0.6,
  items: [
    {
      id: 'm5.q1',
      lesson: 'strategy-detective',
      situation: 'In a guess-two-thirds-of-the-average game with many players, you believe the others will average about 40.',
      question: 'Ignoring your own small effect on the average, what should you guess?',
      options: [
        { id: '27', label: 'About 27', verdict: 'match', feedback: '⅔ × 40 ≈ 27.' },
        { id: '0', label: '0 — the equilibrium', verdict: 'defensible', feedback: '0 is where full rationality leads, but you believe the others average 40.' },
        { id: '40', label: '40', verdict: 'misconception', feedback: 'The target is two-thirds of the average, not the average.' },
      ],
      explanation: 'Best-reply to your belief about others, not to the theoretical limit.',
      solve: () => String(Math.round((2 / 3) * 40)),
    },
    {
      id: 'm5.q2',
      lesson: 'bayesian-uncertainty',
      situation: '1% of transactions are fraudulent. A detector flags 90% of frauds and 5% of legitimate transactions. A transaction is flagged.',
      question: 'Roughly how likely is it to be fraud?',
      options: [
        { id: '15', label: 'About 15%', verdict: 'match', feedback: 'Out of 1,000: 9 frauds flagged, about 50 legitimate flagged. 9 ÷ 59 ≈ 15%.' },
        { id: '90', label: 'About 90%', verdict: 'misconception', feedback: '90% is P(flag | fraud), not P(fraud | flag). Most flags come from the many legitimate transactions.' },
        { id: '1', label: 'About 1%', verdict: 'misconception', feedback: 'The flag is real evidence; it should raise your belief well above 1%.' },
      ],
      explanation: 'Combine the base rate with the strength of the evidence.',
      solve: () => String(Math.round(posterior([0.01, 0.99], [0.9, 0.05])[0] * 100)),
    },
    {
      id: 'm5.q3',
      lesson: 'signaling',
      situation: 'A seller can offer a 3-year warranty. Good products rarely break, so the warranty costs good sellers 2; it costs bad sellers 12. Buyers pay 10 more for a product with the warranty.',
      question: 'Who offers the warranty?',
      options: [
        { id: 'good', label: 'Only good sellers', verdict: 'match', feedback: 'Good sellers gain 10 − 2 = 8; bad sellers would lose 2 (10 − 12). The warranty separates them.' },
        { id: 'all', label: 'All sellers — it raises the price', verdict: 'misconception', feedback: 'For bad sellers the cost exceeds the price gain.' },
        { id: 'none', label: 'Nobody — warranties are costly', verdict: 'misconception', feedback: 'For good sellers the gain outweighs the cost.' },
      ],
      explanation: 'A signal is credible when it is too costly for the wrong type to copy.',
    },
    {
      id: 'm5.q4',
      lesson: 'auctions',
      situation: 'A painting is worth exactly 80 to you, regardless of what others think it’s worth. It’s sold in a sealed second-price auction.',
      question: 'What should you bid?',
      options: [
        { id: '80', label: '80', verdict: 'match', feedback: 'With private values in a second-price auction, bidding your value is weakly dominant.' },
        { id: 'less', label: 'Less than 80, to keep some profit', verdict: 'misconception', feedback: 'Your bid doesn’t set your price; shading only loses auctions you’d want to win.' },
        { id: 'more', label: 'More than 80, to be sure to win', verdict: 'misconception', feedback: 'The extra wins are those where you’d pay more than 80.' },
      ],
      explanation: 'Rules change strategy: here the price is set by the other bid.',
    },
    {
      id: 'm5.q5',
      lesson: 'market-quality',
      situation: 'Used laptops vary in quality. Sellers know quality; buyers don’t. Buyers offer a price based on average quality.',
      question: 'What tends to happen to the laptops offered for sale?',
      options: [
        { id: 'worse', label: 'Owners of the best laptops withdraw, so the average quality offered falls', verdict: 'match', feedback: 'At an average-quality price, good laptops are under-priced. Their owners keep them — adverse selection.' },
        { id: 'same', label: 'Nothing — the price reflects the average', verdict: 'misconception', feedback: 'The average changes as owners decide whether to sell at that price.' },
        { id: 'better', label: 'Quality improves as sellers compete', verdict: 'misconception', feedback: 'Without a way to show quality, competition happens on price, not quality.' },
      ],
      explanation: 'Hidden information changes who participates in a market.',
    },
  ],
};

const m6: Assessment = {
  id: 'm6',
  version: 1,
  title: 'Checkpoint 6 · Groups, conflict and transfer',
  intro: 'Four situations on coalitions, voting and escalation.',
  passMark: 0.6,
  items: [
    {
      id: 'm6.q1',
      lesson: 'coalitions',
      situation: 'Three partners: any two together can earn 30; all three together earn 36; alone, nobody earns anything.',
      question: 'Is splitting the 36 equally (12 each) stable?',
      options: [
        { id: 'no', label: 'No — any two get 24 but could earn 30 on their own', verdict: 'match', feedback: 'Every pair is short by 6, so a pair can break away. In fact no split of 36 satisfies all three pairs (that would need 45).' },
        { id: 'yes', label: 'Yes — it’s equal', verdict: 'misconception', feedback: 'Equality isn’t stability: ask what each group could get on its own.' },
        { id: 'accepted', label: 'Yes, if everyone agrees to it', verdict: 'misconception', feedback: 'Agreement today doesn’t stop a pair finding a better deal.' },
      ],
      explanation: 'An allocation is in the core only if no group can do better on its own.',
      solve: () => (coreIsEmpty({ A: 0, B: 0, C: 0, AB: 30, AC: 30, BC: 30, ABC: 36 }, ['A', 'B', 'C']) ? 'no' : 'yes'),
    },
    {
      id: 'm6.q2',
      lesson: 'voting',
      situation: 'Plurality vote. Polls: A 45%, B 40%, C 15%. You prefer C, then B; A is your least favourite. Your vote could be decisive.',
      question: 'How should you vote to get the best achievable outcome?',
      options: [
        { id: 'b', label: 'B', verdict: 'match', feedback: 'C can’t realistically win. A vote for B is the one that can stop A.' },
        { id: 'c', label: 'C — always vote for your favourite', verdict: 'misconception', feedback: 'A sincere vote for C may help A win.' },
        { id: 'abstain', label: 'Abstain', verdict: 'misconception', feedback: 'That gives up your chance to stop A.' },
      ],
      explanation: 'Under plurality rule, the sincere vote and the best vote can differ.',
    },
    {
      id: 'm6.q3',
      lesson: 'brinkmanship',
      question: 'Which of these is brinkmanship, rather than a war of attrition or an ordinary threat?',
      options: [
        { id: 'risk', label: 'Deliberately taking a step that raises the chance of a disaster for both, hoping the other side backs down', verdict: 'match', feedback: 'Brinkmanship works through shared risk that neither side fully controls.' },
        { id: 'wait', label: 'Both sides paying every day until one gives up', verdict: 'misconception', feedback: 'That’s a war of attrition: costs accumulate, but nobody raises the risk.' },
        { id: 'threat', label: 'Promising to punish later if the other side misbehaves', verdict: 'misconception', feedback: 'That’s a conditional threat; its credibility depends on your later incentives.' },
      ],
      explanation: 'Brinkmanship creates risk; attrition accumulates cost; threats promise a later choice.',
    },
    {
      id: 'm6.q4',
      lesson: 'voting',
      situation: 'Three committee members rank three options in a cycle: A > B > C, B > C > A, C > A > B. They vote sincerely in pairwise votes.',
      question: 'Who effectively decides the outcome?',
      options: [
        { id: 'agenda', label: 'Whoever sets the order of the votes', verdict: 'match', feedback: 'With cyclic majorities, each agenda produces a different winner.' },
        { id: 'majority', label: 'The majority — the best option always wins', verdict: 'misconception', feedback: 'Every option loses to some other option by majority.' },
        { id: 'nobody', label: 'Nobody — the vote is random', verdict: 'misconception', feedback: 'The outcome is fully determined by the agenda.' },
      ],
      explanation: 'When majorities cycle, procedure determines outcomes.',
    },
  ],
};

/** The final case: Riverbend decides first; Hilltop sees it and has a private cost. */
export const CASE = {
  bothInvest: 12,
  oneInvestsInvestor: 5,
  oneInvestsOther: 7,
  neither: 3,
  riverbendCost: 4,
  hilltopCosts: [4, 7],
  pHigh: 0.5,
};
/** Hilltop invests after Riverbend's choice iff it pays more for its type. */
export function hilltopInvests(riverbendInvested: boolean, cost: number): boolean {
  return riverbendInvested ? CASE.bothInvest - cost > CASE.oneInvestsOther : CASE.oneInvestsInvestor - cost > CASE.neither;
}
export function riverbendValue(invest: boolean, pHigh = CASE.pHigh): number {
  return [1 - pHigh, pHigh].reduce((sum, p, i) => {
    const hInvests = hilltopInvests(invest, CASE.hilltopCosts[i]);
    const gross = invest ? (hInvests ? CASE.bothInvest : CASE.oneInvestsInvestor) : hInvests ? CASE.oneInvestsOther : CASE.neither;
    return sum + p * (gross - (invest ? CASE.riverbendCost : 0));
  }, 0);
}

const final: Assessment = {
  id: 'final',
  version: 1,
  title: 'Final assessment · The water-saving decision',
  intro: 'One unfamiliar situation, seven questions, then a short written recommendation. Nothing tells you which lesson applies. Some questions accept more than one answer.',
  case:
    'Two farming cooperatives, Riverbend and Hilltop, share a river. Each can install water-saving equipment. Gross benefits: if both install, 12 each; if only one installs, the installer gets 5 and the other 7 (it still benefits from more water); if neither, 3 each. Riverbend decides first, publicly; Hilltop sees that decision before choosing. Installing costs Riverbend 4. Hilltop’s cost is private: 4 if its land is like Riverbend’s, 7 if it has older land — Riverbend thinks each is equally likely. You advise Riverbend.',
  passMark: 0.7,
  items: [
    {
      id: 'final.players',
      lesson: 'strategic-practice',
      question: 'Who are the strategic players, and what do they want? (Choose all that apply.)',
      multi: true,
      options: [
        { id: 'riverbend', label: 'Riverbend, maximising its own net benefit', verdict: 'match', feedback: 'Yes — your client.' },
        { id: 'hilltop', label: 'Hilltop, maximising its own net benefit', verdict: 'match', feedback: 'Yes — it chooses after seeing Riverbend.' },
        { id: 'region', label: 'Both cooperatives, maximising the region’s total', verdict: 'misconception', feedback: 'Nothing says either cares about the other’s benefit.' },
        { id: 'nature', label: 'Nature, which picks Hilltop’s cost', verdict: 'defensible', feedback: 'A useful modelling device (a chance move), though not a player with goals.' },
      ],
      explanation: 'Two strategic players with their own objectives, plus a chance move for Hilltop’s type.',
    },
    {
      id: 'final.timing',
      lesson: 'sequential-moves',
      question: 'How are the moves timed?',
      options: [
        { id: 'sequential', label: 'Sequentially — Hilltop observes Riverbend’s choice before choosing', verdict: 'match', feedback: 'That’s stated explicitly, and it’s decisive for the analysis.' },
        { id: 'simultaneous', label: 'Simultaneously', verdict: 'misconception', feedback: 'Hilltop sees Riverbend’s public decision first.' },
        { id: 'repeated', label: 'As a repeated game', verdict: 'misconception', feedback: 'The case describes a single decision each.' },
      ],
      explanation: 'Who sees what before moving determines whether backward induction applies.',
    },
    {
      id: 'final.information',
      lesson: 'bayesian-uncertainty',
      question: 'What does each side know?',
      options: [
        { id: 'hidden-type', label: 'Hilltop knows its own cost; Riverbend knows only that it’s 4 or 7, equally likely', verdict: 'match', feedback: 'A hidden type with a known prior.' },
        { id: 'hidden-action', label: 'Riverbend can’t see whether Hilltop installs', verdict: 'misconception', feedback: 'Installation choices aren’t hidden here; Hilltop’s cost is. Hidden type, not hidden action.' },
        { id: 'complete', label: 'Everyone knows everything', verdict: 'misconception', feedback: 'Hilltop’s cost is private.' },
      ],
      explanation: 'Distinguish uncertainty about who someone is (type) from uncertainty about what they did (action).',
    },
    {
      id: 'final.conflict',
      lesson: 'cooperation-trap',
      question: 'Where is the conflict of incentives?',
      options: [
        { id: 'free-ride', label: 'Installing helps both, but each pays its own cost — so each is tempted to let the other install', verdict: 'match', feedback: 'The non-installer still gets 7, more than the installer’s 5 (before costs).' },
        { id: 'zero-sum', label: 'Whatever one gains, the other loses', verdict: 'misconception', feedback: 'Both can gain together: both installing gives 12 each.' },
        { id: 'none', label: 'There’s no conflict — both want water', verdict: 'misconception', feedback: 'Both want water, but each would rather the other pay for it.' },
      ],
      explanation: 'Shared benefits with private costs create free-riding temptations.',
    },
    {
      id: 'final.model',
      lesson: 'strategic-practice',
      question: 'Which solution method fits? (Choose all that apply.)',
      multi: true,
      options: [
        { id: 'backward', label: 'Backward induction: work out Hilltop’s reply to each Riverbend choice first', verdict: 'match', feedback: 'Hilltop moves second with full knowledge of Riverbend’s move.' },
        { id: 'expected', label: 'Expected payoffs over Hilltop’s two possible costs', verdict: 'match', feedback: 'Riverbend must average over the type it can’t see.' },
        { id: 'dominance', label: 'Look for a dominant strategy in a simultaneous matrix', verdict: 'misconception', feedback: 'Treating it as simultaneous ignores the timing.' },
        { id: 'mixed', label: 'Find a mixed-strategy equilibrium', verdict: 'misconception', feedback: 'Nobody benefits from being unpredictable here.' },
      ],
      explanation: 'A sequential game with a hidden type: backward induction plus expected values.',
    },
    {
      id: 'final.prediction',
      lesson: 'strategic-practice',
      question: 'What should Riverbend do?',
      options: [
        { id: 'invest', label: 'Install: expected 4.5, versus 3 if it doesn’t', verdict: 'match', feedback: 'If Riverbend installs, a cost-4 Hilltop also installs (8 > 7): Riverbend nets 8. A cost-7 Hilltop doesn’t (5 < 7): Riverbend nets 1. Average 4.5. Without installing, neither type installs: 3.' },
        { id: 'wait', label: 'Don’t install — Hilltop might free-ride', verdict: 'defensible', feedback: 'Half the time it will, but installing still pays on average (4.5 > 3).' },
        { id: 'follow', label: 'Install — Hilltop will always follow', verdict: 'misconception', feedback: 'A cost-7 Hilltop won’t: 12 − 7 = 5 < 7.' },
      ],
      explanation: 'Backward induction for each Hilltop type, then the probability-weighted comparison.',
      solve: () => (riverbendValue(true) > riverbendValue(false) && riverbendValue(true) === 4.5 && riverbendValue(false) === 3 ? 'invest' : 'other'),
    },
    {
      id: 'final.assumptions',
      lesson: 'strategic-practice',
      question: 'Which changes could change your recommendation or prediction? (Choose all that apply.)',
      multi: true,
      options: [
        { id: 'prior', label: 'If older land (cost 7) were much more common', verdict: 'match', feedback: 'Installing is worth 8 − 7q for a share q of cost-7 Hilltops; above about 71%, not installing is better.' },
        { id: 'subsidy', label: 'A subsidy of 3 for every installer', verdict: 'match', feedback: 'Then a cost-7 Hilltop would install after Riverbend (12 − 7 + 3 = 8 > 7).' },
        { id: 'simultaneous', label: 'If Hilltop had to decide without seeing Riverbend’s choice', verdict: 'match', feedback: 'The game becomes simultaneous, and Hilltop’s reply depends on its beliefs, not on what it sees.' },
        { id: 'units', label: 'Measuring benefits in a different currency', verdict: 'misconception', feedback: 'Rescaling all payoffs changes nothing strategic.' },
      ],
      explanation: 'Good recommendations name the assumptions they rely on.',
    },
  ],
  reflection: {
    prompt: 'In three or four sentences, write the recommendation you would give Riverbend and why.',
    rubric: [
      'I used the timing: Hilltop sees Riverbend’s choice.',
      'I considered both possible Hilltop costs and their probabilities.',
      'I compared Riverbend’s expected payoffs (about 4.5 vs 3).',
      'I named at least one assumption that could change the advice.',
    ],
  },
};

export const ASSESSMENTS: readonly Assessment[] = [m1, m2, m3, m4, m5, m6, final];

export function getAssessment(id: string | undefined): Assessment | undefined {
  return ASSESSMENTS.find((a) => a.id === id);
}

export function moduleCheckpoint(module: ModuleId): Assessment {
  return ASSESSMENTS.find((a) => a.id === module)!;
}

/** "Checkpoint 2 · Coordination, …" → kicker and subject, so cards can show them on separate lines. */
export function splitAssessmentTitle(title: string): { kicker: string; subject: string } {
  const i = title.indexOf(' · ');
  return i < 0 ? { kicker: title, subject: '' } : { kicker: title.slice(0, i), subject: title.slice(i + 3) };
}
