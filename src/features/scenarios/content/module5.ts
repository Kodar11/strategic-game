import { bestBids, expectedProfit, runAuction } from '../../../game/auctions.ts';
import { averageWage, cascadePosterior, expected, lemonsMarket, posterior, poolingHolds, separatingHolds, valueWithSignal } from '../../../game/information.ts';
import { type MatrixGame, iteratedStrictDominance, rowsEverBestResponse, strictlyDominatedRows } from '../../../game/payoff-matrix.ts';
import { createRng } from '../../../game/rng.ts';
import { choicePlay, fmt, matrixPlay, numberPlay, pct } from '../builders.ts';
import { type ScenarioPlay, type ScenarioSpec, defineScenario } from '../types.ts';

// ── Lesson 14 · Reasoning from Beliefs ───────────────────────────────────────

export const GUESSERS = [50, 33, 22, 15];
export const GUESS_PRIZE = 10;

/** Two-thirds of the average of all guesses; closest wins, exact ties split the prize. */
export function twoThirdsRound(guesses: readonly number[]): { target: number; payoffs: number[] } {
  const target = ((2 / 3) * guesses.reduce((s, g) => s + g, 0)) / guesses.length;
  const d = guesses.map((g) => Math.abs(g - target));
  const best = Math.min(...d);
  const winners = d.filter((x) => Math.abs(x - best) < 1e-9).length;
  return { target, payoffs: d.map((x) => (Math.abs(x - best) < 1e-9 ? GUESS_PRIZE / winners : 0)) };
}

/** Whole-number guesses k such that "everyone guesses k" is a Nash equilibrium for n players. */
export function symmetricTwoThirdsEquilibria(n: number, max = 100): number[] {
  const out: number[] = [];
  for (let k = 0; k <= max; k++) {
    let stable = true;
    for (let d = 0; d <= max && stable; d++) {
      if (d === k) continue;
      const { payoffs } = twoThirdsRound([d, ...Array(n - 1).fill(k)]);
      if (payoffs[0] > GUESS_PRIZE / n + 1e-9) stable = false;
    }
    if (stable) out.push(k);
  }
  return out;
}

/** Row B is never a best response, though neither T nor M dominates it. Learner plays the column. */
export const NEVER_BEST: MatrixGame = {
  rows: ['T', 'M', 'B'],
  cols: ['L', 'R'],
  payoffs: [
    [
      [3, 2],
      [0, 1],
    ],
    [
      [0, 2],
      [3, 1],
    ],
    [
      [1, 0],
      [1, 4],
    ],
  ],
};

export const REQUEST_BELIEFS: Record<number, number> = { 20: 0.3, 19: 0.4, 18: 0.3 };
export function requestValue(r: number): number {
  return r + 20 * (REQUEST_BELIEFS[r + 1] ?? 0);
}

const L14: ScenarioSpec[] = [
  defineScenario({
    id: 'l14.a.two-thirds',
    lesson: 'strategy-detective',
    slot: 'A',
    version: 1,
    title: 'Two-thirds of the average, five players',
    purpose: 'A smaller crowd with stated rules: reason about what four others will pick.',
    setup: 'You and four simulated players each pick a whole number from 0 to 100. The winner is whoever is closest to two-thirds of the average of all five numbers (yours included).',
    rules: ['Allowed guesses: whole numbers 0–100.', 'Target = ⅔ × the average of all five guesses.', 'Closest to the target wins 10 points; exact ties split the 10.', 'The four others think 0, 1, 2 and 3 steps ahead (revealed afterwards).'],
    formal: {
      players: 'You and four simulated players.',
      actions: 'A whole number 0–100.',
      timing: 'Simultaneous, one shot.',
      information: 'Everyone knows the rules; you don’t know the others’ numbers.',
      payoffs: '10 to the closest guess; ties split equally.',
      opponent: 'Level-k players anchored on 50: they guess 50, 33, 22 and 15.',
      ties: 'Exact ties split the prize.',
      solution: 'Iterated reasoning pushes guesses down; with whole numbers, “everyone guesses 0” and “everyone guesses 1” are the only symmetric equilibria. Against these players, about 18 is best.',
      source: 'adapted',
      sourceNote: 'The p-beauty contest (Moulin, 1986; Nagel, 1995) with p = ⅔ and five players; the level-k crowd is this app’s.',
    },
    predict: {
      question: 'If every player were fully rational, and everyone knew it, which “everyone guesses the same” outcomes would be stable?',
      basis: 'calculable',
      modelAnswer: 'Everyone at 0, or everyone at 1 (with whole numbers).',
      options: [
        { id: '0-1', label: 'Everyone at 0 or everyone at 1', verdict: 'match', feedback: 'At any common guess above 1, guessing a little lower gets closer to ⅔ of the average. At 1, moving to 0 overshoots: the target is only about 0.53, and 1 is closer. So 0 and 1 both survive.' },
        { id: '0', label: 'Only everyone at 0', verdict: 'defensible', feedback: 'That’s the answer with any real number allowed. With whole numbers only, “everyone at 1” is stable too: a lone 0 would land further from the target.' },
        { id: '33', label: 'Everyone at 33', verdict: 'misconception', feedback: '33 is a good guess if others pick about 50. If everyone picks 33, the target is 22.' },
      ],
      solve: () => symmetricTwoThirdsEquilibria(5).join('-'),
    },
    play: numberPlay({ kind: 'number', prompt: 'Your number', min: 0, max: 100, step: 1, initial: 33, cta: 'Submit my number' }, (g) => {
      const { target, payoffs } = twoThirdsRound([g, ...GUESSERS]);
      const best = ((2 / 3) * GUESSERS.reduce((s, x) => s + x, 0)) / (5 - 2 / 3);
      return {
        headline: `Target ${fmt(target, 2)}. ${payoffs[0] > 0 ? (payoffs[0] < GUESS_PRIZE ? 'You tied for the win.' : 'You won.') : 'Someone else was closer.'}`,
        stats: [
          { label: 'Your points', value: fmt(payoffs[0]), tone: 'blue' },
          { label: 'Target', value: fmt(target, 2), tone: 'amber' },
          { label: 'Your distance', value: fmt(Math.abs(g - target), 2) },
        ],
        lines: [`The others (now revealed): ${GUESSERS.join(', ')} — thinking 0, 1, 2 and 3 steps ahead of an instinctive 50.`, `Against exactly these guesses, a guess of about ${fmt(best, 1)} would have hit the target.`],
      };
    }),
    explain: [
      'Each step of “they’ll think that I’ll think…” multiplies the guess by ⅔. If everyone took every step, the guesses would collapse to the bottom of the range. Real people stop after a step or two, so the best guess depends on how far you expect others to go.',
      'This is reasoning from beliefs: the winning number isn’t fixed by the rules alone, but by what you believe about how others reason — and what they believe about you.',
    ],
    takeaway: 'The theoretically stable answer and the winning answer can differ. Win by modelling the depth of reasoning you actually face.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l14.b.never-best-response',
    lesson: 'strategy-detective',
    slot: 'B',
    version: 1,
    title: 'The option nobody rational picks',
    purpose: 'An option that no single alternative beats — but that is never the best reply to any belief.',
    setup: 'You choose L or R. Your counterpart chooses T, M or B. B looks “safe” to them — it pays 1 whatever you do — and if they chose it, your R would pay 4. Payoffs: theirs first, yours second.',
    rules: ['Payoffs are exactly as in the table (row player first).', 'Your counterpart is rational and believes you are too.'],
    formal: {
      players: 'Your counterpart (rows) and you (columns).',
      actions: 'Counterpart: T, M, B. You: L, R.',
      timing: 'Simultaneous, one shot.',
      information: 'Complete information.',
      payoffs: 'In the table.',
      opponent: 'Your counterpart plays a rationalizable action: T.',
      solution: 'Rationalizability: B is never a best response to any belief (its 1 is below max(3p, 3 − 3p) ≥ 1.5), so it goes; then L beats R; then T. The unique Nash equilibrium is (T, L).',
      source: 'original',
      sourceNote: 'Designed for this app to separate rationalizability from pure-strategy dominance.',
    },
    visual: { kind: 'matrix', game: NEVER_BEST, rowName: 'Them', colName: 'You', rowLabels: { T: 'T', M: 'M', B: 'B (safe)' }, colLabels: { L: 'You: L', R: 'You: R' } },
    predict: {
      question: 'Could a rational counterpart ever choose B?',
      basis: 'calculable',
      modelAnswer: 'No: whatever they believe about you, T or M pays them at least 1.5.',
      options: [
        { id: 'no', label: 'No — whatever they believe, T or M does better', verdict: 'match', feedback: 'If they think L has probability p, T pays 3p and M pays 3 − 3p. The better of the two is at least 1.5 — always above B’s 1.' },
        { id: 'yes-safe', label: 'Yes — it’s the safe option', verdict: 'misconception', feedback: 'Safe, but never best. A rational player picks a best reply to some belief, and no belief makes B best.' },
        { id: 'yes-undominated', label: 'Yes — neither T nor M beats it in every column', verdict: 'defensible', feedback: 'True: B isn’t dominated by T or by M alone. But a 50/50 mix of T and M pays 1.5 in each column, and no belief makes B a best reply.' },
      ],
      solve: () => (!rowsEverBestResponse(NEVER_BEST).includes('B') && !strictlyDominatedRows(NEVER_BEST).includes('B') ? 'no' : 'other'),
    },
    play: matrixPlay({
      game: NEVER_BEST,
      learner: 'col',
      labels: { row: { T: 'T', M: 'M', B: 'B' }, col: { L: 'L', R: 'R' } },
      names: { you: 'You', them: 'Your counterpart' },
      prompt: 'Do you choose L or R?',
      opponent: () => 'T',
      opponentRule: 'Their rule (now revealed): rule out options that are never a best reply, assume you do the same, and play what’s left — T.',
      extraLines: () => [`Pure dominance alone removes nothing at the start: ${iteratedStrictDominance(NEVER_BEST).steps.length === 0 ? 'no row or column is beaten by another in every case' : 'some options are removed'}.`],
    }),
    explain: [
      'Rationalizability asks which actions are a best reply to some belief about the other player — and then repeats the question, assuming everyone knows everyone does this. B is never a best reply, so it goes; then your R (attractive only if B were possible) loses to L; then T is their only sensible reply to L.',
      'This is different from Lesson 2’s dominance: no single option beat B. And different from Nash equilibrium: rationalizability says what beliefs can justify, not that beliefs must be correct. (Here they agree on (T, L).)',
    ],
    takeaway: 'Ask not only “is it beaten?” but “is there any belief that would make it the best choice?” If not, a rational player won’t pick it.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l14.c.reasoning-depth',
    lesson: 'strategy-detective',
    slot: 'C',
    version: 1,
    title: 'Ask for 11 to 20',
    purpose: 'Not sure how deeply your opponent thinks? Turn that uncertainty into a decision.',
    setup: 'You and a stranger each ask for a whole number of coins from 11 to 20 and receive it. If your request is exactly one less than theirs, you get a 20-coin bonus. Your belief about them: they ask for 20 (no reasoning) with 30%, 19 with 40%, 18 with 30%.',
    rules: ['You receive what you ask for (11–20).', 'Bonus 20 if your request is exactly 1 below theirs.', 'Their request: 20 (30%), 19 (40%), 18 (30%) — drawn at random.'],
    formal: {
      players: 'You and a stranger.',
      actions: 'Request 11–20.',
      timing: 'Simultaneous, one shot.',
      information: 'Uncertainty about the opponent’s reasoning depth, stated as a belief.',
      payoffs: 'Request + 20 if exactly one below the other’s.',
      opponent: 'Requests 20, 19 or 18 with probabilities 0.3, 0.4, 0.3 (level 0, 1, 2).',
      chance: 'The opponent’s request is drawn from that belief.',
      solution: 'Best reply to the belief: 18 (expected 26).',
      source: 'adapted',
      sourceNote: 'The 11–20 money request game (Arad & Rubinstein, 2012); the opponent distribution is this app’s.',
    },
    predict: {
      question: 'Given your belief about how deeply they think, which request has the highest expected payoff?',
      basis: 'calculable',
      modelAnswer: '18: 18 + 20 × 40% = 26.',
      options: [
        { id: '18', label: '18', verdict: 'match', feedback: '18 earns the bonus if they ask 19 (40%): 18 + 8 = 26. 19 earns 19 + 20 × 30% = 25. 17 earns 17 + 6 = 23.' },
        { id: '19', label: '19 — one below the obvious 20', verdict: 'defensible', feedback: 'A good one-step answer: 25. But you believe 19 is their most likely request, so going one step further pays more.' },
        { id: '20', label: '20 — the most coins guaranteed', verdict: 'misconception', feedback: '20 guarantees 20 but can never earn the bonus. Two of the alternatives beat it in expectation.' },
        { id: '11', label: '11 — they’ll never expect it', verdict: 'misconception', feedback: 'Only pays the bonus if they ask 12, which your belief rules out: 11 in total.' },
      ],
      solve: () => {
        let best = 11;
        for (let r = 11; r <= 20; r++) if (requestValue(r) > requestValue(best)) best = r;
        return String(best);
      },
    },
    play: numberPlay({ kind: 'number', prompt: 'How many coins do you ask for?', min: 11, max: 20, step: 1, initial: 20, cta: 'Ask' }, (r, rng) => {
      const u = rng();
      const theirs = u < 0.3 ? 20 : u < 0.7 ? 19 : 18;
      const bonus = r === theirs - 1 ? 20 : 0;
      return {
        headline: `They asked for ${theirs}. ${bonus ? 'You were exactly one below: bonus!' : 'No bonus this time.'}`,
        stats: [
          { label: 'You get', value: String(r + bonus), tone: 'blue' },
          { label: 'Expected for your request', value: fmt(requestValue(r), 1), tone: 'amber' },
        ],
        lines: [`Expected payoffs under your belief: ${[20, 19, 18, 17].map((x) => `${x} → ${fmt(requestValue(x), 1)}`).join(', ')}.`],
      };
    }),
    explain: [
      'You can’t know how many steps your opponent takes, but you can hold a belief about it and best-reply to that belief. Higher-order beliefs — what they think you think — are what create the levels in the first place.',
      'The best request depends on the belief: if most people asked 20, then 19 would be best. The rules don’t settle the answer; beliefs do.',
    ],
    takeaway: 'When you’re unsure how deeply others reason, put probabilities on the possibilities and best-reply to that mix.',
    skill: 'anticipating',
  }),
];

