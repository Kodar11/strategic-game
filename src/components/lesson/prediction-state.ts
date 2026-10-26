import { z } from 'zod';

/**
 * One prediction attempt: the learner's answer and how sure they were, captured before anything is revealed.
 *
 * Lifecycle: unanswered → draft (answer and confidence can still change) → locked → evaluated (lesson-specific:
 * the outcome or experiment that settles it has been shown). Pure, so lessons and tests share the same rules.
 * Each lesson keeps its own attempts in its own state, so a future learning record can pair
 * prediction, confidence, scenario and outcome per attempt.
 */

export type Confidence = 1 | 2 | 3 | 4 | 5;

export const CONFIDENCE_LEVELS: readonly { value: Confidence; label: string }[] = [
  { value: 1, label: 'Just guessing' },
  { value: 2, label: 'Slightly confident' },
  { value: 3, label: 'Somewhat confident' },
  { value: 4, label: 'Very confident' },
  { value: 5, label: 'Extremely confident' },
];

export function confidenceLabel(c: Confidence): string {
  return CONFIDENCE_LEVELS.find((l) => l.value === c)?.label ?? String(c);
}

export const confidenceSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

export interface PredictionAttempt<T extends string> {
  answer: T | null;
  /** Optional only while the attempt is a draft. Never defaulted: null means "not rated yet". */
  confidence: Confidence | null;
  locked: boolean;
}

export type PredictionStatus = 'unanswered' | 'draft' | 'locked' | 'evaluated';

export function emptyPrediction<T extends string>(): PredictionAttempt<T> {
  return { answer: null, confidence: null, locked: false };
}

/** Runtime validation for a saved attempt. A locked attempt must carry both an answer and a confidence. */
export function predictionSchema<T extends string>(answer: z.ZodType<T>) {
  return z
    .object({ answer: answer.nullable(), confidence: confidenceSchema.nullable(), locked: z.boolean() })
    .refine((a) => !a.locked || (a.answer !== null && a.confidence !== null), 'A locked prediction needs an answer and a confidence');
}

export function predictionStatus(a: PredictionAttempt<string>, evaluated = false): PredictionStatus {
  if (a.locked) return evaluated ? 'evaluated' : 'locked';
  return a.answer === null ? 'unanswered' : 'draft';
}

/** Change the answer of a draft. Locked attempts are never edited silently. */
export function chooseAnswer<T extends string>(a: PredictionAttempt<T>, answer: T): PredictionAttempt<T> {
  return a.locked ? a : { ...a, answer };
}

/** Change the confidence of a draft. Locked attempts keep the confidence they were submitted with. */
export function rateConfidence<T extends string>(a: PredictionAttempt<T>, confidence: Confidence): PredictionAttempt<T> {
  return a.locked ? a : { ...a, confidence };
}

export function canLock(a: PredictionAttempt<string>): boolean {
  return !a.locked && a.answer !== null && a.confidence !== null;
}

/** Lock a complete draft. Idempotent, and a no-op for an incomplete draft, so double taps can't misfire. */
export function lockPrediction<T extends string>(a: PredictionAttempt<T>): PredictionAttempt<T> {
  return canLock(a) ? { ...a, locked: true } : a;
}

/** The answer, only once it has been committed — what feedback, recaps and reveals may use. */
export function lockedAnswer<T extends string>(a: PredictionAttempt<T>): T | null {
  return a.locked ? a.answer : null;
}

/** What still blocks locking, for a step's blocked hint. Null when the attempt can be locked (or already is). */
export function missingForLock(a: PredictionAttempt<string>): 'answer' | 'confidence' | null {
  if (a.locked) return null;
  if (a.answer === null) return 'answer';
  if (a.confidence === null) return 'confidence';
  return null;
}
