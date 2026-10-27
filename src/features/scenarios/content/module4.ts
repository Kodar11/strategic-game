import { allPayExpected, alternatingOffers, stoppingValues } from '../../../game/bargaining.ts';
import { AXELROD, type Move, type OpponentStrategy, type Round, cooperateForever, defectAgainstGrim, defectAgainstTitForTat, grimThreshold, opponentMove, stage } from '../../../game/repeated.ts';
import { createRng } from '../../../game/rng.ts';
import { choicePlay, fmt, numberPlay, pct } from '../builders.ts';
import { type ScenarioPlay, type ScenarioSpec, defineScenario } from '../types.ts';

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

const L11: ScenarioSpec[] = [
  defineScenario({
    id: 'l11.a.ultimatum',
    lesson: 'bargaining',
    slot: 'A',
    version: 1,
    title: 'Take it or leave it',
    purpose: 'Compare a split the other side can’t refuse with one they can.',
    setup: 'Two splits of 10 coins with Kavya. In the first, she must take whatever you give (a Dictator Game). In the second, she can reject your offer — and then neither of you gets anything (an Ultimatum Game).',
    speaker: { character: 'kavya', line: 'I have a line I won’t go below. I’ll tell you afterwards.' },
    rules: ['Part 1: you decide how many coins Kavya gets. She can’t refuse.', 'Part 2: you offer a split. Kavya accepts (that split happens) or rejects (both get 0).'],
    formal: {
      players: 'You (proposer) and Kavya (responder).',
      actions: 'You: coins offered 0–10. Kavya (part 2): accept or reject.',
      timing: 'Sequential: offer, then response.',
      information: 'Complete information about the rules.',
      payoffs: 'Money-only model: coins received.',
      opponent: `Kavya (simulated) accepts any part-2 offer of ${KAVYA_MIN} or more — an assumption about this character, not empirical evidence.`,
      ties: 'A money-only responder who gets 0 either way is assumed to accept.',
      solution: 'Money-only backward induction: offer 0 in both parts; the responder accepts.',
      source: 'canonical',
      sourceNote: 'Ultimatum Game (Güth, Schmittberger & Schwarze, 1982) and Dictator Game (Kahneman, Knetsch & Thaler, 1986; Forsythe et al., 1994).',
    },
    predict: {
      question: 'If players care only about money, what does the model predict you offer in part 2?',
      basis: 'calculable',
      modelAnswer: 'The smallest amount (0): a money-only responder accepts anything.',
      options: [
        { id: '0', label: 'The smallest possible amount', verdict: 'match', feedback: 'A responder who only cares about coins prefers something to nothing, so accepts any offer. Knowing that, a money-only proposer offers as little as possible.' },
        { id: '5', label: 'Half — anything less gets rejected', verdict: 'depends', feedback: 'In experiments, low offers often are rejected and many offers are near half. But that comes from people caring about fairness — outside the money-only model the question asks about.' },
        { id: '3', label: 'Around 3', verdict: 'depends', feedback: 'That would be right if you knew the responder rejects below 3 — a fairness preference the money-only model leaves out.' },
      ],
      solve: () => {
        // Money-only responder accepts any offer ≥ 0; the proposer keeps the most at the smallest accepted offer.
        const minAccepted = 0;
        return String(minAccepted);
      },
    },
    play: splitPlay,
    explain: [
      'The money-only model predicts tiny offers and acceptance of anything. Experiments consistently find something else: in many studies the most common ultimatum offers are 40–50% of the pie, and offers below about 20% are often rejected (see Camerer, 2003, for a review).',
      'Dictator-game giving is usually lower than ultimatum offers. The gap suggests part of a generous ultimatum offer is strategic — fear of rejection — rather than pure generosity. Kavya’s threshold here is a stated assumption that stands in for those preferences.',
    ],
    takeaway: 'The power to refuse changes offers. Whether refusal is credible depends on what the responder cares about — money alone, or fairness too.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l11.b.alternating-offers',
    lesson: 'bargaining',
    slot: 'B',
    version: 1,
    title: 'The shrinking deal',
    purpose: 'Rejection no longer ends the game — but every round of delay shrinks the pie.',
    setup: 'You and Kavya are negotiating a joint contract worth 100 if signed today. If you can’t agree, the opportunity shrinks: 60 next round, 30 in the last round, then nothing. You propose first, then Kavya, then you.',
    rules: [
      'Round 1: you propose a split of 100. Kavya accepts or rejects.',
      'Round 2: Kavya proposes a split of 60. You accept or reject.',
      'Round 3: you propose a split of 30. If rejected, both get 0.',
      'A responder who is exactly indifferent accepts.',
    ],
    formal: {
      players: 'You and Kavya.',
      actions: 'Offers in multiples of 5; accept or reject.',
      timing: 'Alternating offers, three rounds.',
      information: 'Complete and perfect information.',
      payoffs: 'Share of the pie in the round of agreement.',
      opponent: 'Kavya plays the subgame-perfect strategy.',
      ties: 'Indifferent responders accept.',
      solution: 'Backward induction: round 3 you keep 30; so in round 2 Kavya must offer you 30; so in round 1 you offer her 30 and keep 70.',
      source: 'adapted',
      sourceNote: 'Finite alternating-offers bargaining (Ståhl, 1972; Rubinstein, 1982 for the infinite version).',
    },
    predict: {
      question: 'What is the smallest round-1 offer Kavya will accept?',
      basis: 'calculable',
      modelAnswer: '30 — what she could get by rejecting.',
      options: [
        { id: '30', label: '30', verdict: 'match', feedback: 'In round 3 you’d offer her 0. So in round 2 she must give you 30 of 60 and keeps 30. Rejecting round 1 is worth 30 to her — so 30 is enough.' },
        { id: '50', label: '50 — an even split', verdict: 'misconception', feedback: 'She’d accept 50, but she’d also accept 30: rejecting only gets her 30 next round.' },
        { id: '60', label: '60 — next round’s pie', verdict: 'misconception', feedback: 'The pie next round is 60, but she has to give you 30 of it to stop you rejecting.' },
      ],
      solve: () => String(OFFERS.minAccept[0]),
    },
    play: offersPlay,
    explain: [
      'Bargaining power comes from what happens if you say no. Here, delay is costly for both, so each side’s alternative is worth less than the current pie — and the first proposer can capture the difference.',
      'Change the delay costs and the split changes: if the pie shrank only slightly each round, the advantage of proposing first would almost disappear.',
    ],
    takeaway: 'In a negotiation with delay, work backwards: what each side would get by waiting decides what they accept today.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l11.c.hold-up',
    lesson: 'bargaining',
    slot: 'C',
    version: 1,
    title: 'The custom tooling',
    purpose: 'An investment made before the negotiation changes who has power in it.',
    setup: 'You supply parts to one buyer. Custom tooling (cost 30) would raise the value of your deal from 50 to 100 — but the tooling is useless for anyone else. Prices are negotiated after you invest, splitting the gains 50/50.',
    rules: [
      'No tooling: the deal is worth 50, split 25/25.',
      'Tooling, then negotiate: the deal is worth 100, split 50/50; you’ve paid 30.',
      'Contract first: before investing, you can sign a contract giving you 65 of the 100. The buyer signs if it gets at least what it would without the contract (25).',
    ],
    formal: {
      players: 'You (supplier) and the buyer.',
      actions: 'Invest and negotiate later, don’t invest, or sign a contract and invest.',
      timing: 'Investment (and any contract) first; price negotiation after.',
      information: 'Complete information.',
      payoffs: 'Your share − investment cost; the buyer’s share.',
      opponent: 'The buyer bargains to an equal split of whatever is on the table, and signs a contract that leaves it at least 25.',
      solution: 'Without a contract, investing nets you 20 < 25, so you don’t invest — the hold-up problem. A contract (35) solves it.',
      source: 'adapted',
      sourceNote: 'The hold-up problem (Williamson, 1985; Grout, 1984). Equal-split bargaining is a stated assumption.',
    },
    predict: {
      question: 'If you invest and negotiate the price afterwards, what is your net payoff?',
      basis: 'calculable',
      modelAnswer: '20: half of 100, minus the 30 you already spent.',
      options: [
        { id: '20', label: '20', verdict: 'match', feedback: 'Once the tooling exists, its cost is sunk and the buyer bargains over the full 100: you get 50, minus 30 spent.' },
        { id: '70', label: '70 — 100 minus my cost', verdict: 'misconception', feedback: 'That assumes you keep the whole gain. After you invest, the buyer can insist on half, because the tooling is worthless elsewhere.' },
        { id: '35', label: '35', verdict: 'misconception', feedback: 'That’s what the contract gives you — but only if you sign it before investing.' },
      ],
      solve: () => String(holdUpOutcome('invest').you),
    },
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
    explain: [
      'After you invest, your cost is sunk and your tooling has no other use — so your outside option is weak and the buyer can capture half of the value you created. Anticipating that, you don’t invest, and a valuable deal is lost.',
      'Contracts, ownership or long-term relationships solve hold-up by fixing terms before the specific investment is made.',
    ],
    takeaway: 'An investment that only pays off with one partner weakens your bargaining position. Agree terms before you invest.',
    skill: 'incentives',
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

const L12: ScenarioSpec[] = [
  defineScenario({
    id: 'l12.a.endurance',
    lesson: 'war-of-attrition',
    slot: 'A',
    version: 1,
    title: 'The endurance contest',
    purpose: 'Costs pile up while you wait. Does what you’ve already paid matter?',
    setup: 'You and Rohan both want the last market stall in a festival (worth 6 to you). Every day you both stay in the queue costs you 1. Each day, Rohan gives up with a 25% chance. After 10 days the organisers split the stall (worth 3).',
    rules: ['Each day you stay costs 1.', 'Each day, Rohan quits with probability 25%. If he quits, you win 6.', 'If nobody quits within 10 days, you get 3.', 'You can quit at the start of any day.'],
    formal: {
      players: 'You and Rohan.',
      actions: 'Each day: stay or quit.',
      timing: 'Up to 10 rounds; costs accrue each round both stay.',
      information: 'You know Rohan’s quit chance (stated). Past costs are visible but sunk.',
      payoffs: '6 if Rohan quits, 3 at the deadline, 0 if you quit; minus 1 per day stayed.',
      opponent: 'Rohan quits each day with probability 0.25, independently.',
      chance: 'Rohan’s daily quit is drawn at random.',
      solution: 'Optimal stopping by backward induction: staying is worth it every day (expected gain 1.5 > cost 1).',
      source: 'adapted',
      sourceNote: 'A discrete war of attrition (Maynard Smith, 1974) against a stated, memoryless opponent.',
    },
    predict: {
      question: 'Is staying in worth it each day, whatever you’ve already paid?',
      basis: 'calculable',
      modelAnswer: 'Yes, every day: 25% × 6 = 1.5 expected gain beats the cost of 1.',
      options: [
        { id: 'yes', label: 'Yes, every day — 25% × 6 beats 1', verdict: 'match', feedback: 'Each day looks the same going forward: a 25% chance at 6 (1.5) for a cost of 1. What you’ve already paid can’t be recovered either way.' },
        { id: 'invested', label: 'Only once I’ve paid a lot — don’t waste it', verdict: 'misconception', feedback: 'Past costs are sunk: they’re gone whether you stay or quit. Only future costs and chances should matter.' },
        { id: 'no', label: 'No — costs keep growing', verdict: 'misconception', feedback: 'Total cost grows, but each new day still offers 1.5 in expected winnings for 1 in cost.' },
      ],
      solve: () => (ENDURANCE_VALUES.stay.every(Boolean) ? 'yes' : 'no'),
    },
    play: stoppingPlay({ maxRounds: ENDURANCE.maxRounds, cost: ENDURANCE.cost, prize: ENDURANCE.prize, endValue: ENDURANCE.split, quitProb: () => ENDURANCE.quit, unit: 'Day', stay: 'Stay in the queue', leave: 'Give up', them: 'Rohan' }),
    explain: [
      'In a war of attrition both sides pay while waiting and each hopes the other quits first. The right question each day is forward-looking: is the chance of winning worth the next day’s cost?',
      'If Rohan were strategic too, the symmetric equilibrium would have each quit at a rate that leaves the other indifferent — here about 1 in 6 per day. Because he quits more often than that, staying pays.',
    ],
    takeaway: 'In a contest of endurance, ignore what you’ve already spent; compare the next round’s cost with your chance of winning.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l12.b.all-pay',
    lesson: 'war-of-attrition',
    slot: 'B',
    version: 1,
    title: 'Everyone pays',
    purpose: 'One sealed effort instead of waiting: you pay what you bid whether you win or lose.',
    setup: 'Two firms compete for a contract worth 10 by preparing proposals. The better-funded proposal wins, but each firm pays its own preparation costs regardless. You choose how much to spend (0–10).',
    rules: ['Highest spending wins 10; a tie splits it (5 each).', 'Both pay what they spent, win or lose.', 'The rival’s spending is a whole number 0–10, each equally likely.'],
    formal: {
      players: 'You and a rival firm.',
      actions: 'Spending 0–10 (whole numbers).',
      timing: 'Simultaneous, one shot (a sealed all-pay auction).',
      information: 'You know the rival’s spending is uniform on 0–10.',
      payoffs: 'Prize (if you win) − your spending.',
      opponent: 'The rival’s spending is drawn uniformly from 0–10.',
      chance: 'The rival’s spending is random.',
      ties: 'Equal spending splits the prize.',
      solution: 'Expected payoff (5 − b)/11 for a bid b: the prize is almost fully dissipated at every bid.',
      source: 'adapted',
      sourceNote: 'All-pay auction (Baye, Kovenock & de Vries, 1996) against a stated random rival; with continuous bids the symmetric equilibrium is uniform spending and zero expected profit.',
    },
    predict: {
      question: 'What is the expected payoff of spending 8?',
      basis: 'calculable',
      modelAnswer: 'About −0.27: you usually win, but you always pay 8.',
      options: [
        { id: 'm027', label: 'About −0.3', verdict: 'match', feedback: 'You win outright 8 times in 11 and tie once: 10 × (8.5 ÷ 11) ≈ 7.7 in expected winnings, minus 8 spent ≈ −0.27.' },
        { id: 'p2', label: '+2 (10 − 8)', verdict: 'misconception', feedback: 'That’s your payoff only if you win. You lose about 1 time in 5 and still pay 8.' },
        { id: '0', label: 'Exactly 0', verdict: 'defensible', feedback: 'Close: in the continuous version every bid averages 0. With whole-number bids, 8 is slightly negative.' },
      ],
      solve: () => (Math.abs(allPayExpected(10, 8, 0, 10) + 0.27) < 0.01 ? 'm027' : 'other'),
    },
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
    explain: [
      'In an all-pay contest, losers pay too. Competition for the prize burns up most of its value: on average, the two firms together spend about as much as the prize is worth.',
      'Unlike the endurance contest, there is no waiting and no information revealed along the way: you commit once. And unlike an ordinary auction, losing isn’t free.',
    ],
    takeaway: 'When everyone pays to compete, the prize gets eaten by the competition. Ask whether the contest is worth entering at all.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l12.c.standoff',
    lesson: 'war-of-attrition',
    slot: 'C',
    version: 1,
    title: 'The strike',
    purpose: 'A standoff where the other side’s pressure grows over time — this week alone looks like a loss.',
    setup: 'You lead a union in a strike for a raise worth 10. Each week of striking costs your members 2. Management is under growing pressure: it concedes in week 1 with chance 10%, week 2 with 20%, and so on. After 8 weeks an arbitrator awards a compromise worth 4.',
    rules: ['Each week you hold out costs 2.', 'Management concedes in week t with probability 10% × t.', 'If no concession by week 8, arbitration gives you 4.', 'You can settle (end the strike, gaining nothing) at the start of any week.'],
    formal: {
      players: 'Your union and management.',
      actions: 'Each week: hold out or settle.',
      timing: 'Up to 8 rounds.',
      information: 'You know management’s weekly concession chances (stated).',
      payoffs: '10 if management concedes, 4 at arbitration, 0 if you settle; minus 2 per week held.',
      opponent: 'Management concedes in week t with probability 0.1t.',
      chance: 'Concessions are drawn at random each week.',
      solution: 'Backward induction: holding out is worth it from week 1 (value 2.67), although week 1 alone has an expected loss of 1.',
      source: 'original',
      sourceNote: 'Designed for this app.',
    },
    predict: {
      question: 'In week 1, holding out costs 2 for a 10% chance at 10. Should you hold out?',
      basis: 'calculable',
      modelAnswer: 'Yes: their chance of conceding rises each week, so holding out from the start is worth about 2.7.',
      options: [
        { id: 'yes', label: 'Yes — their pressure rises every week', verdict: 'match', feedback: 'Week 1 on its own is a loss (−1), but staying in buys access to later weeks when concession is likely. Counting those, holding out is worth about 2.7.' },
        { id: 'no', label: 'No — this week is a losing bet', verdict: 'defensible', feedback: 'True for week 1 alone. But the value of persisting includes the weeks after, when the chances of a concession are much higher.' },
        { id: 'sunk', label: 'Only if we’ve already struck for a while', verdict: 'misconception', feedback: 'Weeks already struck are sunk. What matters is the pattern of future costs and concession chances.' },
      ],
      solve: () => (STANDOFF_VALUES.value[0] > 0 ? 'yes' : 'no'),
    },
    play: stoppingPlay({ maxRounds: STANDOFF.maxRounds, cost: STANDOFF.cost, prize: STANDOFF.prize, endValue: STANDOFF.arbitration, quitProb: STANDOFF.concede, unit: 'Week', stay: 'Hold out', leave: 'Settle now', them: 'Management' }),
    explain: [
      'A myopic look at week 1 says “settle”. A forward-looking one compares the whole remaining path: costs of 2 a week against concession chances that rise to 80%.',
      'Unlike the endurance contest, each week here is different. And unlike brinkmanship (Lesson 21), nobody deliberately raises the risk: you are simply waiting out the other side.',
    ],
    takeaway: 'The value of persistence includes the future. When the other side’s pressure is rising, an early loss can be worth taking.',
    skill: 'uncertainty',
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

const L13: ScenarioSpec[] = [
  defineScenario({
    id: 'l13.a.repeated-trust',
    lesson: 'repeated-cooperation',
    slot: 'A',
    version: 1,
    title: 'The monthly order',
    purpose: 'The Prisoner’s Dilemma again — but now the relationship might continue.',
    setup: 'You supply a café every month. Each month you each choose: deliver good quality / pay on time (cooperate), or cut corners (defect). After each month there’s an 80% chance the relationship continues.',
    rules: [
      'Both cooperate: 3 each. Both defect: 1 each.',
      'You defect while they cooperate: you 5, they 0 (and the reverse).',
      'After each round, another round follows with probability 80% (at most 20 shown).',
    ],
    formal: {
      players: 'You and the café owner.',
      actions: 'Each round: cooperate or defect.',
      timing: 'Repeated simultaneous moves; continuation probability δ = 0.8.',
      information: 'Both see all previous rounds. The number of rounds is not known in advance.',
      payoffs: 'Stage payoffs T = 5, R = 3, P = 1, S = 0, summed over rounds.',
      opponent: 'The café owner plays tit-for-tat: cooperates first, then copies your last move (revealed afterwards).',
      chance: 'Continuation is drawn after each round.',
      solution: 'Against tit-for-tat at δ = 0.8, always cooperating is worth 15 in expectation; always defecting 9.',
      source: 'canonical',
      sourceNote: 'Repeated Prisoner’s Dilemma with Axelrod’s (1984) payoffs and tit-for-tat.',
    },
    predict: {
      question: 'Against a partner who copies your last move, which plan earns more on average?',
      basis: 'calculable',
      modelAnswer: 'Keep cooperating: expected 15 vs 9 for always defecting.',
      options: [
        { id: 'cooperate', label: 'Keep cooperating', verdict: 'match', feedback: 'Cooperating forever: 3 per round, expected 3 ÷ 0.2 = 15. Defecting forever: 5 once, then 1 per round — expected 5 + 0.8 × 1 ÷ 0.2 = 9.' },
        { id: 'defect', label: 'Defect — 5 beats 3', verdict: 'misconception', feedback: '5 beats 3 once. After that the partner defects too, and you’re stuck at 1 per round while the relationship lasts.' },
        { id: 'last', label: 'Cooperate, then defect in the last round', verdict: 'defensible', feedback: 'That would pay if you knew which round was last. Here nobody does: there’s always an 80% chance of another.' },
      ],
      solve: () => (cooperateForever(AXELROD, 0.8) > defectAgainstTitForTat(AXELROD, 0.8) ? 'cooperate' : 'defect'),
    },
    play: repeatedPlay({ delta: 0.8, strategy: 'tit-for-tat', cooperate: 'Cooperate', defect: 'Cut corners', partner: 'The café' }),
    explain: [
      'In a one-shot Prisoner’s Dilemma defection dominates. Repetition changes that only through the future: defecting today costs you the cooperation you would have had tomorrow.',
      'Repetition alone doesn’t guarantee cooperation. It needs a partner whose future behaviour responds to yours, and a future that is likely enough to matter.',
    ],
    takeaway: 'Ongoing relationships can make cooperation pay — when today’s choices change tomorrow’s, and tomorrow is likely enough.',
    skill: 'incentives',
  }),
  defineScenario({
    id: 'l13.b.grim-trigger',
    lesson: 'repeated-cooperation',
    slot: 'B',
    version: 1,
    title: 'One strike and you’re out',
    purpose: 'A harsher partner and a less certain future: does the deal still hold?',
    setup: 'A new business partner follows a strict rule: they cooperate until the first time you defect, then defect forever. After each round there’s a 60% chance of another.',
    rules: ['Same payoffs: 3–3, 1–1, 5–0, 0–5.', 'Your partner cooperates until you defect once; then always defects.', 'After each round, another follows with probability 60%.'],
    formal: {
      players: 'You and your partner.',
      actions: 'Cooperate or defect each round.',
      timing: 'Repeated; continuation probability δ = 0.6.',
      information: 'Your partner sees each defection immediately.',
      payoffs: 'T = 5, R = 3, P = 1, S = 0.',
      opponent: 'Grim trigger: cooperate until you defect once, then defect forever.',
      chance: 'Continuation drawn after each round.',
      solution: 'Cooperation is sustainable iff δ ≥ (T − R)/(T − P) = 0.5. At 0.6: cooperate 7.5 vs defect 6.5.',
      source: 'canonical',
      sourceNote: 'Grim trigger and the folk-theorem threshold (Friedman, 1971).',
    },
    predict: {
      question: 'With a 60% chance of another round, does defecting pay against this partner?',
      basis: 'calculable',
      modelAnswer: 'No: cooperating forever is worth 7.5; defecting now, 6.5.',
      options: [
        { id: 'no', label: 'No — the future punishment outweighs the gain', verdict: 'match', feedback: 'Cooperating: 3 ÷ (1 − 0.6) = 7.5. Defecting: 5 now, then 1 per round: 5 + 0.6 × 1 ÷ 0.4 = 6.5. The threshold is 50%; 60% clears it.' },
        { id: 'yes', label: 'Yes — 5 now is worth more', verdict: 'misconception', feedback: 'The gain is 2 once. The loss is 2 per round for as long as the relationship continues — 1.5 rounds on average after this one.' },
        { id: 'unsure', label: 'It depends on how many rounds there will be', verdict: 'defensible', feedback: 'The number of rounds isn’t known, but its expected effect is: with δ = 0.6, the future is worth enough.' },
      ],
      solve: () => (cooperateForever(AXELROD, 0.6) > defectAgainstGrim(AXELROD, 0.6) ? 'no' : 'yes'),
    },
    play: repeatedPlay({ delta: 0.6, strategy: 'grim', cooperate: 'Cooperate', defect: 'Defect', partner: 'Your partner' }),
    explain: [
      `Grim trigger sustains cooperation if the continuation probability is at least (T − R) ÷ (T − P) = ${fmt(grimThreshold(AXELROD))}. Below that, the future is too uncertain to outweigh one round of temptation.`,
      'Grim trigger is costly for the punisher too: after a defection your partner earns 1 per round instead of 3. Both would gain by forgiving — but if a punishment can be renegotiated away, it stops deterring.',
    ],
    takeaway: 'A threat of future punishment works if the future is likely enough — and if the punisher will actually carry it out.',
    skill: 'incentives',
  }),
  defineScenario({
    id: 'l13.c.cheating-detection',
    lesson: 'repeated-cooperation',
    slot: 'C',
    version: 1,
    title: 'The slow audit',
    purpose: 'Same deal, different context — but cheating is only discovered two rounds late.',
    setup: 'Two airlines on one route have an informal understanding not to undercut fares. Each quarter, each can keep fares (cooperate) or undercut (defect). Your rival punishes undercutting forever — but only discovers it two quarters after it happens. After each quarter, there’s a 70% chance of another.',
    rules: ['Same payoffs: 3–3, 1–1, 5–0, 0–5.', 'Your rival cooperates until it discovers a defection; it discovers each one 2 rounds late.', 'Another round follows with probability 70%.'],
    formal: {
      players: 'You and the rival airline.',
      actions: 'Keep fares or undercut, each quarter.',
      timing: 'Repeated; δ = 0.7.',
      information: 'Imperfect monitoring with delay: defections are observed 2 rounds after they happen.',
      payoffs: 'T = 5, R = 3, P = 1, S = 0.',
      opponent: 'Delayed grim trigger: defects forever once it has discovered a defection.',
      chance: 'Continuation drawn after each round.',
      solution: 'Cooperating: 10. Undercutting from now on: 5 for 3 undetected rounds, then 1 — about 12.1. Cheating pays.',
      source: 'adapted',
      sourceNote: 'Collusion with detection lags (cf. Stigler, 1964; Green & Porter, 1984); numbers are this app’s.',
    },
    predict: {
      question: 'With a two-round detection delay, does undercutting pay?',
      basis: 'calculable',
      modelAnswer: 'Yes: about 12.1 from undercutting vs 10 from cooperating.',
      options: [
        { id: 'yes', label: 'Yes — I get three rounds of 5 before they react', verdict: 'match', feedback: '5 × (1 + 0.7 + 0.49) + 0.7³ × 1 ÷ 0.3 ≈ 12.1, against 3 ÷ 0.3 = 10 for cooperating. With immediate detection, undercutting would be worth only about 7.3.' },
        { id: 'no', label: 'No — they punish forever', verdict: 'misconception', feedback: 'Forever, yes — but the punishment starts late, and the delay hands you extra rounds of temptation payoffs.' },
        { id: 'same', label: 'The delay doesn’t matter', verdict: 'misconception', feedback: 'It’s decisive: with no delay, cooperating (10) beats undercutting (≈7.3); with a 2-round delay, undercutting wins.' },
      ],
      solve: () => (defectAgainstGrim(AXELROD, 0.7, 2) > cooperateForever(AXELROD, 0.7) ? 'yes' : 'no'),
    },
    play: repeatedPlay({ delta: 0.7, strategy: 'grim-delayed', delay: 2, cooperate: 'Keep fares', defect: 'Undercut', partner: 'The rival' }),
    explain: [
      'Punishment deters only as fast as it arrives. A detection lag hands the cheater several rounds of gains before retaliation, which can tip the comparison.',
      'That’s why agreements that rely on future punishment invest in monitoring — and why they break down when cheating is hard to see.',
    ],
    takeaway: 'Cooperation sustained by the future depends on how quickly cheating is seen. Slow detection weakens even harsh punishments.',
    skill: 'incentives',
  }),
];

export const MODULE4_SCENARIOS: ScenarioSpec[] = [...L11, ...L12, ...L13];
