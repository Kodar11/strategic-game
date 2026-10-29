import { type ArenaEngine, type Debrief, type Level, LENGTH_ROUNDS, type Setup, draw, drawInt } from './core.ts';

/**
 * The Last Stand — you and a bot teammate hold a valley against a spreading wildfire with one shared water supply.
 *
 * The valley: DISTRICTS in a ring (each touches the two beside it). Each has a fire level 0–3; reaching 4 burns it out
 * for good. Two districts start burning (seeded). Shared water starts at START_WATER (at most MAX_WATER).
 *
 * Each round:
 * 1. Your teammate announces its action (its plan comes first, so you can coordinate around it).
 * 2. You choose yours. Actions: Douse a district (−2 fire, uses 1 water), Firebreak a district (it can't catch spread
 *    this round; free), or Refill (+2 water).
 * 3. Both actions happen. Then the fire spreads: every district at 2+ grows by 1 and pushes +1 into each neighbour,
 *    unless that neighbour has a firebreak. Burned-out districts don't spread.
 * 4. New ignitions (+IGNITION to a seeded district). Any district at 4 or more burns out.
 * Fail: BURNOUT_LIMIT districts burned out. Succeed: hold out for the whole match.
 *
 * Score (team): 2 per district still standing + water left, +5 for holding out. A shared result.
 *
 * Difficulty is the crisis, not a stronger teammate: ignitions per round are Easy 1 every other round, Normal 1 plus
 * a second 25 % of rounds, Hard 1 plus a second 60 % of rounds. Spread and ignition places come from the seed; your teammate reasons the same
 * way on every level and never sees future ignitions.
 */

export const LAST_STAND_PERSONAS = ['planner', 'responder', 'guardian', 'coordinator'] as const;
export type LastStandPersona = (typeof LAST_STAND_PERSONAS)[number];
export const LAST_STAND_NAME: Record<LastStandPersona, string> = { planner: 'The Planner', responder: 'The Emergency Responder', guardian: 'The Resource Guardian', coordinator: 'The Opportunistic Coordinator' };

export type LastStandVariant = 'standard' | 'drought';
export const LAST_STAND_VARIANTS: readonly LastStandVariant[] = ['standard', 'drought'];
export const lastStandRounds = LENGTH_ROUNDS(6, 8, 10);
export const DISTRICTS = ['Harbor', 'Market', 'Old Town', 'Hills', 'Farms', 'Mill'] as const;
export const N = DISTRICTS.length;
export const BURNED = 4;
/** Fire added by a new ignition. */
export const IGNITION = 2;
export const BURNOUT_LIMIT = 2;
export const MAX_WATER = 8;
export const startWater = (v: LastStandVariant) => (v === 'drought' ? 4 : 6);
export const refillAmount = (v: LastStandVariant) => (v === 'drought' ? 1 : 2);

export type Plan = { kind: 'douse'; d: number } | { kind: 'firebreak'; d: number } | { kind: 'refill' };

export interface StandRound {
  bot: Plan;
  you: Plan;
  /** Fire levels after the actions, after spread and after ignition. */
  fireBefore: number[];
  fireAfter: number[];
  ignited: number[];
  waterAfter: number;
  newlyBurned: number[];
}

export interface StandState {
  setup: Setup<LastStandVariant, LastStandPersona>;
  total: number;
  fire: number[];
  water: number;
  rounds: StandRound[];
}

export const neighbours = (d: number) => [(d + N - 1) % N, (d + 1) % N];
export const burnedOut = (s: StandState) => s.fire.filter((f) => f >= BURNED).length;
const alive = (f: number) => f < BURNED;

export function ignitions(level: Level, seed: number, n: number): number[] {
  const count = level === 'easy' ? (n % 2 === 1 ? 1 : 0) : 1 + (draw(seed, n, 30) < (level === 'normal' ? 0.25 : 0.6) ? 1 : 0);
  return Array.from({ length: count }, (_, k) => drawInt(seed, n, 31 + k, 0, N - 1));
}

