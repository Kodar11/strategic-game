import type { Outcome } from '../games/core.ts';
import { type PlayStyle, type Season, type Stage, STYLES, type TournamentMatch } from './schema.ts';

/**
 * The Tournament's rules, as pure functions over saved progress. Nothing here is stored that can be derived: stars,
 * unlocks, key cards, rating, title, play style and cards all come from the match records, the match history and the
 * lessons the player has finished. Changing a rule changes everyone's standing consistently.
 *
 * - A match is **cleared** when it has been won once, or skipped after three losses (never a duel).
 * - Stars (up to 3): won, read the hidden opponent correctly in a win or loss, won on Hard.
 * - A stage **unlocks** when the stage before it is cleared; it is **cleared** when every match in it is.
 * - The **duel** opens once every other match in the stage is cleared and the stage's key card is held.
 * - The **key card** is held when any of the stage's lessons is finished, or its 3-question check was passed.
 */

export type Level = 'easy' | 'normal' | 'hard';

export interface MatchRecord {
  wins: number;
  losses: number;
  draws: number;
  won: boolean;
  /** A correct read of the hidden opponent, in any game of this match. */
  read: boolean;
  /** Won on Hard. */
  hard: boolean;
  skipped: boolean;
  /** Won in the Hard Replay, after the season is cleared. */
  replay: boolean;
}

export interface HistoryEntry {
  match: string;
  outcome: Outcome;
  /** The opponent's rating for this game, fixed when it was played. */
  opp: number;
  read: boolean;
  at: number;
}

export interface CheckRecord {
  passed: boolean;
  correct: number;
  total: number;
  at: number;
}

export interface MindEntry {
  form: MindForm;
  correct: number;
  total: number;
  at: number;
}

export type MindForm = 'a' | 'b' | 'c';

export interface TournamentProgress {
  matches: Record<string, MatchRecord>;
  history: HistoryEntry[];
  checks: Record<string, CheckRecord>;
  /** Stages whose intro scene has been seen. */
  seen: string[];
  mind: MindEntry[];
}

export const EMPTY_PROGRESS: TournamentProgress = { matches: {}, history: [], checks: {}, seen: [], mind: [] };
export const EMPTY_RECORD: MatchRecord = { wins: 0, losses: 0, draws: 0, won: false, read: false, hard: false, skipped: false, replay: false };
export const HISTORY_MAX = 400;
export const SKIP_AFTER = 3;

export const recordOf = (p: TournamentProgress, id: string): MatchRecord => p.matches[id] ?? EMPTY_RECORD;
export const stars = (r: MatchRecord) => Number(r.won) + Number(r.read) + Number(r.hard);
export const cleared = (r: MatchRecord) => r.won || r.skipped;
export const canSkip = (m: TournamentMatch, r: MatchRecord) => !m.duel && !cleared(r) && r.losses + r.draws >= SKIP_AFTER;

export function hasKeyCard(stage: Stage, completed: readonly string[], p: TournamentProgress): boolean {
  return stage.lessons.length === 0 || stage.lessons.some((l) => completed.includes(l)) || p.checks[stage.id]?.passed === true;
}

export const stageCleared = (stage: Stage, p: TournamentProgress) => stage.matches.every((m) => cleared(recordOf(p, m.id)));

export interface StageStatus {
  stage: Stage;
  index: number;
  unlocked: boolean;
  cleared: boolean;
  keyCard: boolean;
  duelOpen: boolean;
  stars: number;
  maxStars: number;
  clearedCount: number;
}

/** The bracket in order, without side trials. */
export const mainStages = (season: Season) => season.stages.filter((s) => s.kind !== 'side');

/**
 * A main stage opens when the main stage before it is cleared (the first is always open). A side trial opens once the
 * first main stage is cleared, and never blocks the bracket.
 */
function isUnlocked(season: Season, stage: Stage, p: TournamentProgress): boolean {
  const main = mainStages(season);
  if (stage.kind === 'side') return main.length > 0 && stageCleared(main[0], p);
  const i = main.indexOf(stage);
  return i <= 0 || stageCleared(main[i - 1], p);
}

