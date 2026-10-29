import { type ArenaEngine, LENGTH_ROUNDS, type Level, type Setup, draw, resultFrom } from './core.ts';
import { coopDebrief } from './cooperation-analysis.ts';

/**
 * The Cooperation Game — a repeated prisoner's dilemma against one opponent, both choices locked in secret.
 *
 * Payoffs live only here (COOP_PAYOFFS); the UI and analysis read them. Every variant satisfies T > R > P > S and
 * 2R > T + S: defecting pays more in any single round, mutual cooperation beats mutual defection, and taking turns
 * exploiting each other is worse than steady cooperation.
 *
 *               Classic (default)   High stakes
 *   both C          3 / 3              5 / 5      R
 *   D vs C          5 / 0              8 / −2     T / S
 *   both D          1 / 1              1 / 1      P
 *
 * Noisy line (challenge): classic payoffs, but each side's choice is mis-delivered with probability 10 %. Slips are
 * drawn from the seed (independent of difficulty and of anyone's choice) and revealed to both sides after the round.
 *
 * Round count is fixed at creation (6, 10 by default, or 14) and announced up front. Higher total score wins; equal
 * totals are a draw.
 *
 * Lifecycle (all pure): `cooperation.create(setup)` → for each round, `apply(state, { move, round })`. The action names
 * the round it answers, so a duplicated or stale submission is refused instead of resolving a round twice. The
 * opponent's move is computed inside `apply` from completed rounds only, before the player's move is looked at.
 */

export type CoopMove = 'C' | 'D';
export type CoopVariant = 'classic' | 'high-stakes' | 'noisy';
export const COOP_VARIANTS: readonly CoopVariant[] = ['classic', 'high-stakes', 'noisy'];

export const COOP_OPPONENTS = ['collaborator', 'retaliator', 'opportunist', 'chameleon'] as const;
export type CoopOpponent = (typeof COOP_OPPONENTS)[number];
export const COOP_NAME: Record<CoopOpponent, string> = { collaborator: 'The Collaborator', retaliator: 'The Retaliator', opportunist: 'The Opportunist', chameleon: 'The Chameleon' };

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

export type CoopSetup = Setup<CoopVariant, CoopOpponent>;

export interface CoopState {
  setup: CoopSetup;
  total: number;
  rounds: CoopRound[];
}

/** The player's committed move for a specific round (0-based). */
export interface CoopAction {
  move: CoopMove;
  round: number;
}

export function coopPayoff(pay: Payoffs, p: CoopMove, b: CoopMove): [number, number] {
  if (p === 'C' && b === 'C') return [pay.R, pay.R];
  if (p === 'D' && b === 'C') return [pay.T, pay.S];
  if (p === 'C' && b === 'D') return [pay.S, pay.T];
  return [pay.P, pay.P];
}

const flip = (m: CoopMove): CoopMove => (m === 'C' ? 'D' : 'C');

// ── Bot tuning (difficulty) — kept apart from the policies below ─────────────

/**
 * Per-difficulty numbers for each policy. Difficulty changes how well a bot reasons (forgiveness, memory, pattern
 * reading, endgame awareness) — never the payoffs or the scores.
 */
export const COOP_TUNING = {
  collaborator: {
    easy: { forgive: 0.75, forgivesIsolated: false, guardAt: Infinity, recover: 1, slipsForgiven: false, readsPatterns: false },
    normal: { forgive: 0.5, forgivesIsolated: false, guardAt: 3, recover: 1, slipsForgiven: false, readsPatterns: false },
    hard: { forgive: 0.34, forgivesIsolated: true, guardAt: 2, recover: 2, slipsForgiven: true, readsPatterns: true },
  },
  retaliator: {
    easy: { forgive: 0.4, punishRepeated: false, mercy: 0, slipsForgiven: false },
    normal: { forgive: 0, punishRepeated: false, mercy: 0, slipsForgiven: false },
    hard: { forgive: 0, punishRepeated: true, mercy: 0.1, slipsForgiven: true },
  },
  opportunist: {
    easy: { mode: 'habit' as const },
    normal: { mode: 'probe' as const },
    hard: { mode: 'model' as const, forgivenessToExploit: 0.6 },
  },
  chameleon: {
    easy: { mode: 'mirror' as const, window: 3, mistake: 0.15 },
    normal: { mode: 'rates' as const, minEvidence: 4 },
    hard: { mode: 'profile' as const, minEvidence: 4 },
  },
} satisfies Record<CoopOpponent, Record<Level, object>>;

