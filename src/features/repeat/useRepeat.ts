import { useEffect, useRef, useState } from 'react';

import { type RepeatEnd, type RepeatGame, type RepeatPlan, type RepeatProgress, type RepeatStrategy, completedIn, markSent, startPlan, strategyOf, tickPlan } from '@/src/repeat/plan';

/** Pause after each resolved round before the repeated move goes in, so every reveal is still seen. */
export const REPEAT_DELAY_MS = 900;

/** What a screen gives the repeat controller: the game's state at this decision, its progress, and its own submit. */
export interface RepeatHost<C, M> {
  ctx: C;
  progress: RepeatProgress;
  /** Submits one move through the match's normal path. False when it was refused, which ends the run. */
  play: (move: M) => boolean;
  /** The pause before each repeated move (default REPEAT_DELAY_MS). */
  delayMs?: number;
}

export interface RepeatOutcome {
  reason: RepeatEnd;
  label: string;
  completed: number;
  /** Played count when the run ended; the notice is shown only until the next round resolves. */
  at: number;
}

export interface RepeatController {
  game: RepeatGame<unknown, unknown>;
  progress: RepeatProgress;
  plan: RepeatPlan | null;
  strategy: RepeatStrategy<unknown, unknown> | undefined;
  running: boolean;
  /** Rounds the current run has completed. */
  completed: number;
  /** How the last run ended, while that is still the latest news. */
  last: RepeatOutcome | null;
  /** The repeat played the final round: the screen holds its results until the player presses Continue. */
  holding: boolean;
  start: (strategy: string, amount: number, count: number) => void;
  /** Stops before the next decision. A round already resolving finishes normally; nothing is undone. */
  cancel: () => void;
  /** Continue: release the held results. */
  release: () => void;
}

/**
 * Runs a repeat plan (src/repeat/plan.ts) against a live match. One move per round, after REPEAT_DELAY_MS, only while
 * nothing is in flight; the timer re-checks the plan when it fires, so a cancel always wins over a pending move.
 * Nothing here is persisted: leaving the screen ends the run, and a resumed match starts manual.
 */
export function useRepeat<C, M>(game: RepeatGame<C, M>, host: RepeatHost<C, M>): RepeatController {
  const [plan, setPlan] = useState<RepeatPlan | null>(null);
  const [last, setLast] = useState<RepeatOutcome | null>(null);
  const [holding, setHolding] = useState(false);
  const planRef = useRef<RepeatPlan | null>(null);
  const hostRef = useRef(host);
  useEffect(() => {
    hostRef.current = host;
  });

  const { played, total, busy, over } = host.progress;
  const delay = host.delayMs ?? REPEAT_DELAY_MS;
  const error = !!host.progress.error;

  const set = (p: RepeatPlan | null) => {
    planRef.current = p;
    setPlan(p);
  };

  const finish = (p: RepeatPlan, reason: RepeatEnd, at: number) => {
    set(null);
    setLast({ reason, label: strategyOf(game, p.strategy)?.label(p.amount) ?? '', completed: completedIn(p, at), at });
    if (reason === 'match-over') setHolding(true);
  };

  useEffect(() => {
    const p = planRef.current;
    if (!p || p !== plan) return;
    const progress = { played, total, busy, over, error };
    const t = tickPlan(p, progress);
    if (t.kind === 'end') {
      finish(p, t.reason, played);
      return;
    }
    if (t.kind === 'wait') return;
    const timer = setTimeout(() => {
      // Cancelled, or replaced, while the pause ran: release nothing.
      if (planRef.current !== p) return;
      const move = strategyOf(game, p.strategy)?.next(hostRef.current.ctx, t.step, p.amount) ?? null;
      set(markSent(p, played));
      if (move === null || !hostRef.current.play(move)) finish(p, 'refused', played);
    }, delay);
    return () => clearTimeout(timer);
    // `finish` and `set` only touch state setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, played, total, busy, over, error, game, delay]);

  const strategy = plan ? strategyOf(game, plan.strategy) : undefined;
  return {
    game: game as RepeatGame<unknown, unknown>,
    progress: host.progress,
    plan,
    strategy: strategy as RepeatStrategy<unknown, unknown> | undefined,
    running: plan !== null,
    completed: plan ? completedIn(plan, played) : 0,
    last: last && last.at === played ? last : null,
    holding,
    start: (id, amount, count) => {
      if (planRef.current || !strategyOf(game, id)) return;
      const p = startPlan(id, amount, count, { played, total, busy, over, error });
      if (!p) return;
      setLast(null);
      set(p);
    },
    cancel: () => {
      const p = planRef.current;
      // A server round already in flight still resolves; keep the notice up until the round after it.
      if (p) finish(p, 'cancelled', played + (busy && p.sentFor === played ? 1 : 0));
    },
    release: () => setHolding(false),
  };
}
