import { stoppingValues, shrinkingPieShare } from '../../../game/bargaining.ts';
import { blockingCoalitions, majorityWinner } from '../../../game/collective.ts';
import { expectedProfit } from '../../../game/auctions.ts';
import { hawkDove, interiorRestPoint, simulatePopulation } from '../../../game/evolution.ts';
import { lemonsMarket, posterior, separatingHolds } from '../../../game/information.ts';
import { cournotBestResponse, cournotProfit } from '../../../game/markets.ts';
import type { MatrixGame } from '../../../game/payoff-matrix.ts';
import { AXELROD, cooperateForever, defectAgainstGrim, grimThreshold } from '../../../game/repeated.ts';
import type { GameTree } from '../../../game/sequential.ts';
import { fmt, pct } from '../../scenarios/builders.ts';
import { CENTIPEDE, CAPACITY } from '../../scenarios/content/module3.ts';
import { FOOD_TRUCKS, NEGOTIATION } from '../../scenarios/content/module1.ts';
import { BUYER_MULTIPLIER, CARS } from '../../scenarios/content/module5.ts';
import { COMMITTEE, PROJECT } from '../../scenarios/content/module6.ts';
import type { StatLine, Tone } from '../../scenarios/types.ts';

/**
 * The interactive "lab" each new lesson uses to name its concept once the learner has played scenario A.
 * Pure: every number a lab shows is computed here from the game engine, so tests can pin it.
 */

export interface LabOutput {
  stats: StatLine[];
  lines: string[];
  bars?: { label: string; value: number; tone?: Tone }[];
}

export interface LabSlider {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  unit?: '%' | '';
}

export type LabSpec =
  | { kind: 'matrix'; prompt: string; game: MatrixGame; rowName: string; colName: string; rowLabels: Record<string, string>; colLabels: Record<string, string>; eliminate?: boolean }
  | { kind: 'tree'; prompt: string; tree: GameTree }
  | { kind: 'param'; prompt: string; sliders: LabSlider[]; compute: (v: Record<string, number>) => LabOutput }
  | { kind: 'reveal'; prompt: string; cards: RevealCard[] };

/** A step in a reveal lab. With `guess`, the learner commits to one of the options before the body is shown. */
export interface RevealCard {
  title: string;
  body: string;
  guess?: { question: string; options: string[]; answer: string };
}

