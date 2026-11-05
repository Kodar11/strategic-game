import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ArenaMatchError, type ArenaMatchView } from '@/src/data/arena-competition';
import { type DataError, toDataError } from '@/src/data/errors';
import { arenaRepo } from '@/src/data/games-session';
import { reportError } from '@/src/observability/api';

/**
 * One ranked Arena match, run on the server. The device holds only the latest view the server sent; every action is
 * sent with the step it answers, so a retry after a dropped connection is safe (an applied step comes back as a
 * duplicate, never as a second move). Returning to the app reloads the match, so a move made on another device —
 * or a week that closed meanwhile — shows up instead of a stale board.
 */
export function useRankedArenaMatch(matchId: string) {
  const [view, setView] = useState<ArenaMatchView | null>(null);
  const [error, setError] = useState<DataError | null>(null);
  const [busy, setBusy] = useState(false);
  const [unsent, setUnsent] = useState(false);
  const pending = useRef<{ step: number; action: unknown } | null>(null);
  const latest = useRef<ArenaMatchView | null>(null);

  const accept = (v: ArenaMatchView) => {
    latest.current = v;
    setView(v);
    setError(null);
  };

  const load = useCallback(async () => {
    try {
      accept(await arenaRepo.get(matchId));
    } catch (e) {
      setError(toDataError(e));
    }
  }, [matchId]);

  useEffect(() => {
    arenaRepo.get(matchId).then(accept, (e: unknown) => setError(toDataError(e)));
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && !pending.current) void load();
    });
    return () => sub.remove();
  }, [load, matchId]);

  const send = useCallback(
    async (step: number, action: unknown) => {
      pending.current = { step, action };
      setBusy(true);
      setUnsent(false);
      try {
        accept(await arenaRepo.move(matchId, step, action));
        pending.current = null;
      } catch (e) {
        const d = toDataError(e);
        // A move the server couldn't process is worth a look. Ordinary refusals (stale step, week closed, an illegal
        // move the board should have prevented) and lost connections are part of play and aren't reported.
        if (d instanceof ArenaMatchError ? d.refusal === 'invalid_request' : d.kind === 'server' || d.kind === 'refused' || d.kind === 'config') {
          reportError('ranked_move_failed', d, d instanceof ArenaMatchError ? { refusal: d.refusal, operation: 'arena_move' } : { error_code: d.kind, operation: 'arena_move' });
        }
        // Only a transient failure keeps the move pending for "Try again"; anything else was refused for good.
        if (!(d instanceof ArenaMatchError && d.refusal === 'unavailable')) pending.current = null;
        else setUnsent(true);
        if (d instanceof ArenaMatchError && (d.refusal === 'stale' || d.refusal === 'conflict' || d.refusal === 'closed' || d.refusal === 'finished')) await load();
        setError(d);
      } finally {
        setBusy(false);
      }
    },
    [load, matchId],
  );

  const act = useCallback(
    (action: unknown) => {
      const v = latest.current;
      if (!v || v.over || v.status !== 'active' || pending.current) return;
      void send(v.step, action);
    },
    [send],
  );

  /** Resend the move that failed to reach the server (same step: applied at most once). */
  const retry = useCallback(() => {
    const p = pending.current;
    if (p) void send(p.step, p.action);
    else void load();
  }, [load, send]);

  return { view, error, busy, act, retry, reload: load, unsent };
}
