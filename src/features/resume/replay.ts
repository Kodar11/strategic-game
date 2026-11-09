import type { AnyArenaEngine, Setup } from '@/src/arena/core';

/**
 * Rebuilds a saved Strategy Arena match: the same setup (seed included) plus the player's actions, applied in order
 * through the engine. Every action must still be legal and the match must not be over before the last one; otherwise
 * the saved copy doesn't fit the current rules and the caller starts a fresh match instead (null).
 */
export function replayArena<S, A>(engine: AnyArenaEngine, setup: Setup<string, any>, inputs: unknown): { state: S; actions: A[] } | null {
  if (!Array.isArray(inputs) || inputs.length === 0) return null;
  try {
    let state = engine.create(setup);
    for (const a of inputs) {
      if (engine.isOver(state) || engine.validate(state, a) !== null) return null;
      state = engine.apply(state, a);
    }
    if (engine.isOver(state)) return null;
    return { state: state as S, actions: inputs as A[] };
  } catch {
    return null;
  }
}
