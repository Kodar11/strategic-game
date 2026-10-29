import { type ArenaEngine, type Debrief, LENGTH_ROUNDS, PERSONA_NAME, type Persona, type Setup, draw, plural, resultFrom } from './core.ts';

/**
 * The Cooperation Game — a repeated prisoner's dilemma against one opponent, both choices locked in secret.
 *
 * Payoffs (you / opponent) with T > R > P > S and 2R > T + S, so defecting pays more in any single round, mutual
 * cooperation beats mutual defection, and taking turns exploiting each other is worse than steady cooperation:
 *
 *               Classic   High stakes
 *   both C       3 / 3      5 / 5      R
 *   D vs C       5 / 0      8 / −2     T / S
 *   both D       1 / 1      1 / 1      P
 *
 * Noisy line (a challenge variant): classic payoffs, but each side's choice is mis-delivered with probability 10 %.
 * Slips are drawn from the seed (independent of difficulty) and revealed to both players after the round, so the
 * difference between a betrayal and an accident is visible — and forgiving accidents becomes a skill.
 *
 * The length is announced up front (6, 10 or 14 rounds); everyone knows when the last round comes.
 */

export type CoopMove = 'C' | 'D';
export type CoopVariant = 'classic' | 'high-stakes' | 'noisy';
export const COOP_VARIANTS: readonly CoopVariant[] = ['classic', 'high-stakes', 'noisy'];

export interface Payoffs {
  T: number;
  R: number;
  P: number;
  S: number;
}

export const COOP_PAYOFFS: Record<CoopVariant, Payoffs> = {
  classic: { T: 5, R: 3, P: 1, S: 0 },
  'high-stakes': { T: 8, R: 5, P: 1, S: -2 },
  noisy: { T: 5, R: 3, P: 1, S: 0 },
};

export const COOP_NOISE = 0.1;
export const coopRounds = LENGTH_ROUNDS(6, 10, 14);

/** True when the payoffs are a genuine repeated prisoner's dilemma. */
export const isDilemma = ({ T, R, P, S }: Payoffs) => T > R && R > P && P > S && 2 * R > T + S;

export interface CoopRound {
  /** What each side chose… */
  pi: CoopMove;
  bi: CoopMove;
  /** …and what was delivered (different only after a slip in the noisy variant). */
  p: CoopMove;
  b: CoopMove;
  ps: number;
  bs: number;
}

export interface CoopState {
  setup: Setup<CoopVariant>;
  total: number;
  rounds: CoopRound[];
}

export function coopPayoff(pay: Payoffs, p: CoopMove, b: CoopMove): [number, number] {
  if (p === 'C' && b === 'C') return [pay.R, pay.R];
  if (p === 'D' && b === 'C') return [pay.T, pay.S];
  if (p === 'C' && b === 'D') return [pay.S, pay.T];
  return [pay.P, pay.P];
}

const flip = (m: CoopMove): CoopMove => (m === 'C' ? 'D' : 'C');

/** A deliberate defection: chosen, not a slip. Slips are revealed to both sides, so bots may tell them apart. */
const meantD = (r: CoopRound | undefined) => r?.pi === 'D';
const gotD = (r: CoopRound | undefined) => r?.p === 'D';

/** The player's next move if their last four show a plain pattern (all the same, or strictly alternating). */
export function predictPlayer(h: readonly CoopRound[]): CoopMove | null {
  if (h.length < 4) return null;
  const last = h.slice(-4).map((r) => r.pi);
  if (last.every((m) => m === last[0])) return last[0];
  if (last.every((m, i) => i === 0 || m !== last[i - 1])) return flip(last[3]);
  return null;
}

/** How often the player cooperated in the round after the bot defected: [cooperated, samples]. */
function forgivenessAfterBotD(h: readonly CoopRound[]): [number, number] {
  let c = 0;
  let n = 0;
  for (let i = 0; i + 1 < h.length; i++) {
    if (h[i].b === 'D') {
      n += 1;
      if (h[i + 1].pi === 'C') c += 1;
    }
  }
  return [c, n];
}

