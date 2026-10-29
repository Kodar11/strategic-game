import { type ArenaEngine, type Debrief, LENGTH_ROUNDS, type Setup, draw, resultFrom } from './core.ts';

/**
 * Bluff — draw hidden tokens, push your luck, then claim what they're worth. The other side believes you or calls it.
 *
 * Roles alternate: you are the claimant in odd rounds, the opponent in even rounds.
 *
 * Claimant's turn:
 * 1. Draw two tokens from the bag, privately. Each is Gold (3), Silver (1) or Stone (0).
 * 2. Press your luck: draw another token, up to MAX_TOKENS. A pressed draw can be a Crack (CRACK_P) — a bust: the round
 *    ends at once, 0 for both, tokens shown. The first two draws are never Cracks.
 * 3. Claim a value from 0 to 3 × your token count. The other side sees how many tokens you hold and your claim — not
 *    the tokens.
 * Challenger's answer:
 * - Believe: the claimant scores the claim, true or not.
 * - Call it: tokens are shown. Worth at least the claim → claimant scores the claim and the challenger loses
 *   CALL_COST. Worth less → caught bluffing: the claimant loses BLUFF_FINE and the challenger gains CATCH_BONUS.
 * Every round's tokens are shown afterwards, so both sides learn each other's habits. Most points wins.
 *
 * Token odds per draw (before Cracks): Gold 25 %, Silver 40 %, Stone 20 %; pressed draws add Crack 15 %. Tokens come
 * from the seed — your choices change how many are drawn, never which.
 */

export const BLUFF_PERSONAS = ['cautious', 'risk-taker', 'observant', 'performer'] as const;
export type BluffPersona = (typeof BLUFF_PERSONAS)[number];
export const BLUFF_NAME: Record<BluffPersona, string> = { cautious: 'The Cautious Bluffer', 'risk-taker': 'The Confident Risk Taker', observant: 'The Observant Challenger', performer: 'The Unpredictable Performer' };

export type BluffVariant = 'standard';
export const BLUFF_VARIANTS: readonly BluffVariant[] = ['standard'];
export const bluffRounds = LENGTH_ROUNDS(6, 8, 10);
export const MAX_TOKENS = 5;
export const START_TOKENS = 2;
export const CRACK_P = 0.15;
export const CALL_COST = 2;
export const BLUFF_FINE = 2;
export const CATCH_BONUS = 3;

export type Token = 3 | 1 | 0 | 'crack';
const SAFE: { v: 3 | 1 | 0; p: number }[] = [
  { v: 3, p: 0.25 / 0.85 },
  { v: 1, p: 0.4 / 0.85 },
  { v: 0, p: 0.2 / 0.85 },
];

/** Token k of round n. The first two are always safe; later ones can be Cracks. */
export function token(seed: number, n: number, k: number): Token {
  const u = draw(seed, n, 100 + k);
  if (k >= START_TOKENS) {
    if (u < CRACK_P) return 'crack';
    const w = (u - CRACK_P) / (1 - CRACK_P);
    return w < SAFE[0].p ? 3 : w < SAFE[0].p + SAFE[1].p ? 1 : 0;
  }
  return u < SAFE[0].p ? 3 : u < SAFE[0].p + SAFE[1].p ? 1 : 0;
}

const valueOf = (ts: readonly Token[]) => ts.reduce<number>((t, x) => t + (x === 'crack' ? 0 : x), 0);

/** P(k safe tokens are worth at least c). Exact, by convolution. */
export function pAtLeast(k: number, c: number): number {
  let dist = new Map<number, number>([[0, 1]]);
  for (let i = 0; i < k; i++) {
    const next = new Map<number, number>();
    for (const [v, p] of dist) for (const t of SAFE) next.set(v + t.v, (next.get(v + t.v) ?? 0) + p * t.p);
    dist = next;
  }
  let out = 0;
  for (const [v, p] of dist) if (v >= c) out += p;
  return out;
}

export const EXPECTED_TOKEN = SAFE.reduce((t, x) => t + x.v * x.p, 0);

export interface BluffRound {
  claimant: 'player' | 'bot';
  tokens: Token[];
  bust: boolean;
  claim: number | null;
  call: boolean | null;
  points: [number, number]; // [player, bot]
}

export interface BluffState {
  setup: Setup<BluffVariant, BluffPersona>;
  total: number;
  rounds: BluffRound[];
  /** Your tokens drawn so far this round, while you are the claimant. */
  hand: Token[];
}

export const playerClaims = (n: number) => n % 2 === 0;