// ── Lesson 15 · Decisions Under Uncertainty ──────────────────────────────────

export const COMPETITOR = { pTough: 0.4, enterTough: -4, enterSoft: 6 };
export const REPORT = { accuracy: 0.8, cost: 1 };
const TYPE_PAYOFFS = [
  [COMPETITOR.enterTough, COMPETITOR.enterSoft],
  [0, 0],
];
const PRIOR = [COMPETITOR.pTough, 1 - COMPETITOR.pTough];
const REPORT_SIGNAL = [
  [REPORT.accuracy, 1 - REPORT.accuracy],
  [1 - REPORT.accuracy, REPORT.accuracy],
];
export const VALUE_WITHOUT_REPORT = Math.max(expected(PRIOR, TYPE_PAYOFFS[0]), 0);
export const VALUE_WITH_REPORT = valueWithSignal(PRIOR, REPORT_SIGNAL, TYPE_PAYOFFS);

export const SUPPLIER = { pBad: 0.1, lateIfBad: 0.7, lateIfGood: 0.2, good: 5, bad: -20 };
export const SUPPLIER_POSTERIOR = posterior([SUPPLIER.pBad, 1 - SUPPLIER.pBad], [SUPPLIER.lateIfBad, SUPPLIER.lateIfGood])[0];

interface ReportState {
  seed: number;
  buy: boolean | null;
  enter: boolean | null;
}

const reportPlay: ScenarioPlay<ReportState> = {
  init: (seed) => ({ seed, buy: null, enter: null }),
  prompt: (s) => {
    if (s.buy === null)
      return { kind: 'choice', prompt: `Buy the market report for ${REPORT.cost}?`, options: [{ id: 'buy', label: `Buy the report (cost ${REPORT.cost})` }, { id: 'skip', label: 'Decide without it' }] };
    if (s.enter === null) {
      const note = s.buy ? `The report says: “${reportSaysTough(s.seed) ? 'tough' : 'soft'} competitor”. ` : '';
      return { kind: 'choice', prompt: `${note}Do you enter the market?`, options: [{ id: 'enter', label: 'Enter' }, { id: 'stay', label: 'Stay out' }] };
    }
    return null;
  },
  apply: (s, input) => {
    if (s.buy === null) {
      if (input !== 'buy' && input !== 'skip') throw new Error('Illegal');
      return { ...s, buy: input === 'buy' };
    }
    if (s.enter === null) {
      if (input !== 'enter' && input !== 'stay') throw new Error('Illegal');
      return { ...s, enter: input === 'enter' };
    }
    throw new Error('Game over');
  },
  result: (s) => {
    const tough = competitorTough(s.seed);
    const payoff = (s.enter ? (tough ? COMPETITOR.enterTough : COMPETITOR.enterSoft) : 0) - (s.buy ? REPORT.cost : 0);
    const says = reportSaysTough(s.seed);
    const post = posterior(PRIOR, says ? REPORT_SIGNAL[0] : REPORT_SIGNAL[1])[0];
    return {
      headline: `The competitor was ${tough ? 'tough — it fought' : 'soft — it accommodated'}. You ${s.enter ? 'entered' : 'stayed out'}.`,
      stats: [
        { label: 'Your payoff', value: fmt(payoff), tone: 'blue' },
        { label: 'Value without report', value: fmt(VALUE_WITHOUT_REPORT, 2) },
        { label: 'Value with report', value: fmt(VALUE_WITH_REPORT - REPORT.cost, 2), tone: 'amber' },
      ],
      lines: [
        s.buy ? `After a “${says ? 'tough' : 'soft'}” report, the chance of a tough competitor was ${pct(post)}.` : `Without the report, entering was worth 0.4 × (−4) + 0.6 × 6 = ${fmt(VALUE_WITHOUT_REPORT, 2)} on average.`,
        `The report is worth ${fmt(VALUE_WITH_REPORT - VALUE_WITHOUT_REPORT, 2)} before its cost — less than the ${REPORT.cost} it costs.`,
      ],
    };
  },
};
function competitorTough(seed: number): boolean {
  return createRng(seed)() < COMPETITOR.pTough;
}
function reportSaysTough(seed: number): boolean {
  const rng = createRng(seed);
  const tough = rng() < COMPETITOR.pTough;
  return rng() < (tough ? REPORT.accuracy : 1 - REPORT.accuracy);
}

