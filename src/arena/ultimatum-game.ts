import { type ArenaEngine, type Debrief, LENGTH_ROUNDS, PERSONA_NAME, type Persona, type Setup, drawInt, plural, resultFrom } from './core.ts';

/**
 * The Ultimatum Game — a series of take-it-or-leave-it negotiations over changing pools, roles alternating.
 * The player proposes in rounds 1, 3, 5…; the opponent proposes in rounds 2, 4, 6….
 *
 * Each round's terms are public before anyone moves: the pool (8, 10, 12, 15 or 20 tokens) and each side's walk-away
 * value — what it gets if the offer is rejected. In the Standard line both walk-aways are 0. In the Outside Options
 * line each side has a walk-away of 0 to 35 % of the pool, drawn from the seed: a better walk-away is bargaining power.
 *
 * The proposer offers the responder any whole number of tokens from 0 to the pool and keeps the rest. Accept: the
 * split happens. Reject: each side gets its own walk-away value.
 *
 * Information: the responder sees the offer (that is the game). The bot proposer never sees how the player would
 * respond; the bot responder decides from the offer, the public terms and earlier rounds. The smallest offer the bot
 * would have accepted is recorded with each round so the debrief can show it — it is never shown during play.
 */

export type UltVariant = 'standard' | 'outside-options';
export const ULT_VARIANTS: readonly UltVariant[] = ['standard', 'outside-options'];
export const ULT_POOLS = [8, 10, 12, 15, 20] as const;
export const ultRounds = LENGTH_ROUNDS(4, 6, 8);

export type UltAction = number | 'accept' | 'reject';

export interface UltTerms {
  pool: number;
  /** Walk-away values: what each side gets if the offer is rejected. */
  walkPlayer: number;
  walkBot: number;
  proposer: 'player' | 'bot';
}

export interface UltRound extends UltTerms {
  /** Tokens offered to the responder. */
  offer: number;
  accepted: boolean;
  ps: number;
  bs: number;
  /** When the bot responded: the smallest offer it would have accepted. */
  botMin: number | null;
}

export interface UltState {
  setup: Setup<UltVariant>;
  total: number;
  rounds: UltRound[];
}

export const playerProposesUlt = (round: number) => round % 2 === 0;

/** The public terms of round `n`, fixed by the seed. */
export function ultTerms(setup: Setup<UltVariant>, n: number): UltTerms {
  const pool = ULT_POOLS[drawInt(setup.seed, n, 0, 0, ULT_POOLS.length - 1)];
  const cap = Math.floor(pool * 0.35);
  const outside = setup.variant === 'outside-options';
  return {
    pool,
    walkPlayer: outside ? drawInt(setup.seed, n, 1, 0, cap) : 0,
    walkBot: outside ? drawInt(setup.seed, n, 2, 0, cap) : 0,
    proposer: playerProposesUlt(n) ? 'player' : 'bot',
  };
}

const surplus = (t: UltTerms) => t.pool - t.walkPlayer - t.walkBot;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** The responder's share of the surplus above its walk-away that an offer represents. */
const ratioFor = (r: UltRound) => (r.offer - (r.proposer === 'player' ? r.walkBot : r.walkPlayer)) / Math.max(1, surplus(r));

/** Rounds after `n` in which the bot will respond to the player. */
const futureBotResponds = (n: number, total: number) => {
  let k = 0;
  for (let i = n + 1; i < total; i++) if (playerProposesUlt(i)) k += 1;
  return k;
};

/**
 * The smallest offer the bot accepts as responder in round `h.length`. It always needs at least its walk-away + 1
 * (taking no more than the walk-away is no deal), plus a share `k` of the surplus:
 *
 * - Investor (reputation). Easy k = 0.2, Normal 0.3. Hard demands 0.35 while it will respond again later — a credible
 *   "no" now raises future offers — and only 0.1 in its last responding round, when toughness buys nothing.
 * - Banker (cost of rejection). A fixed line: Easy 0.15, Normal 0.25, Hard 0.3. It never gambles on signalling.
 * - Deal Maker (reciprocity). Easy 0.25; Normal/Hard 0.3, minus 0.1 if your earlier offers averaged at least 40 % of
 *   the surplus, plus 0.1 if your last offer was under 25 %.
 * - Opportunist (strategic rejection). Easy takes anything above its walk-away. Normal 0.25, but nothing extra in its
 *   last responding round. Hard anchors on your past generosity — it expects at least your best earlier offer minus
 *   0.1 (between 0.2 and 0.45) while it will respond again, and anything above its walk-away in its last.
 */
