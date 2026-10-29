import { type ArenaEngine, CODENAMES, type Debrief, LENGTH_ROUNDS, type Setup, drawInt, resultFrom, shuffled } from './core.ts';

/**
 * The Coalition — four parties, one prize per round, and a majority needed to claim it.
 *
 * Seats: you (0) and three bot parties (Ash, Birch, Cedar). Ash (seat 1) is the personality you face; the other two are
 * two of the remaining personalities, picked by the seed. Seat weights 34, 28, 22 and 16 (of 100) are dealt to the four
 * parties by the seed, so your bargaining power changes from match to match. A coalition needs MAJORITY seats.
 *
 * Each round:
 * 1. The proposer (rotating, starting seat fixed by the seed) names a coalition that includes itself and holds at least
 *    MAJORITY seats, and splits the PRIZE among its members in whole points.
 * 2. Every other member accepts or rejects, simultaneously. Parties outside the coalition have no say.
 * 3. All accept: the split is paid. Anyone rejects: the bill fails and nobody gets anything this round.
 * Most points at the end wins.
 *
 * Power isn't seats: with weights 34/28/22/16 the 34 can win with either the 28 or the 22, the 28 and 22 need the 34
 * (or each other plus the 16), and the 16 matters only to the 28 + 22. Who is pivotal, and how the prize is split,
 * decides which coalitions hold together.
 *
 * Bots respond to an offer after seeing it (the rules let every member read the bill), but decide from the state as it
 * was when the bill was tabled; they never see the other members' votes.
 */

export const COALITION_PERSONAS = ['loyal', 'broker', 'switcher', 'fair'] as const;
export type CoalitionPersona = (typeof COALITION_PERSONAS)[number];
export const COALITION_NAME: Record<CoalitionPersona, string> = { loyal: 'The Loyal Ally', broker: 'The Power Broker', switcher: 'The Opportunistic Switcher', fair: 'The Fair Negotiator' };

export type CoalitionVariant = 'standard';
export const COALITION_VARIANTS: readonly CoalitionVariant[] = ['standard'];
export const coalitionRounds = LENGTH_ROUNDS(4, 8, 12);
export const WEIGHTS = [34, 28, 22, 16] as const;
export const MAJORITY = 51;
export const PRIZE = 12;

export interface Proposal {
  proposer: number;
  /** Coalition members, including the proposer, ascending. */
  members: number[];
  /** Points per seat (0 for non-members); sums to PRIZE. */
  shares: number[];
}

export type CoalitionAction = { kind: 'propose'; members: number[]; shares: number[] } | { kind: 'respond'; accept: boolean } | { kind: 'watch' };

export interface CoalitionRound {
  proposal: Proposal;
  /** responses[i]: member i's vote (null for the proposer and non-members). */
  responses: (boolean | null)[];
  passed: boolean;
}

export interface CoalitionState {
  setup: Setup<CoalitionVariant, CoalitionPersona>;
  total: number;
  seats: (CoalitionPersona | null)[];
  weights: number[];
  start: number;
  points: number[];
  rounds: CoalitionRound[];
}

export const partyName = (seat: number) => (seat === 0 ? 'You' : CODENAMES[seat - 1]);
export const proposerOf = (s: CoalitionState, n: number) => (s.start + n) % 4;
export const seatsOf = (s: CoalitionState, members: readonly number[]) => members.reduce((t, m) => t + s.weights[m], 0);

/** Seat-proportional share of the prize for `seat` within `members`. */
export const proportional = (s: CoalitionState, members: readonly number[], seat: number) => (PRIZE * s.weights[seat]) / seatsOf(s, members);

/** Every minimal winning coalition containing `seat` (dropping any member loses the majority). */
export function minimalWinning(s: CoalitionState, seat: number): number[][] {
  const out: number[][] = [];
  for (let mask = 0; mask < 16; mask++) {
    if (!(mask & (1 << seat))) continue;
    const m = [0, 1, 2, 3].filter((i) => mask & (1 << i));
    if (seatsOf(s, m) < MAJORITY) continue;
    if (m.every((x) => seatsOf(s, m.filter((y) => y !== x)) < MAJORITY)) out.push(m);
  }
  return out;
}

