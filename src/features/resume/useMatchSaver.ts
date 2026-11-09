import { useEffect, useMemo } from 'react';

import { type ResumeContext, type ResumeSystem, type SavedMatch, sameParams, slotOf, useResume } from './store';

export interface SaveTarget {
  system: ResumeSystem;
  game: string;
  context: ResumeContext;
  params: Record<string, string>;
}

/**
 * Keeps the saved copy of a device match current: written after every input while the match runs, removed once it is
 * over. Nothing is saved before the first input, so opening a match and backing out leaves nothing behind.
 */
export function useMatchSaver(target: SaveTarget | undefined, m: { seed: number; inputs: unknown; count: number; guess: string | null; played: number; total: number; over: boolean }) {
  const { seed, inputs, count, guess, played, total, over } = m;
  useEffect(() => {
    if (!target) return;
    const slot = slotOf(target.system, target.game, target.context);
    if (over) {
      useResume.getState().clear(slot);
      return;
    }
    if (count === 0) return;
    useResume.getState().save({ ...target, seed, inputs, guess, played, total });
    // `target` is rebuilt on every render; its content is fixed for one match (a new match remounts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, inputs, count, guess, played, total, over]);
}

/**
 * The saved match a play screen should resume, read once the store has loaded: the same game and context, the same
 * route params, still fresh. `ready` is false for the moment the store is read from disk; render nothing until then.
 */
export function useSavedMatch(target: SaveTarget): { ready: boolean; saved: SavedMatch | null } {
  const loaded = useResume((s) => s.loaded);
  useEffect(() => {
    void useResume.getState().load();
  }, []);
  const slot = slotOf(target.system, target.game, target.context);
  // Read once, when the store is ready: later saves come from this same match. `target` is rebuilt on every render
  // but fixed for one screen (new params remount it), so only readiness and the slot are dependencies.
  const saved = useMemo(
    () => {
      if (!loaded) return null;
      const m = useResume.getState().get(slot);
      return m && m.system === target.system && sameParams(m.params, target.params) ? m : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, slot],
  );
  return { ready: loaded, saved };
}
