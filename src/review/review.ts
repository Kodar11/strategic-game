import type { AnyArenaEngine, ArenaGameId, Setup } from '../arena/core.ts';
import type { AnyEngine, GameId, MatchSpec } from '../games/core.ts';

/**
 * Game Review: a finished match replayed decision by decision, with one honest question asked at every step —
 * "if you had chosen differently here, and played the rest the same, how would the match have ended?"
 *
 * It works because every engine is deterministic for a seed and bots decide from the state before the player's move
 * (tested in arena.test.ts), so a different move at step k changes only what follows from it: a retaliation later, a
 * collapse, a cheaper lot. The rest of the player's moves are replayed as they were; a move that is no longer legal in
 * the new line is replaced by the first legal choice. The measure is the player's own final score, not the margin: in
 * a dilemma, beating the rival by wrecking both scores isn't better play.
 *
 * Only games whose decisions are a short list of choices are reviewed (REVIEWABLE). Deduction and board games (Mole,
 * Codebreaker, Gambit…) have no fair "other move" to try, so they keep their debrief only.
 */

export type StepMark = 'best' | 'fine' | 'costly' | 'key';

export interface ReviewStep {
  /** 1-based decision number, as shown. */
  n: number;
  /** What the player did, in words ("Cooperate", "Bid 40"). */
  played: string;
  /** Running scores after this decision. */
  you: number;
  rival: number;
  /** The best other choice here, when one would have ended the match better. */
  better: { label: string; final: number; gain: number } | null;
  mark: StepMark;
}

export interface MatchReview {
  steps: ReviewStep[];
  /** The decision where a different choice would have helped most (also marked 'key'), or null: you played it well. */
  key: ReviewStep | null;
  /** The player's final score as played. */
  final: number;
  unit: string;
}

/** A gain this small is noise, not a lesson: at least 1 point and 4% of the final score. */
const meaningful = (gain: number, final: number) => gain >= Math.max(1, Math.abs(final) * 0.04);

function finish(steps: Omit<ReviewStep, 'mark'>[], final: number, unit: string): MatchReview {
  let key: number | null = null;
  steps.forEach((s, i) => {
    if (s.better && meaningful(s.better.gain, final) && (key === null || s.better.gain > steps[key].better!.gain)) key = i;
  });
  const marked: ReviewStep[] = steps.map((s, i) => ({
    ...s,
    better: s.better && meaningful(s.better.gain, final) ? s.better : null,
    mark: i === key ? 'key' : !s.better || !meaningful(s.better.gain, final) ? 'best' : s.better.gain >= Math.max(3, Math.abs(final) * 0.1) ? 'costly' : 'fine',
  }));
  return { steps: marked, key: key === null ? null : marked[key], final, unit };
}

// ── Strategy Arena ───────────────────────────────────────────────────────────

interface ArenaReviewSpec {
  /** The choices to try at this state (validated by the engine before use). */
  choices(state: any): unknown[];
  label(action: unknown, state: any): string;
}

const words = (x: unknown) => (typeof x === 'string' ? x.charAt(0).toUpperCase() + x.slice(1) : String(x));
const ints = (lo: number, hi: number, step = 1) => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);

const ARENA_SPECS: Partial<Record<ArenaGameId, ArenaReviewSpec>> = {
  cooperation: {
    choices: (s) => [{ move: 'C', round: s.rounds.length }, { move: 'D', round: s.rounds.length }],
    label: (a) => ((a as { move: string }).move === 'C' ? 'Cooperate' : 'Defect'),
  },
  'ultimatum-game': {
    choices: () => [...ints(0, 20), 'accept', 'reject'],
    label: (a) => (typeof a === 'number' ? `Offer ${a}` : words(a)),
  },
  auction: {
    choices: (s) => Array.from(new Set(ints(0, 10).map((k) => Math.round((s.cash[0] * k) / 10)))),
    label: (a) => (a === 0 ? 'Pass (bid 0)' : `Bid ${a}`),
  },
  market: { choices: () => ints(4, 20), label: (a) => `Price ${a}` },
  signal: {
    choices: () => ['warn', 'pitch', 'stake', 'investigate', 'invest', 'pass'],
    label: (a) => ({ warn: 'Warn', pitch: 'Pitch', stake: 'Stake', investigate: 'Investigate', invest: 'Invest', pass: 'Pass' } as Record<string, string>)[a as string] ?? words(a),
  },
  commons: { choices: () => [0, 2, 3, 5, 8, 10], label: (a) => `Catch ${a}` },
  inspector: { choices: () => ['comply', 'cut', 'inspect', 'trust'], label: (a) => ({ comply: 'Comply', cut: 'Cut corners', inspect: 'Inspect', trust: 'Trust' } as Record<string, string>)[a as string] ?? words(a) },
  travelers: { choices: () => ints(2, 20), label: (a) => `Claim ${a}` },
};

export const isReviewableArena = (id: ArenaGameId) => id in ARENA_SPECS;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const MAX_STEPS = 400;

