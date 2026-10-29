import { type ArenaEngine, type Debrief, LENGTH_ROUNDS, type Outcome, type Setup, draw } from './core.ts';

/**
 * The Gambit — race three pieces across a small board, choosing between sure steps and risky leaps and strikes.
 *
 * Board: COLS × ROWS. Your three pieces start on row 1 (columns 2–4) and move up; the opponent's start on the top row
 * and move down. A piece that reaches the far row is home: it leaves the board and scores.
 *
 * On your turn, move one piece:
 * - Step (certain): one square forward, or one square sideways, into an empty square.
 * - Dash (DASH_P): two squares straight forward over an empty square into an empty one. If it fails, the piece stays.
 * - Strike (STRIKE_P): attack an enemy piece diagonally in front. Success: the enemy is removed and you take its square.
 *   Failure: your piece is knocked back one square (if that square is free).
 * The opponent then moves the same way. Each move's luck is one seeded draw, made before anyone knows which move it
 * will be used for, so luck never depends on the choice — only the odds do.
 *
 * Win: first to bring HOME_TO_WIN pieces home, or leave the other side with no pieces in play and fewer home. At the
 * turn limit: more home wins, then more pieces in play, then more total progress; otherwise a draw.
 */

export const GAMBIT_PERSONAS = ['safe', 'gambler', 'positional', 'adaptive'] as const;
export type GambitPersona = (typeof GAMBIT_PERSONAS)[number];
export const GAMBIT_NAME: Record<GambitPersona, string> = { safe: 'The Safe Planner', gambler: 'The Aggressive Gambler', positional: 'The Positional Strategist', adaptive: 'The Adaptive Tactician' };

export type GambitVariant = 'standard';
export const GAMBIT_VARIANTS: readonly GambitVariant[] = ['standard'];
export const gambitRounds = LENGTH_ROUNDS(10, 14, 18);
export const COLS = 5;
export const ROWS = 6;
export const DASH_P = 0.5;
export const STRIKE_P = 0.55;
export const HOME_TO_WIN = 2;

export type Side = 'player' | 'bot';
export type MoveKind = 'step' | 'dash' | 'strike';
export interface Piece {
  side: Side;
  r: number;
  c: number;
}
export interface GMove {
  from: [number, number];
  to: [number, number];
  kind: MoveKind;
}
export interface GTurn {
  side: Side;
  move: GMove;
  success: boolean;
  /** Where the moving piece ended (null if it went home or was removed). */
  captured: boolean;
  home: boolean;
}
export interface Position {
  pieces: Piece[];
  home: { player: number; bot: number };
}
export interface GambitState extends Position {
  setup: Setup<GambitVariant, GambitPersona>;
  total: number;
  turns: GTurn[];
}

const dir = (side: Side) => (side === 'player' ? 1 : -1);
const farRow = (side: Side) => (side === 'player' ? ROWS - 1 : 0);
const at = (p: Position, r: number, c: number) => p.pieces.find((x) => x.r === r && x.c === c);
const onBoard = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
export const odds = (k: MoveKind) => (k === 'step' ? 1 : k === 'dash' ? DASH_P : STRIKE_P);
const other = (s: Side): Side => (s === 'player' ? 'bot' : 'player');

export function legalMoves(p: Position, side: Side): GMove[] {
  const out: GMove[] = [];
  const d = dir(side);
  for (const x of p.pieces) {
    if (x.side !== side) continue;
    const from: [number, number] = [x.r, x.c];
    for (const [dr, dc] of [
      [d, 0],
      [0, -1],
      [0, 1],
    ]) {
      const r = x.r + dr;
      const c = x.c + dc;
      if (onBoard(r, c) && !at(p, r, c)) out.push({ from, to: [r, c], kind: 'step' });
    }
    if (onBoard(x.r + 2 * d, x.c) && !at(p, x.r + d, x.c) && !at(p, x.r + 2 * d, x.c)) out.push({ from, to: [x.r + 2 * d, x.c], kind: 'dash' });
    for (const dc of [-1, 1]) {
      const e = at(p, x.r + d, x.c + dc);
      if (e && e.side !== side) out.push({ from, to: [e.r, e.c], kind: 'strike' });
    }
  }
  return out;
}

