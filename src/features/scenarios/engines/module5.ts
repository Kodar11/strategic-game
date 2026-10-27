import { bestBids, expectedProfit, runAuction } from '../../../game/auctions.ts';
import { averageWage, cascadePosterior, expected, lemonsMarket, posterior, poolingHolds, separatingHolds, valueWithSignal } from '../../../game/information.ts';
import { type MatrixGame, iteratedStrictDominance, rowsEverBestResponse, strictlyDominatedRows } from '../../../game/payoff-matrix.ts';
import { createRng } from '../../../game/rng.ts';
import { choicePlay, fmt, matrixPlay, numberPlay, pct } from '../builders.ts';
import { type ScenarioPlay, type ScenarioEngine, defineEngine } from '../types.ts';

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

const L14: ScenarioEngine[] = [
  defineEngine({
    id: 'l14.a.two-thirds',
    version: 1,
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
    solve: () => symmetricTwoThirdsEquilibria(5).join('-'),
  }),
  defineEngine({
    id: 'l14.b.never-best-response',
    version: 1,
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
    solve: () => (!rowsEverBestResponse(NEVER_BEST).includes('B') && !strictlyDominatedRows(NEVER_BEST).includes('B') ? 'no' : 'other'),
    visualGame: NEVER_BEST,
  }),
  defineEngine({
    id: 'l14.c.reasoning-depth',
    version: 1,
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
    solve: () => {
      let best = 11;
      for (let r = 11; r <= 20; r++) if (requestValue(r) > requestValue(best)) best = r;
      return String(best);
    },
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

const L15: ScenarioEngine[] = [
  defineEngine({
    id: 'l15.a.unknown-competitor',
    version: 1,
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
    solve: () => fmt(expected(PRIOR, TYPE_PAYOFFS[0])),
  }),
  defineEngine({
    id: 'l15.b.buy-information',
    version: 1,
    play: reportPlay,
    solve: () => (VALUE_WITH_REPORT - VALUE_WITHOUT_REPORT < REPORT.cost ? 'no' : 'yes'),
  }),
  defineEngine({
    id: 'l15.c.new-evidence',
    version: 1,
    play: evidencePlay,
    solve: () => String(Math.round(SUPPLIER_POSTERIOR * 100)),
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

const L16: ScenarioEngine[] = [
  defineEngine({
    id: 'l16.a.education-signal',
    version: 1,
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
    solve: () => (separatingHolds(SPENCE).lowGainsFromCopying < 0 ? 'no' : 'yes'),
  }),
  defineEngine({
    id: 'l16.b.quality-certificate',
    version: 1,
    play: certificatePlay,
    solve: () => fmt(expected([0.5, 0.5], [ITEM.good, ITEM.bad])),
  }),
  defineEngine({
    id: 'l16.c.screening',
    version: 1,
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
    solve: () => planChoice('both-high', 'heavy'),
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

const L17: ScenarioEngine[] = [
  defineEngine({
    id: 'l17.a.first-price',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'Your sealed bid', min: 0, max: 100, step: 1, initial: 45, cta: 'Seal my bid' }, (b, rng) => auctionResult('first-price', b, rng)),
    solve: () => {
      const b = bestBids('first-price', YOUR_VALUE, 100, 100, (v) => v / 2);
      return b.bids.length === 1 && b.bids[0] === YOUR_VALUE / 2 ? 'half' : 'other';
    },
  }),
  defineEngine({
    id: 'l17.b.second-price',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'Your sealed bid', min: 0, max: 100, step: 1, initial: 30, cta: 'Seal my bid' }, (b, rng) => auctionResult('second-price', b, rng)),
    solve: () => {
      // Weakly dominant: against every rival bid, 60 does at least as well as any other bid.
      const pay = (b: number, r: number) => (b > r ? YOUR_VALUE - r : b === r ? (YOUR_VALUE - r) / 2 : 0);
      for (let r = 0; r <= 100; r++) for (let b = 0; b <= 100; b++) if (pay(b, r) > pay(YOUR_VALUE, r) + 1e-9) return 'other';
      return 'value';
    },
  }),
  defineEngine({
    id: 'l17.c.coin-jar',
    version: 1,
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
    solve: () => (winnersCurseProfit() < 0 ? 'yes' : 'no'),
  }),
];

// ── Lesson 18 · Signals, Imitation and Market Quality ────────────────────────

export const EXAM_COSTS = [3, 5, 7, 9];
export const EXAM = { high: 10, low: 4, pHigh: 0.5, costHigh: 2 };
export const CASCADE_ACCURACY = 0.7;
export const CARS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
export const BUYER_MULTIPLIER = 1.5;

const L18: ScenarioEngine[] = [
  defineEngine({
    id: 'l18.a.pooling-separating',
    version: 1,
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
    solve: () => String(EXAM_COSTS.find((c) => separatingHolds({ ...EXAM, costLow: c }).holds) ?? 'none'),
  }),
  defineEngine({
    id: 'l18.b.copy-the-leader',
    version: 1,
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
    solve: () => String(Math.round(cascadePosterior(2, 1, CASCADE_ACCURACY) * 100)),
  }),
  defineEngine({
    id: 'l18.c.lemons',
    version: 1,
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
    solve: () => {
      let best = 0;
      for (const p of CARS) if (lemonsMarket(CARS, p, BUYER_MULTIPLIER).buyerSurplus >= -1e-9) best = p;
      return String(best);
    },
  }),
];

export const MODULE5_ENGINES: ScenarioEngine[] = [...L14, ...L15, ...L16, ...L17, ...L18];
