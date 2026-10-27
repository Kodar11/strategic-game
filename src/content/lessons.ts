import { z } from 'zod';

/**
 * The 22-lesson curriculum. IDs are stable (they appear in saved progress and exported learning data), so they
 * never change meaning: the five original lessons keep their original IDs even where the curriculum moved them.
 * In particular `strategy-detective` is the Two-Thirds-Average lesson (now Lesson 14, "Reasoning from Beliefs"),
 * and the curriculum's Lesson 2 "Strategy Detective" (dominance) is the new `iterated-dominance`.
 */
export const LESSON_IDS = [
  'cooperation-trap',
  'iterated-dominance',
  'best-response',
  'coordination-problem',
  'predictability-trap',
  'market-competition',
  'evolution',
  'sequential-moves',
  'credibility',
  'incentive-shift',
  'bargaining',
  'war-of-attrition',
  'repeated-cooperation',
  'strategy-detective',
  'bayesian-uncertainty',
  'signaling',
  'auctions',
  'market-quality',
  'coalitions',
  'voting',
  'brinkmanship',
  'strategic-practice',
] as const;

export const lessonIdSchema = z.enum(LESSON_IDS);
export type LessonId = z.infer<typeof lessonIdSchema>;

export type SceneId = 'market' | 'crowd' | 'meetup' | 'shootout' | 'policy';

export type ModuleId = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6';

export interface ModuleMeta {
  id: ModuleId;
  number: number;
  title: string;
  objective: string;
}

export const MODULES: readonly ModuleMeta[] = [
  { id: 'm1', number: 1, title: 'Foundations: How to Think Strategically', objective: 'Understand incentives, represent strategic situations, and reason about stable outcomes.' },
  { id: 'm2', number: 2, title: 'Coordination, Competition, and Unpredictability', objective: 'Understand coordination, strategic randomization, market competition, and evolutionary stability.' },
  { id: 'm3', number: 3, title: 'Timing, Commitment, and Incentives', objective: 'Understand sequential decisions, credible commitments, and how incentive systems affect behavior.' },
  { id: 'm4', number: 4, title: 'Bargaining, Waiting, and Repeated Interaction', objective: 'Understand bargaining, delay, costly conflict, reputation, and future incentives.' },
  { id: 'm5', number: 5, title: 'Information, Beliefs, and Strategic Choice', objective: 'Understand rationalizability, uncertainty, signaling, auctions, and market-level effects of private information.' },
  { id: 'm6', number: 6, title: 'Collective Power, Conflict, and Transfer', objective: 'Apply strategic reasoning to groups, voting, escalation, and unfamiliar problems.' },
];

export interface LessonMeta {
  id: LessonId;
  number: number;
  module: ModuleId;
  title: string;
  concept: string;
  description: string;
  minutes: number;
  scene: SceneId;
  accent: 'blue' | 'orange' | 'cyan' | 'amber';
}

