import type { ComponentType } from 'react';

import type { LessonId, LessonMeta } from '@/src/content/lessons';
import CooperationTrap from './cooperation-trap/CooperationTrap';
import CoordinationProblem from './coordination-problem/CoordinationProblem';
import IncentiveShift from './incentive-shift/IncentiveShift';
import PredictabilityTrap from './predictability-trap/PredictabilityTrap';
import StrategyDetective from './strategy-detective/StrategyDetective';

/** Each lesson is its own component with its own gameplay; they only share the shell and UI kit. */
export const LESSON_COMPONENTS: Record<LessonId, ComponentType<{ lesson: LessonMeta }>> = {
  'cooperation-trap': CooperationTrap,
  'strategy-detective': StrategyDetective,
  'coordination-problem': CoordinationProblem,
  'predictability-trap': PredictabilityTrap,
  'incentive-shift': IncentiveShift,
};
