import { type CharacteristicFunction, type Ranking, blockingCoalitions, coreIsEmpty, inCore, plurality, pluralityLeaders, shapley, sincereAgenda, sophisticatedAgenda } from '../../../game/collective.ts';
import { type Ladder, type LadderAction, ladderActionValue, ladderValue } from '../../../game/escalation.ts';
import { type MatrixGame, pureNashEquilibria } from '../../../game/payoff-matrix.ts';
import { createRng } from '../../../game/rng.ts';
import { type GameTree, backwardInduction, decision, leaf, walk } from '../../../game/sequential.ts';
import { allocationPlay, choicePlay, fmt, matrixPlay, pct } from '../builders.ts';
import { type ScenarioPlay, type ScenarioEngine, defineEngine } from '../types.ts';

// ── Lesson 19 · Coalitions and Power ─────────────────────────────────────────

export const SEATS = { A: 40, B: 35, C: 25 } as const;
export const GOVERNMENT_VALUE = 12;
/** Each invited party's outside option: an equal split of the 12 in the coalition of the other two (B + C = 60 seats). */
export const OUTSIDE_OPTION = GOVERNMENT_VALUE / 2;

type Partner = 'AB' | 'AC' | 'ABC' | 'alone';
interface CoalitionState {
  coalition: Partner | null;
  keep: number | null;
}

/** Your payoff from proposing `coalition` and keeping `keep` (partners share the rest equally; each accepts if ≥ 6). */
export function coalitionOutcome(coalition: Partner, keep: number): { formed: boolean; you: number; partners: number } {
  if (coalition === 'alone') return { formed: false, you: 0, partners: 0 };
  const n = coalition === 'ABC' ? 2 : 1;
  const each = (GOVERNMENT_VALUE - keep) / n;
  const formed = each >= OUTSIDE_OPTION - 1e-9;
  return formed ? { formed, you: keep, partners: each } : { formed, you: 0, partners: OUTSIDE_OPTION };
}

const coalitionPlay: ScenarioPlay<CoalitionState> = {
  init: () => ({ coalition: null, keep: null }),
  prompt: (s) => {
    if (s.coalition === null)
      return {
        kind: 'choice',
        prompt: 'Who do you invite into government?',
        options: [
          { id: 'AB', label: 'Party B (A + B = 75 seats)' },
          { id: 'AC', label: 'Party C (A + C = 65 seats)' },
          { id: 'ABC', label: 'Both B and C (100 seats)' },
          { id: 'alone', label: 'Nobody — govern alone (40 seats)' },
        ],
      };
    if (s.coalition === 'alone' || s.keep !== null) return null;
    return { kind: 'number', prompt: `How many of the ${GOVERNMENT_VALUE} ministries do you keep? (Partners split the rest equally.)`, min: 0, max: GOVERNMENT_VALUE, step: 1, initial: 8, cta: 'Propose the deal' };
  },
  apply: (s, input) => {
    if (s.coalition === null) {
      if (!['AB', 'AC', 'ABC', 'alone'].includes(String(input))) throw new Error('Illegal');
      return { ...s, coalition: input as Partner };
    }
    if (typeof input !== 'number' || !Number.isInteger(input) || input < 0 || input > GOVERNMENT_VALUE) throw new Error('Illegal');
    return { ...s, keep: input };
  },
  result: (s) => {
    const o = coalitionOutcome(s.coalition!, s.keep ?? 0);
    return {
      headline: s.coalition === 'alone' ? '40 seats isn’t a majority. B and C form a government without you.' : o.formed ? `Deal accepted: you keep ${o.you}, each partner gets ${fmt(o.partners)}.` : 'Your partner(s) walked away and formed a B–C government.',
      stats: [
        { label: 'Your ministries', value: fmt(o.you), tone: 'blue' },
        { label: 'Each partner', value: fmt(o.partners), tone: 'orange' },
      ],
      lines: [`Each party accepts if it gets at least ${OUTSIDE_OPTION} — what it would get by splitting the government with the other party instead.`, 'Best deals: with one partner, keep 6 (they get 6). With both, each needs 6 — leaving you nothing.'],
    };
  },
};

export const PROJECT: CharacteristicFunction = { A: 0, B: 0, C: 0, AB: 60, AC: 50, BC: 40, ABC: 90 };
export const MAJORITY: CharacteristicFunction = { A: 0, B: 0, C: 0, AB: 12, AC: 12, BC: 12, ABC: 12 };

