import { type ArenaEngine, type Debrief, LENGTH_ROUNDS, type Setup, clamp, draw, resultFrom } from './core.ts';

/**
 * The Traveler's Dilemma — two travellers claim for identical lost luggage; the airline pays both the lower claim.
 *
 * Each round both claim a whole number from CLAIM_MIN to CLAIM_MAX, at once and in secret.
 * - Equal claims: each is paid that claim.
 * - Different claims: both are paid the lower claim; the lower claimant gets +BONUS for honesty, the higher −BONUS.
 * Example (bonus 2): you claim 20, they claim 17 → you get 15, they get 19.
 *
 * The logic of undercutting: whatever they claim (above the minimum), claiming one less pays more — so iterated
 * reasoning unravels all the way to CLAIM_MIN, the only equilibrium. Yet two travellers who both claim CLAIM_MAX earn
 * ten times as much. The bonus is fixed for the whole match.
 *
 * Win: the higher total *and* at least PAR_SHARE of the maximum (CLAIM_MAX per round). Out-claiming a rival in a race to
 * the bottom is a hollow result — both of you threw away almost everything.
 */

export const TRAVELER_PERSONAS = ['purist', 'cooperative', 'undercutter', 'adaptive'] as const;
export type TravelerPersona = (typeof TRAVELER_PERSONAS)[number];
export const TRAVELER_NAME: Record<TravelerPersona, string> = { purist: 'The Game-Theory Purist', cooperative: 'The Cooperative Traveler', undercutter: 'The Aggressive Undercutter', adaptive: 'The Adaptive Reasoner' };

export type TravelerVariant = 'standard' | 'big-bonus';
export const TRAVELER_VARIANTS: readonly TravelerVariant[] = ['standard', 'big-bonus'];
export const travelerRounds = LENGTH_ROUNDS(5, 8, 10);
export const CLAIM_MIN = 2;
export const CLAIM_MAX = 20;
export const bonusOf = (v: TravelerVariant) => (v === 'big-bonus' ? 5 : 2);
export const PAR_SHARE = 0.6;

/** [first, second] payout for claims a and b. */
export function travelPayoff(v: TravelerVariant, a: number, b: number): [number, number] {
  if (a === b) return [a, b];
  const r = bonusOf(v);
  const low = Math.min(a, b);
  return a < b ? [low + r, low - r] : [low - r, low + r];
}

/** The claim that pays most against a known claim `other`. */
export function bestReply(v: TravelerVariant, other: number): number {
  let best = CLAIM_MIN;
  for (let c = CLAIM_MIN; c <= CLAIM_MAX; c++) if (travelPayoff(v, c, other)[0] > travelPayoff(v, best, other)[0]) best = c;
  return best;
}

export interface TravelRound {
  claims: [number, number]; // [player, bot]
  pay: [number, number];
}

export interface TravelerState {
  setup: Setup<TravelerVariant, TravelerPersona>;
  total: number;
  rounds: TravelRound[];
}

/**
 * The bot's claim, from the claims revealed so far. u is this round's seeded random number.
 *
 * Purist — plays the equilibrium: CLAIM_MIN. Easy is a wavering purist (30 % of rounds it claims the maximum "to see");
 *   Normal claims the minimum, or one above it 20 % of rounds; Hard claims the minimum every round, whatever you do.
 * Cooperative — aims for the shared maximum. Easy: always CLAIM_MAX. Normal: CLAIM_MAX, but after being undercut twice
 *   in a row it claims your last claim (no lower), returning to the max when you do. Hard: starts at the max and then
 *   claims your last claim after you undercut it, and climbs 2 back toward the max when you don’t — reciprocal, never
 *   undercutting.
 * Undercutter — claims one below what it expects from you. Easy: 19 every round. Normal: your last claim − 1 (19 to
 *   start). Hard: one below your predicted claim (your last, plus your last change), and two below in the final round.
 * Adaptive — best reply to the claims you've made: it scores every claim against your history and picks the best.
 *   Easy weights all your claims equally; Normal weights recent ones more; Hard also spots a follower: if you
 *   copy its previous claim (two rounds running), it leads with the maximum, since you will follow.
 */
