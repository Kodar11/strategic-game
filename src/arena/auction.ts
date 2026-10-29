import { type ArenaEngine, type Debrief, LENGTH_ROUNDS, PERSONAS, PERSONA_NAME, type Persona, type Setup, draw, drawInt, resultFrom } from './core.ts';

/**
 * The Auction House — sealed-bid, first-price auctions for lots of uncertain common value.
 *
 * Four bidders: you, the rival you chose and two other personalities (picked by the seed). Per lot:
 * 1. Public: the lot, a value range [lo, hi] and the estimate accuracy ±u. The true value V is a whole number in the
 *    range, the same for everyone (a common value).
 * 2. Private: each bidder gets an estimate V + e, with e uniform in [−u, u]. Nobody sees anyone else's estimate.
 * 3. Everyone bids a whole number from 0 (pass) to their remaining budget, at once and in secret. Bots never see the
 *    player's bid or estimate.
 * 4. The highest bid wins and pays its own bid (first price). Equal top bids: a seeded draw picks the winner.
 * 5. The winner's profit is V − bid, which can be negative. Budget only limits bids; it is not score.
 * 6. All bids, estimates and the true value are revealed after each lot.
 * The match score is total profit; the most profit wins.
 *
 * Winner's curse: the winner is usually the bidder whose estimate was highest — the most optimistic. With four
 * bidders and errors uniform in ±u, the highest of four errors averages +0.6u, so bidding your raw estimate loses money
 * on average. Strong bots correct for it; easy bots only shade.
 *
 * Variants: Standard (±8–16) and Fog (±20–30, a stronger curse). Items, values and estimates come from the seed and
 * never depend on the difficulty.
 */

export type AuctionVariant = 'standard' | 'fog';
export const AUCTION_VARIANTS: readonly AuctionVariant[] = ['standard', 'fog'];
export const auctionLots = LENGTH_ROUNDS(3, 5, 8);
export const BIDDERS = 4;
export const BUDGET_PER_LOT = 45;
/** Expected highest of four uniform ±u errors, as a fraction of u: (N − 1) / (N + 1). */
export const CURSE = (BIDDERS - 1) / (BIDDERS + 1);

const LOT_NAMES = ['Vintage watch', 'Antique map', 'Signed guitar', 'Brass telescope', 'Sealed crate', 'Classic camera', 'Gem parcel', 'Old master sketch', 'Rare stamp sheet', 'Racing bicycle'] as const;

export interface Lot {
  name: string;
  lo: number;
  hi: number;
  /** Estimates are within ±u of the true value. */
  u: number;
}

export interface AuctionRound {
  lot: Lot;
  value: number;
  /** By bidder index: 0 is the player. Revealed after the lot. */
  estimates: number[];
  bids: number[];
  winner: number | null;
  price: number;
}

export interface AuctionState {
  setup: Setup<AuctionVariant>;
  total: number;
  /** Persona per seat; seat 0 is the player (null). Seat 1 is the chosen rival. */
  seats: (Persona | null)[];
  cash: number[];
  profit: number[];
  rounds: AuctionRound[];
}

export function auctionSeats(setup: Setup): (Persona | null)[] {
  const others = PERSONAS.filter((p) => p !== setup.persona);
  const drop = drawInt(setup.seed, 999, 0, 0, others.length - 1);
  return [null, setup.persona, ...others.filter((_, i) => i !== drop)];
}

export function auctionLot(setup: Setup<AuctionVariant>, n: number): { lot: Lot; value: number; estimates: number[] } {
  const { seed } = setup;
  const lo = drawInt(seed, n, 0, 30, 60);
  const hi = lo + drawInt(seed, n, 1, 40, 80);
  const u = setup.variant === 'fog' ? drawInt(seed, n, 2, 20, 30) : drawInt(seed, n, 2, 8, 16);
  const value = drawInt(seed, n, 3, lo, hi);
  const estimates = Array.from({ length: BIDDERS }, (_, i) => value + drawInt(seed, n, 10 + i, -u, u));
  return { lot: { name: LOT_NAMES[(drawInt(seed, 999, 1, 0, LOT_NAMES.length - 1) + n) % LOT_NAMES.length], lo, hi, u }, value, estimates };
}