/** How often the player's revealed claims exceeded their tokens, and how often they called. Public: tokens are shown. */
function playerHabits(s: BluffState) {
  const mine = s.rounds.filter((r) => r.claimant === 'player' && !r.bust);
  const bluffs = mine.filter((r) => r.claim! > valueOf(r.tokens)).length;
  const asCaller = s.rounds.filter((r) => r.claimant === 'bot' && !r.bust);
  const calls = asCaller.filter((r) => r.call).length;
  return { bluffRate: (bluffs + 1) / (mine.length + 3), callRate: (calls + 1) / (asCaller.length + 3), claims: mine.length };
}

/**
 * The bot's turn as claimant: whether to press after each draw (it sees only its own tokens so far), then its claim.
 * u-draws for its choices come from the seed (k ≥ 200), separate from the tokens.
 *
 * Cautious Bluffer — Easy: never presses, claims exactly its value. Normal: presses to 3 tokens; claims its value, +1 on
 *   20 % of rounds. Hard: presses to 3 (to 4 if it holds 2 or less), claims value +1 when you call less than a third
 *   of the time.
 * Confident Risk Taker — presses to 5 (Easy), to 4 (Normal, 5 if the value so far is low); claims value + 2 (Easy +3).
 *   Hard sizes the bluff to your calling: +3 if you rarely call, +1 if you call often.
 * Observant Challenger — honest by default: presses to 3; claims its value. Hard adds +1 when you have never called.
 * Unpredictable Performer — presses a random 2–5 tokens (seeded); claims value + 0–3 at random. Hard keeps the bluff
 *   below 3 × tokens − 1 so its claims are never impossible on their face.
 */
export function botTurn(s: BluffState, n: number): { tokens: Token[]; bust: boolean; claim: number | null } {
  const { persona, level } = s.setup;
  const seed = s.setup.seed;
  const u = (k: number) => draw(seed, n, 200 + k);
  const habits = playerHabits(s);
  const tokens: Token[] = [token(seed, n, 0), token(seed, n, 1)];
  const goal = (() => {
    const v = valueOf(tokens);
    if (persona === 'cautious') return level === 'easy' ? 2 : level === 'hard' && v <= 2 ? 4 : 3;
    if (persona === 'risk-taker') return level === 'easy' ? 5 : v <= 2 ? 5 : 4;
    if (persona === 'observant') return 3;
    return 2 + Math.floor(u(0) * 4);
  })();
  while (tokens.length < goal) {
    const t = token(seed, n, tokens.length);
    tokens.push(t);
    if (t === 'crack') return { tokens, bust: true, claim: null };
  }
  const v = valueOf(tokens);
  const cap = 3 * tokens.length;
  let claim = v;
  if (persona === 'cautious') {
    if (level === 'normal' && u(1) < 0.2) claim = v + 1;
    if (level === 'hard' && habits.callRate < 1 / 3) claim = v + 1;
  } else if (persona === 'risk-taker') {
    claim = v + (level === 'easy' ? 3 : level === 'normal' ? 2 : habits.callRate < 0.3 ? 3 : habits.callRate > 0.5 ? 1 : 2);
  } else if (persona === 'observant') {
    if (level === 'hard' && s.rounds.every((r) => r.claimant !== 'bot' || !r.call)) claim = v + 1;
  } else {
    claim = v + Math.floor(u(2) * 4);
    if (level === 'hard') claim = Math.min(claim, cap - 1);
  }
  return { tokens, bust: false, claim: Math.min(cap, Math.max(0, claim)) };
}

/**
 * The bot as challenger: believe or call your claim, from your token count, the claim and your revealed history.
 *
 * Cautious Bluffer — calls only claims that look far-fetched: above the average value of your tokens + 3 (Normal/Hard
 *   + 2).
 * Confident Risk Taker — rarely calls: only when the claim is within 1 of the maximum possible.
 * Observant Challenger — calls when the chance of a bluff makes calling worth it. Easy: claim > expected value + 1.
 *   Normal: P(tokens worth less than the claim) > 0.45, from the exact odds. Hard: the same odds, blended with how
 *   often your revealed claims were bluffs.
 * Unpredictable Performer — calls 35 % of the time at random; Hard only when the odds also give at least a 25 % chance
 *   of a bluff.
 */
export function botCalls(s: BluffState, count: number, claim: number, u: number): boolean {
  const { persona, level } = s.setup;
  const mean = EXPECTED_TOKEN * count;
  const pBluff = 1 - pAtLeast(count, claim);
  if (persona === 'cautious') return claim > mean + (level === 'easy' ? 3 : 2);
  if (persona === 'risk-taker') return claim >= 3 * count - 1;
  if (persona === 'observant') {
    if (level === 'easy') return claim > mean + 1;
    const p = level === 'hard' ? 0.6 * pBluff + 0.4 * playerHabits(s).bluffRate : pBluff;
    return p > 0.45;
  }
  if (level === 'hard') return u < 0.35 && pBluff >= 0.25;
  return u < 0.35;
}

