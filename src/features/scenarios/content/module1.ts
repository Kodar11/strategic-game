import { type MatrixGame, colDominance, iteratedStrictDominance, pureNashEquilibria, rowDominance, rowBestResponses } from '../../../game/payoff-matrix.ts';
import { fmt, matrixPlay, numberPlay } from '../builders.ts';
import { defineScenario, type ScenarioSpec } from '../types.ts';

// ── Lesson 1 · The Cooperation Trap ──────────────────────────────────────────

/** Years in prison as negative payoffs (adapted textbook numbers). Row = you, column = the other suspect. */
export const PRISONERS: MatrixGame = {
  rows: ['silent', 'confess'],
  cols: ['silent', 'confess'],
  payoffs: [
    [
      [-1, -1],
      [-8, 0],
    ],
    [
      [0, -8],
      [-5, -5],
    ],
  ],
};

/** Shared project: payoff = hours kept + share of the project's points. */
export function projectPayoff(own: number, partner: number, endowment = 10, perHourEach = 0.75): number {
  return endowment - own + perHourEach * (own + partner);
}

/** Linear public good: everyone keeps what they don't contribute and gets an equal share of the multiplied pot. */
export function publicGoodPayoff(own: number, others: readonly number[], endowment: number, multiplier: number): number {
  const n = others.length + 1;
  const pot = (own + others.reduce((s, x) => s + x, 0)) * multiplier;
  return endowment - own + pot / n;
}

export const NEIGHBOURS = [8, 5, 3, 0] as const;

