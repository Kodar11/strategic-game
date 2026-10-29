import { useEffect, useRef, useState } from 'react';

import { gamesRepo, useGames } from '@/src/data/games-session';
import { GameError, type ServerMatch } from '@/src/data/games';
import { toDataError } from '@/src/data/errors';
import { type Difficulty, type GameId, type Outcome, type Totals, randomSeed } from '@/src/games/core';
import { engineFor } from '@/src/games/registry';
import { type ReadLock, lockRead, pickHidden, readIsAwaited, readIsOpen, readMinRounds, readPoints } from '@/src/games/reads';
import type { OpponentMode } from '@/src/games/rps-insight';

/**
 * One match, whatever runs it. Practice: the engine on the device, with a fresh seed. Competition and challenge: the
 * server, one round per request — the device never knows the seed, so it can't preview a bot's random choices.
 * Screens and boards only see this interface.
 */

export type MatchMode = 'practice' | 'competition' | 'challenge';

export interface MatchView {
  mode: MatchMode;
  game: GameId;
  bot: string;
  difficulty: Difficulty;
  rounds: unknown[];
  totalRounds: number;
  /** What the player sees before choosing (the bot's offer in the Ultimatum Game), or null. */
  prompt: unknown;
  done: boolean;
  totals: Totals;
  outcome: Outcome | null;
  /** A round is being sent to the server. */
  busy: boolean;
  error: string | null;
  play: (move: unknown) => void;
  server: ServerMatch | null;
  /** 'mystery': the opponent stays hidden until the match ends (any practice match without a chosen opponent). */
  opponent: OpponentMode;
  /**
   * A mystery match's "Read your opponent": the locked prediction, whether one can be made now, and making it.
   * `awaiting`: every round is played but the reveal waits (`done` is still false) until the player reads or skips.
   */
  read: { current: ReadLock | null; open: boolean; awaiting: boolean; lock: (guess: string) => void; skip: () => void } | null;
}

function uuid(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * A practice match on the device, with a fresh seed. Remount it (a new React key) to play again. A null `choice` is a
 * mystery match: the opponent is picked here, at random, and kept hidden until the end (rules in src/games/reads.ts).
 */
export function usePracticeMatch(game: GameId, choice: string | null, difficulty: Difficulty): MatchView {
  const engine = engineFor(game);
  const [current, setState] = useState(() => {
    const chosen = choice !== null && engine.bots.includes(choice);
    const bot = chosen ? choice : pickHidden(engine.bots, Math.random());
    const mode: OpponentMode = chosen ? 'chosen' : 'mystery';
    return { seed: randomSeed(), bot, mode, rounds: [] as unknown[], read: null as ReadLock | null, revealed: false };
  });
  const recorded = useRef(false);

  const { bot, mode, read } = current;
  const spec = { bot, difficulty, seed: current.seed };
  const minRounds = readMinRounds(game);
  const readState = { mystery: mode === 'mystery', roundsPlayed: current.rounds.length, revealed: current.revealed, totalRounds: engine.rounds };
  // A mystery match without a read pauses after the last round, so the player can still make one before the reveal.
  const awaiting = readIsAwaited(read, readState, minRounds);
  const done = current.rounds.length >= engine.rounds && !awaiting;
  const totals = engine.totals(current.rounds);
  const outcome = done ? engine.outcome(current.rounds) : null;

  useEffect(() => {
    if (!done || recorded.current) return;
    recorded.current = true;
    const reads = { opponent: mode, prediction: read?.guess ?? null, insightPoints: readPoints(read, bot)?.points ?? null };
    void useGames.getState().recordPractice({ id: uuid(), game, bot, difficulty, playerScore: totals.player, botScore: totals.bot, outcome: outcome!, ...reads });
  }, [done, game, bot, mode, read, difficulty, totals.player, totals.bot, outcome]);

  const play = (move: unknown) => {
    setState((s) => {
      if (s.rounds.length >= engine.rounds) return s;
      const sp = { bot, difficulty, seed: s.seed };
      const parsed = engine.parseMove(move, engine.prompt(sp, s.rounds));
      if (parsed === null) return s;
      return { ...s, rounds: [...s.rounds, engine.resolve(sp, s.rounds, parsed)] };
    });
  };

  const lock = (guess: string) => setState((s) => ({ ...s, read: lockRead(s.read, guess, { mystery: s.mode === 'mystery', roundsPlayed: s.rounds.length, revealed: s.revealed, totalRounds: engine.rounds }, minRounds, engine.bots) }));
  // Only at the end: skipping the read reveals the opponent.
  const skip = () => setState((s) => (s.rounds.length >= engine.rounds ? { ...s, revealed: true } : s));

  return {
    mode: 'practice',
    game,
    bot,
    difficulty,
    rounds: current.rounds,
    totalRounds: engine.rounds,
    prompt: current.rounds.length >= engine.rounds ? null : engine.prompt(spec, current.rounds),
    done,
    totals,
    outcome,
    busy: false,
    error: null,
    play,
    server: null,
    opponent: mode,
    read: mode === 'mystery' ? { current: read, open: readIsOpen(read, readState, minRounds), awaiting, lock, skip } : null,
  };
}

/** A server-run match (competition or challenge), starting from what start_match returned. */
export function useServerMatch(initial: ServerMatch): MatchView {
  const [match, setMatch] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const engine = engineFor(initial.game);

  const play = (move: unknown) => {
      if (sending.current || match.status !== 'active') return;
      sending.current = true;
      setBusy(true);
      setError(null);
      gamesRepo
        .playRound(match.id, match.rounds.length, move)
        .then((m) => {
          setMatch(m);
          if (m.status !== 'active') {
            // Standings changed: refresh the boards next time they're shown.
            void useGames.getState().loadOverview({ force: true });
            void useGames.getState().loadMine({ force: true });
          }
        })
        .catch(async (e: unknown) => {
          const d = toDataError(e);
          setError(d.message);
          // Out of step (another device, a retry): show the match as the server has it.
          if (e instanceof GameError && (e.refusal === 'stale' || e.refusal === 'finished' || e.refusal === 'closed')) {
            try {
              setMatch(await gamesRepo.getMatch(match.id));
            } catch {
              // Keep the error on screen.
            }
          }
        })
        .finally(() => {
          sending.current = false;
          setBusy(false);
        });
  };

  const done = match.status !== 'active';
  return {
    mode: match.kind,
    game: match.game,
    bot: match.bot,
    difficulty: match.difficulty,
    rounds: match.rounds,
    totalRounds: match.totalRounds,
    prompt: done ? null : match.prompt,
    done,
    totals: engine.totals(match.rounds),
    outcome: match.outcome ?? (match.status === 'completed' ? engine.outcome(match.rounds) : null),
    busy,
    error,
    play,
    server: match,
    opponent: 'chosen',
    read: null,
  };
}