export const LESSONS: readonly LessonMeta[] = [
  // ── Module 1 ──
  { id: 'cooperation-trap', number: 1, module: 'm1', title: 'The Cooperation Trap', concept: 'Prisoner’s Dilemma', description: 'Why sensible individual choices can leave everyone worse off.', minutes: 9, scene: 'market', accent: 'orange' },
  { id: 'iterated-dominance', number: 2, module: 'm1', title: 'Strategy Detective', concept: 'Dominance', description: 'Read a payoff table and rule out the moves nobody should make.', minutes: 8, scene: 'crowd', accent: 'cyan' },
  { id: 'best-response', number: 3, module: 'm1', title: 'Finding the Best Move', concept: 'Nash equilibrium', description: 'Best replies, and the outcomes nobody wants to leave alone.', minutes: 8, scene: 'market', accent: 'blue' },
  // ── Module 2 ──
  { id: 'coordination-problem', number: 4, module: 'm2', title: 'The Coordination Problem', concept: 'Multiple equilibria', description: 'How shared expectations help people find each other.', minutes: 8, scene: 'meetup', accent: 'amber' },
  { id: 'predictability-trap', number: 5, module: 'm2', title: 'The Predictability Trap', concept: 'Mixed strategies', description: 'Patterns can be read. Sometimes unpredictability is the strategy.', minutes: 9, scene: 'shootout', accent: 'blue' },
  { id: 'market-competition', number: 6, module: 'm2', title: 'Competing for Advantage', concept: 'Cournot & Bertrand', description: 'Quantities, prices and positions — every move changes your rival’s best reply.', minutes: 8, scene: 'market', accent: 'orange' },
  { id: 'evolution', number: 7, module: 'm2', title: 'Rules of Evolution', concept: 'Evolutionary stability', description: 'Strategies that spread, strategies that fade, and the mixes that last.', minutes: 8, scene: 'crowd', accent: 'cyan' },
  // ── Module 3 ──
  { id: 'sequential-moves', number: 8, module: 'm3', title: 'Move First, Win More', concept: 'Backward induction', description: 'When the other side sees your move, think from the end.', minutes: 8, scene: 'market', accent: 'blue' },
  { id: 'credibility', number: 9, module: 'm3', title: 'Threats and Credibility', concept: 'Credible commitment', description: 'A threat only works if carrying it out would make sense.', minutes: 8, scene: 'market', accent: 'orange' },
  { id: 'incentive-shift', number: 10, module: 'm3', title: 'Incentives and Hidden Actions', concept: 'Incentive design', description: 'Change the rules, and the best move changes with them — even when effort is hidden.', minutes: 10, scene: 'policy', accent: 'orange' },
  // ── Module 4 ──
  { id: 'bargaining', number: 11, module: 'm4', title: 'Bargaining and Fairness', concept: 'Ultimatum & alternating offers', description: 'Who gets what depends on what happens if talks fail.', minutes: 8, scene: 'policy', accent: 'amber' },
  { id: 'war-of-attrition', number: 12, module: 'm4', title: 'The Cost of Waiting', concept: 'War of attrition', description: 'Both sides pay while they wait for the other to quit.', minutes: 8, scene: 'shootout', accent: 'orange' },
  { id: 'repeated-cooperation', number: 13, module: 'm4', title: 'Cooperation Over Time', concept: 'Repeated games', description: 'The shadow of the future can make cooperation pay — under the right conditions.', minutes: 9, scene: 'meetup', accent: 'blue' },
  // ── Module 5 ──
  { id: 'strategy-detective', number: 14, module: 'm5', title: 'Reasoning from Beliefs', concept: 'Rationalizability', description: 'Your best move depends on how deeply others think.', minutes: 10, scene: 'crowd', accent: 'cyan' },
  { id: 'bayesian-uncertainty', number: 15, module: 'm5', title: 'Decisions Under Uncertainty', concept: 'Bayesian reasoning', description: 'Hidden types, priors, evidence — and when information is worth buying.', minutes: 8, scene: 'policy', accent: 'cyan' },
  { id: 'signaling', number: 16, module: 'm5', title: 'Signals and Secrets', concept: 'Signaling & screening', description: 'Why a costly signal can say what words cannot.', minutes: 8, scene: 'policy', accent: 'amber' },
  { id: 'auctions', number: 17, module: 'm5', title: 'Winning the Auction', concept: 'Auction formats', description: 'The rules decide how to bid — and winning can be bad news.', minutes: 8, scene: 'market', accent: 'orange' },
  { id: 'market-quality', number: 18, module: 'm5', title: 'Signals, Imitation and Market Quality', concept: 'Pooling & adverse selection', description: 'When signals stop meaning anything, markets change shape.', minutes: 8, scene: 'market', accent: 'amber' },
  // ── Module 6 ──
  { id: 'coalitions', number: 19, module: 'm6', title: 'Coalitions and Power', concept: 'The core', description: 'A deal everyone accepted can still fall apart.', minutes: 8, scene: 'crowd', accent: 'blue' },
  { id: 'voting', number: 20, module: 'm6', title: 'The Politics of Voting', concept: 'Strategic voting', description: 'The rules and the order of votes can decide the winner.', minutes: 8, scene: 'crowd', accent: 'cyan' },
  { id: 'brinkmanship', number: 21, module: 'm6', title: 'Brinkmanship and Escalation', concept: 'Chicken & strategic risk', description: 'Creating risk on purpose — and when it backfires.', minutes: 8, scene: 'shootout', accent: 'orange' },
  { id: 'strategic-practice', number: 22, module: 'm6', title: 'Strategic Thinking in Practice', concept: 'Synthesis', description: 'Unfamiliar situations. No hints about which idea applies.', minutes: 10, scene: 'policy', accent: 'amber' },
];

export function getLesson(id: string | undefined): LessonMeta | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function nextLesson(id: LessonId): LessonMeta | undefined {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? LESSONS[i + 1] : undefined;
}

export function lessonsInModule(module: ModuleId): LessonMeta[] {
  return LESSONS.filter((l) => l.module === module);
}

export function getModule(id: ModuleId): ModuleMeta {
  return MODULES.find((m) => m.id === id)!;
}