const L1: ScenarioSpec[] = [
  defineScenario({
    id: 'l1.a.classic-dilemma',
    lesson: 'cooperation-trap',
    slot: 'A',
    version: 1,
    title: 'Two suspects, two rooms',
    purpose: 'The classic Prisoner’s Dilemma: the same trap as the price war, in its original story.',
    setup:
      'Two suspects are questioned in separate rooms. Each can stay silent or confess. Neither hears what the other says before choosing. Each only cares about their own sentence.',
    rules: [
      'Both silent: 1 year each.',
      'You confess, they stay silent: you go free (0), they get 8 years.',
      'They confess, you stay silent: you get 8 years, they go free.',
      'Both confess: 5 years each.',
    ],
    formal: {
      players: 'You and the other suspect.',
      actions: 'Stay silent or confess.',
      timing: 'Simultaneous, one shot.',
      information: 'Complete information: both know all the sentences. Neither sees the other’s choice.',
      payoffs: 'Minus the years in prison (shown in the table).',
      opponent: 'The other suspect picks whichever option gives them a shorter sentence whatever you do.',
      solution: 'Dominant strategies: confessing is better whatever the other does.',
      source: 'adapted',
      sourceNote: 'The story is the classic Prisoner’s Dilemma (attributed to A. W. Tucker, 1950). The sentence lengths are illustrative textbook values, not canonical numbers.',
    },
    visual: { kind: 'matrix', game: PRISONERS, rowName: 'You', colName: 'Other', rowLabels: { silent: 'You: silent', confess: 'You: confess' }, colLabels: { silent: 'Other: silent', confess: 'Other: confess' } },
    predict: {
      question: 'What will the other suspect do?',
      basis: 'calculable',
      modelAnswer: 'Confess — it shortens their sentence whatever you do.',
      options: [
        { id: 'confess', label: 'Confess', verdict: 'match', feedback: 'From their seat: if you stay silent, confessing gives 0 instead of 1 year; if you confess, 5 instead of 8. Confessing is better either way.' },
        { id: 'silent', label: 'Stay silent — 1 year each is better for both', verdict: 'misconception', feedback: 'Both silent does beat both confessing, but each suspect controls only their own answer, and confessing is shorter for them whichever you choose.' },
        { id: 'copy', label: 'Whatever they expect me to do', verdict: 'misconception', feedback: 'Copying would make sense only if their best answer changed with yours. Here it doesn’t: confessing wins against silence and against a confession.' },
      ],
      solve: () => {
        const d = colDominance(PRISONERS);
        return d.kind === 'strict' ? d.action : 'none';
      },
    },
    play: matrixPlay({
      game: PRISONERS,
      learner: 'row',
      labels: { row: { silent: 'Stay silent', confess: 'Confess' }, col: { silent: 'stay silent', confess: 'confess' } },
      names: { you: 'You', them: 'The other suspect' },
      prompt: 'What do you say?',
      opponent: () => 'confess',
      opponentRule: 'Their rule (now revealed): pick whatever is shorter for them, whatever you do — so they always confess.',
      extraLines: () => ['Payoffs are minus the years in prison, so −1 is better than −5.'],
    }),
    explain: [
      'Each suspect compares their own sentence across the other’s two possible answers. Confessing is shorter in both cases, so it is a dominant strategy.',
      'When both follow that logic they get 5 years each — worse for both than staying silent (1 year each). Individually sensible choices produce a collectively worse outcome.',
    ],
    takeaway: 'A choice can be best for each person and still leave everyone worse off. That gap between individual and collective incentives is the trap.',
    skill: 'incentives',
  }),
  defineScenario({
    id: 'l1.b.shared-project',
    lesson: 'cooperation-trap',
    slot: 'B',
    version: 1,
    title: 'How many hours?',
    purpose: 'The choice is no longer yes/no: you decide how much to contribute.',
    setup:
      'You and Nina share a project. Each of you has 10 free hours this week. Every hour either of you puts in earns the project 1.5 points, shared equally — so 0.75 points to each of you. Every hour you keep is worth 1 point to you.',
    speaker: { character: 'nina', line: 'I’ve already decided how many hours I’m putting in. I’m not telling you yet!' },
    rules: [
      'You choose 0–10 hours. Nina has already chosen hers.',
      'Your points = hours you keep + 0.75 × (your hours + Nina’s hours).',
      'Nina’s points are worked out the same way.',
    ],
    formal: {
      players: 'You and Nina.',
      actions: 'Hours contributed, a whole number from 0 to 10.',
      timing: 'Simultaneous: Nina’s hours are fixed but hidden until you choose.',
      information: 'You know the payoff rule; you don’t know Nina’s hours.',
      payoffs: '(10 − own hours) + 0.75 × total hours.',
      opponent: 'Nina contributes 5 hours (a fixed choice, revealed afterwards).',
      solution: 'Dominant strategy: each hour you give costs you 1 and returns only 0.75 to you.',
      source: 'original',
      sourceNote: 'A two-person linear public-goods game designed for this app.',
    },
    predict: {
      question: 'How many hours give you the most points, if you only count your own points?',
      basis: 'calculable',
      modelAnswer: '0 hours — whatever Nina does.',
      options: [
        { id: '0', label: '0 hours', verdict: 'match', feedback: 'Each hour you give costs you 1 point and brings back 0.75 — a loss of 0.25 per hour, whatever Nina does.' },
        { id: 'match', label: 'The same as Nina', verdict: 'misconception', feedback: 'Nina’s hours add the same 0.75 per hour to your points whatever you do. They don’t change what your own hours are worth to you.' },
        { id: '10', label: '10 hours — more hours, more points', verdict: 'misconception', feedback: 'More hours means more points for the pair, but each of your hours returns only 0.75 to you for the 1 it costs.' },
      ],
      solve: () => {
        const best = (partner: number) => {
          let b = 0;
          for (let h = 0; h <= 10; h++) if (projectPayoff(h, partner) > projectPayoff(b, partner) + 1e-9) b = h;
          return b;
        };
        return [0, 5, 10].every((p) => best(p) === 0) ? '0' : 'other';
      },
    },
    play: numberPlay({ kind: 'number', prompt: 'How many hours do you put in?', min: 0, max: 10, step: 1, initial: 5, unit: 'hours', cta: 'Commit my hours' }, (h) => {
      const nina = 5;
      const you = projectPayoff(h, nina);
      const her = projectPayoff(nina, h);
      return {
        headline: `You put in ${h} hours; Nina put in ${nina}.`,
        stats: [
          { label: 'Your points', value: fmt(you), tone: 'blue' },
          { label: 'Nina’s points', value: fmt(her), tone: 'orange' },
          { label: 'Together', value: fmt(you + her) },
        ],
        lines: [
          'Nina’s choice (now revealed): a fixed 5 hours.',
          h === 0 ? 'Giving 0 hours was your highest-scoring choice against Nina’s 5.' : `With 0 hours you would have scored ${fmt(projectPayoff(0, nina))} — ${fmt(projectPayoff(0, nina) - you)} more. Each hour cost you 0.25 net.`,
          `If you both gave all 10 hours, you would each score ${fmt(projectPayoff(10, 10))}; if neither gave any, ${fmt(projectPayoff(0, 0))} each.`,
        ],
      };
    }),
    explain: [
      'Each hour you contribute raises the pair’s total by 0.5 (1.5 project points minus the 1 hour lost), but lowers your own score by 0.25. The best amount for you is 0 whatever Nina does, while the best amount for the pair is 10 each.',
      'Turning a yes/no choice into “how much” doesn’t remove the trap: the incentive at the margin — every single hour — still points towards giving less.',
    ],
    takeaway: 'Look at what one more unit of effort is worth to you versus to the group. When they point in opposite directions, expect under-contribution.',
    skill: 'incentives',
  }),
  defineScenario({
    id: 'l1.c.community-fund',
    lesson: 'cooperation-trap',
    slot: 'C',
    version: 1,
    title: 'The community garden fund',
    purpose: 'Many players, one shared pot: the public-goods version of the trap.',
    setup:
      'Five neighbours each get 10 tokens. Whatever goes into the garden fund is multiplied by 1.6 and the total is split equally among all five, whether or not they paid in. Tokens you keep are yours.',
    rules: [
      'You choose 0–10 tokens. The four neighbours have already decided.',
      'Your tokens = (10 − your contribution) + (1.6 × all contributions) ÷ 5.',
      'Every neighbour gets the same share of the fund.',
    ],
    formal: {
      players: 'You and four neighbours (simulated).',
      actions: 'Tokens contributed, 0–10.',
      timing: 'Simultaneous, one shot.',
      information: 'You know the rule; neighbours’ contributions are hidden until you choose.',
      payoffs: '(10 − own) + 0.32 × total contributed.',
      opponent: 'The neighbours contribute 8, 5, 3 and 0 tokens (fixed, revealed afterwards).',
      solution: 'Dominant strategy: each token returns 0.32 to the giver, so 0 is best for each; the group does best when everyone gives 10.',
      source: 'adapted',
      sourceNote: 'A standard linear public-goods game as used in experimental economics (e.g. Isaac & Walker, 1988); the numbers are illustrative.',
    },
    predict: {
      question: 'Suppose all four neighbours give everything. What contribution maximises your own tokens?',
      basis: 'calculable',
      modelAnswer: '0 — each token you give returns only 0.32 to you.',
      options: [
        { id: '0', label: '0 tokens', verdict: 'match', feedback: 'A token you give becomes 1.6 tokens shared five ways: 0.32 back to you. Whatever the others do, giving costs you 0.68 per token.' },
        { id: '10', label: '10 tokens — the fund multiplies everything', verdict: 'misconception', feedback: 'The fund does multiply, but you only get a fifth of what your token creates. 1.6 ÷ 5 = 0.32 is less than the 1 token it cost.' },
        { id: 'some', label: 'Some, to match their generosity', verdict: 'depends', feedback: 'Reciprocity is common in real groups and can be worth something to you — but it lies outside these token payoffs, which favour giving 0.' },
      ],
      solve: () => {
        let b = 0;
        for (let h = 0; h <= 10; h++) if (publicGoodPayoff(h, [10, 10, 10, 10], 10, 1.6) > publicGoodPayoff(b, [10, 10, 10, 10], 10, 1.6) + 1e-9) b = h;
        return String(b);
      },
    },
    play: numberPlay({ kind: 'number', prompt: 'How many tokens do you put in the fund?', min: 0, max: 10, step: 1, initial: 5, unit: 'tokens', cta: 'Pay in' }, (x) => {
      const others: number[] = [...NEIGHBOURS];
      const you = publicGoodPayoff(x, others, 10, 1.6);
      const total = x + others.reduce((s, v) => s + v, 0);
      const group = [x, ...others].reduce((s, c, i) => s + publicGoodPayoff(c, [x, ...others].filter((_, j) => j !== i), 10, 1.6), 0);
      return {
        headline: `The fund collected ${total} tokens and paid out ${fmt((total * 1.6) / 5)} to each neighbour.`,
        stats: [
          { label: 'Your tokens', value: fmt(you), tone: 'blue' },
          { label: 'Group total', value: fmt(group) },
          { label: 'If all gave 10', value: `${fmt(publicGoodPayoff(10, [10, 10, 10, 10], 10, 1.6))} each`, tone: 'amber' },
        ],
        lines: [
          `The neighbours gave ${others.join(', ')} (fixed amounts, now revealed). The neighbour who gave 0 ended with the most: ${fmt(publicGoodPayoff(0, [x, 8, 5, 3], 10, 1.6))}.`,
          x === 0 ? 'Giving nothing maximised your own tokens.' : `Giving 0 would have left you with ${fmt(publicGoodPayoff(0, others, 10, 1.6))}: each of your ${x} tokens cost you 0.68.`,
          'The group as a whole gains 0.6 tokens for every token anyone contributes.',
        ],
      };
    }),
    explain: [
      'With five people, each token you give creates 1.6 tokens of value, but only 0.32 of it comes back to you. Free-riding on others’ contributions is individually best, even though everyone giving 10 would make each person 16 instead of 10.',
      'The trap would disappear only if 1.6 ÷ 5 were above 1 — that is, if the multiplier were bigger than the number of people sharing the pot, so that a token returned more than it cost you.',
    ],
    takeaway: 'In shared pots, each person bears the full cost of contributing but receives only a fraction of the benefit. Bigger groups make that fraction smaller.',
    skill: 'incentives',
  }),
];