export function ultBotMinAccept(setup: Setup<UltVariant>, total: number, h: readonly UltRound[], t: UltTerms): number {
  const { persona, level } = setup;
  const n = h.length;
  const future = futureBotResponds(n, total);
  const mine = h.filter((r) => r.proposer === 'player');
  let k: number;
  switch (persona) {
    case 'investor':
      k = level === 'easy' ? 0.2 : level === 'normal' ? 0.3 : future > 0 ? 0.35 : 0.1;
      break;
    case 'banker':
      k = level === 'easy' ? 0.15 : level === 'normal' ? 0.25 : 0.3;
      break;
    case 'dealmaker': {
      k = level === 'easy' ? 0.25 : 0.3;
      if (level !== 'easy' && mine.length) {
        const avg = mine.reduce((s, r) => s + ratioFor(r), 0) / mine.length;
        if (avg >= 0.4) k -= 0.1;
        if (ratioFor(mine[mine.length - 1]) < 0.25) k += 0.1;
      }
      break;
    }
    case 'opportunist':
      if (level === 'easy') k = 0;
      else if (level === 'normal') k = future > 0 ? 0.25 : 0;
      else k = future > 0 ? clamp((mine.length ? Math.max(...mine.map(ratioFor)) : 0.3) - 0.1, 0.2, 0.45) : 0;
      break;
  }
  return clamp(t.walkBot + Math.max(1, Math.ceil(k * surplus(t) - 1e-9)), 0, t.pool + 1);
}

/**
 * What the bot offers the player when it proposes in round `h.length`: the player's walk-away plus a share of the
 * surplus, learned from how the player answered earlier offers.
 *
 * - Investor: Easy 0.5, Normal 0.4. Hard starts at 0.4 and, after a rejection, offers 0.1 more than the share you
 *   turned down — it pays for a dependable deal rather than pushing its luck.
 * - Banker: Easy 0.5, Normal 0.45. Hard calibrates a safe offer: 0.1 above the largest share you rejected (0.3–0.5),
 *   0.4 if you have rejected nothing.
 * - Deal Maker: Easy 0.55. Normal starts at 0.5 and adds 0.1 after a rejection; Hard also tries 0.05 less after an
 *   acceptance (0.35–0.6) — looking for the deal you both take.
 * - Opportunist: Easy 0.35. Normal starts at 0.2, +0.1 after a rejection, −0.05 after an acceptance (0.1–0.5). Hard
 *   brackets your floor from what you rejected and accepted and offers just inside it; 0.25 with no evidence.
 */
export function ultBotOffer(setup: Setup<UltVariant>, h: readonly UltRound[], t: UltTerms): number {
  const { persona, level } = setup;
  const mine = h.filter((r) => r.proposer === 'bot');
  const rejected = mine.filter((r) => !r.accepted).map(ratioFor);
  const accepted = mine.filter((r) => r.accepted).map(ratioFor);
  const adapt = (start: number, up: number, down: number, lo: number, hi: number) => {
    let s = start;
    for (const r of mine) s = clamp(s + (r.accepted ? -down : up), lo, hi);
    return s;
  };
  let share: number;
  switch (persona) {
    case 'investor':
      share = level === 'easy' ? 0.5 : level === 'normal' ? 0.4 : Math.max(0.4, rejected.length ? Math.max(...rejected) + 0.1 : 0);
      break;
    case 'banker':
      share = level === 'easy' ? 0.5 : level === 'normal' ? 0.45 : rejected.length ? clamp(Math.max(...rejected) + 0.1, 0.3, 0.5) : 0.4;
      break;
    case 'dealmaker':
      share = level === 'easy' ? 0.55 : level === 'normal' ? adapt(0.5, 0.1, 0, 0.35, 0.6) : adapt(0.5, 0.1, 0.05, 0.35, 0.6);
      break;
    case 'opportunist':
      if (level === 'easy') share = 0.35;
      else if (level === 'normal') share = adapt(0.2, 0.1, 0.05, 0.1, 0.5);
      else {
        const lo = rejected.length ? Math.max(...rejected) : null;
        const hi = accepted.length ? Math.min(...accepted) : null;
        share = lo === null && hi === null ? 0.25 : hi === null ? lo! + 0.1 : lo === null ? hi - 0.05 : Math.max(lo + 0.05, hi - 0.05);
        share = clamp(share, 0.05, 0.6);
      }
      break;
  }
  return clamp(t.walkPlayer + Math.round(share * surplus(t)), 0, t.pool);
}