export const LABS: Partial<Record<string, LabSpec>> = {
  'iterated-dominance': {
    kind: 'matrix',
    prompt: 'Delete one round of strictly dominated options at a time and watch the game shrink.',
    game: NEGOTIATION,
    rowName: 'You',
    colName: 'Client',
    rowLabels: { fast: 'Fast', discount: 'Discount', bundle: 'Bundle' },
    colLabels: { accept: 'Accept', counter: 'Counter', shop: 'Shop' },
    eliminate: true,
  },
  'best-response': {
    kind: 'matrix',
    prompt: 'Tap cells to compare, then ring every best reply. A cell with both payoffs ringed is a Nash equilibrium.',
    game: FOOD_TRUCKS,
    rowName: 'You',
    colName: 'Rival',
    rowLabels: { station: 'Station', park: 'Park', campus: 'Campus' },
    colLabels: { station: 'Station', park: 'Park', campus: 'Campus' },
  },
  'market-competition': {
    kind: 'param',
    prompt: 'Move the rival’s output and watch your best reply move the other way.',
    sliders: [{ id: 'rival', label: 'Rival’s units', min: 0, max: 12, step: 1, initial: 2 }],
    compute: ({ rival }) => cournotLab(rival),
  },
  evolution: {
    kind: 'param',
    prompt: 'Change the value of the resource, the cost of a fight and the starting mix. Where does the population settle?',
    sliders: [
      { id: 'V', label: 'Value of the resource (V)', min: 1, max: 10, step: 1, initial: 4 },
      { id: 'C', label: 'Cost of losing a fight (C)', min: 1, max: 12, step: 1, initial: 6 },
      { id: 'x0', label: 'Starting share of hawks', min: 5, max: 95, step: 5, initial: 20, unit: '%' },
    ],
    compute: ({ V, C, x0 }) => hawkDoveLab(V, C, x0 / 100),
  },
  'sequential-moves': { kind: 'tree', prompt: 'Solve the growing-pot game from the last move backwards, one step at a time.', tree: CENTIPEDE },
  credibility: { kind: 'tree', prompt: 'Solve the capacity game backwards. Watch how the investment changes your own later choice.', tree: CAPACITY },
  bargaining: {
    kind: 'param',
    prompt: 'How much of the pie survives each round, and how many rounds are there? See what the first proposer can keep.',
    sliders: [
      { id: 'delta', label: 'Share of the pie left after each rejection', min: 10, max: 90, step: 10, initial: 60, unit: '%' },
      { id: 'rounds', label: 'Rounds of offers', min: 1, max: 6, step: 1, initial: 3 },
    ],
    compute: ({ delta, rounds }) => bargainingLab(delta / 100, rounds),
  },
  'war-of-attrition': {
    kind: 'param',
    prompt: 'Set the prize, the cost per round and how often the other side quits. When is staying in worth it?',
    sliders: [
      { id: 'prize', label: 'Prize', min: 1, max: 20, step: 1, initial: 6 },
      { id: 'cost', label: 'Cost per round', min: 1, max: 5, step: 1, initial: 1 },
      { id: 'q', label: 'Chance they quit each round', min: 5, max: 60, step: 5, initial: 25, unit: '%' },
    ],
    compute: ({ prize, cost, q }) => attritionLab(prize, cost, q / 100),
  },
  'repeated-cooperation': {
    kind: 'param',
    prompt: 'Change how likely the relationship is to continue, and how late cheating is noticed.',
    sliders: [
      { id: 'delta', label: 'Chance of another round', min: 10, max: 95, step: 5, initial: 60, unit: '%' },
      { id: 'delay', label: 'Rounds before cheating is noticed', min: 0, max: 3, step: 1, initial: 0 },
    ],
    compute: ({ delta, delay }) => repeatedLab(delta / 100, delay),
  },
  'bayesian-uncertainty': {
    kind: 'param',
    prompt: 'Change the base rate and how strongly the evidence points each way. Watch the posterior.',
    sliders: [
      { id: 'prior', label: 'Base rate (prior)', min: 1, max: 90, step: 1, initial: 10, unit: '%' },
      { id: 'hit', label: 'Chance of the evidence if it’s true', min: 5, max: 100, step: 5, initial: 70, unit: '%' },
      { id: 'false', label: 'Chance of the evidence if it’s false', min: 5, max: 100, step: 5, initial: 20, unit: '%' },
    ],
    compute: ({ prior, hit, false: fa }) => bayesLab(prior / 100, hit / 100, fa / 100),
  },
  signaling: {
    kind: 'param',
    prompt: 'Change what the certificate costs each type. When does it separate them?',
    sliders: [
      { id: 'ch', label: 'Cost for high-productivity workers', min: 0, max: 10, step: 1, initial: 2 },
      { id: 'cl', label: 'Cost for low-productivity workers', min: 0, max: 12, step: 1, initial: 7 },
    ],
    compute: ({ ch, cl }) => signalingLab(ch, cl),
  },
  auctions: {
    kind: 'param',
    prompt: 'Try different bids for a camera worth 60 to you. Compare the two auction formats.',
    sliders: [{ id: 'bid', label: 'Your bid', min: 0, max: 100, step: 5, initial: 60 }],
    compute: ({ bid }) => auctionLab(bid),
  },
  'market-quality': {
    kind: 'param',
    prompt: 'Change how much more buyers value a car than its owner, and the price offered.',
    sliders: [
      { id: 'mult', label: 'Buyer’s value ÷ owner’s value', min: 100, max: 250, step: 10, initial: 150, unit: '%' },
      { id: 'price', label: 'Price offered', min: 10, max: 100, step: 10, initial: 60 },
    ],
    compute: ({ mult, price }) => lemonsLab(mult / 100, price),
  },
  coalitions: {
    kind: 'param',
    prompt: 'Split the 90 between A, B and C (C gets what’s left). Find a split no group can block.',
    sliders: [
      { id: 'A', label: 'A’s share', min: 0, max: 90, step: 5, initial: 30 },
      { id: 'B', label: 'B’s share', min: 0, max: 90, step: 5, initial: 30 },
    ],
    compute: ({ A, B }) => coreLab(A, B),
  },
  voting: {
    kind: 'reveal',
    prompt: 'Guess the winner of each head-to-head vote between the three proposals, then reveal it.',
    cards: [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
    ].map(([x, y]) => {
      const w = majorityWinner(COMMITTEE, x, y)!;
      const forW = COMMITTEE.filter((r) => r.indexOf(w) < r.indexOf(w === x ? y : x)).length;
      return { title: `${x} vs ${y}`, body: `${w} wins ${forW}–${3 - forW}.`, guess: { question: 'which wins by majority?', options: [x, y], answer: w } };
    }),
  },
  brinkmanship: {
    kind: 'param',
    prompt: 'One round at a level of the ladder: how do the disaster risk and their chance of backing down trade off?',
    sliders: [
      { id: 'risk', label: 'Disaster risk this round', min: 0, max: 50, step: 5, initial: 5, unit: '%' },
      { id: 'yield', label: 'Chance they back down', min: 0, max: 90, step: 5, initial: 35, unit: '%' },
    ],
    compute: ({ risk, yield: y }) => brinkLab(risk / 100, y / 100),
  },
  'strategic-practice': {
    kind: 'reveal',
    prompt: 'Work through the launch decision step by step. Where a step asks, commit to an answer before revealing.',
    cards: [
      { title: '1 · Players and objectives', body: 'Your startup and the larger rival, each maximising its own payoff.' },
      { title: '2 · Actions', body: 'Each can launch now or wait a quarter.' },
      { title: '3 · Information', body: 'Payoffs are your team’s estimates; both know them. No hidden types.' },
      { title: '4 · Timing', body: 'Sequential: the rival sees your launch within days and can respond.', guess: { question: 'how are the moves timed?', options: ['Simultaneous', 'Sequential'], answer: 'Sequential' } },
      { title: '5 · Uncertainty and incentives', body: 'Your estimates could be wrong; the rival would rather you didn’t launch first.' },
      { title: '6 · Model', body: 'A sequential game: solve it by backward induction.', guess: { question: 'which method fits?', options: ['Backward induction', 'Look for a dominant strategy', 'Randomise'], answer: 'Backward induction' } },
      { title: '7 · Prediction', body: 'If you launch now, the rival waits (4 > 3); if you wait, it launches (6 > 3). Launch now: 6.', guess: { question: 'what should you do?', options: ['Launch now', 'Wait a quarter'], answer: 'Launch now' } },
      { title: '8 · What would change it', body: 'If the rival couldn’t see your move in time, or if your estimates of its payoffs are off.' },
    ],
  },
};