// ── Lesson 2 · Strategy Detective ────────────────────────────────────────────

export const ADVERTISING: MatrixGame = {
  rows: ['radio', 'flyers', 'none'],
  cols: ['radio', 'flyers'],
  payoffs: [
    [
      [5, 5],
      [7, 3],
    ],
    [
      [4, 6],
      [6, 4],
    ],
    [
      [3, 7],
      [5, 5],
    ],
  ],
};

/** A proposal game that needs three rounds of deletion. Row = your proposal, column = the client's response. */
export const NEGOTIATION: MatrixGame = {
  rows: ['fast', 'discount', 'bundle'],
  cols: ['accept', 'counter', 'shop'],
  payoffs: [
    [
      [4, 3],
      [5, 1],
      [6, 2],
    ],
    [
      [2, 1],
      [8, 4],
      [3, 6],
    ],
    [
      [3, 0],
      [9, 6],
      [2, 8],
    ],
  ],
};

/** Two candidates on positions 1–5 with one voter at each position. Votes for the nearer candidate; ties split. */
export function positionGame(): MatrixGame {
  const pos = ['1', '2', '3', '4', '5'];
  const votes = (a: number, b: number) => {
    let v = 0;
    for (let x = 1; x <= 5; x++) {
      const da = Math.abs(x - a);
      const db = Math.abs(x - b);
      v += da < db ? 1 : da === db ? 0.5 : 0;
    }
    return v;
  };
  return { rows: pos, cols: pos, payoffs: pos.map((a) => pos.map((b) => [votes(+a, +b), votes(+b, +a)] as const)) };
}

