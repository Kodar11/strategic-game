/**
 * What the end of the first session points to, chosen from the published catalog (never a hard-coded destination
 * that might not exist). Pure, so the tests can check it against any catalog.
 */

interface LessonLike {
  id: string;
}

interface ScenarioLike {
  id: string;
  title: string;
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

/** Scenarios that each show a different kind of situation: trust, inspection, incentives at work. */
export const SHOWCASE_SCENARIOS = ['l1.a.classic-dilemma', 'l5.c.tax-audit', 'l10.a.sales-commission'];

/** Up to `count` scenarios for the preview: the preferred ones that are published, topped up in catalog order. */
export function showcaseScenarios<S extends ScenarioLike>(scenarios: readonly S[], count = 3): S[] {
  const preferred = SHOWCASE_SCENARIOS.map((id) => scenarios.find((s) => s.id === id)).filter((s): s is S => !!s);
  const rest = scenarios.filter((s) => !preferred.includes(s));
  return [...preferred, ...rest].slice(0, count);
}
