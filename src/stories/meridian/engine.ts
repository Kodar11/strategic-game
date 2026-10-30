import { AXELROD, type Move, type StagePayoffs, stage } from '../../game/repeated.ts';

/**
 * The Meridian Trials — the repeated prisoner's dilemma tournament behind Story Two. Pure and deterministic: every
 * number the story shows comes from these functions, never from copy.
 *
 * Rules of the game (also stated in the story):
 * - Payoffs: Axelrod's illustrative points, T 5 / R 3 / P 1 / S 0 (both cooperate 3 each, both defect 1 each, a lone
 *   defector 5 against the cooperator's 0). Points, not money.
 * - Each round both sides choose at the same time and see each other's executed move afterwards.
 * - A match is a fixed number of rounds (MATCH_ROUNDS). No strategy here looks at the round number, so none can
 *   exploit a known last round — the length is effectively hidden from them.
 * - Noise: with probability `noise`, a side's intended move is executed as the opposite. Both sides see only the
 *   executed move; a strategy never learns its partner "meant" something else. Slips come from a seeded counter-based
 *   hash, so the same tournament always produces the same slips.
 * - Tournament: round-robin over a field of entries (each with a head count). Every distinct pair plays, and every
 *   entry also meets a copy of itself, as in Axelrod's tournaments. Each pairing is played `repeats` times with
 *   different noise seeds (one is enough without noise).
 * - Score: average points per round against the whole field, weighted by how many of each opponent are in the room
 *   (a strategy meets each copy of the others, and each other copy of itself). Ranking is by that score; ties keep
 *   field order.
 */

export type { Move } from '../../game/repeated.ts';
export const PAYOFFS: StagePayoffs = AXELROD;
export const MATCH_ROUNDS = 50;

export type StrategyId =
  | 'open-hand'
  | 'mirror'
  | 'iron-wall'
  | 'long-memory'
  | 'weathervane'
  | 'prober'
  | 'gentle-mirror'
  | 'pendulum'
  | 'wary-mirror'
  | 'settler'
  | 'calculator'
  | 'yours';

/** One round from one side's point of view. */
export interface Seen {
  me: Move;
  them: Move;
}

/**
 * A strategy the player can build in the final experiment. The three starting strategies are presets of it.
 * - opening: the first move.
 * - response: what it does after the partner's last move —
 *     'always-c' cooperate regardless · 'copy' copy their last move · 'two' defect only after two defections in a row
 *     · 'grudge' cooperate until the first defection, then defect forever · 'always-d' defect regardless.
 * - forgive: chance (0–1) of cooperating anyway when the response would defect. Drawn from the match seed.
 */
export interface Design {
  opening: Move;
  response: 'always-c' | 'copy' | 'two' | 'grudge' | 'always-d';
  forgive: number;
}

export const STARTERS = ['open-hand', 'mirror', 'iron-wall'] as const;
export type StarterId = (typeof STARTERS)[number];

export const STARTER_DESIGN: Record<StarterId, Design> = {
  'open-hand': { opening: 'C', response: 'always-c', forgive: 0 },
  mirror: { opening: 'C', response: 'copy', forgive: 0 },
  'iron-wall': { opening: 'D', response: 'always-d', forgive: 0 },
};

