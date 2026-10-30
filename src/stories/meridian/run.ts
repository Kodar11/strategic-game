import { type Design, type Move, type StarterId, STARTERS, type Tournament, placeOf, type StrategyId } from './engine.ts';

/**
 * Story Two's saved state: where the player is and what they chose or predicted. Every result shown is recomputed
 * from these by the engine (deterministically), so nothing derived is ever saved.
 */

export const STEPS = ['enter', 'pick', 'single', 'repeat', 'echo', 'tournament', 'rooms', 'population', 'design', 'final'] as const;
export type StepId = (typeof STEPS)[number];

export const STEP_TITLE: Record<StepId, string> = {
  enter: 'The Meridian Trials',
  pick: 'Choose your entrant',
  single: 'One encounter',
  repeat: 'The same opponent, again',
  echo: 'The echo',
  tournament: 'The Open Trials',
  rooms: 'Change the room',
  population: 'The room changes back',
  design: 'Your final entrant',
  final: 'The last trial',
};

export type Band = 'top' | 'middle' | 'bottom';
export const BANDS: readonly Band[] = ['top', 'middle', 'bottom'];
export const BAND_LABEL: Record<Band, string> = { top: 'Top third', middle: 'Middle', bottom: 'Bottom third' };

export type Why = 'clever' | 'tough' | 'kind';
export const WHYS: readonly Why[] = ['clever', 'tough', 'kind'];

/** Rounds the player plays against the Mirror in the repeated-encounter scene. */
export const REPEAT_ROUNDS = 6;

export interface MeridianRun {
  step: number;
  pick?: StarterId;
  predict?: Band;
  why?: Why;
  /** The one-shot encounter. */
  single?: Move;
  /** Repeated encounter: the player's moves and their guess of the Mirror's next move before each reveal. */
  moves: Move[];
  guesses: Move[];
  design?: Design;
  finalPredict?: Band;
}

export const NEW_RUN: MeridianRun = { step: 0, moves: [], guesses: [] };

/** Which third of the leaderboard a rank falls in (shared ranks count from the top). */
export function bandOf(rank: number, of: number): Band {
  const f = (rank - 1) / of;
  return f < 1 / 3 ? 'top' : f < 2 / 3 ? 'middle' : 'bottom';
}

export function bandIn(t: Tournament, id: StrategyId): Band {
  const p = placeOf(t, id);
  return bandOf(p.rank, p.of);
}

/** The Mirror's move in round k of the repeated scene: cooperate first, then the player's previous move. */
export function mirrorReply(moves: readonly Move[], k: number): Move {
  return k === 0 ? 'C' : moves[k - 1];
}

const isMove = (x: unknown): x is Move => x === 'C' || x === 'D';
const oneOf = <T extends string>(xs: readonly T[], x: unknown): T | undefined => (xs.includes(x as T) ? (x as T) : undefined);

export function sanitizeDesign(x: unknown): Design | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const d = x as Record<string, unknown>;
  const response = oneOf(['always-c', 'copy', 'two', 'grudge', 'always-d'] as const, d.response);
  const forgive = typeof d.forgive === 'number' && [0, 0.1, 0.3].includes(d.forgive) ? d.forgive : undefined;
  if (!isMove(d.opening) || !response || forgive === undefined) return undefined;
  return { opening: d.opening, response, forgive };
}

/** Validate a saved run; a step that needs a missing choice falls back to the step that asks for it. */
export function sanitizeRun(raw: unknown): MeridianRun {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const moves = Array.isArray(o.moves) ? o.moves.filter(isMove).slice(0, REPEAT_ROUNDS) : [];
  const guesses = Array.isArray(o.guesses) ? o.guesses.filter(isMove).slice(0, moves.length + 1) : [];
  const run: MeridianRun = {
    step: typeof o.step === 'number' && Number.isInteger(o.step) ? Math.max(0, Math.min(STEPS.length - 1, o.step)) : 0,
    pick: oneOf(STARTERS, o.pick),
    predict: oneOf(BANDS, o.predict),
    why: oneOf(WHYS, o.why),
    single: isMove(o.single) ? o.single : undefined,
    moves,
    guesses,
    design: sanitizeDesign(o.design),
    finalPredict: oneOf(BANDS, o.finalPredict),
  };
  const need: [StepId, boolean][] = [
    ['pick', !!run.pick && !!run.predict && !!run.why],
    ['single', !!run.single],
    ['repeat', run.moves.length === REPEAT_ROUNDS],
    ['design', !!run.design && !!run.finalPredict],
  ];
  for (const [step, ok] of need) {
    const i = STEPS.indexOf(step);
    if (run.step > i && !ok) run.step = i;
  }
  return run;
}
