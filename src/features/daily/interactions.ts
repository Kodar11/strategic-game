import { z } from 'zod';

import { getScenario } from '../scenarios/index.ts';
import { replay } from '../scenarios/runtime.ts';
import type { Input, ScenarioSpec } from '../scenarios/types.ts';

/**
 * The Daily Challenge interaction registry. The database stores only *configuration* for a challenge; how it is
 * answered is one of the engines registered here, so content can never carry code. Adding an interaction type means
 * adding an engine here (and a renderer in DailyInteraction.tsx, and the same type to the database's checks in
 * supabase/migrations/…_daily_challenges.sql) — an app release. Content for an unknown type is shown as a
 * recoverable "needs a newer version of the app" message, never replaced with something else.
 *
 * For every type:
 * - `config`   the shape of `daily_challenges.config` (strict: unknown fields are errors)
 * - `check`    rules beyond the shape, against this app's engines (e.g. the scenario exists in this version)
 * - `draft`    the learner's unsubmitted input; `complete` turns it into the submitted `answer`, or null while
 *              something is still missing
 * - `answer`   what is sent to submit_daily_challenge / check_daily_practice, which grade it on the server
 *
 * Feedback is always the server's result (verdict, feedback, model answer, explanation, takeaway).
 */

const optionId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40);

// ── Multiple choice ──────────────────────────────────────────────────────────

export const choiceConfigSchema = z
  .strictObject({ options: z.array(z.strictObject({ id: optionId, label: z.string().min(1).max(300) })).min(2).max(6) })
  .refine((c) => new Set(c.options.map((o) => o.id)).size === c.options.length, 'option ids must be unique');
export type ChoiceConfig = z.infer<typeof choiceConfigSchema>;
export const choiceAnswerSchema = z.strictObject({ option: optionId });
export type ChoiceAnswer = z.infer<typeof choiceAnswerSchema>;
export interface ChoiceDraft {
  option: string | null;
}

export const choiceEngine = {
  config: choiceConfigSchema,
  answer: choiceAnswerSchema,
  check: (_c: ChoiceConfig): string | null => null,
  draft: (): ChoiceDraft => ({ option: null }),
  choose: (c: ChoiceConfig, d: ChoiceDraft, option: string): ChoiceDraft => (c.options.some((o) => o.id === option) ? { option } : d),
  complete: (c: ChoiceConfig, d: ChoiceDraft): ChoiceAnswer | null => (d.option && c.options.some((o) => o.id === d.option) ? { option: d.option } : null),
};

// ── Number (slider) ──────────────────────────────────────────────────────────

const onGrid = (v: number, min: number, step: number) => Math.abs(Math.round((v - min) / step) * step + min - v) <= step * 1e-6;

export const numberConfigSchema = z
  .strictObject({
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    initial: z.number(),
    unit: z.string().min(1).max(12).optional(),
    minLabel: z.string().min(1).max(40).optional(),
    maxLabel: z.string().min(1).max(40).optional(),
  })
  .refine((c) => c.max > c.min, 'max must be above min')
  .refine((c) => (c.max - c.min) / c.step <= 1000 && onGrid(c.max, c.min, c.step), 'max must be min plus at most 1000 whole steps')
  .refine((c) => c.initial >= c.min && c.initial <= c.max && onGrid(c.initial, c.min, c.step), 'initial must be on the slider');
export type NumberConfig = z.infer<typeof numberConfigSchema>;
export const numberAnswerSchema = z.strictObject({ value: z.number() });
export type NumberAnswer = z.infer<typeof numberAnswerSchema>;
export interface NumberDraft {
  value: number;
}

/** Snap to the slider's grid, removing floating-point noise (0.1 + 0.2). */
export function snapNumber(c: NumberConfig, v: number): number {
  const clamped = Math.min(c.max, Math.max(c.min, v));
  const snapped = Math.round((clamped - c.min) / c.step) * c.step + c.min;
  return Number(snapped.toFixed(10));
}

export function formatNumber(c: Pick<NumberConfig, 'unit'>, v: number): string {
  const n = Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)));
  return c.unit === '%' ? `${n}%` : c.unit ? `${n} ${c.unit}` : n;
}

