import { useCallback, useEffect, useRef, useState } from 'react';

import type { ArenaEngine, MatchResult, Setup } from '@/src/arena/core';
import { useArenaRecords } from './records';

/** A second tap this soon after a round resolved is treated as an accidental double tap, not the next move. */
const DOUBLE_TAP_MS = 350;

/**
 * One Strategy Arena match on the device. The engine owns every rule; this only holds the state, applies legal
 * actions (an illegal one is refused and reported, never applied), swallows accidental double taps, and records the
 * result once when the match ends. Remount with a new key — and a new seed — for a rematch.
 */
export function useArenaMatch<S extends { setup: Setup<V> }, A, V extends string>(engine: ArenaEngine<S, A, V>, setup: Setup<V>) {
  const [state, setState] = useState(() => engine.create(setup));
  const [refusal, setRefusal] = useState<string | null>(null);
  const [newBest, setNewBest] = useState(false);
  const latest = useRef(state);
  const resolvedAt = useRef(0);
  const recorded = useRef(false);
  const over = engine.isOver(state);
  const result: MatchResult | null = over ? engine.result(state) : null;

  useEffect(() => {
    if (!result || recorded.current) return;
    recorded.current = true;
    const s = state.setup;
    setNewBest(useArenaRecords.getState().record(engine.id, { persona: s.persona, level: s.level, variant: s.variant, outcome: result.outcome, player: result.player, rival: result.rival }));
    useArenaRecords.getState().markCoached(engine.id);
  }, [result, state.setup, engine.id]);

  const act = useCallback(
    (a: A) => {
      const s = latest.current;
      if (Date.now() - resolvedAt.current < DOUBLE_TAP_MS) return;
      const why = engine.validate(s, a);
      setRefusal(why);
      if (why) return;
      const next = engine.apply(s, a);
      if (engine.played(next) > engine.played(s)) resolvedAt.current = Date.now();
      latest.current = next;
      setState(next);
    },
    [engine],
  );

  return { state, act, over, result, refusal, newBest };
}