/** Plays `rest` from `state` (illegal moves replaced by the first legal choice) to the end; the player's final score. */
function rollArena(engine: AnyArenaEngine, spec: ArenaReviewSpec, state: any, rest: readonly unknown[]): number {
  let s = state;
  let i = 0;
  for (let guard = 0; !engine.isOver(s) && guard < MAX_STEPS; guard++) {
    const planned = i < rest.length ? rest[i++] : undefined;
    const move = planned !== undefined && engine.validate(s, planned) === null ? planned : spec.choices(s).find((c) => engine.validate(s, c) === null);
    if (move === undefined) break;
    s = engine.apply(s, move);
  }
  return engine.result(s).player;
}

/**
 * Reviews an Arena match from its setup and the player's actions in order. Null when the game isn't reviewable or the
 * actions don't replay to a finished match (an old save, a changed engine) — the review is then simply not offered.
 */
export function reviewArena(engine: AnyArenaEngine, setup: Setup<any, any>, actions: readonly unknown[]): MatchReview | null {
  const spec = ARENA_SPECS[engine.id];
  if (!spec || actions.length === 0) return null;
  try {
    const states: any[] = [engine.create(setup)];
    for (const a of actions) {
      const s = states[states.length - 1];
      if (engine.validate(s, a) !== null) return null;
      states.push(engine.apply(s, a));
    }
    const end = states[states.length - 1];
    if (!engine.isOver(end)) return null;
    const result = engine.result(end);
    const final = result.player;
    const steps = actions.map((a, i) => {
      const before = states[i];
      const after = engine.result(states[i + 1]);
      let better: ReviewStep['better'] = null;
      for (const alt of spec.choices(before)) {
        if (same(alt, a) || engine.validate(before, alt) !== null) continue;
        const f = rollArena(engine, spec, engine.apply(before, alt), actions.slice(i + 1));
        if (f > final && (!better || f > better.final)) better = { label: spec.label(alt, before), final: f, gain: f - final };
      }
      return { n: i + 1, played: spec.label(a, before), you: after.player, rival: after.rival, better };
    });
    return finish(steps, final, result.unit);
  } catch {
    return null;
  }
}

// ── Classic games ────────────────────────────────────────────────────────────

const CLASSIC_CHOICES: Record<GameId, (prompt: any) => unknown[]> = {
  rps: () => ['rock', 'paper', 'scissors'],
  'split-steal': () => ['split', 'steal'],
  'stag-hunt': () => ['stag', 'hare'],
  'two-thirds': () => [0, 5, 10, 15, 20, 25, 33, 40, 50, 67, 100],
  ultimatum: (p) => (p?.role === 'respond' ? ['accept', 'reject'] : ints(1, 9)),
};

const CLASSIC_LABEL: Record<GameId, (m: unknown) => string> = {
  rps: words,
  'split-steal': words,
  'stag-hunt': (m) => (m === 'stag' ? 'Hunt the stag' : 'Take the hare'),
  'two-thirds': (m) => `Guess ${m}`,
  ultimatum: (m) => (typeof m === 'number' ? `Offer ${m}` : words(m)),
};

/** The player's move in a recorded classic round. */
function classicMove(game: GameId, round: any): unknown {
  if (game === 'ultimatum') return round.proposer === 'player' ? round.offer : round.accepted ? 'accept' : 'reject';
  return round.p;
}

function rollClassic(engine: AnyEngine, game: GameId, spec: MatchSpec, history: any[], rest: readonly unknown[]): number {
  const h = [...history];
  let i = 0;
  while (h.length < engine.rounds) {
    const prompt = engine.prompt(spec, h);
    const planned = i < rest.length ? rest[i++] : undefined;
    const raw = planned !== undefined && engine.parseMove(planned, prompt) !== null ? planned : CLASSIC_CHOICES[game](prompt).find((c) => engine.parseMove(c, prompt) !== null);
    const move = engine.parseMove(raw, prompt);
    if (move === null) break;
    h.push(engine.resolve(spec, h, move));
  }
  return engine.totals(h).player;
}

/** Reviews a classic match played on the device (its seed is known). Null if the rounds don't replay. */
export function reviewClassic(engine: AnyEngine, game: GameId, spec: MatchSpec, rounds: readonly unknown[]): MatchReview | null {
  if (rounds.length === 0) return null;
  try {
    const moves = rounds.map((r) => classicMove(game, r));
    const history: any[] = [];
    const steps = moves.map((m, i) => {
      const prompt = engine.prompt(spec, history);
      const parsed = engine.parseMove(m, prompt);
      if (parsed === null) throw new Error('review: move does not replay');
      const before = [...history];
      history.push(engine.resolve(spec, history, parsed));
      return { m, i, prompt, before };
    });
    if (!same(history, rounds)) return null;
    const final = engine.totals(history).player;
    const out = steps.map(({ m, i, prompt, before }) => {
      let better: ReviewStep['better'] = null;
      for (const alt of CLASSIC_CHOICES[game](prompt)) {
        if (same(alt, m)) continue;
        const parsed = engine.parseMove(alt, prompt);
        if (parsed === null) continue;
        const f = rollClassic(engine, game, spec, [...before, engine.resolve(spec, before, parsed)], moves.slice(i + 1));
        if (f > final && (!better || f > better.final)) better = { label: CLASSIC_LABEL[game](alt), final: f, gain: f - final };
      }
      const t = engine.totals(history.slice(0, i + 1));
      return { n: i + 1, played: CLASSIC_LABEL[game](m), you: t.player, rival: t.bot, better };
    });
    return finish(out, final, 'points');
  } catch {
    return null;
  }
}
