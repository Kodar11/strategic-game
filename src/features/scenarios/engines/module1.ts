import { type MatrixGame, colDominance, iteratedStrictDominance, pureNashEquilibria, rowDominance, rowBestResponses } from '../../../game/payoff-matrix.ts';
import { fmt, matrixPlay, numberPlay } from '../builders.ts';
import { defineEngine, type ScenarioEngine } from '../types.ts';

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

const L1: ScenarioEngine[] = [
  defineEngine({
    id: 'l1.a.classic-dilemma',
    version: 1,
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
    solve: () => {
      const d = colDominance(PRISONERS);
      return d.kind === 'strict' ? d.action : 'none';
    },
    visualGame: PRISONERS,
  }),
  defineEngine({
    id: 'l1.b.shared-project',
    version: 1,
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
    solve: () => {
      const best = (partner: number) => {
        let b = 0;
        for (let h = 0; h <= 10; h++) if (projectPayoff(h, partner) > projectPayoff(b, partner) + 1e-9) b = h;
        return b;
      };
      return [0, 5, 10].every((p) => best(p) === 0) ? '0' : 'other';
    },
  }),
  defineEngine({
    id: 'l1.c.community-fund',
    version: 1,
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
    solve: () => {
      let b = 0;
      for (let h = 0; h <= 10; h++) if (publicGoodPayoff(h, [10, 10, 10, 10], 10, 1.6) > publicGoodPayoff(b, [10, 10, 10, 10], 10, 1.6) + 1e-9) b = h;
      return String(b);
    },
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

const L2: ScenarioEngine[] = [
  defineEngine({
    id: 'l2.a.dominant-action',
    version: 1,
    play: matrixPlay({
      game: ADVERTISING,
      learner: 'row',
      labels: { row: { radio: 'Radio', flyers: 'Flyers', none: 'No advertising' }, col: { radio: 'radio', flyers: 'flyers' } },
      names: { you: 'You', them: 'The rival' },
      prompt: 'How do you advertise?',
      opponent: () => 'radio',
      opponentRule: 'Its rule (now revealed): use whichever option pays more whatever you do — radio.',
    }),
    solve: () => {
      const d = rowDominance(ADVERTISING);
      return d.kind === 'strict' ? d.action : 'depends';
    },
    visualGame: ADVERTISING,
  }),
  defineEngine({
    id: 'l2.b.negotiation-elimination',
    version: 1,
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
    solve: () => {
      const r = iteratedStrictDominance(NEGOTIATION);
      return r.rows.length === 1 && r.cols.length === 1 ? `${r.rows[0]}-${r.cols[0]}` : 'nothing';
    },
    visualGame: NEGOTIATION,
  }),
  defineEngine({
    id: 'l2.c.candidate-positions',
    version: 1,
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
    solve: () => {
      const r = iteratedStrictDominance(POSITIONS);
      return r.rows.join('');
    },
    visualGame: POSITIONS,
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

const L3: ScenarioEngine[] = [
  defineEngine({
    id: 'l3.a.best-response-grid',
    version: 1,
    play: matrixPlay({
      game: FOOD_TRUCKS,
      learner: 'row',
      labels: { row: { station: 'The station', park: 'The park', campus: 'The campus' }, col: { station: 'the station', park: 'the park', campus: 'the campus' } },
      names: { you: 'You', them: 'The rival' },
      prompt: 'Where do you park?',
      opponent: () => 'park',
      opponentRule: 'Its spot (now revealed) was fixed in advance: the park.',
    }),
    solve: () => {
      const eq = pureNashEquilibria(FOOD_TRUCKS);
      return eq.length === 1 ? `${eq[0].row}-${eq[0].col}` : 'none';
    },
    visualGame: FOOD_TRUCKS,
  }),
  defineEngine({
    id: 'l3.b.penalty-kick',
    version: 1,
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
    solve: () => (pureNashEquilibria(PENALTY_PURE).length === 0 ? 'no' : 'yes'),
    visualGame: PENALTY_PURE,
  }),
  defineEngine({
    id: 'l3.c.partnership',
    version: 1,
    play: matrixPlay({
      game: PARTNERSHIP,
      learner: 'row',
      labels: { row: { full: 'Full-time', part: 'Part-time' }, col: { full: 'full-time', part: 'part-time' } },
      names: { you: 'You', them: 'Your co-founder' },
      prompt: 'How much do you work this year?',
      opponent: () => (rowBestResponses(PARTNERSHIP, 'full')[0] === 'full' && rowBestResponses(PARTNERSHIP, 'part')[0] === 'full' ? 'part' : 'full'),
      opponentRule: 'Their rule (now revealed): expect you to go full-time (your best reply to anything) and pick their best reply to that — part-time.',
    }),
    solve: () => {
      const eq = pureNashEquilibria(PARTNERSHIP);
      return eq.length === 1 ? `${eq[0].row}-${eq[0].col}` : 'multiple';
    },
    visualGame: PARTNERSHIP,
  }),
];

export const MODULE1_ENGINES: ScenarioEngine[] = [...L1, ...L2, ...L3];
