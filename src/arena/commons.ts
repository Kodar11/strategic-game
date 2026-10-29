import { type ArenaEngine, CODENAMES, type Debrief, LENGTH_ROUNDS, type Setup, clamp, drawInt, resultFrom } from './core.ts';

/**
 * The Commons — four boats fish one lake. Take more now, or leave fish to breed.
 *
 * Seats: you (0) and three bot boats (Ash, Birch, Cedar). Ash (seat 1) is the personality you face — "the boat beside
 * you"; Birch and Cedar are two of the other three personalities, picked by the seed.
 *
 * Each round:
 * 1. Everyone asks for 0–MAX_TAKE fish, at once and in secret.
 * 2. If the requests add up to more than the lake holds, each boat gets ⌊request × lake / total requested⌋ (rationing).
 * 3. The catch leaves the lake; then the lake regrows by ⌊GROWTH × L × (1 − L / CAPACITY)⌋ (logistic growth: fastest
 *    at half capacity, zero when full or empty).
 * 4. If fewer than COLLAPSE_BELOW fish are left after the catch, the lake has collapsed: it never regrows and the
 *    season ends.
 * At the end of the season, if the lake is alive, the fish left are a shared dividend: each boat receives ⌊L / 4⌋.
 * Score = fish caught + dividend.
 *
 * Sustainability: regrowth peaks at 15 fish per round at L = 50, so about 3–4 fish per boat per round can be taken
 * forever. Everyone taking 10 empties a full lake in three rounds.
 *
 * Outcome — the fishery is the point, not beating the other boats:
 * - the lake collapsed: a loss for every boat, however many fish you landed;
 * - the lake survived, and you reached the sustainable benchmark (3 per round) without finishing last: a win;
 * - the lake survived but you fell short of the benchmark or finished last (others rode on your restraint): a draw.
 */

export const COMMONS_PERSONAS = ['conservator', 'free-rider', 'conditional', 'maximizer'] as const;
export type CommonsPersona = (typeof COMMONS_PERSONAS)[number];
export const COMMONS_NAME: Record<CommonsPersona, string> = { conservator: 'The Conservator', 'free-rider': 'The Free Rider', conditional: 'The Conditional Contributor', maximizer: 'The Resource Maximizer' };

export type CommonsVariant = 'standard' | 'fragile';
export const COMMONS_VARIANTS: readonly CommonsVariant[] = ['standard', 'fragile'];
export const commonsRounds = LENGTH_ROUNDS(6, 8, 10);
export const CAPACITY = 100;
export const MAX_TAKE = 10;
export const BOATS = 4;
/** Fish per boat per round that the benchmark expects. */
export const SUSTAINABLE_SHARE = 3;
/** Below this many fish after the catch, the stock can’t recover: the lake has collapsed. */
export const COLLAPSE_BELOW = 10;
export const growthRate = (v: CommonsVariant) => (v === 'fragile' ? 0.45 : 0.6);
export const startLake = (v: CommonsVariant) => (v === 'fragile' ? 70 : 80);

export function regrow(v: CommonsVariant, lake: number): number {
  if (lake <= 0) return 0;
  return Math.min(CAPACITY, lake + Math.floor(growthRate(v) * lake * (1 - lake / CAPACITY)));
}

/** Rationing when requests exceed the lake. */
export function ration(lake: number, requests: readonly number[]): number[] {
  const total = requests.reduce((a, b) => a + b, 0);
  if (total <= lake) return [...requests];
  return requests.map((r) => Math.floor((r * lake) / total));
}

export interface CommonsRound {
  lakeBefore: number;
  requests: number[];
  catches: number[];
  lakeAfter: number;
}

export interface CommonsState {
  setup: Setup<CommonsVariant, CommonsPersona>;
  total: number;
  seats: (CommonsPersona | null)[];
  lake: number;
  caught: number[];
  rounds: CommonsRound[];
}

