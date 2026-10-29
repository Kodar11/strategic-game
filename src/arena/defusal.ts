import { type ArenaEngine, type Debrief, type Level, type MatchLength, type Setup, draw, shuffled } from './core.ts';

/**
 * The Defusal — you and a bot teammate cut wires on a bomb. Two wires are live. Each of you holds private clues.
 *
 * Setup (from the seed): WIRES(length) numbered wires; exactly two are live. Every true clue of six kinds is generated
 * (a wire is safe; exactly one of two wires is live; two wires are both safe; how many live wires are in a span;
 * whether the live wires are both odd, both even or one of each; whether they are next to each other). You and your
 * teammate each get CLUES(level) different clues, privately — your clues and its clues never overlap.
 *
 * Turns alternate, starting with yours:
 * - Your turn: your teammate shares one of its clues (its choice — its style), then you cut a wire.
 * - Its turn: you share one of your clues (or none when you have none left), then it cuts — or holds, if it isn't sure,
 *   which spends a turn of the fuse.
 * Cutting a live wire sets the bomb off. So does running out of fuse (safe wires + 3 turns).
 * Cut every safe wire to defuse it.
 *
 * Score (team): defused = 10 + 1 per fuse turn left; exploded = 0. A shared result: there is no winner
 * between you and your teammate.
 *
 * Difficulty is the puzzle, not a stronger opponent — there is none: Easy deals 4 clues each, Normal 3, Hard 2. Your
 * teammate reasons the same way on every level. It never sees your unshared clues or which wires are live.
 */

export const DEFUSAL_PERSONAS = ['methodical', 'cautious', 'bold', 'sharer'] as const;
export type DefusalPersona = (typeof DEFUSAL_PERSONAS)[number];
export const DEFUSAL_NAME: Record<DefusalPersona, string> = { methodical: 'The Methodical Analyst', cautious: 'The Cautious Checker', bold: 'The Bold Solver', sharer: 'The Information Sharer' };

export type DefusalVariant = 'standard';
export const DEFUSAL_VARIANTS: readonly DefusalVariant[] = ['standard'];
export const WIRES = (length: MatchLength) => (length === 'short' ? 5 : length === 'long' ? 7 : 6);
export const CLUES = (level: Level) => (level === 'easy' ? 4 : level === 'normal' ? 3 : 2);
export const LIVE = 2;
export const MAX_STRIKES = 1;
export const fuseOf = (wires: number) => wires - LIVE + 3;
export const defusalRounds = (length: MatchLength) => fuseOf(WIRES(length));
export const WIRE_COLORS = ['Red', 'Blue', 'Yellow', 'Green', 'White', 'Black', 'Orange'] as const;

export type Clue =
  | { kind: 'safe'; a: number }
  | { kind: 'one-of'; a: number; b: number }
  | { kind: 'both-safe'; a: number; b: number }
  | { kind: 'count'; from: number; to: number; k: number }
  | { kind: 'parity'; p: 'odd' | 'even' | 'mixed' }
  | { kind: 'adjacent'; yes: boolean };

/** A live set: two wire indices, ascending. */
export type Live = [number, number];

export function holds(c: Clue, l: Live): boolean {
  const live = (i: number) => l[0] === i || l[1] === i;
  switch (c.kind) {
    case 'safe':
      return !live(c.a);
    case 'one-of':
      return live(c.a) !== live(c.b);
    case 'both-safe':
      return !live(c.a) && !live(c.b);
    case 'count':
      return l.filter((i) => i >= c.from && i <= c.to).length === c.k;
    case 'parity': {
      // Wires are shown 1-based, so index 0 is wire 1 (odd).
      const odd = l.filter((i) => i % 2 === 0).length;
      return c.p === 'odd' ? odd === 2 : c.p === 'even' ? odd === 0 : odd === 1;
    }
    case 'adjacent':
      return (l[1] - l[0] === 1) === c.yes;
  }
}

