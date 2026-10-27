import { allPayExpected, alternatingOffers, stoppingValues } from '../../../game/bargaining.ts';
import { AXELROD, type Move, type OpponentStrategy, type Round, cooperateForever, defectAgainstGrim, defectAgainstTitForTat, opponentMove, stage } from '../../../game/repeated.ts';
import { createRng } from '../../../game/rng.ts';
import { choicePlay, fmt, numberPlay, pct } from '../builders.ts';
import { type ScenarioPlay, type ScenarioEngine, defineEngine } from '../types.ts';

// ── Lesson 11 · Bargaining and Fairness ──────────────────────────────────────

/** The simulated responder’s acceptance threshold — a stated assumption about this character, not a prediction. */
export const KAVYA_MIN = 3;

interface SplitState {
  dictator: number | null;
  ultimatum: number | null;
}

const splitPlay: ScenarioPlay<SplitState> = {
  init: () => ({ dictator: null, ultimatum: null }),
  prompt: (s) =>
    s.dictator === null
      ? { kind: 'number', prompt: 'Part 1 · How many of 10 coins do you give Kavya? She can’t refuse.', min: 0, max: 10, step: 1, initial: 5, unit: 'coins', cta: 'Give' }
      : s.ultimatum === null
        ? { kind: 'number', prompt: 'Part 2 · A new 10 coins. How many do you offer? If Kavya rejects, you both get 0.', min: 0, max: 10, step: 1, initial: 5, unit: 'coins', cta: 'Offer' }
        : null,
  apply: (s, input) => {
    if (typeof input !== 'number' || !Number.isInteger(input) || input < 0 || input > 10) throw new Error('Illegal offer');
    if (s.dictator === null) return { ...s, dictator: input };
    if (s.ultimatum === null) return { ...s, ultimatum: input };
    throw new Error('Game over');
  },
  log: (s) => (s.dictator !== null ? [`Part 1: you gave ${s.dictator}, kept ${10 - s.dictator}.`] : []),
  result: (s) => {
    const accepted = s.ultimatum! >= KAVYA_MIN;
    const you2 = accepted ? 10 - s.ultimatum! : 0;
    return {
      headline: accepted ? `Kavya accepted your offer of ${s.ultimatum}.` : `Kavya rejected ${s.ultimatum}. Neither of you gets anything in part 2.`,
      stats: [
        { label: 'You (both parts)', value: String(10 - s.dictator! + you2), tone: 'blue' },
        { label: 'Kavya (both parts)', value: String(s.dictator! + (accepted ? s.ultimatum! : 0)), tone: 'orange' },
      ],
      lines: [
        `Kavya’s rule (now revealed — a stated assumption about this character): accept ${KAVYA_MIN} or more, reject anything less.`,
        'A purely money-motivated responder would accept any offer, so the money-only prediction is to offer 0 (or the smallest unit).',
        s.dictator! > 0 ? `In part 1 you gave ${s.dictator} although Kavya had no way to refuse — any gift there reflects your own preferences, not bargaining power.` : 'In part 1 you kept everything, as a money-only model predicts.',
      ],
    };
  },
};

interface OffersState {
  r1: number | null;
  r2: 'accept' | 'reject' | null;
  r3: number | null;
}
export const PIES = [100, 60, 30];
const OFFERS = alternatingOffers(PIES);

