/**
 * Rival mastery: three stars per opponent in each game, each unlocking one page of that rival's dossier
 * (src/mastery/dossiers.ts).
 *
 * - `beat`: win a match against it, at any level (a team game: succeed with it).
 * - `hard`: win against it on Hard.
 * - `read`: name it correctly in a mystery match.
 *
 * Practice, Tournament and Gauntlet matches on the device all count; server-run matches (Game of the Week, friend
 * challenges) don't, since their opponent is fixed for everyone. Stars are never taken back. Pure — no storage, no React.
 */

export const STAR_KINDS = ['beat', 'hard', 'read'] as const;
export type StarKind = (typeof STAR_KINDS)[number];

export type MasterySystem = 'arena' | 'classic';
export type RivalStars = Partial<Record<StarKind, true>>;
/** "system:game" → opponent id → stars. */
export type MasteryMap = Record<string, Record<string, RivalStars>>;

export const gameKey = (system: MasterySystem, game: string) => `${system}:${game}`;

export const STAR_LABEL: Record<StarKind, string> = {
  beat: 'Beat it',
  hard: 'Beat it on Hard',
  read: 'Name it in a mystery match',
};

export interface MatchFacts {
  system: MasterySystem;
  game: string;
  opponent: string;
  /** Hard is `'hard'` in both systems. */
  level: string;
  /** Null when only the read is being scored. */
  outcome: 'win' | 'draw' | 'loss' | null;
  /** A mystery match's prediction was right. */
  readCorrect?: boolean;
}

/** The stars these facts earn, before checking what is already held. */
export function starsEarned(f: MatchFacts): StarKind[] {
  const out: StarKind[] = [];
  if (f.outcome === 'win') {
    out.push('beat');
    if (f.level === 'hard') out.push('hard');
  }
  if (f.readCorrect) out.push('read');
  return out;
}

/** Adds what a match earned; returns the new map (or the same one when nothing changed) and the stars that are new. */
export function award(map: MasteryMap, f: MatchFacts): { map: MasteryMap; fresh: StarKind[] } {
  const key = gameKey(f.system, f.game);
  const held = map[key]?.[f.opponent] ?? {};
  const fresh = starsEarned(f).filter((k) => !held[k]);
  if (!fresh.length) return { map, fresh };
  const next: RivalStars = { ...held };
  for (const k of fresh) next[k] = true;
  return { map: { ...map, [key]: { ...map[key], [f.opponent]: next } }, fresh };
}

export const starCount = (s: RivalStars | undefined) => STAR_KINDS.filter((k) => s?.[k]).length;

/** Stars held in one game, out of three per opponent. */
export function gameStars(map: MasteryMap, system: MasterySystem, game: string, opponents: readonly string[]): { held: number; total: number } {
  const g = map[gameKey(system, game)] ?? {};
  return { held: opponents.reduce((t, o) => t + starCount(g[o]), 0), total: opponents.length * STAR_KINDS.length };
}

/** A stored map, validated: unknown kinds and malformed entries are dropped. */
export function parseMastery(x: unknown): MasteryMap {
  if (!x || typeof x !== 'object') return {};
  const out: MasteryMap = {};
  for (const [key, rivals] of Object.entries(x as Record<string, unknown>)) {
    if (!/^(arena|classic):[a-z0-9-]+$/.test(key) || !rivals || typeof rivals !== 'object') continue;
    const g: Record<string, RivalStars> = {};
    for (const [opp, stars] of Object.entries(rivals as Record<string, unknown>)) {
      if (!/^[a-z0-9-]+$/.test(opp) || !stars || typeof stars !== 'object') continue;
      const s: RivalStars = {};
      for (const k of STAR_KINDS) if ((stars as Record<string, unknown>)[k] === true) s[k] = true;
      if (starCount(s)) g[opp] = s;
    }
    if (Object.keys(g).length) out[key] = g;
  }
  return out;
}