// ── Lab computations ─────────────────────────────────────────────────────────

export function cournotLab(rival: number): LabOutput {
  const m = { a: 12, cost: 0 };
  const br = cournotBestResponse(m, rival);
  return {
    stats: [
      { label: 'Your best reply', value: `${fmt(br, 1)} units`, tone: 'blue' },
      { label: 'Your profit', value: fmt(cournotProfit(m, br, rival), 2), tone: 'blue' },
      { label: 'Price', value: fmt(Math.max(0, 12 - br - rival), 1) },
    ],
    lines: [
      `Best reply = (12 − ${rival}) ÷ 2 = ${fmt(br, 1)}.`,
      rival === 4 ? 'At 4, your best reply is also 4: each firm’s output is a best reply to the other’s. That is the Cournot equilibrium.' : `The more Rohan makes, the less you should. Only at 4 each are both outputs best replies.`,
    ],
  };
}

export function hawkDoveLab(V: number, C: number, x0: number): LabOutput {
  const g = hawkDove(V, C);
  const path = simulatePopulation(g, x0, 60);
  const rest = interiorRestPoint(g);
  const marks = [0, 10, 20, 40, 60];
  return {
    stats: [
      { label: 'After 60 generations', value: pct(path[60], 1), tone: 'blue' },
      { label: 'Prediction (V/C)', value: V >= C ? '100%' : pct(V / C, 1), tone: 'amber' },
    ],
    lines: [V >= C ? 'When the prize is worth at least the cost of a fight, hawks always do at least as well: they take over.' : `Hawks and doves earn the same at ${pct(rest ?? V / C, 1)} hawks — the evolutionarily stable mix.`],
    bars: marks.map((t) => ({ label: `Generation ${t}`, value: path[t], tone: 'blue' as const })),
  };
}