interface BlockState {
  partner: 'A' | 'B' | null;
  offer: number | null;
}
const blockPlay: ScenarioPlay<BlockState> = {
  init: () => ({ partner: null, offer: null }),
  prompt: (s) =>
    s.partner === null
      ? { kind: 'choice', prompt: 'Who do you approach with a counter-offer?', options: [{ id: 'A', label: 'Ana (currently gets 6)' }, { id: 'B', label: 'Ben (currently gets 6)' }] }
      : s.offer === null
        ? { kind: 'number', prompt: `How much of the 12 do you offer ${s.partner === 'A' ? 'Ana' : 'Ben'}? You keep the rest.`, min: 0, max: 12, step: 1, initial: 6, cta: 'Make the offer' }
        : null,
  apply: (s, input) => {
    if (s.partner === null) {
      if (input !== 'A' && input !== 'B') throw new Error('Illegal');
      return { ...s, partner: input };
    }
    if (typeof input !== 'number' || !Number.isInteger(input) || input < 0 || input > 12) throw new Error('Illegal');
    return { ...s, offer: input };
  },
  result: (s) => {
    const partner = s.partner === 'A' ? 'Ana' : 'Ben';
    const blocks = s.offer! > 6 && 12 - s.offer! > 0;
    return {
      headline: blocks ? `${partner} takes your deal: ${s.offer} for ${partner}, ${12 - s.offer!} for you. The old deal is dead.` : `${partner} sticks with the old deal.`,
      stats: [
        { label: 'You', value: blocks ? String(12 - s.offer!) : '0', tone: 'blue' },
        { label: partner, value: blocks ? String(s.offer) : '6', tone: 'orange' },
      ],
      lines: [
        `${partner} switches only for more than 6 (strictly better). You gain from any deal that leaves you something — so offers from 7 to 11 block the old deal.`,
        'And your new deal can be blocked in turn: whoever is now left out can offer one of you more. Every split of the 12 leaves some pair able to do better: the core is empty.',
      ],
    };
  },
};

const L19: ScenarioEngine[] = [
  defineEngine({
    id: 'l19.a.build-coalition',
    version: 1,
    play: coalitionPlay,
    solve: () => {
      const best = (c: Partner) => Math.max(...Array.from({ length: 13 }, (_, k) => coalitionOutcome(c, k).you));
      return best('ABC') < Math.max(best('AB'), best('AC')) ? 'no' : 'yes';
    },
  }),
  defineEngine({
    id: 'l19.b.project-allocation',
    version: 1,
    play: allocationPlay({ kind: 'allocation', prompt: 'Propose how to split the 90', parties: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }, { id: 'C', label: 'C' }], total: 90, step: 5, cta: 'Check the deal' }, (alloc) => {
      const blocks = blockingCoalitions(PROJECT, ['A', 'B', 'C'], alloc);
      const sh = shapley(PROJECT, ['A', 'B', 'C']);
      return {
        headline: blocks.length ? `Blocked: ${blocks.map((b) => b.coalition.join('+')).join(', ')} can do better alone.` : 'Stable: no group can do better on its own. This split is in the core.',
        stats: [
          { label: 'A', value: String(alloc.A), tone: 'blue' },
          { label: 'B', value: String(alloc.B), tone: 'blue' },
          { label: 'C', value: String(alloc.C), tone: 'blue' },
        ],
        lines: [
          ...[['A', 'B'], ['A', 'C'], ['B', 'C']].map((c) => `${c.join('+')}: get ${alloc[c[0]] + alloc[c[1]]}, could earn ${PROJECT[c.join('')]} alone.`),
          `For comparison, the Shapley value (average contribution) is ${Object.values(sh).map((x) => fmt(x)).join(' / ')}, ${inCore(PROJECT, ['A', 'B', 'C'], sh) ? 'which is in the core' : 'which is not in the core'}.`,
        ],
      };
    }),
    solve: () => (blockingCoalitions(PROJECT, ['A', 'B', 'C'], { A: 20, B: 35, C: 35 }).length ? 'no' : 'yes'),
  }),
  defineEngine({
    id: 'l19.c.blocking-coalition',
    version: 1,
    play: blockPlay,
    solve: () => (coreIsEmpty(MAJORITY, ['A', 'B', 'C']) ? 'no' : 'yes'),
  }),
];

// ── Lesson 20 · The Politics of Voting ───────────────────────────────────────