export type BluffAction = 'press' | { claim: number } | 'believe' | 'call' | 'continue';

export type BluffPrompt =
  | { role: 'claim'; round: number; hand: Token[]; value: number; canPress: boolean; maxClaim: number }
  | { role: 'judge'; round: number; count: number; claim: number }
  | { role: 'bust'; round: number; tokens: Token[] };

export function bluffPrompt(s: BluffState): BluffPrompt | null {
  const n = s.rounds.length;
  if (n >= s.total) return null;
  if (playerClaims(n)) {
    const hand = s.hand.length ? s.hand : [token(s.setup.seed, n, 0), token(s.setup.seed, n, 1)];
    return { role: 'claim', round: n + 1, hand, value: valueOf(hand), canPress: hand.length < MAX_TOKENS, maxClaim: 3 * hand.length };
  }
  const t = botTurn(s, n);
  if (t.bust) return { role: 'bust', round: n + 1, tokens: t.tokens };
  return { role: 'judge', round: n + 1, count: t.tokens.length, claim: t.claim! };
}

/** The bot drew a Crack this round: nothing to judge; the player continues. */
export const botBusted = (s: BluffState) => s.rounds.length < s.total && !playerClaims(s.rounds.length) && botTurn(s, s.rounds.length).bust;

function validate(s: BluffState, a: BluffAction): string | null {
  const n = s.rounds.length;
  if (n >= s.total) return 'The game is over.';
  if (playerClaims(n)) {
    const p = bluffPrompt(s) as Extract<BluffPrompt, { role: 'claim' }>;
    if (a === 'press') return p.canPress ? null : `You can hold at most ${MAX_TOKENS} tokens.`;
    if (typeof a === 'object' && a && Number.isInteger(a.claim)) return a.claim >= 0 && a.claim <= p.maxClaim ? null : `Claim 0 to ${p.maxClaim}.`;
    return 'Press your luck or make a claim.';
  }
  if (botBusted(s)) return a === 'continue' ? null : 'The opponent drew a Crack — continue.';
  return a === 'believe' || a === 'call' ? null : 'Believe the claim or call it.';
}

function apply(s: BluffState, a: BluffAction): BluffState {
  const why = validate(s, a);
  if (why) throw new Error(`bluff: ${why}`);
  const n = s.rounds.length;
  const seed = s.setup.seed;
  if (playerClaims(n)) {
    const hand = s.hand.length ? s.hand : [token(seed, n, 0), token(seed, n, 1)];
    if (a === 'press') {
      const t = token(seed, n, hand.length);
      const next = [...hand, t];
      if (t === 'crack') return { ...s, hand: [], rounds: [...s.rounds, { claimant: 'player', tokens: next, bust: true, claim: null, call: null, points: [0, 0] }] };
      return { ...s, hand: next };
    }
    const claim = (a as { claim: number }).claim;
    // The bot judges from the state before your claim existed, plus what the rules show it: count and claim.
    const call = botCalls(s, hand.length, claim, draw(seed, n, 300));
    const v = valueOf(hand);
    const points: [number, number] = !call ? [claim, 0] : v >= claim ? [claim, -CALL_COST] : [-BLUFF_FINE, CATCH_BONUS];
    return { ...s, hand: [], rounds: [...s.rounds, { claimant: 'player', tokens: hand, bust: false, claim, call, points }] };
  }
  const t = botTurn(s, n);
  if (t.bust) return { ...s, rounds: [...s.rounds, { claimant: 'bot', tokens: t.tokens, bust: true, claim: null, call: null, points: [0, 0] }] };
  const call = a === 'call';
  const v = valueOf(t.tokens);
  const points: [number, number] = !call ? [0, t.claim!] : v >= t.claim! ? [-CALL_COST, t.claim!] : [CATCH_BONUS, -BLUFF_FINE];
  return { ...s, rounds: [...s.rounds, { claimant: 'bot', tokens: t.tokens, bust: false, claim: t.claim, call, points }] };
}

export const bluffTotals = (s: BluffState) => s.rounds.reduce<[number, number]>((t, r) => [t[0] + r.points[0], t[1] + r.points[1]], [0, 0]);
export const tokenValue = valueOf;

