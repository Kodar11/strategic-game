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