export const OTHER_VOTES = { X: 4, Y: 4, Z: 1 };
export const YOUR_UTILITY: Record<string, number> = { Z: 10, Y: 6, X: 0 };
/** Expected utility of your vote; a tie is settled by a fair draw among the leaders. */
export function voteValue(vote: 'X' | 'Y' | 'Z'): number {
  const tally = plurality([...Object.entries(OTHER_VOTES).flatMap(([c, n]) => Array(n).fill(c)), vote]);
  const leaders = pluralityLeaders(tally);
  return leaders.reduce((s, c) => s + YOUR_UTILITY[c], 0) / leaders.length;
}

export const COMMITTEE: Ranking[] = [
  ['A', 'B', 'C'],
  ['B', 'C', 'A'],
  ['C', 'A', 'B'],
];
export const AGENDAS: Record<string, string[]> = { AB: ['A', 'B', 'C'], BC: ['B', 'C', 'A'], AC: ['A', 'C', 'B'] };

export const PACKAGES = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;
export const PACKAGE_LABEL: Record<(typeof PACKAGES)[number], string> = { P1: 'Park only', P2: 'Park + library', P3: 'Road only', P4: 'Road + library', P5: 'Everything + a tax rise' };
/** Utilities relative to the status quo (0). Row 0 is you. A member votes yes only for a strictly positive utility. */
export const COUNCIL: number[][] = [
  [5, 3, -1, -2, 1],
  [-2, 2, 1, 3, -1],
  [-1, 1, 4, 2, -3],
  [1, -1, -2, 1, 2],
  [-3, 2, -1, -1, 1],
];
export function packageVotes(i: number): number {
  return COUNCIL.filter((u) => u[i] > 0).length;
}

const L20: ScenarioEngine[] = [
  defineEngine({
    id: 'l20.a.strategic-vote',
    version: 1,
    play: choicePlay({ kind: 'choice', prompt: 'Who do you vote for?', options: [{ id: 'Z', label: 'Z (my favourite)' }, { id: 'Y', label: 'Y' }, { id: 'X', label: 'X' }] }, (c, rng) => {
      const tally = plurality([...Object.entries(OTHER_VOTES).flatMap(([k, n]) => Array(n).fill(k)), c]);
      const leaders = pluralityLeaders(tally);
      const winner = leaders.length === 1 ? leaders[0] : leaders[Math.floor(rng() * leaders.length)];
      return {
        headline: `${winner} wins${leaders.length > 1 ? ` after a draw between ${leaders.join(' and ')}` : ''}.`,
        stats: [
          { label: 'Your utility', value: String(YOUR_UTILITY[winner]), tone: 'blue' },
          { label: 'Expected for your vote', value: fmt(voteValue(c as 'X' | 'Y' | 'Z')), tone: 'amber' },
        ],
        lines: [`Final tally: ${Object.entries(tally).map(([k, n]) => `${k} ${n}`).join(', ')}.`, `Expected utility by vote: Z ${fmt(voteValue('Z'))}, Y ${fmt(voteValue('Y'))}, X ${fmt(voteValue('X'))}.`],
      };
    }),
    solve: () => (['X', 'Y', 'Z'] as const).reduce((a, b) => (voteValue(b) > voteValue(a) ? b : a)),
  }),
  defineEngine({
    id: 'l20.b.agenda-control',
    version: 1,
    play: choicePlay({ kind: 'choice', prompt: 'Which pair goes to a vote first?', options: [{ id: 'AB', label: 'A vs B, then the winner vs C' }, { id: 'BC', label: 'B vs C, then the winner vs A' }, { id: 'AC', label: 'A vs C, then the winner vs B' }] }, (c) => {
      const winner = sincereAgenda(COMMITTEE, AGENDAS[c]);
      return {
        headline: `${winner} is adopted.`,
        stats: [{ label: 'Outcome', value: winner, tone: winner === 'A' ? 'blue' : 'orange' }],
        lines: [
          `Sincere outcomes by agenda: ${Object.entries(AGENDAS).map(([k, a]) => `${a[0]} vs ${a[1]} first → ${sincereAgenda(COMMITTEE, a)}`).join('; ')}.`,
          `If members voted strategically (anticipating the second round), this agenda would produce ${sophisticatedAgenda(COMMITTEE, AGENDAS[c])} — agenda power is weaker against sophisticated voters.`,
        ],
      };
    }),
    solve: () => Object.keys(AGENDAS).find((k) => sincereAgenda(COMMITTEE, AGENDAS[k]) === 'A') ?? 'none',
  }),
  defineEngine({
    id: 'l20.c.majority-coalition',
    version: 1,
    play: choicePlay({ kind: 'choice', prompt: 'Which package do you propose?', options: PACKAGES.map((p) => ({ id: p, label: PACKAGE_LABEL[p] })) }, (c) => {
      const i = PACKAGES.indexOf(c as (typeof PACKAGES)[number]);
      const votes = packageVotes(i);
      const passes = votes >= 3;
      return {
        headline: passes ? `${PACKAGE_LABEL[c as (typeof PACKAGES)[number]]} passes with ${votes} votes.` : `${PACKAGE_LABEL[c as (typeof PACKAGES)[number]]} fails with ${votes} votes. Nothing changes.`,
        stats: [
          { label: 'Yes votes', value: `${votes}/5`, tone: passes ? 'blue' : 'orange' },
          { label: 'Your utility', value: String(passes ? COUNCIL[0][i] : 0), tone: 'blue' },
        ],
        lines: [PACKAGES.map((p, j) => `${PACKAGE_LABEL[p]}: ${packageVotes(j)} votes`).join(' · ')],
      };
    }),
    solve: () => {
      let best = -1;
      PACKAGES.forEach((_, i) => {
        if (packageVotes(i) >= 3 && (best < 0 || COUNCIL[0][i] > COUNCIL[0][best])) best = i;
      });
      return PACKAGES[best];
    },
  }),
];

