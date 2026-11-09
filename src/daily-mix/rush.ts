import { createRng, type Rng } from '../game/rng.ts';

/**
 * Read Rush: quick one-tap strategy reads against the clock. The questions are generated from the date's seed, so
 * everyone gets the same set on the same day and nobody has to write them. Each kind has exactly one right answer,
 * checked by construction (and by tests):
 *
 * - next       A bot's pattern (a cycle, a copycat, a counter-puncher): what does it play next, or what beats it?
 * - never      A payoff table with exactly one strictly dominated move: which move should you never play?
 * - reply      They will play a known column: which of your moves scores most?
 * - stable     A 2×2 game with exactly one pure Nash equilibrium: which cell would nobody leave?
 * - odds       A sure amount against a gamble: which pays more on average?
 * - guess      Two-thirds of the average when everyone else guesses N: what should you guess?
 */

export type RushKind = 'next' | 'never' | 'reply' | 'stable' | 'odds' | 'guess';

export interface RushQuestion {
  id: string;
  kind: RushKind;
  prompt: string;
  /** Optional payoff table: rows are your moves; each cell is [yours] or [yours, theirs]. */
  table?: { rows: string[]; cols: string[]; cells: number[][][] };
  /** A sequence shown as chips (the bot's moves). */
  sequence?: string[];
  options: string[];
  answer: number;
  /** One line on why, shown after a wrong answer. */
  why: string;
}

export const RUSH_SECONDS = 180;
export const RUSH_SIZE = 40;

const RPS = ['Rock', 'Paper', 'Scissors'] as const;
const beats = (m: number) => (m + 1) % 3; // Paper beats Rock, Scissors beats Paper, Rock beats Scissors.
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Options shuffled, with the right one's new index. */
function withAnswer(rng: Rng, right: string, wrong: string[]): { options: string[]; answer: number } {
  const options = shuffle(rng, [right, ...wrong.filter((w) => w !== right)]);
  return { options, answer: options.indexOf(right) };
}

function next(rng: Rng, id: string): RushQuestion {
  const style = int(rng, 0, 2);
  if (style === 0) {
    const cycle = shuffle(rng, [0, 1, 2]).slice(0, int(rng, 2, 3));
    const len = cycle.length * 2 + int(rng, 0, cycle.length - 1);
    const seq = Array.from({ length: len }, (_, i) => cycle[i % cycle.length]);
    const coming = cycle[len % cycle.length];
    const counter = rng() < 0.5;
    const right = counter ? RPS[beats(coming)] : RPS[coming];
    return {
      id, kind: 'next', sequence: seq.map((m) => RPS[m]),
      prompt: counter ? 'The bot repeats a pattern. What should you throw to beat its next move?' : 'The bot repeats a pattern. What does it throw next?',
      ...withAnswer(rng, right, [...RPS]),
      why: `Its cycle is ${cycle.map((m) => RPS[m]).join(' → ')}, so next comes ${RPS[coming]}${counter ? `, and ${RPS[beats(coming)]} beats it` : ''}.`,
    };
  }
  const yours = int(rng, 0, 2);
  if (style === 1) {
    return {
      id, kind: 'next', prompt: `This bot copies your last throw. You just threw ${RPS[yours]}. What beats its next throw?`,
      ...withAnswer(rng, RPS[beats(yours)], [...RPS]),
      why: `It will throw ${RPS[yours]}, and ${RPS[beats(yours)]} beats ${RPS[yours]}.`,
    };
  }
  const its = beats(yours);
  return {
    id, kind: 'next', prompt: `This bot always throws what would have beaten your last throw. You just threw ${RPS[yours]}. What should you throw now?`,
    ...withAnswer(rng, RPS[beats(its)], [...RPS]),
    why: `It expects you to repeat, so it throws ${RPS[its]}. ${RPS[beats(its)]} beats that.`,
  };
}

const dominates = (a: number[], b: number[]) => a.every((x, i) => x > b[i]);

function never(rng: Rng, id: string): RushQuestion {
  for (;;) {
    const rows = [0, 1, 2].map(() => [int(rng, 0, 9), int(rng, 0, 9)]);
    const dominated = rows.map((r, i) => rows.some((o, j) => j !== i && dominates(o, r)));
    if (dominated.filter(Boolean).length !== 1) continue;
    const bad = dominated.indexOf(true);
    const by = rows.findIndex((o, j) => j !== bad && dominates(o, rows[bad]));
    const names = ['Top', 'Middle', 'Bottom'];
    return {
      id, kind: 'never', prompt: 'Your points for each move, against each of theirs. Which move should you never play?',
      table: { rows: names, cols: ['Left', 'Right'], cells: rows.map((r) => r.map((x) => [x])) },
      options: names, answer: bad,
      why: `${names[by]} scores more than ${names[bad]} whatever they do (${rows[by].join(' and ')} against ${rows[bad].join(' and ')}).`,
    };
  }
}