/** What the player faces now: the terms, and the bot's offer when it proposes. */
export function ultPrompt(s: UltState): { terms: UltTerms; botOffer: number | null } | null {
  const n = s.rounds.length;
  if (n >= s.total) return null;
  const terms = ultTerms(s.setup, n);
  return { terms, botOffer: terms.proposer === 'bot' ? ultBotOffer(s.setup, s.rounds, terms) : null };
}

function validate(s: UltState, a: unknown): string | null {
  const p = ultPrompt(s);
  if (!p) return 'The match is over.';
  if (p.terms.proposer === 'player') {
    if (typeof a !== 'number' || !Number.isInteger(a)) return 'Offer a whole number of tokens.';
    if (a < 0 || a > p.terms.pool) return `Offer between 0 and ${p.terms.pool} tokens.`;
    return null;
  }
  return a === 'accept' || a === 'reject' ? null : 'Accept or reject the offer.';
}

function settle(t: UltTerms, offer: number, accepted: boolean, botMin: number | null): UltRound {
  if (!accepted) return { ...t, offer, accepted, ps: t.walkPlayer, bs: t.walkBot, botMin };
  return t.proposer === 'player' ? { ...t, offer, accepted, ps: t.pool - offer, bs: offer, botMin } : { ...t, offer, accepted, ps: offer, bs: t.pool - offer, botMin };
}

