import { EPSILON } from './rng.ts';

/**
 * A two-player game in normal form. `payoffs[r][c]` is `[rowPayoff, colPayoff]`
 * for the row player choosing `rows[r]` and the column player choosing `cols[c]`.
 */
export interface MatrixGame<R extends string = string, C extends string = string> {
  rows: readonly R[];
  cols: readonly C[];
  payoffs: readonly (readonly (readonly [number, number])[])[];
}

export type Cell<R extends string, C extends string> = { row: R; col: C };

export function payoffAt<R extends string, C extends string>(
  game: MatrixGame<R, C>,
  row: R,
  col: C,
): readonly [number, number] {
  const r = game.rows.indexOf(row);
  const c = game.cols.indexOf(col);
  if (r < 0 || c < 0) throw new Error(`Unknown action pair: ${row} / ${col}`);
  return game.payoffs[r][c];
}

/** Row player's best responses to a fixed column action. Ties return every tied action. */
export function rowBestResponses<R extends string, C extends string>(game: MatrixGame<R, C>, col: C): R[] {
  const c = game.cols.indexOf(col);
  const values = game.rows.map((_, r) => game.payoffs[r][c][0]);
  const best = Math.max(...values);
  return game.rows.filter((_, r) => Math.abs(values[r] - best) < EPSILON);
}

/** Column player's best responses to a fixed row action. */
export function colBestResponses<R extends string, C extends string>(game: MatrixGame<R, C>, row: R): C[] {
  const r = game.rows.indexOf(row);
  const values = game.cols.map((_, c) => game.payoffs[r][c][1]);
  const best = Math.max(...values);
  return game.cols.filter((_, c) => Math.abs(values[c] - best) < EPSILON);
}

export type Dominance<A extends string> =
  | { kind: 'strict'; action: A }
  | { kind: 'weak'; action: A }
  | { kind: 'none' };

function dominance<A extends string>(actions: readonly A[], payoffFor: (own: number, other: number) => number, otherCount: number): Dominance<A> {
  for (let a = 0; a < actions.length; a++) {
    let strict = true;
    let weak = true;
    let someStrict = false;
    for (let b = 0; b < actions.length; b++) {
      if (a === b) continue;
      for (let o = 0; o < otherCount; o++) {
        const diff = payoffFor(a, o) - payoffFor(b, o);
        if (diff <= EPSILON) strict = false;
        if (diff < -EPSILON) weak = false;
        if (diff > EPSILON) someStrict = true;
      }
    }
    if (strict) return { kind: 'strict', action: actions[a] };
    if (weak && someStrict) return { kind: 'weak', action: actions[a] };
  }
  return { kind: 'none' };
}

export function rowDominance<R extends string, C extends string>(game: MatrixGame<R, C>): Dominance<R> {
  return dominance(game.rows, (r, c) => game.payoffs[r][c][0], game.cols.length);
}

export function colDominance<R extends string, C extends string>(game: MatrixGame<R, C>): Dominance<C> {
  return dominance(game.cols, (c, r) => game.payoffs[r][c][1], game.rows.length);
}

/** All pure-strategy Nash equilibria: cells where each action is a best response to the other. */
export function pureNashEquilibria<R extends string, C extends string>(game: MatrixGame<R, C>): Cell<R, C>[] {
  const result: Cell<R, C>[] = [];
  for (const row of game.rows) {
    for (const col of game.cols) {
      if (rowBestResponses(game, col).includes(row) && colBestResponses(game, row).includes(col)) {
        result.push({ row, col });
      }
    }
  }
  return result;
}

export function isEquilibrium<R extends string, C extends string>(game: MatrixGame<R, C>, row: R, col: C): boolean {
  return pureNashEquilibria(game).some((e) => e.row === row && e.col === col);
}

/**
 * For display: `marks[r][c] = [rowIsBestReply, colIsBestReply]` — the classic "underline the best reply" method.
 * Cells with both marks are pure Nash equilibria.
 */
export function bestReplyMarks<R extends string, C extends string>(game: MatrixGame<R, C>): [boolean, boolean][][] {
  return game.rows.map((row, r) =>
    game.cols.map((col, c) => [rowBestResponses(game, col).includes(game.rows[r]), colBestResponses(game, row).includes(game.cols[c])]),
  );
}

export interface MixedEquilibrium<R extends string, C extends string> {
  /** Probability the row player plays `rows[0]` (the rest goes to `rows[1]`). */
  rowFirst: number;
  /** Probability the column player plays `cols[0]`. */
  colFirst: number;
  rows: readonly [R, R];
  cols: readonly [C, C];
  /** Expected [row, column] payoffs at the equilibrium. */
  payoffs: readonly [number, number];
}

/**
 * The fully mixed equilibrium of a 2×2 game, if one exists: each player mixes so the other is indifferent
 * between their two actions. Returns null for non-2×2 games, or when the indifference probabilities are not
 * strictly between 0 and 1 (e.g. a game with a dominant strategy, like the pricing game).
 */
export function mixedEquilibrium2x2<R extends string, C extends string>(game: MatrixGame<R, C>): MixedEquilibrium<R, C> | null {
  if (game.rows.length !== 2 || game.cols.length !== 2) return null;
  const a = (r: number, c: number) => game.payoffs[r][c][0];
  const b = (r: number, c: number) => game.payoffs[r][c][1];
  // Column player indifferent: x·b00 + (1−x)·b10 = x·b01 + (1−x)·b11.
  const xDen = b(0, 0) - b(1, 0) - b(0, 1) + b(1, 1);
  // Row player indifferent: y·a00 + (1−y)·a01 = y·a10 + (1−y)·a11.
  const yDen = a(0, 0) - a(0, 1) - a(1, 0) + a(1, 1);
  if (Math.abs(xDen) < EPSILON || Math.abs(yDen) < EPSILON) return null;
  const x = (b(1, 1) - b(1, 0)) / xDen;
  const y = (a(1, 1) - a(0, 1)) / yDen;
  if (x <= EPSILON || x >= 1 - EPSILON || y <= EPSILON || y >= 1 - EPSILON) return null;
  return {
    rowFirst: x,
    colFirst: y,
    rows: [game.rows[0], game.rows[1]],
    cols: [game.cols[0], game.cols[1]],
    payoffs: [y * a(0, 0) + (1 - y) * a(0, 1), x * b(0, 0) + (1 - x) * b(1, 0)],
  };
}

/** Map every payoff through a function — used to apply incentive changes without touching structure. */
export function mapPayoffs<R extends string, C extends string>(
  game: MatrixGame<R, C>,
  fn: (payoff: readonly [number, number], row: R, col: C) => readonly [number, number],
): MatrixGame<R, C> {
  return {
    rows: game.rows,
    cols: game.cols,
    payoffs: game.rows.map((row, r) => game.cols.map((col, c) => fn(game.payoffs[r][c], row, col))),
  };
}
