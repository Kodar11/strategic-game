import type { Verdict } from '../../components/lesson/verdict.ts';
import { catalog } from '../../content/catalog.ts';
import type { LessonId } from '../../content/lessons.ts';
import type { EvaluationBasis, SkillArea } from '../learning/types.ts';

/**
 * Paired-scenario challenges: three short transfer exercises per lesson. Pure content, loaded from the database —
 * the shared challenge screen renders them and `progress.ts` grades them, so no rule lives in UI code.
 *
 * Every verdict here must follow from the scenario text alone. Where the text can't settle the answer, the
 * challenge is `basis: 'uncertain'` and no option is marked `match`: sensible answers are `reasonable`.
 * Bump a challenge's `version` whenever its scenario or options change meaning, so old records stay interpretable.
 */

export interface ChallengeOption {
  id: string;
  label: string;
  /**
   * `match` the strongest reasoning; `defensible` reasonable but missing something; `depends` rests on an
   * assumption outside the scenario; `reasonable` a sensible call where no answer can be known;
   * `misconception` contradicts the information given.
   */
  verdict: Verdict;
  /** Two or three sentences: what the choice implies, and why. */
  feedback: string;
}

export interface Challenge {
  id: string;
  lesson: LessonId;
  order: 1 | 2 | 3;
  /** Content version; recorded with every attempt. */
  version: number;
  title: string;
  /** Two to four sentences with only what is needed to reason. */
  scenario: string;
  question: string;
  options: readonly ChallengeOption[];
  skill: SkillArea;
  /** The concept from the lesson that this applies, in a few words. */
  concept: string;
  /** What carries over to other situations; shown after any answer. */
  takeaway: string;
  /** 1 = closest to the lesson, 3 = furthest transfer. */
  level: 1 | 2 | 3;
  basis: EvaluationBasis;
}

export type ChallengeId = string;

/** Every practice challenge, in catalog order. */
export function allChallenges(): readonly Challenge[] {
  return catalog().challenges;
}

/** A one-paragraph refresher per lesson, shown after feedback without replaying the lesson. */
export function conceptReview(lesson: LessonId): { concept: string; summary: string } | undefined {
  return catalog().conceptReviews[lesson];
}

export function getChallenge(id: string): Challenge | undefined {
  return catalog().challengeById.get(id);
}

export function challengesFor(lesson: LessonId): Challenge[] {
  return allChallenges().filter((c) => c.lesson === lesson).sort((a, b) => a.order - b.order);
}