function apply(s: UltState, a: UltAction): UltState {
  const why = validate(s, a);
  if (why) throw new Error(`ultimatum-game: ${why}`);
  const { terms, botOffer } = ultPrompt(s)!;
  if (terms.proposer === 'player') {
    const min = ultBotMinAccept(s.setup, s.total, s.rounds, terms);
    return { ...s, rounds: [...s.rounds, settle(terms, a as number, (a as number) >= min, min)] };
  }
  return { ...s, rounds: [...s.rounds, settle(terms, botOffer!, a === 'accept', null)] };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function ultDebrief(s: UltState): Debrief {
  const h = s.rounds;
  const outside = s.setup.variant === 'outside-options';
  // Candidate moments, tagged with their round so the debrief reads in match order.
  const moments: { at: number; text: string }[] = [];
  const share = outside ? 'of the surplus above your walk-away' : 'of the pool';
  const mine = h.map((r, i) => ({ r, i })).filter(({ r }) => r.proposer === 'player');
  const theirs = h.map((r, i) => ({ r, i })).filter(({ r }) => r.proposer === 'bot');

  // Proposals: bargaining power left on the table, and offers that fell short.
  const generous = mine.filter(({ r }) => r.accepted && r.botMin !== null && r.offer > r.botMin);
  const leftOver = generous.reduce((t, { r }) => t + r.offer - r.botMin!, 0);
  const short = mine.filter(({ r }) => !r.accepted);
  if (short.length) {
    const { r, i } = short[0];
    moments.push({
      at: i,
      text: `Round ${i + 1}: you offered ${r.offer} of ${r.pool} and it said no — it needed ${r.botMin}. Instead of ${r.pool - r.offer} you got your walk-away of ${r.walkPlayer}${short.length > 1 ? ` (${plural(short.length - 1, 'more offer')} also fell short)` : ''}.`,
    });
  }
  if (generous.length) {
    const top = generous.reduce((a, b) => (b.r.offer - b.r.botMin! > a.r.offer - a.r.botMin! ? b : a));
    moments.push({
      at: top.i,
      text: `Round ${top.i + 1}: your offer of ${top.r.offer} was accepted, but it would have taken ${top.r.botMin}. Across the match, ${plural(leftOver, 'token')} of bargaining power went unused.`,
    });
  } else if (mine.length && !short.length) {
    moments.push({ at: mine[0].i, text: 'Every offer you made was accepted at exactly the opponent’s limit — you used your proposing power fully.' });
  }

  // Responses: what rejections cost, and whether they moved the next offer.
  const rejections = theirs.filter(({ r }) => !r.accepted);
  if (rejections.length) {
    const { r, i } = rejections[0];
    const next = theirs.find((x) => x.i > i);
    const moved = next ? ratioFor(next.r) > ratioFor(r) : false;
    const after = next ? `Its next offer gave you ${pct(ratioFor(next.r))}${moved ? ' — the “no” bought something.' : ', no better — the rejection only cost you.'}` : 'There was no later offer for it to improve.';
    moments.push({
      at: i,
      text: `Round ${i + 1}: you rejected ${r.offer} of ${r.pool} (${pct(ratioFor(r))} ${share}), which cost you ${Math.max(0, r.offer - r.walkPlayer)} against your walk-away. ${after}`,
    });
  } else if (theirs.length) {
    const low = theirs.reduce((a, b) => (ratioFor(b.r) < ratioFor(a.r) ? b : a));
    moments.push({ at: low.i, text: `You accepted every offer, the lowest ${low.r.offer} of ${low.r.pool} in round ${low.i + 1}. Taking a small deal beat your walk-away of ${low.r.walkPlayer}${low.r.walkPlayer === 0 ? ' — nothing' : ''}.` });
  }

  const insight = outside
    ? 'Walk-away values set the floor of every deal: a side with a better outside option can credibly refuse more. The surplus above both walk-aways is what you were really bargaining over.'
    : short.length
      ? 'An offer is only worth what the responder will accept. Purely profit-driven players accept any positive amount, but real opponents — and these bots — may reject offers they see as too small, or reject to make future offers better.'
      : leftOver > 0
        ? 'Safe offers buy certainty, and the price is the tokens above the responder’s limit. How much to give up depends on how sure you are of that limit — which you can learn as the match goes on.'
        : 'Rejecting costs the responder too, so a credible “no” is valuable only when it changes later offers. In a one-off final round, a purely profit-driven responder should accept anything above its walk-away.';

  return {
    headline: outside ? 'Negotiation with outside options' : 'Negotiation complete',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: ultRead(s.setup.persona, h),
  };
}

function ultRead(persona: Persona, h: readonly UltRound[]): string {
  const mins = h.filter((r) => r.botMin !== null).map((r) => (r.botMin! - r.walkBot) / Math.max(1, surplus(r)));
  const offers = h.filter((r) => r.proposer === 'bot').map(ratioFor);
  const style: Record<Persona, string> = {
    investor: 'The Investor guarded its reputation: tough while future rounds remained, practical at the end.',
    banker: 'The Banker kept one fixed acceptance line and made safe, steady offers.',
    dealmaker: 'The Deal Maker mirrored you: fair offers earned easier acceptance, lowballs a tougher line.',
    opportunist: 'The Opportunist probed for the least you would take, and turned down small offers while a “no” could still teach you something.',
  };
  const parts = [
    mins.length ? `It needed between ${pct(Math.min(...mins))} and ${pct(Math.max(...mins))} of the surplus to accept` : null,
    offers.length ? `its offers to you ranged from ${pct(Math.min(...offers))} to ${pct(Math.max(...offers))}` : null,
  ].filter(Boolean);
  return `${style[persona]}${parts.length ? ` ${parts.join('; ')}.` : ''}`;
}

export const ultimatumGame: ArenaEngine<UltState, UltAction, UltVariant> = {
  id: 'ultimatum-game',
  variants: ULT_VARIANTS,
  rounds: ultRounds,
  create: (setup) => ({ setup, total: ultRounds(setup.length), rounds: [] }),
  validate,
  apply,
  isOver: (s) => s.rounds.length >= s.total,
  played: (s) => s.rounds.length,
  result: (s) =>
    resultFrom(
      [
        { id: 'you', name: 'You', score: s.rounds.reduce((t, r) => t + r.ps, 0), isPlayer: true },
        { id: s.setup.persona, name: PERSONA_NAME[s.setup.persona], score: s.rounds.reduce((t, r) => t + r.bs, 0), isPlayer: false },
      ],
      'tokens',
    ),
  debrief: ultDebrief,
};
