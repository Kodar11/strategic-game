import { type ArenaEngine, type Debrief, LENGTH_ROUNDS, type Setup, draw, resultFrom } from './core.ts';

/**
 * The Inspector — one side files a safety report; the other decides whether checking it is worth the cost.
 *
 * Roles alternate: you are the Operator in odd rounds and the Inspector in even rounds. Both choose at once, in secret.
 *
 * Operator:  Comply (file an honest report) or Cut corners.
 * Inspector: Inspect (costs INSPECT_COST) or Trust.
 *
 * Payoffs (operator / inspector), one round:
 *                 Inspect          Trust
 *   Comply        2 / −2           2 / 0
 *   Cut corners   −4 / +2          5 / −3
 * Cutting corners pays 5 unless inspected (then a fine, −4). An inspection costs the inspector 2 but catching a
 * violation earns a bounty of 4 (net +2); a violation nobody checks costs the inspector 3 in damage.
 *
 * Neither pure strategy is stable: if inspectors always inspect, operators comply, so inspecting is wasted; if they
 * never inspect, operators cheat. In the one-round equilibrium the operator cuts corners 2/7 of the time (≈29 %) and
 * the inspector inspects 1/3 of the time — each makes the other indifferent.
 *
 * Bots choose from the history before this round; they never see your current choice. Each personality has a policy
 * for both roles (inspectorChoice / operatorChoice). Most points wins.
 */

export const INSPECTOR_PERSONAS = ['strict', 'calculated', 'rule-follower', 'risk-taker'] as const;
export type InspectorPersona = (typeof INSPECTOR_PERSONAS)[number];
export const INSPECTOR_NAME: Record<InspectorPersona, string> = { strict: 'The Strict Inspector', calculated: 'The Calculated Inspector', 'rule-follower': 'The Rule Follower', 'risk-taker': 'The Risk Taker' };

export type InspectorVariant = 'standard' | 'heavy-fines';
export const INSPECTOR_VARIANTS: readonly InspectorVariant[] = ['standard', 'heavy-fines'];
export const inspectorRounds = LENGTH_ROUNDS(6, 8, 10);
export const INSPECT_COST = 2;

export type OperatorMove = 'comply' | 'cut';
export type InspectorMove = 'inspect' | 'trust';
export type InspectAction = OperatorMove | InspectorMove;

export interface Payoffs {
  comply: number;
  cheatUnseen: number;
  fine: number;
  bounty: number;
  damage: number;
}
export const PAYOFFS: Record<InspectorVariant, Payoffs> = {
  standard: { comply: 2, cheatUnseen: 5, fine: -4, bounty: 4, damage: -3 },
  'heavy-fines': { comply: 2, cheatUnseen: 6, fine: -10, bounty: 4, damage: -3 },
};

/** [operator, inspector] points for one round. */
export function inspectPayoff(v: InspectorVariant, op: OperatorMove, ins: InspectorMove): [number, number] {
  const p = PAYOFFS[v];
  if (op === 'comply') return [p.comply, ins === 'inspect' ? -INSPECT_COST : 0];
  return ins === 'inspect' ? [p.fine, p.bounty - INSPECT_COST] : [p.cheatUnseen, p.damage];
}

/** Equilibrium mix: operator cheat rate q* and inspection rate p*. */
export function equilibrium(v: InspectorVariant): { cheat: number; inspect: number } {
  const p = PAYOFFS[v];
  // Inspector indifferent: −c + bounty·q = damage·q  →  q = c / (bounty − damage)
  const cheat = INSPECT_COST / (p.bounty - p.damage);
  // Operator indifferent: comply = unseen·(1 − p) + fine·p  →  p = (unseen − comply) / (unseen − fine)
  const inspect = (p.cheatUnseen - p.comply) / (p.cheatUnseen - p.fine);
  return { cheat, inspect };
}