interface EvidenceState {
  seed: number;
  before: 'sign' | 'wait' | null;
  after: 'sign' | 'wait' | null;
}

const evidencePlay: ScenarioPlay<EvidenceState> = {
  init: (seed) => ({ seed, before: null, after: null }),
  prompt: (s) =>
    s.before === null
      ? { kind: 'choice', prompt: 'Before the trial order: would you sign the big contract now?', options: [{ id: 'sign', label: 'Sign' }, { id: 'wait', label: 'Don’t sign' }] }
      : s.after === null
        ? { kind: 'choice', prompt: 'The trial order arrives late. Now: sign the big contract?', options: [{ id: 'sign', label: 'Sign' }, { id: 'wait', label: 'Don’t sign' }] }
        : null,
  apply: (s, input) => {
    if (input !== 'sign' && input !== 'wait') throw new Error('Illegal');
    if (s.before === null) return { ...s, before: input };
    if (s.after === null) return { ...s, after: input };
    throw new Error('Game over');
  },
  log: (s) => (s.before ? [`Before the evidence you chose: ${s.before === 'sign' ? 'sign' : 'don’t sign'}.`] : []),
  result: (s) => {
    // The trial was late (the scenario's premise), so the supplier's type is drawn from the posterior.
    const bad = createRng(s.seed)() < SUPPLIER_POSTERIOR;
    const payoff = s.after === 'sign' ? (bad ? SUPPLIER.bad : SUPPLIER.good) : 0;
    const priorEV = (1 - SUPPLIER.pBad) * SUPPLIER.good + SUPPLIER.pBad * SUPPLIER.bad;
    const postEV = (1 - SUPPLIER_POSTERIOR) * SUPPLIER.good + SUPPLIER_POSTERIOR * SUPPLIER.bad;
    return {
      headline: `The supplier turned out to be ${bad ? 'unreliable' : 'reliable'}. You ${s.after === 'sign' ? 'signed' : 'didn’t sign'}.`,
      stats: [
        { label: 'Your payoff', value: fmt(payoff), tone: 'blue' },
        { label: 'P(unreliable) before', value: pct(SUPPLIER.pBad), tone: 'neutral' },
        { label: 'After a late trial', value: pct(SUPPLIER_POSTERIOR), tone: 'amber' },
      ],
      lines: [`Expected value of signing: ${fmt(priorEV, 2)} before the evidence, ${fmt(postEV, 2)} after it.`, 'Out of 100 suppliers: 10 unreliable (7 of them late), 90 reliable (18 of them late). Of the 25 late ones, 7 are unreliable: 28%.'],
    };
  },
};

const L15: ScenarioSpec[] = [
  defineScenario({
    id: 'l15.a.unknown-competitor',
    lesson: 'bayesian-uncertainty',
    slot: 'A',
    version: 1,
    title: 'Who are you up against?',
    purpose: 'The competitor’s type is private: decide on expected payoffs.',
    setup: 'You’re considering entering a new city. The local competitor is either tough (it always fights newcomers) or soft (it always accommodates). From industry data, 40% of such competitors are tough. Only they know their type.',
    rules: ['Enter against a tough competitor: −4. Enter against a soft one: +6.', 'Stay out: 0.', 'The competitor’s type is drawn: tough with probability 40%.'],
    formal: {
      players: 'You and the competitor.',
      actions: 'You: enter or stay out. Competitor: fight or accommodate.',
      timing: 'You decide; the competitor responds according to its type.',
      information: 'Hidden type: you know only the prior (40% tough).',
      payoffs: 'You: −4 / +6 / 0. Tough types prefer fighting (3 vs 1); soft types accommodating (4 vs 1).',
      opponent: 'Each type plays its own best response: tough fights, soft accommodates.',
      chance: 'Nature draws the type: tough 0.4, soft 0.6.',
      solution: 'Bayesian decision: expected payoff of entering = 0.4 × (−4) + 0.6 × 6 = 2 > 0.',
      source: 'original',
      sourceNote: 'A minimal Bayesian game designed for this app.',
    },
    predict: {
      question: 'What is the expected payoff of entering?',
      basis: 'calculable',
      modelAnswer: '+2: 0.4 × (−4) + 0.6 × 6.',
      options: [
        { id: '2', label: '+2', verdict: 'match', feedback: '40% of the time you lose 4, 60% of the time you gain 6: −1.6 + 3.6 = 2.' },
        { id: '1', label: '+1 — the average of −4 and 6', verdict: 'misconception', feedback: 'A simple average treats both types as equally likely. Weight each by its probability.' },
        { id: '6', label: '+6', verdict: 'misconception', feedback: 'That’s the payoff only against the soft type.' },
      ],
      solve: () => fmt(expected(PRIOR, TYPE_PAYOFFS[0])),
    },
    play: choicePlay({ kind: 'choice', prompt: 'Do you enter?', options: [{ id: 'enter', label: 'Enter' }, { id: 'stay', label: 'Stay out' }] }, (c, rng) => {
      const tough = rng() < COMPETITOR.pTough;
      const payoff = c === 'enter' ? (tough ? -4 : 6) : 0;
      return {
        headline: `The competitor was ${tough ? 'tough' : 'soft'}. ${c === 'enter' ? (tough ? 'It fought.' : 'It accommodated.') : 'You stayed out.'}`,
        stats: [
          { label: 'Your payoff', value: fmt(payoff), tone: 'blue' },
          { label: 'Expected (enter)', value: '+2', tone: 'amber' },
        ],
        lines: ['A good decision can have a bad outcome: entering was right on average even when the draw went against you.'],
      };
    }),
    explain: [
      'With a hidden type, you can’t condition on what the other side is — only on what you believe. Weight each possibility by its probability and compare expected payoffs.',
      'This is uncertainty about who someone is (a hidden type), not about what they secretly did (a hidden action, Lesson 10).',
    ],
    takeaway: 'When you can’t see the other side’s type, decide on the probability-weighted payoff — and judge the decision, not the draw.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l15.b.buy-information',
    lesson: 'bayesian-uncertainty',
    slot: 'B',
    version: 1,
    title: 'The market report',
    purpose: 'Same decision — but now you can pay for a noisy signal before acting.',
    setup: 'Same city, same 40% chance of a tough competitor. A consultancy offers a report for 1. It’s right 80% of the time: it says “tough” for 80% of tough competitors and “soft” for 80% of soft ones.',
    rules: ['Decide whether to buy the report (cost 1).', 'If you buy it, you see what it says, then decide whether to enter.', 'Payoffs as before: −4, +6 or 0, minus the report’s cost.'],
    formal: {
      players: 'You and the competitor.',
      actions: 'Buy the report or not; then enter or stay out.',
      timing: 'Information purchase → signal → entry decision.',
      information: 'Hidden type; a signal with P(“tough” | tough) = P(“soft” | soft) = 0.8.',
      payoffs: 'As in scenario A, minus 1 if you bought the report.',
      opponent: 'Types behave as before.',
      chance: 'Type (0.4 tough) and report (80% accurate).',
      solution: 'Value of the report: with it, 2.56 (stay out after “tough”, enter after “soft”); without, 2. Worth 0.56 < cost 1.',
      source: 'original',
      sourceNote: 'Value of imperfect information, designed for this app.',
    },
    predict: {
      question: 'Is the 80%-accurate report worth its cost of 1?',
      basis: 'calculable',
      modelAnswer: 'No — it adds about 0.56 in expected value.',
      options: [
        { id: 'no', label: 'No — it’s worth less than it costs', verdict: 'match', feedback: 'With the report you’d stay out after “tough” and enter after “soft”: expected 2.56. Without it, entering is worth 2. The report adds 0.56 — less than 1.' },
        { id: 'yes', label: 'Yes — more information is always better', verdict: 'misconception', feedback: 'Free information never hurts. Costly information is worth buying only if it’s likely to change your decision by enough.' },
        { id: 'yes-accurate', label: 'Yes — 80% is very accurate', verdict: 'defensible', feedback: 'Accuracy matters, but so do the stakes and the prior. Here, even a perfect report would be worth only 1.6.' },
      ],
      solve: () => (VALUE_WITH_REPORT - VALUE_WITHOUT_REPORT < REPORT.cost ? 'no' : 'yes'),
    },
    play: reportPlay,
    explain: [
      'Information has value only through the decisions it changes. Here the report changes your choice only when it says “tough” — and even then it’s wrong 27% of the time.',
      'Compute the value of the decision with and without the information. If the difference is smaller than the price, skip it — even though the information is “good”.',
    ],
    takeaway: 'Buy information when it’s likely to change your decision by more than it costs — not merely because it’s accurate.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l15.c.new-evidence',
    lesson: 'bayesian-uncertainty',
    slot: 'C',
    version: 1,
    title: 'The late delivery',
    purpose: 'Evidence arrives: update your belief, and see whether your best decision flips.',
    setup: 'You’re about to sign a big contract with a new supplier. 10% of new suppliers turn out unreliable. Unreliable suppliers deliver trial orders late 70% of the time; reliable ones are late 20% of the time. Signing pays +5 with a reliable supplier and −20 with an unreliable one.',
    rules: ['You decide once before the trial order, then again after it arrives late.', 'Only the second decision counts.', 'Signing: +5 (reliable) or −20 (unreliable). Not signing: 0.'],
    formal: {
      players: 'You (a single decision-maker facing a hidden type).',
      actions: 'Sign or don’t sign.',
      timing: 'Prior decision (recorded), evidence, final decision.',
      information: 'Prior P(unreliable) = 0.1; likelihoods P(late | unreliable) = 0.7, P(late | reliable) = 0.2.',
      payoffs: '+5 / −20 / 0.',
      chance: 'The supplier’s type, conditional on the late trial (posterior 28% unreliable).',
      solution: 'Bayes: P(unreliable | late) = 0.07 / 0.25 = 0.28. Expected value of signing falls from +2.5 to −2: the decision flips.',
      source: 'original',
      sourceNote: 'Designed for this app.',
    },
    predict: {
      question: 'After the late delivery, what is the chance the supplier is unreliable?',
      basis: 'calculable',
      modelAnswer: '28%.',
      options: [
        { id: '28', label: '28%', verdict: 'match', feedback: 'Of 100 suppliers, 7 unreliable ones and 18 reliable ones deliver late. Late suppliers: 25, of which 7 are unreliable: 28%.' },
        { id: '70', label: '70%', verdict: 'misconception', feedback: '70% is how often unreliable suppliers are late — not how often late suppliers are unreliable. Most suppliers are reliable, so many late ones are too.' },
        { id: '10', label: '10% — one trial proves nothing', verdict: 'misconception', feedback: 'Lateness is 3.5 times as likely from an unreliable supplier, so it should move your belief up from 10%.' },
      ],
      solve: () => String(Math.round(SUPPLIER_POSTERIOR * 100)),
    },
    play: evidencePlay,
    explain: [
      'Bayes’ rule combines how common unreliable suppliers are (10%) with how strongly lateness points to them (70% vs 20%). The posterior, 28%, is far below 70% because reliable suppliers are so much more common.',
      'Expected money isn’t the whole story: if a −20 loss would be ruinous for your firm, you might refuse even when the expected value is positive. Expected utility, not just expected money, should drive a decision with large downside risk.',
    ],
    takeaway: 'Update beliefs by asking how likely the evidence is under each possibility — and check whether the update changes what you should do.',
    skill: 'uncertainty',
  }),
];

