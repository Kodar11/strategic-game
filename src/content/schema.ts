import { z } from 'zod';

import type { CharacterId, Expression } from '../components/characters/cast.ts';
import type { Verdict } from '../components/lesson/verdict.ts';

/**
 * The content document: every lesson, scenario, challenge and assessment as plain, validated data. It has one shape
 * wherever it appears — the repository seed (`supabase/seed/content.json`), the `get_published_content()` response
 * and the app's catalog input — so the same schema checks all three. Executable behaviour (game rules, lab
 * calculations, solvers) is never part of it; `build.ts` joins this data with the registered engines.
 *
 * Objects are strict: an unknown field is an error rather than silently ignored, so a typo in an edited row is caught.
 */

export const CONTENT_FORMAT = 'strategic-game-content';
/** Bump when the document's shape changes; the database function and the app must agree on it. */
export const CONTENT_SCHEMA_VERSION = 1;

const id = z.string().min(1).max(80);
const text = z.string().min(1).max(4000);
const revision = z.number().int().positive();
const position = z.number().int().nonnegative();

export const CHARACTER_IDS = ['aarav', 'maya', 'rohan', 'meera', 'sen', 'kavya', 'arjun', 'nina'] as const satisfies readonly CharacterId[];
export const EXPRESSIONS = [
  'neutral',
  'curious',
  'thinking',
  'surprised',
  'happy',
  'confused',
  'confident',
  'frustrated',
  'concerned',
  'skeptical',
  'explaining',
  'satisfied',
] as const satisfies readonly Expression[];
export const VERDICTS = ['match', 'defensible', 'misconception', 'depends', 'reasonable'] as const satisfies readonly Verdict[];
export const SKILL_IDS = ['anticipating', 'incentives', 'coordination', 'uncertainty'] as const;
export const BASES = ['calculable', 'uncertain'] as const;
export const MODULE_IDS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'] as const;
export const SCENES = ['market', 'crowd', 'meetup', 'shootout', 'policy'] as const;
export const ACCENTS = ['blue', 'orange', 'cyan', 'amber'] as const;
export const TONES = ['neutral', 'blue', 'orange', 'amber'] as const;

const character = z.enum(CHARACTER_IDS);
const verdict = z.enum(VERDICTS);
const skill = z.enum(SKILL_IDS);
const basis = z.enum(BASES);
const labels = z.record(z.string(), z.string());

// ── Game structures (shared by scenario visuals and labs) ────────────────────

export const matrixGameSchema = z
  .strictObject({
    rows: z.array(id).min(1),
    cols: z.array(id).min(1),
    payoffs: z.array(z.array(z.tuple([z.number(), z.number()]))),
  })
  .refine((g) => g.payoffs.length === g.rows.length && g.payoffs.every((r) => r.length === g.cols.length), 'payoffs must be rows × cols');

type TreeNodeInput =
  | { kind: 'leaf'; id: string; payoffs: number[]; label?: string }
  | { kind: 'decision'; id: string; player: number; label?: string; actions: { id: string; label: string; child: TreeNodeInput }[] };

const treeNodeSchema: z.ZodType<TreeNodeInput> = z.lazy(() =>
  z.union([
    z.strictObject({ kind: z.literal('leaf'), id, payoffs: z.array(z.number()), label: z.string().optional() }),
    z.strictObject({
      kind: z.literal('decision'),
      id,
      player: z.number().int().nonnegative(),
      label: z.string().optional(),
      actions: z.array(z.strictObject({ id, label: z.string(), child: treeNodeSchema })).min(1),
    }),
  ]),
);

export const gameTreeSchema = z.strictObject({ players: z.array(z.string()).min(1), root: treeNodeSchema });

// ── Catalog metadata ─────────────────────────────────────────────────────────

export const moduleSchema = z.strictObject({ id: z.enum(MODULE_IDS), position, number: z.number().int().positive(), title: text, objective: text, revision });

export const lessonSchema = z.strictObject({
  id,
  position,
  number: z.number().int().positive(),
  module: z.enum(MODULE_IDS),
  title: text,
  concept: text,
  description: text,
  minutes: z.number().int().positive(),
  scene: z.enum(SCENES),
  accent: z.enum(ACCENTS),
  revision,
});

export const skillSchema = z.strictObject({ id: skill, position, label: text, description: text, lesson: id, revision });
export const goalSchema = z.strictObject({ id: z.enum([...SKILL_IDS, 'none']), position, label: text, revision });
export const lessonPredictionSchema = z.strictObject({ id, position, lesson: id, skill, basis, question: text, revision });

// ── Curriculum lessons and labs ──────────────────────────────────────────────

const line = z.strictObject({ character, expression: z.enum(EXPRESSIONS).optional(), text, align: z.enum(['left', 'right']).optional() });

export const curriculumSpecSchema = z.strictObject({
  lesson: id,
  revision,
  spec: z.strictObject({
    intro: z.strictObject({ kicker: z.string().optional(), title: text, body: text, lines: z.array(line) }),
    question: text,
    objectives: z.array(text),
    concept: z.strictObject({
      title: text,
      line,
      panels: z.array(z.strictObject({ tone: z.enum(['insight', 'info', 'caution']), title: text, body: text })),
    }),
    transfer: z.strictObject({
      question: text,
      options: z.array(z.strictObject({ id, label: text, feedback: text, verdict: z.enum(['strong', 'defensible', 'misconception']) })).min(2),
      analogy: z.strictObject({ holds: text, differs: text }),
    }),
    completion: z.strictObject({ takeaway: text, remember: z.array(text), reflection: text, nextHook: text }),
  }),
});

