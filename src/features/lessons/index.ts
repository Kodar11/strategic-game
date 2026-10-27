import type { ComponentType } from 'react';

import type { LessonId, LessonMeta } from '@/src/content/lessons';
import CooperationTrap from './cooperation-trap/CooperationTrap';
import CoordinationProblem from './coordination-problem/CoordinationProblem';
import CurriculumLesson from './curriculum/CurriculumLesson';
import IncentiveShift from './incentive-shift/IncentiveShift';
import PredictabilityTrap from './predictability-trap/PredictabilityTrap';
import StrategyDetective from './strategy-detective/StrategyDetective';

/**
 * The five original lessons keep their own components (each adds its paired scenarios before completion).
 * The other seventeen share the curriculum runner, driven by `curriculum/specs.ts`, `curriculum/labs.ts` and the
 * scenario specs.
 */
export const LESSON_COMPONENTS: Record<LessonId, ComponentType<{ lesson: LessonMeta }>> = {
  'cooperation-trap': CooperationTrap,
  'iterated-dominance': CurriculumLesson,
  'best-response': CurriculumLesson,
  'coordination-problem': CoordinationProblem,
  'predictability-trap': PredictabilityTrap,
  'market-competition': CurriculumLesson,
  evolution: CurriculumLesson,
  'sequential-moves': CurriculumLesson,
  credibility: CurriculumLesson,
  'incentive-shift': IncentiveShift,
  bargaining: CurriculumLesson,
  'war-of-attrition': CurriculumLesson,
  'repeated-cooperation': CurriculumLesson,
  'strategy-detective': StrategyDetective,
  'bayesian-uncertainty': CurriculumLesson,
  signaling: CurriculumLesson,
  auctions: CurriculumLesson,
  'market-quality': CurriculumLesson,
  coalitions: CurriculumLesson,
  voting: CurriculumLesson,
  brinkmanship: CurriculumLesson,
  'strategic-practice': CurriculumLesson,
};