function reply(rng: Rng, id: string): RushQuestion {
  for (;;) {
    const rows = [0, 1, 2].map(() => [int(rng, 0, 9), int(rng, 0, 9)]);
    const col = int(rng, 0, 1);
    const vals = rows.map((r) => r[col]);
    const best = Math.max(...vals);
    if (vals.filter((v) => v === best).length !== 1) continue;
    // Not a dominance question in disguise: the best reply to one column isn't best against the other too.
    const other = rows.map((r) => r[1 - col]);
    if (other.indexOf(Math.max(...other)) === vals.indexOf(best)) continue;
    const names = ['Top', 'Middle', 'Bottom'];
    const cols = ['Left', 'Right'];
    return {
      id, kind: 'reply', prompt: `You know they will play ${cols[col]}. Which move scores you the most?`,
      table: { rows: names, cols, cells: rows.map((r) => r.map((x) => [x])) },
      options: names, answer: vals.indexOf(best),
      why: `Against ${cols[col]}: ${names.map((n, i) => `${n} ${vals[i]}`).join(', ')}.`,
    };
  }
}

function stable(rng: Rng, id: string): RushQuestion {
  for (;;) {
    const cells = [0, 1].map(() => [0, 1].map(() => [int(rng, 0, 9), int(rng, 0, 9)]));
    const ne: [number, number][] = [];
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 2; c++) {
        const mineBest = cells[r][c][0] > cells[1 - r][c][0];
        const theirsBest = cells[r][c][1] > cells[r][1 - c][1];
        if (mineBest && theirsBest) ne.push([r, c]);
      }
    if (ne.length !== 1) continue;
    const labels = ['Top · Left', 'Top · Right', 'Bottom · Left', 'Bottom · Right'];
    const [r, c] = ne[0];
    const k = r * 2 + c;
    return {
      id, kind: 'stable', prompt: 'Each cell shows (your points, their points). Which outcome would neither of you want to leave on your own?',
      table: { rows: ['Top', 'Bottom'], cols: ['Left', 'Right'], cells },
      options: labels, answer: k,
      why: `At ${labels[k]}, switching row costs you (${cells[r][c][0]} vs ${cells[1 - r][c][0]}) and switching column costs them (${cells[r][c][1]} vs ${cells[r][1 - c][1]}).`,
    };
  }
}

function odds(rng: Rng, id: string): RushQuestion {
  for (;;) {
    const sure = int(rng, 3, 12) * 10;
    const p = pick(rng, [10, 20, 25, 30, 40, 50, 60, 75, 80, 90]);
    const prize = int(rng, 2, 30) * 10;
    const ev = (p / 100) * prize;
    if (Math.abs(ev - sure) < Math.max(10, sure * 0.15)) continue;
    const a = `${sure} for sure`;
    const b = `${p}% chance of ${prize}`;
    return {
      id, kind: 'odds', prompt: 'Which pays more on average?', options: [a, b], answer: ev > sure ? 1 : 0,
      why: `${p}% of ${prize} is ${Number.isInteger(ev) ? ev : ev.toFixed(1)} on average, against ${sure} for sure.`,
    };
  }
}

function guess(rng: Rng, id: string): RushQuestion {
  const n = pick(rng, [15, 21, 24, 27, 30, 33, 36, 42, 45, 48, 60, 75, 90]);
  const right = Math.round((2 * n) / 3);
  const wrong = [n, Math.round(n / 3), Math.round(n / 2), Math.min(100, Math.round((4 * n) / 3))].filter((x) => x !== right);
  const opts = withAnswer(rng, String(right), Array.from(new Set(wrong.map(String))).slice(0, 3));
  return {
    id, kind: 'guess', prompt: `A big crowd guesses, and nearly everyone picks ${n}. The winner is closest to two-thirds of the average. Your best guess?`,
    ...opts,
    why: `With almost everyone at ${n}, the average is about ${n}; two-thirds of it is ${right}.`,
  };
}

const MAKERS: Record<RushKind, (rng: Rng, id: string) => RushQuestion> = { next, never, reply, stable, odds, guess };
const ORDER: RushKind[] = ['next', 'odds', 'never', 'guess', 'reply', 'next', 'stable', 'odds', 'reply', 'never'];

/** The day's questions, the same for everyone: `seed` is the day number. */
export function rushSet(seed: number, size = RUSH_SIZE): RushQuestion[] {
  const rng = createRng((seed * 2654435761) >>> 0);
  const order = shuffle(rng, ORDER);
  return Array.from({ length: size }, (_, i) => MAKERS[order[i % order.length]](rng, `${seed}-${i}`));
}

/** A run's score: right answers; and a short label for the result. */
export function rushRating(correct: number): string {
  if (correct >= 20) return 'Lightning reader';
  if (correct >= 14) return 'Sharp';
  if (correct >= 8) return 'Steady';
  return 'Warming up';
}