export interface InspectRound {
  /** Who operated this round. */
  operator: 'player' | 'bot';
  op: OperatorMove;
  ins: InspectorMove;
  points: [number, number]; // [player, bot]
}

export interface InspectorState {
  setup: Setup<InspectorVariant, InspectorPersona>;
  total: number;
  rounds: InspectRound[];
}

export const playerOperates = (n: number) => n % 2 === 0;

/** The player's past choices in a role, most recent last. */
const playerAs = (s: InspectorState, role: 'operator' | 'inspector') => s.rounds.filter((r) => (role === 'operator' ? r.operator === 'player' : r.operator === 'bot')).map((r) => (role === 'operator' ? r.op : r.ins));

/** Laplace estimate of a rate from yes/no history, optionally weighting recent rounds more. */
function rate(xs: boolean[], prior: number, recency = 1): number {
  let num = prior;
  let den = 1;
  let w = 1;
  for (let i = xs.length - 1; i >= 0; i--) {
    num += w * (xs[i] ? 1 : 0);
    den += w;
    w *= recency;
  }
  return num / den;
}

/**
 * The bot as Inspector (you operate). u is this round's seeded random number.
 *
 * Strict — inspects by default: Easy 80 % of rounds; Normal 70 %, and always right after catching you; Hard 60 %,
 *   always after catching you or after you went two operator rounds unchecked.
 * Calculated — inspects when your estimated cheat rate makes it pay (rate > the equilibrium 2/7). Easy uses your
 *   all-match rate; Normal the same with a little randomness near the line; Hard weights recent rounds and mixes at the
 *   equilibrium rate when your rate is close to it, so it can't be read.
 * Rule Follower — trusts by default: inspects 20 % (Easy 15 %); Normal and Hard inspect right after you cut corners on
 *   an unchecked round they later saw revealed.
 * Risk Taker — saves the inspection cost: inspects 25 %; Hard raises that to 50 % after losing to an unseen violation
 *   twice, Normal after once.
 */
export function inspectorChoice(s: InspectorState, u: number): InspectorMove {
  const { persona, level } = s.setup;
  const mine = s.rounds.filter((r) => r.operator === 'player');
  const last = mine[mine.length - 1];
  const yours = playerAs(s, 'operator').map((m) => m === 'cut');
  const q = equilibrium(s.setup.variant).cheat;
  const inspect = (p: number): InspectorMove => (u < p ? 'inspect' : 'trust');
  if (persona === 'strict') {
    if (level === 'easy') return inspect(0.8);
    if (last && last.op === 'cut' && last.ins === 'inspect') return 'inspect';
    if (level === 'hard' && mine.length >= 2 && mine.slice(-2).every((r) => r.ins === 'trust')) return 'inspect';
    return inspect(level === 'normal' ? 0.7 : 0.6);
  }
  if (persona === 'calculated') {
    const est = rate(yours, q, level === 'hard' ? 0.7 : 1);
    if (level === 'easy') return est > q ? 'inspect' : 'trust';
    if (level === 'hard' && Math.abs(est - q) < 0.08) return inspect(equilibrium(s.setup.variant).inspect);
    return inspect(est > q ? 0.85 : 0.15);
  }
  if (persona === 'rule-follower') {
    if (level !== 'easy' && last && last.op === 'cut' && last.ins === 'trust') return 'inspect';
    return inspect(level === 'easy' ? 0.15 : 0.2);
  }
  const burned = mine.filter((r) => r.op === 'cut' && r.ins === 'trust').length;
  return inspect(burned >= (level === 'hard' ? 2 : level === 'normal' ? 1 : 99) ? 0.5 : 0.25);
}

/**
 * The bot as Operator (you inspect).
 *
 * Strict — complies 85 % (Easy 90 %); Hard cuts corners only right after you trusted twice in a row.
 * Calculated — cuts corners when your estimated inspection rate is below what makes cheating pay (the equilibrium 1/3).
 *   Easy uses your all-match rate; Normal adds a little randomness; Hard weights recent rounds and mixes at the
 *   equilibrium rate near the line.
 * Rule Follower — complies (Easy always; Normal and Hard 92 %).
 * Risk Taker — cuts corners 60 %; Normal and Hard keep cutting after getting away with it (80 %) and drop to 30 % for
 *   one round after being fined.
 */
