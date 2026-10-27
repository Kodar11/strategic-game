import { EPSILON } from './rng.ts';

/**
 * Brinkmanship as an explicit escalation ladder (Lesson 21). Unlike a war of attrition, nobody just waits: each
 * step you take raises the chance of a disaster that hurts both sides, and that shared risk is what pressures the
 * other side to back down.
 *
 * Each round, at level L, you choose:
 * - `back-down`: the standoff ends; you pay the concession cost for your current level.
 * - `hold`: stay at L — the risk at L applies again this round.
 * - `escalate`: move to L + 1 (if below the top) and face its risk.
 * Then, if you didn't back down: disaster strikes with probability risk[L]; otherwise the other side backs down with
 * probability yield[L]; otherwise the next round starts. After `maxRounds` rounds the standoff ends in a stalemate.
 */
export interface Ladder {
  /** Disaster probability at each level (index = level). Level 0 has no risk. */
  risk: readonly number[];
  /** Probability the other side backs down at each level, if no disaster. */
  yield: readonly number[];
  /** Your payoff if the other side backs down. */
  win: number;
  /** Your payoff from a disaster. */
  disaster: number;
  /** Your payoff from backing down at each level (it gets worse the higher you climbed). */
  concede: readonly number[];
  stalemate: number;
  maxRounds: number;
}

export type LadderAction = 'escalate' | 'hold' | 'back-down';

/** Expected value of an action at level L with `roundsLeft` rounds to go (including this one), playing optimally after. */
export function ladderActionValue(l: Ladder, level: number, roundsLeft: number, action: LadderAction): number {
  if (action === 'back-down') return l.concede[level];
  const next = action === 'escalate' ? Math.min(level + 1, l.risk.length - 1) : level;
  const r = l.risk[next];
  const y = l.yield[next];
  const cont = roundsLeft <= 1 ? l.stalemate : ladderValue(l, next, roundsLeft - 1).value;
  return r * l.disaster + (1 - r) * (y * l.win + (1 - y) * cont);
}

/** Best action and its value. Ties prefer backing down, then holding (the less risky choice). */
export function ladderValue(l: Ladder, level: number, roundsLeft: number): { action: LadderAction; value: number } {
  const order: LadderAction[] = ['back-down', 'hold', 'escalate'];
  let best: { action: LadderAction; value: number } = { action: 'back-down', value: -Infinity };
  for (const a of order) {
    if (a === 'escalate' && level >= l.risk.length - 1) continue;
    const v = ladderActionValue(l, level, roundsLeft, a);
    if (v > best.value + EPSILON) best = { action: a, value: v };
  }
  return best;
}
