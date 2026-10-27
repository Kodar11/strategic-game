/**
 * Repeated Prisoner's Dilemma (Lesson 13, and the rare-invader experiment in Lesson 7).
 *
 * Stage payoffs use Axelrod's values: T (temptation) 5, R (reward) 3, P (punishment) 1, S (sucker) 0.
 * After each round the game continues with probability δ ("continuation probability"), so the expected value of
 * a stream of payoffs is Σ δ^(t−1) · payoff_t. Opponent strategies are explicit functions of the history.
 */
export type Move = 'C' | 'D';

export interface StagePayoffs {
  T: number;
  R: number;
  P: number;
  S: number;
}

export const AXELROD: StagePayoffs = { T: 5, R: 3, P: 1, S: 0 };

/** [yours, theirs] for one round. */
export function stage(p: StagePayoffs, you: Move, them: Move): [number, number] {
  if (you === 'C' && them === 'C') return [p.R, p.R];
  if (you === 'C' && them === 'D') return [p.S, p.T];
  if (you === 'D' && them === 'C') return [p.T, p.S];
  return [p.P, p.P];
}

export interface Round {
  you: Move;
  them: Move;
}

export type OpponentStrategy = 'tit-for-tat' | 'grim' | 'grim-delayed' | 'always-cooperate' | 'always-defect';

/**
 * The opponent's move in the next round, from the rounds so far.
 * - tit-for-tat: cooperate first, then copy your previous move.
 * - grim: cooperate until you defect once, then defect forever.
 * - grim-delayed: grim, but a defection is only discovered `delay` rounds after it happens.
 */
export function opponentMove(strategy: OpponentStrategy, history: readonly Round[], delay = 0): Move {
  switch (strategy) {
    case 'always-cooperate':
      return 'C';
    case 'always-defect':
      return 'D';
    case 'tit-for-tat':
      return history.length === 0 ? 'C' : history[history.length - 1].you;
    case 'grim':
      return history.some((r) => r.you === 'D') ? 'D' : 'C';
    case 'grim-delayed': {
      // Round k (0-based) can react only to rounds 0 … k − 1 − delay.
      const visible = history.slice(0, Math.max(0, history.length - delay));
      return visible.some((r) => r.you === 'D') ? 'D' : 'C';
    }
  }
}

/** Expected discounted value of always cooperating against a grim or tit-for-tat partner: R / (1 − δ). */
export function cooperateForever(p: StagePayoffs, delta: number): number {
  return p.R / (1 - delta);
}

/**
 * Best deviation against grim trigger that discovers a defection `delay` rounds late: defect from now on —
 * T for the first delay + 1 rounds (the partner keeps cooperating until it finds out), then P forever.
 */
export function defectAgainstGrim(p: StagePayoffs, delta: number, delay = 0): number {
  let value = 0;
  for (let t = 0; t <= delay; t++) value += delta ** t * p.T;
  return value + (delta ** (delay + 1) * p.P) / (1 - delta);
}

/** The smallest δ at which cooperation is sustainable against grim trigger with immediate detection: (T − R)/(T − P). */
export function grimThreshold(p: StagePayoffs): number {
  return (p.T - p.R) / (p.T - p.P);
}

/** Against tit-for-tat: always defecting earns T once then P forever. */
export function defectAgainstTitForTat(p: StagePayoffs, delta: number): number {
  return p.T + (delta * p.P) / (1 - delta);
}

/** Total payoffs over a fixed number of rounds when both follow fixed strategies (used for population fitness). */
export function playFixed(p: StagePayoffs, a: OpponentStrategy, b: OpponentStrategy, rounds: number): [number, number] {
  const hA: Round[] = [];
  const hB: Round[] = [];
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < rounds; i++) {
    const ma = opponentMove(a, hA);
    const mb = opponentMove(b, hB);
    const [pa, pb] = stage(p, ma, mb);
    sa += pa;
    sb += pb;
    // Each strategy sees the other as "you" in its own history.
    hA.push({ you: mb, them: ma });
    hB.push({ you: ma, them: mb });
  }
  return [sa, sb];
}
