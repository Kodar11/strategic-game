import { type ArenaEngine, type Debrief, LENGTH_ROUNDS, PERSONAS, PERSONA_NAME, type Persona, type Setup, draw, drawInt, plural, resultFrom } from './core.ts';

/**
 * The Hidden Signal — ventures that are secretly Strong or Weak, a sender who knows which, and an investor who doesn't.
 * Roles alternate: you are the investor in rounds 1, 3, 5…, the sender in rounds 2, 4, 6….
 *
 * Each round:
 * 1. Public: the prior — the chance this venture is Strong (30–70 %, from the seed).
 * 2. Hidden: the venture is Strong or Weak, drawn from that prior. Only the sender sees it.
 * 3. The sender sends one signal:
 *    - Warn — "it's weak".
 *    - Pitch — "it's strong". Free to send: cheap talk.
 *    - Stake — "it's strong, and I'll back that": if the investor invests and the venture is Weak, the sender pays the
 *      investor STAKE. Costly only when the claim is false — that is what makes it credible.
 * 4. The investor may pay TEST_COST to investigate: a test that reports the true state with the round's accuracy
 *    (80 %, or 70 % in the Murky line). Then the investor invests or passes.
 * 5. Payoffs. Invest: the investor gets +GAIN if Strong, −LOSS if Weak (+STAKE back if staked); the sender earns FEE
 *    whenever the investor invests — the sender always wants investment, whatever the truth. Pass: 0 each (minus any
 *    test cost). The true state is revealed to both after every round.
 *
 * Information rules, for bots and the player alike: a bot investor sees the prior, the signal, its own test result and
 * revealed past rounds — never the hidden state. A bot sender knows the state, as the rules say the sender does. The
 * state and test results are drawn from the seed before anyone acts and never change afterwards.
 */

export type SignalVariant = 'standard' | 'murky';
export const SIGNAL_VARIANTS: readonly SignalVariant[] = ['standard', 'murky'];
export type Signal = 'warn' | 'pitch' | 'stake';
export const SIGNALS: readonly Signal[] = ['warn', 'pitch', 'stake'];
export type SignalAction = Signal | 'investigate' | 'invest' | 'pass';

export const GAIN = 6;
export const LOSS = 6;
export const FEE = 2;
export const STAKE = 4;
export const TEST_COST = 1;
export const PRIORS = [0.3, 0.4, 0.5, 0.6, 0.7] as const;
export const signalRounds = LENGTH_ROUNDS(4, 8, 12);
export const testAccuracy = (v: SignalVariant) => (v === 'murky' ? 0.7 : 0.8);

export const playerReceives = (round: number) => round % 2 === 0;

export interface SignalRound {
  prior: number;
  strong: boolean;
  sender: 'player' | 'bot';
  signal: Signal;
  tested: boolean;
  /** What the test reported (only when tested). */
  test: boolean | null;
  invested: boolean;
  /** Payoffs this round, player / bot. */
  ps: number;
  bs: number;
}

export interface SignalState {
  setup: Setup<SignalVariant>;
  total: number;
  rounds: SignalRound[];
  /** The player investigated this round and is now deciding. */
  tested: boolean;
}

/** The hidden truth of round `n` and what a test would report, fixed by the seed before anyone acts. */
export function venture(setup: Setup<SignalVariant>, n: number): { prior: number; strong: boolean; test: boolean } {
  const prior = PRIORS[drawInt(setup.seed, n, 0, 0, PRIORS.length - 1)];
  const strong = draw(setup.seed, n, 1) < prior;
  const correct = draw(setup.seed, n, 2) < testAccuracy(setup.variant);
  return { prior, strong, test: correct ? strong : !strong };
}

/** P(Strong | test result) from a prior alone, with test accuracy `a`. */
export function afterTest(q: number, says: boolean, a: number): number {
  const ls = says ? a : 1 - a;
  const lw = says ? 1 - a : a;
  return (q * ls) / (q * ls + (1 - q) * lw);
}

const investValue = (q: number, signal: Signal) => q * GAIN - (1 - q) * (signal === 'stake' ? LOSS - STAKE : LOSS);

export function payoffs(r: Pick<SignalRound, 'strong' | 'signal' | 'tested' | 'invested' | 'sender'>): [number, number] {
  let recv = r.tested ? -TEST_COST : 0;
  let send = 0;
  if (r.invested) {
    send += FEE;
    if (r.strong) recv += GAIN;
    else {
      recv -= LOSS;
      if (r.signal === 'stake') {
        recv += STAKE;
        send -= STAKE;
      }
    }
  }
  return r.sender === 'player' ? [send, recv] : [recv, send];
}