export function bargainingLab(delta: number, rounds: number): LabOutput {
  const keep = shrinkingPieShare(delta, rounds);
  return {
    stats: [
      { label: 'First proposer keeps', value: pct(keep, 1), tone: 'blue' },
      { label: 'Responder gets', value: pct(1 - keep, 1), tone: 'orange' },
    ],
    lines: [
      rounds === 1 ? 'With one round, it’s an ultimatum: the proposer keeps everything (with money-only payoffs).' : `Working back from round ${rounds}, each responder accepts what they’d get by proposing next.`,
      delta >= 0.8 ? 'When delay is cheap, the advantage of proposing first shrinks towards an even split over many rounds.' : 'When delay is expensive, the first proposer has more power.',
    ],
  };
}

export function attritionLab(prize: number, cost: number, q: number): LabOutput {
  const perRound = q * prize - cost;
  const v = stoppingValues({ cost, prize, quitProb: () => q, maxRounds: 30, endValue: 0 });
  return {
    stats: [
      { label: 'Expected gain per round', value: fmt(q * prize, 2), tone: 'blue' },
      { label: 'Cost per round', value: String(cost), tone: 'orange' },
      { label: 'Value of staying in', value: fmt(Math.max(0, v.value[0]), 2), tone: 'amber' },
    ],
    lines: [
      perRound > 0 ? 'Stay in: each round’s chance of winning is worth more than its cost — whatever you’ve already paid.' : 'Quit now: each round costs more than the chance of winning is worth, however much you’ve already paid.',
      `If they were strategic too, they’d quit at a rate that leaves you indifferent: ${pct(cost / prize, 1)} per round.`,
    ],
  };
}

export function repeatedLab(delta: number, delay: number): LabOutput {
  const coop = cooperateForever(AXELROD, delta);
  const cheat = defectAgainstGrim(AXELROD, delta, delay);
  return {
    stats: [
      { label: 'Cooperate forever', value: fmt(coop, 2), tone: 'blue' },
      { label: 'Cheat from now on', value: fmt(cheat, 2), tone: 'orange' },
      { label: 'Threshold (no delay)', value: pct(grimThreshold(AXELROD)), tone: 'amber' },
    ],
    lines: [coop >= cheat ? 'Cooperation is sustainable: the future punishment outweighs the gain from cheating.' : 'Cheating pays: the future is too uncertain, or punishment comes too late.'],
  };
}

export function bayesLab(prior: number, hit: number, falseRate: number): LabOutput {
  const post = posterior([prior, 1 - prior], [hit, falseRate])[0];
  const n = 1000;
  const tp = Math.round(prior * n * hit);
  const fp = Math.round((1 - prior) * n * falseRate);
  return {
    stats: [
      { label: 'Before the evidence', value: pct(prior, 1), tone: 'neutral' },
      { label: 'After the evidence', value: pct(post, 1), tone: 'amber' },
    ],
    lines: [`Out of ${n}: ${Math.round(prior * n)} true cases, ${tp} of them show the evidence; ${n - Math.round(prior * n)} false cases, ${fp} of them show it too. ${tp} of the ${tp + fp} showing it are true.`],
    bars: [
      { label: 'Prior', value: prior, tone: 'blue' },
      { label: 'Posterior', value: post, tone: 'amber' },
    ],
  };
}

