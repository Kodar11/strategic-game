/**
 * The one set of rules and words for "Read your opponent", in classic and Arena games alike:
 * - A mystery match hides its opponent until the reveal.
 * - One read per match, open after enough rounds to tell personalities apart. It locks when made.
 * - If none was made by the end, the reveal waits for one, or a skip.
 * - A right read earns READ_POINTS Insight Points; a wrong one costs nothing. The read never affects the match.
 * Classic practice logs keep recording `prediction` and `insightPoints`; Arena reads stay in the local record as before.
 */
export const READ_POINTS = 3;

export function readCopy(target: string, evidence: string | undefined, roundsLeft: number) {
  const pts = `+${READ_POINTS} Insight Points`;
  const rounds = `${roundsLeft} more ${roundsLeft === 1 ? 'round' : 'rounds'}`;
  return {
    title: `Read ${target}`,
    open: 'Make your read',
    body: `Name the personality you’ve spotted. It locks once made. A right read earns ${pts}; a wrong one costs nothing, and the match isn’t affected.`,
    waiting: `Mystery personality. You can read ${target} after ${rounds} for ${pts}${evidence ? `. Watch ${evidence}` : ''}.`,
    endTitle: 'Before the reveal',
    endBody: `The match is over. Name ${target}’s personality before it’s revealed: a right read earns ${pts}. Or skip to the results.`,
    lockedPrefix: 'Your read:',
    lockedSuffix: 'locked, checked at the reveal',
    lock: 'Lock read',
    lockHint: 'Locks in your read. It can’t be changed.',
    later: 'Not yet',
    skip: 'Skip',
  };
}

/** Points for a settled read: only a right one earns any. */
export const readPointsFor = (verdict: 'correct' | 'incorrect' | 'unscored') => (verdict === 'correct' ? READ_POINTS : 0);