const futureBotSends = (n: number, total: number) => {
  let k = 0;
  for (let i = n + 1; i < total; i++) if (!playerReceives(i)) k += 1;
  return k;
};

/**
 * The bot's signal when it is the sender in round `h.length` (it knows `strong`, as the sender does).
 *
 * - Investor (reputation): Strong → stake; Weak → warn. Easy slips into a pitch on a Weak venture one time in five;
 *   Hard bluffs a pitch on a Weak venture in its last sending round, when reputation can no longer pay it back.
 * - Banker (consistent, honest): Weak → warn; Strong → stake or pitch on a coin flip. Its pitches are honest.
 * - Deal Maker (reciprocal): honest (Strong → stake, Weak → warn) — but on Normal and Hard, if you bluffed it last
 *   time you sent (a pitch or stake on a Weak venture that it invested in), it bluffs you back once with a pitch.
 * - Opportunist (bluffs): Strong → stake (Hard: a pitch 40 % of the time, so pitches stay ambiguous). Weak → pitch with
 *   probability Easy 0.35, Normal 0.6; Hard 0.85 if you invested after at least half its pitches (two or more), 0.35 if
 *   you've learned to doubt them, 0.6 before it knows.
 * It never stakes on a Weak venture: that would cost it STAKE − FEE whenever you invest.
 */
export function signalBotSend(setup: Setup<SignalVariant>, total: number, h: readonly SignalRound[], strong: boolean): Signal {
  const { persona, level, seed } = setup;
  const n = h.length;
  const u = draw(seed, n, 5);
  switch (persona) {
    case 'investor':
      if (strong) return 'stake';
      if (level === 'easy') return u < 0.2 ? 'pitch' : 'warn';
      if (level === 'hard' && futureBotSends(n, total) === 0) return 'pitch';
      return 'warn';
    case 'banker':
      return strong ? (u < 0.5 ? 'stake' : 'pitch') : 'warn';
    case 'dealmaker': {
      if (strong) return 'stake';
      if (level === 'easy') return 'warn';
      const mineLast = [...h].reverse().find((r) => r.sender === 'player');
      const bluffed = mineLast && !mineLast.strong && mineLast.signal !== 'warn' && mineLast.invested;
      return bluffed ? 'pitch' : 'warn';
    }
    case 'opportunist': {
      if (strong) return level === 'hard' && u < 0.4 ? 'pitch' : 'stake';
      let rate = level === 'easy' ? 0.35 : 0.6;
      if (level === 'hard') {
        const pitched = h.filter((r) => r.sender === 'bot' && r.signal === 'pitch');
        if (pitched.length >= 2) rate = pitched.filter((r) => r.invested).length * 2 >= pitched.length ? 0.85 : 0.35;
      }
      return draw(seed, n, 6) < rate ? 'pitch' : 'warn';
    }
  }
}

/**
 * The bot investor's belief that the player's venture is Strong, given the signal and how the player has signalled in
 * revealed rounds: Bayes' rule with likelihoods counted from the player's past signals per true state, smoothed by
 * the persona's starting assumptions (pseudo-counts). Opportunist uses light pseudo-counts, so it adapts fastest.
 */
export function botBelief(persona: Persona, h: readonly SignalRound[], prior: number, signal: Signal): number {
  const w = persona === 'opportunist' ? 0.5 : 1;
  const base: Record<'s' | 'w', Record<Signal, number>> = {
    s: { stake: 1 * w, pitch: 1 * w, warn: 0.2 * w },
    w: { stake: 0.2 * w, pitch: persona === 'dealmaker' ? 0.4 * w : 0.7 * w, warn: 1 * w },
  };
  const counts = { s: { ...base.s }, w: { ...base.w } };
  for (const r of h) if (r.sender === 'player') counts[r.strong ? 's' : 'w'][r.signal] += 1;
  const tot = (k: 's' | 'w') => SIGNALS.reduce((t, x) => t + counts[k][x], 0);
  const ls = counts.s[signal] / tot('s');
  const lw = counts.w[signal] / tot('w');
  return (prior * ls) / (prior * ls + (1 - prior) * lw);
}

