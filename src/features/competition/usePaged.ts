import { useCallback, useEffect, useRef, useState } from 'react';

import { toDataError } from '@/src/data/errors';

/**
 * A server list read a page at a time, newest first (history screens): the first page on mount, more on request.
 * Bounded reads only — nothing fetches a whole history at once.
 */
export function usePaged<T, C>(fetch: (cursor: C | null) => Promise<{ items: T[]; next: C | null }>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [next, setNext] = useState<C | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const read = useRef(fetch);
  useEffect(() => {
    read.current = fetch;
  });

  const apply = useCallback((cursor: C | null, page: { items: T[]; next: C | null }) => {
    setItems((cur) => (cursor !== null && cur ? [...cur, ...page.items] : page.items));
    setNext(page.next);
    setError(null);
    setLoading(false);
  }, []);
  const fail = useCallback((e: unknown) => {
    setError(toDataError(e).message);
    setLoading(false);
  }, []);

  useEffect(() => {
    read.current(null).then((p) => apply(null, p), fail);
  }, [apply, fail]);

  /** From a button: the next page, or (cursor null) a fresh first page. */
  const load = useCallback(
    (cursor: C | null) => {
      setLoading(true);
      read.current(cursor).then((p) => apply(cursor, p), fail);
    },
    [apply, fail],
  );
  return { items, next, error, loading, load };
}
