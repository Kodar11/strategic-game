import { type PredictionAttempt, lockedAnswer } from '../../../components/lesson/prediction-state.ts';
import type { Feedback } from '../../../components/lesson/verdict.ts';
import { type FriendInfo, MEETUP_GAME, type MeetupResult, type Place, friendPolicy, meetupAnalysis, resolveMeetup } from '../../../game/coordination.ts';
import { type LearningAttempt, recordAttempt } from '../../learning/records.ts';
import { payoffAt, rowBestResponses } from '../../../game/payoff-matrix.ts';

/** Lesson 3 wording that depends on the learner's predictions and picks. Pure, so tests can pin it to the model. */

export const PLACE_NAME: Record<Place, string> = { cafe: 'Clocktower Café', park: 'Riverside Park' };

/** Round 1: nothing shared. Round 2: the "usual spot" you both remember. */
export const ROUND_INFO: Record<1 | 2, FriendInfo> = { 1: { kind: 'none' }, 2: { kind: 'focal', place: 'cafe' } };

/**
 * Was the prediction about Nina right — and if not, could the learner have known?
 * - Round 1 has no shared clue and Nina's rule is hidden until afterwards, so a miss is a reasonable call that
 *   the outcome didn't match, not a reasoning error.
 * - Round 2 has a clue you both remember ('our usual spot'), so the shared reference point was knowable.
 */
export type NinaRead = 'correct' | 'reasonable-miss' | 'missed-clue';

export function ninaRead(round: 1 | 2, predicted: Place, friend: Place): NinaRead {
  if (predicted === friend) return 'correct';
  return round === 1 ? 'reasonable-miss' : 'missed-clue';
}

/**
 * Did the learner's own choice follow from their prediction? Judged from the payoff table:
 * - `consistent`: a best reply to the place they expected Nina to be.
 * - `hedge`: not a best reply to that belief, but the better bet if they were unsure (Nina equally likely at
 *   either place) — e.g. leaning towards the café, which is worth more to you. A defensible call under doubt.
 * - `inconsistent`: worse whether Nina goes where you expected or you're only half sure — a coordination slip.
 */
export type FollowThrough = 'consistent' | 'hedge' | 'inconsistent';

export function followThrough(predicted: Place, choice: Place, game = MEETUP_GAME): FollowThrough {
  if (rowBestResponses(game, predicted).includes(choice)) return 'consistent';
  const halfSure = (p: Place) => 0.5 * payoffAt(game, p, 'cafe')[0] + 0.5 * payoffAt(game, p, 'park')[0];
  return halfSure(choice) >= halfSure(predicted) ? 'hedge' : 'inconsistent';
}

/**
 * Feedback after a meetup, combining the read of Nina with the follow-through of the learner's own choice.
 * A miss is only called a misconception when the information was there (round 2's shared clue) or the choice
 * contradicted the learner's own prediction; an unknowable miss is 'reasonable'.
 */
export function meetupFeedback(round: 1 | 2, predicted: Place, r: Pick<MeetupResult, 'you' | 'friend' | 'met'>): Feedback {
  const read = ninaRead(round, predicted, r.friend);
  const follow = followThrough(predicted, r.you);
  const [youHedge, youOther] = [payoffAt(MEETUP_GAME, r.you, r.you)[0], payoffAt(MEETUP_GAME, predicted, predicted)[0]];
  if (follow === 'inconsistent') {
    return {
      verdict: 'misconception',
      text: `You expected Nina at ${PLACE_NAME[predicted]} but went to ${PLACE_NAME[r.you]}. Whoever you're meeting, your best move is simply wherever you expect them to be — meeting anywhere beats missing.`,
    };
  }
  if (read === 'missed-clue') {
    return {
      verdict: 'misconception',
      text: `You expected ${PLACE_NAME[predicted]}, but the clue pointed you both to ${PLACE_NAME[r.friend]} — and Nina knew you'd remember it too.`,
    };
  }
  if (follow === 'hedge') {
    return {
      verdict: 'defensible',
      text:
        read === 'correct'
          ? `You read Nina correctly — you expected ${PLACE_NAME[predicted]} — but went to ${PLACE_NAME[r.you]}. Leaning that way makes some sense if you weren't sure, since it's worth more to you (${youHedge} vs ${youOther}). But here your best move is simply wherever you expect her to be.`
          : `You expected ${PLACE_NAME[predicted]} but hedged towards ${PLACE_NAME[r.you]}, which is worth more to you (${youHedge} vs ${youOther}). With nothing to go on, that's a defensible bet — just notice it didn't follow from your own prediction.`,
    };
  }
  if (read === 'correct') {
    return {
      verdict: 'match',
      text:
        round === 1
          ? `You expected Nina at ${PLACE_NAME[r.friend]} and went there. With no shared clue, she went where she enjoys meeting most.`
          : `You expected her at your usual spot and went there. The shared memory did the work.`,
    };
  }
  return {
    verdict: 'reasonable',
    text: `You went where you expected her, which was the right logic. But with nothing shared to go on, you had no way to know her rule: she went to her own favourite, ${PLACE_NAME[r.friend]}. A miss like this is bad luck, not bad reasoning.`,
  };
}