/** E[V | estimate] with a uniform prior on [lo, hi]: the middle of the values consistent with both. */
export function posteriorMean(lot: Lot, estimate: number): number {
  const a = Math.max(lot.lo, estimate - lot.u);
  const b = Math.min(lot.hi, estimate + lot.u);
  return a <= b ? (a + b) / 2 : (lot.lo + lot.hi) / 2;
}

/** Average winning bid as a share of the lot's range midpoint, from revealed lots (public). */
function roomRatio(h: readonly AuctionRound[], fallback: number): number {
  const won = h.filter((r) => r.winner !== null);
  if (!won.length) return fallback;
  return won.reduce((t, r) => t + r.price / ((r.lot.lo + r.lot.hi) / 2), 0) / won.length;
}

/**
 * A bot's sealed bid for the current lot, from its own estimate, the public lot, its budget and revealed lots.
 *
 * Easy — shades its estimate and ignores the winner's curse: bid = posterior mean × (Investor 0.7, Banker 0.65,
 *   Deal Maker 0.72, Opportunist 0.8 on a high estimate / 0.55 otherwise).
 * Normal — corrects for part of the curse (value = mean − 0.4u), then: Investor bids 90 % of that; Banker takes a
 *   further 0.3u off for uncertainty and bids 85 %; Deal Maker bids what the room has been paying (capped at its
 *   value); Opportunist bids 98 % on a high estimate, 70 % otherwise.
 * Hard — near the equilibrium bid: full correction (value = mean − 0.6u), keeping a small margin. Investor bids value
 *   − 2, or just above the room's usual price when that is lower and still leaves a margin; Banker also discounts
 *   uncertainty (−0.3u); Deal Maker bids the room's usual price, capped at value − 1; Opportunist bids value − 1 on a
 *   high estimate, value − 0.4u otherwise, and snipes a room that has been bidding low.
 * Budget — every bot keeps cash for the lots still to come (Banker the most) and never bids above its cash.
 */
export function auctionBotBid(state: AuctionState, seat: number, lot: Lot, estimate: number): number {
  const persona = state.seats[seat]!;
  const { level } = state.setup;
  const h = state.rounds;
  const cash = state.cash[seat];
  const left = state.total - h.length;
  const mid = (lot.lo + lot.hi) / 2;
  const m = posteriorMean(lot, estimate);
  const high = estimate > mid + 0.2 * (lot.hi - lot.lo);
  let bid: number;

  if (level === 'easy') {
    const f = { investor: 0.7, banker: 0.65, dealmaker: 0.72, opportunist: high ? 0.8 : 0.55 }[persona];
    bid = m * f;
  } else if (level === 'normal') {
    const v = m - 0.4 * lot.u;
    if (persona === 'investor') bid = v * 0.9;
    else if (persona === 'banker') bid = (v - 0.3 * lot.u) * 0.85;
    else if (persona === 'dealmaker') bid = Math.min(v, roomRatio(h, 0.85) * mid);
    else bid = v * (high ? 0.98 : 0.7);
  } else {
    const v = m - CURSE * lot.u;
    const room = roomRatio(h, 0.85) * mid;
    if (persona === 'investor') bid = room + 1 < v - 2 && h.length >= 2 ? Math.max(room + 1, v - 0.3 * lot.u) : v - 2;
    else if (persona === 'banker') bid = v - 0.3 * lot.u - 1;
    else if (persona === 'dealmaker') bid = Math.min(v - 1, room + 1);
    else if (h.length >= 2 && room + 2 < v - 3) bid = room + 2;
    else bid = high ? v - 1 : v - 0.4 * lot.u;
  }

  const reserveShare = persona === 'banker' ? 0.4 : 0.25;
  const reserve = Math.max(0, left - 1) * reserveShare * BUDGET_PER_LOT;
  let cap = cash - reserve;
  if (persona === 'banker') cap = Math.min(cap, (cash / left) * 1.3);
  return Math.max(0, Math.min(cash, Math.round(Math.min(bid, cap))));
}