// ── Lesson 16 · Signals and Secrets ──────────────────────────────────────────

export const SPENCE = { high: 10, low: 4, pHigh: 0.5, costHigh: 2, costLow: 7 };
export const ITEM = { good: 20, bad: 8, price: 16 };
export const PLANS = {
  heavy: { pro: 30, basic: 18 },
  light: { pro: 14, basic: 12 },
};
export const MENUS = {
  'pro-only': { label: 'Pro only, $30', pro: 30, basic: null },
  'both-high': { label: 'Basic $12, Pro $30', pro: 30, basic: 12 },
  'both-screen': { label: 'Basic $12, Pro $24', pro: 24, basic: 12 },
  'pro-cheap': { label: 'Pro only, $14', pro: 14, basic: null },
} as const;
export type MenuId = keyof typeof MENUS;
/** Which plan each type picks under a menu: the one with the highest surplus (≥ 0); ties go to Pro. */
export function planChoice(menu: MenuId, type: 'heavy' | 'light'): 'pro' | 'basic' | 'none' {
  const m = MENUS[menu];
  const v = PLANS[type];
  const sPro = v.pro - m.pro;
  const sBasic = m.basic === null ? -Infinity : v.basic - m.basic;
  if (sPro < 0 && sBasic < 0) return 'none';
  return sPro >= sBasic ? 'pro' : 'basic';
}
export function menuRevenue(menu: MenuId): number {
  const m = MENUS[menu];
  const price = (c: 'pro' | 'basic' | 'none') => (c === 'pro' ? m.pro : c === 'basic' ? (m.basic ?? 0) : 0);
  return 0.5 * price(planChoice(menu, 'heavy')) + 0.5 * price(planChoice(menu, 'light'));
}

interface MarketsState {
  seed: number;
  m1: boolean | null;
  m2: boolean | null;
}

const certificatePlay: ScenarioPlay<MarketsState> = {
  init: (seed) => ({ seed, m1: null, m2: null }),
  prompt: (s) =>
    s.m1 === null
      ? { kind: 'choice', prompt: 'Market 1: certificates are cheap for every seller. Buy a certified item for $16?', options: [{ id: 'buy', label: 'Buy' }, { id: 'pass', label: 'Pass' }] }
      : s.m2 === null
        ? { kind: 'choice', prompt: 'Market 2: certificates require an inspection bad items can’t pass. Buy a certified item for $16?', options: [{ id: 'buy', label: 'Buy' }, { id: 'pass', label: 'Pass' }] }
        : null,
  apply: (s, input) => {
    if (input !== 'buy' && input !== 'pass') throw new Error('Illegal');
    if (s.m1 === null) return { ...s, m1: input === 'buy' };
    if (s.m2 === null) return { ...s, m2: input === 'buy' };
    throw new Error('Game over');
  },
  log: (s) => (s.m1 !== null ? [`Market 1: you ${s.m1 ? 'bought' : 'passed'}.`] : []),
  result: (s) => {
    const good1 = createRng(s.seed)() < 0.5;
    const v1 = s.m1 ? (good1 ? ITEM.good : ITEM.bad) - ITEM.price : 0;
    const v2 = s.m2 ? ITEM.good - ITEM.price : 0;
    return {
      headline: `Market 1 item: ${s.m1 ? (good1 ? 'good' : 'bad') : 'not bought'}. Market 2 item: ${s.m2 ? 'good' : 'not bought'}.`,
      stats: [
        { label: 'Market 1', value: fmt(v1), tone: 'blue' },
        { label: 'Market 2', value: fmt(v2), tone: 'blue' },
        { label: 'Expected, certified, market 1', value: fmt(expected([0.5, 0.5], [ITEM.good, ITEM.bad]) - ITEM.price), tone: 'amber' },
      ],
      lines: [
        'Market 1: every seller certifies, so a certificate tells you nothing. A certified item is still good only 50% of the time: worth 14 on average, less than its price of 16.',
        'Market 2: only good items can be certified, so a certificate means “good”: worth 20 for a price of 16.',
      ],
    };
  },
};

