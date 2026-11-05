import { useCallback, useEffect, useRef, useState } from 'react';

import { type DataError, toDataError } from '@/src/data/errors';

export type Remote<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: DataError };

/**
 * A one-off server read for a screen (a competition's results, a leaderboard): loading, data, or an error with a
 * retry. Never shows anything the server didn't return. `key` identifies what is read: a new key reads again.
 */
export function useRemote<T>(fetch: () => Promise<T>, key: string): [Remote<T>, () => void] {
  const [state, setState] = useState<Remote<T>>({ status: 'loading' });
  const seq = useRef(0);
  const read = useRef(fetch);
  useEffect(() => {
    read.current = fetch;
  });
  const start = useCallback(() => {
    const n = ++seq.current;
    read
      .current()
      .then((data) => {
        if (n === seq.current) setState({ status: 'ready', data });
      })
      .catch((e: unknown) => {
        if (n === seq.current) setState({ status: 'error', error: toDataError(e) });
      });
  }, []);
  useEffect(() => {
    start();
  }, [start, key]);
  /** Retry or refresh (from a button): keeps what is shown while reloading. */
  const retry = useCallback(() => {
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    start();
  }, [start]);
  return [state, retry];
}
