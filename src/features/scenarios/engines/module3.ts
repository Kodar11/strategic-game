import { type GameTree, backwardInduction, decision, equilibriumPath, leaf } from '../../../game/sequential.ts';
import { choicePlay, fmt, numberPlay, treePlay } from '../builders.ts';
import { type ScenarioEngine, defineEngine } from '../types.ts';

// ── Lesson 8 · Move First, Win More ──────────────────────────────────────────

export const LEADER_OPTIONS = [2, 4, 6, 8];
export const FOLLOWER_OPTIONS = [2, 3, 4, 5];
const stackPay = (q1: number, q2: number) => [q1 * Math.max(0, 12 - q1 - q2), q2 * Math.max(0, 12 - q1 - q2)];

export const STACKELBERG: GameTree = {
  players: ['You', 'Rohan'],
  root: decision(
    'leader',
    0,
    LEADER_OPTIONS.map((q1) => ({
      id: `q${q1}`,
      label: `Make ${q1} units`,
      child: decision(
        `f${q1}`,
        1,
        FOLLOWER_OPTIONS.map((q2) => ({ id: `r${q2}`, label: `Rohan makes ${q2}`, child: leaf(`l${q1}-${q2}`, stackPay(q1, q2)) })),
      ),
    })),
    'How many units do you commit to?',
  ),
};

export const CENTIPEDE: GameTree = {
  players: ['You', 'Maya'],
  root: decision(
    'n1',
    0,
    [
      { id: 'take1', label: 'Take', child: leaf('t1', [4, 1]) },
      {
        id: 'pass1',
        label: 'Pass',
        child: decision('n2', 1, [
          { id: 'take2', label: 'Maya takes', child: leaf('t2', [2, 8]) },
          {
            id: 'pass2',
            label: 'Maya passes',
            child: decision(
              'n3',
              0,
              [
                { id: 'take3', label: 'Take', child: leaf('t3', [16, 4]) },
                {
                  id: 'pass3',
                  label: 'Pass',
                  child: decision('n4', 1, [
                    { id: 'take4', label: 'Maya takes', child: leaf('t4', [8, 32]) },
                    { id: 'pass4', label: 'Maya passes', child: leaf('end', [64, 16]) },
                  ]),
                },
              ],
              'The pot has grown. Take or pass?',
            ),
          },
        ]),
      },
    ],
    'Take the larger pile now, or pass?',
  ),
};

/** Maya's scripted centipede policy: pass at her first turn, take at her last. */
export const mayaCentipede = (node: { id: string }) => (node.id === 'n2' ? 'pass2' : 'take4');

export function firstOfferTree(): GameTree {
  return {
    players: ['You', 'Colleague'],
    root: decision(
      'offer',
      0,
      Array.from({ length: 11 }, (_, x) => ({
        id: `o${x}`,
        label: `Offer ${x}`,
        child: decision(`resp${x}`, 1, [
          { id: 'accept', label: 'Accept', child: leaf(`a${x}`, [10 - x, x]) },
          { id: 'escalate', label: 'Escalate to the manager', child: leaf(`e${x}`, [3, 3]) },
        ]),
      })),
    ),
  };
}
const FIRST_OFFER = firstOfferTree();