/** Spread from the current fire levels, honouring firebreaks. Pure. */
export function spread(fire: readonly number[], breaks: ReadonlySet<number>): number[] {
  const next = [...fire];
  fire.forEach((f, d) => {
    if (f < 2 || f >= BURNED) return;
    const options = neighbours(d).filter((x) => alive(fire[x]));
    if (!options.length) return;
    for (const target of options) if (!breaks.has(target)) next[target] += 1;
    // A fire left alone grows.
    next[d] += 1;
  });
  return next;
}

/** How dangerous a district is for the next round: its fire plus what its burning neighbours can push into it. */
const threat = (fire: readonly number[], d: number) => (alive(fire[d]) ? fire[d] * 2 + neighbours(d).filter((x) => fire[x] >= 2 && alive(fire[x])).length : -1);

const hottest = (fire: readonly number[], skip: number | null = null) => {
  let best = -1;
  fire.forEach((f, d) => {
    if (!alive(f) || f === 0 || d === skip) return;
    if (best < 0 || f > fire[best]) best = d;
  });
  return best;
};

/**
 * The teammate's plan for this round, from the board, the water and what you did before. It never sees future
 * ignitions or your choice this round (it announces first).
 *
 * Planner — looks a round ahead: douses the district with the highest threat (its fire plus burning neighbours); if
 *   no district is above 1, firebreaks the calm district most exposed to burning neighbours; refills when water ≤ 1.
 * Emergency Responder — douses the hottest district, every round; refills only when the water is gone.
 * Resource Guardian — protects the supply: refills whenever water ≤ 3; douses only districts at 3 (one step from
 *   burning out); otherwise firebreaks the calm neighbour of the hottest district.
 * Opportunistic Coordinator — fills the gap you leave: if you doused a district last round it takes the hottest
 *   *other* district; with two or more districts at 3 it douses the worst; refills when water ≤ 2 and nothing is at 3.
 */
export function teammatePlan(s: StandState): Plan {
  const { persona } = s.setup;
  const fire = s.fire;
  const w = s.water;
  const atThree = fire.map((f, d) => (f === 3 ? d : -1)).filter((d) => d >= 0);
  if (persona === 'planner') {
    if (w <= 1) return { kind: 'refill' };
    const ranked = fire.map((_, d) => d).filter((d) => alive(fire[d])).sort((a, b) => threat(fire, b) - threat(fire, a) || a - b);
    if (fire[ranked[0]] >= 2) return { kind: 'douse', d: ranked[0] };
    const exposed = fire.map((_, d) => d).filter((d) => alive(fire[d]) && fire[d] <= 1).sort((a, b) => threat(fire, b) - fire[b] * 2 - (threat(fire, a) - fire[a] * 2) || a - b)[0];
    if (exposed !== undefined && neighbours(exposed).some((x) => fire[x] >= 2 && alive(fire[x]))) return { kind: 'firebreak', d: exposed };
    const hot = hottest(fire);
    return hot >= 0 ? { kind: 'douse', d: hot } : { kind: 'refill' };
  }
  if (persona === 'responder') {
    if (w <= 0) return { kind: 'refill' };
    const hot = hottest(fire);
    return hot >= 0 ? { kind: 'douse', d: hot } : { kind: 'refill' };
  }
  if (persona === 'guardian') {
    if (w <= 3) return { kind: 'refill' };
    if (atThree.length) return { kind: 'douse', d: atThree[0] };
    const hot = hottest(fire);
    if (hot < 0) return { kind: 'refill' };
    const calm = neighbours(hot).filter((x) => alive(fire[x])).sort((a, b) => fire[a] - fire[b] || a - b)[0];
    return calm !== undefined ? { kind: 'firebreak', d: calm } : { kind: 'douse', d: hot };
  }
  if (atThree.length >= 2 && w > 0) return { kind: 'douse', d: atThree.sort((a, b) => threat(fire, b) - threat(fire, a))[0] };
  if (w <= 2 && !atThree.length) return { kind: 'refill' };
  if (w <= 0) return { kind: 'refill' };
  const last = s.rounds[s.rounds.length - 1];
  const yours = last && last.you.kind === 'douse' ? last.you.d : null;
  const hot = hottest(fire, yours);
  return hot >= 0 ? { kind: 'douse', d: hot } : { kind: 'refill' };
}

