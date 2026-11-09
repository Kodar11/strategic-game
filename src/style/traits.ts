/**
 * "How you play": three habits read from the player's own moves in finished matches — never from lessons, never a
 * score of ability. Each habit counts decisions of one kind:
 *
 * - trust      Opening moves and every round where cooperating was on offer (Cooperation Game, Split or Steal, Stag
 *              Hunt): how often you chose to cooperate.
 * - forgive    The round right after the other side let you down: how often you cooperated again anyway.
 * - fair       Your offers as proposer in either Ultimatum game: the share of the pool you offered.
 *
 * A habit is described only once it rests on enough decisions (MIN_EVIDENCE) — until then the card says it is
 * still learning your style. Pure: no React Native, tested with node --test.
 */

export interface Tally {
  /** Decisions of this kind. */
  n: number;
  /** Trust/forgive: how many were cooperative. Fair: the sum of offered shares (0–1). */
  sum: number;
}

export interface StyleCounts {
  trust: Tally;
  forgive: Tally;
  fair: Tally;
  /** Finished matches that contributed anything. */
  matches: number;
}

export const EMPTY_STYLE: StyleCounts = { trust: { n: 0, sum: 0 }, forgive: { n: 0, sum: 0 }, fair: { n: 0, sum: 0 }, matches: 0 };

/** Fewer decisions than this and a habit isn't described: a handful of moves says little. */
export const MIN_EVIDENCE = { trust: 12, forgive: 4, fair: 4 } as const;

type Coop = { p: string; b: string };
const COOPERATIVE = new Set(['C', 'split', 'stag']);

function fromCooperation(rounds: readonly Coop[], into: StyleCounts) {
  rounds.forEach((r, i) => {
    const mine = COOPERATIVE.has(r.p);
    into.trust.n++;
    if (mine) into.trust.sum++;
    const prev = rounds[i - 1];
    if (prev && !COOPERATIVE.has(prev.b)) {
      into.forgive.n++;
      if (mine) into.forgive.sum++;
    }
  });
}

function fromOffers(offers: readonly { offer: number; pool: number }[], into: StyleCounts) {
  for (const o of offers) {
    if (o.pool <= 0) continue;
    into.fair.n++;
    into.fair.sum += Math.min(1, Math.max(0, o.offer / o.pool));
  }
}

/**
 * What one finished match adds. `game` is a classic or Arena id; rounds are as the engine records them. Games that say
 * nothing about these habits add nothing.
 */
export function styleFromMatch(game: string, rounds: readonly unknown[]): StyleCounts {
  const c: StyleCounts = { trust: { n: 0, sum: 0 }, forgive: { n: 0, sum: 0 }, fair: { n: 0, sum: 0 }, matches: 0 };
  const rs = rounds as any[];
  if (game === 'cooperation') fromCooperation(rs.map((r) => ({ p: r.pi ?? r.p, b: r.b })), c);
  else if (game === 'split-steal' || game === 'stag-hunt') fromCooperation(rs as Coop[], c);
  else if (game === 'ultimatum') fromOffers(rs.filter((r) => r.proposer === 'player').map((r) => ({ offer: r.offer, pool: 10 })), c);
  else if (game === 'ultimatum-game') fromOffers(rs.filter((r) => r.proposer === 'player').map((r) => ({ offer: r.offer, pool: r.pool })), c);
  if (c.trust.n + c.forgive.n + c.fair.n > 0) c.matches = 1;
  return c;
}

export function addStyle(a: StyleCounts, b: StyleCounts): StyleCounts {
  const t = (x: Tally, y: Tally): Tally => ({ n: x.n + y.n, sum: x.sum + y.sum });
  return { trust: t(a.trust, b.trust), forgive: t(a.forgive, b.forgive), fair: t(a.fair, b.fair), matches: a.matches + b.matches };
}

export type Habit = 'trust' | 'forgive' | 'fair';

export interface HabitRead {
  habit: Habit;
  /** Short chip text ("Trusting"). */
  label: string;
  /** Half a sentence for the headline ("you trust first"). */
  phrase: string;
  /** The evidence, in counts ("Cooperated in 34 of 50 chances, across 6 matches"). */
  evidence: string;
  /** 0–1. */
  rate: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function read(habit: Habit, t: Tally): HabitRead | null {
  if (t.n < MIN_EVIDENCE[habit]) return null;
  const rate = t.sum / t.n;
  if (habit === 'trust') {
    const [label, phrase] = rate >= 0.7 ? ['Trusting', 'you trust first'] : rate >= 0.4 ? ['Selective', 'you trust when it’s earned'] : ['Guarded', 'you rarely trust first'];
    return { habit, label, phrase, rate, evidence: `Cooperated in ${Math.round(t.sum)} of ${t.n} chances (${pct(rate)}).` };
  }
  if (habit === 'forgive') {
    const [label, phrase] = rate >= 0.5 ? ['Forgiving', 'forgive quickly'] : rate >= 0.2 ? ['Measured', 'forgive now and then'] : ['Hits back', 'answer betrayal in kind'];
    return { habit, label, phrase, rate, evidence: `After being let down, cooperated again ${Math.round(t.sum)} of ${t.n} times (${pct(rate)}).` };
  }
  const [label, phrase] = rate >= 0.45 ? ['Generous', 'offer generous splits'] : rate >= 0.3 ? ['Fair dealer', 'bargain fairly'] : ['Hard bargainer', 'bargain hard'];
  return { habit, label, phrase, rate, evidence: `Offered ${pct(rate)} of the pool on average, over ${t.n} offers.` };
}

export interface StyleSummary {
  /** Habits with enough evidence, in a fixed order. */
  habits: HabitRead[];
  /** One sentence for a glance, or null while there isn't enough to say. */
  headline: string | null;
  matches: number;
}

export function summarizeStyle(c: StyleCounts): StyleSummary {
  const habits = [read('trust', c.trust), read('forgive', c.forgive), read('fair', c.fair)].filter((h): h is HabitRead => !!h);
  const parts = habits.map((h) => h.phrase);
  const headline = parts.length === 0 ? null : `You ${parts.length === 1 ? parts[0].replace(/^you /, '') : `${parts.slice(0, -1).map((p) => p.replace(/^you /, '')).join(', ')} and ${parts[parts.length - 1].replace(/^you /, '')}`}.`;
  return { habits, headline, matches: c.matches };
}

/** Validates a stored value; anything malformed is treated as no history. */
export function parseStyle(raw: unknown): StyleCounts {
  const ok = (t: any): t is Tally => t && Number.isFinite(t.n) && Number.isFinite(t.sum) && t.n >= 0 && t.sum >= 0 && t.sum <= t.n;
  const r = raw as any;
  if (!r || !ok(r.trust) || !ok(r.forgive) || !ok(r.fair) || !Number.isFinite(r.matches)) return EMPTY_STYLE;
  return { trust: { n: r.trust.n, sum: r.trust.sum }, forgive: { n: r.forgive.n, sum: r.forgive.sum }, fair: { n: r.fair.n, sum: r.fair.sum }, matches: r.matches };
}
