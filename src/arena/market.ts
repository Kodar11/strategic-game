import { type ArenaEngine, type Debrief, LENGTH_ROUNDS, PERSONAS, PERSONA_NAME, type Persona, type Setup, draw, drawInt, resultFrom } from './core.ts';

/**
 * The Market Rivals — three firms sell the same kind of product and each sets a price every round.
 *
 * Demand model (logit choice with an outside option), documented so every result can be explained:
 *   Each of M customers buys from firm i with probability  e^(−β·pᵢ) / (e^(−β·p₀) + Σⱼ e^(−β·pⱼ)),
 *   or buys nothing with the remaining probability. p₀ = 14 is the price at which "not buying" is as attractive as a
 *   firm. Units are M × that share, rounded to whole customers. Profit = units × (price − unit cost).
 * - A lower price wins share smoothly — never all-or-nothing — and higher prices push some customers out entirely.
 * - Equal prices get equal shares (the tie rule falls out of the model).
 * - β is price sensitivity: higher β means customers switch more for the same price gap.
 *
 * Each round the conditions are public before pricing: customers M (80–140, from the seed), unit cost (6, or 4–9 in
 * the Volatile line) and sensitivity (β = 0.35, or 0.6 in the Price War line). Prices are whole numbers 4–20, set in
 * secret and revealed together. Bots see only past prices and outcomes, never the player's current price.
 *
 * With β = 0.35 and cost 6, the one-round best reply to rivals at ~10 is ~10 (a price-war floor), while all three
 * pricing ~15 would earn each firm far more — and undercutting a rival at 15 pays more still. That is the tension.
 */

export type MarketVariant = 'standard' | 'price-war' | 'volatile';
export const MARKET_VARIANTS: readonly MarketVariant[] = ['standard', 'price-war', 'volatile'];
export const PRICE_MIN = 4;
export const PRICE_MAX = 20;
export const REFERENCE_PRICE = 14;
export const marketRounds = LENGTH_ROUNDS(5, 8, 12);
export const FIRMS = 3;

export interface Conditions {
  customers: number;
  cost: number;
  beta: number;
}

export interface MarketRound {
  cond: Conditions;
  prices: number[];
  units: number[];
  profits: number[];
}

export interface MarketState {
  setup: Setup<MarketVariant>;
  total: number;
  /** Seat 0 is the player (null), seat 1 the chosen rival. */
  seats: (Persona | null)[];
  profit: number[];
  rounds: MarketRound[];
}

export function marketSeats(setup: Setup): (Persona | null)[] {
  const others = PERSONAS.filter((p) => p !== setup.persona);
  return [null, setup.persona, others[drawInt(setup.seed, 999, 0, 0, others.length - 1)]];
}

export function conditions(setup: Setup<MarketVariant>, n: number): Conditions {
  return {
    customers: drawInt(setup.seed, n, 0, 80, 140),
    cost: setup.variant === 'volatile' ? drawInt(setup.seed, n, 1, 4, 9) : 6,
    beta: setup.variant === 'price-war' ? 0.6 : 0.35,
  };
}

/** Shares, units and profits for a set of prices under the demand model. */
export function marketOutcome(cond: Conditions, prices: readonly number[]): { shares: number[]; units: number[]; profits: number[] } {
  const a = prices.map((p) => Math.exp(-cond.beta * p));
  const denom = Math.exp(-cond.beta * REFERENCE_PRICE) + a.reduce((s, x) => s + x, 0);
  const shares = a.map((x) => x / denom);
  const units = shares.map((s) => Math.floor(cond.customers * s + 0.5));
  return { shares, units, profits: units.map((u, i) => u * (prices[i] - cond.cost)) };
}

/** The price that maximizes `seat`'s profit if everyone else charges `others` (in seat order, `seat` excluded). */
export function bestReply(cond: Conditions, seat: number, prices: readonly number[], floor = PRICE_MIN): number {
  let best = PRICE_MIN;
  let bestProfit = -Infinity;
  for (let p = Math.max(PRICE_MIN, floor); p <= PRICE_MAX; p++) {
    const trial = [...prices];
    trial[seat] = p;
    const profit = marketOutcome(cond, trial).profits[seat];
    if (profit > bestProfit) {
      bestProfit = profit;
      best = p;
    }
  }
  return best;
}

