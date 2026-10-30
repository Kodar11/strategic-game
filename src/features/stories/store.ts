import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { type Choices, type Position, START, ending, finished } from '@/src/stories/crossing/story';
import { type MeridianRun, NEW_RUN } from '@/src/stories/meridian/run';
import { EMPTY_SAVE, type StoriesSave, type StoryId, sanitizeSave } from '@/src/stories/save';

/**
 * Stories progress on this device (see src/stories/save.ts). Every change is written straight away, so closing the
 * app or pressing back mid-scene resumes on the same beat; reads are validated, so a damaged save restarts a story
 * rather than breaking it.
 */

const KEY = 'tactiqo/stories/v1';

interface StoriesState extends StoriesSave {
  loaded: boolean;
  load: () => Promise<void>;
  saveCrossing: (pos: Position, choices: Choices) => void;
  /** Mark the ending as seen and open the reflection; counts the finish once per run. */
  reflectCrossing: () => void;
  saveMeridian: (run: MeridianRun) => void;
  reflectMeridian: () => void;
  restart: (id: StoryId) => void;
}

let writes = Promise.resolve();
function persist(s: StoriesSave) {
  const { crossing, meridian, finishes, endings, touched } = s;
  const json = JSON.stringify({ crossing, meridian, finishes, endings, touched });
  // Serialized, so an older write can never land after a newer one.
  writes = writes.then(() => AsyncStorage.setItem(KEY, json)).catch(() => undefined);
}

export const useStories = create<StoriesState>()((set, get) => {
  const update = (patch: Partial<StoriesSave>) => {
    set(patch);
    persist(get());
  };
  return {
    ...EMPTY_SAVE,
    loaded: false,
    load: async () => {
      if (get().loaded) return;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        set({ ...sanitizeSave(raw ? JSON.parse(raw) : null), loaded: true });
      } catch {
        set({ loaded: true });
      }
    },
    saveCrossing: (pos, choices) => update({ crossing: { pos, choices, reflecting: false }, touched: { ...get().touched, crossing: Date.now() } }),
    reflectCrossing: () => {
      const s = get();
      if (!s.crossing || s.crossing.reflecting || !finished(s.crossing.choices)) return;
      const e = ending(s.crossing.choices)!.id;
      update({
        crossing: { ...s.crossing, reflecting: true },
        finishes: { ...s.finishes, crossing: s.finishes.crossing + 1 },
        endings: s.endings.includes(e) ? s.endings : [...s.endings, e],
      });
    },
    saveMeridian: (run) => update({ meridian: { run, reflecting: false }, touched: { ...get().touched, meridian: Date.now() } }),
    reflectMeridian: () => {
      const s = get();
      if (!s.meridian || s.meridian.reflecting) return;
      update({ meridian: { ...s.meridian, reflecting: true }, finishes: { ...s.finishes, meridian: s.finishes.meridian + 1 } });
    },
    restart: (id) =>
      id === 'crossing'
        ? update({ crossing: { pos: START, choices: {}, reflecting: false }, touched: { ...get().touched, crossing: Date.now() } })
        : update({ meridian: { run: NEW_RUN, reflecting: false }, touched: { ...get().touched, meridian: Date.now() } }),
  };
});