// ── Lesson 21 · Brinkmanship and Escalation ──────────────────────────────────

export const CHICKEN: MatrixGame = {
  rows: ['swerve', 'straight'],
  cols: ['swerve', 'straight'],
  payoffs: [
    [
      [0, 0],
      [-1, 1],
    ],
    [
      [1, -1],
      [-10, -10],
    ],
  ],
};
export const CHICKEN_STRAIGHT = 0.1;

export const LADDER: Ladder = { risk: [0, 0.05, 0.15, 0.3, 0.5], yield: [0, 0.35, 0.5, 0.6, 0.7], win: 6, disaster: -20, concede: [-1, -2, -3, -4, -5], stalemate: 0, maxRounds: 4 };

interface LadderState {
  seed: number;
  level: number;
  round: number;
  log: string[];
  end: null | 'win' | 'disaster' | 'conceded' | 'stalemate';
  payoff: number;
}

const ladderPlay: ScenarioPlay<LadderState> = {
  init: (seed) => ({ seed, level: 0, round: 0, log: [], end: null, payoff: 0 }),
  prompt: (s) =>
    s.end
      ? null
      : {
          kind: 'choice',
          prompt: `Round ${s.round + 1} of ${LADDER.maxRounds}. You’re at level ${s.level}.`,
          options: [
            ...(s.level < LADDER.risk.length - 1 ? [{ id: 'escalate', label: `Escalate to level ${s.level + 1}`, description: `Disaster risk ${pct(LADDER.risk[s.level + 1])}; they back down ${pct(LADDER.yield[s.level + 1])} of the time` }] : []),
            { id: 'hold', label: `Hold at level ${s.level}`, description: s.level ? `Risk ${pct(LADDER.risk[s.level])} again; they back down ${pct(LADDER.yield[s.level])}` : 'No risk — and no pressure on them' },
            { id: 'back-down', label: 'Back down', description: `Costs you ${-LADDER.concede[s.level]}` },
          ],
        },
  apply: (s, input) => {
    if (s.end || !['escalate', 'hold', 'back-down'].includes(String(input))) throw new Error('Illegal');
    if (input === 'escalate' && s.level >= LADDER.risk.length - 1) throw new Error('Already at the top');
    if (input === 'back-down') return { ...s, end: 'conceded', payoff: LADDER.concede[s.level], log: [...s.log, `Round ${s.round + 1}: you backed down.`] };
    const level = input === 'escalate' ? s.level + 1 : s.level;
    const rng = createRng(s.seed + s.round * 104729);
    const round = s.round + 1;
    if (rng() < LADDER.risk[level]) return { ...s, level, round, end: 'disaster', payoff: LADDER.disaster, log: [...s.log, `Round ${round}: level ${level} — disaster.`] };
    if (rng() < LADDER.yield[level]) return { ...s, level, round, end: 'win', payoff: LADDER.win, log: [...s.log, `Round ${round}: level ${level} — they backed down.`] };
    const end = round >= LADDER.maxRounds ? 'stalemate' : null;
    return { ...s, level, round, end, payoff: end ? LADDER.stalemate : 0, log: [...s.log, `Round ${round}: level ${level} — nobody moved.`] };
  },
  log: (s) => s.log,
  result: (s) => {
    const plan = ladderValue(LADDER, 0, LADDER.maxRounds);
    return {
      headline: s.end === 'win' ? 'They backed down.' : s.end === 'disaster' ? 'The crisis spun out of control. Both sides lose badly.' : s.end === 'conceded' ? 'You backed down.' : 'Stalemate: the deadline passed with nobody moving.',
      stats: [
        { label: 'Your payoff', value: String(s.payoff), tone: 'blue' },
        { label: 'Best plan’s expected value', value: fmt(plan.value, 2), tone: 'amber' },
      ],
      lines: [
        'Their rule: at each level they back down with the stated probability; disasters are drawn from the stated risk.',
        `From the start, the best plan is to escalate to level 1 and hold (${fmt(plan.value, 2)}). Escalating to level 2 from level 1 is worth ${fmt(ladderActionValue(LADDER, 1, 3, 'escalate'), 2)}; holding is worth ${fmt(ladderActionValue(LADDER, 1, 3, 'hold'), 2)}.`,
      ],
    };
  },
};

