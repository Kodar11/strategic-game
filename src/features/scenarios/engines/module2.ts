import { type PopulationGame, hawkDove, interiorRestPoint, isInteriorStable, isPureESS, longRunShare, simulatePopulation } from '../../../game/evolution.ts';
import { bertrandEquilibria, bertrandProfit, cournotBestResponses, cournotProfit, lineBestResponses, lineVotes, medianPosition } from '../../../game/markets.ts';
import { type MatrixGame, mixedEquilibrium2x2, pureNashEquilibria, rowExpected } from '../../../game/payoff-matrix.ts';
import { AXELROD, playFixed } from '../../../game/repeated.ts';
import { createRng } from '../../../game/rng.ts';
import { choicePlay, fmt, matrixPlay, numberPlay, pct } from '../builders.ts';
import { type ScenarioPlay, type ScenarioEngine, defineEngine } from '../types.ts';

// ── Lesson 4 · The Coordination Problem ──────────────────────────────────────

export const STAG_HUNT: MatrixGame = {
  rows: ['stag', 'hare'],
  cols: ['stag', 'hare'],
  payoffs: [
    [
      [4, 4],
      [0, 3],
    ],
    [
      [3, 0],
      [3, 3],
    ],
  ],
};

export const TOOLS: MatrixGame = {
  rows: ['x', 'y'],
  cols: ['x', 'y'],
  payoffs: [
    [
      [3, 2],
      [0, 0],
    ],
    [
      [0, 0],
      [2, 3],
    ],
  ],
};

const SPOTS = ['clock', 'cafe', 'library', 'bus'] as const;
const SPOT_LABEL: Record<(typeof SPOTS)[number], string> = {
  clock: 'Under the big station clock',
  cafe: 'Café Blue, two streets away',
  library: 'The library steps',
  bus: 'Bus stop 14',
};

const L4: ScenarioEngine[] = [
  defineEngine({
    id: 'l4.a.stag-hunt',
    version: 1,
    play: matrixPlay({
      game: STAG_HUNT,
      learner: 'row',
      labels: { row: { stag: 'Go for the big contract', hare: 'Take the safe job' }, col: { stag: 'the big contract', hare: 'the safe job' } },
      names: { you: 'You', them: 'Arjun' },
      prompt: 'What do you commit to?',
      opponent: (rng) => (rng() < 0.6 ? 'stag' : 'hare'),
      opponentRule: 'His choice was drawn at random: big with probability 60%.',
      extraLines: () => ['Expected payoffs against Arjun: big 2.4, safe 3. You need him to go big at least 75% of the time before the big contract is worth the risk.'],
    }),
    solve: () => {
      const ev = rowExpected(STAG_HUNT, [0.6, 0.4]);
      return ev.hare > ev.stag ? 'hare' : ev.stag > ev.hare ? 'stag' : 'same';
    },
    visualGame: STAG_HUNT,
  }),
  defineEngine({
    id: 'l4.b.battle-of-sexes',
    version: 1,
    play: matrixPlay({
      game: TOOLS,
      learner: 'row',
      labels: { row: { x: 'Use X (my favourite)', y: 'Use Y' }, col: { x: 'X', y: 'Y' } },
      names: { you: 'You', them: 'Your colleague' },
      prompt: 'Which tool do you use?',
      opponent: () => 'y',
      opponentRule: 'Their choice: Y, already set up for the team.',
      extraLines: (you) => [you === 'x' ? 'Insisting on X after they had committed to Y left you both with 0.' : 'Following the tool already in place gave you 2 — less than your favourite, more than a mismatch.'],
    }),
    solve: () => {
      const eq = pureNashEquilibria(TOOLS);
      const [a, b] = eq.map((e) => TOOLS.payoffs[TOOLS.rows.indexOf(e.row)][TOOLS.cols.indexOf(e.col)]);
      return eq.length === 2 && Math.sign(a[0] - b[0]) === -Math.sign(a[1] - b[1]) ? 'two-disagree' : 'other';
    },
    visualGame: TOOLS,
  }),
  defineEngine({
    id: 'l4.c.focal-meeting',
    version: 1,
    play: choicePlay({ kind: 'choice', prompt: 'Where do you go?', options: SPOTS.map((id) => ({ id, label: SPOT_LABEL[id] })) }, (choice) => {
      const met = choice === 'clock';
      return {
        headline: met ? 'You meet under the clock.' : `You wait at ${SPOT_LABEL[choice as (typeof SPOTS)[number]].toLowerCase()} — your friend is under the station clock.`,
        stats: [
          { label: 'You', value: met ? '1' : '0', tone: 'blue' },
          { label: 'Friend', value: met ? '1' : '0', tone: 'orange' },
        ],
        lines: ['Your friend’s rule (now revealed): go to the most prominent landmark you both pass — the station clock.', 'Every spot was an equilibrium; the clock was the one the shared context pointed to.'],
      };
    }),
  }),
];

