/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { clipOutputPath, getClip } from '../../features/audio/clips.ts';
import { STORY_CLIPS } from '../../features/audio/story-clips.ts';
import { direct, sfxBetween } from '../crossing/direction.ts';
import { allPlans, allSpokenLines, beatClip, playThrough, spokenLine } from '../crossing/narration.ts';
import { type Beat, type Choices, type Position, SCENES, type SceneId, START, beatAt, choose, ending, next, sceneApplies, sceneBeats } from '../crossing/story.ts';
import { ROOMS } from '../meridian/engine.ts';
import { CROSSING_REFLECTION_LINES, MERIDIAN_LINES } from '../meridian/narration.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

/** Sound names listed in the generated asset map. */
const SOUNDS = new Set([...read('src/features/stories/audio/assets.ts').matchAll(/^ {2}'([^']+)': \{ source/gm)].map((m) => m[1]));
const LOCK = JSON.parse(read('assets/audio/clips.lock.json')).clips as Record<string, unknown>;

/** Every position of a run, with its beat. */
function walk(plan: Choices) {
  const out: { pos: Position; c: Choices; beat: Beat; prev: Beat | null }[] = [];
  let pos: Position = START;
  let c: Choices = {};
  let prev: Beat | null = null;
  for (let guard = 0; guard < 600; guard++) {
    const beat = beatAt(pos, c)!;
    out.push({ pos, c, beat, prev });
    prev = beat;
    if (beat.kind === 'choice') {
      const r = choose(pos, c, beat.id, plan[beat.id] as string);
      assert.ok(r);
      pos = r.pos;
      c = r.choices;
      continue;
    }
    const n = next(pos, c);
    if (!n) return out;
    pos = n;
  }
  throw new Error('did not finish');
}

const kind: Choices = { open: 'plain', basket: 'full', rope: 'all', answer: 'half', load: 'agreed', signal: 'explain', offer: 'together' };

describe('The Distance Between Us: direction covers the whole story', () => {
  it('on every path, every beat has a valid cue, and every sound it names exists', () => {
    let beats = 0;
    for (const plan of allPlans()) {
      for (const { pos, c, beat, prev } of walk(plan)) {
        const d = direct(pos, c, prev);
        assert.ok(d, `${pos.scene}:${pos.beat}`);
        beats++;
        if (d.music) assert.ok(SOUNDS.has(`crossing/music/${d.music}`), d.music);
        for (const bed of Object.keys(d.beds)) assert.ok(SOUNDS.has(`crossing/ambience/${bed}`), bed);
        for (const s of sfxBetween(prev, beat)) assert.ok(SOUNDS.has(`crossing/sfx/${s.sound}`), s.sound);
      }
    }
    assert.ok(beats > 100_000);
  });

  it('never hides anything behind the sound: at most two effects on a beat, and every hold is short', () => {
    for (const { pos, c, beat, prev } of walk(kind)) {
      assert.ok(sfxBetween(prev, beat).length <= 2);
      assert.ok(direct(pos, c, prev)!.holdMs <= 1200);
    }
  });

  it('night eight is scored by wind and water alone', () => {
    const beats = walk(kind).filter((x) => x.pos.scene === 'd' && x.beat.stage.night === 8);
    const note = beats.find((x) => x.beat.kind === 'line' && x.beat.who === 'note')!;
    const d = direct(note.pos, note.c, note.prev)!;
    assert.equal(d.music, null);
    assert.deepEqual(Object.keys(d.beds).sort(), ['river', 'wind']);
    assert.ok(d.holdMs >= 1000, 'a beat of nothing before the note');
  });

  it('the storm has no score, and rain and thunder only when there is weather', () => {
    for (const { pos, c, beat, prev } of walk(kind)) {
      const d = direct(pos, c, prev)!;
      if (beat.stage.sky === 'storm') assert.equal(d.music, null);
      else assert.equal(d.beds.storm, undefined);
      for (const s of sfxBetween(prev, beat)) if (s.sound === 'thunder') assert.equal(beat.stage.sky, 'storm');
    }
  });

  it('each ending has its own music, air and light, from the existing ending logic', () => {
    const cases: [Choices, string][] = [
      [{ ...kind, offer: 'staged' }, 'span'],
      [{ ...kind, offer: 'alone' }, 'line'],
      [{ ...kind, offer: 'keep' }, 'banks'],
    ];
    const seen = cases.map(([c, id]) => {
      const run = walk(c);
      const last = run.at(-1)!;
      assert.equal(ending(last.c)!.id, id);
      const d = direct(last.pos, last.c, last.prev)!;
      assert.equal(d.music, id);
      return d;
    });
    assert.equal(new Set(seen.map((d) => JSON.stringify(d.beds))).size, 3);
    assert.ok(seen[0].grade.warm > seen[1].grade.warm && seen[1].grade.warm > seen[2].grade.warm);
    assert.ok(seen[2].grade.cold > seen[0].grade.cold);
  });

  it('warm light is earned: it only ever follows what has happened', () => {
    const generous = walk(kind).find((x) => x.pos.scene === 'f')!;
    const harsh = walk({ ...kind, basket: 'short', rope: 'keep', answer: 'empty', again: 'continue' }).find((x) => x.pos.scene === 'f')!;
    const g = direct(generous.pos, generous.c)!.grade;
    const h = direct(harsh.pos, harsh.c)!.grade;
    assert.ok(g.warm > h.warm);
    assert.ok(h.cold > g.cold);
  });

  it('a sound only marks a change: an unchanged stage is silent', () => {
    const beat = sceneBeats('a', {})[1];
    assert.deepEqual(sfxBetween(beat, { ...beat }), []);
  });

  it('Mira is a figure across a gap until you have spoken', () => {
    const run = walk(kind);
    const first = run.find((x) => x.beat.kind === 'line' && x.beat.who === 'mira')!;
    assert.equal(direct(first.pos, first.c, first.prev)!.shot, 'far');
    const later = run.find((x) => x.pos.scene === 'c' && x.beat.kind === 'line' && x.beat.who === 'mira')!;
    assert.equal(direct(later.pos, later.c, later.prev)!.shot, 'bust-mira');
  });

  it('directing a beat never changes the story', () => {
    const before = JSON.stringify(playThrough(kind));
    for (const { pos, c, prev } of walk(kind)) direct(pos, c, prev);
    assert.equal(JSON.stringify(playThrough(kind)), before);
  });
});

describe('narration matches the script', () => {
  const crossing = STORY_CLIPS.filter((c) => c.lesson === 'dbu');
  const meridian = STORY_CLIPS.filter((c) => c.lesson === 'mer');

  it('the snapshot is exactly what the script needs', () => {
    const fromScript = allSpokenLines().map((l) => `${l.id}|${l.voice}|${l.text}`).sort();
    const fromSnapshot = crossing.filter((c) => !c.id.startsWith('dbu.reflect')).map((c) => `${c.id}|${c.character}|${c.text}`).sort();
    assert.deepEqual(fromSnapshot, fromScript);
    assert.deepEqual(meridian.map((c) => c.text).sort(), Object.values(MERIDIAN_LINES).sort());
    assert.deepEqual(crossing.filter((c) => c.id.startsWith('dbu.reflect')).map((c) => c.text).sort(), Object.values(CROSSING_REFLECTION_LINES).sort());
  });

  it('every spoken line has a recording of that exact text', () => {
    for (const c of STORY_CLIPS) {
      assert.ok(LOCK[c.id], `no recording for ${c.id}`);
      assert.doesNotThrow(() => readFileSync(path.join(ROOT, clipOutputPath(c))), c.id);
    }
  });

  it('each beat’s clip says what the beat shows, in the right voice', () => {
    for (const { beat } of walk({ ...kind, signal: 'ask', offer: 'ask', after: 'staged' })) {
      const clip = beatClip(beat);
      if (beat.kind === 'line' && beat.who === 'lamp') {
        assert.equal(clip, null, 'the lamp is read, not voiced');
        continue;
      }
      const def = getClip(clip!)!;
      assert.ok(def, 'clip exists');
      if (beat.kind === 'choice') assert.equal(def.text, beat.prompt);
      else if (beat.who !== 'note') assert.equal(def.text.toLowerCase(), beat.text.toLowerCase());
      if (beat.kind === 'line' && beat.who === 'mira') assert.equal(def.character, 'mira');
      if (beat.kind === 'line' && beat.who === 'hollis') assert.equal(def.character, 'hollis');
      if (beat.kind === 'line' && beat.who === 'narrator') assert.equal(def.character, 'storyteller');
    }
  });

  it('Mira’s note, said aloud, keeps every word of it', () => {
    const notes = allSpokenLines().filter((l) => /fever at/i.test(l.text)).map((l) => l.text);
    assert.equal(notes.length, 2);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z’ ]/g, '').replace(/\s+/g, ' ').trim();
    const shown = sceneBeats('d', {}).filter((b) => b.kind === 'line' && b.who === 'note').map((b) => (b as { text: string }).text.replace(/\s*—\s*M$/, ''));
    for (const s of shown) assert.ok(notes.map(norm).includes(norm(s)));
  });

  it('the spoken form never says a thing the screen doesn’t', () => {
    for (const scene of SCENES as readonly SceneId[]) {
      if (!sceneApplies(scene, kind)) continue;
      for (const beat of sceneBeats(scene, kind)) {
        const line = spokenLine(beat);
        if (line && beat.kind === 'line' && beat.who !== 'note') assert.equal(line.text.toLowerCase(), beat.text.toLowerCase());
      }
    }
  });

  it('nothing is spoken in capitals, which a voice might spell out', () => {
    for (const l of allSpokenLines()) assert.doesNotMatch(l.text, /[A-Z]{2,}/, l.text);
  });

  it('the rooms’ spoken descriptions are the rooms’ own', () => {
    assert.equal(MERIDIAN_LINES['mer.rooms.noisy'], ROOMS.noisy.blurb);
    assert.equal(MERIDIAN_LINES['mer.rooms.hostile'], ROOMS.hostile.blurb);
  });

  it('the Steward’s lines are shown on screen from the same source', () => {
    const src = read('src/features/stories/meridian/MeridianStory.tsx');
    for (const id of Object.keys(MERIDIAN_LINES)) {
      const family = id.startsWith('mer.rooms.') && !id.endsWith('insight') && id !== 'mer.rooms.1';
      const dynamic = id.startsWith('mer.echo.') && !/\.(1|insight)$/.test(id);
      if (family || dynamic) continue;
      assert.ok(src.includes(`'${id}'`), `${id} is not used by the screen`);
    }
  });
});
