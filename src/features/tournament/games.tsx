import { router } from 'expo-router';

import { ARENA } from '@/src/arena/catalog';
import type { ArenaGameId } from '@/src/arena/core';
import { ArenaArt } from '@/src/features/arena/ui/parts';
import { GameArt } from '@/src/features/games/ui/GameArt';
import { GAMES } from '@/src/games/catalog';
import type { GameId } from '@/src/games/core';
import type { Level } from '@/src/tournament/progress';
import { type Stage, type TournamentMatch, resolveMatch } from '@/src/tournament/schema';

/** The game a tournament match plays, as the existing catalogs name it. */
export function gameTitle(m: TournamentMatch): string {
  return m.game.system === 'arena' ? (ARENA[m.game.id as ArenaGameId]?.title ?? m.game.id) : (GAMES[m.game.id as GameId]?.title ?? m.game.id);
}

export function GameIcon({ match, size = 44 }: { match: TournamentMatch; size?: number }) {
  return match.game.system === 'arena' ? <ArenaArt game={match.game.id as ArenaGameId} size={size} /> : <GameArt game={match.game.id as GameId} size={size} />;
}

export const LEVEL_NAME: Record<Level, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

/**
 * Opens the match on the existing play screens, always against a hidden opponent (reading it is a star), with the
 * tournament match id so the result is recorded and the screen shows the reveal or the debrief.
 */
export function playMatch(stage: Stage, m: TournamentMatch, level: Level = m.level, opts: { replace?: boolean } = {}) {
  // `replace`: the first match from the welcome, which shouldn't stay underneath the match.
  const go = (href: Parameters<typeof router.push>[0]) => (opts.replace ? router.replace(href) : router.push(href));
  const r = resolveMatch(stage, m);
  if (m.game.system === 'arena') {
    go({ pathname: '/arena/play', params: { game: m.game.id, persona: 'mystery', level, length: r.length, variant: r.variant, t: m.id } });
  } else {
    go({ pathname: '/games/play', params: { game: m.game.id, opponent: 'mystery', difficulty: level === 'normal' ? 'medium' : level, t: m.id } });
  }
}

/** The game's first challenge variant, used by the Hard Replay (arena games only). */
function challengeOf(m: TournamentMatch) {
  return m.game.system === 'arena' ? ARENA[m.game.id as ArenaGameId]?.variants.find((v) => v.challenge) : undefined;
}

/** The Hard Replay's rules for a match, in words: "Hard", or "Hard · Fog". */
export const replayRules = (m: TournamentMatch) => {
  const v = challengeOf(m);
  return v ? `Hard · ${v.name}` : 'Hard';
};

/** Opens a match in the Hard Replay (`r=1`): Hard, with the challenge variant where the game has one. */
export function playReplay(stage: Stage, m: TournamentMatch) {
  const r = resolveMatch(stage, m);
  if (m.game.system === 'arena') {
    router.push({ pathname: '/arena/play', params: { game: m.game.id, persona: 'mystery', level: 'hard', length: r.length, variant: challengeOf(m)?.id ?? r.variant, t: m.id, r: '1' } });
  } else {
    router.push({ pathname: '/games/play', params: { game: m.game.id, opponent: 'mystery', difficulty: 'hard', t: m.id, r: '1' } });
  }
}

/**
 * Opens a Gauntlet bout (`g=<token>`, src/features/tournament/gauntlet-store.ts) at the bout's level. Not a bracket
 * match: nothing is recorded against the season's match records, only the run.
 */
export function playBout(stage: Stage, m: TournamentMatch, level: Level, token: string) {
  const r = resolveMatch(stage, m);
  if (m.game.system === 'arena') {
    router.push({ pathname: '/arena/play', params: { game: m.game.id, persona: 'mystery', level, length: 'short', variant: r.variant, g: token } });
  } else {
    router.push({ pathname: '/games/play', params: { game: m.game.id, opponent: 'mystery', difficulty: level === 'normal' ? 'medium' : level, g: token } });
  }
}
