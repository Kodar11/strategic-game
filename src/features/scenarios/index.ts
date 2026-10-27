import type { LessonId } from '../../content/lessons.ts';
import { MODULE1_SCENARIOS } from './content/module1.ts';
import { MODULE2_SCENARIOS } from './content/module2.ts';
import { MODULE3_SCENARIOS } from './content/module3.ts';
import { MODULE4_SCENARIOS } from './content/module4.ts';
import { MODULE5_SCENARIOS } from './content/module5.ts';
import { MODULE6_SCENARIOS } from './content/module6.ts';
import type { ScenarioSpec, Slot } from './types.ts';

/** All 66 paired scenarios: three per lesson (A, B, C). IDs are stable and appear in exported data. */
export const SCENARIOS: readonly ScenarioSpec[] = [
  ...MODULE1_SCENARIOS,
  ...MODULE2_SCENARIOS,
  ...MODULE3_SCENARIOS,
  ...MODULE4_SCENARIOS,
  ...MODULE5_SCENARIOS,
  ...MODULE6_SCENARIOS,
];

const BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));

export function getScenario(id: string): ScenarioSpec | undefined {
  return BY_ID.get(id);
}

const ORDER: Record<Slot, number> = { A: 0, B: 1, C: 2 };

export function scenariosFor(lesson: LessonId): ScenarioSpec[] {
  return SCENARIOS.filter((s) => s.lesson === lesson).sort((a, b) => ORDER[a.slot] - ORDER[b.slot]);
}
