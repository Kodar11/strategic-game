import { z } from 'zod';

export const LESSON_IDS = [
  'cooperation-trap',
  'strategy-detective',
  'coordination-problem',
  'predictability-trap',
  'incentive-shift',
] as const;

export const lessonIdSchema = z.enum(LESSON_IDS);
export type LessonId = z.infer<typeof lessonIdSchema>;

export type SceneId = 'market' | 'crowd' | 'meetup' | 'shootout' | 'policy';

export interface LessonMeta {
  id: LessonId;
  number: number;
  title: string;
  concept: string;
  description: string;
  minutes: number;
  scene: SceneId;
  accent: 'blue' | 'orange' | 'cyan' | 'amber';
}

export const LESSONS: readonly LessonMeta[] = [
  {
    id: 'cooperation-trap',
    number: 1,
    title: 'The Cooperation Trap',
    concept: 'Dominant strategies',
    description: 'Why sensible individual choices can leave everyone worse off.',
    minutes: 6,
    scene: 'market',
    accent: 'orange',
  },
  {
    id: 'strategy-detective',
    number: 2,
    title: 'The Strategy Detective',
    concept: 'Iterated reasoning',
    description: 'Your best move depends on how deeply others think.',
    minutes: 6,
    scene: 'crowd',
    accent: 'cyan',
  },
  {
    id: 'coordination-problem',
    number: 3,
    title: 'The Coordination Problem',
    concept: 'Focal points',
    description: 'How shared expectations help people find each other.',
    minutes: 5,
    scene: 'meetup',
    accent: 'amber',
  },
  {
    id: 'predictability-trap',
    number: 4,
    title: 'The Predictability Trap',
    concept: 'Mixed strategies',
    description: 'Patterns can be read. Sometimes unpredictability is the strategy.',
    minutes: 6,
    scene: 'shootout',
    accent: 'blue',
  },
  {
    id: 'incentive-shift',
    number: 5,
    title: 'The Incentive Shift',
    concept: 'Incentive design',
    description: 'Change the rules, and the best move changes with them.',
    minutes: 6,
    scene: 'policy',
    accent: 'orange',
  },
];

export function getLesson(id: string | undefined): LessonMeta | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function nextLesson(id: LessonId): LessonMeta | undefined {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? LESSONS[i + 1] : undefined;
}