/** Counter-based uniform draw in [0, 1): the same (seed, a, b, c) always gives the same number. */
export function hash01(seed: number, a: number, b: number, c: number): number {
  // Each input is folded in with a golden-ratio step, then fully mixed with the murmur3 32-bit finalizer.
  let h = seed >>> 0;
  for (const k of [a, b, c]) {
    h = (h + Math.imul(k + 1, 0x9e3779b9)) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  // `^` yields a signed 32-bit int; reinterpret as unsigned before scaling.
  return (h >>> 0) / 4294967296;
}

/** Everything a strategy may look at when choosing: its own past rounds and a private random stream. */
export interface Ctx {
  history: readonly Seen[];
  /** Uniform draw for this round, private to this side. */
  rand: () => number;
}

export type Rule = (ctx: Ctx) => Move;

const last = (h: readonly Seen[]) => h[h.length - 1];

export function designRule(d: Design): Rule {
  return ({ history, rand }) => {
    if (history.length === 0) return d.opening;
    let move: Move;
    switch (d.response) {
      case 'always-c':
        return 'C';
      case 'always-d':
        return 'D';
      case 'copy':
        move = last(history).them;
        break;
      case 'two':
        move = history.length >= 2 && history[history.length - 1].them === 'D' && history[history.length - 2].them === 'D' ? 'D' : 'C';
        break;
      case 'grudge':
        move = history.some((r) => r.them === 'D') ? 'D' : 'C';
        break;
    }
    if (move === 'D' && d.forgive > 0 && rand() < d.forgive) return 'C';
    return move;
  };
}

/**
 * The Calculator: the "sophisticated" entrant. It opens with three cooperations to study its partner, then keeps a
 * running estimate of how often the partner cooperates right after being defected against. If the partner seems
 * to forgive more often than not, it defects every third round to farm that forgiveness; otherwise it plays
 * copy-the-last-move. Against a partner that has defected more than half the time it simply defects.
 */
const calculator: Rule = ({ history }) => {
  const n = history.length;
  if (n < 3) return 'C';
  const theirC = history.filter((r) => r.them === 'C').length;
  if (theirC < n / 2) return 'D';
  let provoked = 0;
  let forgave = 0;
  for (let i = 0; i < n - 1; i++) {
    if (history[i].me === 'D') {
      provoked++;
      if (history[i + 1].them === 'C') forgave++;
    }
  }
  if (provoked === 0) return n % 3 === 0 ? 'D' : 'C'; // probe once to learn
  if (forgave / provoked > 0.5) return n % 3 === 0 ? 'D' : 'C';
  return last(history).them;
};

/** The Prober: opens D, C, C. If the partner never hit back during that, it keeps exploiting; else it plays copy. */
const prober: Rule = ({ history }) => {
  const n = history.length;
  if (n === 0) return 'D';
  if (n < 3) return 'C';
  const retaliated = history[1].them === 'D' || history[2].them === 'D';
  return retaliated ? last(history).them : 'D';
};

/** The Settler (win-stay, lose-shift): repeat your last move if it paid well (3 or 5), switch if it didn't (0 or 1). */
const settler: Rule = ({ history }) => {
  if (history.length === 0) return 'C';
  const r = last(history);
  const paid = stage(PAYOFFS, r.me, r.them)[0];
  const good = paid >= PAYOFFS.R;
  return good ? r.me : r.me === 'C' ? 'D' : 'C';
};

export interface StrategyInfo {
  id: StrategyId;
  name: string;
  /** One plain sentence: what it does. */
  rule: string;
  /** Broad family, for the story's own descriptions. */
  kind: 'cooperative' | 'retaliatory' | 'exploitative' | 'unpredictable';
}

export const STRATEGIES: Record<Exclude<StrategyId, 'yours'>, StrategyInfo & { play: Rule }> = {
  'open-hand': { id: 'open-hand', name: 'The Open Hand', rule: 'Always cooperates.', kind: 'cooperative', play: designRule(STARTER_DESIGN['open-hand']) },
  mirror: { id: 'mirror', name: 'The Mirror', rule: 'Cooperates first, then copies your last move.', kind: 'retaliatory', play: designRule(STARTER_DESIGN.mirror) },
  'iron-wall': { id: 'iron-wall', name: 'The Iron Wall', rule: 'Always defects.', kind: 'exploitative', play: designRule(STARTER_DESIGN['iron-wall']) },
  'long-memory': { id: 'long-memory', name: 'The Long Memory', rule: 'Cooperates until you defect once — then never again.', kind: 'retaliatory', play: designRule({ opening: 'C', response: 'grudge', forgive: 0 }) },
  weathervane: { id: 'weathervane', name: 'The Weathervane', rule: 'Flips a coin every round.', kind: 'unpredictable', play: ({ rand }) => (rand() < 0.5 ? 'C' : 'D') },
  prober: { id: 'prober', name: 'The Prober', rule: 'Opens with a defection. If you don’t hit back, it keeps taking.', kind: 'exploitative', play: prober },
  'gentle-mirror': { id: 'gentle-mirror', name: 'The Gentle Mirror', rule: 'Copies your last move, but lets one defection in five go.', kind: 'retaliatory', play: designRule({ opening: 'C', response: 'copy', forgive: 0.2 }) },
  pendulum: { id: 'pendulum', name: 'The Pendulum', rule: 'Alternates: cooperate, defect, cooperate, defect…', kind: 'unpredictable', play: ({ history }) => (history.length % 2 === 0 ? 'C' : 'D') },
  'wary-mirror': { id: 'wary-mirror', name: 'The Wary Mirror', rule: 'Defects first, then copies your last move.', kind: 'retaliatory', play: designRule({ opening: 'D', response: 'copy', forgive: 0 }) },
  settler: { id: 'settler', name: 'The Settler', rule: 'Repeats its move when it paid off; switches when it didn’t.', kind: 'retaliatory', play: settler },
  calculator: { id: 'calculator', name: 'The Calculator', rule: 'Studies you, estimates how forgiving you are, and exploits it.', kind: 'exploitative', play: calculator },
};

export interface Entrant {
  id: StrategyId;
  play: Rule;
  /**
   * What the rule *is*, independent of who entered it: the strategy id, or the design for a custom rule that matches
   * none. Random draws and slips are keyed to it, so two entries with the same rule always get the same results.
   */
  key: string;
}

export function entrant(id: Exclude<StrategyId, 'yours'>): Entrant {
  return { id, play: STRATEGIES[id].play, key: id };
}

/** Field strategies a designed rule can coincide with. */
const DESIGNED: Partial<Record<Exclude<StrategyId, 'yours'>, Design>> = {
  ...STARTER_DESIGN,
  'long-memory': { opening: 'C', response: 'grudge', forgive: 0 },
  'wary-mirror': { opening: 'D', response: 'copy', forgive: 0 },
};

export function designKey(d: Design): string {
  for (const [id, x] of Object.entries(DESIGNED)) if (x.opening === d.opening && x.response === d.response && x.forgive === d.forgive) return id;
  return `design:${d.opening}/${d.response}/${d.forgive}`;
}

export function yours(d: Design): Entrant {
  return { id: 'yours', play: designRule(d), key: designKey(d) };
}

/** 32-bit FNV-1a hash of a string. */
function strHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export interface RoundResult {
  /** Intended moves… */
  ia: Move;
  ib: Move;
  /** …and executed (different only after a slip). */
  a: Move;
  b: Move;
  pa: number;
  pb: number;
}

export interface MatchResult {
  rounds: RoundResult[];
  a: number;
  b: number;
}

export interface MatchOptions {
  rounds?: number;
  noise?: number;
  seed?: number;
  payoffs?: StagePayoffs;
  /** Scripted slips (for illustrations): that side's move in that round (0-based) comes out as its opposite. */
  slips?: readonly { side: 'a' | 'b'; round: number }[];
}

/** One match. Both choices in a round are computed from completed rounds only, then resolved together. */
export function playMatch(A: Entrant, B: Entrant, opts: MatchOptions = {}): MatchResult {
  const { rounds = MATCH_ROUNDS, noise = 0, seed = 1, payoffs = PAYOFFS, slips = [] } = opts;
  // Each side's draws are salted by its rule, not its seat, so swapping seats or entrants with the same rule changes
  // nothing. Two copies of one rule need different streams, so the second seat gets an offset.
  const saltA = strHash(A.key) % 1000003;
  const saltB = (strHash(B.key) % 1000003) + (A.key === B.key ? 7777 : 0);
  const slipped = (side: 'a' | 'b', t: number, salt: number) =>
    slips.some((s) => s.side === side && s.round === t) || (noise > 0 && hash01(seed, t, salt, 1) < noise);
  const hA: Seen[] = [];
  const hB: Seen[] = [];
  const out: RoundResult[] = [];
  let sa = 0;
  let sb = 0;
  for (let t = 0; t < rounds; t++) {
    let ka = 0;
    let kb = 0;
    const ia = A.play({ history: hA, rand: () => hash01(seed, t, saltA, 2 + ka++) });
    const ib = B.play({ history: hB, rand: () => hash01(seed, t, saltB, 2 + kb++) });
    const a = slipped('a', t, saltA) ? flip(ia) : ia;
    const b = slipped('b', t, saltB) ? flip(ib) : ib;
    const [pa, pb] = stage(payoffs, a, b);
    sa += pa;
    sb += pb;
    hA.push({ me: a, them: b });
    hB.push({ me: b, them: a });
    out.push({ ia, ib, a, b, pa, pb });
  }
  return { rounds: out, a: sa, b: sb };
}

export const flip = (m: Move): Move => (m === 'C' ? 'D' : 'C');

export interface FieldEntry {
  entrant: Entrant;
  count: number;
}

export interface TournamentOptions extends MatchOptions {
  /** Matches per pairing, each with its own noise seed (default 1; noisy rooms use more). */
  repeats?: number;
}

export interface Standing {
  id: StrategyId;
  /** Average points per round against the room. */
  score: number;
  /** Rank, 1-based, after sorting by score. Equal scores share a rank (1, 1, 3 …). */
  rank: number;
  /** Pairings it out-scored, lost, and tied (one per distinct opponent entry, including its twin). */
  won: number;
  lost: number;
  tied: number;
}

export interface Tournament {
  ids: StrategyId[];
  counts: number[];
  /** avg[i][j] = average points per round for entry i in its matches against entry j. */
  avg: number[][];
  /** Head-to-head of the first repeat, for showing a duel. */
  duel: (i: number, j: number) => MatchResult;
  standings: Standing[];
  rounds: number;
  noise: number;
}

/**
 * Seed for one replay of a pairing, from the two rules (in either order) — not their positions in the field — so the
 * same pair of rules always plays the same matches, whoever entered them.
 */
const pairSeed = (seed: number, a: string, b: string, r: number) => (Math.imul(seed + 1, 2654435761) ^ strHash(a < b ? `${a}|${b}` : `${b}|${a}`) ^ Math.imul(r + 1, 15485863)) >>> 0;

export function runTournament(field: readonly FieldEntry[], opts: TournamentOptions = {}): Tournament {
  const { rounds = MATCH_ROUNDS, noise = 0, seed = 7, repeats = 1, payoffs = PAYOFFS } = opts;
  const n = field.length;
  const avg: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0));
  const first = new Map<string, MatchResult>();
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let si = 0;
      let sj = 0;
      for (let r = 0; r < repeats; r++) {
        const m = playMatch(field[i].entrant, field[j].entrant, { rounds, noise, payoffs, seed: pairSeed(seed, field[i].entrant.key, field[j].entrant.key, r) });
        if (r === 0) first.set(`${i}:${j}`, m);
        si += m.a;
        sj += m.b;
      }
      // Self-play, or two entries with the same rule: each earns the average of both seats, so identical rules score
      // identically.
      if (i === j || field[i].entrant.key === field[j].entrant.key) avg[i][j] = avg[j][i] = (si + sj) / (2 * repeats * rounds);
      else {
        avg[i][j] = si / (repeats * rounds);
        avg[j][i] = sj / (repeats * rounds);
      }
    }
  }
  const scores = field.map((_, i) => {
    let total = 0;
    let meets = 0;
    for (let j = 0; j < n; j++) {
      // Each copy of j; for j = i that is its other copies plus the twin match every entry plays.
      const c = field[j].count;
      total += avg[i][j] * c;
      meets += c;
    }
    return total / meets;
  });
  const same = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  const order = field.map((_, i) => i).sort((x, y) => (same(scores[x], scores[y]) ? x - y : scores[y] - scores[x]));
  const standings: Standing[] = order.map((i) => {
    let won = 0;
    let lost = 0;
    let tied = 0;
    for (let j = 0; j < n; j++) {
      const d = avg[i][j] - avg[j][i];
      if (i === j || Math.abs(d) < 1e-9) tied++;
      else if (d > 0) won++;
      else lost++;
    }
    const rank = 1 + scores.filter((s) => s > scores[i] && !same(s, scores[i])).length;
    return { id: field[i].entrant.id, score: scores[i], rank, won, lost, tied };
  });
  return {
    ids: field.map((f) => f.entrant.id),
    counts: field.map((f) => f.count),
    avg,
    duel: (i, j) => {
      if (i <= j) return first.get(`${i}:${j}`)!;
      const m = first.get(`${j}:${i}`)!;
      return { a: m.b, b: m.a, rounds: m.rounds.map((r) => ({ ia: r.ib, ib: r.ia, a: r.b, b: r.a, pa: r.pb, pb: r.pa })) };
    },
    standings,
    rounds,
    noise,
  };
}