const clampPrice = (p: number) => Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(p)));

/**
 * A rival's price for round `h.length`, from public conditions and past prices only.
 *
 * Easy — fixed habits, with a seeded 30 % chance of being a step off: Investor cost + 7, Banker cost + 5, Deal Maker
 *   starts at cost + 7 then matches the lowest rival + 1, Opportunist undercuts the lowest rival by 1 but never goes
 *   below cost + 4 (cost + 5 to start).
 * Normal — best reply to rivals' last prices (round 1 assumes cost + 6), then: Investor never goes below cost + 3 and
 *   prices 1 above its best reply when rivals priced higher; Banker never below cost + 4; Deal Maker holds its price
 *   while both rivals stay at or above it and otherwise matches the lowest (at least cost + 3); Opportunist plays the
 *   pure best reply.
 * Hard — best reply to a prediction, with the match horizon in mind. Each rival's price is predicted from its last
 *   move and trend (within ±2) — except a firm whose last two prices were each within 1 of its best reply to the round
 *   before, which is predicted to do that again (a predictable best-replier gets anticipated). Then: Investor
 *   sustains high prices while both rivals have held at cost + 6 or more for two rounds; Banker adds a step when
 *   rivals are erratic; Deal Maker matches an undercut (never far below its best reply) and, while nobody undercuts it,
 *   edges its price up a step at a time toward cost + 8 — an open invitation, not an agreement; Opportunist undercuts
 *   whenever it pays. In the final round every Hard bot plays its best reply — no future left to protect.
 */
export function marketBotPrice(state: MarketState, seat: number, cond: Conditions): number {
  const persona = state.seats[seat]!;
  const { level, seed } = state.setup;
  const h = state.rounds;
  const n = h.length;
  const c = cond.cost;
  const last = h[n - 1];
  const prev = h[n - 2];
  const rivalsLast = last ? last.prices.filter((_, i) => i !== seat) : [];
  const minRival = rivalsLast.length ? Math.min(...rivalsLast) : null;
  const own = last ? last.prices[seat] : null;

  if (level === 'easy') {
    let p: number;
    if (persona === 'investor') p = c + 7;
    else if (persona === 'banker') p = c + 5;
    else if (persona === 'dealmaker') p = minRival === null ? c + 7 : Math.min(c + 7, minRival + 1);
    else p = minRival === null ? c + 5 : Math.max(c + 4, minRival - 1);
    const u = draw(seed, n, 20 + seat);
    if (u < 0.15) p -= 1;
    else if (u < 0.3) p += 1;
    return clampPrice(p);
  }

  const assumed = last ? last.prices : state.seats.map(() => c + 6);
  if (level === 'normal') {
    const br = bestReply(cond, seat, assumed);
    if (persona === 'investor') return clampPrice(Math.max(c + 3, minRival !== null && minRival > br ? br + 1 : br));
    if (persona === 'banker') return clampPrice(Math.max(c + 4, br));
    if (persona === 'dealmaker') {
      if (own === null) return clampPrice(c + 7);
      return clampPrice(rivalsLast.every((p) => p >= own) ? own : Math.max(c + 3, minRival!));
    }
    return clampPrice(Math.max(c + 1, br));
  }

  // Hard: predict each rival's price from its last move and trend.
  const predicted = last ? last.prices.map((p, i) => (i === seat ? p : predictFirm(h, i, cond))) : state.seats.map(() => c + 6);
  const br = bestReply(cond, seat, predicted);
  if (n === state.total - 1) return clampPrice(Math.max(persona === 'opportunist' ? c + 1 : c + 2, br));
  if (persona === 'investor') {
    const held = n >= 2 && [last, prev].every((r) => r.prices.every((p, i) => i === seat || p >= r.cond.cost + 6));
    return clampPrice(held ? Math.max(br, Math.min(own!, minRival!)) : Math.max(c + 3, br));
  }
  if (persona === 'banker') {
    const erratic = prev ? last.prices.some((p, i) => i !== seat && Math.abs(p - prev.prices[i]) >= 3) : false;
    return clampPrice(Math.max(c + 4, br + (erratic ? 1 : 0)));
  }
  if (persona === 'dealmaker') {
    if (own === null) return clampPrice(c + 7);
    if (minRival! < own) return clampPrice(Math.max(c + 3, br - 1, minRival!));
    return clampPrice(Math.min(c + 8, Math.max(br, own + 1)));
  }
  return clampPrice(Math.max(c + 1, br));
}

