import { EPSILON } from './rng.ts';

/**
 * Market competition models (Lesson 6, Lesson 8). All are deliberately small and fully specified:
 * linear inverse demand P = a − Q with constant marginal cost, discrete Bertrand pricing, and a
 * Hotelling-style line of voters at whole-number positions.
 */

// ── Cournot / Stackelberg ────────────────────────────────────────────────────

export interface LinearMarket {
  /** Inverse demand intercept: price = a − total quantity (never below 0). */
  a: number;
  /** Constant marginal cost. */
  cost: number;
}

export function marketPrice(m: LinearMarket, total: number): number {
  return Math.max(0, m.a - total);
}

export function cournotProfit(m: LinearMarket, own: number, other: number): number {
  return own * (marketPrice(m, own + other) - m.cost);
}

/** Best responses among a discrete set of quantities. Ties return every tied quantity. */
export function cournotBestResponses(m: LinearMarket, other: number, options: readonly number[]): number[] {
  const values = options.map((q) => cournotProfit(m, q, other));
  const best = Math.max(...values);
  return options.filter((_, i) => values[i] >= best - EPSILON);
}

/** Continuous best response (a − c − q)/2, clamped at 0. */
export function cournotBestResponse(m: LinearMarket, other: number): number {
  return Math.max(0, (m.a - m.cost - other) / 2);
}

/** Symmetric Cournot–Nash quantity per firm for two firms: (a − c)/3. */
export function cournotEquilibrium(m: LinearMarket): number {
  return (m.a - m.cost) / 3;
}

/** Joint-profit-maximising quantity per firm if two firms split the monopoly output: (a − c)/4. */
export function collusiveQuantity(m: LinearMarket): number {
  return (m.a - m.cost) / 4;
}

// ── Bertrand (identical products, discrete prices) ───────────────────────────

export interface BertrandMarket {
  customers: number;
  cost: number;
  /** Highest price customers will pay. */
  maxPrice: number;
}

/** Profit when all customers buy from the cheaper firm, split evenly on a tie, nobody buys above maxPrice. */
export function bertrandProfit(m: BertrandMarket, own: number, other: number): number {
  if (own > m.maxPrice) return 0;
  const share = own < other ? 1 : own === other ? 0.5 : 0;
  return share * m.customers * (own - m.cost);
}

/** Pure equilibria on a price grid: pairs where neither firm gains by moving to another grid price. */
export function bertrandEquilibria(m: BertrandMarket, grid: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const p1 of grid) {
    for (const p2 of grid) {
      const ok1 = grid.every((d) => bertrandProfit(m, d, p2) <= bertrandProfit(m, p1, p2) + EPSILON);
      const ok2 = grid.every((d) => bertrandProfit(m, d, p1) <= bertrandProfit(m, p2, p1) + EPSILON);
      if (ok1 && ok2) out.push([p1, p2]);
    }
  }
  return out;
}

/**
 * Bertrand with loyal customers: each firm has `loyal` customers who buy from it at any price up to maxPrice;
 * `shoppers` buy from the cheaper firm (split on a tie).
 */
export function loyalBertrandProfit(m: BertrandMarket & { loyal: number; shoppers: number }, own: number, other: number): number {
  if (own > m.maxPrice) return 0;
  const shopperShare = own < other ? 1 : own === other ? 0.5 : 0;
  return (m.loyal + shopperShare * m.shoppers) * (own - m.cost);
}

// ── Positioning on a line ────────────────────────────────────────────────────

/**
 * Two candidates on a line of positions 0..n−1; `voters[i]` voters sit at position i. Each voter votes for the
 * nearer candidate; equidistant voters (or both candidates at one spot) split evenly. Returns the first candidate's votes.
 */
export function lineVotes(voters: readonly number[], own: number, other: number): number {
  let votes = 0;
  voters.forEach((count, pos) => {
    const dOwn = Math.abs(pos - own);
    const dOther = Math.abs(pos - other);
    votes += dOwn < dOther ? count : dOwn === dOther ? count / 2 : 0;
  });
  return votes;
}

export function lineBestResponses(voters: readonly number[], other: number): number[] {
  const values = voters.map((_, pos) => lineVotes(voters, pos, other));
  const best = Math.max(...values);
  return voters.map((_, pos) => pos).filter((pos) => values[pos] >= best - EPSILON);
}

/** Position of the median voter (the lowest position where the cumulative count reaches half). */
export function medianPosition(voters: readonly number[]): number {
  const total = voters.reduce((s, v) => s + v, 0);
  let acc = 0;
  for (let i = 0; i < voters.length; i++) {
    acc += voters[i];
    if (acc >= total / 2) return i;
  }
  return voters.length - 1;
}