/**
 * The bot investor's decision on the player's signal: whether to investigate, then whether to invest (seeing its own
 * test result, never the state).
 *
 * Easy: takes signals at face value — invests on a pitch or stake, passes on a warning (Banker invests only on a
 *   stake). Never investigates.
 * Normal: Bayes belief q, then: Investor invests if expected value > 0 and investigates when 0.4 < q < 0.6; Banker
 *   needs expected value > 1.5 and investigates when 0.3 < q < 0.8; Deal Maker always trusts a stake unless you
 *   once staked on a Weak venture, else expected value > 0; Opportunist expected value > 0. Only the Investor and
 *   Banker investigate.
 * Hard: everyone investigates exactly when the test's expected value beats deciding now (Banker with its 1.5 margin).
 */
export function signalBotReceive(setup: Setup<SignalVariant>, h: readonly SignalRound[], prior: number, signal: Signal, testSays: boolean): { tested: boolean; invested: boolean } {
  const { persona, level, variant } = setup;
  if (level === 'easy') return { tested: false, invested: persona === 'banker' ? signal === 'stake' : signal !== 'warn' };
  const a = testAccuracy(variant);
  const margin = persona === 'banker' ? 1.5 : 0;
  const q = botBelief(persona, h, prior, signal);
  const decide = (p: number) => investValue(p, signal) > margin;
  const brokeStake = h.some((r) => r.sender === 'player' && r.signal === 'stake' && !r.strong);

  if (persona === 'dealmaker' && signal === 'stake' && !brokeStake) return { tested: false, invested: true };

  let test = false;
  if (level === 'normal') {
    if (persona === 'investor') test = q > 0.4 && q < 0.6;
    if (persona === 'banker') test = q > 0.3 && q < 0.8;
  } else {
    const now = Math.max(0, investValue(q, signal) - margin);
    const pS = q * a + (1 - q) * (1 - a);
    const withTest = pS * Math.max(0, investValue(afterTest(q, true, a), signal) - margin) + (1 - pS) * Math.max(0, investValue(afterTest(q, false, a), signal) - margin) - TEST_COST;
    test = withTest > now + 1e-9;
  }
  return { tested: test, invested: decide(test ? afterTest(q, testSays, a) : q) };
}

/** What the player faces now. */
export function signalPrompt(s: SignalState):
  | { role: 'receive'; prior: number; signal: Signal; test: boolean | null }
  | { role: 'send'; prior: number; strong: boolean }
  | null {
  const n = s.rounds.length;
  if (n >= s.total) return null;
  const v = venture(s.setup, n);
  if (playerReceives(n)) return { role: 'receive', prior: v.prior, signal: signalBotSend(s.setup, s.total, s.rounds, v.strong), test: s.tested ? v.test : null };
  return { role: 'send', prior: v.prior, strong: v.strong };
}

function validate(s: SignalState, a: unknown): string | null {
  const p = signalPrompt(s);
  if (!p) return 'The match is over.';
  if (p.role === 'send') return a === 'warn' || a === 'pitch' || a === 'stake' ? null : 'Choose a signal to send.';
  if (a === 'investigate') return s.tested ? 'You already investigated this venture.' : null;
  return a === 'invest' || a === 'pass' ? null : 'Invest, pass or investigate.';
}

function apply(s: SignalState, a: SignalAction): SignalState {
  const why = validate(s, a);
  if (why) throw new Error(`signal: ${why}`);
  if (a === 'investigate') return { ...s, tested: true };
  const n = s.rounds.length;
  const v = venture(s.setup, n);
  let r: Omit<SignalRound, 'ps' | 'bs'>;
  if (playerReceives(n)) {
    const signal = signalBotSend(s.setup, s.total, s.rounds, v.strong);
    r = { prior: v.prior, strong: v.strong, sender: 'bot', signal, tested: s.tested, test: s.tested ? v.test : null, invested: a === 'invest' };
  } else {
    const signal = a as Signal;
    const d = signalBotReceive(s.setup, s.rounds, v.prior, signal, v.test);
    r = { prior: v.prior, strong: v.strong, sender: 'player', signal, tested: d.tested, test: d.tested ? v.test : null, invested: d.invested };
  }
  const [ps, bs] = payoffs(r);
  return { ...s, tested: false, rounds: [...s.rounds, { ...r, ps, bs }] };
}

const SIGNAL_WORD: Record<Signal, string> = { warn: 'a warning', pitch: 'a pitch', stake: 'a stake' };