/** Hard bots' forecast of firm i's next price from revealed rounds (see marketBotPrice). */
export function predictFirm(h: readonly MarketRound[], i: number, cond: Conditions): number {
  const n = h.length;
  const last = h[n - 1];
  const prev = h[n - 2];
  const replied = (k: number) => k >= 1 && Math.abs(h[k].prices[i] - bestReply(h[k].cond, i, h[k - 1].prices)) <= 1;
  if (n >= 3 && replied(n - 1) && replied(n - 2)) return bestReply(cond, i, last.prices);
  return clampPrice(last.prices[i] + Math.max(-2, Math.min(2, prev ? last.prices[i] - prev.prices[i] : 0)));
}

export function marketPrompt(s: MarketState): { cond: Conditions; lastPrices: number[] | null } | null {
  const n = s.rounds.length;
  if (n >= s.total) return null;
  return { cond: conditions(s.setup, n), lastPrices: s.rounds[n - 1]?.prices ?? null };
}

function validate(s: MarketState, a: unknown): string | null {
  if (s.rounds.length >= s.total) return 'The season is over.';
  if (typeof a !== 'number' || !Number.isInteger(a)) return 'Set a whole-number price.';
  if (a < PRICE_MIN || a > PRICE_MAX) return `Prices run from ${PRICE_MIN} to ${PRICE_MAX}.`;
  return null;
}

function apply(s: MarketState, price: number): MarketState {
  const why = validate(s, price);
  if (why) throw new Error(`market: ${why}`);
  const cond = conditions(s.setup, s.rounds.length);
  const prices = s.seats.map((_, seat) => (seat === 0 ? price : marketBotPrice(s, seat, cond)));
  const { units, profits } = marketOutcome(cond, prices);
  return { ...s, profit: s.profit.map((p, i) => p + profits[i]), rounds: [...s.rounds, { cond, prices, units, profits }] };
}

export const marketSeatName = (s: MarketState, seat: number) => {
  const p = s.seats[seat];
  return p ? PERSONA_NAME[p] : 'You';
};

