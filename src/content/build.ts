import type { Assessment } from '../features/assessments/content.ts';
import { ASSESSMENT_SOLVERS } from '../features/assessments/solvers.ts';
import type { Challenge } from '../features/challenges/content.ts';
import { PREDICTION_KEYS, type GoalId, type PredictionMeta, type SkillMeta } from '../features/learning/records.ts';
import { LAB_ENGINES, type LabSpec } from '../features/lessons/curriculum/labs.ts';
import type { CurriculumLessonSpec } from '../features/lessons/curriculum/specs.ts';
import { SCENARIO_ENGINES } from '../features/scenarios/engines/index.ts';
import type { ScenarioEngine, ScenarioSpec } from '../features/scenarios/types.ts';
import type { Catalog } from './catalog.ts';
import { LESSON_IDS, ORIGINAL_LESSON_IDS, type LessonId, type LessonMeta } from './lessons.ts';
import { type ContentDocument, SKILL_IDS, contentDocumentSchema, describeIssues } from './schema.ts';

/**
 * Turn a content document (from the database, or the repository seed in tests) into the app's catalog. Either every
 * check passes and the catalog is complete, or the problems are listed — content is never partially loaded and never
 * silently replaced, because a lesson missing one scenario, or a scenario whose text no engine implements, would
 * behave wrongly in ways the learner can't see.
 *
 * Checks, beyond the document schema:
 * - every lesson has a registered implementation; every curriculum lesson has its spec and lab
 * - every scenario has an engine of the same id and version, and shows exactly the matrix or tree that engine plays
 * - every parameter lab has a registered calculation reading exactly its sliders
 * - references (lessons, skills, modules) resolve, ids are unique, each lesson has scenarios A, B and C
 * - grading rules: calculable items have a matching option; uncertain challenges have none; one strong transfer answer
 */

export type BuildResult = { ok: true; catalog: Catalog } | { ok: false; problems: string[] };