export function stageStatus(season: Season, index: number, p: TournamentProgress, completed: readonly string[]): StageStatus {
  const stage = season.stages[index];
  const unlocked = isUnlocked(season, stage, p);
  const keyCard = hasKeyCard(stage, completed, p);
  const rest = stage.matches.filter((m) => !m.duel);
  return {
    stage,
    index,
    unlocked,
    cleared: unlocked && stageCleared(stage, p),
    keyCard,
    duelOpen: unlocked && keyCard && rest.every((m) => cleared(recordOf(p, m.id))),
    stars: stage.matches.reduce((n, m) => n + stars(recordOf(p, m.id)), 0),
    maxStars: stage.matches.length * 3,
    clearedCount: stage.matches.filter((m) => cleared(recordOf(p, m.id))).length,
  };
}

export const allStages = (season: Season, p: TournamentProgress, completed: readonly string[]) => season.stages.map((_, i) => stageStatus(season, i, p, completed));

/** The bracket stage the player is working on: the first unlocked one not cleared; the last once all are cleared. */
export function currentStage(season: Season, p: TournamentProgress, completed: readonly string[]): StageStatus {
  const all = allStages(season, p, completed).filter((s) => s.stage.kind !== 'side');
  return all.find((s) => s.unlocked && !s.cleared) ?? all[all.length - 1];
}

/** Every bracket stage cleared. Side trials don't count. */
export const seasonCleared = (season: Season, p: TournamentProgress) => mainStages(season).every((s) => stageCleared(s, p));

/**
 * The Hard Replay: once the season is cleared, every bracket match can be played again on Hard (with the game's
 * challenge rules where it has them). Its progress is the matches won there; the next one is the first not won yet.
 */
export function replayStatus(season: Season, p: TournamentProgress): { open: boolean; cleared: number; total: number; next: { stage: Stage; match: TournamentMatch } | null } {
  const all = mainStages(season).flatMap((stage) => stage.matches.map((match) => ({ stage, match })));
  const left = all.filter((x) => !recordOf(p, x.match.id).replay);
  return { open: seasonCleared(season, p), cleared: all.length - left.length, total: all.length, next: left[0] ?? null };
}

export function matchOpen(status: StageStatus, m: TournamentMatch): boolean {
  return status.unlocked && (!m.duel || status.duelOpen);
}

/** The next match to play in a stage: the first open one not cleared. */
export function nextMatch(status: StageStatus, p: TournamentProgress): TournamentMatch | null {
  return status.stage.matches.find((m) => matchOpen(status, m) && !cleared(recordOf(p, m.id))) ?? null;
}

export function findMatch(season: Season, id: string): { stage: Stage; index: number; match: TournamentMatch } | null {
  for (let i = 0; i < season.stages.length; i++) {
    const m = season.stages[i].matches.find((x) => x.id === id);
    if (m) return { stage: season.stages[i], index: i, match: m };
  }
  return null;
}

// ── Recording ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The opponent's rating for one game: by level, more for a duel, the Final and the Hard Replay. */
export function opponentRating(stage: Stage, m: TournamentMatch, level: Level, replay = false): number {
  const base = level === 'easy' ? 700 : level === 'normal' ? 900 : 1100;
  return base + (m.duel ? 100 : 0) + (stage.kind === 'final' ? 100 : 0) + (replay ? 100 : 0);
}

export interface Played {
  outcome: Outcome;
  level: Level;
  /** The hidden opponent was named correctly. */
  read: boolean;
  /** Played in the Hard Replay. */
  replay?: boolean;
}

export interface Recorded {
  progress: TournamentProgress;
  /** The match was cleared by this game (it wasn't before). */
  firstClear: boolean;
  /** The stage's rival was beaten in their duel by this game. */
  rivalDefeated: boolean;
  /** This game cleared the whole stage. */
  stageCleared: boolean;
  starsBefore: number;
  starsAfter: number;
  /** The match was won in the Hard Replay for the first time by this game. */
  replayCleared: boolean;
}

