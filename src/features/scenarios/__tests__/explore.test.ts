import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { backwardInduction, equilibriumPath } from '../../../game/sequential.ts';
import { LABS } from '../../lessons/curriculum/labs.ts';
import { WEEKEND_BONUS } from '../content/module3.ts';
import { SCENARIOS, getScenario } from '../index.ts';
import { alternatives, compareValues, freshRun } from '../runtime.ts';
import type { Input, ScenarioSpec } from '../types.ts';

/** A finished single-decision run with the given input. */
function runWith(spec: ScenarioSpec, input: Input, seed = 7) {
  return { ...freshRun(spec, seed), inputs: [input] };
}

const num = (v: string) => Number(v.replace(/[^0-9.-]/g, ''));

function firstInput(spec: ScenarioSpec): Input | null {
  const p = spec.play.prompt(spec.play.init(7));
  return p?.kind === 'choice' ? p.options[0].id : p?.kind === 'number' ? p.initial : null;
}

describe('Compare your options', () => {
  it('never compares one run’s luck: random scenarios need an expected-value stat', () => {
    for (const s of SCENARIOS) {
      const input = firstInput(s);
      if (input === null) continue;
      const view = alternatives(s, runWith(s, input));
      if (!view) continue;
      if (s.formal.chance) assert.ok(s.explore && s.explore.expected, `${s.id} compares random outcomes without an expected stat`);
      assert.ok(view.rows.length >= 2, s.id);
      assert.equal(view.rows.filter((r) => r.mine).length, 1, `${s.id}: exactly one row is the learner's`);
    }
  });

  it('is available for most single-decision scenarios', () => {
    const n = SCENARIOS.filter((s) => {
      const input = firstInput(s);
      return input !== null && alternatives(s, runWith(s, input)) !== null;
    }).length;
    assert.ok(n >= 35, `only ${n} scenarios have a comparison`);
  });

  it('every configured stat exists and every configured value is on the slider grid', () => {
    for (const s of SCENARIOS) {
      if (!s.explore) continue;
      const p = s.play.prompt(s.play.init(1))!;
      if (s.explore.values) {
        assert.equal(p.kind, 'number', s.id);
        if (p.kind === 'number') for (const v of s.explore.values) {
          assert.ok(v >= p.min && v <= p.max, `${s.id}: ${v} out of range`);
          assert.ok(Math.abs((v - p.min) / p.step - Math.round((v - p.min) / p.step)) < 1e-9, `${s.id}: ${v} off grid`);
        }
      }
      const input = firstInput(s)!;
      assert.ok(alternatives(s, runWith(s, input)), `${s.id}: configured comparison unavailable`);
    }
  });

  it('adds the learner’s own value and keeps short ranges complete', () => {
    assert.deepEqual(compareValues({ min: 0, max: 4, step: 1 }, 2), [0, 1, 2, 3, 4]);
    assert.deepEqual(compareValues({ min: 0, max: 100, step: 1 }, 42, [0, 50]), [0, 42, 50]);
    assert.equal(compareValues({ min: 0, max: 100, step: 1 }, 42), null);
  });

  it('shows the strategic relationship each lesson claims', () => {
    const best = (id: string, input: Input) => {
      const view = alternatives(getScenario(id)!, runWith(getScenario(id)!, input))!;
      const top = Math.max(...view.rows.map((r) => num(r.value)));
      return view.rows.filter((r) => num(r.value) === top).map((r) => r.input);
    };
    assert.deepEqual(best('l6.a.cournot', 3), [4]);
    assert.deepEqual(best('l1.b.shared-project', 5), [0]);
    assert.deepEqual(best('l8.c.first-offer', 5), [3]);
    assert.deepEqual(best('l14.c.reasoning-depth', 19), [18]);
    assert.deepEqual(best('l17.a.first-price', 50), [30]);
    assert.deepEqual(best('l10.a.sales-commission', 50), [25]);
    const tip = alternatives(getScenario('l7.c.rare-invader')!, runWith(getScenario('l7.c.rare-invader')!, 2))!;
    assert.ok(num(tip.rows.find((r) => r.input === 5)!.value) < 50 && num(tip.rows.find((r) => r.input === 7)!.value) > 50, 'tipping point near 1/17');
  });

  it('is off for multi-step games and allocations', () => {
    for (const id of ['l5.a.matching-pennies', 'l19.b.project-allocation', 'l9.b.commitment']) {
      const s = getScenario(id)!;
      assert.equal(alternatives(s, { ...freshRun(s, 3), inputs: [] }), null, id);
    }
  });
});

describe('L9.C · the weekend bonus (promise transfer)', () => {
  const spec = getScenario('l9.c.empty-threat')!;
  it('backward induction: the manager would skip, so you work normal hours', () => {
    const sol = backwardInduction(WEEKEND_BONUS);
    assert.equal(sol.choice.bonus, 'skip');
    assert.deepEqual(equilibriumPath(WEEKEND_BONUS, sol), ['normal']);
    assert.equal(spec.predict.solve!(), 'no');
    assert.equal(spec.predict.options.find((o) => o.verdict === 'match')!.id, 'no');
  });
  it('the kept promise would have been better for both — the cost of non-credibility', () => {
    const view = alternatives(spec, runWith(spec, 'normal'))!;
    assert.deepEqual(view.rows.map((r) => r.value), ['0', '-3']);
  });
  it('is a new context, not a reskin of scenario A', () => {
    assert.ok(spec.version >= 2);
    assert.doesNotMatch(spec.formal.sourceNote, /same structure as the entry game/i);
  });
});

describe('Reveal labs ask before they tell', () => {
  it('every guess has its answer among the options', () => {
    for (const [id, lab] of Object.entries(LABS)) {
      if (lab?.kind !== 'reveal') continue;
      for (const c of lab.cards) if (c.guess) assert.ok(c.guess.options.includes(c.guess.answer), `${id}: ${c.title}`);
      assert.ok(lab.cards.some((c) => c.guess), `${id} has no guesses`);
    }
  });
});
