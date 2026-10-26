import type { Feedback } from '../../../components/lesson/verdict.ts';
import { MEETUP_GAME, type MeetupResult, type Place } from '../../../game/coordination.ts';
import { payoffAt, rowBestResponses } from '../../../game/payoff-matrix.ts';

/** Lesson 3 wording that depends on the learner's predictions and picks. Pure, so tests can pin it to the model. */

export const PLACE_NAME: Record<Place, string> = { cafe: 'Clocktower Café', park: 'Riverside Park' };

/**
 * Feedback after a meetup: did the learner read Nina, and did their own choice follow from that read?
 * Round 1 has no shared clue (Nina goes to her favourite); round 2 has the "usual spot".
 */
export function meetupFeedback(round: 1 | 2, predicted: Place, r: Pick<MeetupResult, 'you' | 'friend' | 'met'>): Feedback {
  const read = predicted === r.friend;
  const followed = rowBestResponses(MEETUP_GAME, predicted).includes(r.you);
  if (read && followed) {
    return {
      verdict: 'match',
      text:
        round === 1
          ? `You expected Nina at ${PLACE_NAME[r.friend]} and went there. With no shared clue, she went where she enjoys meeting most.`
          : `You expected her at your usual spot and went there. The shared memory did the work.`,
    };
  }
  if (read && !followed) {
    return {
      verdict: 'defensible',
      text: `You read Nina correctly — you expected ${PLACE_NAME[predicted]} — but went to ${PLACE_NAME[r.you]}. Here your best move is simply wherever you expect her to be.`,
    };
  }
  if (!read && followed) {
    return {
      verdict: round === 1 ? 'defensible' : 'misconception',
      text:
        round === 1
          ? `You went where you expected her, which was the right logic. But with nothing shared to go on, Nina went to her own favourite, ${PLACE_NAME[r.friend]}.`
          : `You expected ${PLACE_NAME[predicted]}, but the clue pointed you both to ${PLACE_NAME[r.friend]} — and Nina knew you'd remember it too.`,
    };
  }
  return {
    verdict: 'misconception',
    text: `You expected ${PLACE_NAME[predicted]} and went to ${PLACE_NAME[r.you]}. Nina was at ${PLACE_NAME[r.friend]}.`,
  };
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
    const p = d.predict1 ? `You expected Nina at ${PLACE_NAME[d.predict1]}; ` : '';
    lines.push(`${p}with no clue, ${d.r1.met ? `you met at ${PLACE_NAME[d.r1.you]}` : 'you missed each other'}.`);
  }
  if (d.r2) lines.push(`With the shared "usual spot", ${d.r2.met ? 'you found each other' : 'you still missed — the clue only helps if you both use it'}.`);
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