const offersPlay: ScenarioPlay<OffersState> = {
  init: () => ({ r1: null, r2: null, r3: null }),
  prompt: (s) => {
    if (s.r1 === null) return { kind: 'number', prompt: 'Round 1 (pie 100): how much do you offer Kavya?', min: 0, max: 100, step: 5, initial: 50, cta: 'Offer' };
    if (s.r1 >= OFFERS.minAccept[0]) return null;
    if (s.r2 === null)
      return { kind: 'choice', prompt: `Kavya rejected. Round 2 (pie ${PIES[1]}): she offers you ${OFFERS.minAccept[1]} and keeps ${PIES[1] - OFFERS.minAccept[1]}.`, options: [{ id: 'accept', label: `Accept ${OFFERS.minAccept[1]}` }, { id: 'reject', label: 'Reject and propose again' }] };
    if (s.r2 === 'accept') return null;
    if (s.r3 === null) return { kind: 'number', prompt: `Round 3 (pie ${PIES[2]}, the last): how much do you offer Kavya?`, min: 0, max: PIES[2], step: 5, initial: 10, cta: 'Offer' };
    return null;
  },
  apply: (s, input) => {
    if (s.r1 === null) {
      if (typeof input !== 'number' || input < 0 || input > 100 || input % 5) throw new Error('Illegal offer');
      return { ...s, r1: input };
    }
    if (s.r2 === null) {
      if (input !== 'accept' && input !== 'reject') throw new Error('Illegal response');
      return { ...s, r2: input };
    }
    if (typeof input !== 'number' || input < 0 || input > PIES[2] || input % 5) throw new Error('Illegal offer');
    return { ...s, r3: input };
  },
  log: (s) => [
    ...(s.r1 !== null ? [`Round 1: you offered ${s.r1} of 100 — ${s.r1 >= OFFERS.minAccept[0] ? 'accepted' : 'rejected'}.`] : []),
    ...(s.r2 ? [`Round 2: Kavya offered you ${OFFERS.minAccept[1]} of 60 — you ${s.r2 === 'accept' ? 'accepted' : 'rejected'}.`] : []),
  ],
  result: (s) => {
    let you = 0;
    let her = 0;
    let when = '';
    if (s.r1! >= OFFERS.minAccept[0]) [you, her, when] = [100 - s.r1!, s.r1!, 'round 1'];
    else if (s.r2 === 'accept') [you, her, when] = [OFFERS.minAccept[1], PIES[1] - OFFERS.minAccept[1], 'round 2'];
    else [you, her, when] = [PIES[2] - s.r3!, s.r3!, 'round 3'];
    return {
      headline: `Deal in ${when}: you ${you}, Kavya ${her}.`,
      stats: [
        { label: 'You', value: String(you), tone: 'blue' },
        { label: 'Kavya', value: String(her), tone: 'orange' },
        { label: 'Lost to delay', value: String(100 - you - her), tone: 'amber' },
      ],
      lines: [
        `Kavya’s rule: the subgame-perfect one — accept any offer at least what she would get by waiting (${OFFERS.minAccept.join(', ')} in rounds 1–3), and offer you exactly your minimum in round 2.`,
        `The backward-induction deal is immediate: offer ${OFFERS.minAccept[0]} in round 1 and keep ${OFFERS.keep}.`,
      ],
    };
  },
};

export const HOLD_UP = { investCost: 30, valueWith: 100, valueWithout: 50, contractShare: 65 };
export function holdUpOutcome(choice: 'invest' | 'no-invest' | 'contract'): { you: number; buyer: number } {
  if (choice === 'no-invest') return { you: HOLD_UP.valueWithout / 2, buyer: HOLD_UP.valueWithout / 2 };
  if (choice === 'invest') return { you: HOLD_UP.valueWith / 2 - HOLD_UP.investCost, buyer: HOLD_UP.valueWith / 2 };
  return { you: HOLD_UP.contractShare - HOLD_UP.investCost, buyer: HOLD_UP.valueWith - HOLD_UP.contractShare };
}