/**
 * The opponent's choice for round `h.length`, from revealed rounds only — never the player's current choice.
 *
 * Investor (long-term value).
 *   Easy: tit-for-tat, but one time in five it lets a defection go unanswered (patient to a fault).
 *   Normal: forgives a lone defection, but answers a defection when it's the second in the last four rounds.
 *   Hard: forgives slips, answers each deliberate defection once, and stops cooperating while the player defects in
 *   half or more of the last four rounds (it won't be milked). Never defects first, even in the last round.
 * Banker (consistent, low risk).
 *   Easy: cooperates while the player has cooperated in at least half of all rounds.
 *   Normal: trusts until the first defection, then needs two cooperations in a row before trusting again.
 *   Hard: as Normal, judged on deliberate moves (slips forgiven), and always takes the safe defection in the final
 *   round, when no reply can follow.
 * Deal Maker (reciprocity, repair).
 *   Easy: cooperates unless the player just defected — and even then forgives on a coin flip.
 *   Normal: tit-for-tat that offers an olive branch (cooperates) after two mutual defections in a row — unless the
 *   player has defected four rounds running.
 *   Hard: retaliates once per deliberate defection and forgives slips. Against a player who defected deliberately in
 *   three of the last four rounds it defects until they cooperate again; otherwise it offers the olive branch. In the
 *   final round it defects if the player has betrayed it twice or more.
 * Opportunist (exploits).
 *   Easy: copies the player's last move, except it defects whenever the player cooperated in each of the last three,
 *   and it lets go of a grudge — after a mutual defection it cooperates.
 *   Normal: tit-for-tat that probes — defects after three mutual cooperations; if the player keeps cooperating after
 *   being hit, it keeps defecting.
 *   Hard: measures how often the player forgives its defections; defects against a forgiving player (≥ 60 % of at
 *   least two samples) or a predictable cooperator, probes once in round 5 after unbroken cooperation, and always
 *   defects in the final round. Otherwise tit-for-tat.
 */
export function coopBotMove(setup: Setup<CoopVariant>, total: number, h: readonly CoopRound[]): CoopMove {
  const { persona, level, seed } = setup;
  const n = h.length;
  const last = h[n - 1];
  const prev = h[n - 2];
  const finalRound = n === total - 1;
  const recentMeantD = (k: number) => h.slice(-k).filter(meantD).length;
  const mutualDStreak = n >= 2 && last.p === 'D' && last.b === 'D' && prev.p === 'D' && prev.b === 'D';
  if (n === 0) return 'C';

  switch (persona) {
    case 'investor':
      if (level === 'easy') return gotD(last) && draw(seed, n, 0) >= 0.2 ? 'D' : 'C';
      if (level === 'normal') return gotD(last) && h.slice(-4).filter(gotD).length >= 2 ? 'D' : 'C';
      if (n >= 4 && recentMeantD(4) >= 2) return 'D';
      return meantD(last) ? 'D' : 'C';
    case 'banker': {
      if (level === 'easy') return h.filter((r) => r.p === 'C').length * 2 >= n ? 'C' : 'D';
      const bad = level === 'hard' ? meantD : gotD;
      if (level === 'hard' && finalRound) return 'D';
      if (!h.some(bad)) return 'C';
      return n >= 2 && !bad(last) && !bad(prev) ? 'C' : 'D';
    }
    case 'dealmaker':
      if (level === 'easy') return gotD(last) && draw(seed, n, 0) < 0.5 ? 'D' : 'C';
      if (level === 'normal') return mutualDStreak && !(n >= 4 && h.slice(-4).every(gotD)) ? 'C' : last.p;
      if (finalRound && h.filter(meantD).length >= 2) return 'D';
      if (n >= 4 && recentMeantD(4) >= 3) return meantD(last) ? 'D' : 'C';
      if (mutualDStreak) return 'C';
      return meantD(last) ? 'D' : 'C';
    case 'opportunist': {
      if (level === 'easy') {
        if (n >= 3 && h.slice(-3).every((r) => r.p === 'C')) return 'D';
        return last.p === 'D' && last.b === 'D' ? 'C' : last.p;
      }
      if (level === 'normal') {
        let j = -1;
        for (let i = n - 1; i >= 0; i--) if (h[i].bi === 'D') { j = i; break; }
        if (j >= 0 && j + 1 < n && h[j + 1].pi === 'C' && last.pi === 'C') return 'D';
        if (n >= 3 && h.slice(-3).every((r) => r.p === 'C' && r.b === 'C')) return 'D';
        return last.p;
      }
      if (finalRound) return 'D';
      const [c, samples] = forgivenessAfterBotD(h);
      if (samples >= 2 && c / samples >= 0.6) return 'D';
      if (predictPlayer(h) === 'C' && samples >= 1 && c === samples) return 'D';
      if (n === 4 && h.every((r) => r.p === 'C' && r.b === 'C')) return 'D';
      return last.p;
    }
  }
}