export function marketDebrief(s: MarketState): Debrief {
  const h = s.rounds;
  const moments: string[] = [];
  const sum = (f: (r: MarketRound) => number) => h.reduce((t, r) => t + f(r), 0);
  const units = h.map((r) => r.units.reduce((a, b) => a + b, 0));
  const share = (seat: number) => sum((r) => r.units[seat]) / Math.max(1, units.reduce((a, b) => a + b, 0));

  // The round where a different price (against the rivals' actual prices) would have earned the most more.
  const gaps = h.map((r, i) => {
    const best = bestReply(r.cond, 0, r.prices);
    const bestProfit = marketOutcome(r.cond, r.prices.map((p, k) => (k === 0 ? best : p))).profits[0];
    return { i, r, best, gap: bestProfit - r.profits[0], bestProfit };
  });
  const worst = gaps.reduce((a, b) => (b.gap > a.gap ? b : a), gaps[0]);
  if (worst && worst.gap >= 10) {
    const rivals = worst.r.prices.slice(1).join(' and ');
    moments.push(
      `Round ${worst.i + 1}: you priced at ${worst.r.prices[0]} against rivals at ${rivals}. With those prices, ${worst.best} would have earned ${worst.bestProfit} instead of ${worst.r.profits[0]} — ${worst.best < worst.r.prices[0] ? 'you left sales on the table' : 'the extra sales didn’t cover the lower margin'}.`,
    );
  }

  // Volume versus margin: your biggest-share round against your most profitable round.
  const byShare = h.map((r, i) => ({ i, r, sh: r.units[0] / Math.max(1, units[i]) }));
  const top = byShare.reduce((a, b) => (b.sh > a.sh ? b : a), byShare[0]);
  const rich = h.map((r, i) => ({ i, r })).reduce((a, b) => (b.r.profits[0] > a.r.profits[0] ? b : a), { i: 0, r: h[0] });
  if (top && rich && top.i !== rich.i && top.r.prices[0] < rich.r.prices[0] && top.r.profits[0] < rich.r.profits[0]) {
    moments.push(
      `Your biggest share came in round ${top.i + 1} (${Math.round(top.sh * 100)}% of sales at ${top.r.prices[0]}), but your best profit was round ${rich.i + 1} at ${rich.r.prices[0]}: ${rich.r.profits[0]} against ${top.r.profits[0]}. More sales at a thin margin earned less.`,
    );
  }

  const war = h.filter((r) => r.prices.reduce((a, b) => a + b, 0) / FIRMS <= r.cond.cost + 3).length;
  if (war >= 2 && moments.length < 3) moments.push(`${war} rounds were a price war — the average price was within 3 of cost. Everyone sold, and nobody earned much.`);

  const myShare = share(0);
  const leader = s.profit.indexOf(Math.max(...s.profit));
  const insight =
    leader !== 0 && myShare > share(leader)
      ? `You sold more than ${marketSeatName(s, leader)} (${Math.round(myShare * 100)}% vs ${Math.round(share(leader) * 100)}% of sales) yet earned less. Market share is not profit: each sale is worth its margin.`
      : war >= 2
        ? 'Undercutting pays only until rivals answer. Once everyone cuts, the market splits the same way at lower margins — the classic price war.'
        : 'The best price depends on what rivals charge: against high prices a modest undercut wins share profitably; against low prices, holding your margin can beat chasing volume.';

  const lead = 1;
  let cuts = 0;
  let answered = 0;
  for (let i = 0; i + 1 < h.length; i++) {
    if (h[i].prices[0] < h[i].prices[lead]) {
      cuts += 1;
      if (h[i + 1].prices[lead] < h[i].prices[lead]) answered += 1;
    }
  }
  const avg = (sum((r) => r.prices[lead] - r.cond.cost) / Math.max(1, h.length)).toFixed(1);
  const style: Record<Persona, string> = {
    investor: 'The Investor priced for sustainable margins and avoided starting price wars.',
    banker: 'The Banker kept a firm margin floor, whatever rivals did.',
    dealmaker: 'The Deal Maker mirrored the market: it held prices while rivals did and answered undercuts.',
    opportunist: 'The Opportunist undercut whenever a gap appeared.',
  };
  return {
    headline: 'Season closed',
    moments: moments.slice(0, 3),
    insight,
    opponentRead: `${style[s.setup.persona]} Its average margin was ${avg} per unit${cuts ? `; after you priced below it, it cut its own price the next round ${answered} of ${cuts} times` : ''}.`,
  };
}

export const market: ArenaEngine<MarketState, number, MarketVariant> = {
  id: 'market',
  variants: MARKET_VARIANTS,
  rounds: marketRounds,
  create(setup) {
    const seats = marketSeats(setup);
    return { setup, total: marketRounds(setup.length), seats, profit: seats.map(() => 0), rounds: [] };
  },
  validate,
  apply,
  isOver: (s) => s.rounds.length >= s.total,
  played: (s) => s.rounds.length,
  result: (s) =>
    resultFrom(
      s.seats.map((p, i) => ({ id: p ?? 'you', name: marketSeatName(s, i), score: s.profit[i], isPlayer: i === 0 })),
      'profit',
      { par: marketPar(s), parLabel: 'the price-war-free benchmark', tieWins: false },
    ),
  debrief: marketDebrief,
};

/**
 * The symmetric one-round equilibrium price: the price p at which, if both rivals charge p, p is also your best reply.
 * Found by iterating best replies; a two-price cycle resolves to the lower price.
 */
export function equilibriumPrice(cond: Conditions): number {
  let p = cond.cost + 6;
  const seen = new Set<number>();
  for (let i = 0; i < 40; i++) {
    const next = bestReply(cond, 0, [p, p, p]);
    if (next === p) return p;
    if (seen.has(next)) return Math.min(p, next);
    seen.add(p);
    p = next;
  }
  return p;
}

/**
 * The win benchmark: 95 % of what you would have earned if all three firms had charged the one-round equilibrium
 * price every round — profit a firm can expect without either a price war or tacit high prices.
 */
export function marketPar(s: Pick<MarketState, 'setup' | 'total'>): number {
  let total = 0;
  for (let n = 0; n < s.total; n++) {
    const cond = conditions(s.setup, n);
    const p = equilibriumPrice(cond);
    total += marketOutcome(cond, [p, p, p]).profits[0];
  }
  return Math.floor(total * 0.95);
}
