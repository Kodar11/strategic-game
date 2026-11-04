import { ReadCard } from '@/src/components/game/ReadCard';
import { personality } from '@/src/games/catalog';
import { readMinRounds, readOptions, readTarget } from '@/src/games/reads';
import { engineFor } from '@/src/games/registry';
import type { MatchView } from '../useMatch';

/**
 * "Read your opponent" during a classic mystery match (rules in src/games/read-rules.ts). Nothing here says whether a
 * read is right: that waits for the reveal.
 */
export function ReadOpponentPanel({ view }: { view: MatchView }) {
  const read = view.read;
  if (!read || view.done) return null;
  return (
    <ReadCard
      target={readTarget(view.game)}
      roundsLeft={Math.max(0, readMinRounds(view.game) - view.rounds.length)}
      open={read.open && !read.awaiting}
      awaiting={read.awaiting}
      lockedName={read.current ? (personality(view.game, read.current.guess)?.name ?? read.current.guess) : null}
      options={readOptions(view.game, engineFor(view.game).bots, view.difficulty)}
      onLock={read.lock}
      onSkip={read.skip}
    />
  );
}
