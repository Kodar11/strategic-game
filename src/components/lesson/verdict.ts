/**
 * How a learner's answer relates to the model. Kept separate from "right/wrong" so feedback can say
 * an answer is defensible, or that the outcome depends on an assumption the model makes.
 *
 * - `match`         agrees with what the model predicts or shows.
 * - `defensible`    a reasonable line of thought that misses or adds something.
 * - `misconception` a common but mistaken reading of the situation.
 * - `depends`       the answer turns on an assumption outside (or at the edge of) the model.
 */
export type Verdict = 'match' | 'defensible' | 'misconception' | 'depends';

export interface Feedback {
  verdict: Verdict;
  text: string;
}