const POSITIONS = positionGame();

const L2: ScenarioSpec[] = [
  defineScenario({
    id: 'l2.a.dominant-action',
    lesson: 'iterated-dominance',
    slot: 'A',
    version: 1,
    title: 'The advertising choice',
    purpose: 'Spot an action that beats every alternative against every rival choice.',
    setup: 'Your bakery and a rival each choose how to advertise this month. The table shows weekly profit (yours first). The rival only uses radio or flyers.',
    rules: ['You choose radio, flyers or no advertising.', 'The rival chooses radio or flyers at the same time.', 'Profits are exactly as in the table.'],
    formal: {
      players: 'You (rows) and the rival (columns).',
      actions: 'You: radio, flyers, none. Rival: radio, flyers.',
      timing: 'Simultaneous, one shot.',
      information: 'Complete information; choices are not seen in advance.',
      payoffs: 'Weekly profit, in the table.',
      opponent: 'The rival picks the option that pays it more whatever you do (radio).',
      solution: 'Strict dominance: radio beats flyers and none in both columns.',
      source: 'original',
      sourceNote: 'Designed for this app.',
    },
    visual: { kind: 'matrix', game: ADVERTISING, rowName: 'You', colName: 'Rival', rowLabels: { radio: 'Radio', flyers: 'Flyers', none: 'None' }, colLabels: { radio: 'Rival: radio', flyers: 'Rival: flyers' } },
    predict: {
      question: 'Which of your options is best no matter what the rival does?',
      basis: 'calculable',
      modelAnswer: 'Radio — it beats both alternatives in every column.',
      options: [
        { id: 'radio', label: 'Radio', verdict: 'match', feedback: 'Against rival radio: 5 vs 4 vs 3. Against rival flyers: 7 vs 6 vs 5. Radio is strictly better in every column.' },
        { id: 'flyers', label: 'Flyers', verdict: 'misconception', feedback: 'Flyers is never the best: radio pays 1 more in each column.' },
        { id: 'depends', label: 'It depends on the rival', verdict: 'misconception', feedback: 'Your best reply could depend on the rival — but check each column: radio wins in both, so here it doesn’t.' },
      ],
      solve: () => {
        const d = rowDominance(ADVERTISING);
        return d.kind === 'strict' ? d.action : 'depends';
      },
    },
    play: matrixPlay({
      game: ADVERTISING,
      learner: 'row',
      labels: { row: { radio: 'Radio', flyers: 'Flyers', none: 'No advertising' }, col: { radio: 'radio', flyers: 'flyers' } },
      names: { you: 'You', them: 'The rival' },
      prompt: 'How do you advertise?',
      opponent: () => 'radio',
      opponentRule: 'Its rule (now revealed): use whichever option pays more whatever you do — radio.',
    }),
    explain: [
      'To test for dominance, compare one action with another column by column. Radio beats flyers (5 > 4, 7 > 6) and beats no advertising (5 > 3, 7 > 5) in every column, so it is strictly dominant.',
      'The rival faces the same test: radio pays it 5, 6 or 7 depending on your row, flyers only 3, 4 or 5 — so radio is dominant for the rival too.',
    ],
    takeaway: 'If one action is better against every possible choice of the other side, you don’t need to predict them at all.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l2.b.negotiation-elimination',
    lesson: 'iterated-dominance',
    slot: 'B',
    version: 1,
    title: 'Peeling the negotiation',
    purpose: 'No option is dominant at the start — you have to delete in rounds.',
    setup: 'You’re a supplier choosing which proposal to send. At the same moment, the client commits to how it will respond — without knowing which proposal you chose. Payoffs: yours first, client’s second.',
    rules: ['You propose fast delivery, a discount, or a bundle.', 'The client accepts, counters, or shops around — at the same time, without seeing your proposal in advance.', 'Payoffs are exactly as in the table.'],
    formal: {
      players: 'You (rows) and the client (columns).',
      actions: 'You: fast, discount, bundle. Client: accept, counter, shop around.',
      timing: 'Simultaneous, one shot.',
      information: 'Complete information.',
      payoffs: 'In the table.',
      opponent: 'The client never plays an option that is worse whatever you do, and assumes you reason the same way.',
      solution: 'Iterated deletion of strictly dominated strategies: “counter” goes first, then “discount” and “bundle”, then “shop around”.',
      source: 'original',
      sourceNote: 'Designed for this app; each deletion is checked by the engine.',
    },
    visual: {
      kind: 'matrix',
      game: NEGOTIATION,
      rowName: 'You',
      colName: 'Client',
      rowLabels: { fast: 'Fast', discount: 'Discount', bundle: 'Bundle' },
      colLabels: { accept: 'Accept', counter: 'Counter', shop: 'Shop' },
    },
    predict: {
      question: 'After deleting every strictly dominated option, round after round, what is left?',
      basis: 'calculable',
      modelAnswer: 'Fast delivery, accepted (4, 3).',
      options: [
        { id: 'fast-accept', label: 'Fast delivery, accepted', verdict: 'match', feedback: 'Shopping around beats countering in every row, so “counter” goes. Then fast delivery beats both other proposals. Against fast, the client prefers accepting (3) to shopping (2).' },
        { id: 'bundle-counter', label: 'Bundle, countered — your best cell (9)', verdict: 'misconception', feedback: 'That cell needs the client to counter, but countering is worse for the client than shopping around in every row. It is the first thing deleted.' },
        { id: 'nothing', label: 'Nothing can be deleted', verdict: 'misconception', feedback: 'None of your proposals is dominated at first — but one of the client’s responses is. Deleting it changes your comparison.' },
      ],
      solve: () => {
        const r = iteratedStrictDominance(NEGOTIATION);
        return r.rows.length === 1 && r.cols.length === 1 ? `${r.rows[0]}-${r.cols[0]}` : 'nothing';
      },
    },
    play: matrixPlay({
      game: NEGOTIATION,
      learner: 'row',
      labels: { row: { fast: 'Fast delivery', discount: 'Discount', bundle: 'Bundle' }, col: { accept: 'accept', counter: 'counter', shop: 'shop around' } },
      names: { you: 'You', them: 'The client' },
      prompt: 'Which proposal do you send?',
      opponent: () => 'accept',
      opponentRule: 'Its rule (now revealed): delete dominated options round by round and play what survives — accept.',
      extraLines: () => {
        const r = iteratedStrictDominance(NEGOTIATION);
        return r.steps.map((s, i) => `Round ${i + 1}: delete ${[...s.removedRows, ...s.removedCols].join(', ')}.`);
      },
    }),
    explain: [
      'Round 1: for the client, “shop around” pays more than “counter” in every row (2 > 1, 6 > 4, 8 > 6), so a rational client never counters. Delete it.',
      'Round 2: without “counter”, fast delivery beats discount (4 > 2, 6 > 3) and bundle (4 > 3, 6 > 2). Round 3: against fast delivery, the client accepts (3 > 2).',
      'Each round assumes one more level of “they know that I know they’re rational”. Strict dominance is safe to delete in any order; weak dominance is not (the lesson’s concept step shows a small example).',
    ],
    takeaway: 'When nothing is obviously best, delete what nobody would play — then look again. Removing their bad options can make your best one appear.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l2.c.candidate-positions',
    lesson: 'iterated-dominance',
    slot: 'C',
    version: 1,
    title: 'Where do the candidates stand?',
    purpose: 'Elections, not prices: deleting extreme positions changes which positions remain worth taking.',
    setup: 'Two candidates for student council each pick a platform from 1 (most left) to 5 (most right). There is one voter at each position. Each voter backs the nearer candidate; a voter halfway between splits their vote.',
    rules: ['You and your opponent choose a position 1–5 at the same time.', 'Each of the 5 voters votes for the closer candidate; equidistant voters split ½–½.', 'Your payoff is your number of votes.'],
    formal: {
      players: 'You and the other candidate.',
      actions: 'Position 1, 2, 3, 4 or 5.',
      timing: 'Simultaneous, one shot.',
      information: 'Complete information about voters’ positions.',
      payoffs: 'Votes received (0–5).',
      opponent: 'The other candidate follows iterated deletion of dominated positions.',
      solution: 'Iterated strict dominance: 1 and 5 are dominated by 2 and 4; then 2 and 4 are dominated by 3.',
      source: 'adapted',
      sourceNote: 'A discrete version of Hotelling–Downs positioning (Hotelling 1929; Downs 1957).',
    },
    visual: { kind: 'matrix', game: POSITIONS, rowName: 'You', colName: 'Rival', rowLabels: { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' }, colLabels: { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' } },
    predict: {
      question: 'Which positions survive repeated deletion of dominated positions?',
      basis: 'calculable',
      modelAnswer: 'Only position 3.',
      options: [
        { id: '3', label: 'Only 3', verdict: 'match', feedback: '2 beats 1 against every opponent position (and 4 beats 5). Once 1 and 5 are gone, 3 beats 2 and 4 against every remaining position.' },
        { id: '234', label: '2, 3 and 4', verdict: 'defensible', feedback: 'That’s the first round. But once both candidates know 1 and 5 are out, 2 and 4 become dominated by 3. Keep going.' },
        { id: 'all', label: 'All of them — each wins against something', verdict: 'misconception', feedback: 'Winning against some position isn’t enough. 1 gets fewer votes than 2 against every position, so it can be deleted.' },
      ],
      solve: () => {
        const r = iteratedStrictDominance(POSITIONS);
        return r.rows.join('');
      },
    },
    play: matrixPlay({
      game: POSITIONS,
      learner: 'row',
      labels: { row: { 1: 'Position 1', 2: 'Position 2', 3: 'Position 3', 4: 'Position 4', 5: 'Position 5' }, col: { 1: 'position 1', 2: 'position 2', 3: 'position 3', 4: 'position 4', 5: 'position 5' } },
      names: { you: 'You', them: 'The other candidate' },
      prompt: 'Where do you stand?',
      opponent: () => '3',
      opponentRule: 'Their rule (now revealed): delete dominated positions round by round — leaving only 3.',
      unit: 'votes',
    }),
    explain: [
      'Position 1 vs 2: against any opponent, 2 wins at least as many voters plus more (4 vs 2.5, 2.5 vs 1, 2 vs 1.5, 2.5 vs 2, 3 vs 2.5). So 1 — and by symmetry 5 — is strictly dominated.',
      'With only 2, 3 and 4 left, the centre beats 2 and 4 against each of them (3 vs 2.5, 2.5 vs 2, 3 vs 2.5). Deletion leaves both candidates at the median voter.',
    ],
    takeaway: 'Each deletion changes the game that’s left. A position that’s fine against every option can become dominated once others drop out.',
    skill: 'anticipating',
  }),
];

