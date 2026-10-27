import type { StepDef } from '@/src/components/lesson/LessonShell';
import type { LessonId } from '@/src/content/lessons';
import type { Evaluation, LearningAttempt } from '@/src/features/learning/records';
import { ScenarioPlayer } from '@/src/features/scenarios/ScenarioPlayer';
import { scenariosFor } from '@/src/features/scenarios';
import { SLOT_INFO, type ScenarioSpec } from '@/src/features/scenarios/types';

/** One lesson step per paired scenario; each must be finished once before the lesson continues. */
export function scenarioStep(spec: ScenarioSpec, done: readonly string[]): StepDef {
  return {
    key: `scenario-${spec.slot}`,
    render: () => <ScenarioPlayer id={spec.id} />,
    canContinue: done.includes(spec.id),
    blockedHint: 'Play the scenario through to continue.',
  };
}

export function pairedScenarioSteps(lesson: LessonId, done: readonly string[]): StepDef[] {
  return scenariosFor(lesson).map((s) => scenarioStep(s, done));
}

const FIRST: Record<Evaluation, string> = {
  correct: 'your first prediction matched the model',
  partial: 'your first prediction was defensible but missed something',
  misconception: 'your first prediction is worth another look',
  'reasonable-miss': 'you made a reasonable call about something you couldn’t know',
  reasonable: 'you made a reasonable call',
};

/** Recap lines for a lesson's scenarios, from the first recorded attempt at each. */
export function scenarioRecap(lesson: LessonId, learning: readonly LearningAttempt[]): string[] {
  return scenariosFor(lesson).flatMap((s) => {
    const first = learning.filter((a) => a.prediction === s.id).sort((a, b) => a.attempt - b.attempt)[0];
    return first ? [`${SLOT_INFO[s.slot].label} (${s.title}): ${FIRST[first.evaluation]}.`] : [];
  });
}
