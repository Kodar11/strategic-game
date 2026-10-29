import { personality } from './catalog.ts';
import type { Difficulty, GameId } from './core.ts';
import { RPS_INSIGHT } from './rps.ts';
import { RPS_READS, isRpsBot } from './rps-insight.ts';
import type { SplitRound } from './split-steal.ts';
import type { StagRound } from './stag-hunt.ts';
import { TT_GROUP, type TwoThirdsRound, roundStats } from './two-thirds.ts';
import type { UltimatumRound } from './ultimatum.ts';

/**
 * "Read your opponent" for every practice game, generalising the Rock, Paper, Scissors read (rps-insight.ts) to Split
 * or Steal, Stag Hunt, the Ultimatum and Two-Thirds. The engines are untouched (they keep their SQL parity): this is
 * only the player-facing layer.
 *
 * - A practice match with no chosen opponent is a mystery match; the device picks the personality and hides it.
 * - One prediction, open after `minRounds` revealed rounds (enough decisions to tell personalities apart), locked when
 *   made. If none was made by the end, the reveal waits for one (or a skip).
 * - A right read earns RPS_INSIGHT.points Insight Points, as in Rock, Paper, Scissors; a wrong one costs nothing.
 *   Match points, the bot and the outcome never depend on it.
 * - The options describe each personality at the match's difficulty; every line restates the engine's documented
 *   policy, so a careful player can actually tell them apart.
 * - The reveal's evidence is counted from the recorded rounds only.
 */

type ClassicId = Exclude<GameId, 'rps'>;

export interface ClassicRead {
  minRounds: number;
  /** Who the read is about, as the panel says it. */
  target: string;
  describe: Record<string, Record<Difficulty, string>>;
}

export const CLASSIC_READ: Record<ClassicId, ClassicRead> = {
  'split-steal': {
    minRounds: 4,
    target: 'your opponent',
    describe: {
      cooperator: { easy: 'Always splits.', medium: 'Splits — unless you stole two rounds running; then it steals once.', hard: 'Copies your last choice, but forgives a steal one time in three.' },
      opportunist: { easy: 'Steals on a coin flip.', medium: 'Splits twice, then steals whenever you split in both of the last two rounds.', hard: 'Copies your last choice, but steals after three splits in a row and in the last two rounds.' },
      retaliator: { easy: 'Copies your last choice: one steal answers one steal.', medium: 'Steals if you stole in either of the last two rounds.', hard: 'Splits until your first steal — then never splits again.' },
      strategist: { easy: 'Splits for three rounds, then splits only if you split in two of the last three.', medium: 'Splits when you both made the same choice last round, steals otherwise.', hard: 'Copies you, but steals against frequent stealers, exploits a steady splitter late, and steals in the final round.' },
    },
  },
  'stag-hunt': {
    minRounds: 3,
    target: 'your partner',
    describe: {
      cautious: { easy: 'Always hunts hare.', medium: 'Hunts stag only after you hunted stag three rounds running.', hard: 'Hunts stag only once you’ve hunted stag nearly every round.' },
      optimist: { easy: 'Always hunts stag.', medium: 'Hunts stag, but takes one hare after two failed stag hunts in a row.', hard: 'Hunts stag most of the time while you join it at least sometimes.' },
      opportunistic: { easy: 'Hunts stag only if you hunted stag last round.', medium: 'Hunts stag when you’ve hunted stag in more than 3/5 of rounds.', hard: 'Hunts stag when your recent rounds (most recent counting most) are mostly stag.' },
      conditional: { easy: 'Opens with stag, then hunts stag while you join at least half the time.', medium: 'Opens with stag, then hunts stag while you join at least 60% of the time.', hard: 'Opens with stag, then hunts stag while you join 70% of the time — and joined last round.' },
    },
  },
  ultimatum: {
    minRounds: 4,
    target: 'your opponent',
    describe: {
      maximizer: { easy: 'Offers 1–3 at random; accepts any offer.', medium: 'Offers 2, and 1 more only after you reject; accepts any offer.', hard: 'Probes your floor: 1 less after you accept, 1 more after you reject; accepts any offer.' },
      fair: { easy: 'Offers 5; accepts 3 or more.', medium: 'Offers 5; accepts 4 or more.', hard: 'Offers 5 (4 if you lowballed it); accepts 4 or more.' },
      hardliner: { easy: 'Offers 4; accepts 4 or more.', medium: 'Offers 4; accepts only 5 or more.', hard: 'Offers 3; accepts only 5 or more — 6 once you’ve offered it 2 or less.' },
      negotiator: { easy: 'Opens at 5; offers more after you reject, less after you accept; asks more after accepting.', medium: 'Opens at 4; offers more after you reject, less after you accept; asks more after accepting.', hard: 'Opens at 3; offers more after you reject, less after you accept; asks more after accepting.' },
    },
  },
  'two-thirds': {
    minRounds: 2,
    target: 'the crowd',
    describe: {
      'crowd-follower': { easy: 'Most of the crowd picks near last round’s average.', medium: 'Most of the crowd picks a little below last round’s average.', hard: 'Most of the crowd follows the trend of the averages, then takes ⅔ of it.' },
      shallow: { easy: 'Most of the crowd picks about 33 — ⅔ of 50.', medium: 'Most of the crowd picks close to 33.', hard: 'Most of the crowd picks ⅔ of last round’s average.' },
      deep: { easy: 'Most of the crowd picks about 22 — two steps of ⅔ from 50.', medium: 'Most of the crowd reasons three steps down at first, then two from the last average.', hard: 'Most of the crowd reasons several steps below where the group actually was.' },
      chaos: { easy: 'Most of the crowd picks anywhere from 0 to 100.', medium: 'Most of the crowd picks anywhere from 0 to 66.', hard: 'Most of the crowd picks around 40, rarely extreme.' },
    },
  },
};

