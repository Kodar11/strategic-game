import { APP_NAME } from '../brand.ts';
import { DIFFICULTY_LABEL, GAMES, personality } from './catalog.ts';
import type { Difficulty, GameId, Outcome, Totals } from './core.ts';

/**
 * Text for sharing a result or inviting a friend. Short enough to read in a chat preview. It never includes account
 * ids, match ids, seeds, or anything about how a bot decides.
 */

function scoreLine(game: GameId, t: Totals): string {
  switch (game) {
    case 'rps':
      return `${t.player}–${t.bot} on points`;
    case 'two-thirds':
      return `${t.player} points out of 100`;
    case 'stag-hunt':
      return `${t.player}–${t.bot} on points`;
    default:
      return `${t.player}–${t.bot} in coins`;
  }
}

export function resultShareText(game: GameId, bot: string, difficulty: Difficulty, outcome: Outcome, totals: Totals): string {
  const g = GAMES[game];
  const who = `${personality(game, bot)?.name ?? 'a bot'} (${DIFFICULTY_LABEL[difficulty]})`;
  const head =
    game === 'two-thirds'
      ? `I scored ${scoreLine(game, totals)} in ${g.title} against a crowd of ${who}.`
      : outcome === 'win'
        ? `I beat ${who} at ${g.title}, ${scoreLine(game, totals)}.`
        : outcome === 'draw'
          ? `I drew with ${who} at ${g.title}, ${scoreLine(game, totals)}.`
          : `${who} beat me at ${g.title}, ${scoreLine(game, totals)}.`;
  return `${head} ${g.concept} Played on ${APP_NAME}.`;
}

export function inviteText(game: GameId, bot: string, difficulty: Difficulty, myScore: number | null): string {
  const g = GAMES[game];
  const who = `${personality(game, bot)?.name ?? 'a bot'} (${DIFFICULTY_LABEL[difficulty]})`;
  const mine = myScore === null ? '' : ` I scored ${myScore}.`;
  return `I challenge you to ${g.title} on ${APP_NAME}: same opponent — ${who} — and the same luck for both of us.${mine} Can you beat it?`;
}
