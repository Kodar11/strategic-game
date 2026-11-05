import type { ArenaGameId, MatchResult, Outcome } from '../arena/core.ts';
import type { CommonsState } from '../arena/commons.ts';
import type { DiceState } from '../arena/liars-dice.ts';
import { type MoleState, playerPosterior } from '../arena/mole.ts';
import type { GambitState } from '../arena/gambit.ts';
import type { PowerState } from '../arena/power-play.ts';

/**
 * Game of the Week scoring, version 2 — one documented definition per game (docs/GAME_OF_THE_WEEK.md).
 *
 * A weekly leaderboard only compares players of the *same* game, opponent, difficulty and rules, so each game keeps
 * its own meaningful measure; nothing is rescaled to look comparable across games.
 *
 * Ranking (in SQL, game_engine.rank_standings): `score` descending, then `secondary` descending where the game defines
 * one (null otherwise, and never a tie-break then), then the earliest time that best was achieved. Players still tied
 * after all of that share the rank — and share the championship.
 *
 * The five classic games (rps, two-thirds, split-steal, ultimatum, stag-hunt) are scored in SQL: score = the match
 * points as each game defines them (unchanged from version 1), no secondary.
 */
export const SCORING_VERSION = 2;

export interface CompetitionScore {
  /** The official competition score. */
  score: number;
  /** The documented tie-break, or null when the game has no meaningful one. */
  secondary: number | null;
  outcome: Outcome;
  /** How the score reads on a leaderboard ("34 profit", "Win · 7 coins"). */
  label: string;
}

const OUTCOME_POINTS: Record<Outcome, number> = { win: 2, draw: 1, loss: 0 };
const OUTCOME_WORD: Record<Outcome, string> = { win: 'Win', draw: 'Draw', loss: 'Loss' };

/** What each Arena game's score and tie-break mean — shown in the app and the docs. */
export const SCORING_RULES: Record<ArenaGameId, { score: string; secondary: string | null }> = {
  cooperation: { score: 'Points over the match.', secondary: null },
  'ultimatum-game': { score: 'Tokens kept over the match.', secondary: null },
  auction: { score: 'Profit: value of the lots you won minus what you paid.', secondary: null },
  market: { score: 'Profit over the season.', secondary: null },
  signal: { score: 'Tokens over the match.', secondary: null },
  mole: { score: 'Case points (10 for unmasking the Mole).', secondary: 'Evidence: how likely your accused suspect was the Mole on the evidence you gathered (%).' },
  commons: { score: 'Fish landed, plus the dividend — 0 if the lake collapsed (everyone loses the fishery).', secondary: 'Fish left in the lake at the end.' },
  coalition: { score: 'Points from bills that passed.', secondary: null },
  inspector: { score: 'Points over the audit season.', secondary: null },
  travelers: { score: 'Credits paid out over the match.', secondary: null },
  saboteur: { score: 'Points: successful missions plus a correct accusation.', secondary: null },
  bluff: { score: 'Points over the match.', secondary: null },
  defusal: { score: 'Mission points: 10 + fuse left when defused, 0 otherwise.', secondary: null },
  'power-play': { score: 'Result: win 2, draw 1, loss 0 (influence first, then coins, as the game decides).', secondary: 'Coins at the end.' },
  'last-stand': { score: 'Team points: 2 per standing district + water left + 5 if the line held.', secondary: null },
  'liars-dice': { score: 'Dice left in your cup at the end (0 if you lost them all).', secondary: 'How few dice the opponent kept (minus its dice left).' },
  codebreaker: { score: 'Team points over the match.', secondary: null },
  gambit: { score: 'Result: win 2, draw 1, loss 0 (as the game decides: pieces home, then pieces, then progress).', secondary: 'Pieces home minus the opponent’s.' },
};

/** The official score of a finished Arena match. `state` is the full (unredacted) final state. */
export function arenaCompetitionScore(game: ArenaGameId, state: unknown, result: MatchResult): CompetitionScore {
  const outcome = result.outcome;
  const plain = (unit = result.unit): CompetitionScore => ({ score: result.player, secondary: null, outcome, label: `${result.player} ${unit}` });
  switch (game) {
    case 'mole': {
      const s = state as MoleState;
      const post = s.accused === null ? 0 : playerPosterior(s)[s.accused];
      return { score: result.player, secondary: Math.round(post * 100), outcome, label: `${result.player} case points` };
    }
    case 'commons': {
      const s = state as CommonsState;
      const score = s.lake > 0 ? result.player : 0;
      return { score, secondary: Math.max(0, Math.round(s.lake)), outcome, label: s.lake > 0 ? `${score} fish` : 'Lake collapsed' };
    }
    case 'power-play': {
      const s = state as PowerState;
      return { score: OUTCOME_POINTS[outcome], secondary: s.player.coins, outcome, label: `${OUTCOME_WORD[outcome]} · ${s.player.coins} coins` };
    }
    case 'gambit': {
      const s = state as GambitState;
      const margin = s.home.player - s.home.bot;
      return { score: OUTCOME_POINTS[outcome], secondary: margin, outcome, label: `${OUTCOME_WORD[outcome]} · ${s.home.player}–${s.home.bot} home` };
    }
    case 'liars-dice': {
      const s = state as DiceState;
      return { score: s.count.player, secondary: s.count.bot ? -s.count.bot : 0, outcome, label: `${s.count.player} ${s.count.player === 1 ? 'die' : 'dice'} left` };
    }
    default:
      return plain();
  }
}