/** A short recap note for one meetup, from the same evaluation as the feedback. */
export function meetupNote(round: 1 | 2, predicted: Place, r: Pick<MeetupResult, 'you' | 'friend' | 'met'>): string {
  const { verdict } = meetupFeedback(round, predicted, r);
  if (verdict === 'match') return 'you read her right';
  if (verdict === 'reasonable') return 'a reasonable guess — nothing told you her rule';
  if (verdict === 'defensible') return 'you hedged away from your own prediction';
  return followThrough(predicted, r.you) === 'inconsistent' ? 'your choice didn’t follow from your prediction' : 'the shared clue pointed elsewhere';
}

const COUNT_WORD = ['No', 'One', 'Two', 'Three', 'Four'];
const pct = (p: number) => `${Math.round(p * 100)}%`;

/**
 * How to describe the table's equilibria, from the engine's analysis. Pure-strategy equilibria are counted as
 * such, and the mixed equilibrium is described only if the engine finds one.
 */
export function equilibriumSummary(analysis = meetupAnalysis()): { title: string; mixedNote: string | null } {
  const n = analysis.equilibria.length;
  const dominant = analysis.rowDominance.kind !== 'none' || analysis.colDominance.kind !== 'none';
  const title = `${COUNT_WORD[n] ?? n} pure-strategy ${n === 1 ? 'equilibrium' : 'equilibria'}, ${dominant ? 'with' : 'no'} dominant strategy`;
  const m = analysis.mixed;
  const mixedNote = m
    ? `There is also a mixed-strategy equilibrium: if you went to ${PLACE_NAME[m.rows[0]]} ${pct(m.rowFirst)} of the time and Nina ${pct(m.colFirst)} of the time, neither of you could do better by changing alone. But you would meet only about ${pct(m.meetChance)} of the time, expecting ${m.payoffs[0].toFixed(1)} and ${m.payoffs[1].toFixed(1)} — worse for both than either meeting.`
    : null;
  return { title, mixedNote };
}

/** Who benefits from the message: the sender chooses which of the two meetings happens. */
export function messageExplanation(proposed: Place): string {
  const [you, nina] = payoffAt(MEETUP_GAME, proposed, proposed);
  const other: Place = proposed === 'cafe' ? 'park' : 'cafe';
  const [youAlt, ninaAlt] = payoffAt(MEETUP_GAME, other, other);
  return `Nina's stated rule: follow the message, since any meeting beats missing. You get ${you}, Nina gets ${nina}. The other message would have given you ${youAlt} and Nina ${ninaAlt}. The payoffs never changed — the message only decided which meeting happens, and the sender got to choose.`;
}

export function coordinationRecap(d: {
  predict1: Place | null;
  r1: MeetupResult | null;
  predict2: Place | null;
  r2: MeetupResult | null;
  message: Place | null;
}): string[] {
  const lines: string[] = [];
  if (d.r1) {
    const p = d.predict1 ? `You expected Nina at ${PLACE_NAME[d.predict1]} (${meetupNote(1, d.predict1, d.r1)}); ` : '';
    lines.push(`${p}with no clue, ${d.r1.met ? `you met at ${PLACE_NAME[d.r1.you]}` : 'you missed each other'}.`);
  }
  if (d.r2) {
    const note = d.predict2 ? ` (${meetupNote(2, d.predict2, d.r2)})` : '';
    lines.push(`With the shared "usual spot", ${d.r2.met ? 'you found each other' : 'you still missed — the clue only helps if you both use it'}${note}.`);
  }
  if (d.r1 && d.r2 && !d.r1.met && d.r2.met) lines.push('Same people, same payoffs: the only thing that changed was a shared expectation.');
  if (d.message) {
    lines.push(
      d.message === 'cafe'
        ? 'With one message, you chose your own favourite spot. Fair enough — but notice who got to choose.'
        : 'With one message, you chose Nina’s favourite spot, taking less for yourself.',
    );
  }
  return lines;
}

// ── Learning record ──────────────────────────────────────────────────────────

/** Lesson 3's evaluated predictions about Nina, from the same evaluation as the feedback and recap. */
export function coordinationRecords(d: {
  predict1: PredictionAttempt<Place>;
  pick1: Place | null;
  committed1: boolean;
  predict2: PredictionAttempt<Place>;
  pick2: Place | null;
  committed2: boolean;
}): (LearningAttempt | null)[] {
  const round = (n: 1 | 2, attempt: PredictionAttempt<Place>, pick: Place | null, committed: boolean) => {
    const predicted = lockedAnswer(attempt);
    if (!predicted || !pick || !committed) return null;
    const r = resolveMeetup(pick, friendPolicy(ROUND_INFO[n]));
    return recordAttempt(n === 1 ? 'l3.round1' : 'l3.round2', attempt, meetupFeedback(n, predicted, r).verdict, `Nina went to ${PLACE_NAME[r.friend]}; you went to ${PLACE_NAME[r.you]}`);
  };
  return [round(1, d.predict1, d.pick1, d.committed1), round(2, d.predict2, d.pick2, d.committed2)];
}
