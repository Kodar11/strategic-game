import type { Place } from '../../game/coordination.ts';
import type { PriceAction } from '../../game/incentives.ts';
import type { ShotRecord } from '../../game/mixed-strategy.ts';
import type { RoundResult } from '../../game/two-thirds-game.ts';
import type { ClipId } from './clips.ts';

/**
 * Picks the clip for a resolved outcome. Each selector only reads the outcome the game already computed;
 * it returns null for outcomes no clip was written for, so the line is simply shown without audio.
 */

export function pricingRevealClips(you: PriceAction, rival: PriceAction): { rohan: ClipId | null; aarav: ClipId | null } {
  if (rival !== 'cut') return { rohan: null, aarav: null };
  return you === 'maintain'
    ? { rohan: 'l1.reveal.rohan.undercut', aarav: 'l1.reveal.aarav.undercut' }
    : { rohan: 'l1.reveal.rohan.bothcut', aarav: 'l1.reveal.aarav.bothcut' };
}

export function pricingWhyClip(you: PriceAction, rival: PriceAction): ClipId | null {
  if (rival !== 'cut') return null;
  return you === 'maintain' ? 'l1.why.maintain-cut' : 'l1.why.cut-cut';
}

export function roundResultClip(result: Pick<RoundResult, 'learner' | 'target'>): ClipId {
  if (result.learner.isWinner) return 'l2.result.won';
  return result.learner.guess > result.target ? 'l2.result.above' : 'l2.result.below';
}

/** Nina's line at the meetup. Round 1 she goes to her favourite (the park); round 2 to the shared spot (the café). */
export function meetupReactionClip(round: 1 | 2, r: { you: Place; friend: Place; met: boolean }): ClipId | null {
  if (round === 1 && r.friend === 'park') return r.met ? 'l3.reveal1.met' : 'l3.reveal1.missed';
  if (round === 2 && r.friend === 'cafe') return r.met ? 'l3.reveal2.met' : 'l3.reveal2.missed';
  return null;
}

/** Maya reacts to the shot that was just taken: whether she saved it, and whether she was reading a pattern. */
export function shotReactionClip(shot: Pick<ShotRecord, 'scored' | 'reason'>): ClipId {
  const read = shot.reason !== 'coin';
  if (shot.scored) return read ? 'l4.shot.goal-read' : 'l4.shot.goal-guess';
  return read ? 'l4.shot.save-read' : 'l4.shot.save-guess';
}

export function keeperReviewClip(readSaves: number): ClipId {
  return readSaves >= 3 ? 'l4.review.read' : 'l4.review.few';
}