const L11: ScenarioEngine[] = [
  defineEngine({
    id: 'l11.a.ultimatum',
    version: 1,
    play: splitPlay,
    solve: () => {
      // Money-only responder accepts any offer ≥ 0; the proposer keeps the most at the smallest accepted offer.
      const minAccepted = 0;
      return String(minAccepted);
    },
  }),
  defineEngine({
    id: 'l11.b.alternating-offers',
    version: 1,
    play: offersPlay,
    solve: () => String(OFFERS.minAccept[0]),
  }),
  defineEngine({
    id: 'l11.c.hold-up',
    version: 1,
    play: choicePlay(
      {
        kind: 'choice',
        prompt: 'What do you do?',
        options: [
          { id: 'invest', label: 'Invest, then negotiate the price' },
          { id: 'no-invest', label: 'Don’t invest' },
          { id: 'contract', label: 'Sign a contract (65 for me), then invest' },
        ],
      },
      (choice) => {
        const o = holdUpOutcome(choice as 'invest' | 'no-invest' | 'contract');
        return {
          headline: choice === 'invest' ? 'You invested; the buyer negotiated half of the 100.' : choice === 'no-invest' ? 'No investment: the 50 deal is split evenly.' : 'Contract signed, tooling built.',
          stats: [
            { label: 'You (net)', value: String(o.you), tone: 'blue' },
            { label: 'Buyer', value: String(o.buyer), tone: 'orange' },
            { label: 'Total value', value: String(o.you + o.buyer) },
          ],
          lines: [
            `Net payoffs — invest then negotiate: ${holdUpOutcome('invest').you}; don’t invest: ${holdUpOutcome('no-invest').you}; contract: ${holdUpOutcome('contract').you}.`,
            'Investing creates 20 of extra value (100 − 30 vs 50), but without protection you capture too little of it to make it worth your while.',
          ],
        };
      },
    ),
    solve: () => String(holdUpOutcome('invest').you),
  }),
];

// ── Lesson 12 · The Cost of Waiting ──────────────────────────────────────────

export const ENDURANCE = { cost: 1, prize: 6, quit: 0.25, maxRounds: 10, split: 3 };
export const ENDURANCE_VALUES = stoppingValues({ cost: ENDURANCE.cost, prize: ENDURANCE.prize, quitProb: () => ENDURANCE.quit, maxRounds: ENDURANCE.maxRounds, endValue: ENDURANCE.split });

interface StopState {
  seed: number;
  rounds: number;
  /** null while still going. */
  end: null | 'you-quit' | 'they-quit' | 'timeout';
}

function stoppingPlay(o: {
  maxRounds: number;
  cost: number;
  prize: number;
  endValue: number;
  quitProb: (round: number) => number;
  unit: string;
  stay: string;
  leave: string;
  them: string;
}): ScenarioPlay<StopState> {
  return {
    init: (seed) => ({ seed, rounds: 0, end: null }),
    prompt: (s) =>
      s.end
        ? null
        : {
            kind: 'choice',
            prompt: `${o.unit} ${s.rounds + 1} of ${o.maxRounds}. You’ve paid ${s.rounds * o.cost} so far.`,
            options: [
              { id: 'stay', label: o.stay, description: `Costs ${o.cost} this ${o.unit.toLowerCase()}` },
              { id: 'quit', label: o.leave },
            ],
          },
    apply: (s, input) => {
      if (s.end || (input !== 'stay' && input !== 'quit')) throw new Error('Illegal move');
      if (input === 'quit') return { ...s, end: 'you-quit' };
      const round = s.rounds + 1;
      const theyQuit = createRng(s.seed + round * 7919)() < o.quitProb(round);
      return { ...s, rounds: round, end: theyQuit ? 'they-quit' : round >= o.maxRounds ? 'timeout' : null };
    },
    log: (s) => Array.from({ length: s.rounds }, (_, i) => `${o.unit} ${i + 1}: both stayed in${s.end === 'they-quit' && i === s.rounds - 1 ? ` — then ${o.them} gave up` : ''}.`),
    result: (s) => {
      const paid = s.rounds * o.cost;
      const gain = s.end === 'they-quit' ? o.prize : s.end === 'timeout' ? o.endValue : 0;
      const values = stoppingValues({ cost: o.cost, prize: o.prize, quitProb: o.quitProb, maxRounds: o.maxRounds, endValue: o.endValue });
      return {
        headline: s.end === 'they-quit' ? `${o.them} gave up in ${o.unit.toLowerCase()} ${s.rounds}. You win ${o.prize}.` : s.end === 'timeout' ? `Nobody gave up. The result is a split worth ${o.endValue} to you.` : `You stopped after ${s.rounds} ${o.unit.toLowerCase()}${s.rounds === 1 ? '' : 's'}.`,
        stats: [
          { label: 'Won', value: String(gain), tone: 'blue' },
          { label: 'Paid', value: String(paid), tone: 'orange' },
          { label: 'Net', value: fmt(gain - paid), tone: 'amber' },
        ],
        lines: [
          `Value of staying in, looking forward from each ${o.unit.toLowerCase()} (sunk costs excluded): ${values.value.map((v) => fmt(v, 2)).join(', ')}.`,
          values.stay.every(Boolean) ? 'Staying in was worth it at every point, whatever you had already paid.' : 'Staying in was not always worth it.',
        ],
      };
    },
  };
}

