import { type Beat, type Choices, type Position, type SceneId, ending, firstOutcome, cycleRan, playerHarms, beatAt, miraStance, sceneBeats, stormReading } from './story.ts';

/**
 * The direction of Story One: for each beat, what the player hears and what the camera does. Pure, and it only reads
 * the script and the history, so a replayed or restored beat is always directed the same way. The script itself is
 * untouched.
 *
 * Decisions worth knowing about:
 * - Music is withheld when it would tell you how to feel. Night eight has no score: the basket comes back to wind and
 *   water. The storm has none either; the storm is enough.
 * - Warm light has to be earned. `grade.warm` only rises with things that actually happened between you and Mira.
 * - Sound effects come from what changes on screen (the basket moves, a lantern is lit, a line goes up), so a sound
 *   can't play without its event, and an event can't be missed by someone playing silently.
 */

export type CrossingMusic = 'dusk' | 'thread' | 'unease' | 'echo' | 'frost' | 'span' | 'line' | 'banks';
export type Shot = 'establish' | 'wide' | 'far' | 'near' | 'centre' | 'bust-mira' | 'bust-hollis';
export type Mood = 'guarded' | 'open' | 'hurt' | 'cold' | 'warm';
export type CrossingSfx = 'rope' | 'creak' | 'steps' | 'match' | 'cloth' | 'shutter' | 'plank' | 'thunder';

export interface Direction {
  music: CrossingMusic | null;
  musicLevel: number;
  /** Ambience bed → level. */
  beds: Record<string, number>;
  fadeMs: number;
  shot: Shot;
  mood: Mood;
  /** Light over the whole image, 0–1 each. */
  grade: { warm: number; cold: number; dark: number };
  /** A beat of nothing before the words and the voice arrive. The player can tap through it. */
  holdMs: number;
}

const choiceIndex = (scene: SceneId, c: Choices, id: string) => sceneBeats(scene, c).findIndex((b) => b.kind === 'choice' && b.id === id);
const after = (pos: Position, c: Choices, id: string) => {
  const i = choiceIndex(pos.scene, c, id);
  return i !== -1 && pos.beat > i;
};

function musicFor(pos: Position, c: Choices, beat: Beat): { music: CrossingMusic | null; level: number } {
  const first = firstOutcome(c);
  const warmSoFar = c.basket === 'full' && c.rope !== 'keep';
  switch (pos.scene) {
    case 'a':
      return { music: 'dusk', level: 1 };
    case 'b':
      return { music: after(pos, c, 'basket') && first === 'ff' ? 'thread' : 'dusk', level: 1 };
    case 'c':
      if (after(pos, c, 'rope')) return { music: c.rope === 'all' ? 'thread' : c.rope === 'one' ? 'dusk' : 'unease', level: c.rope === 'keep' ? 0.75 : 1 };
      return { music: first === 'ff' || first === 'fs' ? 'thread' : 'dusk', level: 0.85 };
    case 'd': {
      // Night eight. Everything falls away the moment her lantern isn't there.
      const beats = sceneBeats('d', c);
      const lost = beats.findIndex((b) => b.stage.night === 8);
      if (pos.beat < lost) return { music: warmSoFar ? 'thread' : 'dusk', level: 0.8 };
      return pos.beat >= beats.length - 1 ? { music: 'unease', level: 0.7 } : { music: null, level: 0 };
    }
    case 'e':
      if (!after(pos, c, 'answer')) return { music: 'unease', level: 0.8 };
      if (c.answer === 'empty') return { music: 'echo', level: 0.9 };
      if (c.answer === 'away') return { music: 'unease', level: 0.75 };
      return { music: 'dusk', level: 0.85 };
    case 'e2':
      return { music: after(pos, c, 'again') && c.again === 'stop' ? 'dusk' : 'echo', level: 0.9 };
    case 'f': {
      if (!after(pos, c, 'signal')) return { music: null, level: 0 };
      const r = stormReading(c);
      return beat.stage.sky === 'storm' ? { music: null, level: 0 } : { music: r === 'clear' ? 'dusk' : 'unease', level: 0.7 };
    }
    case 'g':
    case 'g2': {
      const e = ending(c);
      const decided = pos.scene === 'g' ? after(pos, c, 'offer') && c.offer !== 'ask' : after(pos, c, 'after');
      if (decided && e) return { music: e.id === 'span' ? 'thread' : e.id === 'banks' ? 'unease' : 'frost', level: 0.8 };
      return { music: 'frost', level: 1 };
    }
    case 'h': {
      const e = ending(c);
      return { music: e?.id ?? 'frost', level: 1 };
    }
  }
}

