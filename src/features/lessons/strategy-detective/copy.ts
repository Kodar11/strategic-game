import { type PredictionAttempt, lockedAnswer } from '../../../components/lesson/prediction-state.ts';
import type { Feedback } from '../../../components/lesson/verdict.ts';
import {
  type Population,
  type RoundResult,
  bestGuess,
  bestGuessForPopulation,
  levelKGuess,
  playRound,
  shiftPopulation,
} from '../../../game/two-thirds-game.ts';
import { type NewAttempt, recordAttempt } from '../../learning/records.ts';

/** Lesson 2 wording that depends on the learner's predictions and picks. Pure, so tests can pin it to the model. */

// ── The scenario (single source of truth for the screen, the lab and the tests) ───

/** Round 1 crowd: a mix of reasoning depths. Round 2: the same people, each one level deeper. */
export const ROUND1_POP: Population = { level0: 4, level1: 3, level2: 2, level3: 1, equilibrium: 0 };
export const ROUND2_POP = shiftPopulation(ROUND1_POP);
export const ROUND1_SEED = 11;
export const ROUND2_SEED = 12;
/**
 * The crowd lab reuses round 1's seed, so its "Round 1 mix" preset is exactly the crowd the learner played
 * (Instinctive players draw first, so the same seed gives them the same picks).
 */
export const LAB_SEED = ROUND1_SEED;

export type AverageGuess = 'random' | 'one-step' | 'two-step' | 'zero';

/** What the learner expects the other players to average, phrased as how they think the crowd reasons. */
export const AVERAGE_GUESSES: readonly { id: AverageGuess; label: string; centre: number }[] = [
  { id: 'random', label: 'Around 50 — most pick without much thought', centre: 50 },
  { id: 'one-step', label: `Around ${Math.round(levelKGuess(1))} — most think one step ahead`, centre: levelKGuess(1) },
  { id: 'two-step', label: `Around ${Math.round(levelKGuess(2))} — most think two steps ahead`, centre: levelKGuess(2) },
  { id: 'zero', label: 'Close to 0 — most reason it all the way down', centre: 0 },
];

export function averageGuessLabel(id: AverageGuess): string {
  return AVERAGE_GUESSES.find((g) => g.id === id)?.label ?? id;
}

/** The bucket whose centre is nearest to an actual average. */
export function nearestAverageGuess(average: number): AverageGuess {
  let best = AVERAGE_GUESSES[0];
  for (const g of AVERAGE_GUESSES) if (Math.abs(g.centre - average) < Math.abs(best.centre - average)) best = g;
  return best.id;
}

/** The average of everyone except the learner — what the prediction was about. */
export function othersAverage(result: Pick<RoundResult, 'picks'>): number {
  const others = result.picks.filter((p) => p.type !== 'you');
  return others.length ? others.reduce((s, p) => s + p.guess, 0) / others.length : 0;
}

/**
 * The pick the learner's own forecast points to: if the others average `centre`, the number that lands on
 * the target (counting your own pick in the average) is bestGuess(n × centre, n).
 */
export function pickImpliedBy(guess: AverageGuess, othersCount: number): number {
  const centre = AVERAGE_GUESSES.find((g) => g.id === guess)!.centre;
  return bestGuess(centre * othersCount, othersCount);
}

/** Only flagged when the gap is large enough to matter, so small rounding differences pass silently. */
const FOLLOW_THROUGH_GAP = 10;

export function averagePredictionFeedback(guess: AverageGuess, result: Pick<RoundResult, 'picks' | 'learner'>): Feedback {
  const avg = othersAverage(result);
  const nearest = nearestAverageGuess(avg);
  const avgText = avg.toFixed(1);
  const n = result.picks.filter((p) => p.type !== 'you').length;
  const implied = pickImpliedBy(guess, n);
  const followThrough =
    Math.abs(result.learner.guess - implied) > FOLLOW_THROUGH_GAP
      ? ` One gap: your own forecast pointed to a pick near ${Math.round(implied)}, but you chose ${result.learner.guess}.`
      : '';
  if (nearest === guess) {
    return { verdict: 'match', text: `The other ten averaged ${avgText}, close to what you expected. You modelled this crowd, not just the rules.${followThrough}` };
  }
  // Expecting the whole crowd to reason down to 0 is the misconception this lesson targets: it treats every
  // player as a perfect theorist. Any other forecast was a judgement call about people whose rules were hidden.
  if (guess === 'zero') {
    return {
      verdict: 'misconception',
      text: `The other ten averaged ${avgText}. Expecting everyone to reason all the way down to 0 assumes every player is a perfect theorist — real crowds rarely are, and that gap is what this lesson is about.${followThrough}`,
    };
  }
  const centre = AVERAGE_GUESSES.find((g) => g.id === guess)!.centre;
  return {
    verdict: 'reasonable',
    text:
      (centre > avg
        ? `The other ten averaged ${avgText} — lower than you expected. More of them were thinking ahead than you assumed.`
        : `The other ten averaged ${avgText} — higher than you expected. Fewer of them reasoned as deeply as you assumed.`) +
      ` You couldn't see their rules yet, so this miss isn't a reasoning mistake — forecasting a crowd is uncertain.${followThrough}`,
  };
}

