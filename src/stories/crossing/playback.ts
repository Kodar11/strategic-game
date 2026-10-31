import { readingMs } from '../playback.ts';
import { type Beat, type Choices, type Position, SCENES, next, sceneApplies, sceneBeats } from './story.ts';

/**
 * Moving through Story One by hand or by autoplay. Decisions already made stay made: going back shows the beats as
 * they happened, and a choice beat you return to is a record of your choice, not a new one.
 */

/** The beat before this one, across scene boundaries, or null at the very start. */
export function previous(pos: Position, c: Choices): Position | null {
  if (pos.beat > 0) return { scene: pos.scene, beat: pos.beat - 1 };
  for (let i = SCENES.indexOf(pos.scene) - 1; i >= 0; i--) {
    const scene = SCENES[i];
    if (!sceneApplies(scene, c)) continue;
    const beats = sceneBeats(scene, c);
    if (beats.length) return { scene, beat: beats.length - 1 };
  }
  return null;
}

/** How far through this run a position is, for telling new ground from ground already covered. */
export function progressIndex(pos: Position, c: Choices): number {
  let n = 0;
  for (const scene of SCENES) {
    if (scene === pos.scene) return n + pos.beat;
    if (sceneApplies(scene, c)) n += sceneBeats(scene, c).length;
  }
  return n;
}

/** A decision still waiting for the player. Nothing but the player may move past it. */
export const decisionPending = (beat: Beat, c: Choices) => beat.kind === 'choice' && c[beat.id] === undefined;

/** The last beat of the story: autoplay stops here, and the ending is only ever opened by hand. */
export const isFinalBeat = (pos: Position, c: Choices) => next(pos, c) === null;

/**
 * How long a beat stays up under autoplay. Spoken lines are mostly timed by their voice; this floor covers a clip that
 * can't play, and the pictures that take time to arrive (the basket's crossing, a new sky, the night's title).
 */
export function beatTiming(beat: Beat, prev: Beat | null, hasVoice: boolean, opensScene: boolean) {
  const text = beat.kind === 'choice' ? beat.prompt : beat.text;
  const moved = !!prev && (prev.stage.basket !== beat.stage.basket || prev.stage.built !== beat.stage.built || prev.stage.sky !== beat.stage.sky);
  const settle = moved ? 2600 : opensScene ? 2400 : 0;
  const read = hasVoice ? readingMs(text, { perChar: 36, floor: 1200 }) : readingMs(text);
  const insight = beat.kind === 'line' && beat.who === 'insight';
  const note = beat.kind === 'line' && beat.who === 'note';
  return { minMs: Math.max(read, settle), breathMs: insight || note ? 1700 : 750 };
}