function bluffDebrief(s: BluffState): Debrief {
  const h = s.rounds.map((r, i) => ({ r, i }));
  const moments: { at: number; text: string }[] = [];
  const caught = h.find(({ r }) => r.claimant === 'player' && r.call && r.claim! > valueOf(r.tokens));
  if (caught) moments.push({ at: caught.i, text: `Round ${caught.i + 1}: you claimed ${caught.r.claim} on ${caught.r.tokens.length} tokens worth ${valueOf(caught.r.tokens)} — called and caught (−${BLUFF_FINE}).` });
  const got = h.find(({ r }) => r.claimant === 'player' && !r.call && r.claim !== null && r.claim > valueOf(r.tokens));
  if (got) moments.push({ at: got.i, text: `Round ${got.i + 1}: your bluff of ${got.r.claim} (really ${valueOf(got.r.tokens)}) was believed.` });
  const goodCall = h.find(({ r }) => r.claimant === 'bot' && r.call && r.claim! > valueOf(r.tokens));
  const badCall = h.find(({ r }) => r.claimant === 'bot' && r.call && r.claim! <= valueOf(r.tokens));
  const swallowed = h.find(({ r }) => r.claimant === 'bot' && r.call === false && r.claim! > valueOf(r.tokens));
  if (goodCall) moments.push({ at: goodCall.i, text: `Round ${goodCall.i + 1}: you called a claim of ${goodCall.r.claim} — the tokens were worth ${valueOf(goodCall.r.tokens)}. Caught (+${CATCH_BONUS}).` });
  else if (swallowed) moments.push({ at: swallowed.i, text: `Round ${swallowed.i + 1}: you believed ${swallowed.r.claim}; the tokens were worth only ${valueOf(swallowed.r.tokens)}.` });
  else if (badCall) moments.push({ at: badCall.i, text: `Round ${badCall.i + 1}: you called ${badCall.r.claim}, but the tokens were worth ${valueOf(badCall.r.tokens)} (−${CALL_COST}).` });
  const bust = h.find(({ r }) => r.claimant === 'player' && r.bust);
  if (bust && moments.length < 3) moments.push({ at: bust.i, text: `Round ${bust.i + 1}: you pressed to ${bust.r.tokens.length} tokens and drew a Crack.` });
  if (!moments.length) moments.push({ at: 0, text: 'Every claim was believed and true.' });
  const insight = `Confidence isn’t evidence. With ${MAX_TOKENS} tokens or fewer, a claim far above ${EXPECTED_TOKEN.toFixed(1)} per token is unlikely but not impossible — the question is whether the odds of a bluff (and this opponent’s record) beat the ${CALL_COST} a wrong call costs.`;
  const theirs = h.filter(({ r }) => r.claimant === 'bot' && !r.bust);
  const bluffs = theirs.filter(({ r }) => r.claim! > valueOf(r.tokens));
  const calls = h.filter(({ r }) => r.claimant === 'player' && !r.bust);
  const called = calls.filter(({ r }) => r.call).length;
  const ex = bluffs[0] ? ` In round ${bluffs[0].i + 1} it claimed ${bluffs[0].r.claim} holding ${valueOf(bluffs[0].r.tokens)}.` : theirs[0] ? ` In round ${theirs[0].i + 1} it claimed exactly what it held (${theirs[0].r.claim}).` : '';
  const style: Record<BluffPersona, string> = {
    cautious: 'drew few tokens and kept its claims close to the truth',
    'risk-taker': 'pressed deep and claimed big',
    observant: 'claimed honestly and called when the odds said you were bluffing',
    performer: 'varied how far it pressed and how much it bluffed',
  };
  return {
    headline: 'Final reveal',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${BLUFF_NAME[s.setup.persona]} ${style[s.setup.persona]}: ${bluffs.length} of its ${theirs.length} claims were bluffs, and it called ${called} of your ${calls.length}.${ex}`,
  };
}

export const bluff: ArenaEngine<BluffState, BluffAction, BluffVariant> = {
  id: 'bluff',
  opponents: BLUFF_PERSONAS,
  variants: BLUFF_VARIANTS,
  rounds: bluffRounds,
  create: (setup) => ({ setup: setup as Setup<BluffVariant, BluffPersona>, total: bluffRounds(setup.length), rounds: [], hand: [] }),
  validate,
  apply,
  isOver: (s) => s.rounds.length >= s.total,
  played: (s) => s.rounds.length,
  result(s) {
    const [p, b] = bluffTotals(s);
    return resultFrom(
      [
        { id: 'you', name: 'You', score: p, isPlayer: true },
        { id: s.setup.persona, name: BLUFF_NAME[s.setup.persona], score: b, isPlayer: false },
      ],
      'points',
    );
  },
  debrief: bluffDebrief,
  moves(s) {
    const n = s.rounds.length;
    if (n >= s.total) return [];
    if (playerClaims(n)) {
      const p = bluffPrompt(s) as Extract<BluffPrompt, { role: 'claim' }>;
      const out: BluffAction[] = [{ claim: p.value }, { claim: Math.min(p.maxClaim, p.value + 2) }];
      if (p.canPress && p.hand.length < 3) out.unshift('press');
      return out;
    }
    return botBusted(s) ? ['continue'] : ['believe', 'call'];
  },
};