const isOver = (s: StandState) => s.rounds.length >= s.total || burnedOut(s) >= BURNOUT_LIMIT;

function checkPlan(s: StandState, p: Plan, waterAvailable: number): string | null {
  if (!p || typeof p !== 'object') return 'Choose an action.';
  if (p.kind === 'refill') return null;
  if (p.kind !== 'douse' && p.kind !== 'firebreak') return 'Douse, firebreak or refill.';
  if (!Number.isInteger(p.d) || p.d < 0 || p.d >= N) return 'Choose a district.';
  if (!alive(s.fire[p.d])) return `${DISTRICTS[p.d]} has burned out.`;
  if (p.kind === 'douse' && waterAvailable <= 0) return 'No water left — refill first.';
  return null;
}

function validate(s: StandState, a: Plan): string | null {
  if (isOver(s)) return 'The stand is over.';
  const bot = teammatePlan(s);
  return checkPlan(s, a, s.water - (bot.kind === 'douse' ? 1 : 0));
}

function apply(s: StandState, you: Plan): StandState {
  const why = validate(s, you);
  if (why) throw new Error(`last-stand: ${why}`);
  const n = s.rounds.length;
  const { seed, level, variant } = s.setup;
  const bot = teammatePlan(s);
  let fire = [...s.fire];
  let water = s.water;
  const breaks = new Set<number>();
  for (const p of [bot, you]) {
    if (p.kind === 'douse') {
      fire[p.d] = Math.max(0, fire[p.d] - 2);
      water -= 1;
    } else if (p.kind === 'firebreak') breaks.add(p.d);
    else water = Math.min(MAX_WATER, water + refillAmount(variant));
  }
  const fireBefore = [...fire];
  fire = spread(fire, breaks);
  const ignited = ignitions(level, seed, n);
  for (const d of ignited) if (alive(fire[d])) fire[d] += IGNITION;
  const newlyBurned = fire.map((f, d) => (f >= BURNED && alive(s.fire[d]) ? d : -1)).filter((d) => d >= 0);
  fire = fire.map((f) => Math.min(BURNED, f));
  return { ...s, fire, water, rounds: [...s.rounds, { bot, you, fireBefore, fireAfter: fire, ignited, waterAfter: water, newlyBurned }] };
}

export const held = (s: StandState) => isOver(s) && burnedOut(s) < BURNOUT_LIMIT;
export const standScore = (s: StandState) => s.fire.filter(alive).length * 2 + s.water + (held(s) ? 5 : 0);
export const planText = (p: Plan) => (p.kind === 'refill' ? 'Refill' : `${p.kind === 'douse' ? 'Douse' : 'Firebreak'} ${DISTRICTS[p.d]}`);

