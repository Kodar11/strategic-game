import { useCallback, useEffect, useRef, useState } from 'react';

import type { ArenaEngine, MatchResult, Setup } from '@/src/arena/core';
import { arenaUploads, matchId } from '@/src/data/arena-session';
import { useStyle } from '@/src/features/style/store';
import { useMastery } from '@/src/features/mastery/store';
import { replayArena } from '@/src/features/resume/replay';
import { useArenaRecords } from './records';

/** A second tap this soon after a round resolved is treated as an accidental double tap, not the next move. */
const DOUBLE_TAP_MS = 350;

/**
 * One Strategy Arena match on the device. The engine owns every rule; this only holds the state, applies legal
 * actions (an illegal one is refused and reported, never applied), swallows accidental double taps, and records the
 * result once when the match ends. Remount with a new key — and a new seed — for a rematch.
 * `resume`: a saved match's actions (src/features/resume), replayed on the same setup; ignored when they no longer fit.
 */
export function useArenaMatch<S extends { setup: Setup<V, any> }, A, V extends string>(engine: ArenaEngine<S, A, V>, setup: Setup<V, any>, resume?: unknown) {
  const [start] = useState(() => (resume === undefined ? null : replayArena<S, A>(engine, setup, resume)));
  const [state, setState] = useState<S>(() => start?.state ?? engine.create(setup));
  const [refusal, setRefusal] = useState<string | null>(null);
  const [newBest, setNewBest] = useState(false);
  const latest = useRef(state);
  // The player's actions in order, for Game Review (src/review): the setup plus these replay the match exactly.
  const [actions, setActions] = useState<readonly A[]>(() => start?.actions ?? []);
  const resolvedAt = useRef(0);
  const recorded = useRef(false);
  const over = engine.isOver(state);
  const result: MatchResult | null = over ? engine.result(state) : null;

  useEffect(() => {
    if (!result || recorded.current) return;
    recorded.current = true;
    const s = state.setup;
    setNewBest(useArenaRecords.getState().record(engine.id, { persona: s.persona, level: s.level, variant: s.variant, outcome: result.outcome, player: result.player, rival: result.rival }));
    // The summary for the player's account: the result screen's facts only — no seed, rounds or hidden information.
    arenaUploads.enqueue({ id: matchId(), game: engine.id, opponent: s.persona, level: s.level, variant: s.variant, length: s.length, outcome: result.outcome, playerScore: result.player, rivalScore: result.rival, rounds: engine.played(state), playedAt: Date.now() });
    useArenaRecords.getState().markCoached(engine.id);
    useMastery.getState().record({ system: 'arena', game: engine.id, opponent: s.persona, level: s.level, outcome: result.outcome });
    useStyle.getState().record(engine.id, (state as { rounds?: unknown[] }).rounds ?? []);
  }, [result, state, engine]);

  const act = useCallback(
    (a: A) => {
      const s = latest.current;
      if (Date.now() - resolvedAt.current < DOUBLE_TAP_MS) return;
      const why = engine.validate(s, a);
      setRefusal(why);
      if (why) return;
      const next = engine.apply(s, a);
      setActions((xs) => [...xs, a]);
      if (engine.played(next) > engine.played(s)) resolvedAt.current = Date.now();
      latest.current = next;
      setState(next);
    },
    [engine],
  );

  return { state, act, over, result, refusal, newBest, actions, resumed: start !== null };
}
