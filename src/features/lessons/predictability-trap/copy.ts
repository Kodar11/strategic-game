import type { Feedback } from '../../../components/lesson/verdict.ts';
import { type ShotRecord, type StrikerStrategy, guaranteedPayoff, keeperBestResponse } from '../../../game/mixed-strategy.ts';

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
    text: 'Always shooting left is the easiest pattern of all: once Maya has three shots of history, she dives left every time.',
  };
}

// ── Mix lab ──────────────────────────────────────────────────────────────────

/** The lab opens at 80% left. The prediction is about this mix, whatever the slider shows later. */
export const LAB_START_Q = 0.8;

export type LabPrediction = 'high' | 'half' | 'low';

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
