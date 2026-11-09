import type { Difficulty, GameId } from '@/src/games/core';
import { CLASSIC_READ, classicEvidence, classicTakeaway } from '@/src/games/reads';
import { RPS_READS, evidence as rpsEvidence, rpsTakeaway } from '@/src/games/rps-insight';
import type { RpsBot, RpsRound } from '@/src/games/rps';

/**
 * What a tournament result explains, built only from what happened in this match:
 * - `moments`: the decisions that mattered (the first is shown as the turning point);
 * - `opponentRead`: what the rival was actually doing, counted from their moves;
 * - `insight`: why it worked, or what beats it.
 * Arena games produce this from their engine's own debrief; the classic games from their recorded rounds.
 */
export interface ResultDebrief {
  moments?: readonly string[];
  /** `evidence`: the moments are counts from the match (classic games), not decisions, so they're titled that way. */
  kind?: 'decisions' | 'evidence';
  opponentRead?: string;
  insight?: string;
}

export function classicDebrief(game: GameId, bot: string, difficulty: Difficulty, rounds: readonly unknown[]): ResultDebrief {
  if (game === 'rps') {
    const b = bot as RpsBot;
    return { kind: 'evidence', moments: rpsEvidence(b, difficulty, rounds as RpsRound[]), opponentRead: RPS_READS[b]?.[difficulty], insight: rpsTakeaway(b, difficulty) };
  }
  return { kind: 'evidence', moments: classicEvidence(game, rounds), opponentRead: CLASSIC_READ[game]?.describe[bot]?.[difficulty], insight: classicTakeaway(game, bot) };
}
