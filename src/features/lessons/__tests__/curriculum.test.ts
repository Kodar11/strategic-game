import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { LESSONS, LESSON_IDS, MODULES } from '../../../content/lessons.ts';
import { blockingCoalitions, majorityWinner, shapley, sincereAgenda, sophisticatedAgenda } from '../../../game/collective.ts';
import { iteratedStrictDominance, rowWeaklyDominatedBy, colWeaklyDominatedBy, subGame, type MatrixGame } from '../../../game/payoff-matrix.ts';
import { backwardInduction, equilibriumPath } from '../../../game/sequential.ts';
import { posterior } from '../../../game/information.ts';
import { shrinkingPieShare } from '../../../game/bargaining.ts';
import { attritionLab, auctionLab, bayesLab, bargainingLab, coreLab, cournotLab, hawkDoveLab, LABS, lemonsLab, repeatedLab, signalingLab, brinkLab } from '../curriculum/labs.ts';
import { CURRICULUM_LESSONS } from '../curriculum/specs.ts';
import { CAPACITY, CENTIPEDE, STACKELBERG } from '../../scenarios/content/module3.ts';
import { AGENDAS, COMMITTEE, PROJECT } from '../../scenarios/content/module6.ts';
import { VALUE_WITH_REPORT, VALUE_WITHOUT_REPORT } from '../../scenarios/content/module5.ts';

const ORIGINAL = ['cooperation-trap', 'coordination-problem', 'predictability-trap', 'incentive-shift', 'strategy-detective'];
const ROOT = path.resolve(import.meta.dirname, '../../../..');