export const readMinRounds = (game: GameId) => (game === 'rps' ? RPS_INSIGHT.minRounds : CLASSIC_READ[game].minRounds);
export const readTarget = (game: GameId) => (game === 'rps' ? 'your opponent' : CLASSIC_READ[game].target);

/** The read options at a difficulty, in the catalog's order (which never hints at the answer). */
export function readOptions(game: GameId, bots: readonly string[], difficulty: Difficulty): { id: string; name: string; description: string }[] {
  return bots.map((b) => ({
    id: b,
    name: personality(game, b)?.name ?? b,
    description: game === 'rps' ? (isRpsBot(b) ? RPS_READS[b][difficulty] : '') : (CLASSIC_READ[game].describe[b]?.[difficulty] ?? ''),
  }));
}

/** The hidden opponent for a practice match with no choice, from `u` ∈ [0, 1). */
export function pickHidden(bots: readonly string[], u: number): string {
  return bots[Math.min(bots.length - 1, Math.floor(u * bots.length))];
}

export interface ReadLock {
  guess: string;
  round: number;
}
export interface ReadStatus {
  mystery: boolean;
  roundsPlayed: number;
  totalRounds: number;
  revealed: boolean;
}

export const readIsOpen = (read: ReadLock | null, s: ReadStatus, minRounds: number) => s.mystery && read === null && !s.revealed && s.roundsPlayed >= minRounds;
export const readIsAwaited = (read: ReadLock | null, s: ReadStatus, minRounds: number) => readIsOpen(read, s, minRounds) && s.roundsPlayed >= s.totalRounds;
/** Locks one guess. A second guess, an early one, or a name that isn't one of `bots` leaves `read` unchanged. */
export function lockRead(read: ReadLock | null, guess: unknown, s: ReadStatus, minRounds: number, bots: readonly string[]): ReadLock | null {
  if (!readIsOpen(read, s, minRounds) || typeof guess !== 'string' || !bots.includes(guess)) return read;
  return { guess, round: s.roundsPlayed };
}
export const readPoints = (read: ReadLock | null, bot: string) => (read ? { correct: read.guess === bot, points: read.guess === bot ? RPS_INSIGHT.points : 0 } : null);

// ── Evidence (counted from the recorded rounds) ─────────────────────────────────────────