export function recordGame(p: TournamentProgress, stage: Stage, m: TournamentMatch, g: Played, now: number): Recorded {
  const prev = recordOf(p, m.id);
  const win = g.outcome === 'win';
  const next: MatchRecord = {
    wins: prev.wins + Number(win),
    losses: prev.losses + Number(g.outcome === 'loss'),
    draws: prev.draws + Number(g.outcome === 'draw'),
    won: prev.won || win,
    read: prev.read || g.read,
    hard: prev.hard || (win && g.level === 'hard'),
    skipped: prev.skipped,
    replay: prev.replay || (win && g.replay === true),
  };
  const wasCleared = stageCleared(stage, p);
  const entry: HistoryEntry = { match: m.id, outcome: g.outcome, opp: opponentRating(stage, m, g.level, g.replay === true), read: g.read, at: now };
  const progress: TournamentProgress = { ...p, matches: { ...p.matches, [m.id]: next }, history: [...p.history, entry].slice(-HISTORY_MAX) };
  return {
    progress,
    firstClear: !cleared(prev) && cleared(next),
    rivalDefeated: !!m.duel && !prev.won && win,
    stageCleared: !wasCleared && stageCleared(stage, progress),
    starsBefore: stars(prev),
    starsAfter: stars(next),
    replayCleared: !prev.replay && next.replay,
  };
}

export function skipMatch(p: TournamentProgress, m: TournamentMatch): TournamentProgress {
  const prev = recordOf(p, m.id);
  if (!canSkip(m, prev)) return p;
  return { ...p, matches: { ...p.matches, [m.id]: { ...prev, skipped: true } } };
}

// ── Status ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const START_RATING = 800;
const K = 32;

/** An Elo-style rating replayed from the history: each game against an opponent of known rating. */
export function strategistRating(history: readonly HistoryEntry[]): number {
  let r = START_RATING;
  for (const h of history) {
    const expected = 1 / (1 + 10 ** ((h.opp - r) / 400));
    const score = h.outcome === 'win' ? 1 : h.outcome === 'draw' ? 0.5 : 0;
    r += K * (score - expected);
  }
  return Math.round(r);
}

export const TITLES = [
  { min: 0, name: 'Contestant' },
  { min: 900, name: 'Challenger' },
  { min: 1000, name: 'Tactician' },
  { min: 1100, name: 'Finalist' },
  { min: 1200, name: 'Mastermind' },
] as const;

export function titleFor(rating: number): string {
  let name: string = TITLES[0].name;
  for (const t of TITLES) if (rating >= t.min) name = t.name;
  return name;
}

export const STYLE_MIN_GAMES = 10;
export const STYLE_NAME: Record<PlayStyle, string> = { diplomat: 'The Diplomat', manipulator: 'The Manipulator', reader: 'The Reader', calculator: 'The Calculator' };
export const STYLE_LINE: Record<PlayStyle, string> = {
  diplomat: 'You win by building trust and making deals stick.',
  manipulator: 'You win by bluffing, pressure and credible threats.',
  reader: 'You win by reading people and following the evidence.',
  calculator: 'You win by thinking ahead and counting the odds.',
};

/**
 * Where the player wins most, after enough games to show a pattern: each win counts for its stage's style, and each
 * correct read counts for "reader". Null before STYLE_MIN_GAMES games. Ties go to the earlier style in STYLES.
 */
export function playStyle(season: Season, history: readonly HistoryEntry[]): PlayStyle | null {
  if (history.length < STYLE_MIN_GAMES) return null;
  const styleOf = new Map<string, PlayStyle>();
  for (const s of season.stages) for (const m of s.matches) styleOf.set(m.id, s.style);
  const score: Record<PlayStyle, number> = { diplomat: 0, manipulator: 0, reader: 0, calculator: 0 };
  for (const h of history) {
    const s = styleOf.get(h.match);
    if (s && h.outcome === 'win') score[s]++;
    if (h.read) score.reader++;
  }
  let best: PlayStyle = STYLES[0];
  for (const s of STYLES) if (score[s] > score[best]) best = s;
  return score[best] > 0 ? best : null;
}