export const PRECOMMIT = 0.2;
interface NoReturnState {
  seed: number;
  commit: boolean | null;
  move: 'swerve' | 'straight' | null;
}
/** Chance the other side stands firm when you stay open: always if it has already locked in, otherwise its 10% mix. */
export function openFirmChance(precommit = PRECOMMIT): number {
  return precommit + (1 - precommit) * CHICKEN_STRAIGHT;
}
export function noReturnValue(commit: boolean, move: 'swerve' | 'straight' = 'swerve', precommit = PRECOMMIT): number {
  if (commit) return (1 - precommit) * 1 + precommit * -10;
  const firm = openFirmChance(precommit);
  return move === 'swerve' ? firm * -1 : firm * -10 + (1 - firm) * 1;
}
const noReturnPlay: ScenarioPlay<NoReturnState> = {
  init: (seed) => ({ seed, commit: null, move: null }),
  prompt: (s) =>
    s.commit === null
      ? { kind: 'choice', prompt: 'Do you lock in your position publicly (making backing down impossible)?', options: [{ id: 'commit', label: 'Lock in: we won’t back down' }, { id: 'open', label: 'Keep my options open' }] }
      : !s.commit && s.move === null
        ? { kind: 'choice', prompt: 'You kept your options open. At the deadline, do you back down or stand firm?', options: [{ id: 'swerve', label: 'Back down' }, { id: 'straight', label: 'Stand firm' }] }
        : null,
  apply: (s, input) => {
    if (s.commit === null) {
      if (input !== 'commit' && input !== 'open') throw new Error('Illegal');
      return { ...s, commit: input === 'commit' };
    }
    if (!s.commit && s.move === null && (input === 'swerve' || input === 'straight')) return { ...s, move: input };
    throw new Error('Illegal');
  },
  result: (s) => {
    const rng = createRng(s.seed);
    const theyLocked = rng() < PRECOMMIT;
    let you: number;
    let line: string;
    if (s.commit) {
      you = theyLocked ? -10 : 1;
      line = theyLocked ? 'They had already locked in too. Neither side could back down: collision.' : 'They hadn’t locked in, saw your commitment and backed down.';
    } else {
      // A side that has already locked in can't back down; otherwise it stands firm with its 10% mix.
      const straight = theyLocked || rng() < CHICKEN_STRAIGHT;
      you = s.move === 'swerve' ? (straight ? -1 : 0) : straight ? -10 : 1;
      line = theyLocked
        ? `They had already locked in, so they stood firm.`
        : `They ${straight ? 'stood firm' : 'backed down'} (when not locked in, they stand firm ${pct(CHICKEN_STRAIGHT)} of the time).`;
    }
    return {
      headline: line,
      stats: [
        { label: 'Your payoff', value: String(you), tone: 'blue' },
        { label: 'Expected: lock in', value: fmt(noReturnValue(true), 2), tone: 'amber' },
        { label: 'Expected: stay open', value: fmt(noReturnValue(false), 2), tone: 'amber' },
      ],
      lines: [
        `There was a ${pct(PRECOMMIT)} chance they had already locked themselves in. If you stay open, they stand firm ${pct(openFirmChance())} of the time in total (${pct(PRECOMMIT)} locked in, plus 10% of the rest).`,
        `Locking in is worth ${fmt(noReturnValue(true), 2)}. Staying open and backing down is worth ${fmt(noReturnValue(false, 'swerve'), 2)}; staying open and standing firm, ${fmt(noReturnValue(false, 'straight'), 2)}.`,
      ],
    };
  },
};