// ── Lesson 5 · The Predictability Trap ───────────────────────────────────────

type Coin = 'H' | 'T';
interface PenniesState {
  seed: number;
  rounds: { you: Coin; them: Coin }[];
}
export const PENNIES_ROUNDS = 10;

export const MATCHING_PENNIES: MatrixGame = {
  rows: ['H', 'T'],
  cols: ['H', 'T'],
  payoffs: [
    [
      [1, -1],
      [-1, 1],
    ],
    [
      [-1, 1],
      [1, -1],
    ],
  ],
};

/** Maya predicts your more frequent choice so far (ties: your last choice; round 1: a fair coin) and plays the opposite. */
export function penniesOpponent(history: readonly { you: Coin }[], coin: number): Coin {
  if (!history.length) return coin < 0.5 ? 'H' : 'T';
  const h = history.filter((r) => r.you === 'H').length;
  const t = history.length - h;
  const predicted: Coin = h > t ? 'H' : t > h ? 'T' : history[history.length - 1].you;
  return predicted === 'H' ? 'T' : 'H';
}

const penniesPlay: ScenarioPlay<PenniesState> = {
  init: (seed) => ({ seed, rounds: [] }),
  prompt: (s) =>
    s.rounds.length >= PENNIES_ROUNDS
      ? null
      : { kind: 'choice', prompt: `Round ${s.rounds.length + 1} of ${PENNIES_ROUNDS}: heads or tails?`, options: [{ id: 'H', label: 'Heads' }, { id: 'T', label: 'Tails' }], cta: 'Show coins' },
  apply: (s, input) => {
    if (s.rounds.length >= PENNIES_ROUNDS || (input !== 'H' && input !== 'T')) throw new Error('Illegal move');
    const coin = createRng(s.seed + s.rounds.length)();
    return { ...s, rounds: [...s.rounds, { you: input, them: penniesOpponent(s.rounds, coin) }] };
  },
  log: (s) => s.rounds.map((r, i) => `Round ${i + 1}: you ${r.you === 'H' ? 'heads' : 'tails'}, Maya ${r.them === 'H' ? 'heads' : 'tails'} — ${r.you === r.them ? 'you +1' : 'Maya +1'}`),
  result: (s) => {
    const score = s.rounds.reduce((a, r) => a + (r.you === r.them ? 1 : -1), 0);
    const heads = s.rounds.filter((r) => r.you === 'H').length;
    const mixed = mixedEquilibrium2x2(MATCHING_PENNIES)!;
    return {
      headline: `Final score: ${score > 0 ? `you +${score}` : score < 0 ? `Maya +${-score}` : 'level'} over ${PENNIES_ROUNDS} rounds.`,
      stats: [
        { label: 'Your net score', value: score > 0 ? `+${score}` : String(score), tone: 'blue' },
        { label: 'Heads played', value: `${heads}/${PENNIES_ROUNDS}` },
        { label: 'Fair-coin average', value: '0', tone: 'amber' },
      ],
      lines: [
        'Maya’s rule (now revealed): predict your more frequent choice so far (on a tie, your last one) and play the opposite.',
        `In equilibrium each side plays heads with probability ${pct(mixed.rowFirst)}. Against that, every strategy — including Maya’s — averages 0.`,
        heads >= 7 || heads <= 3 ? 'You leaned heavily on one side, which is exactly what her rule feeds on.' : 'Your choices were fairly balanced; any remaining losses came from patterns in the order of your choices.',
      ],
      bars: [
        { label: 'Your heads share', value: heads / PENNIES_ROUNDS, tone: 'blue' },
        { label: 'Equilibrium heads share', value: mixed.rowFirst, tone: 'amber' },
      ],
    };
  },
};

