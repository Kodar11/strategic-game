import { createRng } from '../../../game/rng.ts';
import { alternatives } from '../runtime.ts';
import type { DecisionPrompt, Input, ScenarioSpec } from '../types.ts';

/**
 * A deterministic trace of everything a scenario's engine produces: prompts, logs, results and the "compare your
 * options" view, for several seeds and input strategies, plus `solve()`. `scripts/content/snapshot-engine.ts` wrote
 * the golden copy from the original hardcoded specs; the equivalence test replays the same trace against the specs
 * built from database content and the engine registry, so any behavioural drift shows up as a diff.
 */

export const TRACE_SEEDS = [1, 42, 987654, 2 ** 31 - 1] as const;
type Strategy = 'first' | 'last' | 'middle' | 'random';
const STRATEGIES: readonly Strategy[] = ['first', 'last', 'middle', 'random'];

function pick(p: DecisionPrompt, strategy: Strategy, rng: () => number): Input {
  if (p.kind === 'choice') {
    const i = strategy === 'first' ? 0 : strategy === 'last' ? p.options.length - 1 : strategy === 'middle' ? Math.floor(p.options.length / 2) : Math.floor(rng() * p.options.length);
    return p.options[i].id;
  }
  if (p.kind === 'number') {
    const steps = Math.round((p.max - p.min) / p.step);
    const k = strategy === 'first' ? 0 : strategy === 'last' ? steps : strategy === 'middle' ? Math.round((p.initial - p.min) / p.step) : Math.floor(rng() * (steps + 1));
    return Number((p.min + k * p.step).toFixed(6));
  }
  const units = Math.round(p.total / p.step);
  const parts = p.parties.map(() => 0);
  if (strategy === 'first') parts[0] = units;
  else if (strategy === 'last') parts[parts.length - 1] = units;
  else if (strategy === 'middle') for (let i = 0; i < units; i++) parts[i % parts.length] += 1;
  else for (let i = 0; i < units; i++) parts[Math.floor(rng() * parts.length)] += 1;
  return parts.map((u) => u * p.step);
}

export interface ScenarioTrace {
  id: string;
  version: number;
  solve: string | null;
  runs: { seed: number; strategy: Strategy; steps: { prompt: DecisionPrompt; log: string[] }[]; inputs: Input[]; result: unknown; alternatives: unknown; error?: string }[];
}

export function traceScenario(spec: ScenarioSpec): ScenarioTrace {
  const seeds = [...new Set([...(spec.testSeed !== undefined ? [spec.testSeed] : []), ...TRACE_SEEDS])];
  const runs: ScenarioTrace['runs'] = [];
  for (const seed of seeds) {
    for (const strategy of STRATEGIES) {
      const rng = createRng(seed * 17 + 3);
      const steps: ScenarioTrace['runs'][number]['steps'] = [];
      const inputs: Input[] = [];
      try {
        let s = spec.play.init(seed);
        for (let i = 0; i < 80; i++) {
          const p = spec.play.prompt(s);
          steps.push({ prompt: p as DecisionPrompt, log: spec.play.log ? spec.play.log(s) : [] });
          if (!p) break;
          const input = pick(p, strategy, rng);
          inputs.push(input);
          s = spec.play.apply(s, input);
        }
        const run = { prediction: { answer: null, confidence: null, locked: true }, inputs, seed, version: spec.version };
        runs.push({ seed, strategy, steps, inputs, result: spec.play.result(s), alternatives: alternatives(spec, run) });
      } catch (e) {
        runs.push({ seed, strategy, steps, inputs, result: null, alternatives: null, error: String(e) });
      }
    }
  }
  return { id: spec.id, version: spec.version, solve: spec.predict.solve ? spec.predict.solve() : null, runs };
}

/** JSON round-trip, so `undefined` fields and number formatting compare exactly as stored. */
export function normalise<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