/** Whether `seat` is pivotal in `members`: the coalition loses its majority without it. */
export const pivotal = (s: CoalitionState, members: readonly number[], seat: number) => seatsOf(s, members.filter((x) => x !== seat)) < MAJORITY;

/** The party `seat` last formed a passing coalition with (the most recent partner), or null. */
function allyOf(s: CoalitionState, seat: number): number | null {
  for (let k = s.rounds.length - 1; k >= 0; k--) {
    const r = s.rounds[k];
    if (r.passed && r.proposal.members.includes(seat)) {
      const partners = r.proposal.members.filter((m) => m !== seat);
      if (partners.length) return partners.sort((a, b) => s.weights[b] - s.weights[a])[0];
    }
  }
  return null;
}

/** `ally` passed a bill without `seat` since they last stood together: a betrayal, as the Loyal Ally sees it. */
function betrayedBy(s: CoalitionState, seat: number, ally: number): boolean {
  for (let k = s.rounds.length - 1; k >= 0; k--) {
    const r = s.rounds[k];
    if (!r.passed) continue;
    const m = r.proposal.members;
    if (m.includes(seat) && m.includes(ally)) return false;
    if (m.includes(ally) && !m.includes(seat)) return true;
  }
  return false;
}

/** The lowest share each party has accepted so far (null if never asked). Public: votes are revealed every round. */
function lowestAccepted(s: CoalitionState, seat: number): number | null {
  let lo: number | null = null;
  for (const r of s.rounds) if (r.responses[seat] === true) lo = lo === null ? r.proposal.shares[seat] : Math.min(lo, r.proposal.shares[seat]);
  return lo;
}

function split(s: CoalitionState, proposer: number, members: number[], partnerShare: (seat: number) => number): Proposal {
  const shares = [0, 0, 0, 0];
  let left = PRIZE;
  for (const m of members)
    if (m !== proposer) {
      shares[m] = Math.max(0, Math.min(left, Math.round(partnerShare(m))));
      left -= shares[m];
    }
  shares[proposer] = left;
  return { proposer, members, shares };
}

/**
 * A bot's bill, from the public record (past bills and votes) and the seat weights.
 *
 * Loyal Ally — proposes the smallest-seat minimal winning coalition that includes its ally (its last partner in a passed
 *   bill), with seat-proportional shares; without an ally, the smallest-seat coalition. Hard drops an ally that betrayed
 *   it (passed a bill without it).
 * Power Broker — picks the coalition whose partners are cheapest (fewest seats) and keeps most of the prize: partners get
 *   45 % (Easy 55 %) of their proportional share. Hard reads the record: it offers each partner one point more than the
 *   lowest share that partner has accepted, and pays proportionally only if its last bill failed.
 * Opportunistic Switcher — goes wherever support is cheapest right now: the coalition whose partners have accepted the
 *   least so far (untested partners count as proportional), offering that lowest accepted share (Easy: proportional
 *   minus 1). It changes partners whenever another is cheaper.
 * Fair Negotiator — the smallest-seat minimal winning coalition, split by seats (rounded; the remainder to itself).
 */