/** Kicker's chance of scoring (zero-sum). Kicking left is the kicker's stronger side. */
export const PENALTY_ASYM: MatrixGame = {
  rows: ['left', 'right'],
  cols: ['left', 'right'],
  payoffs: [
    [
      [0.6, -0.6],
      [0.9, -0.9],
    ],
    [
      [0.9, -0.9],
      [0.3, -0.3],
    ],
  ],
};

/** The scoring chance a kick mix guarantees against a keeper who knows the mix and dives to minimise it. */
export function guaranteedScoring(pLeft: number): { value: number; dive: 'left' | 'right' } {
  const diveLeft = pLeft * 0.6 + (1 - pLeft) * 0.9;
  const diveRight = pLeft * 0.9 + (1 - pLeft) * 0.3;
  return diveLeft <= diveRight ? { value: diveLeft, dive: 'left' } : { value: diveRight, dive: 'right' };
}

export const AUDIT = { tax: 10, fine: 15, cost: 4 };
/** Inspector revenue per taxpayer at audit rate a, when a share e of taxpayers evade. */
export function auditRevenue(a: number, e: number): number {
  const comply = AUDIT.tax - AUDIT.cost * a;
  const evade = a * (AUDIT.tax + AUDIT.fine) - AUDIT.cost * a;
  return (1 - e) * comply + e * evade;
}
/** Taxpayers best-respond to the audit rate; exactly indifferent taxpayers split as in the mixed equilibrium. */
export function evasionShare(a: number): number {
  const threshold = AUDIT.tax / (AUDIT.tax + AUDIT.fine);
  if (Math.abs(a - threshold) < 1e-9) return AUDIT.cost / (AUDIT.tax + AUDIT.fine);
  return a < threshold ? 1 : 0;
}