export function clueText(c: Clue): string {
  const w = (i: number) => `${i + 1}`;
  switch (c.kind) {
    case 'safe':
      return `Wire ${w(c.a)} is safe.`;
    case 'one-of':
      return `Exactly one of wires ${w(c.a)} and ${w(c.b)} is live.`;
    case 'both-safe':
      return `Wires ${w(c.a)} and ${w(c.b)} are both safe.`;
    case 'count':
      return c.k === 0 ? `No live wires among ${w(c.from)}–${w(c.to)}.` : `${c.k === 1 ? 'Exactly one live wire' : 'Both live wires are'} among ${w(c.from)}–${w(c.to)}.`;
    case 'parity':
      return c.p === 'mixed' ? 'One live wire is odd-numbered, the other even.' : `Both live wires are ${c.p}-numbered.`;
    case 'adjacent':
      return c.yes ? 'The live wires are next to each other.' : 'The live wires are not next to each other.';
  }
}

export function allLive(n: number): Live[] {
  const out: Live[] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) out.push([a, b]);
  return out;
}

/** Every true clue about `live` on n wires. */
export function trueClues(n: number, live: Live): Clue[] {
  const out: Clue[] = [];
  for (let a = 0; a < n; a++) out.push({ kind: 'safe', a });
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      out.push({ kind: 'one-of', a, b });
      out.push({ kind: 'both-safe', a, b });
    }
  for (let from = 0; from < n; from++) for (let to = from + 2; to < n; to++) for (let k = 0; k <= 2; k++) out.push({ kind: 'count', from, to, k });
  for (const p of ['odd', 'even', 'mixed'] as const) out.push({ kind: 'parity', p });
  out.push({ kind: 'adjacent', yes: true }, { kind: 'adjacent', yes: false });
  return out.filter((c) => holds(c, live));
}

export interface Cut {
  by: 'player' | 'bot';
  wire: number;
  live: boolean;
}

export interface DefusalTurn {
  /** Who acts this turn (cuts). */
  cutter: 'player' | 'bot';
  /** The clue shared at the start of this turn (index into the sharer's hand), or null. */
  shared: number | null;
  /** The wire cut, or null if the teammate held. */
  cut: number | null;
  live: boolean | null;
}

export interface DefusalState {
  setup: Setup<DefusalVariant, DefusalPersona>;
  wires: number;
  live: Live;
  hands: { player: Clue[]; bot: Clue[] };
  turns: DefusalTurn[];
}

const isLive = (s: DefusalState, i: number) => s.live[0] === i || s.live[1] === i;
const cutWires = (s: DefusalState) => s.turns.filter((t) => t.cut !== null).map((t) => ({ wire: t.cut!, live: t.live! }));
export const strikes = (s: DefusalState) => s.turns.filter((t) => t.live === true).length;
export const safeLeft = (s: DefusalState) => s.wires - LIVE - s.turns.filter((t) => t.live === false).length;
export const fuseLeft = (s: DefusalState) => fuseOf(s.wires) - s.turns.length;
export const defused = (s: DefusalState) => safeLeft(s) === 0 && strikes(s) < MAX_STRIKES;
export const exploded = (s: DefusalState) => strikes(s) >= MAX_STRIKES || (!defused(s) && fuseLeft(s) <= 0);
export const playerCuts = (n: number) => n % 2 === 0;

/** Clues shared so far: [from the bot, from the player]. */
export function sharedClues(s: DefusalState): { bot: number[]; player: number[] } {
  const bot: number[] = [];
  const player: number[] = [];
  s.turns.forEach((t, i) => {
    if (t.shared === null) return;
    (playerCuts(i) ? bot : player).push(t.shared);
  });
  return { bot, player };
}

/** Live sets consistent with clues and cut results. */
export function consistent(s: DefusalState, clues: readonly Clue[]): Live[] {
  const cuts = cutWires(s);
  return allLive(s.wires).filter((l) => clues.every((c) => holds(c, l)) && cuts.every((c) => (l[0] === c.wire || l[1] === c.wire) === c.live));
}

/** P(wire is safe) for each uncut wire, from a set of consistent live sets (uniform). Cut wires: null. */
export function safety(s: DefusalState, sets: readonly Live[]): (number | null)[] {
  const done = new Set(cutWires(s).map((c) => c.wire));
  return Array.from({ length: s.wires }, (_, i) => (done.has(i) ? null : sets.length ? sets.filter((l) => l[0] !== i && l[1] !== i).length / sets.length : 0));
}