export function signalDebrief(s: SignalState): Debrief {
  const h = s.rounds;
  const moments: string[] = [];
  const recv = h.map((r, i) => ({ r, i })).filter(({ r }) => r.sender === 'bot');
  const sent = h.map((r, i) => ({ r, i })).filter(({ r }) => r.sender === 'player');

  const fooled = recv.filter(({ r }) => r.invested && !r.strong && r.signal === 'pitch');
  if (fooled.length) {
    const { r, i } = fooled[0];
    moments.push(`Round ${i + 1}: you invested on a pitch and the venture was Weak (${r.ps}). A pitch cost the sender nothing to send, and it earned ${FEE} the moment you invested — its incentive didn’t depend on the truth.`);
  }
  const stakes = recv.filter(({ r }) => r.signal === 'stake');
  if (stakes.length && moments.length < 2) {
    const honest = stakes.filter(({ r }) => r.strong).length;
    moments.push(`It staked ${plural(stakes.length, 'time')} and ${honest === stakes.length ? 'every staked venture was Strong' : `${honest} of those were Strong`}. A stake costs a sender ${STAKE - FEE} net on a Weak venture you invest in, which is why it carries real information.`);
  }
  const missed = recv.filter(({ r }) => !r.invested && r.strong);
  if (missed.length && moments.length < 3) {
    const { r, i } = missed[0];
    moments.push(`Round ${i + 1}: you passed on a Strong venture after ${SIGNAL_WORD[r.signal]} (prior ${Math.round(r.prior * 100)}%). Caution avoided risk but gave up ${GAIN}.`);
  }
  const tests = recv.filter(({ r }) => r.tested);
  if (tests.length && moments.length < 3) {
    const right = tests.filter(({ r }) => r.test === r.strong).length;
    moments.push(`You investigated ${plural(tests.length, 'time')} (${tests.length * TEST_COST} spent); the test was right ${right} of ${tests.length}. Evidence that is ${Math.round(testAccuracy(s.setup.variant) * 100)}% accurate moves a belief, it doesn’t settle it.`);
  }
  const bluffs = sent.filter(({ r }) => !r.strong && r.signal !== 'warn');
  if (bluffs.length && moments.length < 3) {
    const worked = bluffs.filter(({ r }) => r.invested).length;
    moments.push(`As sender you bluffed ${plural(bluffs.length, 'time')}; the opponent invested in ${worked} of them. ${worked < bluffs.length ? 'A bluff only pays while your signals are believed.' : 'Every bluff landed — but each one, once revealed, became part of the record it judges you by.'}`);
  }

  const insight = fooled.length
    ? 'Ask what a signal costs the sender if it’s false. A free claim from someone who profits either way is weak evidence; a stake they lose when wrong is strong evidence.'
    : stakes.length && tests.length
      ? 'You combined the signal with your own evidence. Each piece updates the prior — the strongest decisions weigh both the sender’s incentives and how reliable your test is.'
      : bluffs.length
        ? 'Bluffing works until your record shows it. A reputation for honest signals is what makes an opponent believe you when it matters.'
        : 'Information asymmetry means the sender knows what you don’t. Credible signals — ones that would be costly to fake — are what close that gap.';

  const theirs = h.filter((r) => r.sender === 'bot');
  const pitches = theirs.filter((r) => r.signal === 'pitch');
  const read = pitches.length ? ` When it pitched, the venture was Strong ${pitches.filter((r) => r.strong).length} of ${pitches.length} times.` : theirs.length ? ' It never pitched in this match.' : '';
  const style: Record<Persona, string> = {
    investor: 'The Investor signalled honestly to protect its reputation — while it still had one to protect.',
    banker: 'The Banker never bluffed: its warnings and pitches both told the truth.',
    dealmaker: 'The Deal Maker was honest unless you bluffed it first — then it paid you back once.',
    opportunist: 'The Opportunist bluffed with pitches, more when you believed them, but never staked on a Weak venture.',
  };
  return { headline: 'All ventures revealed', moments: moments.slice(0, 3), insight, opponentRead: `${style[s.setup.persona]}${read}` };
}

export const hiddenSignal: ArenaEngine<SignalState, SignalAction, SignalVariant> = {
  id: 'signal',
  opponents: PERSONAS,
  variants: SIGNAL_VARIANTS,
  rounds: signalRounds,
  create: (setup) => ({ setup, total: signalRounds(setup.length), rounds: [], tested: false }),
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
  debrief: signalDebrief,
};
