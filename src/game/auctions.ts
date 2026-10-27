/**
 * Sealed-bid auctions (Lesson 17). Bids are whole numbers. Allocation: highest bid wins; a tie is broken by a fair
 * coin. Payment: first-price — the winner pays their own bid; second-price — the winner pays the highest losing bid.
 * Losers pay nothing.
 */
export type AuctionFormat = 'first-price' | 'second-price';

export interface AuctionOutcome {
  winner: number;
  price: number;
  /** Payoff to each bidder: value − price for the winner, 0 for everyone else. */
  payoffs: number[];
}

export function runAuction(format: AuctionFormat, bids: readonly number[], values: readonly number[], coin: () => number): AuctionOutcome {
  const top = Math.max(...bids);
  const leaders = bids.map((b, i) => (b === top ? i : -1)).filter((i) => i >= 0);
  const winner = leaders.length === 1 ? leaders[0] : leaders[Math.min(leaders.length - 1, Math.floor(coin() * leaders.length))];
  const others = bids.filter((_, i) => i !== winner);
  const price = format === 'first-price' ? bids[winner] : others.length ? Math.max(...others) : 0;
  const payoffs = bids.map((_, i) => (i === winner ? values[i] - price : 0));
  return { winner, price, payoffs };
}

/**
 * Expected profit of bid `b` with value `v` against one rival whose value is equally likely to be any whole number
 * 0…maxValue and who bids `rivalBid(value)`. Exact (sums over every rival value).
 */
export function expectedProfit(format: AuctionFormat, v: number, b: number, maxValue: number, rivalBid: (value: number) => number): number {
  let total = 0;
  for (let rv = 0; rv <= maxValue; rv++) {
    const r = rivalBid(rv);
    const pWin = b > r ? 1 : b === r ? 0.5 : 0;
    const price = format === 'first-price' ? b : r;
    total += pWin * (v - price);
  }
  return total / (maxValue + 1);
}

export function bestBids(format: AuctionFormat, v: number, maxBid: number, maxValue: number, rivalBid: (value: number) => number): { bids: number[]; profit: number } {
  let best = -Infinity;
  let bids: number[] = [];
  for (let b = 0; b <= maxBid; b++) {
    const p = expectedProfit(format, v, b, maxValue, rivalBid);
    if (p > best + 1e-9) {
      best = p;
      bids = [b];
    } else if (Math.abs(p - best) <= 1e-9) bids.push(b);
  }
  return { bids, profit: best };
}