/** Relationship strength 0–100 from the shared history: mutual cooperation builds it, betrayals break it. */
export function trustLevel(h: readonly CoopRound[]): number {
  let t = 50;
  for (const r of h) {
    if (r.p === 'C' && r.b === 'C') t += 12;
    else if (r.p === 'D' && r.b === 'D') t -= 15;
    else t -= r.pi === r.p && r.bi === r.b ? 35 : 10; // a slip strains trust less than a betrayal
    t = Math.min(100, Math.max(0, t));
  }
  return t;
}

function validate(s: CoopState, a: unknown): string | null {
  if (s.rounds.length >= s.total) return 'The match is over.';
  if (a !== 'C' && a !== 'D') return 'Choose Cooperate or Defect.';
  return null;
}

function apply(s: CoopState, a: CoopMove): CoopState {
  const why = validate(s, a);
  if (why) throw new Error(`cooperation: ${why}`);
  const n = s.rounds.length;
  const bi = coopBotMove(s.setup, s.total, s.rounds);
  const noisy = s.setup.variant === 'noisy';
  const p = noisy && draw(s.setup.seed, n, 10) < COOP_NOISE ? flip(a) : a;
  const b = noisy && draw(s.setup.seed, n, 11) < COOP_NOISE ? flip(bi) : bi;
  const [ps, bs] = coopPayoff(COOP_PAYOFFS[s.setup.variant], p, b);
  return { ...s, rounds: [...s.rounds, { pi: a, bi, p, b, ps, bs }] };
}

const sum = (h: readonly CoopRound[], f: (r: CoopRound) => number) => h.reduce((t, r) => t + f(r), 0);

export function coopDebrief(s: CoopState): Debrief {
  const h = s.rounds;
  const pay = COOP_PAYOFFS[s.setup.variant];
  const you = sum(h, (r) => r.ps);
  const them = sum(h, (r) => r.bs);
  const allC = pay.R * h.length;
  // Candidate moments, each tagged with its round so the debrief reads in match order.
  const moments: { at: number; text: string }[] = [];

  // Being betrayed: the first time you cooperated into a defection, and how you answered.
  const hits = h.map((r, i) => (r.p === 'C' && r.b === 'D' ? i : -1)).filter((i) => i >= 0);
  if (hits.length) {
    const i = hits[0];
    let streak = 0;
    for (let k = i - 1; k >= 0 && h[k].p === 'C' && h[k].b === 'C'; k--) streak += 1;
    const next = h[i + 1];
    const reply = !next ? ' It was the last round, so there was no way to answer.' : next.pi === 'D' ? ' You answered with a defection the next round.' : ' You cooperated again straight after.';
    const more = hits.length >= 2 ? ` In all, it caught you cooperating ${plural(hits.length, 'time')}.` : '';
    moments.push({ at: i, text: `Round ${i + 1}: ${streak >= 2 ? `after ${streak} rounds of mutual cooperation, ` : ''}it defected while you cooperated — ${pay.S} for you, ${pay.T} for it.${reply}${more}` });
  }

  // Your first deliberate defection, and what it cost or earned over the next rounds.
  const first = h.findIndex((r) => r.pi === 'D');
  if (first >= 0) {
    const r = h[first];
    const after = h.slice(first + 1, first + 4);
    const answered = after.filter((x) => x.b === 'D').length;
    const gain = r.b === 'C' ? `took ${r.ps} instead of ${pay.R}` : `met its defection (${r.ps} each)`;
    moments.push({
      at: first,
      text:
        after.length === 0
          ? `You defected in round ${first + 1}, the last round, and ${gain} — there was no round left for a reply.`
          : `You first defected in round ${first + 1} and ${gain}. ${answered === 0 ? 'The opponent didn’t retaliate' : `It defected in ${answered} of the next ${after.length} rounds`}; those rounds paid you ${sum(after, (x) => x.ps)}, against ${pay.R * after.length} for steady cooperation.`,
    });
  }

  // A long run of mutual cooperation.
  let best = 0;
  let bestEnd = 0;
  let run = 0;
  h.forEach((r, i) => {
    run = r.p === 'C' && r.b === 'C' ? run + 1 : 0;
    if (run > best) {
      best = run;
      bestEnd = i;
    }
  });
  if (moments.length < 2 && best >= 3) moments.push({ at: bestEnd - best + 1, text: `Rounds ${bestEnd - best + 2}–${bestEnd + 1}: ${best} rounds of mutual cooperation, worth ${best * pay.R} each.` });

  // Slips in the noisy line.
  const slips = h.map((r, i) => (r.p !== r.pi || r.b !== r.bi ? i : -1)).filter((i) => i >= 0);
  if (s.setup.variant === 'noisy' && slips.length && moments.length < 3) moments.push({ at: slips[0], text: `${plural(slips.length, 'round')} had a slip, the first in round ${slips[0] + 1}. How each of you treated an accident — as betrayal or noise — shaped what came next.` });

  const botFirst = hits.length > 0 && (first < 0 || hits[0] <= first);
  const lastR = h[h.length - 1];
  const endgame = lastR && lastR.pi === 'D' && lastR.b === 'C' ? ' Defecting in the final round paid because no reply could follow.' : '';
  const insight =
    you >= allC * 0.85
      ? `You finished with ${you} of a possible ${allC} for unbroken cooperation. Repeated play gives trust a value no single round has.${endgame}`
      : botFirst
        ? `Some opponents test whether a betrayal goes unpunished. Answering a defection promptly — then returning to cooperation — makes exploiting you unprofitable; cooperating regardless invites more. Expect the test late in a match, when a reply has fewer rounds to bite.`
        : first >= 0 && first < h.length - 1 && you < allC * 0.6
          ? `Defection paid once, but the reply cost more: ${you} points against ${allC} for cooperating every round. Against a reciprocal opponent, the next rounds are part of the price.${endgame}`
          : `You scored ${you}; steady mutual cooperation would have given ${allC}, mutual defection ${pay.P * h.length}. Where you landed between them depended on how each of you answered the other.${endgame}`;

  return {
    headline: you > them ? 'Your strategy paid' : you < them ? 'The opponent came out ahead' : 'Dead level',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: coopRead(s.setup.persona, h),
  };
}