const L16: ScenarioSpec[] = [
  defineScenario({
    id: 'l16.a.education-signal',
    lesson: 'signaling',
    slot: 'A',
    version: 1,
    title: 'The certificate',
    purpose: 'You know your own ability; the employer doesn’t. Can a costly course tell them?',
    setup: 'You’re a highly productive worker (worth 10 to an employer); others are less productive (worth 4). Employers can’t tell you apart, but they pay 10 to anyone with a certain certificate and 4 otherwise. The course costs you 2 in effort; it would cost a less productive worker 7. The course itself teaches nothing useful.',
    rules: ['Wage 10 with the certificate, 4 without (the employer’s stated policy).', 'The certificate costs you 2 (it would cost a low-productivity worker 7).', 'Your payoff = wage − certificate cost.'],
    formal: {
      players: 'You (sender, high type) and an employer (receiver).',
      actions: 'You: get the certificate or not. Employer: wage offer.',
      timing: 'Signal, then wage.',
      information: 'Hidden type: the employer doesn’t see productivity, only the certificate.',
      payoffs: 'Worker: wage − cost. Employer pays expected productivity given beliefs.',
      opponent: 'Employers believe certified workers are high types and pay 10; others 4.',
      solution: 'Separating equilibrium: high types certify (10 − 2 = 8 > 4), low types don’t (4 > 10 − 7 = 3). Beliefs are confirmed.',
      source: 'adapted',
      sourceNote: 'Spence (1973) job-market signalling, with two types and stated costs.',
    },
    predict: {
      question: 'Would a low-productivity worker also get the certificate?',
      basis: 'calculable',
      modelAnswer: 'No: 10 − 7 = 3 is less than the 4 they get without it.',
      options: [
        { id: 'no', label: 'No — it costs them more than it’s worth', verdict: 'match', feedback: 'For them the certificate turns a wage of 4 into 10 − 7 = 3. Not worth it. That’s exactly why the certificate is informative.' },
        { id: 'yes', label: 'Yes — everyone wants the higher wage', verdict: 'misconception', feedback: 'Everyone wants 10, but for a low-productivity worker the cost (7) eats more than the raise (6).' },
        { id: 'depends', label: 'Only if the course teaches useful skills', verdict: 'misconception', feedback: 'Here it teaches nothing. A signal works through cost differences, not skills.' },
      ],
      solve: () => (separatingHolds(SPENCE).lowGainsFromCopying < 0 ? 'no' : 'yes'),
    },
    play: choicePlay({ kind: 'choice', prompt: 'Do you get the certificate?', options: [{ id: 'cert', label: 'Get the certificate (cost 2)' }, { id: 'none', label: 'Skip it' }] }, (c) => {
      const pay = c === 'cert' ? 10 - 2 : 4;
      const s = separatingHolds(SPENCE);
      return {
        headline: c === 'cert' ? 'You’re hired at 10.' : 'You’re hired at 4.',
        stats: [
          { label: 'Your payoff', value: String(pay), tone: 'blue' },
          { label: 'Low type: certify', value: String(10 - 7), tone: 'orange' },
          { label: 'Low type: skip', value: '4', tone: 'orange' },
        ],
        lines: [`High types gain ${s.highGains} by certifying; low types would gain ${s.lowGainsFromCopying} by copying — a loss. So the employer’s belief “certified means productive” is correct.`],
      };
    }),
    explain: [
      'A signal is credible when it is too costly for the wrong type to fake. Talk is cheap for everyone; a certificate that costs low types more than it gains them separates the two.',
      'Note the waste: the course costs high types 2 and teaches nothing. In this model, signalling helps employers sort workers but doesn’t make anyone more productive.',
    ],
    takeaway: 'An action says something only if it would be too costly for someone who isn’t what it claims.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l16.b.quality-certificate',
    lesson: 'signaling',
    slot: 'B',
    version: 1,
    title: 'Two markets, two certificates',
    purpose: 'Now you’re the receiver — and the cost of faking the signal changes what it means.',
    setup: 'You’re buying a used item. Good ones are worth 20 to you, bad ones 8; half of all items are good. Certified items cost $16. In market 1, any seller can get a certificate cheaply. In market 2, the certificate needs an inspection that bad items fail.',
    rules: ['Decide whether to buy a certified item at $16 in each market.', 'Market 1: every seller certifies, so certified items are good 50% of the time.', 'Market 2: only good items are certified.'],
    formal: {
      players: 'You (receiver) and sellers (senders).',
      actions: 'You: buy or pass in each market.',
      timing: 'Seller certifies; you see the certificate; you decide.',
      information: 'Hidden quality; the certificate is the only signal.',
      payoffs: 'Value (20 or 8) − 16 if you buy; 0 otherwise.',
      opponent: 'Market 1: all sellers certify (pooling). Market 2: only good sellers can (separating).',
      chance: 'Market 1 item quality: good with probability 0.5.',
      solution: 'Market 1: expected value 14 < 16, pass. Market 2: certified = good, 20 > 16, buy.',
      source: 'original',
      sourceNote: 'Designed for this app.',
    },
    predict: {
      question: 'In market 1, what is a certified item worth to you on average?',
      basis: 'calculable',
      modelAnswer: '14 — the certificate carries no information there.',
      options: [
        { id: '14', label: '14', verdict: 'match', feedback: 'Every seller certifies, so a certified item is good half the time: 0.5 × 20 + 0.5 × 8 = 14.' },
        { id: '20', label: '20 — it’s certified', verdict: 'misconception', feedback: 'A certificate that every seller can get cheaply doesn’t separate good from bad.' },
        { id: '16', label: '16 — the price reflects quality', verdict: 'misconception', feedback: 'The price is what you’re asked to pay, not evidence of quality.' },
      ],
      solve: () => fmt(expected([0.5, 0.5], [ITEM.good, ITEM.bad])),
    },
    play: certificatePlay,
    explain: [
      'When every type sends the same signal (pooling), the receiver learns nothing and acts on the prior. When only one type can send it (separating), the signal reveals the type.',
      'What makes the difference isn’t the certificate’s name but its cost to each type. That’s why a credible certification process needs checks that bad sellers can’t easily pass.',
    ],
    takeaway: 'As the receiver, ask who could have sent this signal. If everyone could, it means nothing.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l16.c.screening',
    lesson: 'signaling',
    slot: 'C',
    version: 1,
    title: 'Designing the price plans',
    purpose: 'The uninformed side moves first: design options that make customers reveal their type.',
    setup: 'You sell software. Heavy users value Pro at $30 and Basic at $18; light users value Pro at $14 and Basic at $12. Half your customers are each type, and you can’t tell them apart. You choose a menu; each customer picks the plan with the highest surplus (value − price), choosing Pro on a tie, or nothing if every surplus is negative.',
    rules: ['Choose one of four menus.', 'Each customer picks the plan with the most value − price (Pro on a tie; nothing if both are negative).', 'Revenue = average price paid per customer.'],
    formal: {
      players: 'You (seller) and customers of two hidden types.',
      actions: 'You: a menu. Customers: a plan or nothing.',
      timing: 'Menu first; customers self-select.',
      information: 'Hidden types; you know the distribution (50/50).',
      payoffs: 'You: revenue. Customers: value − price.',
      opponent: 'Customers maximise surplus; ties go to Pro.',
      solution: 'Screening: Basic $12 + Pro $24 earns 18 per customer — heavy users pick Pro, light users Basic.',
      source: 'original',
      sourceNote: 'A two-type screening (menu) problem in the style of Mussa & Rosen (1978).',
    },
    visual: { kind: 'table', head: ['', 'Pro', 'Basic'], rows: [['Heavy user', '$30', '$18'], ['Light user', '$14', '$12']] },
    predict: {
      question: 'With Basic at $12 and Pro at $30, which plan do heavy users choose?',
      basis: 'calculable',
      modelAnswer: 'Basic: $6 surplus beats $0 on Pro.',
      options: [
        { id: 'basic', label: 'Basic', verdict: 'match', feedback: 'Pro at $30 leaves them nothing; Basic at $12 leaves them $6. They take Basic — unless Pro is cheap enough to match that surplus.' },
        { id: 'pro', label: 'Pro — they value it at $30', verdict: 'misconception', feedback: 'They value it at $30 but compare surpluses: $0 for Pro vs $6 for Basic.' },
        { id: 'none', label: 'Nothing', verdict: 'misconception', feedback: 'Basic leaves them a positive surplus, so they buy something.' },
      ],
      solve: () => planChoice('both-high', 'heavy'),
    },
    play: choicePlay({ kind: 'choice', prompt: 'Which menu do you launch?', options: (Object.keys(MENUS) as MenuId[]).map((id) => ({ id, label: MENUS[id].label })) }, (c) => {
      const menu = c as MenuId;
      return {
        headline: `Heavy users chose ${planChoice(menu, 'heavy')}; light users chose ${planChoice(menu, 'light')}.`,
        stats: [
          { label: 'Revenue per customer', value: `$${fmt(menuRevenue(menu))}`, tone: 'blue' },
          { label: 'Best menu', value: `$${fmt(Math.max(...(Object.keys(MENUS) as MenuId[]).map(menuRevenue)))}`, tone: 'amber' },
        ],
        lines: [(Object.keys(MENUS) as MenuId[]).map((m) => `${MENUS[m].label}: $${fmt(menuRevenue(m))}`).join(' · ')],
      };
    }),
    explain: [
      'In screening, the uninformed party designs choices so different types sort themselves. Pro must be cheap enough that heavy users prefer it to Basic ($30 − $24 = $6 = $18 − $12), while Basic is priced at what light users will pay.',
      'Signalling is the reverse: the informed side acts first to reveal its type. Both rely on types valuing options differently.',
    ],
    takeaway: 'When you can’t see who someone is, offer options that only the right type will choose.',
    skill: 'incentives',
  }),
];

