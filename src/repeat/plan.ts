/**
 * Repeat play — let a decision or a strategy play several eligible rounds for the player, cancellable at any time.
 *
 * This file is game-agnostic and pure. It never decides an opponent's move, a payoff or a score: the game's own engine
 * resolves every round through the match's normal `play`/`act`, one round at a time. Here we only decide *when* the
 * next repeated move may be submitted and *which* move the chosen strategy names for the real history.
 *
 * - A game opts in with a `RepeatGame` (its strategies, in src/repeat/classic.ts and src/repeat/arena.ts). Games
 *   without one keep their manual experience unchanged.
 * - A `RepeatPlan` covers `count` eligible rounds starting at `from` (rounds already played when it began). It never
 *   exceeds the rounds left and never adds rounds: progress is always derived from the match's own played count.
 * - `tickPlan` releases at most one move per round, only when the round before has resolved and nothing is in flight,
 *   so a round can never get two moves and a resolving round is never interrupted.
 * - Plans live in component state only. A match that is reopened (a server match resumed later) starts manual: an
 *   automatic decision is never resumed without the plan the player started in that session.
 */

/** A: one fixed action. B: a fixed sequence. C: a rule that reads the real history. */
export type RepeatKind = 'fixed' | 'pattern' | 'conditional';

/** A number the player picks for a strategy (a claim, a pick, a catch). */
export interface RepeatAmount {
  label: string;
  min: number;
  max: number;
  initial: number;
}

/**
 * One strategy the player can repeat. `C` is what the game exposes before a decision (its history or state), `M` the
 * move it submits. `next` is evaluated at every decision against the actual `C`, never precomputed.
 */
export interface RepeatStrategy<C, M> {
  id: string;
  kind: RepeatKind;
  label(amount: number): string;
  /** One line: exactly what the strategy will do. */
  detail(amount: number): string;
  amount?: RepeatAmount;
  /** The move for this decision; `step` is its index within the run (0 for the first repeated round). Null stops the run. */
  next(ctx: C, step: number, amount: number): M | null;
}

export interface RepeatGame<C, M> {
  strategies: readonly RepeatStrategy<C, M>[];
  /** Rounds are called this on the panel ("rounds", "missions"…). */
  roundWord?: string;
}

/** A game without repeat play: no strategies, so screens show nothing and the controller never runs. */
export const NO_REPEAT: RepeatGame<unknown, unknown> = { strategies: [] };

/** What the match says about itself before each decision. */
export interface RepeatProgress {
  played: number;
  total: number;
  /** A round is in flight (a server match) or the screen isn't at a decision yet (a reveal is showing). */
  busy: boolean;
  /** The match has ended (including an early end: a collapse). */
  over: boolean;
  /** The last submission failed (shown as an error on the screen). */
  error?: boolean;
}

export interface RepeatPlan {
  strategy: string;
  amount: number;
  /** Rounds this plan covers. */
  count: number;
  /** Rounds already played when it started. */
  from: number;
  /** The played count a move was last released for, so a round gets at most one. */
  sentFor: number;
}

export type RepeatEnd = 'count' | 'match-over' | 'cancelled' | 'refused';

export type RepeatTick = { kind: 'wait' } | { kind: 'release'; step: number } | { kind: 'end'; reason: Exclude<RepeatEnd, 'cancelled'> };

export const roundsLeft = (p: Pick<RepeatProgress, 'played' | 'total'>) => Math.max(0, p.total - p.played);

/** A plan for `count` rounds, clamped to the rounds left — or null when nothing is left to repeat. */
export function startPlan(strategy: string, amount: number, count: number, p: RepeatProgress): RepeatPlan | null {
  const left = roundsLeft(p);
  if (p.over || left === 0 || !Number.isFinite(count)) return null;
  return { strategy, amount, count: Math.min(left, Math.max(1, Math.floor(count))), from: p.played, sentFor: -1 };
}

/** Rounds this plan has completed so far (resolved by the engine). */
export const completedIn = (plan: RepeatPlan, played: number) => Math.min(plan.count, Math.max(0, played - plan.from));

/**
 * What to do now. The caller ticks after its reveal pause; ticking more often is harmless. An `end` with
 * `match-over` means the repeat played the final round, and the screen should hold the results for an explicit Continue.
 */
export function tickPlan(plan: RepeatPlan, p: RepeatProgress): RepeatTick {
  // Only a failure of this plan's own submission ends it; an error left over from before it started doesn't.
  if (p.error && plan.sentFor === p.played) return { kind: 'end', reason: 'refused' };
  if (p.over || p.played >= p.total) return { kind: 'end', reason: 'match-over' };
  const done = p.played - plan.from;
  if (done >= plan.count) return { kind: 'end', reason: 'count' };
  if (p.busy || plan.sentFor === p.played) return { kind: 'wait' };
  return { kind: 'release', step: done };
}

export const markSent = (plan: RepeatPlan, played: number): RepeatPlan => ({ ...plan, sentFor: played });

/** The strategy a plan names, or undefined for an unknown id. */
export const strategyOf = <C, M>(game: RepeatGame<C, M>, id: string) => game.strategies.find((s) => s.id === id);

/** A sensible starting count: every round left, which is never more than the match length. */
export const defaultCount = (p: Pick<RepeatProgress, 'played' | 'total'>) => roundsLeft(p);

/**
 * Drive a plan over a synchronous match until it ends — the hook's loop without timers. Used by tests and by nothing
 * at runtime (screens tick after a pause so every round is seen).
 */
export function runPlan<C, M>(
  game: RepeatGame<C, M>,
  plan: RepeatPlan,
  host: { ctx: () => C; progress: () => RepeatProgress; play: (m: M) => boolean },
  maxTicks = 1000,
): { plan: RepeatPlan; end: Exclude<RepeatEnd, 'cancelled'> } {
  let current = plan;
  const strategy = strategyOf(game, plan.strategy);
  if (!strategy) return { plan, end: 'refused' };
  for (let i = 0; i < maxTicks; i++) {
    const p = host.progress();
    const t = tickPlan(current, p);
    if (t.kind === 'end') return { plan: current, end: t.reason };
    if (t.kind === 'wait') continue;
    const move = strategy.next(host.ctx(), t.step, current.amount);
    current = markSent(current, p.played);
    if (move === null || !host.play(move)) return { plan: current, end: 'refused' };
  }
  return { plan: current, end: 'refused' };
}
