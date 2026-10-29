import { type ArenaEngine, type Debrief, type MatchLength, type Setup, draw, drawInt } from './core.ts';

/**
 * Liar's Dice — two players, hidden dice, and bids about how many of a face are on the whole table.
 *
 * Variant: no wild faces. Each side starts with DICE(length) six-sided dice.
 * Each round:
 * 1. Both roll in secret (seeded). You see your dice and how many the opponent has — never its faces.
 * 2. The opener bids "at least Q dice showing F" across both cups. Round 1 you open; then the loser of the last round.
 * 3. Players alternate: raise (more dice of any face, or the same quantity of a higher face) or call "Liar!".
 * 4. On a call all dice are shown and the bid face counted. At least Q: the bid stands and the caller loses a die.
 *    Fewer: the bidder loses a die.
 * The match ends when one side has no dice; the other wins.
 *
 * Odds: each of the opponent's dice shows a given face 1/6 of the time, so with n hidden dice you expect n/6 of any
 * face — plus whatever is in your own cup.
 *
 * Bots decide from their own dice, the dice counts and the bids so far — never your faces. A round's dice are fixed by
 * the seed before anyone bids.
 */

export const DICE_PERSONAS = ['calculator', 'aggressive', 'conservative', 'psychological'] as const;
export type DicePersona = (typeof DICE_PERSONAS)[number];
export const DICE_NAME: Record<DicePersona, string> = { calculator: 'The Probability Calculator', aggressive: 'The Aggressive Bidder', conservative: 'The Conservative Challenger', psychological: 'The Psychological Bluffer' };

export type DiceVariant = 'standard';
export const DICE_VARIANTS: readonly DiceVariant[] = ['standard'];
export const DICE = (length: MatchLength) => (length === 'short' ? 3 : length === 'long' ? 5 : 4);
/** The most rounds a match can take: every round removes one die. */
export const diceRounds = (length: MatchLength) => 2 * DICE(length) - 1;
export const FACES = 6;

export interface Bid {
  by: 'player' | 'bot';
  q: number;
  f: number;
}

export interface DiceRound {
  opener: 'player' | 'bot';
  dice: { player: number[]; bot: number[] };
  bids: Bid[];
  caller: 'player' | 'bot';
  count: number;
  loser: 'player' | 'bot';
}

export interface DiceState {
  setup: Setup<DiceVariant, DicePersona>;
  count: { player: number; bot: number };
  rounds: DiceRound[];
  /** Bids so far in the round being played (excluding a bot opening not yet recorded). */
  bids: Bid[];
}

export type DiceAction = { kind: 'bid'; q: number; f: number } | { kind: 'liar' };

export function roll(s: DiceState): { player: number[]; bot: number[] } {
  const n = s.rounds.length;
  const { seed } = s.setup;
  return {
    player: Array.from({ length: s.count.player }, (_, i) => drawInt(seed, n, 100 + i, 1, FACES)).sort(),
    bot: Array.from({ length: s.count.bot }, (_, i) => drawInt(seed, n, 200 + i, 1, FACES)).sort(),
  };
}

export const opener = (s: DiceState): 'player' | 'bot' => (s.rounds.length ? s.rounds[s.rounds.length - 1].loser : 'player');
export const isRaise = (b: { q: number; f: number }, prev: { q: number; f: number } | undefined) => !prev || b.q > prev.q || (b.q === prev.q && b.f > prev.f);

/** P(at least k of n fair dice show a given face). */
export function pAtLeast(n: number, k: number, p = 1 / FACES): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let total = 0;
  let c = 1;
  for (let i = 0; i <= n; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i;
    if (i >= k) total += c * p ** i * (1 - p) ** (n - i);
  }
  return total;
}

/**
 * P(a bid is true) from the bot's view: its own matching dice plus the chance your hidden dice make up the rest.
 * Hard also reads your bids: a face you have bid makes it assume one more of that face in your cup is likelier
 * (p = 1/4 instead of 1/6 for that face). Easy forgets its own cup and treats every die as unknown.
 */