function bedsFor(pos: Position, c: Choices, beat: Beat): Record<string, number> {
  const { sky, rain, mira, miraLight } = beat.stage;
  if (pos.scene === 'h') {
    const id = ending(c)?.id;
    if (id === 'span') return { dawn: 0.7, river: 0.55, wind: 0.2 };
    if (id === 'line') return { wind: 0.4, river: 0.4, dawn: 0.2 };
    return { gusts: 0.65, river: 0.2 };
  }
  if (sky === 'storm') return { storm: 1, rain: 0.8, gusts: 0.5 };
  // The empty far post: the world goes thin, so that the note lands in near-silence.
  if (pos.scene === 'd' && beat.stage.night === 8) return { wind: 0.3, river: 0.32 };
  if (mira === 'none' && !miraLight && pos.scene === 'e') return { wind: 0.3, river: 0.4, ...(rain ? { rain: 0.8 } : {}) };
  const beds: Record<string, number> = sky === 'dusk' ? { wind: 0.55, river: 0.55 } : sky === 'frost' ? { gusts: 0.45, wind: 0.15, river: 0.3 } : { wind: 0.4, river: 0.6 };
  if (rain) beds.rain = 0.8;
  return beds;
}

function shotFor(pos: Position, c: Choices, beat: Beat, prev: Beat | null): Shot {
  if (pos.scene === 'a' && pos.beat === 0) return 'establish';
  if (beat.kind === 'choice') return 'wide';
  if (beat.who === 'hollis') return 'bust-hollis';
  if (beat.who === 'mira') {
    // She begins as a figure across a gap: no close-up until you have actually spoken.
    if (pos.scene === 'a' && !after(pos, c, 'open')) return 'far';
    if (pos.scene === 'h' && beat.stage.mira === 'crossing') return 'centre';
    return 'bust-mira';
  }
  if (beat.who === 'lamp') return 'far';
  if (beat.stage.mira === 'crossing') return 'centre';
  if (beat.stage.basket === 'middle' && prev?.stage.basket !== 'middle') return 'centre';
  if (beat.stage.mira === 'lantern-up') return 'far';
  return 'wide';
}

function moodFor(pos: Position, c: Choices, beat: Beat): Mood {
  if (pos.scene === 'h') return ending(c)?.id === 'span' ? 'warm' : ending(c)?.id === 'banks' ? 'cold' : 'guarded';
  if (beat.stage.mira === 'turned') return 'hurt';
  if ((pos.scene === 'g' || pos.scene === 'g2') && miraStance(c) === 'closed') return 'cold';
  if (beat.stage.mira === 'lantern-up') return 'open';
  return 'guarded';
}

