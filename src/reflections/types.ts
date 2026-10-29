import type { LessonId } from '../content/lessons.ts';

/**
 * Post-game reflections: one short thought after a match, grounded in what actually happened, with an optional deeper
 * look. Pure TypeScript — no React, no storage — so every rule can be tested against real match records.
 *
 * A game's reflections are a list of rules plus a general fallback. A rule looks at the finished match and returns the
 * facts it needs (its evidence) or null when the event it talks about didn't happen; only then does it write copy, from
 * those facts alone. Nothing here changes the match: rules read records and return strings.
 *
 * Spoiler rules every rule follows (tested in __tests__/reflections.test.ts):
 * - Never name or describe the opponent's personality, policy or thresholds (e.g. the Ultimatum Game's `botMin`).
 * - Use only what the player saw during the match or what the result screen already reveals; for a claim nobody
 *   checked (an unchallenged Power Play claim, a believed Bluff), say nothing about whether it was true.
 * - Ask; don't prescribe. No best move, no formula, no "you should have".
 */

/** The copy of one reflection. */
export interface ReflectionCopy {
  /** The default card: one or two short sentences tied to the match. */
  thought: string;
  /** "Explore this idea": the strategic idea behind the moment. */
  idea: string;
  /** A reasonable alternative reading or trade-off. */
  perspective: string;
  /** One open question to try next time. */
  question: string;
}

export interface Reflection extends ReflectionCopy {
  /** `<game>.<rule>`, or `<game>.general` for the fallback. */
  id: string;
  /** A lesson that teaches this exact idea, when one does. The screen still checks it is published before linking. */
  lesson: LessonId | null;
  /** The facts from the match this reflection rests on (empty for the general fallback). Not shown; used by tests. */
  evidence: Record<string, string | number>;
  general: boolean;
}

export type Facts = Record<string, string | number>;

/**
 * One reflection opportunity.
 * - `tier` 1: a single striking moment (a rejection, a failed gamble). 2: a pattern across the match.
 *   The selector prefers the most specific tier that has an eligible rule.
 * - `when` returns the facts the copy needs, or null when the triggering event didn't happen.
 * - `write` builds the copy from those facts only.
 */
export interface Rule<M, F extends Facts = Facts> {
  id: string;
  tier: 1 | 2;
  when(m: M): F | null;
  write(f: F): ReflectionCopy;
  /** Overrides the game's lesson for this rule (null: no lesson for this rule). */
  lesson?: LessonId | null;
}

export interface GameReflections<M> {
  game: string;
  /** The lesson behind most of this game's reflections, or null when no lesson teaches it directly. */
  lesson: LessonId | null;
  rules: readonly Rule<M, any>[];
  /** Used when no rule's event happened: still about this game, never about this match. */
  general: ReflectionCopy;
}

/** Declares a rule with its fact type inferred from `when`. */
export const rule = <M, F extends Facts>(r: Rule<M, F>): Rule<M, F> => r;