function coopRead(persona: Persona, h: readonly CoopRound[]): string {
  let afterD = 0;
  let answeredD = 0;
  let afterC = 0;
  let returnedC = 0;
  for (let i = 0; i + 1 < h.length; i++) {
    if (h[i].p === 'D') {
      afterD += 1;
      if (h[i + 1].bi === 'D') answeredD += 1;
    } else {
      afterC += 1;
      if (h[i + 1].bi === 'C') returnedC += 1;
    }
  }
  const evidence = [afterD ? `after your defections it defected next ${answeredD} of ${afterD} times` : null, afterC ? `after your cooperation it cooperated ${returnedC} of ${afterC} times` : null].filter(Boolean).join('; ');
  const style: Record<Persona, string> = {
    investor: 'The Investor protects a profitable relationship: it tolerates a lot, but not a pattern of betrayal.',
    banker: 'The Banker runs one consistent rule: trust is earned back with steady cooperation.',
    dealmaker: 'The Deal Maker reciprocates and repairs: it answers betrayal, then offers a way back.',
    opportunist: 'The Opportunist tests for weakness and defects when it expects no punishment.',
  };
  return `${style[persona]}${evidence ? ` In this match, ${evidence}.` : ''}`;
}

export const cooperation: ArenaEngine<CoopState, CoopMove, CoopVariant> = {
  id: 'cooperation',
  variants: COOP_VARIANTS,
  rounds: coopRounds,
  create: (setup) => ({ setup, total: coopRounds(setup.length), rounds: [] }),
  validate,
  apply,
  isOver: (s) => s.rounds.length >= s.total,
  played: (s) => s.rounds.length,
  result: (s) =>
    resultFrom(
      [
        { id: 'you', name: 'You', score: sum(s.rounds, (r) => r.ps), isPlayer: true },
        { id: s.setup.persona, name: PERSONA_NAME[s.setup.persona], score: sum(s.rounds, (r) => r.bs), isPlayer: false },
      ],
      'points',
      { par: coopPar(s), parLabel: '70% of steady cooperation' },
    ),
  debrief: coopDebrief,
};

/** The score a win needs: 70 % of what cooperating every round pays (rounded up). */
export function coopPar(s: Pick<CoopState, 'setup' | 'total'>): number {
  return Math.ceil(0.7 * COOP_PAYOFFS[s.setup.variant].R * s.total);
}