// ── Shared reading of the history ───────────────────────────────────────────

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
export function forgivenessAfterBotD(h: readonly CoopRound[]): [number, number] {
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

export type PlayerProfile = 'unknown' | 'pushover' | 'reciprocal' | 'cooperative' | 'aggressive' | 'erratic';

/**
 * How the Chameleon (Hard) reads the player from completed rounds:
 * - unknown: fewer than `minEvidence` rounds.
 * - pushover: cooperates ≥ 70 % and keeps cooperating after most of the bot's defections (≥ 1 sample).
 * - reciprocal: copies the bot's previous move ≥ 75 % of the time.
 * - cooperative: cooperates ≥ 70 % (and answers defections).
 * - aggressive: cooperates ≤ 35 %.
 * - erratic: anything else.
 */
export function profilePlayer(h: readonly CoopRound[], minEvidence = 4): PlayerProfile {
  const n = h.length;
  if (n < minEvidence) return 'unknown';
  const coopRate = h.filter((r) => r.pi === 'C').length / n;
  const [forgave, samples] = forgivenessAfterBotD(h);
  let copied = 0;
  for (let i = 1; i < n; i++) if (h[i].pi === h[i - 1].b) copied += 1;
  if (coopRate >= 0.7 && samples >= 1 && forgave / samples > 0.5) return 'pushover';
  if (copied / (n - 1) >= 0.75) return 'reciprocal';
  if (coopRate >= 0.7) return 'cooperative';
  if (coopRate <= 0.35) return 'aggressive';
  return 'erratic';
}

// ── The four policies ───────────────────────────────────────────────────────

/**
 * The Collaborator — cooperates by default and forgives, but guards against repeated exploitation.
 * Opening: cooperates. After a defection it forgives with probability `forgive` (Easy 75 %, Normal 50 %, Hard 34 %).
 * Hard never punishes an isolated defection (the only one in the last four rounds) — it absorbs a one-off betrayal.
 * Guard: once the player has defected `guardAt` times in the last four rounds (Normal 3, Hard 2, Easy never), it
 * defects until the player cooperates `recover` rounds in a row (Normal 1, Hard 2). Hard also forgives slips and,
 * against a player whose last four moves alternate, defects when the pattern says a defection is coming.
 */
function collaborator(setup: CoopSetup, h: readonly CoopRound[]): CoopMove {
  const t = COOP_TUNING.collaborator[setup.level];
  const n = h.length;
  if (n === 0) return 'C';
  const bad = t.slipsForgiven ? meantD : gotD;
  if (h.slice(-4).filter(bad).length >= t.guardAt) {
    const recovered = n >= t.recover && h.slice(-t.recover).every((r) => !bad(r));
    if (!recovered) return 'D';
  }
  if (t.readsPatterns && predictPlayer(h) === 'D' && h.slice(-4).some(bad) && !h.slice(-4).every(bad)) return 'D';
  if (bad(h[n - 1])) {
    if (t.forgivesIsolated && h.slice(-4).filter(bad).length === 1) return 'C';
    return draw(setup.seed, n, 0) < t.forgive ? 'C' : 'D';
  }
  return 'C';
}

/**
 * The Retaliator — reciprocity.
 * Opening: cooperates. Easy: answers a defection with one, but lets it go 40 % of the time. Normal: strict
 * tit-for-tat (copies the player's last delivered move). Hard: forgives slips; an isolated defection (the only one in
 * the last four rounds) gets one answer, with a 10 % chance of mercy; repeated exploitation (two or more in the last
 * four) gets a two-round answer, so cooperation must be shown, not just offered once.
 */
function retaliator(setup: CoopSetup, h: readonly CoopRound[]): CoopMove {
  const t = COOP_TUNING.retaliator[setup.level];
  const n = h.length;
  if (n === 0) return 'C';
  const bad = t.slipsForgiven ? meantD : gotD;
  const last = h[n - 1];
  const prev = h[n - 2];
  if (!t.punishRepeated) return bad(last) && draw(setup.seed, n, 0) >= t.forgive ? 'D' : 'C';
  const repeated = h.slice(-4).filter(bad).length >= 2;
  if (bad(last)) return !repeated && draw(setup.seed, n, 0) < t.mercy ? 'C' : 'D';
  if (repeated && bad(prev)) return 'D';
  return 'C';
}

/**
 * The Opportunist — takes short-term gains where they look safe.
 * Easy (a habit you can spot): copies your last move, but defects whenever you cooperated in both of the last two
 * rounds; after a mutual defection it cooperates again.
 * Normal (probe and exploit): tit-for-tat, but defects after three rounds of mutual cooperation. If you have never
 * answered its defections, it keeps defecting while you keep cooperating; once you answer one, it offers cooperation
 * the next round instead of trading blows.
 * Hard (models you): measures how often you cooperate right after its defections — at 60 % or more over two or more
 * samples it defects; it also defects against a predictable cooperator who has never punished it, probes once in
 * round 5 after unbroken cooperation, and always defects in the final round. Otherwise tit-for-tat.
 */
function opportunist(setup: CoopSetup, total: number, h: readonly CoopRound[]): CoopMove {
  const t = COOP_TUNING.opportunist[setup.level];
  const n = h.length;
  if (n === 0) return 'C';
  const last = h[n - 1];
  const prev = h[n - 2];
  if (t.mode === 'habit') {
    if (n >= 2 && last.p === 'C' && prev.p === 'C') return 'D';
    return last.p === 'D' && last.b === 'D' ? 'C' : last.p;
  }
  if (t.mode === 'probe') {
    const [forgave, samples] = forgivenessAfterBotD(h);
    if (samples >= 1 && forgave === samples && last.pi === 'C') return 'D';
    if (n >= 2 && h[n - 2].b === 'D' && last.pi === 'D') return 'C';
    if (n >= 3 && h.slice(-3).every((r) => r.p === 'C' && r.b === 'C')) return 'D';
    return last.p;
  }
  if (n === total - 1) return 'D';
  const [c, samples] = forgivenessAfterBotD(h);
  if (samples >= 2 && c / samples >= t.forgivenessToExploit) return 'D';
  if (predictPlayer(h) === 'C' && samples >= 1 && c === samples) return 'D';
  if (n === 4 && h.every((r) => r.p === 'C' && r.b === 'C')) return 'D';
  return last.p;
}

/**
 * The Chameleon — reads you and changes its policy.
 * Opening: cooperates in rounds 1–2; on Normal and Hard it defects in round 3 as a probe (to see whether you answer).
 * Easy (mirror): from round 3, plays the majority of your last three moves (cooperates on a tie), and gets it
 *   wrong 15 % of the time.
 * Normal (broad rates): after four rounds, cooperates if you've cooperated ≥ 70 %, defects if ≤ 35 %, otherwise
 *   tit-for-tat.
 * Hard (profile, see profilePlayer): exploits a pushover, cooperates with reciprocal and cooperative players (but
 *   still answers a defection the round after it),
 *   defects against an aggressive one, plays tit-for-tat against an erratic one, defects whenever your last four
 *   moves form a plain pattern that says a defection is next (always defecting, or strict alternation) — and defects
 *   in the final round against anyone who isn't aggressive (no reply can follow).
 */
function chameleon(setup: CoopSetup, total: number, h: readonly CoopRound[]): CoopMove {
  const t = COOP_TUNING.chameleon[setup.level];
  const n = h.length;
  const last = h[n - 1];
  if (n < 2) return 'C';
  if (t.mode === 'mirror') {
    const window = h.slice(-t.window);
    const coop = window.filter((r) => r.p === 'C').length;
    const pick: CoopMove = coop * 2 >= window.length ? 'C' : 'D';
    return draw(setup.seed, n, 0) < t.mistake ? flip(pick) : pick;
  }
  if (n === 2) return 'D';
  if (n < t.minEvidence) return last.p;
  if (t.mode === 'rates') {
    const rate = h.filter((r) => r.p === 'C').length / n;
    return rate >= 0.7 ? 'C' : rate <= 0.35 ? 'D' : last.p;
  }
  const profile = profilePlayer(h, t.minEvidence);
  if (n === total - 1 && profile !== 'aggressive') return 'D';
  if (predictPlayer(h) === 'D') return 'D';
  if (profile === 'pushover' || profile === 'aggressive') return 'D';
  if (profile === 'reciprocal' || profile === 'cooperative') return last.p === 'D' ? 'D' : 'C';
  return last.p;
}

/** The opponent's intended move for round `h.length`, from completed rounds only. */
export function coopBotMove(setup: CoopSetup, total: number, h: readonly CoopRound[]): CoopMove {
  switch (setup.persona) {
    case 'collaborator':
      return collaborator(setup, h);
    case 'retaliator':
      return retaliator(setup, h);
    case 'opportunist':
      return opportunist(setup, total, h);
    case 'chameleon':
      return chameleon(setup, total, h);
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export function validateCoop(s: CoopState, a: unknown): string | null {
  if (s.rounds.length >= s.total) return 'The match is over.';
  if (!a || typeof a !== 'object') return 'Choose Cooperate or Defect.';
  const { move, round } = a as Partial<CoopAction>;
  if (move !== 'C' && move !== 'D') return 'Choose Cooperate or Defect.';
  if (round !== s.rounds.length) return 'That choice was for a round that has already been played.';
  return null;
}

/** Resolves the current round exactly once. Throws on an illegal, duplicate or late action. */
export function resolveCoop(s: CoopState, a: CoopAction): CoopState {
  const why = validateCoop(s, a);
  if (why) throw new Error(`cooperation: ${why}`);
  const n = s.rounds.length;
  const bi = coopBotMove(s.setup, s.total, s.rounds);
  const noisy = s.setup.variant === 'noisy';
  const p = noisy && draw(s.setup.seed, n, 10) < COOP_NOISE ? flip(a.move) : a.move;
  const b = noisy && draw(s.setup.seed, n, 11) < COOP_NOISE ? flip(bi) : bi;
  const [ps, bs] = coopPayoff(COOP_PAYOFFS[s.setup.variant], p, b);
  return { ...s, rounds: [...s.rounds, { pi: a.move, bi, p, b, ps, bs }] };
}

export const coopTotals = (h: readonly CoopRound[]) => ({ player: h.reduce((t, r) => t + r.ps, 0), bot: h.reduce((t, r) => t + r.bs, 0) });

export const cooperation: ArenaEngine<CoopState, CoopAction, CoopVariant> = {
  id: 'cooperation',
  opponents: COOP_OPPONENTS,
  variants: COOP_VARIANTS,
  rounds: coopRounds,
  create: (setup) => ({ setup: setup as CoopSetup, total: coopRounds(setup.length), rounds: [] }),
  validate: validateCoop,
  apply: resolveCoop,
  isOver: (s) => s.rounds.length >= s.total,
  played: (s) => s.rounds.length,
  result: (s) => {
    const t = coopTotals(s.rounds);
    return resultFrom(
      [
        { id: 'you', name: 'You', score: t.player, isPlayer: true },
        { id: s.setup.persona, name: COOP_NAME[s.setup.persona], score: t.bot, isPlayer: false },
      ],
      'points',
    );
  },
  debrief: coopDebrief,
};