export function operatorChoice(s: InspectorState, u: number): OperatorMove {
  const { persona, level } = s.setup;
  const theirs = s.rounds.filter((r) => r.operator === 'bot');
  const last = theirs[theirs.length - 1];
  const yours = playerAs(s, 'inspector').map((m) => m === 'inspect');
  const p = equilibrium(s.setup.variant).inspect;
  const cut = (x: number): OperatorMove => (u < x ? 'cut' : 'comply');
  if (persona === 'strict') {
    if (level === 'hard') return theirs.length >= 2 && theirs.slice(-2).every((r) => r.ins === 'trust') ? 'cut' : 'comply';
    return cut(level === 'easy' ? 0.1 : 0.15);
  }
  if (persona === 'calculated') {
    const est = rate(yours, p, level === 'hard' ? 0.7 : 1);
    if (level === 'easy') return est < p ? 'cut' : 'comply';
    if (level === 'hard' && Math.abs(est - p) < 0.08) return cut(equilibrium(s.setup.variant).cheat);
    return cut(est < p ? 0.85 : 0.15);
  }
  if (persona === 'rule-follower') return level === 'easy' ? 'comply' : cut(0.08);
  if (level !== 'easy' && last) {
    if (last.op === 'cut' && last.ins === 'trust') return cut(0.8);
    if (last.op === 'cut' && last.ins === 'inspect') return cut(0.3);
  }
  return cut(0.6);
}

function validate(s: InspectorState, a: unknown): string | null {
  const n = s.rounds.length;
  if (n >= s.total) return 'The audit season is over.';
  if (playerOperates(n)) return a === 'comply' || a === 'cut' ? null : 'You’re the operator this round: comply or cut corners.';
  return a === 'inspect' || a === 'trust' ? null : 'You’re the inspector this round: inspect or trust.';
}

function apply(s: InspectorState, a: InspectAction): InspectorState {
  const why = validate(s, a);
  if (why) throw new Error(`inspector: ${why}`);
  const n = s.rounds.length;
  const u = draw(s.setup.seed, n, 0);
  if (playerOperates(n)) {
    const op = a as OperatorMove;
    const ins = inspectorChoice(s, u);
    const [o, i] = inspectPayoff(s.setup.variant, op, ins);
    return { ...s, rounds: [...s.rounds, { operator: 'player', op, ins, points: [o, i] }] };
  }
  const ins = a as InspectorMove;
  const op = operatorChoice(s, u);
  const [o, i] = inspectPayoff(s.setup.variant, op, ins);
  return { ...s, rounds: [...s.rounds, { operator: 'bot', op, ins, points: [i, o] }] };
}

export const inspectTotals = (s: InspectorState) => s.rounds.reduce<[number, number]>((t, r) => [t[0] + r.points[0], t[1] + r.points[1]], [0, 0]);
const pct = (k: number, n: number) => (n ? `${Math.round((k / n) * 100)}%` : '—');