export const STANDOFF = { cost: 2, prize: 10, maxRounds: 8, arbitration: 4, concede: (t: number) => 0.1 * t };
export const STANDOFF_VALUES = stoppingValues({ cost: STANDOFF.cost, prize: STANDOFF.prize, quitProb: STANDOFF.concede, maxRounds: STANDOFF.maxRounds, endValue: STANDOFF.arbitration });

const L12: ScenarioEngine[] = [
  defineEngine({
    id: 'l12.a.endurance',
    version: 1,
    play: stoppingPlay({ maxRounds: ENDURANCE.maxRounds, cost: ENDURANCE.cost, prize: ENDURANCE.prize, endValue: ENDURANCE.split, quitProb: () => ENDURANCE.quit, unit: 'Day', stay: 'Stay in the queue', leave: 'Give up', them: 'Rohan' }),
    solve: () => (ENDURANCE_VALUES.stay.every(Boolean) ? 'yes' : 'no'),
  }),
  defineEngine({
    id: 'l12.b.all-pay',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'How much do you spend on the proposal?', min: 0, max: 10, step: 1, initial: 5, cta: 'Submit' }, (b, rng) => {
      const r = Math.floor(rng() * 11);
      const won = b > r ? 10 : b === r ? 5 : 0;
      return {
        headline: b > r ? `You won: you spent ${b}, the rival ${r}.` : b === r ? `A tie at ${b}: you split the contract.` : `You lost: the rival spent ${r}.`,
        stats: [
          { label: 'Your payoff', value: fmt(won - b), tone: 'blue' },
          { label: 'Rival’s payoff', value: fmt((b < r ? 10 : b === r ? 5 : 0) - r), tone: 'orange' },
          { label: 'Expected for your bid', value: fmt(allPayExpected(10, b, 0, 10), 2), tone: 'amber' },
        ],
        lines: [`Expected payoffs: spend 0 → ${fmt(allPayExpected(10, 0, 0, 10), 2)}, 5 → ${fmt(allPayExpected(10, 5, 0, 10), 2)}, 10 → ${fmt(allPayExpected(10, 10, 0, 10), 2)}.`, `Total spent by both: ${b + r} for a prize of 10.`],
      };
    }),
    solve: () => (Math.abs(allPayExpected(10, 8, 0, 10) + 0.27) < 0.01 ? 'm027' : 'other'),
  }),
  defineEngine({
    id: 'l12.c.standoff',
    version: 1,
    play: stoppingPlay({ maxRounds: STANDOFF.maxRounds, cost: STANDOFF.cost, prize: STANDOFF.prize, endValue: STANDOFF.arbitration, quitProb: STANDOFF.concede, unit: 'Week', stay: 'Hold out', leave: 'Settle now', them: 'Management' }),
    solve: () => (STANDOFF_VALUES.value[0] > 0 ? 'yes' : 'no'),
  }),
];

// ── Lesson 13 · Cooperation Over Time ────────────────────────────────────────

export const MAX_ROUNDS = 20;

