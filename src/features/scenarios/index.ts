import { catalog } from '../../content/catalog.ts';
import type { LessonId } from '../../content/lessons.ts';
import { SCENARIO_ENGINES } from './engines/index.ts';
import type { ScenarioSpec, Slot } from './types.ts';

/** Every scenario the app can play (one per registered engine). For static routes; content decides what is shown. */
export const SCENARIO_IDS: readonly string[] = SCENARIO_ENGINES.map((e) => e.id);

/** The published paired scenarios: content joined with their engines. IDs are stable and appear in exported data. */
export function allScenarios(): readonly ScenarioSpec[] {
  return catalog().scenarios;
}

export function getScenario(id: string): ScenarioSpec | undefined {
  return catalog().scenarioById.get(id);
}

const ORDER: Record<Slot, number> = { A: 0, B: 1, C: 2 };

export function scenariosFor(lesson: LessonId): ScenarioSpec[] {
  return allScenarios()
    .filter((s) => s.lesson === lesson)
    .sort((a, b) => ORDER[a.slot] - ORDER[b.slot]);
}