export function commonsSeats(setup: Setup<CommonsVariant, CommonsPersona>): (CommonsPersona | null)[] {
  const others = COMMONS_PERSONAS.filter((p) => p !== setup.persona);
  const drop = drawInt(setup.seed, 999, 0, 0, others.length - 1);
  return [null, setup.persona, ...others.filter((_, i) => i !== drop)];
}

export const boatName = (seat: number) => (seat === 0 ? 'You' : CODENAMES[seat - 1]);
export const dividend = (lake: number) => Math.floor(lake / BOATS);

/** One seeded wobble of −1, 0 or +1 for a bot's request (Easy and Normal only), so habits look human, not robotic. */
const wobble = (s: CommonsState, seat: number) => drawInt(s.setup.seed, s.rounds.length, 10 + seat, -1, 1);

/** Simulates the rest of the season if `mine` is taken now and others keep repeating their last requests. */
function projectedTotal(s: CommonsState, seat: number, mine: number, othersLast: number[]): number {
  let lake = s.lake;
  let total = 0;
  const left = s.total - s.rounds.length;
  for (let k = 0; k < left; k++) {
    const req = othersLast.map((x, i) => (i === seat ? (k === 0 ? mine : Math.min(mine, 4)) : x));
    const c = ration(lake, req);
    total += c[seat];
    lake -= c.reduce((a, b) => a + b, 0);
    if (lake < COLLAPSE_BELOW) return total;
    lake = regrow(s.setup.variant, lake);
  }
  return total + dividend(lake);
}

/**
 * A bot boat's request, from the lake, the season so far and everyone's past catches. Bots never see this round's
 * requests.
 *
 * Conservator — Easy: 3 every round (±1). Normal: a quarter of what the lake can regrow from here, at least 1; 1 when
 *   the lake is below 40. Hard: rebuilds toward the most productive level — 1 below 45, 4–5 when the lake is near full
 *   (fish beyond 70 add little growth) — and never grabs at the end.
 * Free Rider — Easy: 7 (±1). Normal: 3, plus 1.5 for every other boat that took 4 or fewer last round (others’ restraint
 *   is its opportunity). Hard: 3 plus 2 per restrained boat, 10 in the last two rounds, and it eases off to 3 only when the lake is below 30
 *   so the free ride lasts.
 * Conditional Contributor — starts at 3. Easy: then mirrors your last request. Normal: the average of the other boats'
 *   last requests, rounded. Hard: 3 while the average stays at 5 or less and the lake is healthy (above 50); once
 *   anyone took 8 or more, the average plus 1 — it punishes grabbing, then returns to 3 when the others do.
 * Resource Maximizer — Easy: 5. Normal: 10 in the last two rounds, otherwise 4 above 60 fish and 2 below. Hard: tries
 *   every request 0–10 and keeps the one that maximises its catch over the rest of the season (plus dividend),
 *   assuming the other boats repeat their last requests.
 */