const L8: ScenarioEngine[] = [
  defineEngine({
    id: 'l8.a.stackelberg',
    version: 1,
    play: treePlay({ tree: STACKELBERG, you: 0, opponentRule: 'Rohan’s rule: the best reply to the output he sees.', extraLines: () => ['With simultaneous moves (Lesson 6) you each made 4 and earned 16. Moving first is worth 2 more here — because your commitment changes Rohan’s best reply.'] }),
    solve: () => equilibriumPath(STACKELBERG)[0],
  }),
  defineEngine({
    id: 'l8.b.centipede',
    version: 1,
    play: treePlay({
      tree: CENTIPEDE,
      you: 0,
      policy: mayaCentipede,
      opponentRule: 'Maya’s rule (now revealed): pass at her first turn, take at her last. She doesn’t follow backward induction.',
      extraLines: (path) => [
        path.join('>') === 'pass1>pass2>take3'
          ? 'Against Maya’s actual rule, passing once and then taking (16) was your best plan.'
          : 'Against Maya’s actual rule, the best plan was to pass at turn 1 and take at turn 3 (16 coins).',
      ],
    }),
    solve: () => equilibriumPath(CENTIPEDE)[0],
    visualTree: CENTIPEDE,
  }),
  defineEngine({
    id: 'l8.c.first-offer',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'How many points do you offer your colleague?', min: 0, max: 10, step: 1, initial: 5, unit: 'points', cta: 'Make the offer' }, (x) => {
      const sol = backwardInduction(FIRST_OFFER);
      const accept = sol.choice[`resp${x}`] === 'accept';
      const [you, them] = accept ? [10 - x, x] : [3, 3];
      return {
        headline: accept ? `Your colleague accepts: ${10 - x} for you, ${x} for them.` : 'Your colleague escalates. The manager gives you 3 each.',
        stats: [
          { label: 'You', value: String(you), tone: 'blue' },
          { label: 'Colleague', value: String(them), tone: 'orange' },
        ],
        lines: ['Their rule: accept any offer worth at least what escalating gets them (3).', x === 3 ? 'Offering exactly 3 was the backward-induction offer: you keep 7.' : `The backward-induction offer was 3, which leaves you 7.`],
        path: [`o${x}`, accept ? 'accept' : 'escalate'],
      };
    }),
    solve: () => {
      const sol = backwardInduction(FIRST_OFFER);
      for (let x = 0; x <= 10; x++) if (sol.choice[`resp${x}`] === 'accept') return String(x);
      return 'none';
    },
  }),
];

// ── Lesson 9 · Threats and Credibility ───────────────────────────────────────

export const ENTRY: GameTree = {
  players: ['You', 'Rohan'],
  root: decision(
    'enter',
    0,
    [
      { id: 'out', label: 'Stay out', child: leaf('out', [0, 10]) },
      {
        id: 'in',
        label: 'Enter',
        child: decision('respond', 1, [
          { id: 'fight', label: 'Rohan starts a price war', child: leaf('fight', [-2, 2]) },
          { id: 'accommodate', label: 'Rohan shares the market', child: leaf('acc', [4, 5]) },
        ]),
      },
    ],
    'Do you open your shop in Rohan’s market?',
  ),
};

export const CAPACITY: GameTree = {
  players: ['You', 'Entrant'],
  root: decision(
    'invest',
    0,
    [
      {
        id: 'no-invest',
        label: 'Don’t build extra capacity',
        child: decision('e0', 1, [
          { id: 'out0', label: 'Entrant stays out', child: leaf('o0', [10, 0]) },
          {
            id: 'in0',
            label: 'Entrant enters',
            child: decision('r0', 0, [
              { id: 'fight0', label: 'Fight', child: leaf('f0', [2, -2]) },
              { id: 'acc0', label: 'Share the market', child: leaf('a0', [5, 4]) },
            ], 'The entrant is in. Fight or share?'),
          },
        ]),
      },
      {
        id: 'invest',
        label: 'Build extra capacity (costs 3)',
        child: decision('e1', 1, [
          { id: 'out1', label: 'Entrant stays out', child: leaf('o1', [7, 0]) },
          {
            id: 'in1',
            label: 'Entrant enters',
            child: decision('r1', 0, [
              { id: 'fight1', label: 'Fight', child: leaf('f1', [4, -2]) },
              { id: 'acc1', label: 'Share the market', child: leaf('a1', [2, 4]) },
            ], 'The entrant is in. Fight or share?'),
          },
        ]),
      },
    ],
    'Do you build extra capacity before the entrant decides?',
  ),
};

/** Lesson 9 transfer: a promise, not a threat. Payoffs (you, manager). Weekend work costs you 3 and is worth 8 to the manager; the bonus is 5. */
export const WEEKEND_BONUS: GameTree = {
  players: ['You', 'Manager'],
  root: decision(
    'work',
    0,
    [
      { id: 'normal', label: 'Work normal hours', child: leaf('normal', [0, 0]) },
      {
        id: 'weekend',
        label: 'Work the weekend',
        child: decision('bonus', 1, [
          { id: 'pay', label: 'Manager pays the bonus', child: leaf('paid', [2, 3]) },
          { id: 'skip', label: 'Manager skips the bonus', child: leaf('skipped', [-3, 8]) },
        ]),
      },
    ],
    'Do you work the weekend for the promised bonus?',
  ),
};

