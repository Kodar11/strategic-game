import type { Verdict } from '../../components/lesson/verdict.ts';
import { catalog } from '../../content/catalog.ts';
import type { LessonId, ModuleId } from '../../content/lessons.ts';

/**
 * Module checkpoints and the final cumulative assessment. The items are content, loaded from the database; the
 * assessment screen renders them and `scoring.ts` grades them. Every graded claim is either solved by the engine
 * (`solve`, registered in `solvers.ts`) or follows directly from the situation text; tests check `solve` against
 * the options marked `match`.
 *
 * Several options may be `match` on a multi-select item: plausible alternatives are not graded as wrong.
 */

/** Every assessment the app has a screen for. Content may publish any of them. */
export const ASSESSMENT_IDS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'final'] as const;

export type AssessmentId = ModuleId | 'final';

export interface AssessmentOption {
  id: string;
  label: string;
  verdict: Verdict;
  feedback: string;
}

export interface AssessmentItem {
  id: string;
  /** The lesson whose idea this mainly tests (for “review this lesson” links). */
  lesson: LessonId;
  situation?: string;
  table?: { head: string[]; rows: string[][] };
  question: string;
  /** Multi-select: the learner may choose several; scoring rewards matches and penalises misconceptions. */
  multi?: boolean;
  options: AssessmentOption[];
  /** The reasoning, shown after submission. */
  explanation: string;
  /** For single-answer calculable items: the matching option id, from the engine. */
  solve?: () => string;
}

export interface Assessment {
  id: AssessmentId;
  version: number;
  title: string;
  intro: string;
  /** Shown above every item (the final assessment's shared case). */
  case?: string;
  items: AssessmentItem[];
  /** Share of the maximum score needed to pass. */
  passMark: number;
  /** An ungraded written explanation with a self-check list (final assessment only). */
  reflection?: { prompt: string; rubric: string[] };
}


export function allAssessments(): readonly Assessment[] {
  return catalog().assessments;
}

export function getAssessment(id: string | undefined): Assessment | undefined {
  return allAssessments().find((a) => a.id === id);
}

export function moduleCheckpoint(module: ModuleId): Assessment {
  return allAssessments().find((a) => a.id === module)!;
}

/** "Checkpoint 2 · Coordination, …" → kicker and subject, so cards can show them on separate lines. */
export function splitAssessmentTitle(title: string): { kicker: string; subject: string } {
  const i = title.indexOf(' · ');
  return i < 0 ? { kicker: title, subject: '' } : { kicker: title.slice(0, i), subject: title.slice(i + 3) };
}