export function travelerClaim(s: TravelerState, u: number): number {
  const { persona, level, variant } = s.setup;
  const h = s.rounds;
  const last = h[h.length - 1];
  const yours = h.map((r) => r.claims[0]);
  const finalRound = h.length === s.total - 1;
  if (persona === 'purist') {
    if (level === 'easy') return u < 0.3 ? CLAIM_MAX : CLAIM_MIN;
    if (level === 'normal') return u < 0.2 ? CLAIM_MIN + 1 : CLAIM_MIN;
    return CLAIM_MIN;
  }
  if (persona === 'cooperative') {
    if (level === 'easy' || !last) return CLAIM_MAX;
    if (level === 'normal') {
      const undercut = h.slice(-2).filter((r) => r.claims[0] < r.claims[1]).length;
      return undercut >= 2 ? last.claims[0] : last.claims[0] >= last.claims[1] ? CLAIM_MAX : last.claims[1];
    }
    return last.claims[0] < last.claims[1] ? last.claims[0] : Math.min(CLAIM_MAX, last.claims[1] + 2);
  }
  if (persona === 'undercutter') {
    if (level === 'easy') return CLAIM_MAX - 1;
    if (!last) return CLAIM_MAX - 1;
    if (level === 'normal') return clamp(last.claims[0] - 1, CLAIM_MIN, CLAIM_MAX);
    const prev = h[h.length - 2];
    const predicted = last.claims[0] + (prev ? last.claims[0] - prev.claims[0] : 0);
    return clamp(predicted - (finalRound ? 2 : 1), CLAIM_MIN, CLAIM_MAX);
  }
  // adaptive
  if (!yours.length) return level === 'hard' ? CLAIM_MAX - 2 : 15;
  const mirror = level === 'hard' && h.length >= 2 && h.slice(1).every((r, i) => r.claims[0] === h[i].claims[1]);
  // You follow its lead, so leading high pays from next round on.
  if (mirror) return CLAIM_MAX;
  const decay = level === 'easy' ? 1 : 0.6;
  let best = CLAIM_MIN;
  let bestV = -Infinity;
  for (let c = CLAIM_MIN; c <= CLAIM_MAX; c++) {
    let v = 0;
    let w = 1;
    for (let i = yours.length - 1; i >= 0; i--) {
      v += w * travelPayoff(variant, c, yours[i])[0];
      w *= decay;
    }
    if (v > bestV) [best, bestV] = [c, v];
  }
  return best;
}

function validate(s: TravelerState, a: unknown): string | null {
  if (s.rounds.length >= s.total) return 'The claims are all settled.';
  if (typeof a !== 'number' || !Number.isInteger(a)) return 'Claim a whole number.';
  if (a < CLAIM_MIN || a > CLAIM_MAX) return `Claim between ${CLAIM_MIN} and ${CLAIM_MAX}.`;
  return null;
}

function apply(s: TravelerState, claim: number): TravelerState {
  const why = validate(s, claim);
  if (why) throw new Error(`travelers: ${why}`);
  const bot = travelerClaim(s, draw(s.setup.seed, s.rounds.length, 0));
  return { ...s, rounds: [...s.rounds, { claims: [claim, bot], pay: travelPayoff(s.setup.variant, claim, bot) }] };
}

export const travelTotals = (s: TravelerState) => s.rounds.reduce<[number, number]>((t, r) => [t[0] + r.pay[0], t[1] + r.pay[1]], [0, 0]);

