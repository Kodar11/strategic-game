import type { Level } from './progress.ts';
import type { Season } from './schema.ts';

/**
 * The Gauntlet: the Tournament's endless mode once the season is done. Six bouts in a row against the season's rivals,
 * each harder than the last, with one life. Win a bout and you pick one of two perks; a draw lets you through without
 * one; a loss costs a life, and with no lives left the run ends. Your best run (bouts won) is kept.
 *
 * Every bout is a match from the season (its game, rival and intel) at the bout's level, against a hidden opponent
 * as in every Tournament match. Bouts are drawn from the run's seed, never two from the same stage in a row.
 * Pure: no React Native, tested with node --test.
 */

export const GAUNTLET_BOUTS = 6;
export const LEVELS_BY_BOUT: readonly Level[] = ['easy', 'normal', 'normal', 'hard', 'hard', 'hard'];

export type Perk = 'scout' | 'life' | 'calm';
export const PERKS: Record<Perk, { name: string; line: string }> = {
  scout: { name: 'Scout report', line: 'See how the next rival plays before the bout starts.' },
  life: { name: 'Second chance', line: 'One extra life: a lost bout won’t end the run.' },
  calm: { name: 'Calm mind', line: 'The next bout is played one level easier.' },
};

export interface Bout {
  stageId: string;
  matchId: string;
  level: Level;
}

export type BoutOutcome = 'win' | 'loss' | 'draw';

export interface GauntletRun {
  seed: number;
  bouts: Bout[];
  /** Index of the bout being played (= results.length while the run is live). */
  at: number;
  results: BoutOutcome[];
  lives: number;
  /** Perks waiting for the next bout. */
  scout: boolean;
  calm: boolean;
  /** Two perks to choose from, after a win; null when no choice is pending. */
  choice: [Perk, Perk] | null;
  over: boolean;
}

/** mulberry32 step: a fresh draw from `state`, and the next state. */
function rand(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** A new run from the season's bracket matches (side trials included: they are part of the season's cast). */
export function newRun(season: Season, seed: number): GauntletRun {
  const pool = season.stages.flatMap((s) => s.matches.map((m) => ({ stageId: s.id, matchId: m.id })));
  if (pool.length === 0) throw new Error('gauntlet: the season has no matches');
  let state = seed >>> 0;
  const bouts: Bout[] = [];
  const used = new Set<string>();
  for (let i = 0; i < GAUNTLET_BOUTS; i++) {
    let r: number;
    [r, state] = rand(state);
    const prev = bouts[i - 1]?.stageId;
    const fresh = pool.filter((p) => !used.has(p.matchId) && p.stageId !== prev);
    const from = fresh.length ? fresh : pool.filter((p) => p.stageId !== prev).length ? pool.filter((p) => p.stageId !== prev) : pool;
    const pick = from[Math.floor(r * from.length)];
    used.add(pick.matchId);
    bouts.push({ ...pick, level: LEVELS_BY_BOUT[i] });
  }
  return { seed: seed >>> 0, bouts, at: 0, results: [], lives: 1, scout: false, calm: false, choice: null, over: false };
}

const EASIER: Record<Level, Level> = { easy: 'easy', normal: 'easy', hard: 'normal' };

/** The level the current bout is played at (Calm mind lowers it by one). */
export const boutLevel = (run: GauntletRun): Level => (run.calm ? EASIER[run.bouts[run.at].level] : run.bouts[run.at].level);

/** Two different perks for a choice, drawn from the run's seed and the bout number. */
export function perkChoice(run: GauntletRun): [Perk, Perk] {
  const all: Perk[] = ['scout', 'life', 'calm'];
  const [r] = rand((run.seed ^ (run.at * 0x9e3779b1)) >>> 0);
  const skip = all[Math.floor(r * 3)];
  const two = all.filter((p) => p !== skip);
  return [two[0], two[1]];
}

/** Records the current bout's outcome. A win offers a perk choice (unless it was the last bout). */
export function reportBout(run: GauntletRun, outcome: BoutOutcome): GauntletRun {
  if (run.over || run.choice) return run;
  const results = [...run.results, outcome];
  const lives = outcome === 'loss' ? run.lives - 1 : run.lives;
  const at = run.at + 1;
  const over = lives <= 0 || at >= run.bouts.length;
  const next: GauntletRun = { ...run, results, lives, at, scout: false, calm: false, over, choice: null };
  return outcome === 'win' && !over ? { ...next, choice: perkChoice(next) } : next;
}

export function takePerk(run: GauntletRun, perk: Perk): GauntletRun {
  if (!run.choice || !run.choice.includes(perk)) return run;
  return { ...run, choice: null, lives: perk === 'life' ? run.lives + 1 : run.lives, scout: perk === 'scout', calm: perk === 'calm' };
}

export const boutsWon = (run: GauntletRun) => run.results.filter((r) => r === 'win').length;

/** Validates a stored run against the current season; anything stale or malformed is dropped (null). */
export function parseRun(raw: unknown, season: Season): GauntletRun | null {
  const r = raw as GauntletRun | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.bouts) || r.bouts.length !== GAUNTLET_BOUTS || !Array.isArray(r.results)) return null;
  const ids = new Set(season.stages.flatMap((s) => s.matches.map((m) => `${s.id}/${m.id}`)));
  if (!r.bouts.every((b) => ids.has(`${b.stageId}/${b.matchId}`) && (b.level === 'easy' || b.level === 'normal' || b.level === 'hard'))) return null;
  if (!r.results.every((x) => x === 'win' || x === 'loss' || x === 'draw') || r.at !== r.results.length || !Number.isInteger(r.lives) || r.lives < 0) return null;
  const choice = Array.isArray(r.choice) && r.choice.length === 2 && r.choice.every((p) => p in PERKS) ? (r.choice as [Perk, Perk]) : null;
  return { seed: r.seed >>> 0, bouts: r.bouts.map((b) => ({ stageId: b.stageId, matchId: b.matchId, level: b.level })), at: r.at, results: [...r.results], lives: r.lives, scout: !!r.scout, calm: !!r.calm, choice, over: !!r.over };
}
