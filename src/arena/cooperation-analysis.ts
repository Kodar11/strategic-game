import type { Debrief } from './core.ts';
import { COOP_NAME, COOP_PAYOFFS, type CoopRound, type CoopState, predictPlayer, profilePlayer, type PlayerProfile } from './cooperation.ts';

/**
 * Everything the Cooperation Game says about a match — round briefings, the opponent-history panel, final statistics,
 * insights and lessons — computed from the recorded rounds only. Every claim states its evidence ("x of y") and is
 * suppressed when the evidence is thin, so nothing shown can contradict what happened.
 *
 * Moves: statistics count what was delivered (`p`, `b`), which is what scored. "Your response" counts use what the
 * player chose (`pi`), which is what they decided.
 */

const pctOf = (k: number, n: number) => Math.round((k / n) * 100);
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const rounds = (n: number) => `${n} round${n === 1 ? '' : 's'}`;

export interface Ratio {
  k: number;
  n: number;
}

export interface CoopStats {
  rounds: number;
  player: number;
  bot: number;
  /** player − bot */
  diff: number;
  mutualC: number;
  mutualD: number;
  /** You cooperated, they defected. */
  exploited: number;
  /** You defected, they cooperated. */
  exploits: number;
  playerCoop: number;
  botCoop: number;
  /** Cooperation rates over completed rounds; null before any round is played. */
  playerCoopRate: number | null;
  botCoopRate: number | null;
  slips: number;
  /** After being exploited (with a round left), how often you defected next. */
  youAnsweredBetrayal: Ratio;
  /** After being exploited, how often you cooperated again next. */
  youKeptCooperating: Ratio;
  /** After your defection (with a round left), how often it defected next. */
  itAnsweredDefection: Ratio;
  /** After your cooperation (with a round left), how often it cooperated next. */
  itReturnedCooperation: Ratio;
  longestMutualC: number;
  longestMutualD: number;
  /** Combined points both sides earned in mutual-cooperation and mutual-defection rounds. */
  combinedMutualC: number;
  combinedMutualD: number;
  /** The strongest pattern in the match, or a statement that there wasn't a clear one. */
  pattern: string;
}

function after(h: readonly CoopRound[], when: (r: CoopRound) => boolean, then: (next: CoopRound) => boolean): Ratio {
  let k = 0;
  let n = 0;
  for (let i = 0; i + 1 < h.length; i++) {
    if (!when(h[i])) continue;
    n += 1;
    if (then(h[i + 1])) k += 1;
  }
  return { k, n };
}

