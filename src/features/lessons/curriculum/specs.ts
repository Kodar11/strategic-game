import type { CharacterId, Expression } from '../../../components/characters/cast.ts';
import type { Analogy, TransferOption } from '../../../components/lesson/TransferQuestion.tsx';
import { catalog } from '../../../content/catalog.ts';
import type { LessonId } from '../../../content/lessons.ts';

/**
 * Content for the curriculum lessons built on the shared lesson runner (Lessons 2, 3, 6–9, 11–13, 15–22), loaded
 * from the database (one validated document per lesson).
 * Each lesson: intro and strategic question → scenario A (play the mechanism) → a lab that names the concept →
 * scenario B (change an assumption) → scenario C (transfer) → a transfer check → completion.
 * The five original lessons keep their own components and add their paired scenarios before completion.
 */

export interface Line {
  character: CharacterId;
  expression?: Expression;
  text: string;
  align?: 'left' | 'right';
}

export interface CurriculumLessonSpec {
  id: LessonId;
  intro: { kicker?: string; title: string; body: string; lines: Line[] };
  /** The strategic question the lesson answers, shown on the intro. */
  question: string;
  objectives: string[];
  concept: { title: string; line: Line; panels: { tone: 'insight' | 'info' | 'caution'; title: string; body: string }[] };
  transfer: { question: string; options: TransferOption[]; analogy: Analogy };
  completion: { takeaway: string; remember: string[]; reflection: string; nextHook: string };
}

/** The lesson material for a curriculum lesson; undefined for the five original lessons, which are components. */
export function curriculumSpec(lesson: LessonId): CurriculumLessonSpec | undefined {
  return catalog().curriculum.get(lesson);
}