const L5: ScenarioEngine[] = [
  defineEngine({
    id: 'l5.a.matching-pennies',
    version: 1,
    play: penniesPlay,
    solve: () => (Math.abs(mixedEquilibrium2x2(MATCHING_PENNIES)!.rowFirst - 0.5) < 1e-9 ? 'half' : 'other'),
    visualGame: MATCHING_PENNIES,
  }),
  defineEngine({
    id: 'l5.b.penalty-mix',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'How often do you kick left?', min: 0, max: 100, step: 1, initial: 50, unit: '%', percent: true, cta: 'Take 20 kicks' }, (x, rng) => {
      const p = x / 100;
      const g = guaranteedScoring(p);
      const best = guaranteedScoring(2 / 3).value;
      let goals = 0;
      for (let i = 0; i < 20; i++) {
        const kick = rng() < p ? 0 : 1;
        const chance = PENALTY_ASYM.payoffs[kick][g.dive === 'left' ? 0 : 1][0];
        if (rng() < chance) goals++;
      }
      return {
        headline: `The keeper dived ${g.dive} every time. You scored ${goals} of 20.`,
        stats: [
          { label: 'Guaranteed chance', value: pct(g.value, 1), tone: 'blue' },
          { label: 'Goals (this run)', value: `${goals}/20` },
          { label: 'Best possible guarantee', value: pct(best), tone: 'amber' },
        ],
        lines: [
          `Against your ${x}% mix, a left dive allows ${pct(p * 0.6 + (1 - p) * 0.9, 1)} and a right dive ${pct(p * 0.9 + (1 - p) * 0.3, 1)}; the keeper takes the lower.`,
          'The goals in this run are random draws; the guaranteed chance is what your mix secures on average.',
        ],
        bars: [
          { label: 'Your mix (left)', value: p, tone: 'blue' },
          { label: 'Equilibrium mix (left)', value: 2 / 3, tone: 'amber' },
        ],
      };
    }),
    solve: () => {
      const m = mixedEquilibrium2x2(PENALTY_ASYM)!;
      return Math.abs(m.rowFirst - 2 / 3) < 1e-9 ? 'two-thirds' : 'other';
    },
    visualGame: PENALTY_ASYM,
  }),
  defineEngine({
    id: 'l5.c.tax-audit',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'What audit rate do you announce?', min: 0, max: 100, step: 5, initial: 20, unit: '%', percent: true, cta: 'Run the tax year' }, (x) => {
      const a = x / 100;
      const e = evasionShare(a);
      const rev = auditRevenue(a, e);
      const at40 = auditRevenue(0.4, evasionShare(0.4));
      return {
        headline: `${Math.round(e * 100)} of 100 businesses evaded at a ${x}% audit rate.`,
        stats: [
          { label: 'Net revenue / business', value: fmt(rev, 2), tone: 'blue' },
          { label: 'Evaders', value: `${Math.round(e * 100)}%`, tone: 'orange' },
          { label: 'At 40%', value: fmt(at40, 2), tone: 'amber' },
        ],
        lines: [
          `Expected cost of evading at ${x}%: ${fmt(25 * a, 2)} vs 10 for paying.`,
          a < 0.4 ? 'Below 40%, evading is cheaper on average, so everyone evades.' : a > 0.4 ? `Above 40% everyone pays, and every extra audit only costs you: ${fmt(rev, 2)} per business.` : 'At exactly 40% businesses are indifferent; 16% evade, which also leaves you indifferent about auditing more.',
        ],
      };
    }),
    solve: () => {
      const a = AUDIT.tax / (AUDIT.tax + AUDIT.fine);
      return String(Math.round(a * 100));
    },
  }),
];

// ── Lesson 6 · Competing for Advantage ───────────────────────────────────────

export const COURNOT = { a: 12, cost: 0 };
export const BERTRAND = { customers: 120, cost: 2, maxPrice: 8 };
export const PRICE_GRID = [2, 3, 4, 5, 6, 7, 8];
export const VOTERS = [2, 3, 5, 8, 10, 12, 14, 12, 8, 4, 3];