export function standingOf(t: Tournament, id: StrategyId): Standing {
  return t.standings.find((s) => s.id === id)!;
}

// ---------------------------------------------------------------------------------------------------------------
// Rooms (environments)

export type RoomId = 'open' | 'friendly' | 'hostile' | 'noisy';

export interface Room {
  id: RoomId;
  name: string;
  blurb: string;
  /** The other contestants (the player's entry is added separately). */
  others: readonly { id: Exclude<StrategyId, 'yours'>; count: number }[];
  noise: number;
  repeats: number;
}

/** The opening tournament: one of each kind of contestant. */
const OPEN_FIELD: Room['others'] = [
  { id: 'open-hand', count: 1 },
  { id: 'mirror', count: 1 },
  { id: 'iron-wall', count: 1 },
  { id: 'long-memory', count: 1 },
  { id: 'weathervane', count: 1 },
  { id: 'prober', count: 1 },
  { id: 'gentle-mirror', count: 1 },
  { id: 'pendulum', count: 1 },
  { id: 'wary-mirror', count: 1 },
  { id: 'settler', count: 1 },
  { id: 'calculator', count: 1 },
];

export const NOISE = 0.05;

export const ROOMS: Record<RoomId, Room> = {
  open: { id: 'open', name: 'The Open Trials', blurb: 'Eleven contestants, one of each kind.', others: OPEN_FIELD, noise: 0, repeats: 1 },
  friendly: {
    id: 'friendly',
    name: 'The Garden Hall',
    blurb: 'Mostly cooperators: four Open Hands, two Gentle Mirrors, a Long Memory, a Settler — and one Prober.',
    others: [
      { id: 'open-hand', count: 4 },
      { id: 'gentle-mirror', count: 2 },
      { id: 'long-memory', count: 1 },
      { id: 'settler', count: 1 },
      { id: 'prober', count: 1 },
    ],
    noise: 0,
    repeats: 1,
  },
  hostile: {
    id: 'hostile',
    name: 'The Iron Hall',
    blurb: 'Mostly defectors: five Iron Walls, two Probers, a Wary Mirror and a Pendulum.',
    others: [
      { id: 'iron-wall', count: 5 },
      { id: 'prober', count: 2 },
      { id: 'wary-mirror', count: 1 },
      { id: 'pendulum', count: 1 },
    ],
    noise: 0,
    repeats: 1,
  },
  noisy: {
    id: 'noisy',
    name: 'The Fog Hall',
    blurb: `A room of reciprocators — three Mirrors, two Gentle Mirrors, two Long Memories, a Settler, an Open Hand, a Prober and an Iron Wall — where ${Math.round(NOISE * 100)}% of moves come out as their opposite.`,
    others: [
      { id: 'mirror', count: 3 },
      { id: 'gentle-mirror', count: 2 },
      { id: 'long-memory', count: 2 },
      { id: 'settler', count: 1 },
      { id: 'open-hand', count: 1 },
      { id: 'prober', count: 1 },
      { id: 'iron-wall', count: 1 },
    ],
    noise: NOISE,
    // Slips are rare: a hundred seeded replays per pairing (a fraction of a second) make the ranking the expected one
    // rather than one lucky draw. With a dozen, the top three can change with the seed.
    repeats: 100,
  },
};