/** The position after `m` succeeds or fails. Pure. */
export function resolveMove(p: Position, side: Side, m: GMove, success: boolean): { pos: Position; captured: boolean; home: boolean } {
  const pieces = p.pieces.map((x) => ({ ...x }));
  const me = pieces.find((x) => x.side === side && x.r === m.from[0] && x.c === m.from[1])!;
  let captured = false;
  if (m.kind === 'strike') {
    if (success) {
      const i = pieces.findIndex((x) => x.r === m.to[0] && x.c === m.to[1] && x.side !== side);
      pieces.splice(i, 1);
      me.r = m.to[0];
      me.c = m.to[1];
      captured = true;
    } else {
      const br = me.r - dir(side);
      if (onBoard(br, me.c) && !pieces.some((x) => x.r === br && x.c === me.c)) me.r = br;
    }
  } else if (success) {
    me.r = m.to[0];
    me.c = m.to[1];
  }
  const home = { ...p.home };
  let wentHome = false;
  if (me.r === farRow(side)) {
    pieces.splice(pieces.indexOf(me), 1);
    home[side] += 1;
    wentHome = true;
  }
  return { pos: { pieces, home }, captured, home: wentHome };
}

const progress = (x: Piece) => (x.side === 'player' ? x.r : ROWS - 1 - x.r);

/**
 * Position value for `side`: pieces home (8 each), each piece's progress, minus the danger of pieces that an enemy can
 * strike next move (strike odds × what the piece is worth), and the mirror for the other side.
 */
export function evaluate(p: Position, side: Side): number {
  const value = (s: Side) => {
    let v = p.home[s] * 8;
    for (const x of p.pieces) {
      if (x.side !== s) continue;
      const worth = 2 + progress(x);
      v += worth;
      const ed = dir(other(s));
      const threatened = [-1, 1].some((dc) => {
        const e = at(p, x.r - ed, x.c + dc);
        return e && e.side !== s;
      });
      if (threatened) v -= STRIKE_P * worth;
    }
    if (p.home[s] >= HOME_TO_WIN) v += 100;
    return v;
  };
  return value(side) - value(other(side));
}

/** Expected value of a move for `side`, one ply, with a utility shaped by risk attitude. */
function score(p: Position, side: Side, m: GMove, risk: 'averse' | 'neutral' | 'seeking', depth: number): number {
  const pr = odds(m.kind);
  const win = resolveMove(p, side, m, true).pos;
  const lose = pr < 1 ? resolveMove(p, side, m, false).pos : win;
  const val = (q: Position) => (depth > 1 ? replyValue(q, side) : evaluate(q, side));
  const a = val(win);
  const b = val(lose);
  const mean = pr * a + (1 - pr) * b;
  if (risk === 'averse') return mean - 0.6 * Math.sqrt(pr * (1 - pr)) * Math.abs(a - b);
  if (risk === 'seeking') return mean + 0.5 * Math.sqrt(pr * (1 - pr)) * Math.abs(a - b) + (m.kind === 'step' ? 0 : 0.5);
  return mean;
}

/** The value for `side` after the other side's best (expected-value) reply. */
function replyValue(p: Position, side: Side): number {
  if (p.home.player >= HOME_TO_WIN || p.home.bot >= HOME_TO_WIN) return evaluate(p, side);
  const opp = other(side);
  const ms = legalMoves(p, opp);
  if (!ms.length) return evaluate(p, side);
  let worst = Infinity;
  for (const m of ms) {
    const pr = odds(m.kind);
    const v = pr * evaluate(resolveMove(p, opp, m, true).pos, side) + (1 - pr) * evaluate(resolveMove(p, opp, m, false).pos, side);
    if (v < worst) worst = v;
  }
  return worst;
}

/** How often the player has chosen a risky move (dash or strike) so far. */
export const playerRiskRate = (s: GambitState) => {
  const mine = s.turns.filter((t) => t.side === 'player');
  return mine.length ? mine.filter((t) => t.move.kind !== 'step').length / mine.length : 0.5;
};

/**
 * The bot's move: the legal move with the best utility under its risk attitude. Easy looks one move ahead and, 30 % of
 * turns (seeded), takes its second choice; Normal looks one move ahead; Hard also weighs your best reply.
 *
 * Safe Planner — risk-averse: an expected-value score with a penalty for variance, so a Step usually beats a gamble.
 * Aggressive Gambler — risk-seeking: rewards variance and prefers Dashes and Strikes when they are close.
 * Positional Strategist — risk-neutral expected value of the position (progress, pieces home, exposure to strikes).
 * Adaptive Tactician — chooses its attitude from the board and from you: seeking when it is behind (or you play
 *   risky and it must keep pace), averse when ahead, neutral otherwise.
 */