// ── Lesson 3 · Finding the Best Move ─────────────────────────────────────────

export const FOOD_TRUCKS: MatrixGame = {
  rows: ['station', 'park', 'campus'],
  cols: ['station', 'park', 'campus'],
  payoffs: [
    [
      [4, 1],
      [1, 3],
      [2, 2],
    ],
    [
      [2, 2],
      [3, 4],
      [1, 3],
    ],
    [
      [1, 4],
      [2, 1],
      [4, 3],
    ],
  ],
};

/** Scoring probability for the kicker; the keeper's payoff is minus that (zero-sum). */
export const PENALTY_PURE: MatrixGame = {
  rows: ['left', 'right'],
  cols: ['left', 'right'],
  payoffs: [
    [
      [0.5, -0.5],
      [0.95, -0.95],
    ],
    [
      [0.9, -0.9],
      [0.6, -0.6],
    ],
  ],
};

export const PARTNERSHIP: MatrixGame = {
  rows: ['full', 'part'],
  cols: ['full', 'part'],
  payoffs: [
    [
      [6, 6],
      [4, 7],
    ],
    [
      [5, 3],
      [2, 2],
    ],
  ],
};

const L3: ScenarioSpec[] = [
  defineScenario({
    id: 'l3.a.best-response-grid',
    lesson: 'best-response',
    slot: 'A',
    version: 1,
    title: 'The lunchtime spot',
    purpose: 'No option is dominant — find the cell where both choices are best replies.',
    setup: 'You and a rival food truck each pick a spot for lunch: the station, the park or the campus. Profits depend on both choices (yours first).',
    rules: ['You both choose a spot at the same time.', 'Profits are exactly as in the table.', 'The rival has already parked; you’ll see where after you choose.'],
    formal: {
      players: 'You (rows) and the rival truck (columns).',
      actions: 'Station, park, campus.',
      timing: 'Simultaneous, one shot.',
      information: 'Complete information; the rival’s spot is hidden until you choose.',
      payoffs: 'Profit, in the table.',
      opponent: 'The rival parks at the park — its part of the game’s only equilibrium.',
      solution: 'Pure-strategy Nash equilibrium: (park, park) is the only cell where both are best replies.',
      source: 'original',
      sourceNote: 'Designed for this app; no strategy is dominated, so deletion alone doesn’t solve it.',
    },
    visual: { kind: 'matrix', game: FOOD_TRUCKS, rowName: 'You', colName: 'Rival', rowLabels: { station: 'Station', park: 'Park', campus: 'Campus' }, colLabels: { station: 'Station', park: 'Park', campus: 'Campus' } },
    predict: {
      question: 'Which cell is a Nash equilibrium — where neither truck would move on its own?',
      basis: 'calculable',
      modelAnswer: 'Both at the park (3, 4).',
      options: [
        { id: 'park-park', label: 'Both at the park', verdict: 'match', feedback: 'If the rival is at the park, your best reply is the park (3 beats 1 and 2). If you’re at the park, the rival’s best reply is the park (4 beats 2 and 3). Mutual best replies.' },
        { id: 'station-station', label: 'Both at the station — your biggest profit', verdict: 'misconception', feedback: 'You’d be happy there (4), but the rival earns only 1 and would rather go to the park (3). An equilibrium has to be stable for both.' },
        { id: 'campus-campus', label: 'Both on campus', verdict: 'misconception', feedback: 'Against you on campus, the rival’s best reply is the station (4 beats 3). So it would move.' },
        { id: 'none', label: 'There isn’t one', verdict: 'misconception', feedback: 'Check the park–park cell: neither truck gains by moving alone.' },
      ],
      solve: () => {
        const eq = pureNashEquilibria(FOOD_TRUCKS);
        return eq.length === 1 ? `${eq[0].row}-${eq[0].col}` : 'none';
      },
    },
    play: matrixPlay({
      game: FOOD_TRUCKS,
      learner: 'row',
      labels: { row: { station: 'The station', park: 'The park', campus: 'The campus' }, col: { station: 'the station', park: 'the park', campus: 'the campus' } },
      names: { you: 'You', them: 'The rival' },
      prompt: 'Where do you park?',
      opponent: () => 'park',
      opponentRule: 'Its spot (now revealed) was fixed in advance: the park.',
    }),
    explain: [
      'A best reply is the action that pays most against one particular choice of the other side. Your best replies: station → station, park → park, campus → campus. The rival’s: station → park, park → park, campus → station.',
      'Only at (park, park) is each choice a best reply to the other. That is a pure-strategy Nash equilibrium: nobody can gain by changing only their own choice.',
    ],
    takeaway: 'An equilibrium is a pair of choices that are best replies to each other — a prediction that nobody would want to undo alone.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l3.b.penalty-kick',
    lesson: 'best-response',
    slot: 'B',
    version: 1,
    explore: { expected: true },
    title: 'One penalty kick',
    purpose: 'Interests are now directly opposed — and best replies chase each other in a circle.',
    setup: 'You take one penalty. You kick left or right; the keeper dives left or right at the same moment. The numbers are your chances of scoring; the keeper wants the opposite.',
    rules: ['Kick left, keeper dives left: 50% chance you score.', 'Kick left, keeper dives right: 95%.', 'Kick right, keeper dives left: 90%.', 'Kick right, keeper dives right: 60%.', 'Whether you score is drawn at random from that chance.'],
    formal: {
      players: 'You (kicker) and the keeper.',
      actions: 'Left or right for each.',
      timing: 'Simultaneous, one shot.',
      information: 'Complete information about the scoring chances.',
      payoffs: 'Kicker: probability of scoring. Keeper: minus that (zero-sum).',
      opponent: 'The keeper dives left (fixed for this kick, revealed afterwards).',
      chance: 'The goal is drawn with the cell’s scoring probability.',
      solution: 'Best replies form a cycle, so there is no pure-strategy Nash equilibrium.',
      source: 'adapted',
      sourceNote: 'Stylised penalty-kick payoffs; the structure follows the empirical penalty-kick literature (e.g. Palacios-Huerta, 2003), but these numbers are illustrative.',
    },
    visual: { kind: 'matrix', game: PENALTY_PURE, rowName: 'You', colName: 'Keeper', rowLabels: { left: 'Kick left', right: 'Kick right' }, colLabels: { left: 'Dive left', right: 'Dive right' } },
    predict: {
      question: 'Is there a cell where neither of you would want to switch?',
      basis: 'calculable',
      modelAnswer: 'No — every cell gives someone a reason to switch.',
      options: [
        { id: 'no', label: 'No — someone always wants to switch', verdict: 'match', feedback: 'If the keeper dives left you want right; then the keeper wants right; then you want left; then the keeper wants left. Best replies go round in a circle.' },
        { id: 'left-right', label: 'Yes: kick left, keeper right (95%)', verdict: 'misconception', feedback: 'You love that cell, but the keeper would switch to diving left and cut your chance to 50%.' },
        { id: 'right-right', label: 'Yes: kick right, keeper right', verdict: 'misconception', feedback: 'Against a keeper diving right, you’d switch to kicking left (95% beats 60%).' },
      ],
      solve: () => (pureNashEquilibria(PENALTY_PURE).length === 0 ? 'no' : 'yes'),
    },
    play: matrixPlay({
      game: PENALTY_PURE,
      learner: 'row',
      labels: { row: { left: 'Kick left', right: 'Kick right' }, col: { left: 'dive left', right: 'dive right' } },
      names: { you: 'You', them: 'The keeper' },
      prompt: 'Where do you kick?',
      opponent: () => 'left',
      opponentRule: 'Their dive (now revealed) was fixed for this kick: left.',
      extraLines: (you, them) => {
        const p = PENALTY_PURE.payoffs[PENALTY_PURE.rows.indexOf(you)][PENALTY_PURE.cols.indexOf(them)][0];
        return [`Your chance of scoring in this cell was ${Math.round(p * 100)}%. The payoff shown is that chance, not the realised kick.`];
      },
    }),
    explain: [
      'Best replies: against a left dive, kick right (90% vs 50%); against a right dive, kick left (95% vs 60%). The keeper’s: against a left kick, dive left; against a right kick, dive right.',
      'No cell is a mutual best reply, so this game has no pure-strategy Nash equilibrium. Any fixed choice can be exploited — which is exactly the problem Lesson 5 solves with mixed strategies.',
    ],
    takeaway: 'Not every game has a stable pair of fixed choices. When best replies chase each other, being predictable is a weakness.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l3.c.partnership',
    lesson: 'best-response',
    slot: 'C',
    version: 1,
    title: 'The co-founders',
    purpose: 'A stable outcome that is neither fair nor the best one available.',
    setup: 'You and a co-founder each decide whether to work full-time or part-time on your startup this year. You own more of the company, so its success matters more to you. Payoffs: yours first.',
    rules: ['You both choose full-time or part-time at the same time.', 'Payoffs are exactly as in the table.'],
    formal: {
      players: 'You and your co-founder.',
      actions: 'Full-time or part-time.',
      timing: 'Simultaneous, one shot.',
      information: 'Complete information.',
      payoffs: 'In the table (your payoff first).',
      opponent: 'Your co-founder plays their best reply to what they expect you to do (full-time).',
      solution: 'Unique pure-strategy Nash equilibrium: you full-time, co-founder part-time.',
      source: 'original',
      sourceNote: 'Designed for this app.',
    },
    visual: { kind: 'matrix', game: PARTNERSHIP, rowName: 'You', colName: 'Co-founder', rowLabels: { full: 'Full-time', part: 'Part-time' }, colLabels: { full: 'Full-time', part: 'Part-time' } },
    predict: {
      question: 'Where do you two end up?',
      basis: 'calculable',
      modelAnswer: 'You full-time, your co-founder part-time (4, 7).',
      options: [
        { id: 'full-part', label: 'You full-time, co-founder part-time', verdict: 'match', feedback: 'Full-time is your best reply to anything (6 > 5, 4 > 2). Knowing that, your co-founder’s best reply is part-time (7 > 6). Neither would change alone.' },
        { id: 'full-full', label: 'Both full-time — best for the company', verdict: 'misconception', feedback: '(6, 6) has the biggest total, but your co-founder gains by easing off to part-time (7 > 6). Best together isn’t the same as stable.' },
        { id: 'part-part', label: 'Both part-time', verdict: 'misconception', feedback: 'From there you would switch to full-time (4 > 2).' },
      ],
      solve: () => {
        const eq = pureNashEquilibria(PARTNERSHIP);
        return eq.length === 1 ? `${eq[0].row}-${eq[0].col}` : 'multiple';
      },
    },
    play: matrixPlay({
      game: PARTNERSHIP,
      learner: 'row',
      labels: { row: { full: 'Full-time', part: 'Part-time' }, col: { full: 'full-time', part: 'part-time' } },
      names: { you: 'You', them: 'Your co-founder' },
      prompt: 'How much do you work this year?',
      opponent: () => (rowBestResponses(PARTNERSHIP, 'full')[0] === 'full' && rowBestResponses(PARTNERSHIP, 'part')[0] === 'full' ? 'part' : 'full'),
      opponentRule: 'Their rule (now revealed): expect you to go full-time (your best reply to anything) and pick their best reply to that — part-time.',
    }),
    explain: [
      'You go full-time whatever your co-founder does. Your co-founder’s best reply to that is part-time. At (full-time, part-time), neither of you gains by changing alone: it is the game’s only Nash equilibrium.',
      'It is also unequal (4 vs 7) and less valuable in total than both working full-time (12 vs 11). Equilibrium means “stable against one-person changes” — not fair, not efficient, not best for the pair.',
    ],
    takeaway: 'Ask “would anyone change on their own?” to find what’s stable. Then ask separately whether it’s fair or efficient — the answers can differ.',
    skill: 'anticipating',
  }),
];

export const MODULE1_SCENARIOS: ScenarioSpec[] = [...L1, ...L2, ...L3];
