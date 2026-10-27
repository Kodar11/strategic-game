import { type GameTree, backwardInduction, decision, equilibriumPath, leaf } from '../../../game/sequential.ts';
import { choicePlay, fmt, numberPlay, pct, treePlay } from '../builders.ts';
import { type ScenarioSpec, defineScenario } from '../types.ts';

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

const L8: ScenarioSpec[] = [
  defineScenario({
    id: 'l8.a.stackelberg',
    lesson: 'sequential-moves',
    slot: 'A',
    version: 1,
    title: 'Commit first',
    purpose: 'The quantity game from Lesson 6 — but now you move first and Rohan sees your choice.',
    setup: 'Same market as before: price = 12 − total units, free production. This time you commit to your output first, publicly. Rohan sees it and then picks his.',
    rules: ['You choose 2, 4, 6 or 8 units.', 'Rohan sees your choice, then chooses 2, 3, 4 or 5 units.', 'Profit = units × (12 − total).'],
    formal: {
      players: 'You (leader) and Rohan (follower).',
      actions: 'You: 2, 4, 6 or 8 units. Rohan: 2–5 units.',
      timing: 'Sequential: you move first; Rohan observes, then moves.',
      information: 'Perfect information: Rohan sees your quantity.',
      payoffs: 'q × (12 − Q) each.',
      opponent: 'Rohan picks his profit-maximising reply to whatever you chose.',
      solution: 'Backward induction (Stackelberg): commit to 6; Rohan replies 3.',
      source: 'canonical',
      sourceNote: 'Stackelberg (1934) leadership, on a discrete grid.',
    },
    visual: {
      kind: 'table',
      caption: 'Profits (you, Rohan) for each pair of outputs',
      head: ['You ↓ · Rohan →', ...FOLLOWER_OPTIONS.map(String)],
      rows: LEADER_OPTIONS.map((q1) => [String(q1), ...FOLLOWER_OPTIONS.map((q2) => stackPay(q1, q2).join(', '))]),
    },
    predict: {
      question: 'Knowing Rohan will see your output and reply, how many units should you commit to?',
      basis: 'calculable',
      modelAnswer: '6 units: Rohan replies 3, and you earn 18.',
      options: [
        { id: 'q6', label: '6 units', verdict: 'match', feedback: 'Work backwards: after 2 he makes 5, after 4 → 4, after 6 → 3, after 8 → 2. Your profits: 10, 16, 18, 16. Committing to 6 is best.' },
        { id: 'q4', label: '4 units — the Cournot amount', verdict: 'defensible', feedback: '4 was best when you moved at the same time. Moving first lets you take more, because Rohan will shrink his output in response.' },
        { id: 'q8', label: '8 units — grab the market', verdict: 'misconception', feedback: 'Rohan cuts to 2, but the price falls to 2: you earn 16, less than 18 at 6.' },
        { id: 'q2', label: '2 units — keep the price up', verdict: 'misconception', feedback: 'Rohan expands to 5 and you earn only 10.' },
      ],
      solve: () => equilibriumPath(STACKELBERG)[0],
    },
    play: treePlay({ tree: STACKELBERG, you: 0, opponentRule: 'Rohan’s rule: the best reply to the output he sees.', extraLines: () => ['With simultaneous moves (Lesson 6) you each made 4 and earned 16. Moving first is worth 2 more here — because your commitment changes Rohan’s best reply.'] }),
    explain: [
      'Backward induction: first work out what the follower will do after each of your choices, then pick the choice whose consequence is best for you.',
      'Rohan’s best reply falls as your output rises. By committing to more than the Cournot amount, you push him to produce less. This only works because your output is visible and can’t be undone before he moves.',
    ],
    takeaway: 'When others see your move before theirs, choose by asking how they will respond — then pick the response you like best.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l8.b.centipede',
    lesson: 'sequential-moves',
    slot: 'B',
    version: 1,
    title: 'The growing pot',
    purpose: 'Longer sequences: backward induction makes a sharp prediction that people often don’t follow.',
    setup: 'A pot of coins grows each time someone passes. At each turn the mover can take the larger pile (ending the game) or pass. You move first; Maya moves second; you alternate for up to four turns.',
    speaker: { character: 'maya', line: 'I have my own plan for this. You’ll see it at the end.' },
    rules: ['Turn 1 (you): take → you 4, Maya 1.', 'Turn 2 (Maya): take → you 2, Maya 8.', 'Turn 3 (you): take → you 16, Maya 4.', 'Turn 4 (Maya): take → you 8, Maya 32; pass → you 64, Maya 16.'],
    formal: {
      players: 'You and Maya.',
      actions: 'Take or pass at each turn.',
      timing: 'Sequential, alternating, four turns.',
      information: 'Perfect information.',
      payoffs: 'Coins, as listed.',
      opponent: 'Scripted: Maya passes at her first turn and takes at her last (revealed afterwards).',
      solution: 'Backward induction / subgame-perfect equilibrium: take at the first turn.',
      source: 'adapted',
      sourceNote: 'Centipede game (Rosenthal, 1981). Payoffs mirror the doubling structure of McKelvey & Palfrey’s (1992) four-move version, scaled to whole coins.',
    },
    visual: { kind: 'tree', tree: CENTIPEDE },
    predict: {
      question: 'What does backward induction predict you do at turn 1?',
      basis: 'calculable',
      modelAnswer: 'Take immediately (4 coins).',
      options: [
        { id: 'take1', label: 'Take immediately', verdict: 'match', feedback: 'At turn 4 Maya takes (32 > 16). So at turn 3 you take (16 > 8). So at turn 2 Maya takes (8 > 4). So at turn 1 you take (4 > 2).' },
        { id: 'pass1', label: 'Pass — the pot grows', verdict: 'defensible', feedback: 'It grows, but each mover’s best reply at the end is to take. Backward induction unravels the whole chain — though many real players pass anyway.' },
      ],
      solve: () => equilibriumPath(CENTIPEDE)[0],
    },
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
    explain: [
      'Backward induction predicts the game ends at the first move, with tiny payoffs. In laboratory versions, most people pass at least once — a well-documented gap between the formal prediction and behaviour.',
      'The prediction depends on everyone being rational and believing everyone else is too, at every step. If you think Maya might pass, passing can be your best reply — which is exactly what happened here.',
    ],
    takeaway: 'Backward induction tells you what perfectly rational players do. Real opponents may not be — and your best plan depends on what they actually do.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l8.c.first-offer',
    lesson: 'sequential-moves',
    slot: 'C',
    version: 1,
    title: 'Splitting the bonus',
    purpose: 'A first offer at work: anticipate what the other person can do if they say no.',
    setup: 'You and a colleague share a 10-point project bonus. You propose a split. Your colleague can accept, or escalate to the manager, who will split it evenly but charge each of you 2 points for the hassle.',
    rules: ['You offer your colleague 0–10 points; you keep the rest.', 'If they accept, that’s the split.', 'If they escalate, you each get 5 − 2 = 3.', 'A colleague who is exactly indifferent accepts.'],
    formal: {
      players: 'You and your colleague.',
      actions: 'You: an offer 0–10. Colleague: accept or escalate.',
      timing: 'Sequential: offer, then response.',
      information: 'Perfect information.',
      payoffs: 'Accepted: (10 − x, x). Escalated: (3, 3).',
      opponent: 'Your colleague accepts any offer worth at least as much as escalating (3).',
      ties: 'Indifferent colleague accepts.',
      solution: 'Backward induction: offer exactly 3, keep 7.',
      source: 'original',
      sourceNote: 'A take-it-or-leave-it offer with an outside option, designed for this app.',
    },
    predict: {
      question: 'What is the smallest offer your colleague will accept?',
      basis: 'calculable',
      modelAnswer: '3 — what escalating would get them.',
      options: [
        { id: '3', label: '3 points', verdict: 'match', feedback: 'Escalating gives them 3. Any offer of at least 3 is as good as escalating, so they accept; anything less, they escalate.' },
        { id: '5', label: '5 points — an even split', verdict: 'defensible', feedback: 'They’d accept 5, but they would also accept 3. What they can get by saying no sets the floor, not fairness.' },
        { id: '1', label: 'Any positive amount', verdict: 'misconception', feedback: 'They have an alternative worth 3. Offering less makes saying no the better choice for them.' },
      ],
      solve: () => {
        const sol = backwardInduction(FIRST_OFFER);
        for (let x = 0; x <= 10; x++) if (sol.choice[`resp${x}`] === 'accept') return String(x);
        return 'none';
      },
    },
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
    explain: [
      'Start from the last move: your colleague compares your offer with 3. Knowing that, your best offer is the smallest one they accept — exactly 3.',
      'The power in this exchange comes from the timing (you propose) and from your colleague’s alternative (escalation). Change the alternative and the offer changes with it.',
    ],
    takeaway: 'Before you make a first offer, work out what the other side can get by refusing. That sets what you need to offer.',
    skill: 'anticipating',
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

export const LATE_PAYMENT: GameTree = {
  players: ['You', 'Supplier'],
  root: decision(
    'pay',
    0,
    [
      { id: 'on-time', label: 'Pay on time', child: leaf('ontime', [0, 0]) },
      {
        id: 'late',
        label: 'Pay late again',
        child: decision('react', 1, [
          { id: 'cut', label: 'Supplier cuts you off', child: leaf('cut', [-6, -10]) },
          { id: 'tolerate', label: 'Supplier tolerates it', child: leaf('tol', [2, -1]) },
        ]),
      },
    ],
    'Do you pay this invoice on time?',
  ),
};

const L9: ScenarioSpec[] = [
  defineScenario({
    id: 'l9.a.market-entry',
    lesson: 'credibility',
    slot: 'A',
    version: 1,
    title: '“Enter and I’ll crush you”',
    purpose: 'Test a threat with backward induction: would carrying it out make sense?',
    setup: 'You’re thinking of opening a shop in Rohan’s town. He has made his position clear.',
    speaker: { character: 'rohan', line: 'Open here and I’ll start a price war. We’ll both bleed, but you’ll bleed more.' },
    rules: ['Stay out: you 0, Rohan 10.', 'Enter and Rohan fights: you −2, Rohan 2.', 'Enter and Rohan shares: you 4, Rohan 5.', 'Rohan decides after seeing whether you entered.'],
    formal: {
      players: 'You (entrant) and Rohan (incumbent).',
      actions: 'You: enter or stay out. Rohan, after entry: fight or accommodate.',
      timing: 'Sequential.',
      information: 'Perfect information; payoffs common knowledge.',
      payoffs: 'As listed (you first).',
      opponent: 'After entry, Rohan does what pays him more at that point.',
      solution: 'Subgame-perfect equilibrium: enter, Rohan accommodates. The threat is not credible.',
      source: 'canonical',
      sourceNote: 'The standard entry-deterrence game (cf. Selten, 1978).',
    },
    visual: { kind: 'tree', tree: ENTRY },
    predict: {
      question: 'If you enter, will Rohan really start a price war?',
      basis: 'calculable',
      modelAnswer: 'No: once you’re in, fighting pays him 2 and sharing 5.',
      options: [
        { id: 'no', label: 'No — once I’m in, fighting costs him', verdict: 'match', feedback: 'After entry, Rohan compares 2 (fight) with 5 (share). Carrying out the threat would hurt him, so a rational Rohan shares.' },
        { id: 'yes', label: 'Yes — he said he would', verdict: 'misconception', feedback: 'Saying it costs nothing. What matters is his payoff when the moment comes: 2 vs 5.' },
        { id: 'maybe', label: 'Maybe, to look tough for the future', verdict: 'depends', feedback: 'Reputation for future entrants could change things — but that’s a bigger game than this one. In this one-off market, fighting simply loses him 3.' },
      ],
      solve: () => (backwardInduction(ENTRY).choice.respond === 'accommodate' ? 'no' : 'yes'),
    },
    play: treePlay({ tree: ENTRY, you: 0, opponentRule: 'Rohan’s rule: once you’ve decided, he does whatever pays him more from that point on.' }),
    explain: [
      'A threat is credible only if carrying it out is in the threatener’s interest when the time comes. Rohan’s fight pays him 2; sharing pays 5. Once you’re in, he won’t fight.',
      'Backward induction exposes the empty threat: solve Rohan’s choice first, then yours. Entering earns 4 > 0.',
    ],
    takeaway: 'Judge a threat by what it would cost the person to carry it out — not by how loudly it’s made.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l9.b.commitment',
    lesson: 'credibility',
    slot: 'B',
    version: 1,
    title: 'Making the threat real',
    purpose: 'Now you’re the incumbent — and you can change your own future incentives before the entrant decides.',
    setup: 'You run the only shop in town and a newcomer is deciding whether to enter. Before they decide, you can build extra capacity (cost 3). Spare capacity makes a price war cheaper for you and sharing worse.',
    rules: [
      'Without capacity: entrant stays out → you 10; enters → you fight (2) or share (5); entrant gets −2 if you fight, 4 if you share.',
      'With capacity (cost 3 already counted): stays out → you 7; enters → fight 4 or share 2; entrant gets −2 or 4.',
      'The entrant sees whether you built capacity, then decides.',
    ],
    formal: {
      players: 'You (incumbent) and the entrant.',
      actions: 'You: build capacity or not; later, fight or share if they enter. Entrant: enter or stay out.',
      timing: 'Sequential: capacity → entry → response.',
      information: 'Perfect information.',
      payoffs: 'As listed (you first).',
      opponent: 'The entrant enters only if your later best response would leave them better off than staying out.',
      solution: 'Subgame-perfect equilibrium: build capacity; the entrant stays out; you earn 7 (vs 5 without).',
      source: 'adapted',
      sourceNote: 'Capacity as a strategic commitment, after Dixit (1980); numbers are this app’s.',
    },
    visual: { kind: 'tree', tree: CAPACITY },
    predict: {
      question: 'After you build capacity, is the threat to fight credible?',
      basis: 'calculable',
      modelAnswer: 'Yes: with capacity, fighting pays you 4 and sharing only 2.',
      options: [
        { id: 'yes', label: 'Yes — fighting now pays me more than sharing', verdict: 'match', feedback: 'With spare capacity, a price war pays 4 and sharing 2. The entrant can see that and stays out.' },
        { id: 'no', label: 'No — threats are never credible', verdict: 'misconception', feedback: 'A threat becomes credible when carrying it out is in your interest. The investment changed exactly that.' },
        { id: 'sunk', label: 'Yes — because the money is spent and can’t be recovered', verdict: 'defensible', feedback: 'Irreversibility matters, but only because it changes your payoffs: fight now beats share (4 > 2). An irreversible spend that didn’t change that comparison wouldn’t help.' },
      ],
      solve: () => (backwardInduction(CAPACITY).choice.r1 === 'fight1' ? 'yes' : 'no'),
    },
    play: treePlay({ tree: CAPACITY, you: 0, opponentRule: 'The entrant’s rule: work out how you would respond, and enter only if that leaves them better off than staying out.' }),
    explain: [
      'Without capacity, if the entrant comes in you’d rather share (5 > 2), so they enter and you get 5. With capacity, you’d rather fight (4 > 2), so they stay out and you get 7.',
      'The investment works because it changes your own future incentives — not because it is big, loud or irreversible in itself.',
    ],
    takeaway: 'To make a threat credible, change what you’ll want to do when the time comes — and make sure the other side can see it.',
    skill: 'incentives',
  }),
  defineScenario({
    id: 'l9.c.empty-threat',
    lesson: 'credibility',
    slot: 'C',
    version: 1,
    title: 'The late payment',
    purpose: 'A different setting: a supplier’s threat that sounds serious.',
    setup: 'Your firm keeps paying a supplier late. Their account manager emails: “One more late payment and we stop supplying you.” You are their biggest customer.',
    rules: ['Pay on time: both 0 (baseline).', 'Pay late and they cut you off: you −6 (finding a new supplier), they −10 (losing the account).', 'Pay late and they tolerate it: you +2 (cash flow), they −1 (interest lost).'],
    formal: {
      players: 'You (customer) and the supplier.',
      actions: 'You: pay on time or late. Supplier, after a late payment: cut off or tolerate.',
      timing: 'Sequential.',
      information: 'Perfect information; one-off decision.',
      payoffs: 'As listed (you first).',
      opponent: 'After a late payment, the supplier does what pays it more.',
      solution: 'Subgame-perfect equilibrium: pay late; the supplier tolerates.',
      source: 'original',
      sourceNote: 'Designed for this app; same structure as the entry game.',
    },
    visual: { kind: 'tree', tree: LATE_PAYMENT },
    predict: {
      question: 'Is the supplier’s threat credible?',
      basis: 'calculable',
      modelAnswer: 'No: cutting you off costs them 10, tolerating costs 1.',
      options: [
        { id: 'no', label: 'No — cutting off its biggest customer hurts it more', verdict: 'match', feedback: 'After a late payment, the supplier compares −10 with −1. Carrying out the threat is the worse option for them.' },
        { id: 'yes', label: 'Yes — they put it in writing', verdict: 'misconception', feedback: 'Writing it down doesn’t change their payoffs unless it creates a real cost to backing down.' },
        { id: 'reputation', label: 'It depends on whether they need a tough reputation', verdict: 'depends', feedback: 'With many customers watching over many periods, fighting once might pay. That’s a different, repeated game — not the one described.' },
      ],
      solve: () => (backwardInduction(LATE_PAYMENT).choice.react === 'tolerate' ? 'no' : 'yes'),
    },
    play: treePlay({ tree: LATE_PAYMENT, you: 0, opponentRule: 'The supplier’s rule: once you’ve paid late, do what costs it less.', extraLines: (p) => [p[0] === 'late' ? 'Ethics and long-term relationships aside, the threat didn’t change the supplier’s incentive once the payment was late.' : 'Paying on time is the cooperative choice — but on these payoffs the threat wasn’t what should have made you do it.'] }),
    explain: [
      'Same structure as the entry game: the threatened action hurts the threatener. Backward induction says the supplier tolerates the late payment.',
      'Where reputation matters — many customers, many periods — the analysis can change. Selten’s “chain-store paradox” (1978) shows that even then, backward induction over a known, finite number of markets predicts no fighting, which many find counter-intuitive; models with uncertainty about the incumbent’s type can restore deterrence.',
    ],
    takeaway: 'Before giving in to a threat, ask: if I call the bluff, what will they actually prefer to do?',
    skill: 'anticipating',
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

const L10: ScenarioSpec[] = [
  defineScenario({
    id: 'l10.a.sales-commission',
    lesson: 'incentive-shift',
    slot: 'A',
    version: 1,
    title: 'The commission plan',
    purpose: 'From rules between rivals to a contract with someone whose effort you can’t see.',
    setup: 'You hire a salesperson. You can see their sales, but not how hard they worked. Hard work makes a big sale more likely, but even a lazy month can get lucky. You pay a base of 10 plus a commission on revenue.',
    rules: [
      'Hard work (costs them 8): a big sale (100) with chance 80%, otherwise a small one (20).',
      'Low effort (costs 0): a big sale with chance 40%.',
      'You choose the commission rate; they choose effort to maximise pay minus effort cost (indifferent → hard work).',
    ],
    formal: {
      players: 'You (principal) and the salesperson (agent).',
      actions: 'You: commission rate 0–50%. Agent: high or low effort (hidden).',
      timing: 'You offer the contract; the agent chooses effort; a sale is drawn.',
      information: 'Hidden action: effort is not observed, only revenue.',
      payoffs: 'Agent: 10 + rate × revenue − effort cost. You: revenue − pay.',
      opponent: 'The agent chooses effort to maximise expected pay minus cost; ties → high effort.',
      chance: 'Big sale with probability 0.8 (high effort) or 0.4 (low).',
      solution: 'High effort needs rate × 32 ≥ 8, i.e. at least 25%. Your expected profit is highest at exactly 25% (53).',
      source: 'adapted',
      sourceNote: 'A textbook moral-hazard (principal–agent) model with two effort levels; numbers are this app’s.',
    },
    predict: {
      question: 'What is the lowest commission that makes hard work pay for the salesperson?',
      basis: 'calculable',
      modelAnswer: '25%: hard work adds 32 in expected revenue, and 25% of 32 = 8, its cost.',
      options: [
        { id: '25', label: '25%', verdict: 'match', feedback: 'Hard work raises expected revenue from 52 to 84 (+32). At 25% the agent gains 8 — exactly the effort cost.' },
        { id: '10', label: '10%', verdict: 'misconception', feedback: 'At 10% the agent gains only 3.2 from working hard, less than its cost of 8.' },
        { id: '50', label: '50%', verdict: 'defensible', feedback: 'That works, but you give away far more than needed: 25% already makes hard work worth it.' },
        { id: '0', label: 'None — the base salary is enough', verdict: 'misconception', feedback: 'The base is paid whatever happens, so it rewards nothing about effort.' },
      ],
      solve: () => {
        for (let c = 0; c <= 50; c += 5) if (worksHard(c / 100)) return String(c);
        return 'none';
      },
    },
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
    explain: [
      'Because effort is hidden, you can’t pay for it directly. You pay for something you can see — revenue — that is linked to effort. The commission must make the extra expected pay from effort cover its cost: rate × 32 ≥ 8.',
      'This is moral hazard: a hidden action. It differs from hidden types (Lessons 15–18), where the problem is what someone is, not what they do.',
    ],
    takeaway: 'When you can’t see effort, reward an observable outcome tied to it — just enough to make effort pay, and no more.',
    skill: 'incentives',
  }),
  defineScenario({
    id: 'l10.b.quality-inspection',
    lesson: 'incentive-shift',
    slot: 'B',
    version: 1,
    title: 'Checking the batches',
    purpose: 'Instead of paying for results, you watch — but watching costs money and misses things.',
    setup: 'A subcontractor makes batches for you. Working carefully costs them 3 per batch. You can inspect some batches; each inspection costs you 2 and catches careless work 75% of the time. A caught careless batch loses the subcontractor its 10 bonus. A careless batch that ships costs you 8.',
    rules: [
      'You choose the share of batches inspected.',
      'The subcontractor is careful if 10 × 75% × inspection rate ≥ 3 (indifferent → careful).',
      'Your cost per batch = 2 × inspection rate + 8 if they’re careless.',
    ],
    formal: {
      players: 'You (principal) and the subcontractor (agent).',
      actions: 'You: inspection rate 0–100%. Agent: careful or careless (hidden).',
      timing: 'You announce the inspection rate; the agent chooses care.',
      information: 'Hidden action, imperfectly observed: inspections detect carelessness with probability 0.75.',
      payoffs: 'Agent: bonus 10 unless caught − care cost. You: −(inspection cost + defect loss).',
      opponent: 'The agent is careful iff the expected bonus lost from carelessness covers the cost of care.',
      solution: 'Care requires 7.5 × rate ≥ 3, i.e. rate ≥ 40%. The cheapest rate that achieves it is 40% (cost 0.8).',
      source: 'original',
      sourceNote: 'Designed for this app; it extends the imperfect-detection rule from this lesson to a principal–agent setting.',
    },
    predict: {
      question: 'What is the minimum inspection rate that makes careful work pay?',
      basis: 'calculable',
      modelAnswer: '40%: 10 × 0.75 × 0.4 = 3.',
      options: [
        { id: '40', label: '40%', verdict: 'match', feedback: 'Careless work is caught only 75% of the time when inspected, so the expected loss is 10 × 0.75 × rate. It reaches 3 at 40%.' },
        { id: '30', label: '30%', verdict: 'misconception', feedback: '30% would be enough if every inspection caught carelessness (10 × 0.3 = 3). Detection is only 75%, so you need more.' },
        { id: '100', label: '100%', verdict: 'defensible', feedback: 'Inspecting everything works but costs 2 per batch. 40% achieves the same behaviour for 0.8.' },
      ],
      solve: () => {
        for (let r = 0; r <= 100; r += 10) if (careful(r / 100)) return String(r);
        return 'none';
      },
    },
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
    explain: [
      'Monitoring replaces a reward with a risk of losing one. Because detection is imperfect, the inspection rate must be higher than if every inspection caught the problem: 3 ÷ (10 × 0.75) = 40%.',
      'Below the threshold, inspections are pure cost; above it, extra inspections are wasted. The design question is the cheapest combination of rate, detection and penalty that makes the desired action pay.',
    ],
    takeaway: 'Monitoring works through expected penalties: rate × detection × penalty must beat the gain from cutting corners.',
    skill: 'incentives',
  }),
  defineScenario({
    id: 'l10.c.metric-hacking',
    lesson: 'incentive-shift',
    slot: 'C',
    version: 1,
    title: 'The call-centre bonus',
    purpose: 'A different workplace: what you measure can become what people do instead of the goal.',
    setup: 'You manage a support agent. The goal is problems actually solved. You can only pay for something measurable. The agent picks a working style to maximise bonus minus effort.',
    rules: [
      'Thorough: 8 calls/hour, 90% solved, 7.5 min each, effort 2.',
      'Quick but careful: 15 calls/hour, 60% solved, 4 min each, effort 2.',
      'Rush and close: 30 calls/hour, 20% solved, 2 min each, effort 1.',
      'The agent picks the style with the highest pay − effort.',
    ],
    formal: {
      players: 'You (manager) and the agent.',
      actions: 'You: one of three bonus schemes. Agent: one of three working styles.',
      timing: 'You choose the scheme; the agent chooses a style.',
      information: 'Style isn’t observed directly; only the metric in the scheme is.',
      payoffs: 'Agent: bonus − effort. You care about problems solved per hour.',
      opponent: 'The agent maximises bonus − effort.',
      solution: 'Per call or per quick call → rush (6 solved/hour). Per solved problem → quick but careful (9 solved/hour).',
      source: 'original',
      sourceNote: 'Designed for this app. The idea is often summarised as Goodhart’s law; the multitask logic follows Holmström & Milgrom (1991).',
    },
    visual: {
      kind: 'table',
      head: ['Style', 'Calls/h', 'Solved', 'Min/call', 'Effort'],
      rows: (Object.keys(BEHAVIOURS) as Behaviour[]).map((b) => [BEHAVIOURS[b].label, String(BEHAVIOURS[b].calls), pct(BEHAVIOURS[b].solveRate), String(BEHAVIOURS[b].minutes), String(BEHAVIOURS[b].effort)]),
    },
    predict: {
      question: 'Under “$1 per call closed”, which style will the agent choose?',
      basis: 'calculable',
      modelAnswer: 'Rush and close: 30 − 1 = 29 beats 13 and 6.',
      options: [
        { id: 'rush', label: 'Rush and close', verdict: 'match', feedback: 'Pay minus effort: rush 29, quick 13, thorough 6. The bonus pays for closing calls, so the agent closes as many as possible.' },
        { id: 'fast', label: 'Quick but careful', verdict: 'misconception', feedback: 'That’s the style that solves the most problems — but the bonus doesn’t pay for solving.' },
        { id: 'thorough', label: 'Thorough', verdict: 'misconception', feedback: 'Thorough work earns the least under a per-call bonus: 8 − 2 = 6.' },
      ],
      solve: () => agentBehaviour('per-call'),
    },
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
    explain: [
      'A measure becomes a target, and the agent optimises the target. Paying per call (or per quick call) rewards closing, not solving, so the agent rushes.',
      'Measuring the goal itself is slower and costlier (checking a week later), but it lines up the agent’s incentive with what you actually want.',
    ],
    takeaway: 'Before rewarding a metric, ask how someone could raise it without delivering what you want — they probably will.',
    skill: 'incentives',
  }),
];

export const MODULE3_SCENARIOS: ScenarioSpec[] = [...L8, ...L9, ...L10];