export function gambitBotMove(s: GambitState, u: number): GMove | null {
  const ms = legalMoves(s, 'bot');
  if (!ms.length) return null;
  const { persona, level } = s.setup;
  const depth = level === 'hard' ? 2 : 1;
  let risk: 'averse' | 'neutral' | 'seeking' = persona === 'safe' ? 'averse' : persona === 'gambler' ? 'seeking' : 'neutral';
  if (persona === 'adaptive') {
    const lead = evaluate(s, 'bot');
    risk = lead < -3 || (playerRiskRate(s) > 0.6 && lead < 2) ? 'seeking' : lead > 4 ? 'averse' : 'neutral';
  }
  const ranked = ms.map((m) => ({ m, v: score(s, 'bot', m, risk, depth) })).sort((a, b) => b.v - a.v);
  if (level === 'easy' && ranked.length > 1 && u < 0.3) return ranked[1].m;
  return ranked[0].m;
}

const gameOver = (s: Position) => s.home.player >= HOME_TO_WIN || s.home.bot >= HOME_TO_WIN || !s.pieces.some((x) => x.side === 'player') || !s.pieces.some((x) => x.side === 'bot');
const isOver = (s: GambitState) => gameOver(s) || s.turns.filter((t) => t.side === 'player').length >= s.total;

const same = (a: GMove, b: { from: [number, number]; to: [number, number] }) => a.from[0] === b.from[0] && a.from[1] === b.from[1] && a.to[0] === b.to[0] && a.to[1] === b.to[1];

function validate(s: GambitState, a: { from: [number, number]; to: [number, number] }): string | null {
  if (isOver(s)) return 'The game is over.';
  if (!a || !Array.isArray(a.from) || !Array.isArray(a.to)) return 'Move one of your pieces.';
  const piece = at(s, a.from[0], a.from[1]);
  if (!piece || piece.side !== 'player') return 'Choose one of your pieces.';
  return legalMoves(s, 'player').some((m) => same(m, a)) ? null : 'That piece can’t move there.';
}

function apply(s: GambitState, a: { from: [number, number]; to: [number, number] }): GambitState {
  const why = validate(s, a);
  if (why) throw new Error(`gambit: ${why}`);
  const n = s.turns.length;
  const m = legalMoves(s, 'player').find((x) => same(x, a))!;
  const ok = draw(s.setup.seed, n, 0) < odds(m.kind);
  const r = resolveMove(s, 'player', m, ok);
  let next: GambitState = { ...s, ...r.pos, turns: [...s.turns, { side: 'player', move: m, success: ok, captured: r.captured, home: r.home }] };
  if (gameOver(next)) return next;
  const bm = gambitBotMove(next, draw(s.setup.seed, n + 1, 2));
  if (!bm) return next;
  const bok = draw(s.setup.seed, n + 1, 0) < odds(bm.kind);
  const br = resolveMove(next, 'bot', bm, bok);
  next = { ...next, ...br.pos, turns: [...next.turns, { side: 'bot', move: bm, success: bok, captured: br.captured, home: br.home }] };
  return next;
}

export function gambitOutcome(s: GambitState): Outcome {
  if (s.home.player >= HOME_TO_WIN) return 'win';
  if (s.home.bot >= HOME_TO_WIN) return 'loss';
  const mine = s.pieces.filter((x) => x.side === 'player');
  const theirs = s.pieces.filter((x) => x.side === 'bot');
  if (!theirs.length && s.home.player >= s.home.bot) return mine.length || s.home.player > s.home.bot ? 'win' : 'draw';
  if (!mine.length && s.home.bot >= s.home.player) return 'loss';
  if (s.home.player !== s.home.bot) return s.home.player > s.home.bot ? 'win' : 'loss';
  if (mine.length !== theirs.length) return mine.length > theirs.length ? 'win' : 'loss';
  const prog = (xs: Piece[]) => xs.reduce((t, x) => t + progress(x), 0);
  return prog(mine) > prog(theirs) ? 'win' : prog(mine) < prog(theirs) ? 'loss' : 'draw';
}

export const square = (r: number, c: number) => `${'ABCDE'[c]}${r + 1}`;