export function signalingLab(ch: number, cl: number): LabOutput {
  const s = separatingHolds({ high: 10, low: 4, pHigh: 0.5, costHigh: ch, costLow: cl });
  return {
    stats: [
      { label: 'High type gains from signalling', value: fmt(s.highGains), tone: 'blue' },
      { label: 'Low type gains from copying', value: fmt(s.lowGainsFromCopying), tone: 'orange' },
    ],
    lines: [s.holds ? 'Separating: only high types get the certificate, so it reveals productivity.' : s.highGains < 0 ? 'Too costly even for high types: nobody signals.' : 'Low types would copy: the certificate can’t separate the types.'],
  };
}

export function auctionLab(bid: number): LabOutput {
  const fp = expectedProfit('first-price', 60, bid, 100, (v) => v / 2);
  const sp = expectedProfit('second-price', 60, bid, 100, (v) => v);
  return {
    stats: [
      { label: 'First-price (rival bids v/2)', value: fmt(fp, 2), tone: 'blue' },
      { label: 'Second-price (rival bids v)', value: fmt(sp, 2), tone: 'orange' },
    ],
    lines: ['First-price profit peaks around a bid of 30; second-price profit peaks at your value, 60.'],
  };
}

export function lemonsLab(mult: number, price: number): LabOutput {
  const m = lemonsMarket(CARS, price, mult);
  const viable = CARS.filter((p) => lemonsMarket(CARS, p, mult).buyerSurplus >= -1e-9);
  return {
    stats: [
      { label: 'Cars offered', value: `${m.offered.length}/10` },
      { label: 'Average quality', value: fmt(m.avgQuality, 1) },
      { label: 'Buyer surplus', value: fmt(m.buyerSurplus, 1), tone: m.buyerSurplus >= 0 ? 'blue' : 'orange' },
    ],
    lines: [viable.length ? `Prices that don’t lose a buyer money: up to ${Math.max(...viable)}.` : 'No price leaves the buyer ahead: the market collapses.', mult === BUYER_MULTIPLIER ? 'This is the lesson’s scenario: a buyer values a car at 1.5 × its quality.' : 'The bigger the gap between buyer and owner values, the more of the market survives.'],
  };
}

export function coreLab(A: number, B: number): LabOutput {
  const C = 90 - A - B;
  if (C < 0) return { stats: [{ label: 'C', value: String(C), tone: 'orange' }], lines: ['A and B already take more than 90. Lower one of them.'] };
  const blocks = blockingCoalitions(PROJECT, ['A', 'B', 'C'], { A, B, C });
  return {
    stats: [
      { label: 'A', value: String(A), tone: 'blue' },
      { label: 'B', value: String(B), tone: 'blue' },
      { label: 'C', value: String(C), tone: 'blue' },
    ],
    lines: [blocks.length ? `Blocked by ${blocks.map((b) => `${b.coalition.join('+')} (gets ${b.gets}, could earn ${b.value})`).join('; ')}.` : 'In the core: no group can do better on its own.'],
  };
}

export function brinkLab(risk: number, y: number): LabOutput {
  const ev = risk * -20 + (1 - risk) * y * 6;
  return {
    stats: [
      { label: 'Expected value of this round', value: fmt(ev, 2), tone: ev > -2 ? 'blue' : 'orange' },
      { label: 'Backing down now', value: '−2', tone: 'orange' },
    ],
    lines: [`Disaster ${pct(risk)} × −20, plus no disaster × ${pct(y)} × 6. ${ev > -2 ? 'This round of risk is worth taking compared with backing down.' : 'Backing down is better than this much risk.'}`],
  };
}