function travelersDebrief(s: TravelerState): Debrief {
  const h = s.rounds.map((r, i) => ({ r, i }));
  const moments: { at: number; text: string }[] = [];
  const under = h.find(({ r }) => r.claims[0] < r.claims[1]);
  if (under) moments.push({ at: under.i, text: `Round ${under.i + 1}: you claimed ${under.r.claims[0]} under their ${under.r.claims[1]} — +${bonusOf(s.setup.variant)} for being lower, ${under.r.pay[0]} in all.` });
  const hit = h.find(({ r }) => r.claims[0] > r.claims[1]);
  if (hit) moments.push({ at: hit.i, text: `Round ${hit.i + 1}: you claimed ${hit.r.claims[0]}, they claimed ${hit.r.claims[1]} — you were paid ${hit.r.pay[0]}.` });
  const peak = h.find(({ r }) => r.claims[0] === r.claims[1] && r.claims[0] >= 15);
  if (peak) moments.push({ at: peak.i, text: `Round ${peak.i + 1}: you both claimed ${peak.r.claims[0]} — ${peak.r.claims[0]} each, far above what undercutting yields.` });
  if (!moments.length) moments.push({ at: 0, text: `You both claimed the same every round, averaging ${(travelTotals(s)[0] / h.length).toFixed(1)}.` });
  const [p] = travelTotals(s);
  const max = CLAIM_MAX * s.total;
  const insight =
    p < max * 0.4
      ? `Each undercut is individually smart — one less pays more against any claim — but followed to its end it leaves both of you near ${CLAIM_MIN}. You collected ${p} of a possible ${max}: rational-looking steps, disappointing outcome.`
      : `Claiming high is a bet on the other traveller not undercutting. Against a reciprocal partner it pays far more than the equilibrium (${CLAIM_MIN} a round); against an undercutter it costs ${bonusOf(s.setup.variant) * 2} per round compared with matching them.`;
  const theirs = s.rounds.map((r) => r.claims[1]);
  const style: Record<TravelerPersona, string> = {
    purist: 'reasoned its way to the minimum and stayed there',
    cooperative: 'reached for the shared maximum and answered undercuts by matching, never by undercutting',
    undercutter: 'kept claiming just below what you had claimed',
    adaptive: 'chose the claim that would have paid best against your recent claims',
  };
  const pair = h.slice(1).find(({ r, i }) => r.claims[1] === s.rounds[i - 1].claims[0] - 1);
  const ex = pair ? ` After your ${s.rounds[pair.i - 1].claims[0]} in round ${pair.i}, it claimed ${pair.r.claims[1]}.` : '';
  return {
    headline: 'Claims settled',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${TRAVELER_NAME[s.setup.persona]} ${style[s.setup.persona]}: it claimed ${theirs.join(', ')}.${ex}`,
  };
}

export const travelers: ArenaEngine<TravelerState, number, TravelerVariant> = {
  id: 'travelers',
  opponents: TRAVELER_PERSONAS,
  variants: TRAVELER_VARIANTS,
  rounds: travelerRounds,
  create: (setup) => ({ setup: setup as Setup<TravelerVariant, TravelerPersona>, total: travelerRounds(setup.length), rounds: [] }),
  validate,
  apply,
  isOver: (s) => s.rounds.length >= s.total,
  played: (s) => s.rounds.length,
  result(s) {
    const [p, b] = travelTotals(s);
    return resultFrom(
      [
        { id: 'you', name: 'You', score: p, isPlayer: true },
        { id: s.setup.persona, name: TRAVELER_NAME[s.setup.persona], score: b, isPlayer: false },
      ],
      'credits',
      { par: Math.round(PAR_SHARE * CLAIM_MAX * s.total), parLabel: `${Math.round(PAR_SHARE * 100)}% of the maximum` },
    );
  },
  debrief: travelersDebrief,
  moves: (s) => (s.rounds.length >= s.total ? [] : [CLAIM_MIN, 8, 14, 18, 19, CLAIM_MAX]),
};