/** What the bot knows: its own clues and the clues you shared. */
const botKnows = (s: DefusalState, extra: number | null = null) => {
  const sh = sharedClues(s).player;
  const mine = [...sh, ...(extra !== null ? [extra] : [])].map((k) => s.hands.player[k]);
  return [...s.hands.bot, ...mine];
};
/** What everyone knows: shared clues only. */
const publicClues = (s: DefusalState) => {
  const sh = sharedClues(s);
  return [...sh.bot.map((k) => s.hands.bot[k]), ...sh.player.map((k) => s.hands.player[k])];
};

const STRENGTH: Record<Clue['kind'], number> = { count: 0, 'one-of': 1, 'both-safe': 2, safe: 3, parity: 4, adjacent: 5 };

/**
 * Which of its unshared clues the teammate shares.
 * Methodical Analyst — walks through its hand in a fixed order: span counts, then pairs, then single wires, then the rest.
 * Cautious Checker — the most certain kind first: a single safe wire, then a safe pair, then the rest.
 * Bold Solver — any unshared clue (seeded): it trusts you to make sense of it.
 * Information Sharer — the clue that rules out the most live sets from what is already public.
 */
export function botShare(s: DefusalState, n: number): number | null {
  const shared = new Set(sharedClues(s).bot);
  const options = s.hands.bot.map((c, k) => ({ c, k })).filter(({ k }) => !shared.has(k));
  if (!options.length) return null;
  const p = s.setup.persona;
  if (p === 'methodical') return [...options].sort((a, b) => STRENGTH[a.c.kind] - STRENGTH[b.c.kind] || a.k - b.k)[0].k;
  if (p === 'cautious') {
    const rank = (c: Clue) => (c.kind === 'safe' ? 0 : c.kind === 'both-safe' ? 1 : 2 + STRENGTH[c.kind]);
    return [...options].sort((a, b) => rank(a.c) - rank(b.c) || a.k - b.k)[0].k;
  }
  if (p === 'bold') return options[Math.floor(draw(s.setup.seed, n, 50) * options.length)].k;
  const pub = publicClues(s);
  const before = consistent(s, pub).length;
  return [...options].sort((a, b) => before - consistent(s, [...pub, b.c]).length - (before - consistent(s, [...pub, a.c]).length) || a.k - b.k)[0].k;
}

/**
 * The teammate's cut (null: it holds).
 * Methodical Analyst — the uncut wire most likely safe given everything it knows; lowest number on a tie.
 * Cautious Checker — only a wire it knows is safe; otherwise it holds, unless the fuse can't spare a turn.
 * Bold Solver — decides from its own clues only (it doesn't wait on yours), cutting the likeliest-safe wire at once.
 * Information Sharer — if a clue you shared names a safe wire, it cuts that one (it acts on your information); otherwise
 *   like the Methodical Analyst.
 */
export function botCut(s: DefusalState, shared: number | null): number | null {
  const p = s.setup.persona;
  const known = p === 'bold' ? s.hands.bot : botKnows(s, shared);
  const sets = consistent(s, known);
  const safe = safety(s, sets);
  const best = () => {
    let b = -1;
    safe.forEach((x, i) => {
      if (x !== null && (b < 0 || x > safe[b]!)) b = i;
    });
    return b;
  };
  if (p === 'cautious') {
    const sure = safe.findIndex((x) => x === 1);
    if (sure >= 0) return sure;
    return fuseLeft(s) - 1 < safeLeft(s) ? best() : null;
  }
  if (p === 'sharer') {
    const yours = [...sharedClues(s).player, ...(shared !== null ? [shared] : [])].map((k) => s.hands.player[k]);
    for (const c of yours) {
      const named = c.kind === 'safe' ? [c.a] : c.kind === 'both-safe' ? [c.a, c.b] : [];
      const target = named.find((i) => safe[i] !== null);
      if (target !== undefined) return target;
    }
  }
  return best();
}

export type DefusalAction = { kind: 'cut'; wire: number } | { kind: 'share'; clue: number | null };

