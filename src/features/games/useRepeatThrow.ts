import { useEffect, useRef, useState } from 'react';

import { RepeatThrow } from '@/src/games/rps-insight';
import type { RpsMove } from '@/src/games/rps';
import type { MatchView } from './useMatch';

/** Pause after each reveal before the repeated throw goes in, so every round is still seen. */
export const REPEAT_DELAY_MS = 900;

/**
 * "Repeat this throw" for a Rock, Paper, Scissors board: once started, the same move is played for each remaining
 * round, one round at a time, through the match's own `play` (so busy and finished matches are respected).
 * `move` is what is being repeated, or null.
 */
export function useRepeatThrow(view: MatchView) {
  const [repeater] = useState(() => new RepeatThrow());
  const [move, setMove] = useState<RpsMove | null>(null);
  // The latest play, so an unrelated re-render doesn't restart the pause.
  const play = useRef(view.play);
  useEffect(() => {
    play.current = view.play;
  });

  const roundsPlayed = view.rounds.length;
  const { totalRounds, busy, done } = view;
  const error = view.error !== null;
  useEffect(() => {
    if (!move) return;
    const t = setTimeout(() => {
      const next = repeater.tick({ roundsPlayed, totalRounds, busy, done, error });
      if (next) play.current(next);
    }, REPEAT_DELAY_MS);
    return () => clearTimeout(t);
  }, [repeater, move, roundsPlayed, totalRounds, busy, done, error]);

  return {
    // Ended by the match finishing or a failed round: shown as off, and the controller has disarmed itself.
    move: done || error ? null : move,
    start: (m: RpsMove) => {
      repeater.start(m);
      setMove(m);
    },
    cancel: () => {
      repeater.cancel();
      setMove(null);
    },
  };
}