function pTrue(s: DiceState, own: number[], b: { q: number; f: number }, bids: Bid[]): number {
  // Easy forgets to count its own cup: it treats every die on the table as unknown.
  if (s.setup.level === 'easy') return pAtLeast(s.count.player + s.count.bot, b.q);
  const mine = own.filter((d) => d === b.f).length;
  const yours = bids.some((x) => x.by === 'player' && x.f === b.f);
  const p = s.setup.level === 'hard' && yours ? 1 / 4 : 1 / FACES;
  return pAtLeast(s.count.player, b.q - mine, p);
}

const bestFace = (own: number[], u: number) => {
  const counts = Array.from({ length: FACES + 1 }, (_, f) => own.filter((d) => d === f).length);
  let best = 1 + Math.floor(u * FACES);
  for (let f = 1; f <= FACES; f++) if (counts[f] > counts[best]) best = f;
  return best;
};

/** The smallest legal bid on face f above prev. */
const lowestOn = (f: number, prev: Bid | undefined) => (!prev ? 1 : f > prev.f ? prev.q : prev.q + 1);

/**
 * The bot's move given the bids so far this round (it opens with `bids` empty). u, v: seeded random numbers.
 *
 * Probability Calculator — calls when the current bid is less than 50 % likely (Easy: 30 %). Otherwise it makes the
 *   most probable legal raise, preferring its own strongest face.
 * On Easy every bot except the Aggressive Bidder skips the search and raises the smallest step on its strongest face.
 * Aggressive Bidder — calls only below 20 %; otherwise raises a quantity on its best face, even when the raise itself
 *   is a stretch.
 * Conservative Challenger — calls below 60 %; raises only to a bid at least 60 % likely, else calls.
 * Psychological Bluffer — calls below 40 %; 30 % of the time (Hard: when you've followed its earlier bluff faces) it
 *   bids a face it doesn't hold, to steer you; otherwise like the Calculator.
 */
export function botMove(s: DiceState, own: number[], bids: Bid[], u: number, v: number): DiceAction {
  const { persona, level } = s.setup;
  const prev = bids[bids.length - 1];
  const total = s.count.player + s.count.bot;
  const legal: { q: number; f: number; p: number }[] = [];
  for (let f = 1; f <= FACES; f++) {
    for (let q = lowestOn(f, prev); q <= Math.min(total, lowestOn(f, prev) + 2); q++) legal.push({ q, f, p: pTrue(s, own, { q, f }, bids) });
  }
  if (prev) {
    const pPrev = pTrue(s, own, prev, bids);
    const callBelow = persona === 'calculator' ? 0.5 : persona === 'aggressive' ? 0.2 : persona === 'conservative' ? 0.6 : 0.4;
    if (level === 'easy' && persona === 'calculator' ? pPrev < 0.3 : pPrev < callBelow) return { kind: 'liar' };
    if (!legal.length) return { kind: 'liar' };
  }
  if (!legal.length) return { kind: 'liar' };
  const face = bestFace(own, u);
  const byP = [...legal].sort((a, b) => b.p - a.p || (a.f === face ? -1 : b.f === face ? 1 : 0) || a.q - b.q);
  // Easy bots don't search the raises: the smallest bid on their strongest face.
  if (level === 'easy' && persona !== 'aggressive') {
    const q = lowestOn(face, prev);
    if (q <= total) return { kind: 'bid', q, f: face };
  }
  if (persona === 'aggressive') {
    const up = legal.filter((x) => x.f === face).sort((a, b) => a.q - b.q);
    const pick = up[Math.min(up.length - 1, level === 'easy' ? 1 : 0)] ?? byP[0];
    return { kind: 'bid', q: pick.q, f: pick.f };
  }
  if (persona === 'conservative') {
    const safe = byP.find((x) => x.p >= 0.6);
    return safe ? { kind: 'bid', q: safe.q, f: safe.f } : prev ? { kind: 'liar' } : { kind: 'bid', q: byP[0].q, f: byP[0].f };
  }
  if (persona === 'psychological') {
    const followed = level === 'hard' && s.rounds.some((r) => r.bids.some((b, i) => b.by === 'bot' && r.bids[i + 1]?.by === 'player' && r.bids[i + 1].f === b.f && !r.dice.bot.includes(b.f)));
    const bluffNow = level === 'hard' ? followed || v < 0.2 : v < 0.3;
    if (bluffNow) {
      const fake = legal.filter((x) => !own.includes(x.f) && x.p >= 0.25).sort((a, b) => a.q - b.q)[0];
      if (fake) return { kind: 'bid', q: fake.q, f: fake.f };
    }
  }
  return { kind: 'bid', q: byP[0].q, f: byP[0].f };
}