/** JSON with object keys sorted: the database returns jsonb keys in its own order, and absent ≡ undefined. */
function json(x: unknown): string {
  return JSON.stringify(x, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
}

export function buildCatalog(raw: unknown, engines: readonly ScenarioEngine[] = SCENARIO_ENGINES): BuildResult {
  const parsed = contentDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: describeIssues(parsed.error) };
  const doc: ContentDocument = parsed.data;
  const problems: string[] = [];
  const problem = (p: string) => problems.push(p);

  const lessonIds = new Set(doc.lessons.map((l) => l.id));
  const moduleIds = new Set(doc.modules.map((m) => m.id));
  const known = new Set<string>(LESSON_IDS);
  const needLesson = (where: string, id: string) => {
    if (!lessonIds.has(id)) problem(`${where} refers to lesson ${id}, which is not published`);
  };

  for (const [what, ids] of [
    ['module', doc.modules.map((m) => m.id)],
    ['lesson', doc.lessons.map((l) => l.id)],
    ['lesson number', doc.lessons.map((l) => String(l.number))],
    ['scenario', doc.scenarios.map((s) => s.id)],
    ['challenge', doc.challenges.map((c) => c.id)],
    ['assessment', doc.assessments.map((a) => a.id)],
    ['skill', doc.skills.map((s) => s.id)],
    ['goal', doc.goals.map((g) => g.id)],
    ['lesson prediction', doc.lessonPredictions.map((p) => p.id)],
    ['curriculum spec', doc.curriculumSpecs.map((s) => s.lesson)],
    ['lab', doc.labs.map((s) => s.lesson)],
    ['concept review', doc.conceptReviews.map((s) => s.lesson)],
  ] as const) {
    for (const d of duplicates(ids)) problem(`duplicate ${what} ${d}`);
  }

  // Lessons
  for (const l of doc.lessons) {
    if (!known.has(l.id)) problem(`lesson ${l.id} has no implementation in this app version`);
    if (!moduleIds.has(l.module)) problem(`lesson ${l.id} belongs to module ${l.module}, which is not published`);
  }
  const specFor = new Map(doc.curriculumSpecs.map((s) => [s.lesson, s]));
  const labFor = new Map(doc.labs.map((s) => [s.lesson, s]));
  for (const l of doc.lessons) {
    if ((ORIGINAL_LESSON_IDS as readonly string[]).includes(l.id)) continue;
    if (!specFor.has(l.id)) problem(`curriculum lesson ${l.id} has no curriculum spec`);
    if (!labFor.has(l.id)) problem(`curriculum lesson ${l.id} has no lab`);
  }
  for (const s of doc.curriculumSpecs) {
    needLesson(`curriculum spec ${s.lesson}`, s.lesson);
    if (s.spec.transfer.options.filter((o) => o.verdict === 'strong').length !== 1) problem(`curriculum spec ${s.lesson} needs exactly one strong transfer option`);
    for (const d of duplicates(s.spec.transfer.options.map((o) => o.id))) problem(`curriculum spec ${s.lesson} repeats transfer option ${d}`);
  }
  for (const s of doc.labs) {
    needLesson(`lab ${s.lesson}`, s.lesson);
    if (s.spec.kind === 'param') {
      const engine = LAB_ENGINES[s.lesson];
      if (!engine) problem(`lab ${s.lesson} is a parameter lab but no calculation is registered for it`);
      else if (json([...engine.sliders].sort()) !== json(s.spec.sliders.map((x) => x.id).sort()))
        problem(`lab ${s.lesson} has sliders ${s.spec.sliders.map((x) => x.id).join(', ')}; its calculation reads ${engine.sliders.join(', ')}`);
    }
  }

  // Skills, goals, lesson predictions
  for (const id of SKILL_IDS) if (!doc.skills.some((s) => s.id === id)) problem(`skill ${id} is missing`);
  for (const id of [...SKILL_IDS, 'none'] as const) if (!doc.goals.some((g) => g.id === id)) problem(`goal ${id} is missing`);
  for (const s of doc.skills) needLesson(`skill ${s.id}`, s.lesson);
  for (const p of doc.lessonPredictions) {
    if (!(PREDICTION_KEYS as readonly string[]).includes(p.id)) problem(`lesson prediction ${p.id} is not recorded by any lesson in this app version`);
    needLesson(`lesson prediction ${p.id}`, p.lesson);
  }
  for (const key of PREDICTION_KEYS) if (!doc.lessonPredictions.some((p) => p.id === key)) problem(`lesson prediction ${key} is missing`);

  // Scenarios
  const engineById = new Map(engines.map((e) => [e.id, e]));
  for (const s of doc.scenarios) {
    needLesson(`scenario ${s.id}`, s.lesson);
    const e = engineById.get(s.id);
    if (!e) problem(`scenario ${s.id} has no engine in this app version`);
    else if (e.version !== s.version) problem(`scenario ${s.id} is version ${s.version}; this app version plays version ${e.version}`);
    else {
      const shown = s.visual?.kind === 'matrix' ? s.visual.game : s.visual?.kind === 'tree' ? s.visual.tree : undefined;
      const played = e.visualGame ?? e.visualTree;
      if (played && shown === undefined) problem(`scenario ${s.id} must show the ${e.visualGame ? 'payoff matrix' : 'game tree'} its engine plays`);
      if (played && shown !== undefined && json(shown) !== json(played)) problem(`scenario ${s.id} shows a ${s.visual!.kind} that differs from the one its engine plays`);
      if (!played && (s.visual?.kind === 'matrix' || s.visual?.kind === 'tree')) problem(`scenario ${s.id} shows a ${s.visual.kind}, but its engine plays none`);
    }
    for (const d of duplicates(s.predict.options.map((o) => o.id))) problem(`scenario ${s.id} repeats option ${d}`);
    if (s.predict.basis === 'calculable' && !s.predict.options.some((o) => o.verdict === 'match')) problem(`scenario ${s.id} is calculable but no option is a match`);
  }
  for (const l of doc.lessons) {
    for (const slot of ['A', 'B', 'C'] as const) {
      const n = doc.scenarios.filter((s) => s.lesson === l.id && s.slot === slot).length;
      if (n !== 1) problem(`lesson ${l.id} has ${n} published scenario${n === 1 ? '' : 's'} in slot ${slot}; it needs exactly one`);
    }
  }

  // Challenges and reviews
  for (const c of doc.challenges) {
    needLesson(`challenge ${c.id}`, c.lesson);
    for (const d of duplicates(c.options.map((o) => o.id))) problem(`challenge ${c.id} repeats option ${d}`);
    const matches = c.options.filter((o) => o.verdict === 'match').length;
    if (c.basis === 'calculable' && !matches) problem(`challenge ${c.id} is calculable but no option is a match`);
    if (c.basis === 'uncertain' && matches) problem(`challenge ${c.id} is uncertain, so no option may be a match`);
  }
  for (const d of duplicates(doc.challenges.map((c) => `${c.lesson} #${c.order}`))) problem(`two challenges share position ${d}`);
  for (const r of doc.conceptReviews) needLesson(`concept review ${r.lesson}`, r.lesson);

  // Assessments
  for (const a of doc.assessments) {
    for (const d of duplicates(a.items.map((i) => i.id))) problem(`assessment ${a.id} repeats item ${d}`);
    for (const i of a.items) {
      needLesson(`assessment item ${a.id}/${i.id}`, i.lesson);
      for (const d of duplicates(i.options.map((o) => o.id))) problem(`assessment item ${a.id}/${i.id} repeats option ${d}`);
      if (!i.options.some((o) => o.verdict === 'match')) problem(`assessment item ${a.id}/${i.id} has no matching option`);
    }
  }

  if (problems.length) return { ok: false, problems };

  // Join content with engines. Fields that only steer publishing (revision, position) stay out of the app's types.
  const lessons: LessonMeta[] = doc.lessons.map(({ revision: _r, position: _p, ...l }) => ({ ...l, id: l.id as LessonId }));
  const scenarios: ScenarioSpec[] = doc.scenarios.map(({ revision: _r, ...s }) => {
    const e = engineById.get(s.id)!;
    return {
      ...s,
      lesson: s.lesson as LessonId,
      predict: { ...s.predict, ...(e.solve ? { solve: e.solve } : {}) },
      play: e.play,
      ...(e.testSeed !== undefined ? { testSeed: e.testSeed } : {}),
    };
  });
  const challenges: Challenge[] = doc.challenges.map(({ revision: _r, position: _p, ...c }) => ({ ...c, lesson: c.lesson as LessonId }));
  const assessments: Assessment[] = doc.assessments.map(({ revision: _r, position: _p, ...a }) => ({
    ...a,
    items: a.items.map((i) => {
      const solve = ASSESSMENT_SOLVERS[`${a.id}/${i.id}`];
      return { ...i, lesson: i.lesson as LessonId, ...(solve ? { solve } : {}) };
    }),
  }));
  const labs = new Map<LessonId, LabSpec>(
    doc.labs.map(({ lesson, spec }) => [lesson as LessonId, spec.kind === 'param' ? { ...spec, compute: LAB_ENGINES[lesson]!.compute } : spec]),
  );

  return {
    ok: true,
    catalog: {
      modules: doc.modules.map(({ revision: _r, position: _p, ...m }) => m),
      lessons,
      skills: doc.skills.map(({ revision: _r, position: _p, ...s }): SkillMeta => ({ ...s, lesson: s.lesson as LessonId })),
      goals: doc.goals.map(({ id, label }) => ({ id: id as GoalId, label })),
      lessonPredictions: new Map(doc.lessonPredictions.map(({ id, lesson, skill, basis, question }): [string, PredictionMeta] => [id, { lesson: lesson as LessonId, skill, basis, question }])),
      curriculum: new Map(doc.curriculumSpecs.map(({ lesson, spec }): [LessonId, CurriculumLessonSpec] => [lesson as LessonId, { id: lesson as LessonId, ...spec }])),
      labs,
      scenarios,
      scenarioById: new Map(scenarios.map((s) => [s.id, s])),
      challenges,
      challengeById: new Map(challenges.map((c) => [c.id, c])),
      conceptReviews: Object.fromEntries(doc.conceptReviews.map(({ lesson, concept, summary }) => [lesson, { concept, summary }])),
      assessments,
    },
  };
}
