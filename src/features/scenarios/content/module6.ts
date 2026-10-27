import { type CharacteristicFunction, type Ranking, blockingCoalitions, coreIsEmpty, inCore, plurality, pluralityLeaders, shapley, sincereAgenda, sophisticatedAgenda } from '../../../game/collective.ts';
import { type Ladder, type LadderAction, ladderActionValue, ladderValue } from '../../../game/escalation.ts';
import { type MatrixGame, pureNashEquilibria } from '../../../game/payoff-matrix.ts';
import { createRng } from '../../../game/rng.ts';
import { type GameTree, backwardInduction, decision, leaf, walk } from '../../../game/sequential.ts';
import { allocationPlay, choicePlay, fmt, matrixPlay, pct } from '../builders.ts';
import { type ScenarioPlay, type ScenarioSpec, defineScenario } from '../types.ts';

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

const L19: ScenarioSpec[] = [
  defineScenario({
    id: 'l19.a.build-coalition',
    lesson: 'coalitions',
    slot: 'A',
    version: 1,
    title: 'Forming a government',
    purpose: 'Groups that win together must divide the prize — and every partner has alternatives.',
    setup: 'Your party A won 40 of 100 seats; B has 35 and C has 25. A government needs 51 seats and controls 12 ministries. You’ve been asked to form it.',
    rules: [
      'Any two parties together have a majority; A alone does not.',
      'You propose a coalition and how many ministries you keep; partners split the rest equally.',
      `Each invited party accepts if it gets at least ${OUTSIDE_OPTION}: its share if it formed a government with the other party instead.`,
      'If your deal is rejected, B and C govern together and you get nothing.',
    ],
    formal: {
      players: 'Parties A (you), B and C.',
      actions: 'You: a coalition and a split. Partners: accept or reject.',
      timing: 'Proposal, then simultaneous acceptance.',
      information: 'Complete information about seats and values.',
      payoffs: 'Ministries received.',
      opponent: 'Each party accepts iff its share ≥ 6 (an equal split in its best alternative coalition — a stated assumption).',
      solution: 'A minimal winning coalition (A+B or A+C) lets you keep 6; inviting both leaves you 0.',
      source: 'adapted',
      sourceNote: 'Weighted majority game; the size principle follows Riker (1962). Outside options are a stated simplification.',
    },
    predict: {
      question: 'Should you invite both B and C?',
      basis: 'calculable',
      modelAnswer: 'No: each partner needs 6, so a second partner costs you everything.',
      options: [
        { id: 'no', label: 'No — one partner is enough, and every partner must be paid', verdict: 'match', feedback: 'With one partner you keep 6. With two, each demands 6 and you keep 0. An unneeded partner dilutes your share.' },
        { id: 'yes', label: 'Yes — a bigger majority is more secure', verdict: 'misconception', feedback: 'In this game any majority wins the same 12. Extra partners don’t add value, but they do add claims on it.' },
        { id: 'c', label: 'Only C — the smallest partner is cheapest', verdict: 'defensible', feedback: 'Smaller partners are often cheaper in practice, but here both B and C have the same alternative (6), so both cost the same.' },
      ],
      solve: () => {
        const best = (c: Partner) => Math.max(...Array.from({ length: 13 }, (_, k) => coalitionOutcome(c, k).you));
        return best('ABC') < Math.max(best('AB'), best('AC')) ? 'no' : 'yes';
      },
    },
    play: coalitionPlay,
    explain: [
      'A coalition creates value only if it wins. Beyond that, each extra member is another claim on the same prize — which is why minimal winning coalitions are common.',
      'What each partner can demand depends on its alternatives: every party here could form a majority with someone else. Bargaining power comes from being needed, not from size alone.',
    ],
    takeaway: 'Build the smallest coalition that can win, and expect each partner to demand what they could get elsewhere.',
    skill: 'coordination',
  }),
  defineScenario({
    id: 'l19.b.project-allocation',
    lesson: 'coalitions',
    slot: 'B',
    version: 1,
    title: 'Dividing the joint project',
    purpose: 'Now every pair can create a different amount: check whether a split gives any group a reason to leave.',
    setup: 'Three consultancies — A, B and C — can deliver a project together for 90. Any two could do a smaller version alone: A+B 60, A+C 50, B+C 40. Nobody can do it alone. You propose how to split the 90.',
    rules: ['Split 90 among A, B and C (steps of 5).', 'A group blocks the deal if it could earn more on its own than the deal gives its members.', 'A split no group can block is in the core.'],
    formal: {
      players: 'A, B and C.',
      actions: 'An allocation of 90.',
      timing: 'One proposal, checked against every coalition.',
      information: 'Complete information.',
      payoffs: 'Characteristic function v(A)=v(B)=v(C)=0, v(AB)=60, v(AC)=50, v(BC)=40, v(ABC)=90.',
      solution: 'Core: x_A + x_B ≥ 60, x_A + x_C ≥ 50, x_B + x_C ≥ 40, total 90. Non-empty; e.g. the Shapley value (35, 30, 25) is in it.',
      source: 'original',
      sourceNote: 'Characteristic function designed for this app.',
    },
    visual: { kind: 'table', caption: 'What each group can earn on its own', head: ['Group', 'A+B', 'A+C', 'B+C', 'All three'], rows: [['Value', '60', '50', '40', '90']] },
    predict: {
      question: 'Is the split A 20, B 35, C 35 stable?',
      basis: 'calculable',
      modelAnswer: 'No: A and B get 55 together but could earn 60 on their own.',
      options: [
        { id: 'no', label: 'No — A and B could do better on their own', verdict: 'match', feedback: 'A + B get 55 under this split but could earn 60 as a pair. They can split 60 so both gain: the deal is blocked.' },
        { id: 'yes', label: 'Yes — everyone gets something', verdict: 'misconception', feedback: 'Getting something isn’t enough. A group blocks if it can earn more on its own than the deal gives it.' },
        { id: 'fair', label: 'Yes — it’s close to equal', verdict: 'misconception', feedback: 'Stability isn’t about equality: it’s about whether any group has a better option.' },
      ],
      solve: () => (blockingCoalitions(PROJECT, ['A', 'B', 'C'], { A: 20, B: 35, C: 35 }).length ? 'no' : 'yes'),
    },
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
    explain: [
      'An allocation is stable — in the core — when no group can earn more by breaking away. Each pair’s value sets a floor on what that pair must get together.',
      'This is different from bargaining over a split between two people (Lesson 11): here the question is whether any sub-group has a better deal available.',
    ],
    takeaway: 'Test a deal against every group that could walk away together, not just each individual.',
    skill: 'coordination',
  }),
  defineScenario({
    id: 'l19.c.blocking-coalition',
    lesson: 'coalitions',
    slot: 'C',
    version: 1,
    title: 'The deal everyone accepted',
    purpose: 'Transfer: a prize any two can claim — and a deal that looked settled.',
    setup: 'Three flatmates entered a contest: any two of them can claim the 12-point prize together by majority vote; the third gets nothing. Ana and Ben already agreed to split it 6–6 and leave you out. They both said yes.',
    rules: ['Any two of the three can claim the 12 points.', 'Current deal: Ana 6, Ben 6, you 0.', 'Ana or Ben switches to your deal only if it gives them strictly more than 6.'],
    formal: {
      players: 'You, Ana and Ben.',
      actions: 'You: choose a partner and offer a split.',
      timing: 'One counter-offer.',
      information: 'Complete information.',
      payoffs: 'Characteristic function: any pair or all three can claim 12; individuals 0.',
      opponent: 'Your chosen partner accepts iff your offer > 6.',
      solution: 'The core is empty: every split leaves some pair able to do better. “Accepted” is not the same as “stable”.',
      source: 'canonical',
      sourceNote: 'Three-player majority game, a standard example of an empty core.',
    },
    predict: {
      question: 'Is there any split of the 12 that no pair could improve on?',
      basis: 'calculable',
      modelAnswer: 'No — the core is empty.',
      options: [
        { id: 'no', label: 'No — some pair can always do better', verdict: 'match', feedback: 'Each pair must get at least 12 together, so the three pairs need 36 in total — but counting each person twice, there’s only 24. Some pair is always short.' },
        { id: 'equal', label: 'Yes — 4 each', verdict: 'misconception', feedback: 'At 4–4–4, any two get 8 together but could claim 12 alone. They’d break away.' },
        { id: 'current', label: 'Yes — the 6–6 deal, since both accepted', verdict: 'misconception', feedback: 'Acceptance today doesn’t make it stable: you can offer one of them 7 and both of you gain.' },
      ],
      solve: () => (coreIsEmpty(MAJORITY, ['A', 'B', 'C']) ? 'no' : 'yes'),
    },
    play: blockPlay,
    explain: [
      'A blocking coalition is a group that could do better on its own than under the current deal. In a majority game, every split can be blocked by the two players who get the least between them.',
      'So “stable” has a precise meaning: no group has a profitable way to deviate. A deal that everyone agreed to can still be unstable.',
    ],
    takeaway: 'Don’t mistake agreement for stability. Ask whether anyone left out can offer a better deal to someone inside.',
    skill: 'coordination',
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

const L20: ScenarioSpec[] = [
  defineScenario({
    id: 'l20.a.strategic-vote',
    lesson: 'voting',
    slot: 'A',
    version: 1,
    title: 'The last ballot',
    purpose: 'Under plurality rule, voting for your favourite can help your least favourite win.',
    setup: 'Ten people vote for club president by plurality (most votes wins). The other nine have already voted: X 4, Y 4, Z 1. You cast the last vote. Your ranking: Z (worth 10 to you), then Y (6), then X (0).',
    rules: ['Plurality: the candidate with the most votes wins.', 'A tie is settled by a fair random draw among the tied candidates.', 'The other nine votes are fixed and known to you.'],
    formal: {
      players: 'You (the deciding voter); the other votes are fixed.',
      actions: 'Vote X, Y or Z.',
      timing: 'Your vote is last; the others are known.',
      information: 'Complete information about the tally.',
      payoffs: 'Your utility for the winner: Z 10, Y 6, X 0 (expected, if a draw).',
      chance: 'Fair draw among tied leaders.',
      ties: 'Random draw.',
      solution: 'Sincere vote (Z): X–Y tie, expected 3. Strategic vote (Y): Y wins, 6.',
      source: 'original',
      sourceNote: 'Designed for this app.',
    },
    predict: {
      question: 'Which vote gives you the best expected result?',
      basis: 'calculable',
      modelAnswer: 'Y: it wins outright (6) instead of a coin flip between X and Y (3).',
      options: [
        { id: 'Y', label: 'Y, my second choice', verdict: 'match', feedback: 'Z can’t win. Voting Y breaks the 4–4 tie in Y’s favour: 6 for sure, instead of a 50% chance of X.' },
        { id: 'Z', label: 'Z — always vote for your favourite', verdict: 'misconception', feedback: 'With 2 votes Z can’t win; your vote then leaves X and Y tied at 4, and a draw gives X half the time.' },
        { id: 'X', label: 'X', verdict: 'misconception', feedback: 'That hands the win to your least favourite.' },
      ],
      solve: () => (['X', 'Y', 'Z'] as const).reduce((a, b) => (voteValue(b) > voteValue(a) ? b : a)),
    },
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
    explain: [
      'A sincere vote names your favourite; a strategic vote picks the ballot that produces your best achievable result. Under plurality rule they can differ whenever your favourite can’t win.',
      'Other rules (runoffs, ranked ballots) change these incentives — but no reasonable rule removes strategic voting entirely (the Gibbard–Satterthwaite theorem).',
    ],
    takeaway: 'Ask what your vote changes, not just who you like most.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l20.b.agenda-control',
    lesson: 'voting',
    slot: 'B',
    version: 1,
    title: 'Setting the agenda',
    purpose: 'Same voters, same preferences — but you control the order of the votes.',
    setup: 'You chair a three-member committee choosing between proposals A, B and C by pairwise majority votes: two proposals are voted on first, and the winner then faces the third. Members vote sincerely at each stage. You prefer A.',
    rules: ['Member 1 (you): A > B > C. Member 2: B > C > A. Member 3: C > A > B.', 'You choose which two proposals go first.', 'Each vote is by simple majority; members vote for the option they prefer at each stage.'],
    formal: {
      players: 'Three committee members; you also set the agenda.',
      actions: 'You: the agenda. Members: votes at each stage.',
      timing: 'Two sequential pairwise votes (amendment procedure).',
      information: 'Complete information about preferences.',
      payoffs: 'Each member’s ranking of the final outcome.',
      opponent: 'All members vote sincerely (a stated assumption).',
      solution: 'Majorities cycle (A beats B, B beats C, C beats A), so the agenda decides: B vs C first, then A, makes A win.',
      source: 'canonical',
      sourceNote: 'Condorcet’s paradox and agenda control (cf. McKelvey, 1976).',
    },
    visual: { kind: 'table', head: ['Member', '1st', '2nd', '3rd'], rows: COMMITTEE.map((r, i) => [i === 0 ? 'You' : `Member ${i + 1}`, ...r]) },
    predict: {
      question: 'Which agenda gets A passed if members vote sincerely?',
      basis: 'calculable',
      modelAnswer: 'B vs C first; then the winner (B) loses to A.',
      options: [
        { id: 'BC', label: 'B vs C first, then the winner against A', verdict: 'match', feedback: 'B beats C (members 1 and 2), then A beats B (members 1 and 3). Keep A out of the first round so it only faces the opponent it beats.' },
        { id: 'AB', label: 'A vs B first, then the winner against C', verdict: 'misconception', feedback: 'A beats B, but then C beats A (members 2 and 3).' },
        { id: 'AC', label: 'A vs C first, then the winner against B', verdict: 'misconception', feedback: 'C beats A in the first round.' },
      ],
      solve: () => Object.keys(AGENDAS).find((k) => sincereAgenda(COMMITTEE, AGENDAS[k]) === 'A') ?? 'none',
    },
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
    explain: [
      'When majority preferences cycle, there is no proposal that beats all others, and whoever sets the order of votes can steer the outcome. A majority outcome is not the same as an inevitable one.',
      'Sophisticated voters can partly undo agenda tricks by looking ahead — under the agenda you chose, they would end up with C instead.',
    ],
    takeaway: 'When no option beats every other, the procedure — and whoever controls it — decides.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l20.c.majority-coalition',
    lesson: 'voting',
    slot: 'C',
    version: 1,
    title: 'Building a majority',
    purpose: 'Transfer: craft a proposal that enough people prefer to the status quo.',
    setup: 'A five-member council votes yes or no on one spending package; it needs 3 yes votes, otherwise nothing changes. You propose the package. Each member votes yes only if the package is better for them than no change.',
    rules: ['You choose one of five packages.', 'Each member votes yes if their utility is above 0 (no change = 0); a tie at 0 is a no.', '3 or more yes votes passes the package.'],
    formal: {
      players: 'You and four other council members.',
      actions: 'You: a package. Members: yes or no.',
      timing: 'Proposal, then a simultaneous vote.',
      information: 'Complete information about utilities (in the table).',
      payoffs: 'Utility of the package if it passes, 0 otherwise.',
      opponent: 'Members vote sincerely: yes iff utility > 0.',
      ties: 'Indifferent members vote no.',
      solution: 'Your favourite (park only) gets 2 votes. Your best package that passes is park + library (4 votes, utility 3).',
      source: 'original',
      sourceNote: 'Designed for this app.',
    },
    visual: { kind: 'table', caption: 'Utility of each package vs no change', head: ['', ...PACKAGES.map((p) => PACKAGE_LABEL[p])], rows: COUNCIL.map((u, i) => [i === 0 ? 'You' : `Member ${i + 1}`, ...u.map(String)]) },
    predict: {
      question: 'Which package is your best one that can pass?',
      basis: 'calculable',
      modelAnswer: 'Park + library: 4 yes votes, worth 3 to you.',
      options: [
        { id: 'P2', label: 'Park + library', verdict: 'match', feedback: 'Park only is worth 5 to you but gets 2 votes. Park + library gets 4 votes and is still worth 3 to you — your best passing option.' },
        { id: 'P1', label: 'Park only — my favourite', verdict: 'misconception', feedback: 'Only you and member 4 gain from it: 2 votes, so it fails and you get 0.' },
        { id: 'P5', label: 'Everything + a tax rise', verdict: 'defensible', feedback: 'It passes (3 votes), but it’s worth only 1 to you. Park + library passes too and is worth 3.' },
      ],
      solve: () => {
        let best = -1;
        PACKAGES.forEach((_, i) => {
          if (packageVotes(i) >= 3 && (best < 0 || COUNCIL[0][i] > COUNCIL[0][best])) best = i;
        });
        return PACKAGES[best];
      },
    },
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
    explain: [
      'A proposal needs a coalition of supporters, each of whom must prefer it to the alternative on the table. Adding something others value (the library) can buy their votes at a small cost to you.',
      'Unlike Lesson 19, nobody negotiates side payments here: the vote is over packages, and the procedure (yes/no against the status quo) shapes what can pass.',
    ],
    takeaway: 'To pass a proposal, design it so that a majority prefers it to the default — then keep as much of your own goal as that allows.',
    skill: 'coordination',
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
export function noReturnValue(commit: boolean, move: 'swerve' | 'straight' = 'swerve'): number {
  if (commit) return (1 - PRECOMMIT) * 1 + PRECOMMIT * -10;
  return move === 'swerve' ? CHICKEN_STRAIGHT * -1 : CHICKEN_STRAIGHT * -10 + (1 - CHICKEN_STRAIGHT) * 1;
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
      const straight = rng() < CHICKEN_STRAIGHT;
      you = s.move === 'swerve' ? (straight ? -1 : 0) : straight ? -10 : 1;
      line = `They ${straight ? 'stood firm' : 'backed down'} (they stand firm ${pct(CHICKEN_STRAIGHT)} of the time).`;
    }
    return {
      headline: line,
      stats: [
        { label: 'Your payoff', value: String(you), tone: 'blue' },
        { label: 'Expected: lock in', value: fmt(noReturnValue(true), 2), tone: 'amber' },
        { label: 'Expected: stay open', value: fmt(noReturnValue(false), 2), tone: 'amber' },
      ],
      lines: [`There was a ${pct(PRECOMMIT)} chance they had already locked themselves in. Locking in is worth ${fmt(noReturnValue(true), 2)}; staying open is worth ${fmt(noReturnValue(false), 2)} (backing down or standing firm are equally good against their 10% mix).`],
    };
  },
};

const L21: ScenarioSpec[] = [
  defineScenario({
    id: 'l21.a.chicken',
    lesson: 'brinkmanship',
    slot: 'A',
    version: 1,
    title: 'Chicken',
    purpose: 'Both want the other to back down — and the worst outcome is neither doing so.',
    setup: 'Two rival developers both plan to build on the same plot at once. Each can back off (swerve) or push ahead (straight). If both push ahead, a legal battle ruins both.',
    rules: ['Both back off: 0 each.', 'You push ahead, they back off: you +1, they −1 (and the reverse).', 'Both push ahead: −10 each.', 'They push ahead 10% of the time (drawn at random).'],
    formal: {
      players: 'You and the rival developer.',
      actions: 'Swerve (back off) or straight (push ahead).',
      timing: 'Simultaneous, one shot.',
      information: 'Complete information.',
      payoffs: 'In the table.',
      opponent: 'The rival goes straight with probability 0.1 — its mixed-equilibrium probability.',
      chance: 'The rival’s choice.',
      solution: 'Two pure equilibria (one swerves, the other doesn’t) and a mixed one in which each goes straight with probability 0.1 (from −p = 1 − 11p).',
      source: 'canonical',
      sourceNote: 'The game of Chicken (cf. Russell, 1959; Schelling, 1960), with this app’s payoffs.',
    },
    visual: { kind: 'matrix', game: CHICKEN, rowName: 'You', colName: 'Rival', rowLabels: { swerve: 'Back off', straight: 'Push ahead' }, colLabels: { swerve: 'Back off', straight: 'Push ahead' } },
    predict: {
      question: 'Which outcomes are pure-strategy equilibria?',
      basis: 'calculable',
      modelAnswer: 'The two where exactly one side backs off.',
      options: [
        { id: 'one-each', label: 'The two where exactly one side backs off', verdict: 'match', feedback: 'If they push ahead, you’d rather back off (−1 > −10); if they back off, you’d rather push (1 > 0). So the stable outcomes have one of each.' },
        { id: 'both-swerve', label: 'Both back off', verdict: 'misconception', feedback: 'If they back off, you gain by pushing ahead (1 > 0).' },
        { id: 'both-straight', label: 'Both push ahead', verdict: 'misconception', feedback: 'Against a rival pushing ahead, backing off (−1) beats the collision (−10).' },
      ],
      solve: () => {
        const eq = pureNashEquilibria(CHICKEN);
        return eq.length === 2 && eq.every((e) => e.row !== e.col) ? 'one-each' : 'other';
      },
    },
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
    explain: [
      'In Chicken, each side’s best reply is the opposite of the other’s. Whoever convinces the other that they won’t back down wins — and if both do, both lose badly.',
      'Hawk–Dove (Lesson 7) has a similar ordering of payoffs but a different question: which proportions survive in a population. Chicken is about two decision-makers trying to out-commit each other.',
    ],
    takeaway: 'When the worst outcome is mutual stubbornness, the contest is over who can credibly appear unable to back down.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l21.b.escalation-ladder',
    lesson: 'brinkmanship',
    slot: 'B',
    version: 1,
    title: 'The escalation ladder',
    purpose: 'Instead of one choice, a sequence: each step raises the risk of disaster — and the pressure on them.',
    setup: 'A trade dispute with a rival country. Each round you can escalate one level, hold, or back down. Higher levels create a real risk of a disaster that hurts both of you — and that risk is what pressures them to back down.',
    rules: [
      'Disaster risk per round by level: 0, 5%, 15%, 30%, 50% (levels 0–4).',
      'If no disaster, they back down with chance 0, 35%, 50%, 60%, 70%.',
      'They back down: +6. Disaster: −20. You back down: −1, −2, −3, −4 or −5 depending on your level.',
      'After 4 rounds with no result, the standoff ends at 0.',
    ],
    formal: {
      players: 'You and the rival country.',
      actions: 'Each round: escalate, hold or back down.',
      timing: 'Up to four rounds.',
      information: 'You know the risks and back-down chances (stated).',
      payoffs: 'As listed.',
      opponent: 'The rival backs down with the stated probability at each level.',
      chance: 'Disaster and back-down draws each round.',
      solution: 'Dynamic programming: escalate to level 1, then hold (expected ≈ 2.2). Climbing higher adds more risk than pressure.',
      source: 'adapted',
      sourceNote: 'Brinkmanship as “the threat that leaves something to chance” (Schelling, 1960); the ladder is this app’s model.',
    },
    predict: {
      question: 'What is the best plan from the start?',
      basis: 'calculable',
      modelAnswer: 'Escalate one step, then hold.',
      options: [
        { id: 'one-step', label: 'Escalate one step, then hold', verdict: 'match', feedback: 'Level 1 creates some pressure (35%) for little risk (5%). Level 2 triples the risk for a modest gain in pressure: expected value falls from about 2.2 to below 0.' },
        { id: 'top', label: 'Climb fast — maximum pressure', verdict: 'misconception', feedback: 'At level 4 the disaster risk is 50% per round. The pressure doesn’t make up for it.' },
        { id: 'never', label: 'Never escalate', verdict: 'defensible', feedback: 'Safe — at level 0 they never back down, so you’d end at 0. A small, controlled risk is worth about 2.2 here.' },
        { id: 'every', label: 'Escalate every round', verdict: 'misconception', feedback: 'Each step up raises the risk faster than the pressure.' },
      ],
      solve: () => {
        const a0 = ladderValue(LADDER, 0, LADDER.maxRounds).action;
        const a1 = ladderValue(LADDER, 1, LADDER.maxRounds - 1).action;
        const label: Record<string, string> = { 'escalate>hold': 'one-step', 'escalate>escalate': 'every', 'hold>hold': 'never' };
        return label[`${a0}>${a1}` as `${LadderAction}>${LadderAction}`] ?? 'other';
      },
    },
    play: ladderPlay,
    explain: [
      'Brinkmanship works by creating a risk that neither side fully controls. That shared danger makes the other side more willing to back down — but the danger is real: sometimes it materialises.',
      'Unlike a war of attrition (Lesson 12), where you simply wait while paying, here each step deliberately raises the stakes for both. And unlike a simple threat (Lesson 9), the punishment isn’t chosen later — it happens by chance.',
    ],
    takeaway: 'Escalation pressures the other side only through risk you share. Climb only as far as the pressure gained outweighs the danger added.',
    skill: 'uncertainty',
  }),
  defineScenario({
    id: 'l21.c.point-of-no-return',
    lesson: 'brinkmanship',
    slot: 'C',
    version: 1,
    title: 'Burning the bridge',
    purpose: 'Transfer: commit irreversibly to win a standoff — unless the other side already has.',
    setup: 'A council and a contractor are in a standoff over a deadline (the same payoffs as Chicken). You can publicly lock in your position so you can’t back down. There’s a 20% chance the other side has already done the same.',
    rules: [
      'Lock in: if they haven’t, they back down (you +1, they −1). If they have too: collision (−10 each).',
      'Stay open: at the deadline you choose to back down or stand firm; they stand firm 10% of the time.',
      'Payoffs otherwise as in Chicken.',
    ],
    formal: {
      players: 'You and the contractor.',
      actions: 'Lock in or stay open; if open, back down or stand firm.',
      timing: 'Commitment decision, then the standoff.',
      information: 'You don’t know whether they have already locked in (20%).',
      payoffs: 'Chicken payoffs (0, ±1, −10).',
      opponent: 'Already locked in with probability 0.2; otherwise backs down if you lock in, or stands firm 10% of the time if you don’t.',
      chance: 'Whether they’re locked in; their move.',
      solution: 'Locking in: 0.8 × 1 + 0.2 × (−10) = −1.2. Staying open: −0.1. Don’t burn the bridge.',
      source: 'original',
      sourceNote: 'Commitment in Chicken (cf. Schelling, 1960), with this app’s probabilities.',
    },
    predict: {
      question: 'With a 20% chance the other side has already locked in, is locking in worth it?',
      basis: 'calculable',
      modelAnswer: 'No: −1.2 vs −0.1 for staying open.',
      options: [
        { id: 'no', label: 'No — the chance of a double lock-in is too costly', verdict: 'match', feedback: 'Locking in wins 1 with probability 0.8 but costs 10 with probability 0.2: −1.2. Staying open is worth −0.1.' },
        { id: 'yes', label: 'Yes — commitment always wins Chicken', verdict: 'misconception', feedback: 'It wins only if the other side can still back down. If both commit, nobody can.' },
        { id: 'depends', label: 'Only if the chance were much lower', verdict: 'defensible', feedback: 'Right direction: with about a 5% chance, locking in would pay. At 20% it doesn’t.' },
      ],
      solve: () => (noReturnValue(true) < Math.max(noReturnValue(false, 'swerve'), noReturnValue(false, 'straight')) ? 'no' : 'yes'),
    },
    play: noReturnPlay,
    explain: [
      'A point of no return can win a standoff by removing your option to back down — but it also removes your ability to avoid disaster if the other side did the same.',
      'Commitment is powerful only when the other side can see it in time and still has room to respond.',
    ],
    takeaway: 'Before burning bridges, ask whether the other side might already have burned theirs.',
    skill: 'uncertainty',
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

const L22: ScenarioSpec[] = [
  defineScenario({
    id: 'l22.a.startup-launch',
    lesson: 'strategic-practice',
    slot: 'A',
    version: 1,
    title: 'The launch decision',
    purpose: 'An unfamiliar business problem. First decide what kind of game it is.',
    setup: 'Your startup and a larger rival are both ready to launch in a new market. Whoever launches first is visible to the other immediately: the rival’s team watches app-store releases daily and can launch within days. Estimated payoffs (you, rival): both launch now 1, 3; you now, rival waits 6, 4; you wait, rival launches 2, 6; both wait 3, 3.',
    rules: ['Step 1: choose the model that fits.', 'Step 2: decide to launch now or wait.', 'The rival sees your choice, then picks its best reply.'],
    formal: {
      players: 'You and the rival.',
      actions: 'Launch now or wait (each).',
      timing: 'Sequential: the rival observes your choice.',
      information: 'Perfect information about moves; payoffs are your team’s estimates.',
      payoffs: 'As stated (you first).',
      opponent: 'The rival best-replies to the move it sees.',
      solution: 'Backward induction: launch now; the rival waits (6, 4).',
      source: 'original',
      sourceNote: 'Designed for this app.',
    },
    predict: {
      question: 'If you launch now, what will the rival do?',
      basis: 'calculable',
      modelAnswer: 'Wait: 4 beats 3 for the rival.',
      options: [
        { id: 'wait', label: 'Wait', verdict: 'match', feedback: 'Against your launch, launching too gives the rival 3 and waiting 4. It waits.' },
        { id: 'now', label: 'Launch too — it’s bigger', verdict: 'misconception', feedback: 'Being bigger doesn’t change its payoffs: after your launch, waiting pays it 4, launching 3.' },
        { id: 'unknown', label: 'Impossible to say', verdict: 'defensible', feedback: 'Estimates can be wrong — but on the numbers given, the rival’s best reply is clear.' },
      ],
      solve: () => backwardInduction(LAUNCH).choice['r-now'],
    },
    play: launchPlay,
    explain: [
      'The decisive fact wasn’t in the payoffs but in the timing: the rival can see your move. That makes this sequential, and backward induction picks out the equilibrium in which you lead.',
      'What could change the recommendation: if the rival couldn’t see your launch in time, it would be a simultaneous game with two equilibria; if your payoff estimates are off, the rival’s reply could flip.',
    ],
    takeaway: 'Start by asking who moves when and who sees what. The model follows from the facts, not from the labels.',
    skill: 'anticipating',
  }),
  defineScenario({
    id: 'l22.b.team-crisis',
    lesson: 'strategic-practice',
    slot: 'B',
    version: 1,
    title: 'The bug before launch',
    purpose: 'A team problem with conflicting incentives and nobody knowing what the others will do.',
    setup: 'The night before a launch, you and two other engineers each spot the same serious bug. Reporting it means a long night and some blame (cost 4 to whoever reports). If at least one person reports, the launch is saved, worth 10 to each of you. Nobody can tell whether the others have noticed or will act.',
    rules: ['Step 1: identify the core problem.', 'Step 2: report or wait.', 'If anyone reports, everyone gets 10; each reporter pays 4.', 'Each colleague reports independently with the equilibrium probability (≈ 36.8%).'],
    formal: {
      players: 'You and two colleagues.',
      actions: 'Report or wait.',
      timing: 'Simultaneous.',
      information: 'Incomplete: nobody knows whether others will act.',
      payoffs: '10 to all if anyone reports; −4 to each reporter.',
      opponent: 'Each colleague reports with probability p where (1 − p)² = 0.4 (p ≈ 0.368).',
      chance: 'Colleagues’ choices.',
      solution: 'Volunteer’s dilemma (Diekmann, 1985): symmetric mixed equilibrium; P(nobody reports) = 0.4^(n/(n−1)) rises with team size.',
      source: 'adapted',
      sourceNote: 'Volunteer’s dilemma (Diekmann, 1985), with this app’s numbers.',
    },
    predict: {
      question: 'If everyone behaves the same way in equilibrium, is the bug more likely to go unreported in a team of 3 or a team of 6?',
      basis: 'calculable',
      modelAnswer: 'A team of 6 (33% vs 25%).',
      options: [
        { id: '6', label: 'A team of 6', verdict: 'match', feedback: 'With more colleagues, each one relies on the others more: in equilibrium P(nobody reports) rises from about 25% to about 33%.' },
        { id: '3', label: 'A team of 3 — fewer people to notice', verdict: 'misconception', feedback: 'More people do notice, but each reports less often — enough that the bug is more likely to slip through.' },
        { id: 'same', label: 'The same either way', verdict: 'misconception', feedback: 'The equilibrium chance that nobody acts depends on team size: 0.4^(n/(n−1)).' },
      ],
      solve: () => (nobodyReports(6) > nobodyReports(3) ? '6' : '3'),
    },
    play: crisisPlay,
    explain: [
      'Recognising the structure is the key step: one person’s costly action benefits everyone, so each is tempted to leave it to others. Larger groups make this worse, not better.',
      'What could change the recommendation: assigning one named owner turns it into a simple decision; making reports anonymous lowers the cost; a reward for reporting changes the payoffs.',
    ],
    takeaway: 'When everyone benefits if someone acts, expect each to hope it’s someone else — and design roles so it isn’t.',
    skill: 'coordination',
  }),
  defineScenario({
    id: 'l22.c.negotiation-pressure',
    lesson: 'strategic-practice',
    slot: 'C',
    version: 1,
    title: 'Negotiating against the clock',
    purpose: 'Choose the model yourself: timing, hidden information and a deadline all at once.',
    setup: 'You must buy a service worth 60 to your firm within three rounds of negotiation. The supplier’s minimum price is either $25 or $36 (equally likely) — you don’t know which. Each round of delay costs you 3. If no deal by round 3, you buy elsewhere for $45. The supplier accepts the first offer at or above its minimum.',
    rules: ['Step 1: decide which features matter.', 'Step 2: make an offer each round: $25, $30 or $36.', 'Your payoff = 60 − price − 3 × rounds of delay (or 60 − 45 − 9 with no deal).'],
    formal: {
      players: 'You and the supplier.',
      actions: 'Offers each round; the supplier accepts or rejects.',
      timing: 'Up to three sequential rounds.',
      information: 'Hidden type: the supplier’s minimum (25 or 36, prior 50/50).',
      payoffs: '60 − price − 3 × delay; fallback 45 after three rounds.',
      opponent: 'Accepts any offer ≥ its minimum.',
      chance: 'The supplier’s type.',
      solution: 'Open at $25, then $36 if rejected: expected 28 — better than $36 at once (24) or $30 first (25.5).',
      source: 'original',
      sourceNote: 'Designed for this app; combines Bayesian reasoning (Lesson 15) and delay costs (Lessons 11–12).',
    },
    predict: {
      question: 'What is the best opening offer?',
      basis: 'calculable',
      modelAnswer: '$25 — test for the low-cost type first.',
      options: [
        { id: '25', label: '$25', verdict: 'match', feedback: 'Half the time it’s accepted (payoff 35). Otherwise you lose 3 and pay 36 next round (21). Expected 28.' },
        { id: '36', label: '$36 — make sure of a deal now', verdict: 'defensible', feedback: 'Safe: always accepted, payoff 24. But testing low first is worth 4 more on average, because delay costs only 3.' },
        { id: '30', label: '$30 — meet in the middle', verdict: 'misconception', feedback: 'It’s rejected by the high type just like $25, but pays 5 more to the low type: expected 25.5.' },
      ],
      solve: () => String(OPENING_OFFERS.reduce((a, b) => (negotiationValue(b) > negotiationValue(a) ? b : a))),
    },
    play: negotiationPlay,
    explain: [
      'This combines three earlier ideas: a hidden type (the supplier’s minimum), sequential offers, and a cost of delay. The opening offer works as a screen: it separates the low-cost type from the high-cost type at the price of possibly losing a round.',
      'What could change the recommendation: a higher cost of delay (above 11) makes $36 at once better; a lower chance of the low-cost type also favours a higher opening.',
    ],
    takeaway: 'Name the features that matter — who knows what, who moves when, what delay costs — and the right model, and the right move, follow.',
    skill: 'uncertainty',
  }),
];

export const MODULE6_SCENARIOS: ScenarioSpec[] = [...L19, ...L20, ...L21, ...L22];