export function commonsBotTake(s: CommonsState, seat: number): number {
  const persona = s.seats[seat]!;
  const { level } = s.setup;
  const last = s.rounds[s.rounds.length - 1];
  const left = s.total - s.rounds.length;
  const lake = s.lake;
  const others = last ? last.requests.filter((_, i) => i !== seat) : [];
  const avgOthers = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 3;
  let take: number;

  if (persona === 'conservator') {
    if (level === 'easy') take = 3 + wobble(s, seat);
    else if (level === 'normal') take = lake < 40 ? 1 : Math.max(1, Math.floor((regrow(s.setup.variant, lake) - lake + 4) / BOATS));
    else take = lake < 45 ? 1 : lake > 85 ? 5 : lake > 70 ? 4 : 3;
  } else if (persona === 'free-rider') {
    if (level === 'easy') take = 7 + wobble(s, seat);
    else {
      const restrained = others.filter((x) => x <= 4).length;
      take = last ? 3 + (level === 'hard' ? 2 : 1.5) * restrained : 5;
      if (level === 'hard') {
        if (left <= 2) take = MAX_TAKE;
        else if (lake < 30) take = 3;
      } else take += wobble(s, seat);
    }
  } else if (persona === 'conditional') {
    if (!last) take = 3;
    else if (level === 'easy') take = last.requests[0];
    else if (level === 'normal') take = Math.round(avgOthers) + wobble(s, seat);
    else {
      const grab = others.some((x) => x >= 8);
      take = grab ? Math.round(avgOthers) + 1 : avgOthers <= 5 && lake > 50 ? 3 : Math.round(avgOthers);
    }
  } else {
    if (level === 'easy') take = 5;
    else if (level === 'normal') take = left <= 2 ? MAX_TAKE : lake > 60 ? 4 : 2;
    else {
      const othersLast = last ? last.requests : [3, 3, 3, 3];
      let best = 0;
      let bestValue = -1;
      for (let t = 0; t <= MAX_TAKE; t++) {
        const v = projectedTotal(s, seat, t, othersLast);
        if (v > bestValue) [best, bestValue] = [t, v];
      }
      take = best;
    }
  }
  return clamp(Math.round(take), 0, MAX_TAKE);
}

function validate(s: CommonsState, a: unknown): string | null {
  if (s.rounds.length >= s.total || s.lake <= 0) return 'The season is over.';
  if (typeof a !== 'number' || !Number.isInteger(a)) return 'Ask for a whole number of fish.';
  if (a < 0 || a > MAX_TAKE) return `Ask for 0 to ${MAX_TAKE} fish.`;
  return null;
}

function apply(s: CommonsState, take: number): CommonsState {
  const why = validate(s, take);
  if (why) throw new Error(`commons: ${why}`);
  const requests = s.seats.map((_, seat) => (seat === 0 ? take : commonsBotTake(s, seat)));
  const catches = ration(s.lake, requests);
  const remaining = s.lake - catches.reduce((a, b) => a + b, 0);
  const lakeAfter = remaining < COLLAPSE_BELOW ? 0 : regrow(s.setup.variant, remaining);
  return { ...s, lake: lakeAfter, caught: s.caught.map((c, i) => c + catches[i]), rounds: [...s.rounds, { lakeBefore: s.lake, requests, catches, lakeAfter }] };
}

const isOver = (s: CommonsState) => s.rounds.length >= s.total || s.lake <= 0;
export const commonsScores = (s: CommonsState) => s.caught.map((c) => c + (isOver(s) && s.lake > 0 ? dividend(s.lake) : 0));