/** Light follows what has happened so far: goodwill warms the frame a little, harm and the cycle cool it. */
function gradeFor(pos: Position, c: Choices, beat: Beat): Direction['grade'] {
  const breachSeen = (['e', 'e2', 'f', 'g', 'g2', 'h'] as SceneId[]).includes(pos.scene) || (pos.scene === 'd' && beat.stage.night === 8);
  const kept = (c.basket === 'full' ? 1 : 0) + (c.rope === 'all' ? 1 : 0) + (c.answer === 'half' || c.answer === 'anyway' ? 1 : 0) + (c.again === 'stop' ? 1 : 0) + (stormReading(c) === 'clear' ? 1 : 0);
  const harms = playerHarms(c).length;
  let warm = Math.min(0.5, kept * 0.08);
  let cold = Math.min(0.6, harms * 0.1 + (breachSeen ? 0.1 : 0) + (cycleRan(c) ? 0.2 : 0));
  let dark = beat.stage.sky === 'storm' ? 0.3 : 0;
  if (pos.scene === 'd' && beat.stage.night === 8) {
    dark = 0.3;
    warm = 0;
  }
  if (pos.scene === 'h') {
    const id = ending(c)?.id;
    if (id === 'span') [warm, cold] = [0.8, 0];
    else if (id === 'line') [warm, cold] = [0.15, 0.2];
    else [warm, cold, dark] = [0, 0.75, 0.2];
  }
  return { warm, cold, dark };
}

function holdFor(pos: Position, c: Choices, beat: Beat): number {
  if (beat.kind === 'choice') return 400;
  if (beat.who === 'note') return 1100;
  if (beat.who === 'insight') return 700;
  if (pos.scene === 'd' && beat.stage.night === 8 && pos.beat > 0 && beat.stage.mira === 'none' && beatAt({ scene: 'd', beat: pos.beat - 1 }, c)?.stage.night === 7) return 1200;
  if (pos.scene === 'h' && pos.beat === 0) return 1000;
  return 0;
}

export function direct(pos: Position, c: Choices, prev: Beat | null = null): Direction | null {
  const beat = beatAt(pos, c);
  if (!beat) return null;
  const { music, level } = musicFor(pos, c, beat);
  const slow = beat.stage.sky === 'storm' || (pos.scene === 'd' && beat.stage.night === 8) || pos.scene === 'h';
  return {
    music,
    musicLevel: level,
    beds: bedsFor(pos, c, beat),
    fadeMs: slow ? 3500 : 2200,
    shot: shotFor(pos, c, beat, prev),
    mood: moodFor(pos, c, beat),
    grade: gradeFor(pos, c, beat),
    holdMs: holdFor(pos, c, beat),
  };
}

/** The sounds of what just changed on screen, moving from `prev` to `beat`. At most two, so nothing piles up. */
export function sfxBetween(prev: Beat | null, beat: Beat): { sound: CrossingSfx; gain: number }[] {
  const out: { sound: CrossingSfx; gain: number }[] = [];
  if (beat.kind === 'line' && beat.who === 'note') out.push({ sound: 'cloth', gain: 0.8 });
  if (beat.kind === 'line' && beat.who === 'lamp') out.push({ sound: 'shutter', gain: 1 });
  if (!prev) return out;
  const a = prev.stage;
  const b = beat.stage;
  if (b.sky === 'storm' && a.sky !== 'storm') out.push({ sound: 'thunder', gain: 0.6 });
  if (a.basket !== b.basket && b.basket !== 'gone') out.push({ sound: 'rope', gain: 0.65 });
  if (b.sky === 'storm' && b.basket === 'middle' && a.basket !== 'middle') out.push({ sound: 'thunder', gain: 0.8 });
  if (a.built !== b.built) out.push(b.built === 'cut' ? { sound: 'creak', gain: 0.8 } : { sound: 'plank', gain: 0.8 });
  if (!a.frayed && b.frayed) out.push({ sound: 'creak', gain: 0.7 });
  if (!a.miraLight && b.miraLight) out.push({ sound: 'match', gain: 0.45 });
  if (a.mira === 'none' && b.mira !== 'none') out.push({ sound: 'steps', gain: 0.3 });
  if (a.mira !== 'crossing' && b.mira === 'crossing') out.push({ sound: 'steps', gain: 0.6 });
  return out.slice(0, 2);
}