export function coalitionPropose(s: CoalitionState, seat: number): Proposal {
  const persona = s.seats[seat]!;
  const { level } = s.setup;
  const options = minimalWinning(s, seat);
  const bySeats = [...options].sort((a, b) => seatsOf(s, a) - seatsOf(s, b) || a.length - b.length);
  const prop = (members: number[]) => (m: number) => proportional(s, members, m);

  if (persona === 'loyal') {
    let ally = allyOf(s, seat);
    if (ally !== null && level === 'hard' && betrayedBy(s, seat, ally)) ally = null;
    const pick = (ally !== null ? bySeats.find((c) => c.includes(ally!)) : undefined) ?? bySeats[0];
    return split(s, seat, pick, prop(pick));
  }
  if (persona === 'broker') {
    const cheapest = [...options].sort((a, b) => seatsOf(s, a) - s.weights[seat] - (seatsOf(s, b) - s.weights[seat]) || a.length - b.length)[0];
    const lastOwn = [...s.rounds].reverse().find((r) => r.proposal.proposer === seat);
    if (level === 'hard') {
      if (lastOwn && !lastOwn.passed) return split(s, seat, cheapest, prop(cheapest));
      return split(s, seat, cheapest, (m) => {
        const lo = lowestAccepted(s, m);
        return lo === null ? proportional(s, cheapest, m) * 0.6 : lo + 1;
      });
    }
    const f = level === 'easy' ? 0.55 : 0.45;
    return split(s, seat, cheapest, (m) => proportional(s, cheapest, m) * f);
  }
  if (persona === 'switcher') {
    const cost = (c: number[]) => c.filter((m) => m !== seat).reduce((t, m) => t + (lowestAccepted(s, m) ?? proportional(s, c, m)), 0);
    const pick = [...options].sort((a, b) => cost(a) - cost(b) || seatsOf(s, a) - seatsOf(s, b))[0];
    return split(s, seat, pick, (m) => (level === 'easy' ? proportional(s, pick, m) - 1 : (lowestAccepted(s, m) ?? proportional(s, pick, m))));
  }
  const pick = bySeats[0];
  return split(s, seat, pick, prop(pick));
}

/**
 * Whether a bot member accepts a bill. It sees the bill (the rules show it to every member), not the other votes.
 *
 * Loyal Ally — from its ally: at least 60 % of its proportional share (Easy 40 %); from anyone else: 90 % (Easy 60 %,
 *   Hard 100 %). Hard asks 120 % from a party that betrayed it.
 * Power Broker — a fixed price: Easy 3, Normal 4 points. Hard prices its leverage: 5 when it is pivotal, 3 otherwise.
 * Opportunistic Switcher — Easy: 3 or more. Otherwise at least the best offer it has seen in the last three rounds minus
 *   one (at least 2): it compares, and follows the money.
 * Fair Negotiator — at least 80 % of its proportional share (Easy 60 %). Normal and Hard also reject a bill whose
 *   proposer keeps more than twice its own proportional share, even when the offer itself is acceptable.
 */
export function coalitionAccepts(s: CoalitionState, seat: number, p: Proposal): boolean {
  const persona = s.seats[seat]!;
  const { level } = s.setup;
  const share = p.shares[seat];
  const fairShare = proportional(s, p.members, seat);
  if (persona === 'loyal') {
    const ally = allyOf(s, seat);
    if (level === 'hard' && betrayedBy(s, seat, p.proposer) && ally === p.proposer) return share >= fairShare * 1.2;
    if (ally === p.proposer) return share >= fairShare * (level === 'easy' ? 0.4 : 0.6);
    return share >= fairShare * (level === 'easy' ? 0.6 : level === 'normal' ? 0.9 : 1);
  }
  if (persona === 'broker') {
    if (level === 'hard') return share >= (pivotal(s, p.members, seat) ? 5 : 3);
    return share >= (level === 'easy' ? 3 : 4);
  }
  if (persona === 'switcher') {
    if (level === 'easy') return share >= 3;
    const recent = s.rounds.slice(-3).map((r) => (r.proposal.members.includes(seat) ? r.proposal.shares[seat] : 0));
    return share >= Math.max(2, Math.max(0, ...recent) - 1);
  }
  if (share < fairShare * (level === 'easy' ? 0.6 : 0.8)) return false;
  if (level !== 'easy' && p.shares[p.proposer] > 2 * proportional(s, p.members, p.proposer)) return false;
  return true;
}

export type CoalitionPrompt =
  | { phase: 'propose'; round: number; options: number[][] }
  | { phase: 'respond'; round: number; proposal: Proposal }
  | { phase: 'watch'; round: number; proposal: Proposal };

export function coalitionPrompt(s: CoalitionState): CoalitionPrompt | null {
  const n = s.rounds.length;
  if (n >= s.total) return null;
  const proposer = proposerOf(s, n);
  if (proposer === 0) return { phase: 'propose', round: n + 1, options: minimalWinning(s, 0) };
  const proposal = coalitionPropose(s, proposer);
  return proposal.members.includes(0) ? { phase: 'respond', round: n + 1, proposal } : { phase: 'watch', round: n + 1, proposal };
}

