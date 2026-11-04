/**
 * The timing of a staged reveal, as data: when each step appears. With reduced motion everything is shown at once, so
 * no information ever waits on an animation. Pure, so the guarantee can be tested without rendering.
 */
export function revealDelays(steps: number, stepMs: number, reduced: boolean, startMs = 0): number[] {
  return Array.from({ length: Math.max(0, steps) }, (_, i) => (reduced ? 0 : startMs + i * stepMs));
}

/** The values a count-up passes through, ending exactly on `to`. One value (the end) with reduced motion. */
export function countUpValues(to: number, frames: number, reduced: boolean): number[] {
  if (reduced || frames <= 1 || to === 0) return [to];
  return Array.from({ length: frames }, (_, i) => (i === frames - 1 ? to : Math.round((to * (i + 1)) / frames)));
}

/** A leave warning is only due while there is a match to lose. */
export const shouldGuardLeave = (started: boolean, over: boolean, confirmed: boolean) => started && !over && !confirmed;