function commonsDebrief(s: CommonsState): Debrief {
  const h = s.rounds;
  const collapsed = s.lake <= 0;
  const moments: { at: number; text: string }[] = [];
  const grab = h.map((r, i) => ({ r, i })).reduce((a, b) => (b.r.requests[0] > a.r.requests[0] ? b : a));
  if (grab.r.requests[0] >= 6) moments.push({ at: grab.i, text: `Round ${grab.i + 1}: you asked for ${grab.r.requests[0]} with the lake at ${grab.r.lakeBefore}. The fleet took ${grab.r.catches.reduce((a, b) => a + b, 0)} together.` });
  const drop = h.map((r, i) => ({ r, i, d: r.lakeAfter - r.lakeBefore })).reduce((a, b) => (b.d < a.d ? b : a));
  if (drop.d < 0) moments.push({ at: drop.i, text: `Round ${drop.i + 1}: the lake fell from ${drop.r.lakeBefore} to ${drop.r.lakeAfter}${drop.r.lakeAfter === 0 ? ' — it collapsed' : ''}. Requests: ${drop.r.requests.map((x, k) => `${boatName(k)} ${x}`).join(', ')}.` });
  const restraint = h.map((r, i) => ({ r, i })).find(({ r }) => r.requests[0] <= SUSTAINABLE_SHARE && r.requests.slice(1).some((x) => x >= 7));
  if (restraint) moments.push({ at: restraint.i, text: `Round ${restraint.i + 1}: you held back to ${restraint.r.requests[0]} while ${boatName(restraint.r.requests.findIndex((x, k) => k > 0 && x >= 7))} took ${Math.max(...restraint.r.requests.slice(1))} — your restraint was someone else’s catch.` });
  if (!moments.length) moments.push({ at: 0, text: `The fleet averaged ${(h.reduce((t, r) => t + r.catches.reduce((a, b) => a + b, 0), 0) / h.length).toFixed(1)} fish a round; the lake ended at ${s.lake}.` });
  const insight = collapsed
    ? 'Each extra fish you take is all yours, but the damage to the lake is shared four ways — so everyone is tempted to take too much, and the fishery collapses. Restraint only pays when others restrain too.'
    : s.lake >= 50
      ? 'The lake survived because the fleet stayed near what it can regrow (about 15 fish a round at half capacity). Notice who held back and who rode on that restraint — the free rider’s best case is everyone else being responsible.'
      : 'The lake survived but thinned: past the half-capacity mark every fish taken also cuts tomorrow’s growth. Sustainable yield is a group decision no single boat can make.';
  const rival = h.map((r) => r.requests[1]);
  const style: Record<CommonsPersona, string> = {
    conservator: 'kept to a small, steady catch and took even less when the lake was low',
    'free-rider': 'took more whenever the others held back',
    conditional: 'matched what the other boats had been taking — restraint for restraint, grabbing for grabbing',
    maximizer: 'balanced today against the rest of the season, taking more when the end was near',
  };
  const lowRound = h.findIndex((r) => r.lakeBefore < 45);
  const example = lowRound >= 0 ? ` With the lake at ${h[lowRound].lakeBefore} in round ${lowRound + 1}, it asked for ${h[lowRound].requests[1]}.` : '';
  return {
    headline: collapsed ? 'The lake collapsed' : 'Season over',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${COMMONS_NAME[s.setup.persona]} (Ash) ${style[s.setup.persona]}: it asked for ${rival.join(', ')}.${example}`,
  };
}

export const commons: ArenaEngine<CommonsState, number, CommonsVariant> = {
  id: 'commons',
  opponents: COMMONS_PERSONAS,
  variants: COMMONS_VARIANTS,
  rounds: commonsRounds,
  endsEarly: true,
  create(setup) {
    const s = setup as Setup<CommonsVariant, CommonsPersona>;
    const seats = commonsSeats(s);
    return { setup: s, total: commonsRounds(s.length), seats, lake: startLake(s.variant), caught: seats.map(() => 0), rounds: [] };
  },
  validate,
  apply,
  isOver,
  played: (s) => s.rounds.length,
  result(s) {
    const scores = commonsScores(s);
    const r = resultFrom(
      s.seats.map((p, i) => ({ id: p ?? 'you', name: boatName(i), score: scores[i], isPlayer: i === 0 })),
      'fish',
    );
    const par = SUSTAINABLE_SHARE * s.total;
    if (s.lake <= 0) return { ...r, par, outcome: 'loss', headline: 'The lake collapsed', note: `The lake collapsed in round ${s.rounds.length}: no regrowth, no dividend — every boat loses the fishery.` };
    const last = scores[0] < Math.min(...scores.slice(1));
    if (scores[0] >= par && !last) return { ...r, par, outcome: 'win', headline: 'A living lake', note: null };
    return { ...r, par, outcome: 'draw', headline: 'A living lake', note: last ? 'The lake survived, but you landed the fewest fish — the others rode on your restraint.' : `The lake survived, but you landed fewer than the sustainable benchmark (${par}).` };
  },
  debrief: commonsDebrief,
  moves: (s) => (isOver(s) ? [] : [0, 2, 3, 5, 8, 10]),
};