const L9: ScenarioEngine[] = [
  defineEngine({
    id: 'l9.a.market-entry',
    version: 1,
    play: treePlay({ tree: ENTRY, you: 0, opponentRule: 'Rohan’s rule: once you’ve decided, he does whatever pays him more from that point on.' }),
    solve: () => (backwardInduction(ENTRY).choice.respond === 'accommodate' ? 'no' : 'yes'),
    visualTree: ENTRY,
  }),
  defineEngine({
    id: 'l9.b.commitment',
    version: 1,
    play: treePlay({ tree: CAPACITY, you: 0, opponentRule: 'The entrant’s rule: work out how you would respond, and enter only if that leaves them better off than staying out.' }),
    solve: () => (backwardInduction(CAPACITY).choice.r1 === 'fight1' ? 'yes' : 'no'),
    visualTree: CAPACITY,
  }),
  defineEngine({
    id: 'l9.c.empty-threat',
    version: 2,
    play: treePlay({
      tree: WEEKEND_BONUS,
      you: 0,
      opponentRule: 'The manager’s rule: once the weekend is worked, do whatever pays the manager more.',
      extraLines: (p) => [
        p[0] === 'weekend'
          ? 'You trusted a promise that the manager had no reason to keep once your work was done.'
          : 'Declining was the sensible reply to an unenforceable promise — even though a kept promise would have left you both better off (2 and 3 instead of 0 and 0).',
      ],
    }),
    solve: () => (backwardInduction(WEEKEND_BONUS).choice.bonus === 'skip' ? 'no' : 'yes'),
    visualTree: WEEKEND_BONUS,
  }),
];

// ── Lesson 10 · Incentives and Hidden Actions ────────────────────────────────

export const SALES = { big: 100, small: 20, pHigh: 0.8, pLow: 0.4, effortCost: 8, base: 10 };
const expRevenue = (high: boolean) => (high ? SALES.pHigh : SALES.pLow) * SALES.big + (1 - (high ? SALES.pHigh : SALES.pLow)) * SALES.small;
/** The salesperson works hard iff the commission on the extra expected revenue covers the effort cost (ties: works hard). */
export function worksHard(commission: number): boolean {
  return commission * (expRevenue(true) - expRevenue(false)) >= SALES.effortCost - 1e-9;
}
export function managerProfit(commission: number): number {
  return expRevenue(worksHard(commission)) * (1 - commission) - SALES.base;
}

export const INSPECTION = { penalty: 10, detection: 0.75, care: 3, inspectCost: 2, defectLoss: 8 };
export function careful(rate: number): boolean {
  return INSPECTION.penalty * INSPECTION.detection * rate >= INSPECTION.care - 1e-9;
}
export function principalCost(rate: number): number {
  return INSPECTION.inspectCost * rate + (careful(rate) ? 0 : INSPECTION.defectLoss);
}

export const BEHAVIOURS = {
  thorough: { label: 'Thorough', calls: 8, solveRate: 0.9, minutes: 7.5, effort: 2 },
  fast: { label: 'Quick but careful', calls: 15, solveRate: 0.6, minutes: 4, effort: 2 },
  rush: { label: 'Rush and close', calls: 30, solveRate: 0.2, minutes: 2, effort: 1 },
} as const;
export type Behaviour = keyof typeof BEHAVIOURS;
export const SCHEMES = {
  'per-call': { label: '$1 per call closed', pay: (b: Behaviour) => BEHAVIOURS[b].calls * 1 },
  'per-quick-call': { label: '$1 per call under 3 minutes', pay: (b: Behaviour) => (BEHAVIOURS[b].minutes < 3 ? BEHAVIOURS[b].calls : 0) },
  'per-solved': { label: '$2 per problem solved (checked a week later)', pay: (b: Behaviour) => BEHAVIOURS[b].calls * BEHAVIOURS[b].solveRate * 2 },
} as const;
export type Scheme = keyof typeof SCHEMES;
export function agentBehaviour(scheme: Scheme): Behaviour {
  let best: Behaviour = 'thorough';
  for (const b of Object.keys(BEHAVIOURS) as Behaviour[]) {
    if (SCHEMES[scheme].pay(b) - BEHAVIOURS[b].effort > SCHEMES[scheme].pay(best) - BEHAVIOURS[best].effort + 1e-9) best = b;
  }
  return best;
}