/** The bids of the round in play, including the bot's opening if it opens. */
export function liveBids(s: DiceState): Bid[] {
  if (s.bids.length || opener(s) === 'player') return s.bids;
  const n = s.rounds.length;
  const m = botMove(s, roll(s).bot, [], draw(s.setup.seed, n, 300), draw(s.setup.seed, n, 301));
  return m.kind === 'bid' ? [{ by: 'bot', q: m.q, f: m.f }] : [];
}

const isOver = (s: DiceState) => s.count.player === 0 || s.count.bot === 0;

function validate(s: DiceState, a: DiceAction): string | null {
  if (isOver(s)) return 'The match is over.';
  if (!a || typeof a !== 'object') return 'Bid or call.';
  const bids = liveBids(s);
  const prev = bids[bids.length - 1];
  if (a.kind === 'liar') return prev ? null : 'There’s no bid to call yet — open with a bid.';
  if (a.kind !== 'bid' || !Number.isInteger(a.q) || !Number.isInteger(a.f)) return 'Bid a quantity and a face.';
  if (a.f < 1 || a.f > FACES) return 'Faces are 1 to 6.';
  if (a.q < 1 || a.q > s.count.player + s.count.bot) return `Bid between 1 and ${s.count.player + s.count.bot} dice.`;
  if (!isRaise(a, prev)) return `Raise the bid: more than ${prev!.q}, or ${prev!.q} of a face above ${prev!.f}.`;
  return null;
}

function resolve(s: DiceState, bids: Bid[], caller: 'player' | 'bot'): DiceState {
  const dice = roll(s);
  const last = bids[bids.length - 1];
  const count = [...dice.player, ...dice.bot].filter((d) => d === last.f).length;
  const loser = count >= last.q ? caller : last.by;
  const counts = { ...s.count, [loser]: s.count[loser] - 1 };
  return { ...s, count: counts, bids: [], rounds: [...s.rounds, { opener: opener(s), dice, bids, caller, count, loser }] };
}

function apply(s: DiceState, a: DiceAction): DiceState {
  const why = validate(s, a);
  if (why) throw new Error(`liars-dice: ${why}`);
  const n = s.rounds.length;
  const bids = liveBids(s);
  if (a.kind === 'liar') return resolve(s, bids, 'player');
  const next: Bid[] = [...bids, { by: 'player', q: a.q, f: a.f }];
  // The bot answers from its own dice and the bids — the bid you just made is public, your dice aren't.
  const k = next.length;
  const m = botMove(s, roll(s).bot, next, draw(s.setup.seed, n, 310 + k), draw(s.setup.seed, n, 330 + k));
  if (m.kind === 'liar') return resolve(s, next, 'bot');
  return { ...s, bids: [...next, { by: 'bot', q: m.q, f: m.f }] };
}