const L21: ScenarioEngine[] = [
  defineEngine({
    id: 'l21.a.chicken',
    version: 1,
    play: matrixPlay({
      game: CHICKEN,
      learner: 'row',
      labels: { row: { swerve: 'Back off', straight: 'Push ahead' }, col: { swerve: 'back off', straight: 'push ahead' } },
      names: { you: 'You', them: 'The rival' },
      prompt: 'What do you do?',
      opponent: (rng) => (rng() < CHICKEN_STRAIGHT ? 'straight' : 'swerve'),
      opponentRule: 'Their choice was random: push ahead with probability 10%.',
      extraLines: () => ['Against a 10% rival, backing off and pushing ahead are worth the same on average (−0.1): that’s what makes 10% their equilibrium mix.'],
    }),
    solve: () => {
      const eq = pureNashEquilibria(CHICKEN);
      return eq.length === 2 && eq.every((e) => e.row !== e.col) ? 'one-each' : 'other';
    },
    visualGame: CHICKEN,
  }),
  defineEngine({
    id: 'l21.b.escalation-ladder',
    version: 1,
    play: ladderPlay,
    solve: () => {
      const a0 = ladderValue(LADDER, 0, LADDER.maxRounds).action;
      const a1 = ladderValue(LADDER, 1, LADDER.maxRounds - 1).action;
      const label: Record<string, string> = { 'escalate>hold': 'one-step', 'escalate>escalate': 'every', 'hold>hold': 'never' };
      return label[`${a0}>${a1}` as `${LadderAction}>${LadderAction}`] ?? 'other';
    },
  }),
  defineEngine({
    id: 'l21.c.point-of-no-return',
    version: 2,
    play: noReturnPlay,
    solve: () => (noReturnValue(true) < Math.max(noReturnValue(false, 'swerve'), noReturnValue(false, 'straight')) ? 'no' : 'yes'),
  }),
];

// ── Lesson 22 · Strategic Thinking in Practice ───────────────────────────────

export const LAUNCH: GameTree = {
  players: ['You', 'Rival'],
  root: decision(
    'you',
    0,
    [
      {
        id: 'now',
        label: 'Launch now',
        child: decision('r-now', 1, [
          { id: 'now', label: 'Rival launches now too', child: leaf('nn', [1, 3]) },
          { id: 'wait', label: 'Rival waits', child: leaf('nw', [6, 4]) },
        ]),
      },
      {
        id: 'wait',
        label: 'Wait a quarter',
        child: decision('r-wait', 1, [
          { id: 'now', label: 'Rival launches now', child: leaf('wn', [2, 6]) },
          { id: 'wait', label: 'Rival waits too', child: leaf('ww', [3, 3]) },
        ]),
      },
    ],
    'Do you launch now or wait?',
  ),
};

const MODEL_OPTIONS = [
  { id: 'sequential', label: 'A sequential game: the rival responds after seeing my move' },
  { id: 'simultaneous', label: 'A simultaneous game: we choose at the same time' },
  { id: 'repeated', label: 'A repeated game: we’ll play many times' },
  { id: 'auction', label: 'An auction for the market' },
];

interface LaunchState {
  model: string | null;
  path: string[];
}
const launchPlay: ScenarioPlay<LaunchState> = {
  init: () => ({ model: null, path: [] }),
  prompt: (s) => {
    if (s.model === null) return { kind: 'choice', prompt: 'Step 1 · Which model fits this situation best?', options: MODEL_OPTIONS };
    const node = walk(LAUNCH, s.path);
    if (node.kind === 'leaf') return null;
    return { kind: 'choice', prompt: 'Step 2 · Your decision: launch now or wait?', options: node.actions.map((a) => ({ id: a.id, label: a.label })) };
  },
  apply: (s, input) => {
    if (s.model === null) {
      if (!MODEL_OPTIONS.some((o) => o.id === input)) throw new Error('Illegal');
      return { ...s, model: String(input) };
    }
    if (s.path.length || (input !== 'now' && input !== 'wait')) throw new Error('Illegal');
    const sol = backwardInduction(LAUNCH);
    return { ...s, path: [input, sol.choice[input === 'now' ? 'r-now' : 'r-wait']] };
  },
  log: (s) => (s.model ? [`Model chosen: ${MODEL_OPTIONS.find((o) => o.id === s.model)?.label}`] : []),
  result: (s) => {
    const end = walk(LAUNCH, s.path);
    const pay = end.kind === 'leaf' ? end.payoffs : [0, 0];
    return {
      headline: `You ${s.path[0] === 'now' ? 'launched now' : 'waited'}; the rival ${s.path[1] === 'now' ? 'launched now' : 'waited'}.`,
      stats: [
        { label: 'You', value: String(pay[0]), tone: 'blue' },
        { label: 'Rival', value: String(pay[1]), tone: 'orange' },
      ],
      lines: [
        s.model === 'sequential' ? 'Model: right — the rival sees your launch before deciding, so this is a sequential game solved by backward induction.' : 'Model: the key fact is that the rival can see your launch before deciding. That makes it sequential.',
        'Backward induction: if you launch now, the rival prefers to wait (4 > 3); if you wait, it launches (6 > 3). So launching now gets you 6.',
        'Treated as a simultaneous game, there would be two equilibria (you now/rival waits, and you wait/rival now). Timing is what selects the good one for you.',
      ],
      path: s.path,
    };
  },
};

