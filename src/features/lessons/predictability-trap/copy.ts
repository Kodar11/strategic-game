import { type PredictionAttempt, emptyPrediction, lockPrediction, lockedAnswer } from '../../../components/lesson/prediction-state.ts';
import type { Feedback } from '../../../components/lesson/verdict.ts';
import { type ShotRecord, type StrikerStrategy, guaranteedPayoff, keeperBestResponse, playSeries, strategySequence } from '../../../game/mixed-strategy.ts';
import { type LearningAttempt, recordAttempt } from '../../learning/records.ts';

/** The keeper's base seed and the length of each comparison run. Shared by the screen and the learning record. */
export const KEEPER_SEED = 4242;
export const COMPARE_SHOTS = 40;
export const STRIKER_STRATEGIES: readonly StrikerStrategy[] = ['repeat', 'alternate', 'random'];

/** One comparison run: every striker strategy against Maya's stated policy, for a given run seed. */
export function compareResults(seed: number) {
  return STRIKER_STRATEGIES.map((id) => ({ id, result: playSeries(strategySequence(id, COMPARE_SHOTS, seed + 1), KEEPER_SEED + seed) }));
}

/** Lesson 4 wording that depends on the learner's predictions and shots. Pure, so tests can pin it to the model. */

export const STRATEGY_LABEL: Record<StrikerStrategy, string> = { repeat: 'Always left', alternate: 'Alternate', random: 'Random 50/50' };

export const COMPARE_PREDICTIONS: readonly { id: StrikerStrategy; label: string; description: string }[] = [
  { id: 'repeat', label: 'Always left', description: 'Commit to one side and make it count' },
  { id: 'alternate', label: 'Alternate', description: 'Never shoot the same side twice in a row' },
  { id: 'random', label: 'Random 50/50', description: 'Flip a coin before every shot' },
];

/** Compare the prediction with an actual run. Ties for the top score count as a match for any tied strategy. */
export function comparePredictionFeedback(pick: StrikerStrategy, results: readonly { id: StrikerStrategy; goals: number }[]): Feedback {
  const top = Math.max(...results.map((r) => r.goals));
  const winners = results.filter((r) => r.goals === top).map((r) => r.id);
  if (winners.includes(pick)) {
    return {
      verdict: 'match',
      text:
        pick === 'random'
          ? 'The coin-flipper gave Maya no habit to read, so her reads were no better than guesses.'
          : `${STRATEGY_LABEL[pick]} came out on top in this run — compare it with the other runs before trusting that.`,
    };
  }
  if (pick === 'alternate') {
    return {
      verdict: 'misconception',
      text: 'Alternating feels unpredictable, but “always switch” is a habit too. After a few shots Maya expects the switch and dives for it.',
    };
  }
  return {
    verdict: 'misconception',
    text: 'Always shooting left is the easiest pattern of all: once Maya has two shots of history, she dives left every time.',
  };
}

/**
 * "Run the comparison" locks the prediction and runs (or reruns) with a new seed. Nothing runs, and no seed is
 * spent, until the prediction has an answer and a confidence.
 */
export function runComparison(d: { comparePrediction: PredictionAttempt<StrikerStrategy>; compareSeed: number | null }) {
  const comparePrediction = lockPrediction(d.comparePrediction);
  if (!comparePrediction.locked) return {};
  return { comparePrediction, compareSeed: d.compareSeed === null ? 1 : d.compareSeed + 1 };
}

// ── Mix lab ──────────────────────────────────────────────────────────────────

/** The lab opens at 80% left. The prediction is about this mix, whatever the slider shows later. */
export const LAB_START_Q = 0.8;

export type LabPrediction = 'high' | 'half' | 'low';

/**
 * The lab's three phases: predict (draft), experiment (locked; slider and simulation available, nothing revealed),
 * review (after the first simulation: expected values and feedback on the prediction are shown).
 */
export type MixLabPhase = 'predict' | 'experiment' | 'review';

export interface MixLabState {
  labPrediction: PredictionAttempt<LabPrediction>;
  q: number;
  simSeed: number | null;
}

export const MIX_LAB_RESET: MixLabState = { labPrediction: emptyPrediction(), q: LAB_START_Q, simSeed: null };

export function mixLabPhase(lab: MixLabState): MixLabPhase {
  if (!lab.labPrediction.locked) return 'predict';
  return lab.simSeed === null ? 'experiment' : 'review';
}

