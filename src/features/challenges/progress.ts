import { z } from 'zod';

import {
  type PredictionAttempt,
  emptyPrediction,
  lockPrediction,
  predictionSchema,
} from '../../components/lesson/prediction-state.ts';
import type { Feedback } from '../../components/lesson/verdict.ts';
import type { LessonId } from '../../content/lessons.ts';
import { type LearningAttempt, mergeAttempts, recordChallengeAttempt } from '../learning/records.ts';
import { type Challenge, allChallenges, challengesFor, getChallenge } from './content.ts';

/**
 * Challenge progress, as pure functions over two pieces of persisted state:
 * - `drafts`: the *current* attempt at each challenge (a draft, or the locked answer whose feedback is showing).
 *   It lets a learner leave and come back without losing a half-made choice or re-submitting.
 * - the learning record: every submitted attempt, append-only (see records.ts). Opening, selecting or resuming
 *   never records anything; only `submitChallenge` does, once per submission.
 */

export type ChallengeDrafts = Partial<Record<string, PredictionAttempt<string>>>;

const draftSchema = predictionSchema(z.string().min(1).max(40));

/** Keep drafts for known challenges whose answer is still one of the options; drop anything else. */
export function sanitizeChallengeDrafts(saved: unknown): ChallengeDrafts {
  if (!saved || typeof saved !== 'object') return {};
  const out: ChallengeDrafts = {};
  for (const [id, raw] of Object.entries(saved as Record<string, unknown>)) {
    const challenge = getChallenge(id);
    const parsed = draftSchema.safeParse(raw);
    if (!challenge || !parsed.success) continue;
    if (parsed.data.answer !== null && !challenge.options.some((o) => o.id === parsed.data.answer)) continue;
    out[id] = parsed.data;
  }
  return out;
}

/** The attempt the screen shows: the saved draft, else a fresh one. */
export function currentAttempt(drafts: ChallengeDrafts, id: string): PredictionAttempt<string> {
  return drafts[id] ?? emptyPrediction();
}

export interface ChallengeState {
  challengeDrafts: ChallengeDrafts;
  learning: LearningAttempt[];
  completed: readonly LessonId[];
}

/**
 * Submit the current draft: lock it and record it, in one step, so the answer and its record can never drift
 * apart. Returns null (nothing to do) for an unknown challenge, an incomplete draft, or an already-locked one —
 * which is what makes double taps and resumed screens safe.
 */
export function submitChallenge(state: ChallengeState, id: string, now: number = Date.now()): Pick<ChallengeState, 'challengeDrafts' | 'learning'> | null {
  const challenge = getChallenge(id);
  const draft = state.challengeDrafts[id];
  if (!challenge || !draft || draft.locked) return null;
  const locked = lockPrediction(draft, now);
  if (!locked.locked) return null;
  const record = recordChallengeAttempt(challenge, locked, state.completed.includes(challenge.lesson));
  if (!record) return null;
  return {
    challengeDrafts: { ...state.challengeDrafts, [id]: locked },
    learning: mergeAttempts(state.learning, [record]),
  };
}

/** Start a new attempt after feedback. Earlier attempts stay in the learning record untouched. */
export function retryChallenge(drafts: ChallengeDrafts, id: string): ChallengeDrafts {
  return drafts[id]?.locked ? { ...drafts, [id]: emptyPrediction() } : drafts;
}

export function attemptsAt(learning: readonly LearningAttempt[], id: string): LearningAttempt[] {
  return learning.filter((a) => a.prediction === id).sort((a, b) => a.attempt - b.attempt);
}

/** A challenge counts as tried once it has at least one submitted attempt. Retries don't add to the count. */
export function isTried(learning: readonly LearningAttempt[], id: string): boolean {
  return learning.some((a) => a.prediction === id);
}

export function triedCount(learning: readonly LearningAttempt[], lesson?: LessonId): number {
  return allChallenges().filter((c) => (!lesson || c.lesson === lesson) && isTried(learning, c.id)).length;
}

/** Where to open a lesson's challenges: a draft in progress first, then the first untried, else the summary. */
export function resumeIndex(learning: readonly LearningAttempt[], drafts: ChallengeDrafts, lesson: LessonId): number | 'summary' {
  const list = challengesFor(lesson);
  const inProgress = list.findIndex((c) => {
    const d = drafts[c.id];
    return d && !d.locked && d.answer !== null;
  });
  if (inProgress >= 0) return inProgress;
  const untried = list.findIndex((c) => !isTried(learning, c.id) && !drafts[c.id]?.locked);
  return untried >= 0 ? untried : 'summary';
}

/** Feedback for an answer, straight from the challenge data. */
export function challengeFeedback(challenge: Challenge, answer: string): Feedback | null {
  const option = challenge.options.find((o) => o.id === answer);
  return option ? { verdict: option.verdict, text: option.feedback } : null;
}

/** The strongest option(s), or none for a challenge whose answer can't be known. */
export function strongestOptions(challenge: Challenge) {
  return challenge.options.filter((o) => o.verdict === 'match');
}

/**
 * A takeaway for the summary, from what was actually attempted: the lesson a first answer most needed, otherwise
 * the first challenge's. Null when nothing was attempted.
 */
export function summaryTakeaway(learning: readonly LearningAttempt[], lesson: LessonId): string | null {
  const list = challengesFor(lesson).filter((c) => isTried(learning, c.id));
  if (!list.length) return null;
  const needed = list.find((c) => {
    const first = attemptsAt(learning, c.id)[0];
    return first && (first.evaluation === 'misconception' || first.evaluation === 'partial');
  });
  return (needed ?? list[0]).takeaway;
}