export const BUG = { benefit: 10, cost: 4 };
/** Symmetric volunteer's-dilemma equilibrium: each reports with p so that P(no one else reports) = cost / benefit. */
export function reportProbability(n: number): number {
  return 1 - (BUG.cost / BUG.benefit) ** (1 / (n - 1));
}
export function nobodyReports(n: number): number {
  return (1 - reportProbability(n)) ** n;
}

const CRISIS_MODELS = [
  { id: 'volunteer', label: 'Everyone gains if one person acts, but acting is costly — so each hopes someone else will' },
  { id: 'coordination', label: 'A coordination problem: we just need to agree on a plan' },
  { id: 'auction', label: 'A contest where the highest bidder wins' },
  { id: 'bargaining', label: 'A bargaining problem over who gets the credit' },
];
interface CrisisState {
  seed: number;
  model: string | null;
  act: 'report' | 'wait' | null;
}
const crisisPlay: ScenarioPlay<CrisisState> = {
  init: (seed) => ({ seed, model: null, act: null }),
  prompt: (s) =>
    s.model === null
      ? { kind: 'choice', prompt: 'Step 1 · What is the core strategic problem?', options: CRISIS_MODELS }
      : s.act === null
        ? { kind: 'choice', prompt: 'Step 2 · Do you report the bug tonight?', options: [{ id: 'report', label: 'Report it (cost 4 to you)' }, { id: 'wait', label: 'Wait for someone else' }] }
        : null,
  apply: (s, input) => {
    if (s.model === null) {
      if (!CRISIS_MODELS.some((o) => o.id === input)) throw new Error('Illegal');
      return { ...s, model: String(input) };
    }
    if (s.act === null && (input === 'report' || input === 'wait')) return { ...s, act: input };
    throw new Error('Illegal');
  },
  log: (s) => (s.model ? [`Problem identified: ${CRISIS_MODELS.find((o) => o.id === s.model)?.label}`] : []),
  result: (s) => {
    const rng = createRng(s.seed);
    const p = reportProbability(3);
    const others = [rng() < p, rng() < p];
    const someone = s.act === 'report' || others.some(Boolean);
    const you = (someone ? BUG.benefit : 0) - (s.act === 'report' ? BUG.cost : 0);
    return {
      headline: someone ? `The bug was reported${s.act === 'report' ? ' — by you' : ' by a colleague'}.` : 'Nobody reported it. The launch failed.',
      stats: [
        { label: 'Your payoff', value: String(you), tone: 'blue' },
        { label: 'Each colleague reports', value: pct(p, 1), tone: 'orange' },
        { label: 'P(nobody), team of 3', value: pct(nobodyReports(3), 1), tone: 'amber' },
      ],
      lines: [
        s.model === 'volunteer' ? 'Model: right — this is a volunteer’s dilemma.' : 'Model: the defining feature is that one person’s costly action helps everyone — a volunteer’s dilemma.',
        `In equilibrium each engineer reports with probability ${pct(p, 1)}, which leaves each indifferent: reporting is worth 6, waiting is worth 10 × 60% = 6.`,
        `With 6 engineers behaving the same way, the chance nobody reports rises to ${pct(nobodyReports(6), 1)}.`,
      ],
    };
  },
};

