import { type PopulationGame, hawkDove, interiorRestPoint, isInteriorStable, isPureESS, longRunShare, simulatePopulation } from '../../../game/evolution.ts';
import { bertrandEquilibria, bertrandProfit, cournotBestResponses, cournotProfit, lineBestResponses, lineVotes, medianPosition } from '../../../game/markets.ts';
import { type MatrixGame, mixedEquilibrium2x2, pureNashEquilibria, rowExpected } from '../../../game/payoff-matrix.ts';
import { AXELROD, playFixed } from '../../../game/repeated.ts';
import { createRng } from '../../../game/rng.ts';
import { choicePlay, fmt, matrixPlay, numberPlay, pct } from '../builders.ts';
import { type ScenarioPlay, type ScenarioSpec, defineScenario } from '../types.ts';

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

const L4: ScenarioSpec[] = [
  defineScenario({
    id: 'l4.a.stag-hunt',
    lesson: 'coordination-problem',
    slot: 'A',
    version: 1,
    title: 'The stag hunt',
    purpose: 'Coordinating pays more — but only if you trust the other person to join in.',
    setup:
      'You and Arjun can team up on a big contract (the “stag”) or each take a small safe job (the “hare”). The big contract pays only if both of you commit. Arjun is unsure about you: he commits to the big contract 60% of the time.',
    rules: [
      'Both go big: 4 each. Both go safe: 3 each.',
      'You go big while Arjun goes safe: you get 0, he gets 3 (and the reverse).',
      'Arjun commits to the big contract with probability 60%, drawn at random.',
    ],
    formal: {
      players: 'You and Arjun.',
      actions: 'Big contract (stag) or safe job (hare).',
      timing: 'Simultaneous, one shot.',
      information: 'Complete information about payoffs; Arjun’s choice is hidden.',
      payoffs: 'In the table.',
      opponent: 'Arjun goes big with probability 0.6.',
      chance: 'Arjun’s choice is drawn with the stated probability.',
      solution: 'Two pure equilibria (both big, both safe). Against a 60% partner, the safe job has the higher expected payoff (3 > 2.4).',
      source: 'canonical',
      sourceNote: 'The Stag Hunt, after Rousseau’s parable; payoffs follow the standard ordinal structure (e.g. Skyrms, 2004).',
    },
    visual: { kind: 'matrix', game: STAG_HUNT, rowName: 'You', colName: 'Arjun', rowLabels: { stag: 'Big', hare: 'Safe' }, colLabels: { stag: 'Arjun: big', hare: 'Arjun: safe' } },
    predict: {
      question: 'If Arjun goes big 60% of the time, which choice has the higher expected payoff for you?',
      basis: 'calculable',
      modelAnswer: 'The safe job: 3 for sure vs 0.6 × 4 = 2.4.',
      options: [
        { id: 'hare', label: 'The safe job', verdict: 'match', feedback: 'Going big pays 4 only 60% of the time: 0.6 × 4 = 2.4. The safe job pays 3 whatever Arjun does.' },
        { id: 'stag', label: 'The big contract — 4 beats 3', verdict: 'misconception', feedback: '4 beats 3 only if Arjun joins. Weighted by his 60%, going big is worth 2.4, less than a sure 3.' },
        { id: 'same', label: 'They’re equal', verdict: 'defensible', feedback: 'They’re equal when Arjun goes big 75% of the time (0.75 × 4 = 3). At 60%, the safe job is ahead.' },
      ],
      solve: () => {
        const ev = rowExpected(STAG_HUNT, [0.6, 0.4]);
        return ev.hare > ev.stag ? 'hare' : ev.stag > ev.hare ? 'stag' : 'same';
      },
    },
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
    explain: [
      'Both-big and both-safe are each Nash equilibria: if you expect the other to go big, going big is best (4 > 3); if you expect them to play safe, safe is best (3 > 0).',
      'Both-big is better for both, but it is risky: it pays only if the other person is confident enough in you. Unlike the Prisoner’s Dilemma, nobody is tempted to betray a partner who goes big — the problem is trust, not temptation.',
    ],
    takeaway: 'When cooperation is a coordination problem, the question is whether each side is confident enough the other will join.',
    skill: 'coordination',
  }),
  defineScenario({
    id: 'l4.b.battle-of-sexes',
    lesson: 'coordination-problem',
    slot: 'B',
    version: 1,
    title: 'Which tool do we use?',
    purpose: 'Now you both want to match — but you disagree about which match is best.',
    setup: 'You and a colleague must use the same project tool. You prefer X, they prefer Y, and mismatching is worse for both than either tool. Last week your colleague already set up Y for the team.',
    rules: ['Both use X: you 3, colleague 2.', 'Both use Y: you 2, colleague 3.', 'Different tools: 0 each.'],
    formal: {
      players: 'You and your colleague.',
      actions: 'Use tool X or tool Y.',
      timing: 'Simultaneous, one shot.',
      information: 'Complete information. You both know the colleague has set up Y.',
      payoffs: 'In the table.',
      opponent: 'Your colleague uses Y (already set up).',
      solution: 'Two pure Nash equilibria (both X, both Y) with opposite preferences — a Battle of the Sexes.',
      source: 'canonical',
      sourceNote: 'Battle of the Sexes structure (Luce & Raiffa, 1957), relabelled.',
    },
    visual: { kind: 'matrix', game: TOOLS, rowName: 'You', colName: 'Colleague', rowLabels: { x: 'Tool X', y: 'Tool Y' }, colLabels: { x: 'They: X', y: 'They: Y' } },
    predict: {
      question: 'Which statement describes this game?',
      basis: 'calculable',
      modelAnswer: 'Two equilibria; each of you prefers a different one.',
      options: [
        { id: 'two-disagree', label: 'Two equilibria, and you each prefer a different one', verdict: 'match', feedback: 'Both-X and both-Y are each stable: nobody gains by switching alone. But you rank them oppositely (3 vs 2, 2 vs 3).' },
        { id: 'one', label: 'One equilibrium: the tool you prefer', verdict: 'misconception', feedback: 'Your preference alone doesn’t make it the only stable outcome. If both use Y, you’d lose by switching to X (0 < 2).' },
        { id: 'none', label: 'No equilibrium, because you disagree', verdict: 'misconception', feedback: 'Disagreement about which match is best doesn’t remove the matches: both are stable.' },
      ],
      solve: () => {
        const eq = pureNashEquilibria(TOOLS);
        const [a, b] = eq.map((e) => TOOLS.payoffs[TOOLS.rows.indexOf(e.row)][TOOLS.cols.indexOf(e.col)]);
        return eq.length === 2 && Math.sign(a[0] - b[0]) === -Math.sign(a[1] - b[1]) ? 'two-disagree' : 'other';
      },
    },
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
    explain: [
      'In the Stag Hunt, the issue was trust. Here you trust each other and both want to match; the conflict is over which match. Whoever gets their choice established first tends to win it.',
      'Once Y was in place, it became the focal choice: your best reply to Y is Y. Moving first, or having history on your side, is a kind of power in coordination games.',
    ],
    takeaway: 'Coordination with conflicting preferences is a fight over which equilibrium — and commitments or precedents often settle it.',
    skill: 'coordination',
  }),
  defineScenario({
    id: 'l4.c.focal-meeting',
    lesson: 'coordination-problem',
    slot: 'C',
    version: 1,
    title: 'Meet me in the city',
    purpose: 'No history, no messages, four options — only context can make one stand out.',
    setup: 'You and a friend agreed to meet in an unfamiliar city at noon, but forgot to say where. Phones are off. You both know you’re each arriving by train at the main station. Any place works if you both choose it.',
    rules: ['Four candidate spots. Meeting anywhere: 1 point each. Different spots: 0.', 'You each pick without communicating.'],
    formal: {
      players: 'You and your friend.',
      actions: 'Four meeting spots.',
      timing: 'Simultaneous, one shot.',
      information: 'Shared context: both arrive at the main station; neither knows the city.',
      payoffs: '1 each if you choose the same spot, 0 otherwise.',
      opponent: 'Your friend goes to the most prominent landmark you both pass: the station clock.',
      solution: 'Four pure equilibria (any matching spot). Theory alone can’t pick one; salience can.',
      source: 'adapted',
      sourceNote: 'Inspired by Schelling’s meeting puzzles in The Strategy of Conflict (1960); the spots and the friend’s rule are this app’s.',
    },
    predict: {
      question: 'Where do you expect your friend to go?',
      basis: 'uncertain',
      modelAnswer: 'No unique answer in theory; the station clock is the most salient shared reference.',
      options: [
        { id: 'clock', label: 'The station clock', verdict: 'reasonable', feedback: 'The most prominent landmark on a route you both share. Not guaranteed — but a good bet on what your friend expects you to expect.' },
        { id: 'cafe', label: 'Café Blue', verdict: 'reasonable', feedback: 'Possible if you had some shared reason to think of it. Nothing in the setup gives one.' },
        { id: 'library', label: 'The library steps', verdict: 'reasonable', feedback: 'A plausible meeting place, but nothing marks it out to both of you.' },
      ],
    },
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
    explain: [
      'With four equally good matches, the payoffs give no reason to prefer one. What makes a spot work is that each of you expects the other to expect it — salience from the shared context (you both arrive at the station).',
      'This differs from the stag hunt (where trust decided between a risky and a safe equilibrium) and from the tool choice (where you disagreed about which match was best): here nobody prefers any spot.',
    ],
    takeaway: 'When every match is equally good, look for what stands out to both of you given what you share.',
    skill: 'coordination',
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

const L5: ScenarioSpec[] = [
  defineScenario({
    id: 'l5.a.matching-pennies',
    lesson: 'predictability-trap',
    slot: 'A',
    version: 1,
    title: 'Matching pennies',
    purpose: 'The purest version of the trap: whatever you lean towards, an adaptive opponent can exploit.',
    setup: 'Ten rounds against Maya. Each round you both show heads or tails. If they match, you win a point; if they differ, Maya does. Maya watches what you do.',
    speaker: { character: 'maya', line: 'I have a rule for reading you. You’ll see it at the end.' },
    rules: ['Match: you +1. Differ: Maya +1.', '10 rounds. Maya chooses using only your previous rounds.'],
    formal: {
      players: 'You and Maya.',
      actions: 'Heads or tails, each round.',
      timing: '10 rounds of simultaneous moves.',
      information: 'Each round you both see the previous rounds.',
      payoffs: '+1 to you on a match, −1 otherwise (zero-sum).',
      opponent: 'Maya predicts your more frequent choice so far (tie: your last choice; round 1: a fair coin) and shows the opposite.',
      chance: 'Round 1 only: Maya’s fair coin.',
      solution: 'Unique mixed equilibrium: each plays heads with probability ½; expected score 0.',
      source: 'canonical',
      sourceNote: 'Matching Pennies, the textbook zero-sum game. Maya’s reading rule is this app’s.',
    },
    visual: { kind: 'matrix', game: MATCHING_PENNIES, rowName: 'You', colName: 'Maya', rowLabels: { H: 'Heads', T: 'Tails' }, colLabels: { H: 'Maya: H', T: 'Maya: T' } },
    predict: {
      question: 'What mix of heads and tails leaves an opponent nothing to exploit?',
      basis: 'calculable',
      modelAnswer: 'Heads half the time, unpredictably.',
      options: [
        { id: 'half', label: 'Heads half the time, in no pattern', verdict: 'match', feedback: 'At ½, Maya’s heads and tails win equally often against you, so no reading rule gains on average.' },
        { id: 'alternate', label: 'Alternate heads and tails', verdict: 'misconception', feedback: 'That’s half heads overall, but in a pattern. A rule that looks at your last move would beat it every round.' },
        { id: 'one-side', label: 'Stick to one side', verdict: 'misconception', feedback: 'The easiest pattern of all: once Maya sees it, she shows the opposite every time.' },
      ],
      solve: () => (Math.abs(mixedEquilibrium2x2(MATCHING_PENNIES)!.rowFirst - 0.5) < 1e-9 ? 'half' : 'other'),
    },
    play: penniesPlay,
    explain: [
      'Matching Pennies has no pure equilibrium: whatever you are known to favour, the other side plays the opposite. The only stable plan is to make each side equally likely, so your opponent’s choice can’t matter.',
      'A mixed strategy is a probability, not a pattern. “Alternate” has the right proportions but is perfectly predictable round by round.',
    ],
    takeaway: 'Against someone who profits from reading you, make your choice genuinely unpredictable — in the right proportions.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l5.b.penalty-mix',
    lesson: 'predictability-trap',
    slot: 'B',
    version: 1,
    title: 'Your stronger side',
    purpose: 'The payoffs are no longer symmetric — so the best mix isn’t 50/50.',
    setup: 'You have a stronger side. Choose how often you kick left; the keeper knows your mix and dives wherever it hurts you most. Twenty kicks are then taken.',
    rules: [
      'Kick left: 60% if the keeper dives left, 90% if right.',
      'Kick right: 90% if the keeper dives left, 30% if right.',
      'The keeper knows your mix and dives to the side that minimises your expected scoring.',
      '20 kicks, each drawn from your mix and the cell’s scoring chance.',
    ],
    formal: {
      players: 'You (kicker) and the keeper.',
      actions: 'You choose a probability of kicking left (0–100%).',
      timing: 'Your mix is known before the keeper chooses a dive (a worst-case keeper).',
      information: 'The keeper knows your mix but not each individual kick.',
      payoffs: 'Kicker: chance of scoring; keeper: minus that.',
      opponent: 'The keeper dives to the side with the lower expected scoring against your mix.',
      chance: 'Each kick’s side and its goal are drawn at random.',
      solution: 'Mixed equilibrium from indifference: kick left with probability 2/3, guaranteeing a 70% scoring chance.',
      source: 'adapted',
      sourceNote: 'Stylised asymmetric penalty game; numbers chosen so the equilibrium mix is 2/3.',
    },
    visual: { kind: 'matrix', game: PENALTY_ASYM, rowName: 'You', colName: 'Keeper', rowLabels: { left: 'Kick left', right: 'Kick right' }, colLabels: { left: 'Dive left', right: 'Dive right' } },
    predict: {
      question: 'Which mix guarantees the most against a keeper who knows it?',
      basis: 'calculable',
      modelAnswer: 'About two-thirds left, guaranteeing 70%.',
      options: [
        { id: 'two-thirds', label: 'About two-thirds to my stronger side (left)', verdict: 'match', feedback: 'At 2/3, a left dive and a right dive leave you the same 70% chance, so knowing your mix doesn’t help the keeper.' },
        { id: 'half', label: '50/50 — unpredictability means half and half', verdict: 'misconception', feedback: 'At 50/50 the keeper dives right and holds you to 60%. The right mix depends on the payoffs.' },
        { id: 'always-left', label: 'Always kick to my stronger side', verdict: 'misconception', feedback: 'A known “always left” lets the keeper dive left every time: 60%.' },
        { id: 'third', label: 'About one-third left', verdict: 'misconception', feedback: 'At one-third left, a right dive holds you to 50%: you kick to your weak side too often.' },
      ],
      solve: () => {
        const m = mixedEquilibrium2x2(PENALTY_ASYM)!;
        return Math.abs(m.rowFirst - 2 / 3) < 1e-9 ? 'two-thirds' : 'other';
      },
    },
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
    explain: [
      'Mix so the keeper is indifferent: p × 0.6 + (1 − p) × 0.9 = p × 0.9 + (1 − p) × 0.3 gives p = 2/3. At that mix every dive leaves you 70%.',
      'Strikingly, the keeper’s equilibrium mix also leans 2/3 towards your strong side. The proportions come from the payoffs — not from a rule of “randomise evenly”.',
    ],
    takeaway: 'Randomise in the proportions that make your opponent indifferent. Those proportions depend on the stakes.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l5.c.tax-audit',
    lesson: 'predictability-trap',
    slot: 'C',
    version: 1,
    title: 'The tax inspector',
    purpose: 'Inspection, not sport: auditing is costly, and evaders respond to how often you audit.',
    setup: 'You run tax inspections for 100 small businesses. Tax due is 10 each. An audit costs you 4. An audited evader pays the tax plus a fine of 15. You choose an audit rate; businesses know it and respond.',
    rules: [
      'Each business pays 10 (complies) or evades.',
      'An audited evader pays 25; an unaudited evader pays 0.',
      'Every audit costs you 4.',
      'Businesses evade when the expected payment (25 × audit rate) is below 10, and comply when it’s above. At exactly 40%, 16% of them evade (the equilibrium share).',
    ],
    formal: {
      players: 'You (inspector) and 100 businesses.',
      actions: 'You: audit rate 0–100%. Businesses: comply or evade.',
      timing: 'You announce the audit rate; businesses respond.',
      information: 'Businesses know the audit rate, not who will be audited.',
      payoffs: 'You: tax and fines collected minus audit costs. Business: minus its payment.',
      opponent: 'Businesses minimise expected payment; indifferent businesses evade 16% of the time.',
      solution: 'Mixed equilibrium of the simultaneous inspection game: audit 40%, evade 16% (from indifference).',
      source: 'adapted',
      sourceNote: 'A standard inspection game (cf. Tsebelis, 1989); numbers chosen for this app.',
    },
    predict: {
      question: 'At what audit rate is a business exactly indifferent between paying and evading?',
      basis: 'calculable',
      modelAnswer: '40%: 25 × 0.4 = 10.',
      options: [
        { id: '40', label: '40%', verdict: 'match', feedback: 'Evading costs 25 when audited, so the expected payment is 25 × rate. It equals the tax of 10 at a 40% rate.' },
        { id: '50', label: '50% — half the time', verdict: 'misconception', feedback: 'At 50% the expected payment from evading is 12.5, so everyone pays. The indifference point comes from the numbers, not from ½.' },
        { id: '16', label: '16%', verdict: 'misconception', feedback: '16% is the equilibrium share of evaders — what makes you indifferent about auditing — not the audit rate.' },
        { id: '100', label: '100% — audit everyone', verdict: 'defensible', feedback: 'That stops evasion, but you pay 4 per business to do it. The question is where businesses become indifferent.' },
      ],
      solve: () => {
        const a = AUDIT.tax / (AUDIT.tax + AUDIT.fine);
        return String(Math.round(a * 100));
      },
    },
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
    explain: [
      'In the simultaneous game, the inspector audits with the probability that makes businesses indifferent (40%), and businesses evade with the probability that makes the inspector indifferent (16%). Neither is 50%.',
      'Being unpredictable about who is audited is essential: a business that knew it wouldn’t be checked would always evade.',
    ],
    takeaway: 'Inspection only deters if it’s unpredictable — and the right rate comes from the costs and penalties involved.',
    skill: 'uncertainty',
  }),
];

// ── Lesson 6 · Competing for Advantage ───────────────────────────────────────

export const COURNOT = { a: 12, cost: 0 };
export const BERTRAND = { customers: 120, cost: 2, maxPrice: 8 };
export const PRICE_GRID = [2, 3, 4, 5, 6, 7, 8];
export const VOTERS = [2, 3, 5, 8, 10, 12, 14, 12, 8, 4, 3];

const L6: ScenarioSpec[] = [
  defineScenario({
    id: 'l6.a.cournot',
    lesson: 'market-competition',
    slot: 'A',
    version: 1,
    title: 'How much to produce?',
    purpose: 'Your output moves the market price for both of you.',
    setup: 'You and Rohan are the only two producers of a component. You each decide how many units to make this month. The more you both make, the lower the price: price = 12 − total units. Production is free.',
    speaker: { character: 'rohan', line: 'I’m making 4 units this month. Do what you like.' },
    rules: ['Price = 12 − (your units + Rohan’s units), never below 0.', 'Your profit = your units × price.', 'Rohan makes 4 units (he told you).'],
    formal: {
      players: 'You and Rohan.',
      actions: 'Units produced, 0–12.',
      timing: 'Simultaneous quantity choice (Cournot).',
      information: 'Complete information; Rohan has announced 4 units.',
      payoffs: 'Profit = q × (12 − Q), zero cost.',
      opponent: 'Rohan produces 4 units — his Cournot equilibrium quantity.',
      solution: 'Best response q = (12 − q_rival)/2; Cournot–Nash equilibrium 4 each.',
      source: 'canonical',
      sourceNote: 'Cournot (1838) duopoly with linear demand.',
    },
    predict: {
      question: 'If Rohan makes 4 units, how many maximise your profit?',
      basis: 'calculable',
      modelAnswer: '4 units: (12 − 4)/2.',
      options: [
        { id: '4', label: '4 units', verdict: 'match', feedback: 'Your profit is q × (8 − q), which peaks at q = 4: 16. Producing more drops the price faster than it adds sales.' },
        { id: '3', label: '3 units — keep the price high', verdict: 'defensible', feedback: '3 units is your share of the output that would maximise your joint profit. Against Rohan’s 4, though, it earns only 15.' },
        { id: '8', label: '8 units — flood the market', verdict: 'misconception', feedback: 'With 12 units in total, the price is 0. Extra output pushes the price down for every unit you sell.' },
        { id: '6', label: '6 units', verdict: 'misconception', feedback: '6 × (12 − 10) = 12, less than 16 at 4 units.' },
      ],
      solve: () => {
        const br = cournotBestResponses(COURNOT, 4, Array.from({ length: 13 }, (_, i) => i));
        return br.length === 1 ? String(br[0]) : 'tie';
      },
    },
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
    explain: [
      'With price 12 − total, your best output is half of what’s left after your rival: (12 − rival)/2. If both reason this way, the only consistent point is 4 each — the Cournot–Nash equilibrium.',
      'Like the Prisoner’s Dilemma, both would earn more by restraining (3 each, 18 profit), but against restrained output each firm’s best reply is to produce more.',
    ],
    takeaway: 'In quantity competition, your rival’s output shrinks the market left for you. Best replies — not totals — decide what’s stable.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l6.b.bertrand',
    lesson: 'market-competition',
    slot: 'B',
    version: 1,
    title: 'The price war',
    purpose: 'Compete on price instead of quantity, with identical products.',
    setup: 'You and a rival sell the same product to 120 customers, who all buy from whoever is cheaper (splitting evenly on a tie). Each unit costs you $2. Prices are in whole dollars, $2 to $8.',
    rules: ['Cheaper firm sells to all 120; equal prices split 60/60.', 'Profit = customers × (price − $2).', 'The rival has set its price; you’ll see it after you choose.'],
    formal: {
      players: 'You and the rival.',
      actions: 'Price $2–$8 in whole dollars.',
      timing: 'Simultaneous price choice (Bertrand).',
      information: 'Complete information; identical products, no capacity limits.',
      payoffs: 'Customers served × (price − 2).',
      opponent: 'The rival prices at $3 (one step above cost).',
      solution: 'Pure symmetric equilibria on this grid: both at $2, $3 or $4 (undercutting a matching price p by $1 pays only if p > 4). With finer price steps, prices are pushed to cost.',
      source: 'adapted',
      sourceNote: 'Bertrand (1883) price competition on a discrete grid.',
    },
    predict: {
      question: 'With whole-dollar prices and a $2 cost, which prices can both firms charge in equilibrium?',
      basis: 'calculable',
      modelAnswer: '$2, $3 or $4 — close to cost.',
      options: [
        { id: '2-3-4', label: '$2 to $4 — close to cost', verdict: 'match', feedback: 'At a matching price p, undercutting by $1 wins all 120 customers at p − 1. That beats sharing at p whenever p − 3 > (p − 2) ÷ 2, i.e. above $4. At $4 the two are equal, so nobody gains by undercutting.' },
        { id: '8', label: '$8 — the most customers will pay', verdict: 'misconception', feedback: 'At $8 each, cutting to $7 wins all 120 customers: 600 instead of 360. It isn’t stable.' },
        { id: '5', label: '$5 — a fair middle', verdict: 'misconception', feedback: 'At $5 each, a $4 price takes the whole market (240 vs 180).' },
      ],
      solve: () => {
        const eq = bertrandEquilibria(BERTRAND, PRICE_GRID).filter(([a, b]) => a === b).map(([a]) => a);
        return eq.join('-');
      },
    },
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
    explain: [
      'With identical products, whoever is cheaper takes everything, so any price well above cost invites undercutting. On a whole-dollar grid the undercutting stops by $4; with finer price steps it would be pushed all the way to cost.',
      'That result needs identical products, no capacity limits and customers who all compare prices. Loyalty, location or brand make products different, and prices can then stay well above cost.',
    ],
    takeaway: 'Price competition between identical products is brutal; the escape is to stop being identical.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l6.c.positioning',
    lesson: 'market-competition',
    slot: 'C',
    version: 1,
    title: 'Choosing a platform',
    purpose: 'Competition on position: voters, not customers, and an opponent who has already committed.',
    setup: 'An election with 81 voters spread along a 0–10 scale (more of them near the right-centre). Your opponent has announced a platform at 4. Each voter backs the nearer candidate; voters exactly halfway split.',
    rules: ['Voters per position 0…10: 2, 3, 5, 8, 10, 12, 14, 12, 8, 4, 3.', 'Each voter votes for the nearer candidate; equidistant voters split evenly.', 'More than 40.5 votes wins. Your opponent stays at 4.'],
    formal: {
      players: 'You and the opponent.',
      actions: 'Position 0–10.',
      timing: 'The opponent has committed to 4; you choose.',
      information: 'Complete information about voters.',
      payoffs: 'Votes received (out of 81).',
      opponent: 'Fixed at position 4.',
      solution: 'Best response to 4 is 5 (53 votes). With both free to move, both converge on the median voter (6).',
      source: 'adapted',
      sourceNote: 'Hotelling–Downs spatial competition with a stated voter distribution.',
    },
    visual: { kind: 'table', caption: 'Voters at each position', head: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], rows: [VOTERS.map(String)] },
    predict: {
      question: 'Where should you stand against an opponent at 4?',
      basis: 'calculable',
      modelAnswer: 'At 5, just beside them on the side with more voters (53 votes).',
      options: [
        { id: '5', label: 'At 5 — right beside them, on the crowded side', verdict: 'match', feedback: 'At 5 you win every voter from 5 upwards: 53 of 81. Moving further right only gives voters in between to your opponent.' },
        { id: '6', label: 'At 6 — the median voter', verdict: 'defensible', feedback: '6 wins too (47), and it’s where both candidates end up if both can move. But against a fixed 4, standing closer captures more.' },
        { id: '4', label: 'At 4 — copy them', verdict: 'misconception', feedback: 'Copying splits the vote 40.5–40.5. Moving one step right takes all the voters on that side.' },
        { id: '8', label: 'At 8 — offer a clear alternative', verdict: 'misconception', feedback: 'Voters at 5 are now closer to 4 and those at 6 split, so you’d win only 34.' },
      ],
      solve: () => {
        const br = lineBestResponses(VOTERS, 4);
        return br.length === 1 ? String(br[0]) : 'tie';
      },
    },
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
    explain: [
      'Against a fixed opponent, the best position is right beside them on the side with more voters: you keep that whole side. That is a best reply, not an equilibrium.',
      'If both could move, any gap would be closed and the candidates would converge on the median voter. Competition in position works like competition in price: each move changes the other’s best reply.',
    ],
    takeaway: 'Where you should stand depends on where your rival stands and where the crowd is — and both sides know it.',
    skill: 'anticipating',
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

const L7: ScenarioSpec[] = [
  defineScenario({
    id: 'l7.a.hawk-dove',
    lesson: 'evolution',
    slot: 'A',
    version: 1,
    title: 'Hawks and doves',
    purpose: 'Nobody chooses: strategies spread or shrink according to how well they do against the population.',
    setup: 'Animals compete for food worth 4. Hawks always fight; doves back off. Two hawks fight and each loses 6 half the time on average; a hawk takes everything from a dove; two doves share. You set the starting share of hawks and watch 40 generations.',
    rules: [
      'Hawk vs hawk: −1 each (share 4, risk injury 6). Hawk vs dove: 4 vs 0. Dove vs dove: 2 each.',
      'Each animal meets a random member of the population.',
      'Strategies that earn more than average grow in share next generation.',
    ],
    formal: {
      players: 'A large population of individuals, each born a hawk or a dove.',
      actions: 'None chosen by individuals: they play their inherited strategy.',
      timing: 'Random pairwise matching each generation.',
      information: 'Not applicable: no individual reasons.',
      payoffs: 'Hawk–Dove with V = 4, C = 6 (fitness = 2 + average payoff).',
      solution: 'Evolutionarily stable mixed population: hawk share V/C = 2/3.',
      source: 'canonical',
      sourceNote: 'Hawk–Dove game, Maynard Smith & Price (1973); discrete replicator dynamics.',
    },
    predict: {
      question: 'Starting from any mix that has both types, where does the hawk share settle?',
      basis: 'calculable',
      modelAnswer: 'About two-thirds hawks (V/C = 4/6).',
      options: [
        { id: 'two-thirds', label: 'About two-thirds hawks', verdict: 'match', feedback: 'When hawks are common, they mostly fight each other and do worse than doves; when rare, they do better. The balance is V/C = 2/3.' },
        { id: 'all-hawks', label: 'All hawks — aggression wins', verdict: 'misconception', feedback: 'Among hawks, fights cost more than they win (−1 each), and a dove earns 0 — more than −1. Doves invade.' },
        { id: 'half', label: 'Half and half', verdict: 'misconception', feedback: 'At 50% hawks, hawks still earn more than doves (1.5 vs 1). The rest point comes from the payoffs.' },
        { id: 'start', label: 'Wherever it starts', verdict: 'misconception', feedback: 'Unless both types earn the same, the better-earning one grows. Only at 2/3 do they earn the same.' },
      ],
      solve: () => {
        const x = interiorRestPoint(HAWK_DOVE);
        return x !== null && Math.abs(x - 2 / 3) < 1e-9 && isInteriorStable(HAWK_DOVE) ? 'two-thirds' : 'other';
      },
    },
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
    explain: [
      'A strategy’s success depends on who it meets. Hawks thrive among doves and suffer among hawks. The population settles where both earn the same — 2/3 hawks — and any drift away is pushed back. That makes it evolutionarily stable.',
      'Here 2/3 also equals the probability in the game’s mixed Nash equilibrium. But the interpretation differs: no animal randomises; the population’s proportions do the work.',
    ],
    takeaway: 'In a population, what spreads is what earns more against the current mix — and the mix moves until nothing earns more.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l7.b.driving',
    lesson: 'evolution',
    slot: 'B',
    version: 1,
    title: 'Which side of the road?',
    purpose: 'Change the payoffs to reward matching, and the mixed rest point stops being stable.',
    setup: 'Drivers in a new town each keep to the left or the right. Matching the oncoming driver is safe; mismatching is costly. You set the starting share of right-side drivers.',
    rules: ['Same side as the other driver: +2 each. Opposite sides: −4 each.', 'Drivers meet at random; the better-earning habit spreads.'],
    formal: {
      players: 'A large population of drivers.',
      actions: 'Inherited habit: keep right or keep left.',
      timing: 'Random pairwise encounters each generation.',
      information: 'Not applicable.',
      payoffs: 'Coordination game: match +2, mismatch −4 (fitness = 5 + average payoff).',
      solution: 'Two ESS (all right, all left). The 50/50 mix is a Nash equilibrium of the game but not evolutionarily stable.',
      source: 'adapted',
      sourceNote: 'Driving-convention coordination game (cf. Young, 1993); numbers are this app’s.',
    },
    predict: {
      question: 'If 55% start on the right, what happens?',
      basis: 'calculable',
      modelAnswer: 'Everyone ends up driving on the right.',
      options: [
        { id: 'all-right', label: 'Everyone ends up on the right', verdict: 'match', feedback: 'With slightly more right-drivers, a right-driver meets a match more often and earns more. That advantage grows until no left-drivers remain.' },
        { id: 'half', label: 'It settles at 50/50', verdict: 'misconception', feedback: '50/50 is a rest point, but an unstable one: any tilt makes the majority habit earn more and grow.' },
        { id: 'stays', label: 'It stays at 55%', verdict: 'misconception', feedback: 'At 55%, right-drivers earn more than left-drivers, so their share keeps growing.' },
      ],
      solve: () => (longRunShare(DRIVING, 0.55) === 1 ? 'all-right' : 'other'),
    },
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
    explain: [
      'When matching pays, the majority habit always earns more, so the population tips towards whichever side starts ahead. Either convention, once established, resists a few drivers doing the opposite.',
      'The 50/50 mix is still a mixed Nash equilibrium of the two-driver game — but it isn’t evolutionarily stable. Mixed equilibrium and evolutionary stability are different tests.',
    ],
    takeaway: 'Conventions get locked in by history: the payoffs say a convention will form, not which one.',
    skill: 'coordination',
  }),
  defineScenario({
    id: 'l7.c.rare-invader',
    lesson: 'evolution',
    slot: 'C',
    version: 1,
    title: 'Can a small group spread?',
    purpose: 'Test stability directly: introduce a few mutants and see if they grow.',
    setup: 'A population of Defectors plays 10-round partnerships. Reciprocators cooperate first and then copy their partner’s last move. You decide how large a group of Reciprocators arrives.',
    rules: [
      'Ten-round totals: Reciprocator–Reciprocator 30 each; Defector–Defector 10 each.',
      'Reciprocator–Defector: the Reciprocator gets 9, the Defector 14.',
      'Partners are matched at random; the better-earning type grows.',
    ],
    formal: {
      players: 'A large population: residents (Defectors) and invaders (Reciprocators).',
      actions: 'Inherited strategy.',
      timing: 'Random matching for 10-round Prisoner’s Dilemmas each generation.',
      information: 'Not applicable.',
      payoffs: 'Axelrod stage payoffs (5, 3, 1, 0) summed over 10 rounds.',
      solution: 'Both pure populations are ESS. Reciprocators spread only if they start above 1/17 ≈ 5.9%.',
      source: 'adapted',
      sourceNote: 'Invasion analysis in the spirit of Axelrod & Hamilton (1981); payoffs computed from 10 rounds.',
    },
    predict: {
      question: 'Can a 2% group of Reciprocators spread among Defectors?',
      basis: 'calculable',
      modelAnswer: 'No — when rare, they mostly meet Defectors and earn less.',
      options: [
        { id: 'no', label: 'No — they’re too rare to find each other', verdict: 'match', feedback: 'At 2%, a Reciprocator earns about 9.4 and a Defector about 10.1. The invaders shrink. They need to start above about 5.9%.' },
        { id: 'yes', label: 'Yes — cooperation pays 30 vs 10', verdict: 'misconception', feedback: '30 is what they earn with each other, but at 2% almost every partner is a Defector, against whom they earn 9.' },
        { id: 'any', label: 'Yes, any group will eventually take over', verdict: 'misconception', feedback: 'The Defector population resists small invasions: it is evolutionarily stable.' },
      ],
      solve: () => (longRunShare(RECIPROCATORS, 0.02) < 0.02 ? 'no' : 'yes'),
    },
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
    explain: [
      'A strategy is evolutionarily stable if a small group of alternatives can’t do better against the population. Rare Reciprocators mostly meet Defectors and earn 9 instead of 10, so they fade.',
      'Above about 5.9% they meet each other often enough that cooperation’s 30 outweighs the losses. Arriving together — in a cluster — is what lets cooperation take hold.',
    ],
    takeaway: 'Ask not only “is this strategy good?” but “does it do better than the residents when it is rare?”',
    skill: 'uncertainty',
  }),
];

export const MODULE2_SCENARIOS: ScenarioSpec[] = [...L4, ...L5, ...L6, ...L7];