describe('Curriculum — the approved 22 lessons', () => {
  it('lists exactly the approved titles, in order, in six modules', () => {
    assert.deepEqual(
      LESSONS.map((l) => `${l.number}. ${l.title}`),
      [
        '1. The Cooperation Trap',
        '2. Strategy Detective',
        '3. Finding the Best Move',
        '4. The Coordination Problem',
        '5. The Predictability Trap',
        '6. Competing for Advantage',
        '7. Rules of Evolution',
        '8. Move First, Win More',
        '9. Threats and Credibility',
        '10. Incentives and Hidden Actions',
        '11. Bargaining and Fairness',
        '12. The Cost of Waiting',
        '13. Cooperation Over Time',
        '14. Reasoning from Beliefs',
        '15. Decisions Under Uncertainty',
        '16. Signals and Secrets',
        '17. Winning the Auction',
        '18. Signals, Imitation and Market Quality',
        '19. Coalitions and Power',
        '20. The Politics of Voting',
        '21. Brinkmanship and Escalation',
        '22. Strategic Thinking in Practice',
      ],
    );
    assert.deepEqual(LESSONS.map((l) => l.module), ['m1', 'm1', 'm1', 'm2', 'm2', 'm2', 'm2', 'm3', 'm3', 'm3', 'm4', 'm4', 'm4', 'm5', 'm5', 'm5', 'm5', 'm5', 'm6', 'm6', 'm6', 'm6']);
    assert.equal(MODULES.length, 6);
    assert.deepEqual([...LESSON_IDS], LESSONS.map((l) => l.id));
  });

  it('keeps the original lesson IDs, so saved progress and exported records keep their meaning', () => {
    for (const id of ORIGINAL) assert.ok(LESSON_IDS.includes(id as never), id);
  });

  it('every new lesson has its content, its lab and a valid transfer check', () => {
    for (const l of LESSONS.filter((x) => !ORIGINAL.includes(x.id))) {
      const spec = CURRICULUM_LESSONS[l.id];
      assert.ok(spec, `${l.id} spec`);
      assert.ok(LABS[l.id], `${l.id} lab`);
      assert.equal(spec!.objectives.length, 3, l.id);
      assert.equal(spec!.transfer.options.filter((o) => o.verdict === 'strong').length, 1, `${l.id}: one strongest answer`);
      assert.ok(spec!.transfer.options.filter((o) => o.verdict !== 'strong').length >= 2, `${l.id}: real alternatives`);
      assert.ok(spec!.completion.remember.length >= 3, l.id);
    }
    assert.equal(Object.keys(CURRICULUM_LESSONS).length, 17);
  });

  it('the shared runner declares as many steps as it renders', () => {
    const src = readFileSync(path.join(ROOT, 'src/features/lessons/curriculum/CurriculumLesson.tsx'), 'utf8').replace(/\r\n/g, '\n');
    const total = Number(/const TOTAL = (\d+);/.exec(src)?.[1]);
    const keys = src.match(/^ {6}key: '[a-z0-9-]+',$/gm) ?? [];
    const scenarioSteps = src.match(/^ {4}scenarioStep\(/gm) ?? [];
    assert.equal(keys.length + scenarioSteps.length, total);
    assert.equal(scenarioSteps.length, 3);
  });
});

describe('Labs compute from the engine', () => {
  it('Cournot: best reply (12 − q)/2, equilibrium at 4', () => {
    assert.equal(cournotLab(4).stats[0].value, '4 units');
    assert.equal(cournotLab(0).stats[0].value, '6 units');
  });
  it('Hawk–Dove: settles at V/C, or all hawks when V ≥ C', () => {
    assert.equal(hawkDoveLab(4, 6, 0.2).stats[0].value, '66.7%');
    assert.equal(hawkDoveLab(8, 6, 0.2).stats[1].value, '100%');
  });
  it('bargaining: one round is an ultimatum; 3 rounds at 60% keep 76%', () => {
    assert.equal(shrinkingPieShare(0.6, 1), 1);
    assert.ok(Math.abs(shrinkingPieShare(0.6, 3) - (1 - 0.6 + 0.36)) < 1e-9);
    assert.equal(bargainingLab(0.6, 3).stats[0].value, '76.0%');
  });
  it('attrition: stay iff q × prize > cost', () => {
    assert.match(attritionLab(6, 1, 0.25).lines[0], /^Stay in/);
    assert.match(attritionLab(3, 1, 0.25).lines[0], /^Quit now/);
  });
  it('repeated: cooperation needs δ ≥ 50%, and a detection delay can break it', () => {
    assert.match(repeatedLab(0.6, 0).lines[0], /sustainable/);
    assert.match(repeatedLab(0.4, 0).lines[0], /Cheating pays/);
    assert.match(repeatedLab(0.7, 2).lines[0], /Cheating pays/);
  });
  it('Bayes: 10% prior, 70% vs 20% likelihoods → 28%', () => {
    assert.equal(bayesLab(0.1, 0.7, 0.2).stats[1].value, '28.0%');
    assert.ok(Math.abs(posterior([0.01, 0.99], [0.9, 0.05])[0] - 0.1538) < 0.001);
  });
  it('signalling: separates only when low types lose by copying', () => {
    assert.match(signalingLab(2, 7).lines[0], /^Separating/);
    assert.match(signalingLab(2, 3).lines[0], /^Low types would copy/);
  });
  it('auctions, lemons, core and brinkmanship labs produce finite numbers', () => {
    for (const out of [auctionLab(60), lemonsLab(1.5, 60), coreLab(35, 30), coreLab(80, 20), brinkLab(0.05, 0.35)]) {
      for (const s of out.stats) assert.ok(!/NaN|Infinity|undefined/.test(s.value), s.label);
    }
    assert.match(coreLab(35, 30).lines[0], /In the core/);
    assert.match(lemonsLab(1.5, 60).lines[0], /up to 30/);
  });
});

describe('Numbers quoted in lesson and scenario text', () => {
  it('Lesson 2: weak-dominance deletion order changes the result (2 vs 1 for the row player)', () => {
    const g: MatrixGame = { rows: ['T', 'M', 'B'], cols: ['L', 'R'], payoffs: [[[1, 1], [0, 0]], [[1, 1], [2, 1]], [[0, 0], [2, 1]]] };
    assert.ok(rowWeaklyDominatedBy(g, 'T', 'M') && rowWeaklyDominatedBy(g, 'B', 'M'));
    // Order 1: delete T first → R weakly dominates L → row gets 2.
    const g1 = subGame(g, ['M', 'B'], ['L', 'R']);
    assert.ok(colWeaklyDominatedBy(g1, 'L', 'R'));
    // Order 2: delete B first → L weakly dominates R → row gets 1.
    const g2 = subGame(g, ['T', 'M'], ['L', 'R']);
    assert.ok(colWeaklyDominatedBy(g2, 'R', 'L'));
    // Strict dominance removes nothing here, so the strict procedure can't produce the ambiguity.
    assert.equal(iteratedStrictDominance(g).steps.length, 0);
  });

  it('Lesson 8: Stackelberg leader makes 6 and earns 18 (vs 16 simultaneously); centipede unravels to “take”', () => {
    const sol = backwardInduction(STACKELBERG);
    assert.deepEqual(equilibriumPath(STACKELBERG, sol), ['q6', 'r3']);
    assert.equal(sol.value.leader[0], 18);
    assert.deepEqual(equilibriumPath(CENTIPEDE), ['take1']);
  });

  it('Lesson 9: capacity makes fighting credible and is worth 7 vs 5', () => {
    const sol = backwardInduction(CAPACITY);
    assert.equal(sol.choice.invest, 'invest');
    // Node ids: e1 follows the investment, e0 doesn't.
    assert.equal(sol.value.e1[0], 7);
    assert.equal(sol.value.e0[0], 5);
    assert.equal(sol.choice.r1, 'fight1');
    assert.equal(sol.choice.r0, 'acc0');
  });

  it('Lesson 15: the report is worth 2.56 vs 2 (≈ 0.56)', () => {
    assert.ok(Math.abs(VALUE_WITH_REPORT - 2.56) < 1e-9);
    assert.ok(Math.abs(VALUE_WITHOUT_REPORT - 2) < 1e-9);
  });

  it('Lesson 19: Shapley value (35, 30, 25) is in the core; (20, 35, 35) is blocked by A+B', () => {
    const sh = shapley(PROJECT, ['A', 'B', 'C']);
    assert.deepEqual([sh.A, sh.B, sh.C].map((x) => Math.round(x * 1000) / 1000), [35, 30, 25]);
    assert.deepEqual(blockingCoalitions(PROJECT, ['A', 'B', 'C'], { A: 20, B: 35, C: 35 }).map((b) => b.coalition.join('')), ['AB']);
  });

  it('Lesson 20: majorities cycle; each agenda yields a different winner; sophisticated voting under B–C first gives C', () => {
    assert.equal(majorityWinner(COMMITTEE, 'A', 'B'), 'A');
    assert.equal(majorityWinner(COMMITTEE, 'B', 'C'), 'B');
    assert.equal(majorityWinner(COMMITTEE, 'C', 'A'), 'C');
    assert.deepEqual(Object.values(AGENDAS).map((a) => sincereAgenda(COMMITTEE, a)).sort(), ['A', 'B', 'C']);
    assert.equal(sophisticatedAgenda(COMMITTEE, AGENDAS.BC), 'C');
  });
});
