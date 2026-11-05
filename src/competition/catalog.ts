import { ARENA, LENGTH_LABEL, LEVEL_LABEL, opponentName } from '../arena/catalog.ts';
import { ARENA_IDS, type ArenaGameId, isArenaId, isLevel } from '../arena/core.ts';
import { DIFFICULTY_LABEL, GAMES, personality } from '../games/catalog.ts';
import { GAME_IDS, type GameId, isDifficulty, isGameId } from '../games/core.ts';
import { SCORING_RULES } from './scoring.ts';

/**
 * Every game that can be Game of the Week — the five classics (src/games) and the eighteen Strategy Arena games
 * (src/arena) — described the same way for the competition screens: name, a one-line description, the opponent and
 * difficulty in that game's own words, and how the week is scored. Pure data, no React.
 */

export const COMPETITION_GAME_IDS = [...GAME_IDS, ...ARENA_IDS] as const;
export type CompetitionGameId = GameId | ArenaGameId;
export const isCompetitionGameId = (x: unknown): x is CompetitionGameId => isGameId(x) || isArenaId(x);

export interface CompetitionGameInfo {
  id: CompetitionGameId;
  kind: 'classic' | 'arena';
  title: string;
  /** One line: what the game is about. */
  blurb: string;
  /** How the weekly score is measured (and the tie-break, when there is one). */
  scoring: string;
  tieBreak: string | null;
}

const CLASSIC_SCORING: Record<GameId, string> = {
  rps: 'Match points: 3 a win, 1 a tie, 0 a loss, over 12 rounds.',
  'two-thirds': 'Points over 5 rounds: 10 for a sole win, 5 shared, plus up to 10 for closeness.',
  'split-steal': 'Coins over 10 rounds.',
  ultimatum: 'Coins kept over 6 rounds.',
  'stag-hunt': 'Points over 8 rounds.',
};

export function competitionGame(id: CompetitionGameId): CompetitionGameInfo {
  if (isArenaId(id)) {
    const a = ARENA[id];
    return { id, kind: 'arena', title: a.title, blurb: a.subtitle ?? a.tagline, scoring: SCORING_RULES[id].score, tieBreak: SCORING_RULES[id].secondary };
  }
  const g = GAMES[id];
  return { id, kind: 'classic', title: g.title, blurb: g.concept, scoring: CLASSIC_SCORING[id], tieBreak: null };
}

/** The opponent's name in its game ("The Mind Reader", "The Adaptive Tactician"). */
export function opponentLabel(game: CompetitionGameId, bot: string): string {
  if (isArenaId(game)) return opponentName(game, bot);
  return personality(game, bot)?.name ?? bot;
}

/** The difficulty in its game's words ("Hard", "Normal"). */
export function levelLabel(game: CompetitionGameId, difficulty: string): string {
  if (isArenaId(game) && isLevel(difficulty)) return LEVEL_LABEL[difficulty];
  if (isDifficulty(difficulty)) return DIFFICULTY_LABEL[difficulty];
  return difficulty;
}

/** "vs The Adaptive Tactician · Hard · Quick" — the fixed configuration everyone plays. */
export function configSummary(game: CompetitionGameId, bot: string, difficulty: string, config?: Record<string, unknown> | null): string {
  const parts = [`vs ${opponentLabel(game, bot)}`, levelLabel(game, difficulty)];
  if (isArenaId(game) && config) {
    const length = config.length as keyof typeof LENGTH_LABEL | undefined;
    if (length && length !== 'standard') parts.push(LENGTH_LABEL[length]);
    const variant = ARENA[game].variants.find((v) => v.id === config.variant);
    if (variant && variant.id !== ARENA[game].variants[0]?.id) parts.push(variant.name);
  }
  return parts.join(' · ');
}