// ── Lesson 17 · Winning the Auction ──────────────────────────────────────────

export const YOUR_VALUE = 60;
export const JAR = { min: 40, max: 80, noise: 15, rivals: 4, shade: 3 };

/** The jar's value, every bidder's estimate (index 0 = you) from a seed. */
export function jarDraw(seed: number): { value: number; estimates: number[] } {
  const rng = createRng(seed);
  const value = JAR.min + Math.floor(rng() * (JAR.max - JAR.min + 1));
  const estimates = Array.from({ length: JAR.rivals + 1 }, () => value + Math.floor(rng() * (2 * JAR.noise + 1)) - JAR.noise);
  return { value, estimates };
}

/** Average profit when you bid your own estimate, over the draws where you win. */
export function winnersCurseProfit(draws = 20000, seed = 2024): number {
  let total = 0;
  let wins = 0;
  for (let i = 0; i < draws; i++) {
    const { value, estimates } = jarDraw(seed + i);
    const bids = estimates.map((e, j) => (j === 0 ? e : e - JAR.shade));
    if (bids[0] > Math.max(...bids.slice(1))) {
      wins++;
      total += value - bids[0];
    }
  }
  return total / wins;
}

function auctionResult(format: 'first-price' | 'second-price', b: number, rng: () => number) {
  const rivalValue = Math.floor(rng() * 101);
  const rivalBid = format === 'first-price' ? rivalValue / 2 : rivalValue;
  const out = runAuction(format, [b, rivalBid], [YOUR_VALUE, rivalValue], rng);
  const best = bestBids(format, YOUR_VALUE, 100, 100, (v) => (format === 'first-price' ? v / 2 : v));
  return {
    headline: out.winner === 0 ? `You won and paid ${fmt(out.price)}.` : `The rival won with ${fmt(rivalBid)}.`,
    stats: [
      { label: 'Your profit', value: fmt(out.payoffs[0]), tone: 'blue' as const },
      { label: 'Expected for your bid', value: fmt(expectedProfit(format, YOUR_VALUE, b, 100, (v) => (format === 'first-price' ? v / 2 : v)), 2), tone: 'amber' as const },
      { label: 'Best bid', value: best.bids.join(' or ') },
    ],
    lines: [
      `The rival’s value was ${rivalValue}; it bid ${fmt(rivalBid)} (${format === 'first-price' ? 'half its value' : 'its value'}).`,
      format === 'first-price' ? 'In a first-price auction you pay your own bid, so bidding your full value guarantees zero profit when you win.' : 'In a second-price auction your bid decides only whether you win; the price is set by the other bid.',
    ],
  };
}

const L17: ScenarioSpec[] = [
  defineScenario({
    id: 'l17.a.first-price',
    lesson: 'auctions',
    slot: 'A',
    version: 1,
    title: 'Sealed bid, pay what you bid',
    purpose: 'Bid on a camera worth 60 to you, when the winner pays their own bid.',
    setup: 'A vintage camera is worth 60 to you. One rival bidder values it at a whole number from 0 to 100 (each equally likely) and bids half their value. Sealed bids: the highest wins and pays their own bid.',
    rules: ['Bid any whole number 0–100.', 'Highest bid wins; a tie is settled by a coin flip.', 'The winner pays their own bid. Your profit = 60 − bid if you win.'],
    formal: {
      players: 'You and one rival.',
      actions: 'A sealed bid.',
      timing: 'Simultaneous, one shot.',
      information: 'Private values: you know yours (60); the rival’s is uniform 0–100.',
      payoffs: 'Winner: value − own bid. Loser: 0.',
      opponent: 'The rival bids half its value (the equilibrium strategy for two bidders with uniform values).',
      chance: 'The rival’s value and any tie-breaking coin.',
      ties: 'Coin flip.',
      solution: 'Best reply: maximise (60 − b) × P(win) — bid 30.',
      source: 'canonical',
      sourceNote: 'First-price sealed-bid auction with independent private values (Vickrey, 1961).',
    },
    predict: {
      question: 'What bid maximises your expected profit?',
      basis: 'calculable',
      modelAnswer: 'About 30 — half your value.',
      options: [
        { id: 'half', label: 'About 30 — half my value', verdict: 'match', feedback: 'Bidding b wins with chance about b/50 and earns 60 − b. The product peaks at 30: shade your bid, trading some chance of winning for a better price.' },
        { id: 'value', label: '60 — my true value', verdict: 'misconception', feedback: 'You’d win often but pay everything the camera is worth: zero profit.' },
        { id: 'low', label: 'About 10 — bargain hunting', verdict: 'misconception', feedback: 'You’d rarely win: about 1 time in 5. Expected profit is far lower than at 30.' },
      ],
      solve: () => {
        const b = bestBids('first-price', YOUR_VALUE, 100, 100, (v) => v / 2);
        return b.bids.length === 1 && b.bids[0] === YOUR_VALUE / 2 ? 'half' : 'other';
      },
    },
    play: numberPlay({ kind: 'number', prompt: 'Your sealed bid', min: 0, max: 100, step: 1, initial: 45, cta: 'Seal my bid' }, (b, rng) => auctionResult('first-price', b, rng)),
    explain: [
      'In a first-price auction, a higher bid buys a better chance of winning at a worse price. The best bid balances the two — below your value.',
      'How much to shade depends on the competition: with more bidders, you’d need to bid closer to your value.',
    ],
    takeaway: 'When you pay what you bid, never bid your full value: shade by how much the competition allows.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l17.b.second-price',
    lesson: 'auctions',
    slot: 'B',
    version: 1,
    title: 'Sealed bid, pay the second price',
    purpose: 'One rule changes: the winner now pays the losing bid.',
    setup: 'Same camera, worth 60 to you. The rival’s value is again 0–100 at random, and now it bids its value. The highest bid wins — but pays the second-highest bid.',
    rules: ['Bid any whole number 0–100.', 'Highest bid wins (coin flip on a tie).', 'The winner pays the other bid. Your profit = 60 − rival’s bid if you win.'],
    formal: {
      players: 'You and one rival.',
      actions: 'A sealed bid.',
      timing: 'Simultaneous, one shot.',
      information: 'Independent private values.',
      payoffs: 'Winner: value − the other bid. Loser: 0.',
      opponent: 'The rival bids its value.',
      chance: 'The rival’s value and any tie-breaking coin.',
      ties: 'Coin flip.',
      solution: 'Bidding your value (60) is weakly dominant: it maximises profit against every possible rival bid.',
      source: 'canonical',
      sourceNote: 'Second-price (Vickrey, 1961) auction with private values.',
    },
    predict: {
      question: 'What should you bid?',
      basis: 'calculable',
      modelAnswer: 'Exactly your value, 60.',
      options: [
        { id: 'value', label: 'Exactly 60', verdict: 'match', feedback: 'Your bid only decides whether you win, never what you pay. Bidding 60 means you win exactly when the price is below 60 — the wins you want.' },
        { id: 'half', label: 'About 30 — shade like before', verdict: 'misconception', feedback: 'Shading no longer lowers your price; it only makes you lose some auctions you’d have won at a profit.' },
        { id: 'above', label: 'Above 60, to be sure of winning', verdict: 'misconception', feedback: 'The extra wins are exactly the ones where the price is above 60 — losses.' },
      ],
      solve: () => {
        // Weakly dominant: against every rival bid, 60 does at least as well as any other bid.
        const pay = (b: number, r: number) => (b > r ? YOUR_VALUE - r : b === r ? (YOUR_VALUE - r) / 2 : 0);
        for (let r = 0; r <= 100; r++) for (let b = 0; b <= 100; b++) if (pay(b, r) > pay(YOUR_VALUE, r) + 1e-9) return 'other';
        return 'value';
      },
    },
    play: numberPlay({ kind: 'number', prompt: 'Your sealed bid', min: 0, max: 100, step: 1, initial: 30, cta: 'Seal my bid' }, (b, rng) => auctionResult('second-price', b, rng)),
    explain: [
      'With a second price, bidding your value is weakly dominant: no other bid ever does better, whatever the rival does, and some do worse. You don’t need to model the rival at all.',
      'That result relies on private values, a single item, and no collusion, budget limits or resale. It doesn’t carry over to every auction — as the next scenario shows.',
    ],
    takeaway: 'Rules change strategy: when you pay the second price, bid what the item is truly worth to you.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l17.c.coin-jar',
    lesson: 'auctions',
    slot: 'C',
    version: 1,
    title: 'The coin jar',
    purpose: 'A common value: the jar is worth the same to everyone — and nobody knows exactly how much.',
    setup: 'A jar of coins is auctioned to five bidders. It’s worth the same to everyone, between 40 and 80. Each bidder (you included) gets a private estimate that can be off by up to 15 either way. Sealed bids; the highest wins and pays its bid. The four rivals bid their estimate minus 3.',
    rules: ['The jar’s value is a whole number 40–80, equally likely.', 'Each estimate = value + an error from −15 to +15, equally likely.', 'Highest bid wins and pays its bid; profit = jar value − bid.', 'Rivals bid their estimate − 3.'],
    formal: {
      players: 'You and four rivals.',
      actions: 'A sealed bid.',
      timing: 'Simultaneous, one shot.',
      information: 'Common value with private, noisy estimates.',
      payoffs: 'Winner: true value − bid.',
      opponent: 'Rivals bid estimate − 3.',
      chance: 'The jar’s value and every estimate error.',
      ties: 'Coin flip.',
      solution: 'Winning means your estimate was probably among the highest, so it was probably too high (the winner’s curse). Bidding your raw estimate loses money on average when you win.',
      source: 'adapted',
      sourceNote: 'After the classroom coin-jar auctions of Bazerman & Samuelson (1983).',
    },
    predict: {
      question: 'If you bid your own estimate and win, are you likely to have overpaid?',
      basis: 'calculable',
      modelAnswer: 'Yes — winning is evidence your estimate was too high.',
      options: [
        { id: 'yes', label: 'Yes — I probably won because my estimate was too high', verdict: 'match', feedback: 'Estimates are right on average, but the highest of five is not. Conditional on winning, a raw-estimate bid loses money on average.' },
        { id: 'no', label: 'No — my estimate is right on average', verdict: 'misconception', feedback: 'True before you know you’ve won. Winning tells you that yours beat four others — so it was likely one of the high ones.' },
        { id: 'luck', label: 'It’s pure luck either way', verdict: 'misconception', feedback: 'Luck decides any single jar, but the bias is systematic: winners overpay on average.' },
      ],
      solve: () => (winnersCurseProfit() < 0 ? 'yes' : 'no'),
    },
    play: {
      init: (seed) => ({ seed, bid: null as number | null }),
      prompt: (s: { seed: number; bid: number | null }) =>
        s.bid !== null ? null : { kind: 'number', prompt: `Your estimate of the jar: ${jarDraw(s.seed).estimates[0]}. Your bid?`, min: 0, max: 100, step: 1, initial: jarDraw(s.seed).estimates[0], cta: 'Seal my bid' },
      apply: (s: { seed: number; bid: number | null }, input) => {
        if (s.bid !== null || typeof input !== 'number' || !Number.isInteger(input) || input < 0 || input > 100) throw new Error('Illegal bid');
        return { ...s, bid: input };
      },
      result: (s: { seed: number; bid: number | null }) => {
        const { value, estimates } = jarDraw(s.seed);
        const bids = [s.bid!, ...estimates.slice(1).map((e) => e - JAR.shade)];
        const out = runAuction('first-price', bids, bids.map(() => value), createRng(s.seed + 1));
        return {
          headline: out.winner === 0 ? `You won with ${s.bid}. The jar held ${value}.` : `A rival won with ${bids[out.winner]}. The jar held ${value}.`,
          stats: [
            { label: 'Your profit', value: fmt(out.payoffs[0]), tone: 'blue' },
            { label: 'Winner’s profit', value: fmt(value - bids[out.winner]), tone: 'orange' },
            { label: 'Avg profit, winning at your estimate', value: fmt(winnersCurseProfit(), 1), tone: 'amber' },
          ],
          lines: [`Estimates (you first): ${estimates.join(', ')}. Rival bids: ${bids.slice(1).join(', ')}.`, 'The winning bid usually comes from the most over-optimistic estimate.'],
        };
      },
    },
    explain: [
      'With a common value, winning is informative: it means others estimated lower. Bidding as though your estimate were the truth ignores that — and leads to overpaying when you win.',
      'The fix is to bid what the jar would be worth given that you win — well below your raw estimate. This is why the second-price “bid your value” rule from scenario B doesn’t carry over unchanged.',
    ],
    takeaway: 'When everyone values the prize the same but estimates it differently, ask what winning would tell you — and bid as if you’d already learned it.',
    skill: 'uncertainty',
  }),
];

