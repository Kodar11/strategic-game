import type { GameId, MatchSpec, Outcome } from './core.ts';
import { engineFor } from './registry.ts';

/**
 * "What if you'd played it differently?" — after a practice match of Split or Steal or Stag Hunt, the same opponent,
 * difficulty and seed replayed against a few simple, named patterns. Bots decide from the revealed history and
 * counter-based draws only, so the replay is exactly what that opponent would have done against each pattern — not a
 * guess. Only practice matches have the seed on the device; server matches never do, so they get no comparison.
 *
 * The comparison is descriptive: it shows what each pattern would have scored, never which move was "right".
 */

export type WhatIfGame = 'split-steal' | 'stag-hunt';
export const WHAT_IF_GAMES: readonly WhatIfGame[] = ['split-steal', 'stag-hunt'];
export const hasWhatIf = (g: GameId): g is WhatIfGame => (WHAT_IF_GAMES as readonly GameId[]).includes(g);

type Round = { p: string; b: string; ps: number; bs: number };
interface Pattern {
  id: string;
  label: string;
  move: (history: readonly Round[]) => string;
}

const always = (id: string, label: string, m: string): Pattern => ({ id, label, move: () => m });
const mirror = (id: string, label: string, first: string): Pattern => ({ id, label, move: (h) => (h.length ? h[h.length - 1].b : first) });

export const WHAT_IF_PATTERNS: Record<WhatIfGame, Pattern[]> = {
  'split-steal': [always('split', 'Always split', 'split'), mirror('mirror', 'Mirror them (split first, then copy their last move)', 'split'), always('steal', 'Always steal', 'steal')],
  'stag-hunt': [always('stag', 'Always hunt stag', 'stag'), mirror('mirror', 'Mirror them (stag first, then copy their last move)', 'stag'), always('hare', 'Always take the hare', 'hare')],
};

export interface WhatIfLine {
  id: string;
  label: string;
  player: number;
  bot: number;
  outcome: Outcome;
}

/** Replays a full match of `game` against `spec` with a pattern. Pure and deterministic. */
export function replayPattern(game: WhatIfGame, spec: MatchSpec, pattern: Pattern): { rounds: Round[]; player: number; bot: number; outcome: Outcome } {
  const engine = engineFor(game);
  const rounds: Round[] = [];
  while (rounds.length < engine.rounds) {
    const move = engine.parseMove(pattern.move(rounds), engine.prompt(spec, rounds));
    rounds.push(engine.resolve(spec, rounds, move) as Round);
  }
  const t = engine.totals(rounds);
  return { rounds, player: t.player, bot: t.bot, outcome: engine.outcome(rounds) };
}

/**
 * The patterns the player didn't already play move for move, each replayed against the same opponent and seed. Null
 * when there's nothing to compare (another game, an unfinished match, or no seed).
 */
export function whatIf(game: GameId, spec: MatchSpec | null, actual: readonly Round[]): WhatIfLine[] | null {
  if (!hasWhatIf(game) || !spec || actual.length < engineFor(game).rounds) return null;
  const mine = actual.map((r) => r.p).join();
  return WHAT_IF_PATTERNS[game]
    .map((pattern) => ({ pattern, run: replayPattern(game, spec, pattern) }))
    .filter(({ run }) => run.rounds.map((r) => r.p).join() !== mine)
    .map(({ pattern, run }) => ({ id: pattern.id, label: pattern.label, player: run.player, bot: run.bot, outcome: run.outcome }));
}
