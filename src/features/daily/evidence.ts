import { type LessonId, getLesson } from '../../content/lessons.ts';
import { LEARNING_SCHEMA_VERSION, type LearningAttempt, allSkills } from '../learning/records.ts';
import type { DailyHistoryEntry } from './content.ts';

/**
 * Which official Daily Challenge answers count as Thinking Profile evidence, and how. A daily answer is used only
 * when it is comparable with the learning record's first attempts:
 * - server-graded custom content (`choice` or `number`). `scenario` challenges replay a lesson scenario whose own
 *   attempts are already in the learning record, so counting them again would double-weight that scenario;
 * - tagged with one of the existing skill areas (`skill`);
 * - rated for confidence (otherwise it couldn't join the confidence comparison like every other piece of evidence).
 * `basis` is carried over unchanged, so — as everywhere in the profile — only `calculable` answers are judged.
 *
 * Each qualifying answer becomes one first attempt (there is exactly one official answer per challenge). It feeds the
 * skill areas, the confidence comparison, the insights and the trend; it never touches lesson completion, practice,
 * transfer or scenario progress, and it is never written into the learning record itself.
 */
export function dailyEvidence(history: readonly DailyHistoryEntry[]): LearningAttempt[] {
  return history.flatMap((h): LearningAttempt[] => {
    if ((h.interaction !== 'choice' && h.interaction !== 'number') || !h.skill || h.confidence === null) return [];
    const skillLesson = allSkills().find((s) => s.id === h.skill)?.lesson;
    const lesson = (getLesson(h.lesson ?? undefined)?.id ?? skillLesson) as LessonId | undefined;
    if (!lesson) return [];
    return [
      {
        id: `daily/${h.challengeId}@${h.submittedAt}`,
        schemaVersion: LEARNING_SCHEMA_VERSION,
        kind: 'challenge',
        lesson,
        prediction: `daily/${h.challengeId}`,
        skill: h.skill,
        basis: h.basis,
        answer: 'daily',
        confidence: h.confidence,
        evaluation: h.evaluation,
        outcome: '',
        lockedAt: h.submittedAt,
        attempt: 1,
        lessonCompleted: null,
        contentVersion: h.version,
      },
    ];
  });
}