// ── Lesson 18 · Signals, Imitation and Market Quality ────────────────────────

export const EXAM_COSTS = [3, 5, 7, 9];
export const EXAM = { high: 10, low: 4, pHigh: 0.5, costHigh: 2 };
export const CASCADE_ACCURACY = 0.7;
export const CARS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
export const BUYER_MULTIPLIER = 1.5;

const L18: ScenarioSpec[] = [
  defineScenario({
    id: 'l18.a.pooling-separating',
    lesson: 'market-quality',
    slot: 'A',
    version: 1,
    title: 'How hard should the exam be?',
    purpose: 'Building on Lesson 16: vary the signal’s cost and see when separating gives way to pooling.',
    setup: 'You run a professional exam. High-skill candidates (half of them, worth 10 to employers) find it easy: cost 2. You choose how hard it is for low-skill candidates (worth 4). Employers pay expected productivity given what the exam shows.',
    rules: [
      'You set the exam’s cost for low-skill candidates: 3, 5, 7 or 9.',
      'Separating holds if high types pass and low types don’t want to: 10 − 2 ≥ 4 and 4 ≥ 10 − cost.',
      'If separating doesn’t hold, the market pools on no exam: everyone is paid the average, 7.',
      'An unexpected choice is read as coming from a low-skill candidate.',
    ],
    formal: {
      players: 'Candidates (two types), employers, and you as the designer of the signal’s cost.',
      actions: 'You: exam cost for low types. Candidates: take the exam or not. Employers: wages.',
      timing: 'Exam design → candidates choose → wages.',
      information: 'Hidden types; prior 50% high.',
      payoffs: 'Candidate: wage − exam cost. Employers pay expected productivity.',
      opponent: 'Candidates best-respond to wages; employers’ beliefs are consistent on path and pessimistic off path.',
      solution: 'Separating requires low-type cost ≥ 6: at 7 or 9 it holds (and pooling fails the intuitive criterion); at 3 or 5 only pooling (wage 7) survives.',
      source: 'adapted',
      sourceNote: 'Spence (1973) with pooling and separating equilibria; selection via the intuitive criterion (Cho & Kreps, 1987).',
    },
    predict: {
      question: 'What is the easiest exam (lowest cost for low types) at which the exam separates the types?',
      basis: 'calculable',
      modelAnswer: 'Cost 7: low types would net only 3 from passing, below their 4.',
      options: [
        { id: '7', label: '7', verdict: 'match', feedback: 'Separation needs 10 − cost ≤ 4, i.e. cost ≥ 6. Of the options, 7 is the easiest that works.' },
        { id: '5', label: '5', verdict: 'misconception', feedback: 'At 5, a low-skill candidate who passes nets 10 − 5 = 5 > 4. They’d imitate, and the exam would stop meaning anything.' },
        { id: '9', label: '9 — the harder the better', verdict: 'defensible', feedback: 'It separates, but 7 already does. A harder exam adds no information here; it just makes failure more expensive to attempt.' },
        { id: '3', label: '3', verdict: 'misconception', feedback: 'At 3, passing nets low types 7 — far above 4. Everyone takes it.' },
      ],
      solve: () => String(EXAM_COSTS.find((c) => separatingHolds({ ...EXAM, costLow: c }).holds) ?? 'none'),
    },
    play: choicePlay({ kind: 'choice', prompt: 'How hard is the exam for low-skill candidates?', options: EXAM_COSTS.map((c) => ({ id: String(c), label: `Cost ${c}` })) }, (c) => {
      const g = { ...EXAM, costLow: Number(c) };
      const sep = separatingHolds(g);
      const poolNo = poolingHolds(g, false);
      const poolYes = poolingHolds(g, true);
      return {
        headline: sep.holds ? 'The exam separates: high-skill candidates take it, others don’t.' : 'The exam can’t separate: the market pools.',
        stats: [
          { label: 'High-skill payoff', value: sep.holds ? String(10 - 2) : fmt(averageWage(g)), tone: 'blue' },
          { label: 'Low-skill payoff', value: sep.holds ? '4' : fmt(averageWage(g)), tone: 'orange' },
        ],
        lines: [
          `Separating: ${sep.holds ? 'holds' : 'fails'} (a low type would gain ${sep.lowGainsFromCopying} by imitating).`,
          `Pooling on no exam: ${poolNo ? 'holds' : 'fails'}. Pooling on the exam: ${poolYes ? 'holds' : 'fails'}.`,
          sep.holds ? 'Pooling would also be consistent here, but high types could break it: passing would pay them 8 > 7 if employers read the exam correctly, while low types would never want to — so the separating outcome is the one that survives.' : 'With imitation cheap, everyone is paid the average 7: high types lose 1, low types gain 3, compared with separation.',
        ],
      };
    }),
    explain: [
      'A signal separates only when imitation is too expensive for the wrong type. Make it cheap to fake and the low types copy, the signal stops carrying information, and the market falls back to paying everyone the average.',
      'Separating and pooling distribute value differently: high types prefer separation (8 vs 7), low types prefer pooling (7 vs 4).',
    ],
    takeaway: 'Whether a signal means anything depends on the cost of imitating it — and changing that cost changes which equilibrium the market can sustain.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l18.b.copy-the-leader',
    lesson: 'market-quality',
    slot: 'B',
    version: 1,
    title: 'Two full tables',
    purpose: 'When people imitate, their actions stop revealing what they know.',
    setup: 'Two new restaurants, A and B; one is better (equally likely either). Each diner gets a private hint that’s right 70% of the time, and sees which restaurant earlier diners chose. Two diners before you both chose A. Your own hint says B.',
    rules: [
      'Your hint is right 70% of the time.',
      'Earlier diners followed their own hint unless earlier choices outweighed it; a diner exactly torn followed their own hint.',
      'So diner 1 chose by hint; diner 2 choosing A also reveals an A hint.',
    ],
    formal: {
      players: 'A sequence of diners (you are third).',
      actions: 'Choose A or B.',
      timing: 'Sequential; each sees earlier choices, not earlier hints.',
      information: 'Private signals of accuracy 0.7; prior 50/50.',
      payoffs: '1 if you pick the better restaurant, 0 otherwise.',
      opponent: 'Earlier diners: Bayesian, following their own hint when indifferent.',
      chance: 'Which restaurant is better (drawn from your posterior).',
      solution: 'Two A hints and one B hint: P(A better) = 0.7. Choosing A is rational — and starts an information cascade.',
      source: 'adapted',
      sourceNote: 'Information cascades (Bikhchandani, Hirshleifer & Welch, 1992; Banerjee, 1992).',
    },
    predict: {
      question: 'Given two A choices and your B hint, what’s the chance A is better?',
      basis: 'calculable',
      modelAnswer: '70%: the two A hints outweigh your one B hint.',
      options: [
        { id: '70', label: '70%', verdict: 'match', feedback: 'You can infer two A hints from the earlier choices. Two for A, one for B nets out to one A hint: 70%.' },
        { id: '30', label: '30% — trust my own hint', verdict: 'misconception', feedback: 'Your hint is one piece of evidence; the two choices you saw reveal two more.' },
        { id: '50', label: '50%', verdict: 'misconception', feedback: 'That ignores the earlier diners — whose choices carried their hints.' },
      ],
      solve: () => String(Math.round(cascadePosterior(2, 1, CASCADE_ACCURACY) * 100)),
    },
    play: choicePlay({ kind: 'choice', prompt: 'Where do you eat?', options: [{ id: 'A', label: 'Restaurant A (two diners there)' }, { id: 'B', label: 'Restaurant B (my hint)' }] }, (c, rng) => {
      const aBetter = rng() < cascadePosterior(2, 1, CASCADE_ACCURACY);
      const right = (c === 'A') === aBetter;
      return {
        headline: `${aBetter ? 'A' : 'B'} was the better restaurant. You ${right ? 'chose well' : 'missed'}.`,
        stats: [
          { label: 'P(A better)', value: pct(cascadePosterior(2, 1, CASCADE_ACCURACY)), tone: 'amber' },
          { label: 'Your result', value: right ? '1' : '0', tone: 'blue' },
        ],
        lines: [
          'Choosing A was the rational choice — but notice what follows. Diner 4 sees A, A, A and can’t tell whether you had an A hint or a B hint, so your choice adds nothing. Everyone after you copies too: a cascade.',
          'One more piece of public information — a review, a contrary choice — can break it, because the cascade rests on just two hints.',
        ],
      };
    }),
    explain: [
      'Once enough people imitate, their actions stop reflecting their private information. The crowd can look certain while resting on very little evidence — and can be wrong.',
      'This is the same problem as a pooling signal: when everyone does the same thing for the same reason, observing it tells you nothing new.',
    ],
    takeaway: 'A crowd’s choice is only as informative as the private knowledge behind it. If everyone is copying, count the evidence, not the people.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l18.c.lemons',
    lesson: 'market-quality',
    slot: 'C',
    version: 1,
    title: 'The used-car lot',
    purpose: 'Hidden quality at market scale: who stays in the market when buyers can’t tell good from bad?',
    setup: 'Ten used cars of quality 10, 20, …, 100. Each owner values their car at its quality; any buyer would value it at 1.5 × quality. Buyers can’t see quality. You offer one price; owners whose car is worth no more than that price sell, and you get a random one of them.',
    rules: ['Owners sell if your price ≥ their car’s quality.', 'You get a random car from those offered; it’s worth 1.5 × its quality to you.', 'Your surplus = value − price.'],
    formal: {
      players: 'You (buyer) and ten owners.',
      actions: 'You: a price 10–100. Owners: sell or keep.',
      timing: 'You post a price; owners decide.',
      information: 'Hidden quality: owners know it, buyers don’t.',
      payoffs: 'You: 1.5 × quality − price. Owner who sells: price − quality.',
      opponent: 'Owners sell exactly when the price covers their own value.',
      chance: 'Which offered car you receive.',
      solution: 'At price p, only cars ≤ p are offered; average quality (10 + p)/2, worth 0.75(10 + p) to you. Surplus is non-negative only up to p = 30.',
      source: 'adapted',
      sourceNote: 'Akerlof (1970), “The Market for Lemons”, in a discrete version.',
    },
    predict: {
      question: 'What is the highest price at which buying doesn’t lose you money on average?',
      basis: 'calculable',
      modelAnswer: '30: the cars offered average 20, worth 30 to you.',
      options: [
        { id: '30', label: '30', verdict: 'match', feedback: 'At 30, the owners of cars 10–30 sell: average quality 20, worth 30 to you. Above that, each price rise brings in better cars, but their average value rises by only 0.75 per 1 of price.' },
        { id: '100', label: '100 — every car is worth more to buyers than to owners', verdict: 'misconception', feedback: 'Every trade would create value with full information. But at 100, you get an average car of 55, worth 82.5 — less than 100.' },
        { id: '60', label: '60 — around the average car', verdict: 'misconception', feedback: 'At 60, the cars offered average 35, worth 52.5 to you.' },
      ],
      solve: () => {
        let best = 0;
        for (const p of CARS) if (lemonsMarket(CARS, p, BUYER_MULTIPLIER).buyerSurplus >= -1e-9) best = p;
        return String(best);
      },
    },
    play: numberPlay({ kind: 'number', prompt: 'What price do you offer?', min: 10, max: 100, step: 10, initial: 60, cta: 'Offer' }, (p, rng) => {
      const m = lemonsMarket(CARS, p, BUYER_MULTIPLIER);
      const car = m.offered[Math.floor(rng() * m.offered.length)];
      return {
        headline: `${m.offered.length} of 10 owners offered their car. You got quality ${car}.`,
        stats: [
          { label: 'This car’s surplus', value: fmt(car * BUYER_MULTIPLIER - p), tone: 'blue' },
          { label: 'Expected surplus', value: fmt(m.buyerSurplus, 1), tone: 'amber' },
          { label: 'Cars traded', value: `${m.offered.length}/10` },
        ],
        lines: [`Average quality offered at ${p}: ${fmt(m.avgQuality, 1)}, worth ${fmt(m.buyerValue, 1)} to you.`, 'With full information, all ten cars would sell — each is worth more to a buyer than to its owner.'],
      };
    }),
    explain: [
      'Raising the price attracts better cars, but it attracts the worse ones first. Because owners know quality and buyers don’t, the average car on offer is always worse than the price suggests — so buyers offer little, and good cars leave the market.',
      'This is adverse selection: hidden information changes who participates. Signals, warranties, inspections and reputation exist largely to fight it.',
    ],
    takeaway: 'When one side knows quality and the other doesn’t, ask who is still willing to trade at the price — the answer may be mostly lemons.',
    skill: 'uncertainty',
  }),
];

export const MODULE5_SCENARIOS: ScenarioSpec[] = [...L14, ...L15, ...L16, ...L17, ...L18];