export type DefusalPrompt = { phase: 'cut'; turn: number; shared: number | null } | { phase: 'share'; turn: number; options: number[] };

export function defusalPrompt(s: DefusalState): DefusalPrompt | null {
  if (defused(s) || exploded(s)) return null;
  const n = s.turns.length;
  if (playerCuts(n)) return { phase: 'cut', turn: n + 1, shared: botShare(s, n) };
  const shared = new Set(sharedClues(s).player);
  return { phase: 'share', turn: n + 1, options: s.hands.player.map((_, k) => k).filter((k) => !shared.has(k)) };
}

function validate(s: DefusalState, a: DefusalAction): string | null {
  const p = defusalPrompt(s);
  if (!p) return 'The mission is over.';
  if (!a || typeof a !== 'object') return 'Choose an action.';
  if (p.phase === 'cut') {
    if (a.kind !== 'cut') return 'It’s your turn to cut a wire.';
    if (!Number.isInteger(a.wire) || a.wire < 0 || a.wire >= s.wires) return 'Choose a wire on the board.';
    if (cutWires(s).some((c) => c.wire === a.wire)) return 'That wire is already cut.';
    return null;
  }
  if (a.kind !== 'share') return 'Share a clue with your teammate first.';
  if (a.clue === null) return p.options.length ? 'Share one of your clues — you still have some.' : null;
  return p.options.includes(a.clue) ? null : 'Share a clue you haven’t shared yet.';
}

function apply(s: DefusalState, a: DefusalAction): DefusalState {
  const why = validate(s, a);
  if (why) throw new Error(`defusal: ${why}`);
  const n = s.turns.length;
  if (a.kind === 'cut') {
    const shared = botShare(s, n);
    return { ...s, turns: [...s.turns, { cutter: 'player', shared, cut: a.wire, live: isLive(s, a.wire) }] };
  }
  const cut = botCut(s, a.clue);
  return { ...s, turns: [...s.turns, { cutter: 'bot', shared: a.clue, cut, live: cut === null ? null : isLive(s, cut) }] };
}

export const defusalScore = (s: DefusalState) => (defused(s) ? 10 + fuseLeft(s) : 0);