const L6: ScenarioEngine[] = [
  defineEngine({
    id: 'l6.a.cournot',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'How many units do you make?', min: 0, max: 12, step: 1, initial: 6, unit: 'units', cta: 'Produce' }, (q) => {
      const price = Math.max(0, 12 - q - 4);
      return {
        headline: `Total output ${q + 4}, so the price is ${price}.`,
        stats: [
          { label: 'Your profit', value: fmt(cournotProfit(COURNOT, q, 4)), tone: 'blue' },
          { label: 'Rohan’s profit', value: fmt(cournotProfit(COURNOT, 4, q)), tone: 'orange' },
          { label: 'Price', value: String(price) },
        ],
        lines: [
          q === 4 ? 'You chose your best reply to 4.' : `Your best reply to 4 was 4 units (profit 16). Your ${q} earned ${fmt(cournotProfit(COURNOT, q, 4))}.`,
          'At 4 each, each firm’s output is a best reply to the other’s — the Cournot equilibrium. Making 3 each would earn 18 each, but each would then want to raise output.',
        ],
      };
    }),
    solve: () => {
      const br = cournotBestResponses(COURNOT, 4, Array.from({ length: 13 }, (_, i) => i));
      return br.length === 1 ? String(br[0]) : 'tie';
    },
  }),
  defineEngine({
    id: 'l6.b.bertrand',
    version: 1,
    play: choicePlay({ kind: 'choice', prompt: 'What price do you set?', options: PRICE_GRID.map((p) => ({ id: String(p), label: `$${p}` })) }, (choice) => {
      const p = Number(choice);
      return {
        headline: `You charged $${p}; the rival charged $3.`,
        stats: [
          { label: 'Your profit', value: `$${fmt(bertrandProfit(BERTRAND, p, 3))}`, tone: 'blue' },
          { label: 'Rival’s profit', value: `$${fmt(bertrandProfit(BERTRAND, 3, p))}`, tone: 'orange' },
        ],
        lines: [
          'The rival’s price (now revealed): $3, one step above cost.',
          p === 3 ? 'Matching at $3 was your best reply: undercutting to $2 earns nothing, and any higher price loses every customer.' : `Your best reply to $3 was $3 (profit $60).`,
          'If 40 customers were loyal to each firm (only 40 shopping on price), pricing $8 to your loyal customers would earn 40 × $6 = $240 — far more than $60 at $3. Product differentiation breaks the price-war logic.',
        ],
      };
    }),
    solve: () => {
      const eq = bertrandEquilibria(BERTRAND, PRICE_GRID).filter(([a, b]) => a === b).map(([a]) => a);
      return eq.join('-');
    },
  }),
  defineEngine({
    id: 'l6.c.positioning',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'Where do you position your platform?', min: 0, max: 10, step: 1, initial: 7, cta: 'Hold the election' }, (x) => {
      const mine = lineVotes(VOTERS, x, 4);
      return {
        headline: mine > 40.5 ? `You win with ${fmt(mine)} of 81 votes.` : mine === 40.5 ? 'A dead heat: 40.5 votes each.' : `You lose with ${fmt(mine)} of 81 votes.`,
        stats: [
          { label: 'Your votes', value: fmt(mine), tone: 'blue' },
          { label: 'Opponent’s votes', value: fmt(81 - mine), tone: 'orange' },
          { label: 'Median voter at', value: String(medianPosition(VOTERS)), tone: 'amber' },
        ],
        lines: [x === 5 ? 'Position 5 was your best reply to 4.' : `Your best reply to 4 was 5 (53 votes).`, 'If neither platform were fixed, each candidate’s best reply would push towards the median voter at 6, where neither can gain by moving.'],
      };
    }),
    solve: () => {
      const br = lineBestResponses(VOTERS, 4);
      return br.length === 1 ? String(br[0]) : 'tie';
    },
  }),
];

// ── Lesson 7 · Rules of Evolution ────────────────────────────────────────────

export const HAWK_DOVE = hawkDove(4, 6);
export const DRIVING: PopulationGame = {
  names: ['Right', 'Left'],
  payoff: [
    [2, -4],
    [-4, 2],
  ],
  background: 5,
};
const tenRounds = (a: 'tit-for-tat' | 'always-defect', b: 'tit-for-tat' | 'always-defect') => playFixed(AXELROD, a, b, 10)[0];
export const RECIPROCATORS: PopulationGame = {
  names: ['Reciprocator', 'Defector'],
  payoff: [
    [tenRounds('tit-for-tat', 'tit-for-tat'), tenRounds('tit-for-tat', 'always-defect')],
    [tenRounds('always-defect', 'tit-for-tat'), tenRounds('always-defect', 'always-defect')],
  ],
  background: 1,
};

function populationResult(g: PopulationGame, x0: number, generations: number, nameA: string) {
  const path = simulatePopulation(g, x0, generations);
  const marks = [0, 5, 10, 20, generations].filter((t, i, a) => a.indexOf(t) === i && t <= generations);
  return { path, bars: marks.map((t) => ({ label: `Generation ${t}`, value: path[t], tone: 'blue' as const })), final: path[path.length - 1], nameA };
}