/** What the player sees before bidding. */
export function auctionPrompt(s: AuctionState): { lot: Lot; estimate: number; cash: number; lotNumber: number } | null {
  const n = s.rounds.length;
  if (n >= s.total) return null;
  const { lot, estimates } = auctionLot(s.setup, n);
  return { lot, estimate: estimates[0], cash: s.cash[0], lotNumber: n + 1 };
}

function validate(s: AuctionState, a: unknown): string | null {
  if (s.rounds.length >= s.total) return 'The auction is over.';
  if (typeof a !== 'number' || !Number.isInteger(a)) return 'Bid a whole number.';
  if (a < 0) return 'Bids can’t be negative.';
  if (a > s.cash[0]) return `You only have ${s.cash[0]} left to bid.`;
  return null;
}

function apply(s: AuctionState, bid: number): AuctionState {
  const why = validate(s, bid);
  if (why) throw new Error(`auction: ${why}`);
  const n = s.rounds.length;
  const { lot, value, estimates } = auctionLot(s.setup, n);
  // Bots bid from the state before the player's bid exists.
  const bids = s.seats.map((_, seat) => (seat === 0 ? bid : auctionBotBid(s, seat, lot, estimates[seat])));
  const top = Math.max(...bids);
  let winner: number | null = null;
  if (top > 0) {
    const tied = bids.map((b, i) => (b === top ? i : -1)).filter((i) => i >= 0);
    winner = tied[Math.floor(draw(s.setup.seed, n, 30) * tied.length)];
  }
  const cash = [...s.cash];
  const profit = [...s.profit];
  if (winner !== null) {
    cash[winner] -= top;
    profit[winner] += value - top;
  }
  return { ...s, cash, profit, rounds: [...s.rounds, { lot, value, estimates, bids, winner, price: winner === null ? 0 : top }] };
}

export function seatName(s: AuctionState, seat: number): string {
  const p = s.seats[seat];
  return p ? PERSONA_NAME[p] : 'You';
}