// ── Cards ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CardRef {
  kind: 'lesson' | 'rival';
  id: string;
  owned: boolean;
}

/**
 * The card set: one per lesson (owned once finished, so learning done before the Tournament counts) and one per
 * stage rival (owned once their last stage is cleared). Lessons in the order the season first uses them.
 */
export function cardSet(season: Season, allLessons: readonly string[], completed: readonly string[], p: TournamentProgress): CardRef[] {
  const order: string[] = [];
  const add = (l: string | undefined) => {
    if (l && allLessons.includes(l) && !order.includes(l)) order.push(l);
  };
  for (const s of season.stages) {
    for (const m of s.matches) add(m.intel.lesson);
    s.lessons.forEach(add);
  }
  allLessons.forEach(add);
  const lessons: CardRef[] = order.map((id) => ({ kind: 'lesson', id, owned: completed.includes(id) }));
  const lastStage = new Map<string, Stage>();
  for (const s of mainStages(season)) lastStage.set(s.rival, s);
  const rivals: CardRef[] = [...lastStage.entries()].map(([id, s]) => ({ kind: 'rival', id, owned: stageCleared(s, p) }));
  return [...lessons, ...rivals];
}

// ── Mind Check ──────────────────────────────────────────────────────────────────────────────────────────────────

export const MIND_ITEMS = 10;

/**
 * Which Mind Check to offer now: form A at any time until taken; B once the third bracket stage is cleared; C once
 * the sixth is (side trials don't count). Each form is offered until taken, never twice.
 */
export function mindCheckOffer(season: Season, p: TournamentProgress): MindForm | null {
  const taken = new Set(p.mind.map((m) => m.form));
  if (!taken.has('a')) return 'a';
  const main = mainStages(season);
  const after = (i: number) => i < main.length && stageCleared(main[i], p);
  if (!taken.has('b') && after(2)) return 'b';
  if (!taken.has('c') && after(5)) return 'c';
  return null;
}

/** Items for a form: every third item of the pool, starting at the form's offset, so the forms never overlap. */
export function mindForm<T>(pool: readonly T[], form: MindForm): T[] {
  const offset = form === 'a' ? 0 : form === 'b' ? 1 : 2;
  return pool.filter((_, i) => i % 3 === offset).slice(0, MIND_ITEMS);
}

// ── Saved data ──────────────────────────────────────────────────────────────────────────────────────────────────

const int = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.round(x)) : 0);
const bool = (x: unknown) => x === true;
const isOutcome = (x: unknown): x is Outcome => x === 'win' || x === 'loss' || x === 'draw';
const isForm = (x: unknown): x is MindForm => x === 'a' || x === 'b' || x === 'c';

const ID = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const isId = (x: unknown): x is string => typeof x === 'string' && ID.test(x);

/**
 * Rebuilds saved progress from scratch, keeping only well-formed parts. Ids are kept even when the installed season
 * doesn't have them (a newer document may), and are simply unused until it does.
 */