const L7: ScenarioEngine[] = [
  defineEngine({
    id: 'l7.a.hawk-dove',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'Starting share of hawks', min: 5, max: 95, step: 5, initial: 10, unit: '%', percent: true, cta: 'Run 40 generations' }, (x) => {
      const r = populationResult(HAWK_DOVE, x / 100, 40, 'Hawk');
      return {
        headline: `After 40 generations, hawks are ${pct(r.final, 1)} of the population.`,
        stats: [
          { label: 'Start', value: `${x}%`, tone: 'blue' },
          { label: 'After 40', value: pct(r.final, 1), tone: 'blue' },
          { label: 'Stable share', value: pct(4 / 6, 1), tone: 'amber' },
        ],
        lines: [`At the start, hawks earned ${fmt(r.path[0] * -1 + (1 - r.path[0]) * 4, 2)} on average and doves ${fmt((1 - r.path[0]) * 2, 2)}.`, 'The share moves until hawks and doves earn exactly the same: 2/3 hawks.'],
        bars: r.bars,
      };
    }),
    solve: () => {
      const x = interiorRestPoint(HAWK_DOVE);
      return x !== null && Math.abs(x - 2 / 3) < 1e-9 && isInteriorStable(HAWK_DOVE) ? 'two-thirds' : 'other';
    },
  }),
  defineEngine({
    id: 'l7.b.driving',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'Starting share of right-side drivers', min: 5, max: 95, step: 5, initial: 45, unit: '%', percent: true, cta: 'Run 40 generations' }, (x) => {
      const r = populationResult(DRIVING, x / 100, 40, 'Right');
      return {
        headline: x === 50 ? 'Starting exactly at 50%, nothing moves — but the slightest tilt would tip it.' : `After 40 generations, ${pct(r.final, 1)} drive on the right.`,
        stats: [
          { label: 'Start', value: `${x}%`, tone: 'blue' },
          { label: 'After 40', value: pct(r.final, 1), tone: 'blue' },
        ],
        lines: [`Both conventions are stable: all-right is an ESS (${isPureESS(DRIVING, 0) ? 'yes' : 'no'}), all-left is an ESS (${isPureESS(DRIVING, 1) ? 'yes' : 'no'}). The 50/50 mix is not.`],
        bars: r.bars,
      };
    }),
    solve: () => (longRunShare(DRIVING, 0.55) === 1 ? 'all-right' : 'other'),
  }),
  defineEngine({
    id: 'l7.c.rare-invader',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'Size of the arriving group of Reciprocators', min: 1, max: 20, step: 1, initial: 2, unit: '%', percent: true, cta: 'Run 40 generations' }, (x) => {
      const r = populationResult(RECIPROCATORS, x / 100, 40, 'Reciprocator');
      const threshold = interiorRestPoint(RECIPROCATORS)!;
      return {
        headline: r.final > x / 100 ? `They spread: ${pct(r.final, 1)} Reciprocators after 40 generations.` : `They faded: ${pct(r.final, 1)} after 40 generations.`,
        stats: [
          { label: 'Start', value: `${x}%`, tone: 'blue' },
          { label: 'After 40', value: pct(r.final, 1), tone: 'blue' },
          { label: 'Tipping point', value: pct(threshold, 1), tone: 'amber' },
        ],
        lines: [`At the start, Reciprocators earned ${fmt((x / 100) * 30 + (1 - x / 100) * 9, 2)} and Defectors ${fmt((x / 100) * 14 + (1 - x / 100) * 10, 2)}.`],
        bars: r.bars,
      };
    }),
    solve: () => (longRunShare(RECIPROCATORS, 0.02) < 0.02 ? 'no' : 'yes'),
  }),
];

export const MODULE2_ENGINES: ScenarioEngine[] = [...L4, ...L5, ...L6, ...L7];
