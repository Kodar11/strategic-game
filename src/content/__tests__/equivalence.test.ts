import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';

import { normalise, traceScenario } from '../../features/scenarios/__tests__/engine-trace.ts';
import { buildCatalog } from '../build.ts';
import type { Catalog } from '../catalog.ts';
import { readSeed, installSeedCatalog } from '../seed.ts';

/**
 * Behavioural equivalence with the app before the migration. `legacy-golden.json` was recorded from the original
 * hardcoded specs (every scenario played with four seeds and four input strategies, every parameter lab on a grid of
 * slider values, every assessment solver). The same traces from the catalog built out of database content and the
 * registered engines must match exactly.
 */

const golden = JSON.parse(readFileSync(new URL('./legacy-golden.json', import.meta.url), 'utf8')) as {
  scenarios: ReturnType<typeof traceScenario>[];
  labs: Record<string, { values: Record<string, number>; output: unknown }[]>;
  assessments: Record<string, string>;
};

let c: Catalog;
before(() => {
  c = installSeedCatalog();
});

describe('Content catalog — equivalence with the pre-migration app', () => {
  it('has every scenario of the original catalog, in the original order', () => {
    assert.deepEqual(
      c.scenarios.map((s) => `${s.id}@${s.version}`),
      golden.scenarios.map((t) => `${t.id}@${t.version}`),
    );
  });

  it('plays every scenario exactly as before: prompts, logs, results, comparisons and solvers', () => {
    for (const expected of golden.scenarios) {
      const spec = c.scenarioById.get(expected.id)!;
      assert.deepStrictEqual(normalise(traceScenario(spec)), expected, `${expected.id} drifted from the original engine`);
    }
  });

  it('computes every parameter lab exactly as before', () => {
    const param = [...c.labs].filter(([, l]) => l.kind === 'param');
    assert.deepEqual(param.map(([id]) => id).sort(), Object.keys(golden.labs).sort());
    for (const [lesson, lab] of param) {
      if (lab.kind !== 'param') continue;
      for (const { values, output } of golden.labs[lesson]) assert.deepStrictEqual(normalise(lab.compute(values)), output, `${lesson} at ${JSON.stringify(values)}`);
    }
  });

  it('solves every assessment item exactly as before', () => {
    const solved = Object.fromEntries(c.assessments.flatMap((a) => a.items.filter((i) => i.solve).map((i) => [`${a.id}/${i.id}`, i.solve!()])));
    assert.deepEqual(solved, golden.assessments);
  });
});

describe('Content catalog — validation refuses content the engines cannot run', () => {
  const seed = () => structuredClone(readSeed()) as Record<string, any>;
  const problemsOf = (doc: unknown) => {
    const r = buildCatalog(doc);
    return r.ok ? [] : r.problems;
  };

  it('accepts the repository seed', () => {
    assert.deepEqual(problemsOf(readSeed()), []);
  });

  it('refuses a scenario version that has no engine', () => {
    const doc = seed();
    doc.scenarios[0].version = 99;
    assert.match(problemsOf(doc).join('\n'), /l1\.a\.classic-dilemma is version 99; this app version plays version 1/);
  });

  it('refuses a scenario whose payoff table differs from the one its engine plays', () => {
    const doc = seed();
    const s = doc.scenarios.find((x: any) => x.visual?.kind === 'matrix');
    s.visual.game.payoffs[0][0][0] += 1;
    assert.match(problemsOf(doc).join('\n'), /shows a matrix that differs/);
  });

  it('refuses a lesson that this app version cannot run', () => {
    const doc = seed();
    doc.lessons.push({ ...doc.lessons[0], id: 'time-travel', number: 99, position: 99 });
    assert.match(problemsOf(doc).join('\n'), /lesson time-travel has no implementation/);
  });

  it('refuses a lesson that lost a scenario', () => {
    const doc = seed();
    doc.scenarios = doc.scenarios.filter((x: any) => x.id !== 'l1.b.shared-project');
    assert.match(problemsOf(doc).join('\n'), /cooperation-trap has 0 published scenarios in slot B/);
  });

  it('refuses a parameter lab whose sliders no longer match its calculation', () => {
    const doc = seed();
    const lab = doc.labs.find((x: any) => x.spec.kind === 'param');
    lab.spec.sliders[0].id = 'renamed';
    assert.match(problemsOf(doc).join('\n'), /has sliders renamed/);
  });

  it('refuses unknown fields and broken shapes instead of ignoring them', () => {
    const doc = seed();
    doc.challenges[0].optionz = [];
    assert.match(problemsOf(doc).join('\n'), /challenges\[0\]/);
  });

  it('refuses dangling references and grading-rule violations', () => {
    const doc = seed();
    doc.assessments[0].items[0].lesson = 'cooperation-trapp';
    doc.challenges.find((x: any) => x.basis === 'calculable').options.forEach((o: any) => (o.verdict = 'defensible'));
    const problems = problemsOf(doc).join('\n');
    assert.match(problems, /refers to lesson cooperation-trapp/);
    assert.match(problems, /is calculable but no option is a match/);
  });

  it('allows ordinary text edits without an app release', () => {
    const doc = seed();
    doc.scenarios[0].setup = 'Edited setup text.';
    doc.challenges[0].options[0].feedback = 'Edited feedback.';
    doc.lessons[0].title = 'Edited title';
    const r = buildCatalog(doc);
    assert.ok(r.ok);
    assert.equal(r.catalog.scenarios[0].setup, 'Edited setup text.');
    assert.equal(r.catalog.lessons[0].title, 'Edited title');
  });
});