export const numberEngine = {
  config: numberConfigSchema,
  answer: numberAnswerSchema,
  check: (_c: NumberConfig): string | null => null,
  draft: (c: NumberConfig): NumberDraft => ({ value: c.initial }),
  set: (c: NumberConfig, _d: NumberDraft, v: number): NumberDraft => ({ value: snapNumber(c, v) }),
  complete: (c: NumberConfig, d: NumberDraft): NumberAnswer | null => ({ value: snapNumber(c, d.value) }),
};

// ── Scenario (an existing paired scenario, played with its own engine) ───────

export const scenarioConfigSchema = z.strictObject({ scenario: z.string().min(1).max(80), version: z.number().int().positive() });
export type ScenarioConfig = z.infer<typeof scenarioConfigSchema>;
const inputSchema = z.union([z.string().max(60), z.number(), z.array(z.number()).max(12)]);
export const scenarioAnswerSchema = z.strictObject({ option: z.string().min(1).max(40), seed: z.number().int().nonnegative(), inputs: z.array(inputSchema).max(60) });
export type ScenarioAnswer = z.infer<typeof scenarioAnswerSchema>;
export interface ScenarioDraft {
  /** The predicted option; locked once play starts, exactly as in a lesson scenario. */
  option: string | null;
  locked: boolean;
  seed: number;
  inputs: Input[];
}

/** The scenario a challenge plays, if this app version has it at the configured version. */
export function scenarioFor(c: ScenarioConfig): ScenarioSpec | null {
  const spec = getScenario(c.scenario);
  return spec && spec.version === c.version ? spec : null;
}

export type ScenarioPhase = 'predict' | 'play' | 'done';

export function scenarioPhase(spec: ScenarioSpec, d: ScenarioDraft): ScenarioPhase {
  if (!d.locked) return 'predict';
  const s = replay(spec, { prediction: { answer: d.option, confidence: null, locked: false }, inputs: d.inputs, seed: d.seed, version: spec.version });
  return s !== null && spec.play.prompt(s) === null ? 'done' : 'play';
}

export const scenarioEngine = {
  config: scenarioConfigSchema,
  answer: scenarioAnswerSchema,
  check: (c: ScenarioConfig): string | null => {
    const spec = getScenario(c.scenario);
    if (!spec) return `It uses scenario ${c.scenario}, which this version of the app doesn't have.`;
    if (spec.version !== c.version) return `It uses version ${c.version} of scenario ${c.scenario}; this version of the app plays version ${spec.version}.`;
    return null;
  },
  draft: (seed: number): ScenarioDraft => ({ option: null, locked: false, seed, inputs: [] }),
  predict: (spec: ScenarioSpec, d: ScenarioDraft, option: string): ScenarioDraft => (d.locked || !spec.predict.options.some((o) => o.id === option) ? d : { ...d, option }),
  lock: (d: ScenarioDraft): ScenarioDraft => (d.option ? { ...d, locked: true } : d),
  /** Apply one move through the scenario's own rules; an illegal move leaves the draft unchanged. */
  play: (spec: ScenarioSpec, d: ScenarioDraft, input: Input): ScenarioDraft => {
    if (scenarioPhase(spec, d) !== 'play') return d;
    const next = { ...d, inputs: [...d.inputs, input] };
    const s = replay(spec, { prediction: { answer: d.option, confidence: null, locked: false }, inputs: next.inputs, seed: d.seed, version: spec.version });
    return s === null ? d : next;
  },
  complete: (spec: ScenarioSpec, d: ScenarioDraft): ScenarioAnswer | null =>
    d.option && scenarioPhase(spec, d) === 'done' ? { option: d.option, seed: d.seed, inputs: d.inputs } : null,
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const INTERACTIONS = { choice: choiceEngine, number: numberEngine, scenario: scenarioEngine } as const;
export type InteractionType = keyof typeof INTERACTIONS;
export const INTERACTION_TYPES = Object.keys(INTERACTIONS) as InteractionType[];

export function isInteractionType(t: unknown): t is InteractionType {
  return typeof t === 'string' && Object.prototype.hasOwnProperty.call(INTERACTIONS, t);
}