const FACE_NAME = ['', 'ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const FACE_ONE = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
export const bidText = (b: { q: number; f: number }) => `${b.q} ${b.q === 1 ? FACE_ONE[b.f] : FACE_NAME[b.f]}`;
export const faceName = (f: number) => FACE_NAME[f];

function diceDebrief(s: DiceState): Debrief {
  const h = s.rounds.map((r, i) => ({ r, i }));
  const moments: { at: number; text: string }[] = [];
  const badCall = h.find(({ r }) => r.caller === 'player' && r.loser === 'player');
  const goodCall = h.find(({ r }) => r.caller === 'player' && r.loser === 'bot');
  const caughtYou = h.find(({ r }) => r.caller === 'bot' && r.loser === 'player');
  const last = (r: DiceRound) => r.bids[r.bids.length - 1];
  if (goodCall) moments.push({ at: goodCall.i, text: `Round ${goodCall.i + 1}: you called its ${last(goodCall.r).q} ${faceName(last(goodCall.r).f)} — there were ${goodCall.r.count}. It lost a die.` });
  if (badCall) {
    const b = last(badCall.r);
    const mine = badCall.r.dice.player.filter((d) => d === b.f).length;
    moments.push({ at: badCall.i, text: `Round ${badCall.i + 1}: you called ${b.q} ${faceName(b.f)} with ${mine} in your own cup — there were ${badCall.r.count}. A ${Math.round(pAtLeast(badCall.r.dice.bot.length, b.q - mine) * 100)}% bid from your view: plausible isn’t certain.` });
  }
  if (caughtYou && moments.length < 3) moments.push({ at: caughtYou.i, text: `Round ${caughtYou.i + 1}: it called your ${last(caughtYou.r).q} ${faceName(last(caughtYou.r).f)} — only ${caughtYou.r.count} on the table.` });
  if (!moments.length) moments.push({ at: 0, text: `${s.rounds.length} rounds, ${s.count.player} dice left for you, ${s.count.bot} for it.` });
  const d = DICE(s.setup.length);
  const insight = `Your own cup is information: each hidden die shows a given face 1/6 of the time, so ${d} hidden dice hold about ${(d / FACES).toFixed(1)} of any face. A bid is a claim about probability, not a fact — call when it needs more from the hidden dice than they are likely to give, and remember the bidder’s own cup is why it bid.`;
  const theirBids = s.rounds.flatMap((r) => r.bids.filter((b) => b.by === 'bot').map((b) => ({ b, held: r.dice.bot.filter((d) => d === b.f).length })));
  const bluffs = theirBids.filter((x) => x.held === 0).length;
  const calls = s.rounds.filter((r) => r.caller === 'bot').length;
  const style: Record<DicePersona, string> = {
    calculator: 'made the most likely bids and called when a bid dropped below even odds',
    aggressive: 'kept raising and rarely called',
    conservative: 'called early and only raised to safe bids',
    psychological: 'mixed in bids on faces it didn’t hold to steer you',
  };
  const ex = theirBids.find((x) => x.held === 0);
  return {
    headline: s.count.bot === 0 ? 'Last die standing' : 'Out of dice',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${DICE_NAME[s.setup.persona]} ${style[s.setup.persona]}: ${theirBids.length} bids (${bluffs} on a face it didn’t hold) and ${calls} calls.${ex ? ` For example it bid ${ex.b.q} ${faceName(ex.b.f)} holding none.` : ''}`,
  };
}

export const liarsDice: ArenaEngine<DiceState, DiceAction, DiceVariant> = {
  id: 'liars-dice',
  opponents: DICE_PERSONAS,
  variants: DICE_VARIANTS,
  rounds: diceRounds,
  endsEarly: true,
  create(setup) {
    const s = setup as Setup<DiceVariant, DicePersona>;
    const d = DICE(s.length);
    return { setup: s, count: { player: d, bot: d }, rounds: [], bids: [] };
  },
  validate,
  apply,
  isOver,
  played: (s) => s.rounds.length,
  result(s) {
    const win = s.count.bot === 0;
    return {
      outcome: isOver(s) ? (win ? 'win' : 'loss') : 'draw',
      par: null,
      note: null,
      player: s.count.player,
      rival: s.count.bot,
      standings: [
        { id: 'you', name: 'You', score: s.count.player, isPlayer: true },
        { id: s.setup.persona, name: DICE_NAME[s.setup.persona], score: s.count.bot, isPlayer: false },
      ].sort((a, b) => b.score - a.score),
      unit: 'dice',
    };
  },
  debrief: diceDebrief,
  moves(s) {
    if (isOver(s)) return [];
    const bids = liveBids(s);
    const prev = bids[bids.length - 1];
    const own = roll(s).player;
    const out: DiceAction[] = [];
    const face = own.length ? own[0] : 1;
    const q = lowestOn(face, prev);
    if (q <= s.count.player + s.count.bot) out.push({ kind: 'bid', q, f: face });
    if (prev) out.push({ kind: 'liar' });
    if (!out.length) out.push({ kind: 'bid', q: s.count.player + s.count.bot, f: FACES });
    return out;
  },
};
