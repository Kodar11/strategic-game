import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LESSONS } from '../../../content/lessons.ts';
import { createRng } from '../../../game/rng.ts';
import { SCENARIOS, getScenario, scenariosFor } from '../index.ts';
import { applyScenarioInput, freshRun, lockScenarioPrediction, replay, restartScenario, runPhase, runResult, sanitizeScenarioRuns, setScenarioPrediction } from '../runtime.ts';
import type { DecisionPrompt, Input, ScenarioSpec } from '../types.ts';

/** A random legal input for a prompt, from a seeded RNG. */
function randomInput(p: DecisionPrompt, rng: () => number): Input {
  if (p.kind === 'choice') return p.options[Math.floor(rng() * p.options.length)].id;
  if (p.kind === 'number') {
    const steps = Math.round((p.max - p.min) / p.step);
    return Number((p.min + Math.floor(rng() * (steps + 1)) * p.step).toFixed(6));
  }
  const units = Math.round(p.total / p.step);
  const parts = p.parties.map(() => 0);
  for (let i = 0; i < units; i++) parts[Math.floor(rng() * parts.length)] += 1;
  return parts.map((u) => u * p.step);
}

function playThrough(spec: ScenarioSpec, seed: number): { inputs: Input[]; state: unknown } {
  const rng = createRng(seed * 31 + 7);
  let s = spec.play.init(seed);
  const inputs: Input[] = [];
  for (let i = 0; i < 80; i++) {
    const p = spec.play.prompt(s);
    if (!p) return { inputs, state: s };
    const input = randomInput(p, rng);
    inputs.push(input);
    s = spec.play.apply(s, input);
  }
  throw new Error(`${spec.id} did not terminate`);
}

describe('Paired scenarios — curriculum coverage', () => {
  it('has exactly 66 scenarios with unique ids', () => {
    assert.equal(SCENARIOS.length, 66);
    assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, 66);
  });

  it('gives every one of the 22 lessons exactly one A, one B and one C', () => {
    assert.equal(LESSONS.length, 22);
    for (const l of LESSONS) {
      const list = scenariosFor(l.id);
      assert.deepEqual(
        list.map((s) => s.slot),
        ['A', 'B', 'C'],
        l.id,
      );
    }
  });

  it('documents every formal field and source status', () => {
    for (const s of SCENARIOS) {
      for (const k of ['players', 'actions', 'timing', 'information', 'payoffs', 'solution', 'sourceNote'] as const) assert.ok(s.formal[k].length > 3, `${s.id}: formal.${k}`);
      assert.ok(['canonical', 'adapted', 'original'].includes(s.formal.source), s.id);
      assert.ok(s.rules.length > 0 && s.explain.length > 0 && s.takeaway.length > 10, s.id);
    }
  });
});