const labSlider = z.strictObject({ id, label: text, min: z.number(), max: z.number(), step: z.number().positive(), initial: z.number(), unit: z.enum(['%', '']).optional() });

export const labSchema = z.strictObject({
  lesson: id,
  revision,
  spec: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('matrix'), prompt: text, game: matrixGameSchema, rowName: text, colName: text, rowLabels: labels, colLabels: labels, eliminate: z.boolean().optional() }),
    z.strictObject({ kind: z.literal('tree'), prompt: text, tree: gameTreeSchema }),
    /** The slider layout is content; the calculation behind it is a registered lab engine. */
    z.strictObject({ kind: z.literal('param'), prompt: text, sliders: z.array(labSlider).min(1) }),
    z.strictObject({
      kind: z.literal('reveal'),
      prompt: text,
      cards: z.array(z.strictObject({ title: text, body: text, guess: z.strictObject({ question: text, options: z.array(z.string()).min(2), answer: z.string() }).optional() })).min(1),
    }),
  ]),
});

// ── Scenarios ────────────────────────────────────────────────────────────────

const optionWithVerdict = z.strictObject({ id: z.string().min(1).max(40), label: text, verdict, feedback: text });

export const scenarioVisualSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('matrix'), game: matrixGameSchema, rowName: text, colName: text, rowLabels: labels, colLabels: labels }),
  z.strictObject({ kind: z.literal('tree'), tree: gameTreeSchema, actionLabels: labels.optional() }),
  z.strictObject({ kind: z.literal('table'), caption: z.string().optional(), head: z.array(z.string()), rows: z.array(z.array(z.string())) }),
]);

export const scenarioSchema = z.strictObject({
  id,
  lesson: id,
  slot: z.enum(['A', 'B', 'C']),
  /** Semantic version: must equal the registered engine's version, and is recorded with every run and attempt. */
  version: z.number().int().positive(),
  revision,
  title: text,
  purpose: text,
  setup: text,
  speaker: z.strictObject({ character, line: text }).optional(),
  rules: z.array(text).min(1),
  formal: z.strictObject({
    players: text,
    actions: text,
    timing: text,
    information: text,
    payoffs: text,
    opponent: text.optional(),
    chance: text.optional(),
    ties: text.optional(),
    solution: text,
    source: z.enum(['canonical', 'adapted', 'original']),
    sourceNote: text,
  }),
  visual: scenarioVisualSchema.optional(),
  predict: z.strictObject({ question: text, basis, modelAnswer: text, options: z.array(optionWithVerdict).min(2) }),
  explain: z.array(text).min(1),
  takeaway: text,
  skill,
  explore: z.union([z.literal(false), z.strictObject({ stat: z.string().optional(), values: z.array(z.number()).optional(), expected: z.boolean().optional() })]).optional(),
});

// ── Practice challenges ──────────────────────────────────────────────────────

export const challengeSchema = z.strictObject({
  id,
  /** Catalog order (the original listing order, which some profile rules follow). */
  position,
  lesson: id,
  order: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  version: z.number().int().positive(),
  revision,
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: text,
  scenario: text,
  question: text,
  options: z.array(optionWithVerdict).min(2),
  skill,
  concept: text,
  takeaway: text,
  basis,
});

export const conceptReviewSchema = z.strictObject({ lesson: id, concept: text, summary: text, revision });

// ── Assessments ──────────────────────────────────────────────────────────────

export const assessmentSchema = z.strictObject({
  id: z.enum([...MODULE_IDS, 'final']),
  position,
  version: z.number().int().positive(),
  revision,
  title: text,
  intro: text,
  case: text.optional(),
  passMark: z.number().gt(0).lte(1),
  reflection: z.strictObject({ prompt: text, rubric: z.array(text).min(1) }).optional(),
  items: z
    .array(
      z.strictObject({
        id,
        lesson: id,
        situation: text.optional(),
        table: z.strictObject({ head: z.array(z.string()), rows: z.array(z.array(z.string())) }).optional(),
        question: text,
        multi: z.boolean().optional(),
        options: z.array(optionWithVerdict).min(2),
        explanation: text,
      }),
    )
    .min(1),
});

// ── The document ─────────────────────────────────────────────────────────────

export const contentDocumentSchema = z.strictObject({
  format: z.literal(CONTENT_FORMAT),
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  modules: z.array(moduleSchema),
  lessons: z.array(lessonSchema),
  skills: z.array(skillSchema),
  goals: z.array(goalSchema),
  lessonPredictions: z.array(lessonPredictionSchema),
  curriculumSpecs: z.array(curriculumSpecSchema),
  labs: z.array(labSchema),
  scenarios: z.array(scenarioSchema),
  challenges: z.array(challengeSchema),
  conceptReviews: z.array(conceptReviewSchema),
  assessments: z.array(assessmentSchema),
});

export type ContentDocument = z.infer<typeof contentDocumentSchema>;
export type ScenarioContent = z.infer<typeof scenarioSchema>;
export type LabContent = z.infer<typeof labSchema>['spec'];

/** Readable messages for a failed parse: `scenarios[3].predict.options: …`. */
export function describeIssues(error: z.ZodError, limit = 20): string[] {
  return error.issues.slice(0, limit).map((i) => `${i.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('').replace(/^\./, '') || '(root)'}: ${i.message}`);
}
