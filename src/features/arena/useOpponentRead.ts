import { useEffect, useRef, useState } from 'react';

import type { ArenaGameId } from '@/src/arena/core';
import { type ReadVerdict, awaitingRead, readAfter, readOpen, scoreRead } from '@/src/arena/reads';
import { useMastery } from '@/src/features/mastery/store';
import { useArenaRecords } from './records';

export interface OpponentRead {
  mystery: boolean;
  guess: string | null;
  /** A read can be made now. */
  open: boolean;
  /** Rounds needed before the first guess. */
  after: number;
  /** The match is over without a guess: offer one before the reveal. */
  awaiting: boolean;
  /** The opponent's identity may be shown (always in a chosen match; in a mystery match once the read is settled). */
  revealed: boolean;
  verdict: ReadVerdict | null;
  guessAs: (id: string) => void;
  skip: () => void;
}

/**
 * The prediction state for one match (rules in src/arena/reads.ts). Remount with the match for a rematch, so no guess
 * carries over. The guess is never passed to the engine: it can't change the bot, the score or the outcome.
 * `initialGuess`: the guess already locked in a resumed match (src/features/resume).
 */
export function useOpponentRead(game: ArenaGameId, persona: string, mystery: boolean, played: number, total: number, over: boolean, initialGuess: string | null = null): OpponentRead {
  const [guess, setGuess] = useState<string | null>(mystery ? initialGuess : null);
  const [skipped, setSkipped] = useState(false);
  const recorded = useRef(false);
  const awaiting = awaitingRead(mystery, over, guess, skipped);
  const settled = over && !awaiting;
  const verdict = mystery && settled ? scoreRead(guess, persona) : null;

  useEffect(() => {
    if (!verdict || recorded.current) return;
    recorded.current = true;
    useArenaRecords.getState().recordRead(game, verdict);
    if (verdict === 'correct') useMastery.getState().record({ system: 'arena', game, opponent: persona, level: 'any', outcome: null, readCorrect: true });
  }, [verdict, game, persona]);

  return {
    mystery,
    guess,
    open: mystery && readOpen(game, played, total, over),
    after: readAfter(game, total),
    awaiting,
    revealed: !mystery || settled,
    verdict,
    guessAs: (id) => {
      // One read per match: it locks when made (src/games/read-rules.ts).
      if (!mystery || settled || guess !== null) return;
      setGuess(id);
    },
    skip: () => setSkipped(true),
  };
}
