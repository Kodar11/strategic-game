import type { LessonId } from '../../content/lessons.ts';
import type { CurriculumLessonSpec } from '../lessons/curriculum/specs.ts';
import type { ClipDef } from './clips.ts';

/**
 * The spoken lines of a curriculum lesson (the lessons on the shared runner), derived from its content.
 *
 * One function serves three places, so they can't disagree: `scripts/curriculum-clips.mjs` snapshots the seed's
 * lines into `curriculum-clips.ts` for generation, the manifest test checks that snapshot against the seed, and
 * the runner derives the same ids and text from the content it is showing. Content is loaded from the database at
 * run time, so the runner only plays a clip whose snapshot text still equals the text on screen.
 *
 * Ids are `<lesson-id>.<step>.<line>`. Lesson numbers move with the curriculum; lesson ids don't.
 */
export function curriculumLines(lesson: LessonId, spec: CurriculumLessonSpec): ClipDef[] {
  const line = (slot: string, character: ClipDef['character'], text: string, style: ClipDef['style']): ClipDef => ({
    id: `${lesson}.${slot}`,
    lesson,
    character,
    style: character === 'sen' && style === 'dialogue' ? 'narration' : style,
    sync: 'computed',
    text,
  });
  return [
    line('intro.heading', 'sen', headingText(spec.intro.title, spec.intro.body), 'narration'),
    ...spec.intro.lines.map((l, i) => line(`intro.line-${i + 1}`, l.character, l.text, 'dialogue')),
    line('concept.line', spec.concept.line.character, spec.concept.line.text, 'dialogue'),
    ...spec.transfer.options.map((o) => line(`transfer.${o.id}`, 'sen', o.feedback, 'narration')),
    line('done.takeaway', 'sen', spec.completion.takeaway, 'narration'),
  ];
}

/** A step heading read aloud: its title, then its body. */
function headingText(title: string, body: string): string {
  return /[.?!…]$/.test(title.trim()) ? `${title.trim()} ${body}` : `${title.trim()}. ${body}`;
}
