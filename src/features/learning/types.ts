/** Shared by the learning record and challenge content (kept separate so neither imports the other's module). */

export type SkillArea = 'anticipating' | 'incentives' | 'coordination' | 'uncertainty';

/**
 * How fair it is to judge reasoning by the answer.
 * - `calculable`: the answer follows from what was on screen (a payoff table, a stated rule, an expected value).
 * - `uncertain`: it depended on something the learner couldn't know (a hidden rule, a crowd's mix). These are
 *   recorded, but never used to judge calibration or skill.
 */
export type EvaluationBasis = 'calculable' | 'uncertain';