function longest(h: readonly CoopRound[], when: (r: CoopRound) => boolean): number {
  let best = 0;
  let run = 0;
  for (const r of h) {
    run = when(r) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function coopStats(s: Pick<CoopState, 'setup' | 'rounds'>): CoopStats {
  const h = s.rounds;
  const pay = COOP_PAYOFFS[s.setup.variant];
  const n = h.length;
  const player = h.reduce((t, r) => t + r.ps, 0);
  const bot = h.reduce((t, r) => t + r.bs, 0);
  const mutualC = h.filter((r) => r.p === 'C' && r.b === 'C').length;
  const mutualD = h.filter((r) => r.p === 'D' && r.b === 'D').length;
  const exploited = h.filter((r) => r.p === 'C' && r.b === 'D').length;
  const exploits = h.filter((r) => r.p === 'D' && r.b === 'C').length;
  const playerCoop = h.filter((r) => r.p === 'C').length;
  const botCoop = h.filter((r) => r.b === 'C').length;
  const isExploited = (r: CoopRound) => r.p === 'C' && r.b === 'D';
  const stats: Omit<CoopStats, 'pattern'> = {
    rounds: n,
    player,
    bot,
    diff: player - bot,
    mutualC,
    mutualD,
    exploited,
    exploits,
    playerCoop,
    botCoop,
    playerCoopRate: n ? playerCoop / n : null,
    botCoopRate: n ? botCoop / n : null,
    slips: h.filter((r) => r.p !== r.pi || r.b !== r.bi).length,
    youAnsweredBetrayal: after(h, isExploited, (x) => x.pi === 'D'),
    youKeptCooperating: after(h, isExploited, (x) => x.pi === 'C'),
    itAnsweredDefection: after(h, (r) => r.p === 'D', (x) => x.b === 'D'),
    itReturnedCooperation: after(h, (r) => r.p === 'C', (x) => x.b === 'C'),
    longestMutualC: longest(h, (r) => r.p === 'C' && r.b === 'C'),
    longestMutualD: longest(h, (r) => r.p === 'D' && r.b === 'D'),
    combinedMutualC: mutualC * pay.R * 2,
    combinedMutualD: mutualD * pay.P * 2,
  };
  return { ...stats, pattern: strongestPattern(stats) };
}

/** The single most telling pattern, in priority order, only with enough evidence. */
function strongestPattern(st: Omit<CoopStats, 'pattern'>): string {
  if (st.rounds < 3) return 'Too few rounds to see a pattern.';
  if (st.mutualC === st.rounds) return `Cooperation every round, from both of you.`;
  if (st.mutualD === st.rounds) return `Defection every round, from both of you.`;
  if (st.longestMutualD >= 3) return `A ${st.longestMutualD}-round spell of mutual defection.`;
  if (st.youKeptCooperating.n >= 2 && st.youKeptCooperating.k >= 2) return `You kept cooperating after being exploited (${st.youKeptCooperating.k} of ${st.youKeptCooperating.n} times).`;
  if (st.itAnsweredDefection.n >= 2 && st.itAnsweredDefection.k / st.itAnsweredDefection.n >= 0.75) return `It answered your defections with one of its own (${st.itAnsweredDefection.k} of ${st.itAnsweredDefection.n}).`;
  if (st.longestMutualC >= 3) return `A ${st.longestMutualC}-round run of mutual cooperation.`;
  if (st.itReturnedCooperation.n >= 3 && st.itReturnedCooperation.k / st.itReturnedCooperation.n >= 0.75) return `It returned your cooperation (${st.itReturnedCooperation.k} of ${st.itReturnedCooperation.n}).`;
  return 'No single pattern stood out — the match was mixed.';
}

// ── Round briefing ──────────────────────────────────────────────────────────

function briefingCandidates(h: readonly CoopRound[], total: number): string[] {
  const n = h.length;
  const out: string[] = [];
  if (n === 0) return ['Round 1. Neither of you has a history yet — your first move sets the tone.'];
  const left = total - n;
  const last = h[n - 1];
  const streak = (pick: (r: CoopRound) => string) => {
    let k = 0;
    for (let i = n - 1; i >= 0 && pick(h[i]) === pick(last); i--) k += 1;
    return k;
  };
  if (left === 1) out.push('Final round. Whatever you choose, no reply can follow.');
  if (last.p !== last.pi) out.push(`Last round your ${last.pi === 'C' ? 'Cooperate' : 'Defect'} slipped. It was an accident — and both of you saw it.`);
  if (last.b !== last.bi) out.push(`Last round your opponent’s choice slipped: it meant to ${last.bi === 'C' ? 'cooperate' : 'defect'}.`);
  if (left === 3 && total >= 6) out.push('You’re entering the final three rounds.');
  if (last.p === 'C' && last.b === 'D') out.push('Your opponent defected while you cooperated last round.');
  const mutualD = last.p === 'D' && last.b === 'D' ? streak((r) => r.p + r.b) : 0;
  if (mutualD >= 2 && left >= 2) out.push(`Mutual defection for ${rounds(mutualD)}. There is still time to rebuild trust.`);
  if (last.b === 'D') out.push('Your opponent defected in the last round.');
  const mutualC = last.p === 'C' && last.b === 'C' ? streak((r) => r.p + r.b) : 0;
  if (mutualC >= 3) out.push(`${mutualC} rounds of mutual cooperation in a row.`);
  const mine = streak((r) => r.pi);
  if (mine >= 2) out.push(`You have ${last.pi === 'C' ? 'cooperated' : 'defected'} ${mine} times in a row.`);
  if (last.p === 'D' && last.b === 'C') out.push('You took the advantage last round while it cooperated.');
  if (last.b === 'C') out.push('Your opponent cooperated last round.');
  out.push(`${rounds(left)} left.`);
  return out;
}

/**
 * The briefing shown before round `h.length`: the most relevant true statement about the match so far, never the same
 * as the previous round's briefing.
 */
export function coopBriefing(h: readonly CoopRound[], total: number): string {
  let shown = '';
  for (let n = 0; n <= h.length; n++) {
    const c = briefingCandidates(h.slice(0, n), total);
    shown = c.find((x) => x !== shown) ?? c[0];
  }
  return shown;
}

// ── Reveal ──────────────────────────────────────────────────────────────────

/** What happened in a round, in plain words, without judging either choice. */
export function coopOutcomeText(r: CoopRound): string {
  const pts = (n: number) => `${n} point${n === 1 || n === -1 ? '' : 's'}`;
  if (r.p === 'C' && r.b === 'C') return `Good teamwork. You both earned ${pts(r.ps)}.`;
  if (r.p === 'C' && r.b === 'D') return `You gave them the opportunity to take the advantage. You earned ${r.ps} while they earned ${r.bs}.`;
  if (r.p === 'D' && r.b === 'C') return `You took the immediate advantage. You earned ${r.ps}, while they earned ${r.bs}.`;
  return `Neither of you trusted the other. You both earned ${pts(r.ps)}.`;
}

/**
 * A short note on how the opponent's move relates to what came before — a description of the sequence of events, never
 * a claim about its intentions. Null when there is nothing notable.
 */
export function coopRevealNote(h: readonly CoopRound[]): string | null {
  const n = h.length;
  if (n < 2) return null;
  const r = h[n - 1];
  const before = h[n - 2];
  let mutualRun = 0;
  for (let i = n - 2; i >= 0 && h[i].p === 'C' && h[i].b === 'C'; i--) mutualRun += 1;
  if (r.b === 'D' && mutualRun >= 2) return `That broke a run of ${mutualRun} rounds of mutual cooperation.`;
  if (r.b === 'D' && before.p === 'D') return 'It defected right after your defection.';
  if (r.b === 'C' && before.p === 'D') return 'It cooperated even though you defected last round.';
  if (r.b === 'C' && before.p === 'C' && before.b === 'D') return 'It cooperated again after taking the advantage last round.';
  if (r.p === 'C' && r.b === 'C' && before.p === 'D' && before.b === 'D') return 'You both stepped out of mutual defection.';
  return null;
}

// ── Opponent history panel ──────────────────────────────────────────────────

/** What the opponent's visible record supports: a count, the recent run, and patterns with at least 2–3 samples. */
export function opponentPatterns(h: readonly CoopRound[]): { summary: string; notes: string[] } {
  const n = h.length;
  if (n === 0) return { summary: 'No history yet.', notes: ['Its first move is already locked — nothing you do this round can change it.'] };
  const coop = h.filter((r) => r.b === 'C').length;
  const notes: string[] = [];
  let run = 0;
  for (let i = n - 1; i >= 0 && h[i].b === h[n - 1].b; i--) run += 1;
  if (run >= 2) notes.push(`${h[n - 1].b === 'C' ? 'Cooperated' : 'Defected'} in the last ${run} rounds.`);
  const afterC = after(h, (r) => r.p === 'C', (x) => x.b === 'C');
  if (afterC.n >= 3 && afterC.k / afterC.n >= 0.75) notes.push(`Usually cooperates after you do (${afterC.k} of ${afterC.n}).`);
  else if (afterC.n >= 3 && afterC.k / afterC.n <= 0.5) notes.push(`Often doesn’t return your cooperation (${afterC.n - afterC.k} of ${afterC.n} times it defected next).`);
  const afterD = after(h, (r) => r.p === 'D', (x) => x.b === 'D');
  if (afterD.n >= 2 && afterD.k / afterD.n >= 0.75) notes.push(`Answers your defections with one (${afterD.k} of ${afterD.n}).`);
  else if (afterD.n >= 2 && afterD.k === 0) notes.push(`Hasn’t punished your defections (0 of ${afterD.n}).`);
  if (!notes.length && n < 3) notes.push('Too early to call a pattern.');
  return { summary: `Cooperated in ${coop} of ${rounds(n)}.`, notes };
}

// ── Results: insights, lessons, the opponent revealed ───────────────────────

/** One or two observations about the player's own decisions, each backed by counted evidence. */
export function coopInsights(s: Pick<CoopState, 'setup' | 'rounds'>, st: CoopStats = coopStats(s)): string[] {
  const name = COOP_NAME[s.setup.persona];
  const pay = COOP_PAYOFFS[s.setup.variant];
  if (st.rounds < 3) return ['Too few rounds for a clear picture of how you played.'];
  const out: string[] = [];
  const allC = pay.R * st.rounds;
  if (st.diff > 0 && st.player < allC * 0.7) out.push(`You out-scored ${name} ${st.player}–${st.bot}, but cooperating with each other every round would have paid you ${allC}. Winning the comparison isn’t the same as earning the most.`);
  if (st.mutualC === st.rounds) out.push(`You and ${name} cooperated in all ${st.rounds} rounds — ${st.combinedMutualC} points between you, the most two players can earn together.`);
  if (st.mutualD === st.rounds) out.push(`Neither of you cooperated once. ${st.rounds} rounds of mutual defection earned ${st.combinedMutualD} points between you; steady cooperation would have earned ${pay.R * 2 * st.rounds}.`);
  if (st.exploited >= 2) out.push(`You cooperated in ${st.playerCoop} of ${st.rounds} rounds. ${name} took advantage of that ${times(st.exploited)}.`);
  if (st.youAnsweredBetrayal.n >= 2) out.push(`After being exploited, you defected the next round ${st.youAnsweredBetrayal.k} of ${st.youAnsweredBetrayal.n} times.`);
  if (st.exploits >= 2) {
    const answered = after(s.rounds, (r) => r.p === 'D' && r.b === 'C', (x) => x.b === 'D');
    out.push(`You took the advantage ${times(st.exploits)} (+${pay.T} each)${answered.n ? `; ${name} defected the very next round ${answered.k} of ${answered.n} times` : ''}.`);
  }
  if (st.mutualC > 0 && st.mutualD > 0) out.push(`Your ${rounds(st.mutualC)} of mutual cooperation produced ${st.combinedMutualC} combined points; your ${rounds(st.mutualD)} of mutual defection produced ${st.combinedMutualD}.`);
  if (!out.length) out.push(`You cooperated in ${st.playerCoop} of ${st.rounds} rounds; ${name} cooperated in ${st.botCoop}.`);
  return out.slice(0, 2);
}

export type LessonId = 'repeated' | 'forgiveness' | 'reciprocity' | 'adaptation' | 'incentives';

export interface Lesson {
  id: LessonId;
  title: string;
  body: string;
}

const LESSONS: Record<LessonId, Omit<Lesson, 'id'>> = {
  repeated: { title: 'Repeated games', body: 'A choice that wins one round can cost you the next ones. When the same opponent remembers, the future is part of every payoff.' },
  forgiveness: { title: 'Retaliation and forgiveness', body: 'Answering a betrayal shows exploitation has a price; refusing ever to forgive can lock both of you into mutual defection. The skill is doing both at the right time.' },
  reciprocity: { title: 'Reciprocity', body: 'How you respond shapes how your opponent responds. Returned cooperation is the most valuable thing in this game — for both of you.' },
  adaptation: { title: 'Adaptation', body: 'Your opponent was watching your history too. Predictable play is easy to read — and easy to exploit.' },
  incentives: { title: 'Incentives', body: `Defecting always pays more in a single round. That temptation is exactly what makes mutual cooperation fragile.` },
};

/** At most two ideas, chosen by what actually happened in this match. */
export function coopLessons(s: Pick<CoopState, 'setup' | 'rounds'>, st: CoopStats = coopStats(s)): Lesson[] {
  const ids: LessonId[] = [];
  if (st.exploits >= 1 && after(s.rounds, (r) => r.p === 'D' && r.b === 'C', (x) => x.b === 'D').k >= 1) ids.push('repeated');
  if (st.longestMutualD >= 3 || (st.youKeptCooperating.k >= 2 && st.exploited >= 2)) ids.push('forgiveness');
  if (st.rounds && st.mutualC * 2 >= st.rounds) ids.push('reciprocity');
  const predictable = predictPlayer(s.rounds) !== null || (st.playerCoopRate !== null && (st.playerCoopRate >= 0.9 || st.playerCoopRate <= 0.1));
  if ((s.setup.persona === 'chameleon' || s.setup.persona === 'opportunist') && predictable && st.exploited >= 2) ids.push('adaptation');
  if (ids.length === 0) ids.push('incentives');
  return ids.slice(0, 2).map((id) => ({ id, ...LESSONS[id] }));
}

const PROFILE_WORD: Record<PlayerProfile, string> = {
  unknown: 'not enough rounds to read',
  pushover: 'someone who keeps cooperating even after being exploited',
  reciprocal: 'someone who mirrors its last move',
  cooperative: 'a cooperator who answers betrayal',
  aggressive: 'a habitual defector',
  erratic: 'hard to read',
};

/** The opponent's policy, revealed after the match, with what it did in this one. */
export function coopOpponentReveal(s: Pick<CoopState, 'setup' | 'rounds'>): string {
  const { persona, level } = s.setup;
  const h = s.rounds;
  const how: Record<typeof persona, Record<typeof level, string>> = {
    collaborator: {
      easy: 'cooperates by default and forgives most defections (3 in 4).',
      normal: 'cooperates by default, forgives half of your defections, and turns defensive after three in four rounds.',
      hard: 'absorbs a one-off defection, forgives slips, turns defensive after two defections in four rounds until you cooperate twice, and reads alternating patterns.',
    },
    retaliator: {
      easy: 'answers a defection with one — but lets 4 in 10 go.',
      normal: 'plays strict tit-for-tat: it repeats your last move.',
      hard: 'answers an isolated defection once (with occasional mercy) and repeated exploitation for two rounds, forgiving slips.',
    },
    opportunist: {
      easy: 'copies you, but defects whenever you’ve cooperated two rounds in a row.',
      normal: 'probes after three rounds of mutual cooperation, keeps exploiting you if you never answer, and backs off once you do.',
      hard: 'measures whether you punish its defections, exploits you if you don’t, and always defects in the final round.',
    },
    chameleon: {
      easy: 'mirrors the majority of your last three moves, with occasional mistakes.',
      normal: 'probes in round 3, then cooperates with frequent cooperators and defects against frequent defectors.',
      hard: 'probes in round 3, profiles your play, switches policy to match and anticipates plain patterns — defecting in the final round unless you’re a habitual defector.',
    },
  };
  let evidence = '';
  if (persona === 'chameleon' && level !== 'easy' && h.length >= 4) {
    const profile = profilePlayer(h.slice(0, -1));
    evidence = level === 'hard' ? ` By the last round it read you as ${PROFILE_WORD[profile]}.` : '';
  }
  const coop = h.filter((r) => r.b === 'C').length;
  return `${COOP_NAME[persona]} ${how[persona][level]}${evidence} This match it cooperated in ${coop} of ${rounds(h.length)}.`;
}

export function coopDebrief(s: CoopState): Debrief {
  const st = coopStats(s);
  const lessons = coopLessons(s, st);
  return {
    headline: st.diff > 0 ? 'You out-scored your opponent' : st.diff < 0 ? 'Your opponent out-scored you' : 'Level on points',
    moments: coopInsights(s, st),
    insight: lessons.map((l) => `${l.title}: ${l.body}`).join(' '),
    opponentRead: coopOpponentReveal(s),
  };
}

export { pctOf };