/** The same room with the fog lifted, to measure what the errors cost each strategy. */
export function clearAir(room: Room): Room {
  return { ...room, noise: 0, repeats: 1 };
}

/** The room with the player's entry added once (its own twin match is always played). */
export function roomField(room: Room, mine: Entrant): FieldEntry[] {
  return [{ entrant: mine, count: 1 }, ...room.others.map((o) => ({ entrant: entrant(o.id), count: o.count }))];
}

export function runRoom(room: Room, mine: Entrant, seed = 7): Tournament {
  return runTournament(roomField(room, mine), { noise: room.noise, repeats: room.repeats, seed });
}

/** Rank of an entry among *distinct* entries (head counts don't change the leaderboard length). */
export function placeOf(t: Tournament, id: StrategyId): { rank: number; of: number } {
  return { rank: standingOf(t, id).rank, of: t.standings.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Population

/**
 * A simplified ecological model (not biological evolution): each generation, a strategy's share of the population
 * grows in proportion to its average score against the current mix — share′ = share × score / mean score. Nothing
 * mutates and no new strategy ever appears; a strategy that falls to zero stays gone. Scores come from the same
 * pairwise averages as the tournament, so a strategy meets copies of itself as often as its share says.
 */
export function evolve(t: Tournament, generations: number, start?: readonly number[]): number[][] {
  const totalCount = t.counts.reduce((a, b) => a + b, 0);
  let x = start ? [...start] : t.counts.map((c) => c / totalCount);
  const out = [x];
  for (let g = 0; g < generations; g++) {
    const fit = x.map((_, i) => x.reduce((s, xj, j) => s + xj * t.avg[i][j], 0));
    const mean = x.reduce((s, xi, i) => s + xi * fit[i], 0);
    if (mean <= 0) break;
    x = x.map((xi, i) => {
      const v = (xi * fit[i]) / mean;
      return v < 1e-4 ? 0 : v;
    });
    const sum = x.reduce((a, b) => a + b, 0);
    x = x.map((v) => v / sum);
    out.push(x);
  }
  return out;
}