function defusalDebrief(s: DefusalState): Debrief {
  const t = s.turns.map((x, i) => ({ x, i }));
  const moments: { at: number; text: string }[] = [];
  const wire = (i: number) => `wire ${i + 1}`;
  const strike = t.find(({ x }) => x.live);
  if (strike) {
    const sets = consistent({ ...s, turns: s.turns.slice(0, strike.i) }, strike.x.cutter === 'player' ? [...s.hands.player, ...sharedClues({ ...s, turns: s.turns.slice(0, strike.i + 1) }).bot.map((k) => s.hands.bot[k])] : botKnows({ ...s, turns: s.turns.slice(0, strike.i) }, strike.x.shared));
    const sf = safety({ ...s, turns: s.turns.slice(0, strike.i) }, sets)[strike.x.cut!];
    moments.push({ at: strike.i, text: `Turn ${strike.i + 1}: ${strike.x.cutter === 'player' ? 'you' : 'your teammate'} cut ${wire(strike.x.cut!)} — live. From what ${strike.x.cutter === 'player' ? 'you' : 'it'} knew, it was ${Math.round((sf ?? 0) * 100)}% likely safe.` });
  }
  const hold = t.find(({ x }) => x.cutter === 'bot' && x.cut === null);
  if (hold) moments.push({ at: hold.i, text: `Turn ${hold.i + 1}: your teammate held instead of cutting — it wasn’t sure of any wire, and the fuse burned a turn.` });
  const yourShare = t.find(({ x }) => x.cutter === 'bot' && x.shared !== null);
  if (yourShare && moments.length < 2) moments.push({ at: yourShare.i, text: `Turn ${yourShare.i + 1}: you shared “${clueText(s.hands.player[yourShare.x.shared!])}” and your teammate cut ${yourShare.x.cut === null ? 'nothing' : `${wire(yourShare.x.cut)}${yourShare.x.live ? ' (live)' : ' (safe)'}`}.` });
  moments.push({ at: 99, text: defused(s) ? `Defused with ${fuseLeft(s)} turn${fuseLeft(s) === 1 ? '' : 's'} of fuse left.` : `The bomb went off: the live wires were ${wire(s.live[0])} and ${wire(s.live[1])}.` });
  const insight =
    strike && !defused(s)
      ? 'Neither hand was enough alone: the answer was in the overlap of your clues and your teammate’s. Before a cut, count the arrangements both of you still allow — a wire that is “probably safe” in one head can be certainly live once the clues are combined.'
      : 'Check assumptions before acting: each shared clue removes possibilities for both of you. The best clue to share is the one that rules out the most for your partner, not the one that feels most certain to you.';
  const sh = sharedClues(s).bot.map((k) => s.hands.bot[k]);
  const botCuts = t.filter(({ x }) => x.cutter === 'bot');
  const holds = botCuts.filter(({ x }) => x.cut === null).length;
  const style: Record<DefusalPersona, string> = {
    methodical: 'worked through its clues in order and always cut the likeliest-safe wire',
    cautious: 'shared its surest clues and cut only wires it knew were safe',
    bold: 'shared freely and cut on its own read without waiting for yours',
    sharer: 'shared the clue that helped you most and acted on what you told it',
  };
  return {
    headline: defused(s) ? 'Bomb defused' : 'Boom',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${DEFUSAL_NAME[s.setup.persona]} ${style[s.setup.persona]}. ${sh[0] ? `Its first clue: “${clueText(sh[0])}”. ` : ''}It held on ${holds} of its ${botCuts.length} turns.`,
  };
}

export const defusal: ArenaEngine<DefusalState, DefusalAction, DefusalVariant> = {
  id: 'defusal',
  opponents: DEFUSAL_PERSONAS,
  variants: DEFUSAL_VARIANTS,
  rounds: defusalRounds,
  endsEarly: true,
  create(setup) {
    const s = setup as Setup<DefusalVariant, DefusalPersona>;
    const wires = WIRES(s.length);
    const sets = allLive(wires);
    const live = sets[Math.floor(draw(s.seed, 900, 0) * sets.length)];
    // Single-wire "safe" clues are rationed (at most one per hand) so the puzzle needs combining, not reading.
    const pool = shuffled(trueClues(wires, live), s.seed, 901, 0);
    const k = CLUES(s.level);
    const deal = (avoid: Clue[]) => {
      const hand: Clue[] = [];
      for (const c of pool) {
        if (hand.length >= k) break;
        if (avoid.includes(c) || (c.kind === 'safe' && hand.some((h) => h.kind === 'safe'))) continue;
        hand.push(c);
      }
      return hand;
    };
    const player = deal([]);
    const bot = deal(player);
    return { setup: s, wires, live, hands: { player, bot }, turns: [] };
  },
  validate,
  apply,
  isOver: (s) => defused(s) || exploded(s),
  played: (s) => s.turns.length,
  result(s) {
    const score = defusalScore(s);
    return {
      outcome: defused(s) ? 'win' : 'loss',
      par: null,
      note: null,
      player: score,
      rival: 0,
      standings: [{ id: 'team', name: 'Your team', score, isPlayer: true }],
      unit: 'mission points',
      headline: defused(s) ? 'Bomb defused' : 'Boom',
    };
  },
  debrief: defusalDebrief,
  moves(s) {
    const p = defusalPrompt(s);
    if (!p) return [];
    if (p.phase === 'share') return p.options.length ? p.options.map((clue) => ({ kind: 'share', clue }) as DefusalAction) : [{ kind: 'share', clue: null }];
    const done = new Set(cutWires(s).map((c) => c.wire));
    const known = [...s.hands.player, ...[...sharedClues(s).bot, ...(p.shared !== null ? [p.shared] : [])].map((k) => s.hands.bot[k])];
    const safe = safety(s, consistent(s, known));
    return Array.from({ length: s.wires }, (_, i) => i)
      .filter((i) => !done.has(i))
      .sort((a, b) => safe[b]! - safe[a]!)
      .map((wire) => ({ kind: 'cut', wire }) as DefusalAction);
  },
};
