import { type Beat, type Choices, OPTIONS, SCENES, type Speaker, START, beatAt, choose, next, sceneApplies, sceneBeats } from './story.ts';

/**
 * Spoken lines for Story One. Nothing here changes the script: each clip is derived from a beat's on-screen text, and
 * its id is a hash of who says what, so a line shared by several branches has one recording and an edited line simply
 * has no audio until it is regenerated (the screen always shows the text).
 *
 * Voices: the storyteller reads narration, prompts and the quiet insights; Mira and Hollis read their own lines. Mira
 * also reads her charcoal note aloud. The signal lamp is not voiced: it is read, to the sound of its shutter.
 */

export type CrossingVoice = 'storyteller' | 'mira' | 'hollis';

const VOICE: Partial<Record<Speaker, CrossingVoice>> = { narrator: 'storyteller', insight: 'storyteller', mira: 'mira', hollis: 'hollis', note: 'mira' };

/** The note is on screen in charcoal capitals, signed; said aloud, it needs to be a sentence. */
function spokenNote(text: string) {
  return text
    .replace(/\s*—\s*M$/, '')
    .toLowerCase()
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\btav\b/g, 'Tav')
    .replace(/\borrin’s\b/g, 'Orrin’s')
    .replace(/\bi\b/g, 'I')
    .replace(/\bi’m\b/g, 'I’m')
    .replace(/\bi’ll\b/g, 'I’ll');
}

/**
 * Lamp code quoted in narration is in capitals on screen. A speech engine may spell capitals out letter by letter, so
 * the voice gets the same words in sentence case: "STORM. SAME AS YOURS." is read as "Storm. Same as yours."
 */
function spokenCapitals(text: string) {
  return text.replace(/[A-Z’]{2,}(?:[ .,?!]+[A-Z’]{2,})*/g, (run) => run.toLowerCase().replace(/(^|[.?!]\s+)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()));
}

export function spokenLine(beat: Beat): { voice: CrossingVoice; text: string; style: 'narration' | 'dialogue' } | null {
  if (beat.kind === 'choice') return { voice: 'storyteller', text: spokenCapitals(beat.prompt), style: 'narration' };
  const voice = VOICE[beat.who];
  if (!voice) return null;
  return { voice, text: beat.who === 'note' ? spokenNote(beat.text) : spokenCapitals(beat.text), style: voice === 'storyteller' ? 'narration' : 'dialogue' };
}

/** FNV-1a, as eight hex digits. Deterministic in Node and on a device, and small enough to run per beat. */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function crossingClipId(line: { voice: CrossingVoice; text: string }): string {
  return `dbu.${line.voice}.${textHash(line.text)}`;
}

/** The clip for a beat, or null when the beat is not voiced. */
export function beatClip(beat: Beat): string | null {
  const line = spokenLine(beat);
  return line ? crossingClipId(line) : null;
}

/** Every complete set of decisions the story can receive. */
export function* allPlans(): Generator<Choices> {
  for (const open of OPTIONS.open)
    for (const basket of OPTIONS.basket)
      for (const rope of OPTIONS.rope)
        for (const answer of OPTIONS.answer)
          for (const again of answer === 'empty' ? OPTIONS.again : [undefined])
            for (const load of OPTIONS.load)
              for (const signal of OPTIONS.signal)
                for (const offer of OPTIONS.offer)
                  for (const after of offer === 'ask' ? OPTIONS.after : [undefined]) yield { open, basket, rope, answer, again, load, signal, offer, after };
}

/** Plays a plan from the start and returns every beat in order. */
export function playThrough(plan: Choices): Beat[] {
  let pos = START;
  let c: Choices = {};
  const shown: Beat[] = [];
  for (let guard = 0; guard < 600; guard++) {
    const beat = beatAt(pos, c);
    if (!beat) return shown;
    shown.push(beat);
    if (beat.kind === 'choice') {
      const r = choose(pos, c, beat.id, plan[beat.id] as string);
      if (!r) return shown;
      pos = r.pos;
      c = r.choices;
      continue;
    }
    const n = next(pos, c);
    if (!n) return shown;
    pos = n;
  }
  return shown;
}

/** Every distinct spoken line in the story, across all branches. Used to generate and check the recordings. */
export function allSpokenLines(): { id: string; voice: CrossingVoice; text: string; style: 'narration' | 'dialogue' }[] {
  const seen = new Map<string, { id: string; voice: CrossingVoice; text: string; style: 'narration' | 'dialogue' }>();
  for (const plan of allPlans()) {
    for (const beat of playThrough(plan)) {
      const line = spokenLine(beat);
      if (!line) continue;
      const id = crossingClipId(line);
      if (!seen.has(id)) seen.set(id, { id, ...line });
    }
  }
  return [...seen.values()];
}

export { SCENES, sceneApplies, sceneBeats };
