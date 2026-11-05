import { auctionPrompt, posteriorMean } from '../../arena/auction.ts';
import type { ArenaGameId } from '../../arena/core.ts';
import { ARENA_ENGINES } from '../../arena/registry.ts';
import { signalPrompt } from '../../arena/signal.ts';
import { ultPrompt } from '../../arena/ultimatum-game.ts';

/**
 * A scripted player for server-run Arena matches that decides from the *redacted* view only — what the device
 * actually receives. If any game needed hidden information to choose a legal action, these players would fail.
 */
export function clientMove(id: ArenaGameId, s: any, k: number): unknown {
  switch (id) {
    case 'cooperation':
      return { move: k % 3 === 0 ? 'D' : 'C', round: s.rounds.length };
    case 'ultimatum-game': {
      const p = ultPrompt(s)!;
      return p.terms.proposer === 'player' ? Math.floor(p.terms.pool / 2) : k % 2 ? 'accept' : 'reject';
    }
    case 'auction': {
      const p = auctionPrompt(s)!;
      return Math.min(p.cash, Math.max(0, Math.round(posteriorMean(p.lot, p.estimate) * 0.8)));
    }
    case 'market':
      return 8 + (k % 6);
    case 'signal': {
      const p = signalPrompt(s)!;
      if (p.role === 'send') return p.strong ? 'stake' : k % 2 ? 'pitch' : 'warn';
      if (p.test === null && k % 3 === 0) return 'investigate';
      return p.signal === 'warn' ? 'pass' : 'invest';
    }
  }
  const ms = ARENA_ENGINES[id].moves?.(s);
  if (ms?.length) return ms[k % ms.length];
  throw new Error(`${id}: no move from the view`);
}
