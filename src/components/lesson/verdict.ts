/**
 * How a learner's answer relates to the model. Kept separate from "right/wrong" so feedback can say
 * an answer is defensible, or that the outcome depends on an assumption the model makes.
 *
 * - `match`         agrees with what the model predicts or shows.
 * - `defensible`    a reasonable line of thought that misses or adds something.
 * - `misconception` a common but mistaken reading of the situation.
 * - `depends`       the answer turns on an assumption outside (or at the edge of) the model.
 * - `reasonable`    a sensible prediction about something the learner had no way to know yet (another player's
 *                   hidden rule, a crowd's mix); the outcome went another way. Not evidence of a reasoning error.
 */
export type Verdict = 'match' | 'defensible' | 'misconception' | 'depends' | 'reasonable';

export interface Feedback {
  verdict: Verdict;
  text: string;
}
