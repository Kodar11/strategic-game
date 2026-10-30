import type { GameId } from '../games/core.ts';
import { RPS_MOVES, type RpsMove, type RpsRound, beats } from '../games/rps.ts';
import type { SplitMove, SplitRound } from '../games/split-steal.ts';
import type { StagMove, StagRound } from '../games/stag-hunt.ts';
import { TT_MAX, TT_MIN, type TwoThirdsRound } from '../games/two-thirds.ts';
import type { RepeatGame, RepeatStrategy } from './plan.ts';

/**
 * Repeat strategies for the classic games (src/games/). Each strategy reads only the revealed rounds — the same
 * history the player sees — and returns a move the engine's `parseMove` accepts. The engine, not this file, decides
 * the bot's move and the payoffs.
 *
 * The Ultimatum is deliberately absent (manual only): it alternates roles every round, and each response is a reaction
 * to an offer revealed only in that round. See docs/REPEAT_PLAY.md for the full audit.
 */

const fixed = <C, M>(id: string, label: string, detail: string, move: M): RepeatStrategy<C, M> => ({
  id,
  kind: 'fixed',
  label: () => label,
  detail: () => detail,
  next: () => move,
});

const RPS_LABEL: Record<RpsMove, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

const rps: RepeatGame<readonly RpsRound[], RpsMove> = {
  strategies: [
    ...RPS_MOVES.map((m) => fixed<readonly RpsRound[], RpsMove>(`always-${m}`, `Always ${RPS_LABEL[m]}`, `Throw ${RPS_LABEL[m].toLowerCase()} every round.`, m)),
    {
      id: 'cycle',
      kind: 'pattern',
      label: () => 'Rock → Paper → Scissors',
      detail: () => 'Cycle the three throws in order, starting with rock.',
      next: (_h, step) => RPS_MOVES[step % RPS_MOVES.length],
    },
    {
      id: 'beat-last',
      kind: 'conditional',
      label: () => 'Beat its last throw',
      detail: () => 'Throw what beats the bot’s previous throw (rock if it hasn’t thrown yet).',
      next: (h) => (h.length ? beats(h[h.length - 1].b) : 'rock'),
    },
  ],
};

const splitSteal: RepeatGame<readonly SplitRound[], SplitMove> = {
  strategies: [
    fixed('always-split', 'Always Split', 'Split every round.', 'split'),
    fixed('always-steal', 'Always Steal', 'Steal every round.', 'steal'),
    {
      id: 'copy',
      kind: 'conditional',
      label: () => 'Copy its last choice',
      detail: () => 'Split first, then do whatever the bot did last round (tit for tat).',
      next: (h) => (h.length ? h[h.length - 1].b : 'split'),
    },
  ],
};

const stagHunt: RepeatGame<readonly StagRound[], StagMove> = {
  strategies: [
    fixed('always-stag', 'Always Hunt Stag', 'Hunt stag every round.', 'stag'),
    fixed('always-hare', 'Always Hunt Hare', 'Take the safe hare every round.', 'hare'),
    {
      id: 'copy',
      kind: 'conditional',
      label: () => 'Copy your partner',
      detail: () => 'Hunt stag first, then hunt whatever your partner hunted last round.',
      next: (h) => (h.length ? h[h.length - 1].b : 'stag'),
    },
  ],
};

const twoThirds: RepeatGame<readonly TwoThirdsRound[], number> = {
  strategies: [
    {
      id: 'same-pick',
      kind: 'fixed',
      amount: { label: 'Your pick', min: TT_MIN, max: TT_MAX, initial: 33 },
      label: (n) => `Always pick ${n}`,
      detail: (n) => `Lock in ${n} every round, whatever the crowd did.`,
      next: (_h, _step, n) => n,
    },
  ],
};

/** Classic games that offer repeat play. A game missing here plays exactly as before. */
export const CLASSIC_REPEAT: Partial<Record<GameId, RepeatGame<readonly unknown[], unknown>>> = {
  rps,
  'split-steal': splitSteal,
  'stag-hunt': stagHunt,
  'two-thirds': twoThirds,
};