/** Run a (new) simulation. Only possible once the prediction is locked, so a simulation can never pre-empt it. */
export function simulateMixRun(lab: MixLabState): Partial<MixLabState> {
  if (!lab.labPrediction.locked) return {};
  return { simSeed: lab.simSeed === null ? 1 : lab.simSeed + 1 };
}

/** Feedback on the prediction, or null while it would give the answer away. */
export function mixLabFeedback(lab: MixLabState): Feedback | null {
  const pick = lockedAnswer(lab.labPrediction);
  return pick && mixLabPhase(lab) === 'review' ? labPredictionFeedback(pick) : null;
}

export const LAB_PREDICTIONS: readonly { id: LabPrediction; label: string; value: number }[] = [
  { id: 'high', label: 'About 0.8 goals a shot', value: 0.8 },
  { id: 'half', label: 'About 0.5 goals a shot', value: 0.5 },
  { id: 'low', label: 'About 0.2 goals a shot', value: 0.2 },
];

export function labPredictionFeedback(pick: LabPrediction): Feedback {
  const g = guaranteedPayoff(LAB_START_Q);
  const dive = keeperBestResponse(LAB_START_Q) === 'L' ? 'left' : 'right';
  const truth = LAB_PREDICTIONS.reduce((a, b) => (Math.abs(b.value - g) < Math.abs(a.value - g) ? b : a)).id;
  const base = `At ${Math.round(LAB_START_Q * 100)}% left, a keeper who knows your mix dives ${dive} every time. You only score on the ${Math.round((1 - LAB_START_Q) * 100)}% you shoot right: ${g.toFixed(2)} goals a shot.`;
  if (pick === truth) return { verdict: 'match', text: base };
  if (pick === 'high') return { verdict: 'misconception', text: `${base} Leaning on your favourite side hands her the read.` };
  return { verdict: 'misconception', text: `${base} 0.5 is what an even mix guarantees — this mix is lopsided.` };
}

// ── Completion ───────────────────────────────────────────────────────────────

export function predictabilityRecap(d: { shots: readonly ShotRecord[]; comparePick: StrikerStrategy | null; labPick: LabPrediction | null }): string[] {
  const lines: string[] = [];
  if (d.shots.length) {
    const goals = d.shots.filter((s) => s.scored).length;
    const reads = d.shots.filter((s) => s.reason !== 'coin').length;
    lines.push(`You scored ${goals} of ${d.shots.length}. Maya found a pattern to bet on in ${reads} of your shots.`);
    if (reads >= Math.ceil(d.shots.length / 2)) lines.push('Your shots had a readable rhythm for much of the series — most people’s do.');
  }
  if (d.comparePick) lines.push(`You expected “${STRATEGY_LABEL[d.comparePick]}” to score most against Maya.`);
  if (d.labPick) {
    lines.push(
      labPredictionFeedback(d.labPick).verdict === 'match'
        ? 'You worked out what a lopsided mix is worth before testing it.'
        : 'You overestimated what a lopsided mix is worth against a keeper who knows it.',
    );
  }
  return lines;
}

// ── Learning record ──────────────────────────────────────────────────────────

/**
 * Lesson 4's evaluated predictions. The comparison is recorded from the first run after locking (later reruns
 * share the attempt id, so they never rewrite it); the lab once its first simulation reveals the answer.
 */
export function predictabilityRecords(d: MixLabState & { comparePrediction: PredictionAttempt<StrikerStrategy>; compareSeed: number | null }): (LearningAttempt | null)[] {
  const pick = lockedAnswer(d.comparePrediction);
  let compare: LearningAttempt | null = null;
  if (pick && d.compareSeed !== null) {
    const results = compareResults(d.compareSeed).map((r) => ({ id: r.id, goals: r.result.goals }));
    const top = results.reduce((a, b) => (b.goals > a.goals ? b : a));
    compare = recordAttempt('l4.compare', d.comparePrediction, comparePredictionFeedback(pick, results).verdict, `${STRATEGY_LABEL[top.id]} scored most (${top.goals}/${COMPARE_SHOTS})`);
  }
  const labFb = mixLabFeedback(d);
  const lab = labFb
    ? recordAttempt('l4.lab', d.labPrediction, labFb.verdict, `${guaranteedPayoff(LAB_START_Q).toFixed(2)} goals a shot at ${Math.round(LAB_START_Q * 100)}% left`)
    : null;
  return [compare, lab];
}