function gambitDebrief(s: GambitState): Debrief {
  const t = s.turns.map((x, i) => ({ x, i, turn: Math.floor(i / 2) + 1 }));
  const moments: { at: number; text: string }[] = [];
  const mine = t.filter(({ x }) => x.side === 'player');
  const lucky = mine.find(({ x }) => x.move.kind !== 'step' && x.success && x.captured);
  const unlucky = mine.find(({ x }) => x.move.kind !== 'step' && !x.success);
  if (lucky) moments.push({ at: lucky.i, text: `Turn ${lucky.turn}: your strike from ${square(...lucky.x.move.from)} landed (${Math.round(STRIKE_P * 100)}% odds) and took a piece.` });
  if (unlucky) moments.push({ at: unlucky.i, text: `Turn ${unlucky.turn}: your ${unlucky.x.move.kind} from ${square(...unlucky.x.move.from)} failed — a ${Math.round(odds(unlucky.x.move.kind) * 100)}% move doesn’t fail often, but it does.` });
  const theirCap = t.find(({ x }) => x.side === 'bot' && x.captured);
  if (theirCap && moments.length < 3) moments.push({ at: theirCap.i, text: `Turn ${theirCap.turn}: it struck your piece on ${square(...theirCap.x.move.to)}.` });
  const homeRun = mine.find(({ x }) => x.home);
  if (homeRun && moments.length < 3) moments.push({ at: homeRun.i, text: `Turn ${homeRun.turn}: you brought a piece home.` });
  if (!moments.length) moments.push({ at: 0, text: `${s.home.player} home for you, ${s.home.bot} for it.` });
  const risky = mine.filter(({ x }) => x.move.kind !== 'step');
  const wins = risky.filter(({ x }) => x.success).length;
  const insight = `Judge a move by its odds, not by how it turned out: you took ${risky.length} risky moves and ${wins} came off. A ${Math.round(DASH_P * 100)}% dash that fails was still right if the position it aimed for was worth the risk — and a lucky strike from a bad position was still a gamble.`;
  const theirs = t.filter(({ x }) => x.side === 'bot');
  const theirRisky = theirs.filter(({ x }) => x.move.kind !== 'step');
  const ex = theirRisky[0] ? ` On turn ${theirRisky[0].turn} it chose a ${theirRisky[0].x.move.kind} from ${square(...theirRisky[0].x.move.from)}.` : theirs[0] ? ` It stepped every time.` : '';
  const style: Record<GambitPersona, string> = {
    safe: 'took sure steps and gambled only when the gain was large',
    gambler: 'reached for dashes and strikes whenever they were close',
    positional: 'chose the move that left the best position on average, guarding exposed pieces',
    adaptive: 'took more risks when behind and played safe when ahead',
  };
  const o = gambitOutcome(s);
  return {
    headline: o === 'win' ? 'Gambit won' : o === 'loss' ? 'Outmanoeuvred' : 'Stalemate',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${GAMBIT_NAME[s.setup.persona]} ${style[s.setup.persona]}: ${theirRisky.length} of its ${theirs.length} moves were risky.${ex} A short match shows a tendency, not a fixed trait.`,
  };
}

const startPieces = (): Piece[] => [1, 2, 3].flatMap((c) => [
  { side: 'player' as Side, r: 0, c },
  { side: 'bot' as Side, r: ROWS - 1, c },
]);

export const gambit: ArenaEngine<GambitState, { from: [number, number]; to: [number, number] }, GambitVariant> = {
  id: 'gambit',
  opponents: GAMBIT_PERSONAS,
  variants: GAMBIT_VARIANTS,
  rounds: gambitRounds,
  endsEarly: true,
  create: (setup) => ({ setup: setup as Setup<GambitVariant, GambitPersona>, total: gambitRounds(setup.length), pieces: startPieces(), home: { player: 0, bot: 0 }, turns: [] }),
  validate,
  apply,
  isOver,
  played: (s) => s.turns.filter((t) => t.side === 'player').length,
  result(s) {
    const o = gambitOutcome(s);
    return {
      outcome: o,
      par: null,
      note: !gameOver(s) ? 'Turn limit reached: pieces home, then pieces in play, then progress.' : null,
      player: s.home.player,
      rival: s.home.bot,
      standings: [
        { id: 'you', name: 'You', score: s.home.player, isPlayer: true },
        { id: s.setup.persona, name: GAMBIT_NAME[s.setup.persona], score: s.home.bot, isPlayer: false },
      ].sort((a, b) => b.score - a.score),
      unit: 'home',
    };
  },
  debrief: gambitDebrief,
  moves(s) {
    if (isOver(s)) return [];
    const ms = legalMoves(s, 'player');
    const pick = (k: MoveKind) => ms.find((m) => m.kind === k);
    return [pick('strike'), pick('dash'), ms.find((m) => m.kind === 'step' && m.to[0] > m.from[0]), ms[0]].filter((m): m is GMove => !!m).map((m) => ({ from: m.from, to: m.to }));
  },
};
