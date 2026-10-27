import { EPSILON } from './rng.ts';

/**
 * Bargaining (Lesson 11) and costly waiting (Lesson 12). Payoffs are money unless a scenario states otherwise.
 */

/**
 * Finite alternating offers. `pies[t]` is the size of the pie if agreement happens in round t (0-based); the
 * proposer alternates, starting with player 0. If every round is rejected, both get 0. Responders accept when
 * indifferent (the tie rule every scenario states). Returns the subgame-perfect amount the round-0 proposer keeps
 * and the minimum the responder accepts in each round.
 */
export function alternatingOffers(pies: readonly number[]): { keep: number; minAccept: number[] } {
  // Work backwards: the responder in round t accepts any offer at least what they'd get by proposing in t + 1.
  const minAccept = new Array<number>(pies.length).fill(0);
  let nextProposerKeeps = 0;
  for (let t = pies.length - 1; t >= 0; t--) {
    minAccept[t] = t === pies.length - 1 ? 0 : nextProposerKeeps;
    nextProposerKeeps = pies[t] - minAccept[t];
  }
  return { keep: nextProposerKeeps, minAccept };
}

/** First proposer's SPE share of a pie that shrinks by factor δ each round, over `rounds` rounds (pie starts at 1). */
export function shrinkingPieShare(delta: number, rounds: number): number {
  const pies = Array.from({ length: rounds }, (_, t) => delta ** t);
  return alternatingOffers(pies).keep;
}

/** Ultimatum: a responder with a minimum acceptable offer. A purely money-motivated responder has minimum 0. */
export function ultimatum(pie: number, offer: number, minAccept: number): { accepted: boolean; proposer: number; responder: number } {
  const accepted = offer >= minAccept - EPSILON;
  return accepted ? { accepted, proposer: pie - offer, responder: offer } : { accepted, proposer: 0, responder: 0 };
}

// ── Optimal stopping against a quitting opponent ─────────────────────────────

export interface StoppingProblem {
  /** Your cost for each round you stay in. */
  cost: number;
  /** What you win if the other side gives up. */
  prize: number;
  /** Probability the other side gives up during round t (1-based), given it hasn't yet. */
  quitProb: (round: number) => number;
  /** Rounds before the contest ends without a winner. */
  maxRounds: number;
  /** What you get if nobody has quit after `maxRounds`. */
  endValue: number;
}

/**
 * Value of being still in the contest at the start of each round (index 0 = round 1), assuming you then play
 * optimally (quit = 0 from now on). `stay[t]` says whether staying in round t + 1 beats quitting.
 * Past costs are sunk: they appear nowhere in this calculation.
 */
export function stoppingValues(p: StoppingProblem): { value: number[]; stay: boolean[] } {
  const value = new Array<number>(p.maxRounds).fill(0);
  const stay = new Array<boolean>(p.maxRounds).fill(false);
  let next = p.endValue;
  for (let t = p.maxRounds; t >= 1; t--) {
    const q = p.quitProb(t);
    const cont = t === p.maxRounds ? p.endValue : Math.max(0, next);
    const v = -p.cost + q * p.prize + (1 - q) * cont;
    value[t - 1] = v;
    stay[t - 1] = v > EPSILON;
    next = v;
  }
  return { value, stay };
}

// ── All-pay auction ──────────────────────────────────────────────────────────

/**
 * Expected payoff of bidding `bid` for a prize against one rival whose whole-number bid is equally likely to be any
 * value in [lo, hi]. Highest bid wins; ties split the prize; everyone pays their own bid.
 */
export function allPayExpected(prize: number, bid: number, lo: number, hi: number): number {
  const n = hi - lo + 1;
  let ev = 0;
  for (let r = lo; r <= hi; r++) {
    const share = bid > r ? 1 : bid === r ? 0.5 : 0;
    ev += (share * prize) / n;
  }
  return ev - bid;
}
