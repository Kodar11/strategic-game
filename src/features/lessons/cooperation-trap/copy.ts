import type { Feedback, Verdict } from '../../../components/lesson/verdict.ts';
import { BASE_PRICING_GAME, type PriceAction, applyCutPenalty, cutAdvantage, regimeFor, type Regime } from '../../../game/incentives.ts';
import { payoffAt } from '../../../game/payoff-matrix.ts';

/**
 * Lesson 1 wording that depends on what the learner did. Pure functions of lesson state and the payoff
 * table, shared by the screen, the narration manifest and the tests — so feedback can't drift from the model.
 */

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Dr. Meera's explanation of the week's outcome. Shared by the lesson screen and the narration manifest,
 * so the spoken clip always says what the screen shows.
 */
export function explainOutcome(you: PriceAction, rival: PriceAction, [a, b]: readonly [number, number]): string {
  if (you === 'cut' && rival === 'cut') {
    const both = payoffAt(BASE_PRICING_GAME, 'maintain', 'maintain');
    return `You both cut. Neither gained customers from the other, but every order earned less. You each made ${a} — instead of the ${both[0]} you'd each have made by both maintaining.`;
  }
  if (you === 'maintain' && rival === 'cut') {
    return `Rohan undercut you. Price-sensitive customers like Kavya moved to FoodKart, so you made ${a} while FoodKart made ${b}.`;
  }
  if (you === 'cut' && rival === 'maintain') {
    return `You undercut FoodKart and won most of the orders: you made ${a}, FoodKart made ${b}.`;
  }
  return `Both kept prices. Customers split and margins held: ${a} each.`;
}

// ── Predicting Rohan ─────────────────────────────────────────────────────────

export type RivalReason = 'either' | 'grab' | 'mutual' | 'mirror';

/** Reasons offered for the prediction. Worded as the learner's own guesses, not as the lesson's answer. */
export const RIVAL_REASONS: readonly { id: RivalReason; label: string }[] = [
  { id: 'grab', label: 'Undercutting could win him my customers' },
  { id: 'mutual', label: 'Both keeping prices up is better for both of us' },
  { id: 'mirror', label: "He'll do whatever he expects me to do" },
  { id: 'either', label: 'One choice pays him more whatever I do' },
];

export function rivalReasonLabel(id: RivalReason): string {
  return RIVAL_REASONS.find((r) => r.id === id)?.label ?? id;
}

/** Comparison shown on the reveal: the predicted move against Rohan's actual move. */
export function predictionCheck(predicted: PriceAction, actual: PriceAction): Feedback {
  if (predicted === actual) {
    return {
      verdict: 'match',
      text: `You expected Rohan to ${actual}, and he did. Next you'll test whether that was luck or something in the numbers.`,
    };
  }
  return {
    verdict: 'misconception',
    text: `You expected Rohan to ${predicted}. He chose to ${actual}. Next you'll see what in the numbers pushed him there.`,
  };
}

/**
 * Feedback on the reason the learner gave, shown only after the best replies are revealed — so it can
 * point at evidence the learner has now seen rather than give the answer away early.
 */
export function reasonFeedback(reason: RivalReason): Feedback {
  const mm = payoffAt(BASE_PRICING_GAME, 'maintain', 'maintain');
  const mc = payoffAt(BASE_PRICING_GAME, 'maintain', 'cut');
  const cm = payoffAt(BASE_PRICING_GAME, 'cut', 'maintain');
  const cc = payoffAt(BASE_PRICING_GAME, 'cut', 'cut');
  switch (reason) {
    case 'either':
      return {
        verdict: 'match',
        text: `That's the dominant-strategy idea before it had a name: cutting pays FoodKart ${mc[1]} instead of ${mm[1]} if you maintain, and ${cc[1]} instead of ${cm[1]} if you cut.`,
      };
    case 'grab':
      return {
        verdict: 'defensible',
        text: `Half the story. Undercutting pays him if you maintain (${mc[1]} instead of ${mm[1]}). The other half: cutting also protects him if you cut (${cc[1]} instead of ${cm[1]}). So he cuts either way.`,
      };
    case 'mutual':
      return {
        verdict: 'misconception',
        text: `True for the pair — ${mm[0]} + ${mm[1]} beats ${cc[0]} + ${cc[1]}. But Rohan only counts FoodKart's profit, and from his seat cutting pays more whatever you do. That gap between "best for us" and "best for me" is the trap.`,
      };
    case 'mirror':
      return {
        verdict: 'misconception',
        text: "He can't see your choice — and he doesn't need to. His best reply is the same whatever you do, so there is nothing to mirror.",
      };
  }
}

// ── The promise ──────────────────────────────────────────────────────────────

/** Rohan offers to keep prices next week. What does the learner do if they believe him? */
export function promiseFeedback(pick: PriceAction): Feedback {
  const keep = payoffAt(BASE_PRICING_GAME, 'maintain', 'maintain')[0];
  const breakIt = payoffAt(BASE_PRICING_GAME, 'cut', 'maintain')[0];
  if (pick === 'cut') {
    return {
      verdict: 'match',
      text: `That's what the table rewards: if Rohan keeps his word, cutting earns you ${breakIt} instead of ${keep}. He faces exactly the same temptation — which is why the promise is fragile.`,
    };
  }
  return {
    verdict: 'depends',
    text: `Keeping your word earns ${keep} — if he keeps his. But breaking it would earn you ${breakIt}, and Rohan sees the same numbers. Trust, reputation or facing each other every week can hold a deal together; this one-week table on its own can't.`,
  };
}

