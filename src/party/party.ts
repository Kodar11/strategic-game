/**
 * Party mode: games for a group around one phone, passed hand to hand. Every secret (a role, a number, a choice) is
 * entered on a private screen; the phone only shows the public result. No accounts, no network, nothing stored.
 *
 * - traitors   Social deduction. Secret Traitors among the Faithful. By day the group banishes one player; by night
 *              the Traitors remove one Faithful. Faithful win when every Traitor is gone; Traitors win once they are
 *              as many as the Faithful.
 * - two-thirds Everyone secretly picks 0–100; closest to two-thirds of the average scores. Three rounds.
 * - pot        Each round everyone secretly keeps their 10 coins or puts them in the pot; the pot is doubled and
 *              shared by all. Only the number who shared is revealed, never who. Five rounds.
 *
 * Pure: no React Native, tested with node --test.
 */

export type PartyGame = 'traitors' | 'two-thirds' | 'pot';

export const PARTY_GAMES: Record<PartyGame, { title: string; line: string; players: [number, number]; minutes: string; lesson?: string }> = {
  traitors: { title: 'The Traitors', line: 'Someone at the table is lying. Find them before they find you.', players: [4, 10], minutes: '15–25 min' },
  'two-thirds': { title: 'Two-Thirds', line: 'Guess two-thirds of everyone’s average. Out-think the room.', players: [3, 10], minutes: '5 min', lesson: 'strategy-detective' },
  pot: { title: 'The Pot', line: 'Share and everyone gains. Keep and you gain more — unless everyone keeps.', players: [3, 10], minutes: '5–10 min', lesson: 'cooperation-trap' },
};

export const MAX_NAME = 16;

/** Cleans a list of typed names: trimmed, non-empty, unique (case-insensitive), at most MAX_NAME characters. */
export function cleanNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const n = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
  }
  return out;
}

export function canStart(game: PartyGame, players: readonly string[]): boolean {
  const [lo, hi] = PARTY_GAMES[game].players;
  return players.length >= lo && players.length <= hi;
}

// ── Randomness (seeded, so tests are exact) ──────────────────────────────────

export type Rand = () => number;
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The Traitors ─────────────────────────────────────────────────────────────

export type Role = 'traitor' | 'faithful';

export interface TraitorsState {
  players: string[];
  roles: Role[];
  alive: boolean[];
  /** Day 1, night 1, day 2… */
  round: number;
  phase: 'day' | 'night' | 'over';
  /** What happened most recently, for the public screen. */
  last: { kind: 'banished' | 'murdered'; player: number; role: Role } | null;
  winner: Role | null;
}

export const traitorCount = (n: number) => (n >= 7 ? 2 : 1);

export function startTraitors(players: readonly string[], rand: Rand): TraitorsState {
  const n = players.length;
  const idx = players.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const traitors = new Set(idx.slice(0, traitorCount(n)));
  return { players: [...players], roles: players.map((_, i) => (traitors.has(i) ? 'traitor' : 'faithful')), alive: players.map(() => true), round: 1, phase: 'day', last: null, winner: null };
}

const living = (s: TraitorsState, role?: Role) => s.players.map((_, i) => i).filter((i) => s.alive[i] && (!role || s.roles[i] === role));

function settle(s: TraitorsState): TraitorsState {
  const t = living(s, 'traitor').length;
  const f = living(s, 'faithful').length;
  if (t === 0) return { ...s, phase: 'over', winner: 'faithful' };
  if (t >= f) return { ...s, phase: 'over', winner: 'traitor' };
  return s;
}

/** The group's daytime decision: one living player is banished and their role revealed. */
export function banish(s: TraitorsState, player: number): TraitorsState {
  if (s.phase !== 'day' || !s.alive[player]) return s;
  const alive = s.alive.map((a, i) => a && i !== player);
  return settle({ ...s, alive, phase: 'night', last: { kind: 'banished', player, role: s.roles[player] } });
}

/** Who a Traitor may remove tonight: the living Faithful. */
export const victims = (s: TraitorsState) => living(s, 'faithful');
export const nightOrder = (s: TraitorsState) => living(s);
export const fellowTraitors = (s: TraitorsState, me: number) => s.players.map((_, i) => i).filter((i) => i !== me && s.roles[i] === 'traitor');

/** The Traitors' choice for the night (the first living Traitor's pick, which the others see). */
export function murder(s: TraitorsState, victim: number): TraitorsState {
  if (s.phase !== 'night' || !victims(s).includes(victim)) return s;
  const alive = s.alive.map((a, i) => a && i !== victim);
  return settle({ ...s, alive, phase: 'day', round: s.round + 1, last: { kind: 'murdered', player: victim, role: 'faithful' } });
}

// ── Two-Thirds ───────────────────────────────────────────────────────────────

export interface GuessRound {
  guesses: number[];
  average: number;
  target: number;
  /** Everyone tied for closest. */
  winners: number[];
}

export function scoreGuesses(guesses: readonly number[]): GuessRound {
  const g = guesses.map((x) => Math.max(0, Math.min(100, Math.round(x))));
  const average = g.reduce((a, b) => a + b, 0) / Math.max(1, g.length);
  const target = (average * 2) / 3;
  const best = Math.min(...g.map((x) => Math.abs(x - target)));
  return { guesses: g, average, target, winners: g.map((_, i) => i).filter((i) => Math.abs(g[i] - target) === best) };
}

export const TWO_THIRDS_ROUNDS = 3;

// ── The Pot ──────────────────────────────────────────────────────────────────

export const POT_COINS = 10;
export const POT_ROUNDS = 5;

export interface PotRound {
  shared: number;
  /** Coins each player ends the round with. */
  payout: number[];
}

/** `share[i]`: whether player i put their coins in. The pot is doubled and split equally among everyone. */
export function scorePot(share: readonly boolean[]): PotRound {
  const n = share.length;
  const shared = share.filter(Boolean).length;
  const each = (shared * POT_COINS * 2) / n;
  return { shared, payout: share.map((s) => Math.round(((s ? 0 : POT_COINS) + each) * 10) / 10) };
}

/** Standings from per-player totals: best first, ties share a place. */
export function standings(players: readonly string[], totals: readonly number[]): { name: string; total: number; place: number }[] {
  const rows = players.map((name, i) => ({ name, total: totals[i] ?? 0 })).sort((a, b) => b.total - a.total);
  return rows.map((r) => ({ ...r, place: rows.findIndex((x) => x.total === r.total) + 1 }));
}