function standDebrief(s: StandState): Debrief {
  const h = s.rounds.map((r, i) => ({ r, i }));
  const moments: { at: number; text: string }[] = [];
  const lost = h.find(({ r }) => r.newlyBurned.length);
  if (lost) moments.push({ at: lost.i, text: `Round ${lost.i + 1}: ${lost.r.newlyBurned.map((d) => DISTRICTS[d]).join(' and ')} burned out. That round: teammate ${planText(lost.r.bot)}, you ${planText(lost.r.you)}.` });
  const doubled = h.find(({ r }) => r.bot.kind === 'douse' && r.you.kind === 'douse' && r.bot.d === r.you.d);
  if (doubled) moments.push({ at: doubled.i, text: `Round ${doubled.i + 1}: you both doused ${DISTRICTS[(doubled.r.you as { d: number }).d]} — focused, but nowhere else was covered.` });
  const dry = h.find(({ r }) => r.waterAfter <= 0);
  if (dry && moments.length < 3) moments.push({ at: dry.i, text: `Round ${dry.i + 1}: the water ran out — the next round had to start with a refill.` });
  const save = h.find(({ r }) => r.you.kind === 'firebreak' && r.fireAfter[(r.you as { d: number }).d] === r.fireBefore[(r.you as { d: number }).d] && neighbours((r.you as { d: number }).d).some((x) => r.fireBefore[x] >= 2));
  if (save && moments.length < 3) moments.push({ at: save.i, text: `Round ${save.i + 1}: your firebreak kept ${DISTRICTS[(save.r.you as { d: number }).d]} out of the spread.` });
  if (!moments.length) moments.push({ at: 0, text: `The valley held with ${s.fire.filter(alive).length} districts standing and ${s.water} water left.` });
  const insight = held(s)
    ? 'Two responders covering different fires do more than two on the same one. Coordination here meant reading your teammate’s plan first and spending your action where it wasn’t — and keeping enough water for the round after.'
    : 'Crises are lost by priorities as much as by luck: dousing the biggest fire is urgent, but the district about to receive spread is often the one to save. When your teammate commits first, cover what it leaves open.';
  const plans = s.rounds.map((r) => r.bot);
  const counts = { douse: 0, firebreak: 0, refill: 0 };
  plans.forEach((p) => (counts[p.kind] += 1));
  const example = h.find(({ r }) => r.bot.kind !== 'douse') ?? h[0];
  const style: Record<LastStandPersona, string> = {
    planner: 'went for the districts about to be hit next, not just the biggest fire',
    responder: 'doused the biggest fire every round',
    guardian: 'protected the water supply and only spent it on districts about to burn out',
    coordinator: 'covered the fires you weren’t fighting, and changed priorities as the fire moved',
  };
  return {
    headline: held(s) ? 'The line held' : 'The valley burned',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${LAST_STAND_NAME[s.setup.persona]} ${style[s.setup.persona]}: ${counts.douse} douses, ${counts.firebreak} firebreaks, ${counts.refill} refills.${example ? ` In round ${example.i + 1} it chose ${planText(example.r.bot)} with ${example.i ? s.rounds[example.i - 1].waterAfter : startWater(s.setup.variant)} water.` : ''}`,
  };
}

export const lastStand: ArenaEngine<StandState, Plan, LastStandVariant> = {
  id: 'last-stand',
  opponents: LAST_STAND_PERSONAS,
  variants: LAST_STAND_VARIANTS,
  rounds: lastStandRounds,
  endsEarly: true,
  create(setup) {
    const s = setup as Setup<LastStandVariant, LastStandPersona>;
    const fire = Array.from({ length: N }, () => 0);
    const a = drawInt(s.seed, 900, 0, 0, N - 1);
    const b = (a + 2 + drawInt(s.seed, 900, 1, 0, 2)) % N;
    fire[a] = 2;
    fire[b] = 2;
    return { setup: s, total: lastStandRounds(s.length), fire, water: startWater(s.variant), rounds: [] };
  },
  validate,
  apply,
  isOver,
  played: (s) => s.rounds.length,
  result(s) {
    const score = standScore(s);
    return {
      outcome: held(s) ? 'win' : 'loss',
      par: null,
      note: null,
      player: score,
      rival: 0,
      standings: [{ id: 'team', name: 'Your team', score, isPlayer: true }],
      unit: 'team points',
      headline: held(s) ? 'The line held' : 'The valley burned',
    };
  },
  debrief: standDebrief,
  moves(s) {
    if (isOver(s)) return [];
    const bot = teammatePlan(s);
    const avail = s.water - (bot.kind === 'douse' ? 1 : 0);
    const out: Plan[] = [{ kind: 'refill' }];
    const hot = hottest(s.fire, bot.kind === 'douse' ? bot.d : null);
    if (hot >= 0 && avail > 0) out.unshift({ kind: 'douse', d: hot });
    const calm = s.fire.findIndex((f, d) => alive(f) && f <= 1 && neighbours(d).some((x) => s.fire[x] >= 2 && alive(s.fire[x])));
    if (calm >= 0) out.push({ kind: 'firebreak', d: calm });
    return out;
  },
};
