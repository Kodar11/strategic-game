import { ReadCard } from '@/src/components/game/ReadCard';
import { ARENA } from '@/src/arena/catalog';
import type { ArenaGameId } from '@/src/arena/core';
import { READ_RULES } from '@/src/arena/reads';
import type { OpponentRead } from '../useOpponentRead';

/**
 * "Read your opponent" during an Arena mystery match (rules in src/games/read-rules.ts). It never blocks a move, and the
 * options are the game's four personalities in the catalog's fixed order, so nothing here hints at which one is playing.
 */
export function ReadPanel({ game, read, played }: { game: ArenaGameId; read: OpponentRead; played: number }) {
  if (!read.mystery || (read.revealed && !read.awaiting)) return null;
  const rule = READ_RULES[game];
  const opponents = ARENA[game].opponents;
  return (
    <ReadCard
      target={rule.target}
      evidence={rule.evidence}
      roundsLeft={Math.max(0, read.after - played)}
      open={read.open}
      awaiting={read.awaiting}
      lockedName={read.guess ? (opponents.find((o) => o.id === read.guess)?.name ?? read.guess) : null}
      options={opponents.map((o) => ({ id: o.id, name: o.name, description: o.summary }))}
      onLock={read.guessAs}
      onSkip={read.skip}
    />
  );
}