function checkProposal(s: CoalitionState, members: unknown, shares: unknown): string | null {
  if (!Array.isArray(members) || !Array.isArray(shares) || shares.length !== 4) return 'Name your partners and the split.';
  const m = [...new Set(members as number[])].sort();
  if (m.length !== members.length || !m.every((x) => Number.isInteger(x) && x >= 0 && x < 4)) return 'Choose each party at most once.';
  if (!m.includes(0)) return 'Your own party must be in your coalition.';
  if (m.length < 2) return 'Invite at least one partner.';
  if (seatsOf(s, m) < MAJORITY) return `That coalition holds ${seatsOf(s, m)} seats — it needs ${MAJORITY}.`;
  if (!(shares as number[]).every((x) => Number.isInteger(x) && x >= 0)) return 'Shares are whole points, 0 or more.';
  if ((shares as number[]).reduce((a, b) => a + b, 0) !== PRIZE) return `The shares must add up to ${PRIZE}.`;
  if ((shares as number[]).some((x, i) => x > 0 && !m.includes(i))) return 'Only coalition members can be paid.';
  return null;
}

function validate(s: CoalitionState, a: CoalitionAction): string | null {
  const p = coalitionPrompt(s);
  if (!p) return 'The session is over.';
  if (!a || typeof a !== 'object') return 'Choose an action.';
  if (p.phase === 'propose') return a.kind === 'propose' ? checkProposal(s, a.members, a.shares) : 'It’s your turn to table a bill.';
  if (p.phase === 'respond') return a.kind === 'respond' && typeof a.accept === 'boolean' ? null : 'Accept or reject the bill.';
  return a.kind === 'watch' ? null : 'You aren’t in this coalition — watch the vote.';
}

function apply(s: CoalitionState, a: CoalitionAction): CoalitionState {
  const why = validate(s, a);
  if (why) throw new Error(`coalition: ${why}`);
  const n = s.rounds.length;
  const proposer = proposerOf(s, n);
  const proposal: Proposal = a.kind === 'propose' ? { proposer: 0, members: [...a.members].sort(), shares: [...a.shares] } : coalitionPropose(s, proposer);
  const responses = [0, 1, 2, 3].map((i) => {
    if (i === proposal.proposer || !proposal.members.includes(i)) return null;
    if (i === 0) return (a as { accept: boolean }).accept;
    return coalitionAccepts(s, i, proposal);
  });
  const passed = responses.every((r) => r !== false);
  return { ...s, points: s.points.map((x, i) => x + (passed ? proposal.shares[i] : 0)), rounds: [...s.rounds, { proposal, responses, passed }] };
}

const describe = (p: Proposal) => p.members.map((m) => `${partyName(m)} ${p.shares[m]}`).join(' · ');