describe('Paired scenarios — every prediction claim follows from the engine', () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: ${s.predict.basis}`, () => {
      const matches = s.predict.options.filter((o) => o.verdict === 'match');
      assert.equal(new Set(s.predict.options.map((o) => o.id)).size, s.predict.options.length, 'option ids unique');
      if (s.predict.basis === 'calculable') {
        assert.equal(matches.length, 1, 'exactly one option matches the model');
        assert.ok(s.predict.solve, 'calculable predictions are solved by the engine');
        assert.equal(s.predict.solve!(), matches[0].id);
      } else {
        assert.equal(matches.length, 0, 'uncertain predictions never mark an option as matching');
      }
    });
  }
});

describe('Paired scenarios — rules are playable to the end from any legal path', () => {
  for (const s of SCENARIOS) {
    it(`${s.id} terminates with a well-formed result`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const { state } = playThrough(s, seed);
        const r = s.play.result(state);
        assert.ok(r.headline.length > 0);
        assert.ok(r.stats.length > 0);
        for (const st of r.stats) assert.ok(!/NaN|undefined|Infinity/.test(st.value), `${s.id} stat ${st.label}: ${st.value}`);
        for (const line of [r.headline, ...r.lines]) assert.ok(!/NaN|undefined/.test(line), `${s.id}: ${line}`);
        for (const b of r.bars ?? []) assert.ok(b.value >= 0 && b.value <= 1, `${s.id} bar ${b.label}`);
      }
    });
  }

  it('rejects illegal inputs instead of silently accepting them', () => {
    for (const s of SCENARIOS) {
      const st = s.play.init(1);
      assert.throws(() => s.play.apply(st, 'not-an-action-at-all'), `${s.id} accepted garbage`);
    }
  });

  it('is deterministic for a seed', () => {
    for (const s of SCENARIOS) {
      const a = playThrough(s, 5);
      const b = playThrough(s, 5);
      assert.deepEqual(s.play.result(a.state), s.play.result(b.state), s.id);
    }
  });
});

describe('Scenario runtime — prediction, play, record', () => {
  const spec = getScenario('l3.a.best-response-grid')!;
  const empty = { scenarioRuns: {}, scenarioDone: [] as string[], learning: [], completed: [] as const };

  it('needs a locked prediction before any move', () => {
    const runs = { [spec.id]: freshRun(spec, 3) };
    assert.equal(applyScenarioInput({ ...empty, scenarioRuns: runs }, spec.id, 'park'), null);
  });

  it('locks, plays, marks done and records the prediction once', () => {
    let runs = setScenarioPrediction(empty, spec.id, { answer: 'park-park', confidence: 4, locked: false })!;
    runs = lockScenarioPrediction({ scenarioRuns: runs }, spec.id, 1000)!;
    assert.equal(runPhase(spec, runs[spec.id]!), 'play');
    const next = applyScenarioInput({ ...empty, scenarioRuns: runs }, spec.id, 'park')!;
    assert.deepEqual(next.scenarioDone, [spec.id]);
    assert.equal(next.learning.length, 1);
    assert.equal(next.learning[0].evaluation, 'correct');
    assert.equal(next.learning[0].kind, 'scenario');
    assert.equal(runPhase(spec, next.scenarioRuns[spec.id]!), 'done');
    assert.ok(runResult(spec, next.scenarioRuns[spec.id]!));
    // A finished game takes no more input.
    assert.equal(applyScenarioInput({ ...empty, ...next }, spec.id, 'park'), null);
  });

  it('a locked prediction can’t be edited', () => {
    let runs = setScenarioPrediction(empty, spec.id, { answer: 'none', confidence: 2, locked: false })!;
    runs = lockScenarioPrediction({ scenarioRuns: runs }, spec.id, 50)!;
    assert.equal(setScenarioPrediction({ scenarioRuns: runs }, spec.id, { answer: 'park-park', confidence: 5, locked: false }), null);
  });

  it('a replay is a new attempt and keeps the first one and completion', () => {
    let runs = setScenarioPrediction(empty, spec.id, { answer: 'none', confidence: 2, locked: false })!;
    runs = lockScenarioPrediction({ scenarioRuns: runs }, spec.id, 100)!;
    const first = applyScenarioInput({ ...empty, scenarioRuns: runs }, spec.id, 'station')!;
    const restarted = restartScenario(first, spec.id, 9)!;
    let runs2 = setScenarioPrediction({ scenarioRuns: restarted }, spec.id, { answer: 'park-park', confidence: 5, locked: false })!;
    runs2 = lockScenarioPrediction({ scenarioRuns: runs2 }, spec.id, 200)!;
    const second = applyScenarioInput({ ...empty, ...first, scenarioRuns: runs2 }, spec.id, 'park')!;
    assert.equal(second.learning.length, 2);
    assert.equal(second.learning[0].attempt, 1);
    assert.equal(second.learning[0].evaluation, 'misconception');
    assert.equal(second.learning[1].attempt, 2);
    assert.deepEqual(second.scenarioDone, [spec.id]);
  });

  it('sanitising drops unknown, outdated, malformed and unreplayable runs', () => {
    const good = { ...freshRun(spec, 4), prediction: { answer: 'park-park', confidence: 3 as const, locked: true, lockedAt: 5 }, inputs: ['park'] };
    const saved = {
      [spec.id]: good,
      'no.such.scenario': good,
      'l3.b.penalty-kick': { ...good, inputs: ['park'] },
      'l3.c.partnership': { ...good, version: 99 },
      'l2.a.dominant-action': { nonsense: true },
    };
    const out = sanitizeScenarioRuns(saved);
    assert.deepEqual(Object.keys(out), [spec.id]);
    assert.ok(replay(spec, out[spec.id]!));
  });
});
