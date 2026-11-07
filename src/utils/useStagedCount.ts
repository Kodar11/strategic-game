import { useEffect, useState } from 'react';

const FRAME_MS = 16;

/**
 * How many of `total` items to render right now: `first` at once, then `step` more on each following frame until all
 * are in. Long screens (every lesson card, every game) show their top immediately and fill in below the fold instead
 * of building everything before the first frame — which is what made opening those tabs feel slow.
 */
export function useStagedCount(total: number, first = 1, step = 1): number {
  const [count, setCount] = useState(() => Math.min(first, total));
  useEffect(() => {
    if (count >= total) return;
    // About a frame for the current batch to draw, then the next. A timer rather than requestAnimationFrame, which
    // a paused or hidden view can stop altogether and leave the list half drawn.
    const timer = setTimeout(() => setCount((c) => Math.min(total, c + step)), FRAME_MS);
    return () => clearTimeout(timer);
  }, [count, total, step]);
  return Math.min(count, total);
}