function coalitionDebrief(s: CoalitionState): Debrief {
  const h = s.rounds;
  const moments: { at: number; text: string }[] = [];
  const mineFailed = h.map((r, i) => ({ r, i })).find(({ r }) => r.proposal.proposer === 0 && !r.passed);
  if (mineFailed) {
    const no = mineFailed.r.responses.map((v, i) => (v === false ? partyName(i) : null)).filter(Boolean);
    moments.push({ at: mineFailed.i, text: `Round ${mineFailed.i + 1}: your bill (${describe(mineFailed.r.proposal)}) failed — ${no.join(' and ')} said no. A failed bill pays nobody, you included.` });
  }
  const mineBest = h.map((r, i) => ({ r, i })).filter(({ r }) => r.proposal.proposer === 0 && r.passed).sort((x, y) => y.r.proposal.shares[0] - x.r.proposal.shares[0])[0];
  if (mineBest) moments.push({ at: mineBest.i, text: `Round ${mineBest.i + 1}: your bill passed with ${mineBest.r.proposal.shares[0]} for you (${describe(mineBest.r.proposal)}).` });
  const leftOut = h.map((r, i) => ({ r, i })).find(({ r }) => r.passed && !r.proposal.members.includes(0));
  if (leftOut) moments.push({ at: leftOut.i, text: `Round ${leftOut.i + 1}: ${partyName(leftOut.r.proposal.proposer)} formed a coalition without you (${describe(leftOut.r.proposal)}).` });
  const refused = h.map((r, i) => ({ r, i })).find(({ r }) => r.responses[0] === false);
  if (refused && moments.length < 3) moments.push({ at: refused.i, text: `Round ${refused.i + 1}: you rejected ${refused.r.proposal.shares[0]} points from ${partyName(refused.r.proposal.proposer)} — the bill fell, so everyone in it got nothing.` });
  if (!moments.length) moments.push({ at: 0, text: `${h.filter((r) => r.passed).length} of ${h.length} bills passed.` });
  const weight = s.weights[0];
  const insight =
    mineFailed && !mineBest
      ? 'A coalition holds only if every member prefers it to the alternative. Offer partners at least what they could get elsewhere — the cheapest partner isn’t always the one with the fewest seats, but the one with the fewest options.'
      : `Your ${weight} seats mattered less than how often you were pivotal: bargaining power comes from being needed, and a split that leaves a partner a better deal elsewhere won’t survive the next round.`;
  const rival = h.map((r, i) => ({ r, i })).filter(({ r }) => r.proposal.members.includes(1));
  const ownBills = rival.filter(({ r }) => r.proposal.proposer === 1);
  const votes = rival.filter(({ r }) => r.responses[1] !== null);
  const ex: string[] = [];
  if (ownBills[0]) ex.push(`its bill in round ${ownBills[0].i + 1} was ${describe(ownBills[0].r.proposal)}`);
  const no = votes.find(({ r }) => r.responses[1] === false);
  const yes = votes.find(({ r }) => r.responses[1] === true);
  if (no) ex.push(`it rejected ${no.r.proposal.shares[1]} in round ${no.i + 1}`);
  else if (yes) ex.push(`it accepted ${yes.r.proposal.shares[1]} in round ${yes.i + 1}`);
  const style: Record<CoalitionPersona, string> = {
    loyal: 'kept returning to the partner it had already worked with',
    broker: 'built the cheapest winning coalition and kept the lion’s share',
    switcher: 'went wherever support was cheapest, changing partners when the price moved',
    fair: 'split by seats and refused bills that weren’t defensible',
  };
  return {
    headline: 'Session closed',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${COALITION_NAME[s.setup.persona]} (Ash, ${s.weights[1]} seats) ${style[s.setup.persona]}${ex.length ? `: ${ex.join('; ')}.` : '.'}`,
  };
}

export const coalition: ArenaEngine<CoalitionState, CoalitionAction, CoalitionVariant> = {
  id: 'coalition',
  opponents: COALITION_PERSONAS,
  variants: COALITION_VARIANTS,
  rounds: coalitionRounds,
  create(setup) {
    const s = setup as Setup<CoalitionVariant, CoalitionPersona>;
    const others = COALITION_PERSONAS.filter((p) => p !== s.persona);
    const drop = drawInt(s.seed, 999, 0, 0, others.length - 1);
    const seats: (CoalitionPersona | null)[] = [null, s.persona, ...others.filter((_, i) => i !== drop)];
    return { setup: s, total: coalitionRounds(s.length), seats, weights: shuffled(WEIGHTS, s.seed, 998, 0), start: drawInt(s.seed, 997, 0, 0, 3), points: [0, 0, 0, 0], rounds: [] };
  },
  validate,
  apply,
  isOver: (s) => s.rounds.length >= s.total,
  played: (s) => s.rounds.length,
  result: (s) => resultFrom(s.seats.map((p, i) => ({ id: p ?? 'you', name: partyName(i), score: s.points[i], isPlayer: i === 0 })), 'points'),
  debrief: coalitionDebrief,
  moves(s) {
    const p = coalitionPrompt(s);
    if (!p) return [];
    if (p.phase === 'respond') return [{ kind: 'respond', accept: true }, { kind: 'respond', accept: false }];
    if (p.phase === 'watch') return [{ kind: 'watch' }];
    return p.options.flatMap((members) => {
      const fair = split(s, 0, members, (m) => proportional(s, members, m));
      const greedy = split(s, 0, members, (m) => proportional(s, members, m) * 0.5);
      return [fair, greedy].map((x) => ({ kind: 'propose' as const, members: x.members, shares: x.shares }));
    });
  },
};