/** Number of rounds played: after each round, another follows with probability δ (capped for the screen). */
export function roundsFor(seed: number, delta: number): number {
  const rng = createRng(seed);
  let n = 1;
  while (n < MAX_ROUNDS && rng() < delta) n++;
  return n;
}

interface RepeatState {
  seed: number;
  total: number;
  rounds: Round[];
}

function repeatedPlay(o: { delta: number; strategy: OpponentStrategy; delay?: number; cooperate: string; defect: string; partner: string }): ScenarioPlay<RepeatState> {
  return {
    init: (seed) => ({ seed, total: roundsFor(seed, o.delta), rounds: [] }),
    prompt: (s) =>
      s.rounds.length >= s.total
        ? null
        : {
            kind: 'choice',
            prompt: `Round ${s.rounds.length + 1}. (After each round, there’s a ${pct(o.delta)} chance of another.)`,
            options: [
              { id: 'C', label: o.cooperate },
              { id: 'D', label: o.defect },
            ],
          },
    apply: (s, input) => {
      if (s.rounds.length >= s.total || (input !== 'C' && input !== 'D')) throw new Error('Illegal move');
      const them = opponentMove(o.strategy, s.rounds, o.delay);
      return { ...s, rounds: [...s.rounds, { you: input as Move, them }] };
    },
    log: (s) =>
      s.rounds.map((r, i) => {
        const [a, b] = stage(AXELROD, r.you, r.them);
        const partner = o.partner.charAt(0).toLowerCase() + o.partner.slice(1);
        return `Round ${i + 1}: you chose “${r.you === 'C' ? o.cooperate : o.defect}”, ${partner} ${r.them === 'C' ? 'cooperated' : 'defected'} (${a}–${b})`;
      }),
    result: (s) => {
      const totals = s.rounds.reduce((acc, r) => {
        const [a, b] = stage(AXELROD, r.you, r.them);
        return [acc[0] + a, acc[1] + b];
      }, [0, 0]);
      const coopAll = s.total * AXELROD.R;
      return {
        headline: `The relationship lasted ${s.total} round${s.total === 1 ? '' : 's'}. You earned ${totals[0]}, ${o.partner} ${totals[1]}.`,
        stats: [
          { label: 'You', value: String(totals[0]), tone: 'blue' },
          { label: o.partner, value: String(totals[1]), tone: 'orange' },
          { label: 'If both always cooperated', value: String(coopAll), tone: 'amber' },
        ],
        lines: [`You couldn’t know in advance how many rounds there would be: each one continued with probability ${pct(o.delta)}.`],
      };
    },
  };
}

const L13: ScenarioEngine[] = [
  defineEngine({
    id: 'l13.a.repeated-trust',
    version: 1,
    play: repeatedPlay({ delta: 0.8, strategy: 'tit-for-tat', cooperate: 'Cooperate', defect: 'Cut corners', partner: 'The café' }),
    solve: () => (cooperateForever(AXELROD, 0.8) > defectAgainstTitForTat(AXELROD, 0.8) ? 'cooperate' : 'defect'),
  }),
  defineEngine({
    id: 'l13.b.grim-trigger',
    version: 1,
    play: repeatedPlay({ delta: 0.6, strategy: 'grim', cooperate: 'Cooperate', defect: 'Defect', partner: 'Your partner' }),
    solve: () => (cooperateForever(AXELROD, 0.6) > defectAgainstGrim(AXELROD, 0.6) ? 'no' : 'yes'),
  }),
  defineEngine({
    id: 'l13.c.cheating-detection',
    version: 1,
    play: repeatedPlay({ delta: 0.7, strategy: 'grim-delayed', delay: 2, cooperate: 'Keep fares', defect: 'Undercut', partner: 'The rival' }),
    solve: () => (defectAgainstGrim(AXELROD, 0.7, 2) > cooperateForever(AXELROD, 0.7) ? 'yes' : 'no'),
  }),
];

export const MODULE4_ENGINES: ScenarioEngine[] = [...L11, ...L12, ...L13];
