import type { MyGames } from '../../data/games.ts';
import type { Difficulty, GameId, Outcome } from '../../games/core.ts';

/**
 * "Opponent history" for a game: the player's completed games (practice logs and server matches) from get_my_games,
 * newest first. Only finished games are listed, so the opponent is always shown — a mystery one is revealed by then.
 */

export type HistoryKind = 'mystery' | 'chosen' | 'practice' | 'competition' | 'challenge';

export interface HistoryItem {
  bot: string;
  difficulty: Difficulty;
  /** ms since epoch the game finished. */
  at: number;
  outcome: Outcome | null;
  playerScore: number;
  botScore: number;
  /** 'practice' is a practice game logged without (or before) opponent modes. */
  kind: HistoryKind;
  /** Mystery games with a read: whether it was right and the Insight Points it earned. */
  read: { correct: boolean; points: number } | null;
}

export function opponentHistory(mine: MyGames, game: GameId, limit = 5): HistoryItem[] {
  const practice = mine.practice
    .filter((p) => p.game === game)
    .map(
      (p): HistoryItem => ({
        bot: p.bot,
        difficulty: p.difficulty,
        at: p.playedAt,
        outcome: p.outcome,
        playerScore: p.playerScore,
        botScore: p.botScore,
        kind: p.opponent ?? 'practice',
        read: p.prediction ? { correct: p.prediction === p.bot, points: p.insightPoints ?? 0 } : null,
      }),
    );
  const matches = mine.matches
    .filter((m) => m.game === game)
    .map(
      (m): HistoryItem => ({
        bot: m.bot,
        difficulty: m.difficulty,
        at: m.completedAt ?? 0,
        outcome: m.outcome,
        playerScore: m.playerScore,
        botScore: m.botScore,
        kind: m.kind,
        read: null,
      }),
    );
  return [...practice, ...matches].sort((a, b) => b.at - a.at).slice(0, limit);
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function ago(at: number, now: number): string {
  const min = Math.floor(Math.max(0, now - at) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