function inspectorDebrief(s: InspectorState): Debrief {
  const h = s.rounds.map((r, i) => ({ r, i }));
  const asOp = h.filter(({ r }) => r.operator === 'player');
  const asIns = h.filter(({ r }) => r.operator === 'bot');
  const moments: { at: number; text: string }[] = [];
  const fined = asOp.find(({ r }) => r.op === 'cut' && r.ins === 'inspect');
  if (fined) moments.push({ at: fined.i, text: `Round ${fined.i + 1}: you cut corners and were inspected — fined ${-fined.r.points[0]}.` });
  const away = asOp.find(({ r }) => r.op === 'cut' && r.ins === 'trust');
  if (away) moments.push({ at: away.i, text: `Round ${away.i + 1}: you cut corners unchecked for +${away.r.points[0]}.` });
  const caught = asIns.find(({ r }) => r.op === 'cut' && r.ins === 'inspect');
  const wasted = asIns.filter(({ r }) => r.op === 'comply' && r.ins === 'inspect').length;
  if (caught) moments.push({ at: caught.i, text: `Round ${caught.i + 1}: your inspection caught a violation (+${caught.r.points[0]}).` });
  else if (wasted) moments.push({ at: asIns.find(({ r }) => r.ins === 'inspect')!.i, text: `As inspector you checked ${wasted} compliant report${wasted === 1 ? '' : 's'} — ${INSPECT_COST} each, for nothing found.` });
  const missed = asIns.find(({ r }) => r.op === 'cut' && r.ins === 'trust');
  if (missed && moments.length < 3) moments.push({ at: missed.i, text: `Round ${missed.i + 1}: you trusted and they cut corners — ${missed.r.points[0]} for you.` });
  if (!moments.length) moments.push({ at: 0, text: 'Every report was honest and nobody wasted an inspection.' });
  const eq = equilibrium(s.setup.variant);
  const yourCut = asOp.filter(({ r }) => r.op === 'cut').length;
  const yourIns = asIns.filter(({ r }) => r.ins === 'inspect').length;
  const insight = `Deterrence is a balance: inspect too often and you pay for nothing; too rarely and cheating pays. Here the balance is about ${Math.round(eq.inspect * 100)}% inspections against ${Math.round(eq.cheat * 100)}% violations. You cut corners in ${pct(yourCut, asOp.length)} of your operator rounds and inspected in ${pct(yourIns, asIns.length)} of your inspector rounds.`;
  const theirIns = asOp.filter(({ r }) => r.ins === 'inspect').length;
  const theirCut = asIns.filter(({ r }) => r.op === 'cut').length;
  const style: Record<InspectorPersona, string> = {
    strict: 'inspected by default and rarely cut corners itself',
    calculated: 'inspected and cheated according to how often you did',
    'rule-follower': 'complied almost always and trusted unless you had just cheated',
    'risk-taker': 'cut corners often and saved on inspections',
  };
  const after = asOp.find(({ r, i }) => r.op === 'cut' && asOp.some((x) => x.i > i));
  const next = after ? asOp.find((x) => x.i > after.i) : undefined;
  const ex = after && next ? ` After you cut corners in round ${after.i + 1}, it ${next.r.ins === 'inspect' ? 'inspected' : 'trusted'} you in round ${next.i + 1}.` : '';
  return {
    headline: 'Audit season over',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${INSPECTOR_NAME[s.setup.persona]} ${style[s.setup.persona]}: it inspected ${pct(theirIns, asOp.length)} of your reports and cut corners in ${pct(theirCut, asIns.length)} of its own.${ex}`,
  };
}

export const inspector: ArenaEngine<InspectorState, InspectAction, InspectorVariant> = {
  id: 'inspector',
  opponents: INSPECTOR_PERSONAS,
  variants: INSPECTOR_VARIANTS,
  rounds: inspectorRounds,
  create: (setup) => ({ setup: setup as Setup<InspectorVariant, InspectorPersona>, total: inspectorRounds(setup.length), rounds: [] }),
  validate,
  apply,
  isOver: (s) => s.rounds.length >= s.total,
  played: (s) => s.rounds.length,
  result(s) {
    const [p, b] = inspectTotals(s);
    return resultFrom(
      [
        { id: 'you', name: 'You', score: p, isPlayer: true },
        { id: s.setup.persona, name: INSPECTOR_NAME[s.setup.persona], score: b, isPlayer: false },
      ],
      'points',
    );
  },
  debrief: inspectorDebrief,
  moves: (s) => (s.rounds.length >= s.total ? [] : playerOperates(s.rounds.length) ? ['comply', 'cut'] : ['inspect', 'trust']),
};