function afterEvidence<R extends { p: string; b: string }>(rounds: readonly R[], a: string, b: string, aName: string, bName: string): string[] {
  const out: string[] = [];
  const own = rounds.filter((r) => r.b === b).length;
  out.push(`It chose ${bName} in ${own} of ${rounds.length} rounds.`);
  const afterA = rounds.slice(1).filter((_, i) => rounds[i].p === a);
  const afterB = rounds.slice(1).filter((_, i) => rounds[i].p !== a);
  if (afterA.length) out.push(`After you chose ${aName}, it chose ${bName} next round ${afterA.filter((r) => r.b === b).length} of ${afterA.length} times.`);
  if (afterB.length) out.push(`After your other choices, ${afterB.filter((r) => r.b === b).length} of ${afterB.length}.`);
  return out;
}

export function classicEvidence(game: ClassicId, rounds: readonly unknown[]): string[] {
  if (game === 'split-steal') {
    const rs = rounds as SplitRound[];
    const out = afterEvidence(rs, 'steal', 'steal', 'Steal', 'Steal');
    const last = rs[rs.length - 1];
    if (last) out.push(`In the final round it chose ${last.b === 'steal' ? 'Steal' : 'Split'}.`);
    return out;
  }
  if (game === 'stag-hunt') {
    const rs = rounds as StagRound[];
    const out = afterEvidence(rs, 'stag', 'stag', 'Stag', 'Stag');
    if (rs[0]) out.push(`It opened with ${rs[0].b === 'stag' ? 'Stag' : 'Hare'}.`);
    return out.slice(0, 3);
  }
  if (game === 'ultimatum') {
    const rs = rounds as UltimatumRound[];
    const offers = rs.filter((r) => r.proposer === 'bot').map((r) => r.offer);
    const yours = rs.filter((r) => r.proposer === 'player');
    const out = [`It offered you ${offers.join(', ') || 'nothing yet'} (of 10).`];
    if (yours.length) out.push(`Of your offers it accepted ${yours.filter((r) => r.accepted).map((r) => r.offer).join(', ') || 'none'}${yours.some((r) => !r.accepted) ? ` and rejected ${yours.filter((r) => !r.accepted).map((r) => r.offer).join(', ')}` : ''}.`);
    return out;
  }
  const rs = rounds as TwoThirdsRound[];
  // The first five bots in the lineup are the chosen crowd type.
  const crowd = rs.map((r) => Math.round(r.bots.slice(0, 5).reduce((a, b) => a + b, 0) / 5));
  const out = [`The crowd’s typical pick (5 of ${TT_GROUP} bots) went ${crowd.join(' → ')}.`];
  if (rs.length) out.push(`Targets were ${rs.map((r) => Math.round(roundStats(r).target)).join(', ')}.`);
  return out;
}

/** One practical thing to try next time. */
export function classicTakeaway(game: ClassicId, bot: string): string {
  const t: Record<string, string> = {
    cooperator: 'It rewards trust. Splitting steadily earns the most; stealing gains a round and costs the partnership.',
    opportunist: 'It exploits trust that never answers back. Show you retaliate, and it behaves.',
    retaliator: 'Every steal comes back to you. Cooperate consistently — on Hard, one steal ends the partnership for good.',
    strategist: 'It reads your record. Be a reliable splitter early, and watch the final rounds.',
    cautious: 'It needs a run of stag hunts before it trusts you. Commit early and consistently, or settle for hare.',
    optimist: 'It joins your stag hunt almost always — meet it there.',
    opportunistic: 'It hunts stag when your record says you will. Build that record.',
    conditional: 'It offers trust first and keeps it while you return it.',
    maximizer: 'It accepts anything, so offer little when you propose — and reject its lowballs to raise its offers.',
    fair: 'Fair offers are accepted and returned. Lowballing it only costs you.',
    hardliner: 'It won’t take less than half. Offer 5 and accept its 4s — rejecting them costs you more than it.',
    negotiator: 'Its offers and demands move with yours. Rejections raise its offers; acceptances raise its demands.',
    'crowd-follower': 'This crowd anchors on the past. Aim at ⅔ of where you expect it to land — below last round’s average.',
    shallow: 'This crowd thinks one step ahead: it lands near 33 at first. Go one step further.',
    deep: 'This crowd reasons several steps down. Undercut it, but not to 0 — the other bots keep the average up.',
    chaos: 'This crowd is noise around the middle. Aim at ⅔ of its average, not at the theory.',
  };
  return t[bot] ?? 'Watch how its choices change with yours.';
}