const L10: ScenarioEngine[] = [
  defineEngine({
    id: 'l10.a.sales-commission',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'Commission rate on revenue', min: 0, max: 50, step: 5, initial: 10, unit: '%', percent: true, cta: 'Offer the contract' }, (x, rng) => {
      const c = x / 100;
      const hard = worksHard(c);
      const big = rng() < (hard ? SALES.pHigh : SALES.pLow);
      const rev = big ? SALES.big : SALES.small;
      const pay = SALES.base + c * rev;
      return {
        headline: `${hard ? 'They worked hard' : 'They took it easy'}, and made a ${big ? 'big' : 'small'} sale (${rev}).`,
        stats: [
          { label: 'Your expected profit', value: fmt(managerProfit(c)), tone: 'blue' },
          { label: 'This month', value: fmt(rev - pay), tone: 'blue' },
          { label: 'Their pay', value: fmt(pay), tone: 'orange' },
        ],
        lines: [
          `At ${x}%, hard work adds ${fmt(c * 32, 2)} to their expected pay against a cost of 8 — so ${hard ? 'it pays' : 'it doesn’t pay'}.`,
          'You only saw the sale, not the effort. A big sale can follow low effort (40%) and a small one hard work (20%), so the commission pays partly for luck.',
          `Expected profit: 0% → ${fmt(managerProfit(0))}, 20% → ${fmt(managerProfit(0.2))}, 25% → ${fmt(managerProfit(0.25))}, 50% → ${fmt(managerProfit(0.5))}.`,
        ],
      };
    }),
    solve: () => {
      for (let c = 0; c <= 50; c += 5) if (worksHard(c / 100)) return String(c);
      return 'none';
    },
  }),
  defineEngine({
    id: 'l10.b.quality-inspection',
    version: 1,
    play: numberPlay({ kind: 'number', prompt: 'Share of batches you inspect', min: 0, max: 100, step: 10, initial: 20, unit: '%', percent: true, cta: 'Run the quarter' }, (x, rng) => {
      const r = x / 100;
      const care = careful(r);
      const inspected = rng() < r;
      const caught = !care && inspected && rng() < INSPECTION.detection;
      return {
        headline: care ? 'The subcontractor worked carefully.' : caught ? 'Careless work — and this batch was caught.' : 'Careless work slipped through.',
        stats: [
          { label: 'Your expected cost / batch', value: fmt(principalCost(r), 2), tone: 'blue' },
          { label: 'At 40%', value: fmt(principalCost(0.4), 2), tone: 'amber' },
        ],
        lines: [
          `Expected bonus lost from carelessness at ${x}%: ${fmt(10 * 0.75 * r, 2)} vs a care cost of 3.`,
          r > 0.4 ? 'Inspecting more than 40% doesn’t change behaviour further; it only adds cost.' : r < 0.4 ? 'Below 40%, inspections cost money without changing behaviour.' : 'Exactly 40% is the cheapest rate that makes care worth it.',
        ],
      };
    }),
    solve: () => {
      for (let r = 0; r <= 100; r += 10) if (careful(r / 100)) return String(r);
      return 'none';
    },
  }),
  defineEngine({
    id: 'l10.c.metric-hacking',
    version: 1,
    play: choicePlay({ kind: 'choice', prompt: 'Which bonus scheme do you introduce?', options: (Object.keys(SCHEMES) as Scheme[]).map((id) => ({ id, label: SCHEMES[id].label })) }, (choice) => {
      const scheme = choice as Scheme;
      const b = agentBehaviour(scheme);
      const solved = BEHAVIOURS[b].calls * BEHAVIOURS[b].solveRate;
      return {
        headline: `The agent switched to “${BEHAVIOURS[b].label}”.`,
        stats: [
          { label: 'Problems solved / hour', value: fmt(solved, 1), tone: 'blue' },
          { label: 'Calls / hour', value: String(BEHAVIOURS[b].calls) },
          { label: 'Bonus / hour', value: `$${fmt(SCHEMES[scheme].pay(b), 1)}`, tone: 'orange' },
        ],
        lines: [
          (Object.keys(BEHAVIOURS) as Behaviour[]).map((x) => `${BEHAVIOURS[x].label}: ${fmt(SCHEMES[scheme].pay(x) - BEHAVIOURS[x].effort, 1)}`).join(' · ') + ' (pay − effort)',
          scheme === 'per-solved' ? 'Paying for the goal itself (checked later) made the most useful style the best-paid one.' : 'The metric rose while the goal — problems solved — fell to 6 per hour.',
        ],
      };
    }),
    solve: () => agentBehaviour('per-call'),
  }),
];

export const MODULE3_ENGINES: ScenarioEngine[] = [...L8, ...L9, ...L10];