export const SUPPLIER_TYPES = { low: 25, high: 36, pLow: 0.5, value: 60, delay: 3, rounds: 3, batna: 45 };
export const OPENING_OFFERS = [25, 30, 36];
/** Expected payoff of opening with `first`, then offering the high minimum (36) if rejected. */
export function negotiationValue(first: number): number {
  const t = SUPPLIER_TYPES;
  const accept = (offer: number, min: number) => offer >= min;
  const pay = (offer: number, round: number) => t.value - offer - t.delay * (round - 1);
  const follow = (min: number) => (accept(first, min) ? pay(first, 1) : pay(t.high, 2));
  return t.pLow * follow(t.low) + (1 - t.pLow) * follow(t.high);
}
const NEGOTIATION_MODELS = [
  { id: 'hidden-delay', label: 'Their minimum is hidden from me, and every round of delay costs me' },
  { id: 'fairness', label: 'It’s about splitting fairly' },
  { id: 'first-mover', label: 'Only who moves first matters' },
  { id: 'batna', label: 'Nothing to analyse — just pay my walk-away price' },
];
interface NegotiationState {
  seed: number;
  model: string | null;
  offers: number[];
}
const negotiationPlay: ScenarioPlay<NegotiationState> = {
  init: (seed) => ({ seed, model: null, offers: [] }),
  prompt: (s) => {
    if (s.model === null) return { kind: 'choice', prompt: 'Step 1 · Which features of this situation matter most?', options: NEGOTIATION_MODELS };
    if (negotiationDone(s)) return null;
    return { kind: 'choice', prompt: `Step 2 · Round ${s.offers.length + 1} of ${SUPPLIER_TYPES.rounds}: what do you offer?`, options: OPENING_OFFERS.map((o) => ({ id: String(o), label: `$${o}`, description: s.offers.length ? `Delay so far costs you ${s.offers.length * SUPPLIER_TYPES.delay}` : undefined })) };
  },
  apply: (s, input) => {
    if (s.model === null) {
      if (!NEGOTIATION_MODELS.some((o) => o.id === input)) throw new Error('Illegal');
      return { ...s, model: String(input) };
    }
    if (negotiationDone(s) || !OPENING_OFFERS.includes(Number(input))) throw new Error('Illegal');
    return { ...s, offers: [...s.offers, Number(input)] };
  },
  log: (s) => s.offers.map((o, i) => `Round ${i + 1}: you offered $${o} — ${o >= supplierMin(s.seed) ? 'accepted' : 'rejected'}.`),
  result: (s) => {
    const min = supplierMin(s.seed);
    const i = s.offers.findIndex((o) => o >= min);
    const price = i >= 0 ? s.offers[i] : SUPPLIER_TYPES.batna;
    const delayCost = SUPPLIER_TYPES.delay * (i >= 0 ? i : SUPPLIER_TYPES.rounds);
    const you = SUPPLIER_TYPES.value - price - delayCost;
    return {
      headline: i >= 0 ? `Deal at $${price} in round ${i + 1}. The supplier’s minimum was $${min}.` : `No deal; you fell back on the $${SUPPLIER_TYPES.batna} alternative.`,
      stats: [
        { label: 'Your payoff', value: String(you), tone: 'blue' },
        { label: 'Best opening (expected)', value: fmt(negotiationValue(25), 1), tone: 'amber' },
      ],
      lines: [
        s.model === 'hidden-delay' ? 'Model: right — a hidden type plus a cost of delay.' : 'Model: the decisive features are the supplier’s hidden minimum and the cost of each round of delay.',
        `Expected value of opening with $25, then $36: ${fmt(negotiationValue(25), 1)}; with $30: ${fmt(negotiationValue(30), 1)}; with $36 at once: ${fmt(negotiationValue(36), 1)}.`,
        'Opening low tests whether the supplier is the low-cost type; it is worth it because a round of delay costs only 3, while the saving if they accept is 11.',
      ],
    };
  },
};
function supplierMin(seed: number): number {
  return createRng(seed)() < SUPPLIER_TYPES.pLow ? SUPPLIER_TYPES.low : SUPPLIER_TYPES.high;
}
function negotiationDone(s: NegotiationState): boolean {
  return s.offers.some((o) => o >= supplierMin(s.seed)) || s.offers.length >= SUPPLIER_TYPES.rounds;
}

const L22: ScenarioEngine[] = [
  defineEngine({
    id: 'l22.a.startup-launch',
    version: 1,
    play: launchPlay,
    solve: () => backwardInduction(LAUNCH).choice['r-now'],
  }),
  defineEngine({
    id: 'l22.b.team-crisis',
    version: 1,
    play: crisisPlay,
    solve: () => (nobodyReports(6) > nobodyReports(3) ? '6' : '3'),
  }),
  defineEngine({
    id: 'l22.c.negotiation-pressure',
    version: 1,
    play: negotiationPlay,
    solve: () => String(OPENING_OFFERS.reduce((a, b) => (negotiationValue(b) > negotiationValue(a) ? b : a))),
  }),
];

export const MODULE6_ENGINES: ScenarioEngine[] = [...L19, ...L20, ...L21, ...L22];