export function sanitizeProgress(raw: unknown): TournamentProgress {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: TournamentProgress = { matches: {}, history: [], checks: {}, seen: [], mind: [] };
  const matches = (o.matches && typeof o.matches === 'object' ? o.matches : {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(matches)) {
    if (!isId(id) || !v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    out.matches[id] = { wins: int(r.wins), losses: int(r.losses), draws: int(r.draws), won: bool(r.won), read: bool(r.read), hard: bool(r.hard), skipped: bool(r.skipped), replay: bool(r.replay) };
  }
  for (const h of Array.isArray(o.history) ? o.history : []) {
    const e = (h ?? {}) as Record<string, unknown>;
    if (isId(e.match) && isOutcome(e.outcome)) out.history.push({ match: e.match, outcome: e.outcome, opp: int(e.opp), read: bool(e.read), at: int(e.at) });
  }
  out.history = out.history.slice(-HISTORY_MAX);
  const checks = (o.checks && typeof o.checks === 'object' ? o.checks : {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(checks)) {
    if (!isId(id) || !v || typeof v !== 'object') continue;
    const c = v as Record<string, unknown>;
    out.checks[id] = { passed: bool(c.passed), correct: int(c.correct), total: int(c.total), at: int(c.at) };
  }
  out.seen = (Array.isArray(o.seen) ? o.seen : []).filter((x): x is string => isId(x));
  for (const m of Array.isArray(o.mind) ? o.mind : []) {
    const e = (m ?? {}) as Record<string, unknown>;
    if (isForm(e.form) && !out.mind.some((x) => x.form === e.form)) out.mind.push({ form: e.form, correct: int(e.correct), total: int(e.total), at: int(e.at) });
  }
  return out;
}

// ── Merging copies ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Two copies of one player's progress (this phone and the server's) made into one. Nothing earned is ever lost:
 * counts take the larger, wins, reads, Hard wins, skips and passed checks stay once achieved, games played are
 * the union of both histories, and the first score for each Mind Check form is kept. Merging is order-free and
 * merging a copy with itself changes nothing, so it can run as often as a sync does.
 */
export function mergeProgress(a: TournamentProgress, b: TournamentProgress): TournamentProgress {
  const matches: Record<string, MatchRecord> = { ...a.matches };
  for (const [id, r] of Object.entries(b.matches)) {
    const x = matches[id];
    matches[id] = x
      ? { wins: Math.max(x.wins, r.wins), losses: Math.max(x.losses, r.losses), draws: Math.max(x.draws, r.draws), won: x.won || r.won, read: x.read || r.read, hard: x.hard || r.hard, skipped: x.skipped || r.skipped, replay: x.replay || r.replay }
      : r;
  }
  const key = (h: HistoryEntry) => `${h.match}|${h.at}|${h.outcome}|${h.opp}`;
  const games = new Map<string, HistoryEntry>();
  for (const h of [...a.history, ...b.history]) games.set(key(h), h);
  const history = [...games.values()].sort((x, y) => x.at - y.at || key(x).localeCompare(key(y))).slice(-HISTORY_MAX);
  const checks: Record<string, CheckRecord> = { ...a.checks };
  for (const [id, c] of Object.entries(b.checks)) {
    const x = checks[id];
    checks[id] = x ? { passed: x.passed || c.passed, correct: Math.max(x.correct, c.correct), total: Math.max(x.total, c.total), at: Math.max(x.at, c.at) } : c;
  }
  const seen = [...new Set([...a.seen, ...b.seen])].sort();
  const mind = new Map<MindForm, MindEntry>();
  for (const m of [...a.mind, ...b.mind]) {
    const x = mind.get(m.form);
    if (!x || m.at < x.at) mind.set(m.form, m);
  }
  return { matches, history, checks, seen, mind: [...mind.values()].sort((x, y) => x.form.localeCompare(y.form)) };
}

/** Per-match counts across all players (published once a match has 200 players). */
export interface MatchStats {
  players: number;
  won: number;
  read: number;
}

/** "Only 9%" from the stats, rounded to a whole percent, or null when there are no published stats. */
export function share(n: number, of: number): number | null {
  return of > 0 ? Math.round((n / of) * 100) : null;
}

// ── Inner monologue ─────────────────────────────────────────────────────────────────────────────────────────────

/** Which of the three moments a game is at: before the first round, from halfway, and before the last round. */
export function thoughtMoment(played: number, total: number): 'start' | 'mid' | 'late' | null {
  if (total <= 0) return null;
  if (played === 0) return 'start';
  if (played >= total - 1) return 'late';
  if (played >= Math.floor(total / 2)) return 'mid';
  return null;
}
