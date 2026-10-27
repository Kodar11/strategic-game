import { EPSILON } from './rng.ts';

/**
 * Coalitions (Lesson 19) and voting (Lesson 20).
 */

// ── Coalitional games ────────────────────────────────────────────────────────

/** A characteristic function: the value each coalition (a sorted string of player letters, e.g. "AB") can secure. */
export type CharacteristicFunction = Record<string, number>;

export function coalitionKey(members: readonly string[]): string {
  return [...members].sort().join('');
}

/** Every non-empty coalition of the given players. */
export function coalitions(players: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let mask = 1; mask < 1 << players.length; mask++) out.push(players.filter((_, i) => mask & (1 << i)));
  return out;
}

export interface Blocking {
  coalition: string[];
  value: number;
  gets: number;
}

/**
 * Coalitions that can block an allocation: they could secure more on their own than the allocation gives their
 * members together. An efficient allocation that no coalition blocks is in the core.
 */
export function blockingCoalitions(v: CharacteristicFunction, players: readonly string[], allocation: Record<string, number>): Blocking[] {
  return coalitions(players)
    .map((c) => ({ coalition: c, value: v[coalitionKey(c)] ?? 0, gets: c.reduce((s, p) => s + (allocation[p] ?? 0), 0) }))
    .filter((b) => b.value > b.gets + EPSILON);
}

export function inCore(v: CharacteristicFunction, players: readonly string[], allocation: Record<string, number>): boolean {
  const total = players.reduce((s, p) => s + (allocation[p] ?? 0), 0);
  const grand = v[coalitionKey(players)] ?? 0;
  return Math.abs(total - grand) <= EPSILON && blockingCoalitions(v, players, allocation).length === 0;
}

/** Search a grid of allocations of the grand coalition's value for any core allocation. */
export function coreIsEmpty(v: CharacteristicFunction, players: readonly string[], step = 0.5): boolean {
  const grand = v[coalitionKey(players)] ?? 0;
  if (players.length !== 3) throw new Error('coreIsEmpty searches three-player games');
  for (let a = 0; a <= grand + EPSILON; a += step) {
    for (let b = 0; a + b <= grand + EPSILON; b += step) {
      const alloc = { [players[0]]: a, [players[1]]: b, [players[2]]: grand - a - b };
      if (inCore(v, players, alloc)) return false;
    }
  }
  return true;
}

/** Shapley value: each player's average marginal contribution over all join orders. */
export function shapley(v: CharacteristicFunction, players: readonly string[]): Record<string, number> {
  const perms: string[][] = [];
  const permute = (rest: string[], acc: string[]) => {
    if (!rest.length) perms.push(acc);
    rest.forEach((p, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, p]));
  };
  permute([...players], []);
  const out: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  for (const order of perms) {
    const so: string[] = [];
    for (const p of order) {
      const before = so.length ? (v[coalitionKey(so)] ?? 0) : 0;
      so.push(p);
      out[p] += (v[coalitionKey(so)] ?? 0) - before;
    }
  }
  for (const p of players) out[p] /= perms.length;
  return out;
}

// ── Voting ───────────────────────────────────────────────────────────────────

/** A ranking, most preferred first. */
export type Ranking = readonly string[];

/** Does `voter` prefer x to y? */
export function prefers(voter: Ranking, x: string, y: string): boolean {
  return voter.indexOf(x) < voter.indexOf(y);
}

/** Sincere pairwise majority between x and y. Returns null on a tie. */
export function majorityWinner(voters: readonly Ranking[], x: string, y: string): string | null {
  const forX = voters.filter((v) => prefers(v, x, y)).length;
  const forY = voters.length - forX;
  return forX > forY ? x : forY > forX ? y : null;
}

/** Plurality tallies. */
export function plurality(votes: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of votes) out[v] = (out[v] ?? 0) + 1;
  return out;
}

/** Leaders of a tally (more than one means a tie). */
export function pluralityLeaders(tally: Record<string, number>): string[] {
  const max = Math.max(...Object.values(tally));
  return Object.keys(tally).filter((k) => tally[k] === max);
}

/**
 * Binary agenda (amendment procedure): `agenda[0]` vs `agenda[1]`, the winner then faces `agenda[2]`, and so on.
 * Sincere: every voter votes for the option they prefer at each stage.
 */
export function sincereAgenda(voters: readonly Ranking[], agenda: readonly string[]): string {
  let current = agenda[0];
  for (const next of agenda.slice(1)) {
    const w = majorityWinner(voters, current, next);
    if (!w) throw new Error('Tie in a pairwise vote; use an odd number of voters');
    current = w;
  }
  return current;
}

/**
 * Sophisticated (strategic) voting on the same agenda, by backward induction: at each stage voters compare the
 * final outcomes each branch leads to, not the options on the ballot.
 */
export function sophisticatedAgenda(voters: readonly Ranking[], agenda: readonly string[]): string {
  const outcome = (survivor: string, rest: readonly string[]): string => {
    if (!rest.length) return survivor;
    const a = outcome(survivor, rest.slice(1));
    const b = outcome(rest[0], rest.slice(1));
    if (a === b) return a;
    const w = majorityWinner(voters, a, b);
    if (!w) throw new Error('Tie in a pairwise vote; use an odd number of voters');
    return w;
  };
  return outcome(agenda[0], agenda.slice(1));
}

/** An option that beats every other in pairwise majority votes, if one exists. */
export function condorcetWinner(voters: readonly Ranking[], options: readonly string[]): string | null {
  return options.find((x) => options.every((y) => y === x || majorityWinner(voters, x, y) === x)) ?? null;
}
