import { type Choices, type EndingId, ENDING_TITLE, type Position, finished, restore } from './crossing/story.ts';
import { type MeridianRun, STEPS, sanitizeRun } from './meridian/run.ts';

/**
 * Stories progress, kept on the device (like Strategy Arena records): the current run of each story, and what
 * finished runs reached. Stories need no account or network, and nothing here is sent anywhere. Pure, so the
 * validation is tested; the store in src/features/stories/store.ts reads and writes it.
 */

export const STORY_IDS = ['crossing', 'meridian'] as const;
export type StoryId = (typeof STORY_IDS)[number];
export const isStoryId = (x: unknown): x is StoryId => STORY_IDS.includes(x as StoryId);

export interface CrossingSave {
  pos: Position;
  choices: Choices;
  /** True once the reflection after the ending has been reached. */
  reflecting: boolean;
}

export interface MeridianSave {
  run: MeridianRun;
  reflecting: boolean;
}

export interface StoriesSave {
  crossing: CrossingSave | null;
  meridian: MeridianSave | null;
  /** Times each story was finished (reached its reflection). */
  finishes: Record<StoryId, number>;
  /** Story One endings reached, in the order first reached. */
  endings: EndingId[];
  /** Last time each story was played, for "continue" ordering. */
  touched: Partial<Record<StoryId, number>>;
}

export const EMPTY_SAVE: StoriesSave = { crossing: null, meridian: null, finishes: { crossing: 0, meridian: 0 }, endings: [], touched: {} };

const count = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);

export function sanitizeSave(raw: unknown): StoriesSave {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c = o.crossing && typeof o.crossing === 'object' ? (o.crossing as Record<string, unknown>) : null;
  const m = o.meridian && typeof o.meridian === 'object' ? (o.meridian as Record<string, unknown>) : null;
  const f = (o.finishes && typeof o.finishes === 'object' ? o.finishes : {}) as Record<string, unknown>;
  const t = (o.touched && typeof o.touched === 'object' ? o.touched : {}) as Record<string, unknown>;
  const touched: StoriesSave['touched'] = {};
  for (const id of STORY_IDS) if (typeof t[id] === 'number' && Number.isFinite(t[id])) touched[id] = t[id] as number;
  const endings = Array.isArray(o.endings) ? o.endings.filter((e, i, a): e is EndingId => e in ENDING_TITLE && a.indexOf(e) === i) : [];
  const crossing = c ? restore(c) : null;
  const run = m ? sanitizeRun(m.run) : null;
  return {
    // The reflection only follows a finished story.
    crossing: crossing ? { ...crossing, reflecting: c!.reflecting === true && finished(crossing.choices) } : null,
    meridian: run ? { run, reflecting: m!.reflecting === true && run.step === STEPS.length - 1 } : null,
    finishes: { crossing: count(f.crossing), meridian: count(f.meridian) },
    endings,
    touched,
  };
}