// ── The penalty experiment ───────────────────────────────────────────────────

export type PenaltyGuess = 'one' | 'two' | 'over-two' | 'five';

export const PENALTY_GUESSES: readonly { id: PenaltyGuess; label: string }[] = [
  { id: 'one', label: 'Any penalty, even 1, will do it' },
  { id: 'two', label: 'Exactly 2' },
  { id: 'over-two', label: 'Anything more than 2' },
  { id: 'five', label: 'It has to be big — around 5' },
];

export function penaltyGuessLabel(id: PenaltyGuess): string {
  return PENALTY_GUESSES.find((g) => g.id === id)?.label ?? id;
}

export function penaltyGuessFeedback(guess: PenaltyGuess): Feedback {
  switch (guess) {
    case 'over-two':
      return { verdict: 'match', text: 'Right on the line: the penalty has to outweigh the 2-point gain from cutting, not just equal it.' };
    case 'two':
      return {
        verdict: 'depends',
        text: 'Close. At exactly 2 the penalty cancels the gain, so the two choices tie — the model no longer says which way a company goes. Anything above 2 tips it.',
      };
    case 'one':
      return { verdict: 'misconception', text: 'A penalty of 1 shrinks the gain from cutting to 1, but cutting still pays more against either rival choice.' };
    case 'five':
      return { verdict: 'defensible', text: 'A penalty of 5 works, but it is more than needed: in this model anything above 2 already flips the choice.' };
  }
}

export interface PenaltyExplanation {
  regime: Regime;
  title: string;
  body: string;
}

/**
 * What a penalty p does to QuickEats' choice, quoted from the adjusted table so every number on screen
 * matches the matrix. Below 2 cutting is strictly better, at exactly 2 they tie against either rival action,
 * above 2 maintaining is strictly better.
 */
export function penaltyExplanation(p: number): PenaltyExplanation {
  const rules = { cutPenalty: p, maintainReward: 0 };
  const regime = regimeFor(rules);
  const adv = cutAdvantage(rules);
  const g = applyCutPenalty(p);
  const vsMaintain = `${fmt(payoffAt(g, 'maintain', 'maintain')[0])} vs ${fmt(payoffAt(g, 'cut', 'maintain')[0])}`;
  const vsCut = `${fmt(payoffAt(g, 'maintain', 'cut')[0])} vs ${fmt(payoffAt(g, 'cut', 'cut')[0])}`;
  const pairs = `(maintain vs cut: ${vsMaintain} if FoodKart maintains, ${vsCut} if it cuts)`;
  if (regime === 'cut-dominant') {
    return {
      regime,
      title: `At p = ${p.toFixed(1)}, cutting still wins`,
      body: `Cutting still earns ${fmt(adv)} more than maintaining, whichever choice FoodKart makes ${pairs}.`,
    };
  }
  if (regime === 'tie') {
    return {
      regime,
      title: `At p = ${p.toFixed(1)}, the choices tie`,
      body: `The penalty exactly cancels the 2-point gain. Against either FoodKart choice, maintaining and cutting now earn the same ${pairs}, so this model can't say which way a company goes.`,
    };
  }
  const both = payoffAt(g, 'maintain', 'maintain')[0];
  return {
    regime,
    title: `At p = ${p.toFixed(1)}, maintaining wins`,
    body: `Maintaining now earns ${fmt(-adv)} more, whichever choice FoodKart makes ${pairs}. Predicted outcome: both maintain, ${fmt(both)} each.`,
  };
}

// ── Completion ───────────────────────────────────────────────────────────────

export interface CooperationRecapInput {
  predicted: PriceAction | null;
  reason: RivalReason | null;
  choice: PriceAction | null;
  rival: PriceAction | null;
  promise: PriceAction | null;
  penaltyGuess: PenaltyGuess | null;
}

/** Lines for "Your path through it", built only from what the learner did. */
export function cooperationRecap(d: CooperationRecapInput): string[] {
  const lines: string[] = [];
  if (d.predicted && d.rival) {
    const why = d.reason ? ` because "${rivalReasonLabel(d.reason).toLowerCase()}"` : '';
    lines.push(`You predicted Rohan would ${d.predicted}${why}. He chose to ${d.rival}.`);
  }
  if (d.choice && d.rival) {
    const [mine] = payoffAt(BASE_PRICING_GAME, d.choice, d.rival);
    lines.push(`You chose to ${d.choice} and earned ${mine}.`);
    if (d.predicted === d.rival && d.choice !== d.rival) {
      const [matched] = payoffAt(BASE_PRICING_GAME, d.rival, d.rival);
      lines.push(`You expected him to ${d.rival}, yet chose to ${d.choice}. Against that move, choosing to ${d.rival} would have earned you ${matched}.`);
    }
  }
  if (d.reason === 'either') lines.push('Strength: you reasoned from his payoffs against both of your choices — the core move of this lesson.');
  else if (d.reason === 'mutual') lines.push('Worth watching: you expected the choice that is best for both. In this game, each side asks what is best for itself.');
  if (d.promise === 'maintain') lines.push('You chose to keep the deal. Whether that is wise depends on trust and repeat play — things outside this one-week table.');
  if (d.penaltyGuess) {
    const v: Verdict = penaltyGuessFeedback(d.penaltyGuess).verdict;
    lines.push(
      v === 'match'
        ? 'You predicted the penalty threshold before testing it.'
        : `You guessed "${penaltyGuessLabel(d.penaltyGuess).toLowerCase()}" for the penalty; the model's line is 2 (a tie), with anything above it flipping the choice.`,
    );
  }
  return lines;
}