/** The recap's verdict on the crowd forecast, from the same evaluation as the feedback. */
const CROWD_NOTE: Partial<Record<Feedback['verdict'], string>> = {
  match: 'a close read',
  reasonable: 'a reasonable forecast — their rules were hidden',
  misconception: 'real crowds rarely reason all the way to 0',
};

// ── Crowd lab ────────────────────────────────────────────────────────────────

export type LabPrediction = 'up' | 'down' | 'same';

export const LAB_PREDICTIONS: readonly { id: LabPrediction; label: string }[] = [
  { id: 'up', label: 'It goes up' },
  { id: 'down', label: 'It goes down' },
  { id: 'same', label: 'It stays the same — the rules didn’t change' },
];

export const ALL_INSTINCTIVE: Population = { level0: 10, level1: 0, level2: 0, level3: 0, equilibrium: 0 };
export const ALL_THEORISTS: Population = { level0: 0, level1: 0, level2: 0, level3: 0, equilibrium: 10 };

/** Whether the lab crowd actually changed — re-selecting the current crowd is not an experiment. */
export function populationChanged(a: Population, b: Population): boolean {
  return (Object.keys(a) as (keyof Population)[]).some((t) => a[t] !== b[t]);
}

/**
 * Compare the best pick against a mixed crowd and against an all-Theorist crowd, from the engine.
 * Defaults to the round-1 scenario the learner actually played, so the numbers match what they saw.
 */
export function labPredictionFeedback(pick: LabPrediction, mixed: Population = ROUND1_POP, seed: number = ROUND1_SEED): Feedback {
  const before = bestGuessForPopulation(mixed, seed);
  const after = bestGuessForPopulation(ALL_THEORISTS, seed);
  const numbers = `Against the round-1 mix the best pick is ${before.toFixed(1)}; against ten Theorists it is ${after.toFixed(1)}.`;
  if (pick === 'down') return { verdict: 'match', text: `${numbers} Deeper-thinking opponents pull the target down, so your best number follows.` };
  if (pick === 'same')
    return {
      verdict: 'misconception',
      text: `${numbers} The rules stayed the same, but the right answer didn't: it depends on who you're playing.`,
    };
  return { verdict: 'misconception', text: `${numbers} Theorists pick 0, which drags the average — and the target — down, not up.` };
}

// ── Completion ───────────────────────────────────────────────────────────────

export function detectiveRecap(d: {
  averageGuess: AverageGuess | null;
  round1: RoundResult | null;
  round2: RoundResult | null;
}): string[] {
  const lines: string[] = [];
  if (d.averageGuess && d.round1) {
    const note = CROWD_NOTE[averagePredictionFeedback(d.averageGuess, d.round1).verdict];
    lines.push(
      `You expected the crowd to average ${averageGuessLabel(d.averageGuess).split(' — ')[0].toLowerCase()}; they averaged ${othersAverage(d.round1).toFixed(1)}${note ? ` (${note})` : ''}.`,
    );
  }
  for (const [n, r] of [
    [1, d.round1],
    [2, d.round2],
  ] as const) {
    if (r) lines.push(`Round ${n}: you picked ${r.learner.guess}, the target was ${r.target.toFixed(1)}${r.learner.isWinner ? ' — a winning pick.' : '.'}`);
  }
  if (d.round1 && d.round2) {
    const moved = d.round2.learner.guess < d.round1.learner.guess;
    lines.push(moved ? 'You lowered your pick when the crowd thought deeper — adjusting to the players, not just the rules.' : 'You kept or raised your pick in round 2, while the crowd moved lower.');
  }
  return lines;
}

// ── Learning record ──────────────────────────────────────────────────────────

/**
 * Lesson 2's evaluated predictions. The crowd forecast is recorded as an *uncertain* prediction (the crowd's rules
 * were hidden), so a reasonable miss never counts against the learner's calibration or skills.
 */
export function detectiveRecords(d: {
  crowdPrediction: PredictionAttempt<AverageGuess>;
  guess1: number;
  committed1: boolean;
  labPrediction: PredictionAttempt<LabPrediction>;
  labTouched: boolean;
}): (NewAttempt | null)[] {
  const crowd = lockedAnswer(d.crowdPrediction);
  const lab = lockedAnswer(d.labPrediction);
  const round1 = crowd && d.committed1 ? playRound(d.guess1, ROUND1_POP, ROUND1_SEED) : null;
  return [
    crowd && round1
      ? recordAttempt('l2.crowd', d.crowdPrediction, averagePredictionFeedback(crowd, round1).verdict, `The other ten averaged ${othersAverage(round1).toFixed(1)}`)
      : null,
    lab && d.labTouched ? recordAttempt('l2.lab', d.labPrediction, labPredictionFeedback(lab).verdict, 'Your best pick goes down against deeper thinkers') : null,
  ];
}
