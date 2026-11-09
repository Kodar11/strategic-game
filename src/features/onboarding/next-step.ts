/**
 * What the end of the first session points to, chosen from the published catalog (never a hard-coded destination
 * that might not exist). Pure, so the tests can check it against any catalog.
 */

interface LessonLike {
  id: string;
}

/** The lesson the dilemma leads into: the Prisoner's Dilemma lesson. */
export const BRIDGE_LESSON = 'cooperation-trap';

/**
 * One recommendation: the bridge lesson if it's published and not finished, else the first unfinished lesson in
 * curriculum order, else the first lesson. Undefined only for an empty catalog.
 */
export function recommendedLesson<L extends LessonLike>(lessons: readonly L[], completed: readonly string[]): L | undefined {
  const open = (l: L) => !completed.includes(l.id);
  return lessons.find((l) => l.id === BRIDGE_LESSON && open(l)) ?? lessons.find(open) ?? lessons[0];
}
