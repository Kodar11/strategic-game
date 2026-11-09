import { ARENA_IDS, type ArenaGameId, LENGTHS, LEVELS, type Debrief, type MatchResult, type MatchLength, type Level, type Setup, isArenaId } from '../arena/core.ts';
import { ARENA_ENGINES } from '../arena/registry.ts';
import { redact } from './arena-views.ts';
import { type CompetitionScore, arenaCompetitionScore } from './scoring.ts';

/**
 * Server-authoritative Arena matches for Game of the Week — the same engines the device runs in practice
 * (src/arena), executed on the server (supabase/functions/arena-match). Shared by the Edge Function, its tests and the
 * app's types, so the rules can never differ between practice and competition.
 *
 * A match is stored as its configuration, its private seed and the list of the player's actions. The state is
 * rebuilt by replaying those actions through the engine (`create`, then `apply` each), which is deterministic, so the
 * stored log *is* the match: nothing the device sends but the next action is ever trusted, and the device never
 * receives the seed or any hidden information until the match is over (src/competition/arena-views.ts).
 */

/** 2 (2026-11-09): difficulty fixes in the Ultimatum Game, Coalition, Saboteur and Mole (docs/DECISIONS.md). */
export const ARENA_RULES_VERSION = 2;
/** At most this many actions in one match (the longest Arena match needs well under 100). */
export const MAX_ACTIONS = 200;
/** An action is a small JSON value; anything bigger is refused before it reaches an engine. */
export const MAX_ACTION_BYTES = 2048;

/** The fixed competition configuration (the same for every player in a week). */
export interface ArenaConfig {
  opponent: string;
  level: Level;
  variant: string;
  length: MatchLength;
}

export type ArenaRuleCode = 'invalid_config' | 'invalid_action' | 'illegal_action' | 'corrupt_log' | 'finished';

export class ArenaRuleError extends Error {
  readonly code: ArenaRuleCode;
  constructor(code: ArenaRuleCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Why a configuration can't be used for `game`, or null. Mirrors game_engine.arena_config_problem in SQL. */
export function configProblem(game: string, cfg: unknown): string | null {
  if (!isArenaId(game)) return `${game} is not an Arena game`;
  const e = ARENA_ENGINES[game];
  const c = cfg as Partial<ArenaConfig> | null;
  if (!c || typeof c !== 'object') return 'config must be an object';
  if (!e.opponents.includes(c.opponent as string)) return `opponent must be one of ${e.opponents.join(', ')}`;
  if (!(LEVELS as readonly string[]).includes(c.level as string)) return `level must be one of ${LEVELS.join(', ')}`;
  if (!(e.variants as readonly string[]).includes(c.variant as string)) return `variant must be one of ${e.variants.join(', ')}`;
  if (!(LENGTHS as readonly string[]).includes(c.length as string)) return `length must be one of ${LENGTHS.join(', ')}`;
  return null;
}

export function setupOf(cfg: ArenaConfig, seed: number): Setup<string, string> {
  return { persona: cfg.opponent, level: cfg.level, variant: cfg.variant, length: cfg.length, seed: seed >>> 0 };
}

/** A JSON-only copy of an action, or an error: no functions, no prototypes, bounded size. */
export function cleanAction(a: unknown): unknown {
  if (a === undefined) throw new ArenaRuleError('invalid_action', 'An action is required.');
  let text: string;
  try {
    text = JSON.stringify(a);
  } catch {
    throw new ArenaRuleError('invalid_action', 'The action is not valid JSON.');
  }
  if (text === undefined || text.length > MAX_ACTION_BYTES) throw new ArenaRuleError('invalid_action', 'The action is too large.');
  return JSON.parse(text);
}

/** The state after replaying `actions`. A stored log that no longer replays is reported, never silently skipped. */
export function replay(game: ArenaGameId, cfg: ArenaConfig, seed: number, actions: readonly unknown[]) {
  const e = ARENA_ENGINES[game];
  let s = e.create(setupOf(cfg, seed));
  actions.forEach((a, i) => {
    const why = e.validate(s, a);
    if (why) throw new ArenaRuleError('corrupt_log', `Stored action ${i + 1} is no longer legal: ${why}`);
    s = e.apply(s, a);
  });
  return s;
}

/** Apply one new action to the match. Throws ArenaRuleError when it is illegal now. */
export function playAction(game: ArenaGameId, cfg: ArenaConfig, seed: number, actions: readonly unknown[], action: unknown) {
  const e = ARENA_ENGINES[game];
  const before = replay(game, cfg, seed, actions);
  if (e.isOver(before)) throw new ArenaRuleError('finished', 'The match is over.');
  if (actions.length >= MAX_ACTIONS) throw new ArenaRuleError('illegal_action', 'Too many actions in one match.');
  const a = cleanAction(action);
  const why = e.validate(before, a);
  if (why) throw new ArenaRuleError('illegal_action', why);
  const state = e.apply(before, a);
  return { state, action: a, over: e.isOver(state) };
}

export interface ArenaFinal {
  result: MatchResult;
  debrief: Debrief;
  score: CompetitionScore;
  rounds: number;
}

export function finalOf(game: ArenaGameId, state: unknown): ArenaFinal {
  const e = ARENA_ENGINES[game];
  const result = e.result(state);
  return { result, debrief: e.debrief(state), score: arenaCompetitionScore(game, state, result), rounds: e.played(state) };
}

/** What the device receives: a redacted state while in play; the full state, result and debrief once it's over. */
export interface ArenaView {
  game: ArenaGameId;
  config: ArenaConfig;
  /** How many actions have been applied — the `step` the next action must carry. */
  step: number;
  over: boolean;
  /** Rounds played and in the match (an early-ending game may stop before `total`). */
  played: number;
  total: number;
  state: unknown;
  final: ArenaFinal | null;
}

export function viewOf(game: ArenaGameId, cfg: ArenaConfig, state: { setup: { seed: number } }, step: number): ArenaView {
  const e = ARENA_ENGINES[game];
  const over = e.isOver(state);
  return {
    game,
    config: cfg,
    step,
    over,
    played: e.played(state),
    total: e.rounds(cfg.length),
    state: over ? state : redact(game, state as never),
    final: over ? finalOf(game, state) : null,
  };
}

export { ARENA_IDS };