export function auctionDebrief(s: AuctionState): Debrief {
  const h = s.rounds;
  // Candidate moments, tagged with their lot so the debrief reads in match order.
  const moments: { at: number; text: string }[] = [];
  const won = h.map((r, i) => ({ r, i })).filter(({ r }) => r.winner === 0);
  // The player's budget going into each lot.
  const cashBefore: number[] = [];
  let cash = s.total * BUDGET_PER_LOT;
  for (const r of h) {
    cashBefore.push(cash);
    if (r.winner === 0) cash -= r.price;
  }

  const cursed = won.filter(({ r }) => r.value < r.price && r.estimates[0] > r.value);
  const overpaid = won.filter(({ r }) => r.price > r.estimates[0]);
  const profitable = won.filter(({ r }) => r.value > r.price);

  if (cursed.length) {
    const { r, i } = cursed[0];
    const rank = r.estimates.filter((e) => e > r.estimates[0]).length;
    moments.push({
      at: i,
      text: `Lot ${i + 1} (${r.lot.name}): you won with ${r.price}, but it was worth ${r.value} — a loss of ${r.price - r.value}. Your estimate of ${r.estimates[0]} was ${rank === 0 ? 'the most optimistic in the room' : 'among the most optimistic'}; winning was evidence it was too high.`,
    });
  } else if (overpaid.length) {
    const { r, i } = overpaid[0];
    moments.push({ at: i, text: `Lot ${i + 1} (${r.lot.name}): you bid ${r.price}, above your own estimate of ${r.estimates[0]}. Winning was not the same as making a profit: it was worth ${r.value}.` });
  }
  if (profitable.length) {
    const best = profitable.reduce((a, b) => (b.r.value - b.r.price > a.r.value - a.r.price ? b : a));
    moments.push({ at: best.i, text: `Your best buy: lot ${best.i + 1} (${best.r.lot.name}) for ${best.r.price}, worth ${best.r.value} — ${best.r.value - best.r.price} profit.` });
  }
  const missed = h.map((r, i) => ({ r, i })).filter(({ r }) => r.winner !== null && r.winner !== 0 && r.value - r.price >= 10 && r.bids[0] < r.price && r.price < posteriorMean(r.lot, r.estimates[0]) - 0.4 * r.lot.u);
  if (missed.length && moments.length < 3) {
    const { r, i } = missed[0];
    const lead = `Lot ${i + 1} (${r.lot.name}): ${seatName(s, r.winner!)} won it for ${r.price} — ${r.value - r.price} below its value.`;
    moments.push({
      at: i,
      text:
        cashBefore[i] < r.price
          ? `${lead} You had only ${cashBefore[i]} left to bid — what you spent on earlier lots decided this one.`
          : `${lead} Your estimate (${r.estimates[0]}) supported a bid above that; caution has a price too.`,
    });
  }
  if (!won.length && moments.length === 0) moments.push({ at: 0, text: 'You didn’t win a lot. Every winning bid was above your bid — the room valued these lots more, or bid more boldly.' });

  const insight = cursed.length
    ? `The winner’s curse: with ${BIDDERS} bidders estimating the same value, the winner is usually the one who overestimated most. Bid below your estimate — more so when estimates are vaguer (±${cursed[0].r.lot.u} here) or bidders are many.`
    : overpaid.length
      ? 'Bidding above your own estimate isn’t the winner’s curse — it is paying more than you believe the lot is worth. Decide your ceiling before you bid.'
      : won.length
        ? 'In a first-price auction you pay your bid, so shading below your estimate is the margin you keep. The question each lot is how much competition you need to beat.'
        : 'Bidding cautiously avoids losses but wins nothing. Profit comes from winning lots below their value: bid where your estimate leaves room after correcting for the curse.';

  const rival = 1;
  const rb = h.map((r) => (r.bids[rival] > 0 ? r.bids[rival] / Math.max(1, r.estimates[rival]) : null)).filter((x): x is number => x !== null);
  const style: Record<Persona, string> = {
    investor: 'The Investor bid for value: below its estimate, aiming for a margin.',
    banker: 'The Banker protected its budget and bid less on uncertain lots.',
    dealmaker: 'The Deal Maker followed the room — its bids tracked what lots had been selling for.',
    opportunist: 'The Opportunist pounced on high estimates and snapped up lots when the room bid low.',
  };
  const avg = rb.length ? Math.round((rb.reduce((a, b) => a + b, 0) / rb.length) * 100) : null;
  return {
    headline: 'Auction closed',
    moments: moments.sort((x, y) => x.at - y.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${style[s.setup.persona]}${avg !== null ? ` On average it bid ${avg}% of its own estimate, and finished with ${s.profit[rival]} profit.` : ' It never bid.'}`,
  };
}

export const auction: ArenaEngine<AuctionState, number, AuctionVariant> = {
  id: 'auction',
  opponents: PERSONAS,
  variants: AUCTION_VARIANTS,
  rounds: auctionLots,
  create(setup) {
    const total = auctionLots(setup.length);
    const seats = auctionSeats(setup);
    return { setup, total, seats, cash: seats.map(() => total * BUDGET_PER_LOT), profit: seats.map(() => 0), rounds: [] };
  },
  validate,
  apply,
  isOver: (s) => s.rounds.length >= s.total,
  played: (s) => s.rounds.length,
  result: (s) =>
    resultFrom(
      s.seats.map((p, i) => ({ id: p ?? 'you', name: seatName(s, i), score: s.profit[i], isPlayer: i === 0 })),
      'profit',
      { positive: true },
    ),
  debrief: auctionDebrief,
};

