#!/usr/bin/env node
// Renders the Stories soundscape into assets/audio/stories/ and writes src/features/stories/audio/assets.ts.
// Music is original, composed here. Story One's piano is a CC0 sampled piano; everything in Story Two is synthesised.
// Needs: npm run stories:audio:fetch first. Run: npm run stories:audio [-- crossing|meridian|<cue name>]
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bowed, biquad, db, delay, fades, fm, glassPad, limit, loudness, m, mixIn, mono, noiseBurst, peak, readMp3, reverb, rms, rng, seconds, shift, slice, SR, stereo, steadiestWindow, thump, writeMp3,
} from './dsp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, '.audio-src');
const OUT = path.join(ROOT, 'assets/audio/stories');
const MANIFEST = path.join(ROOT, 'src/features/stories/audio/assets.ts');
const only = process.argv[2];
const results = [];

async function save(group, name, buf, { kbps, channels, targetDb, fadeIn = 0, fadeOut = 0 }) {
  if (fadeIn || fadeOut) fades(buf, fadeIn, fadeOut);
  loudness(buf, targetDb);
  const file = path.join(OUT, group, `${name}.mp3`);
  const bytes = await writeMp3(file, buf, { kbps, channels });
  const row = { group, name, durationMs: Math.round((buf.L.length / SR) * 1000), bytes, rmsDb: +db(rms(buf)).toFixed(1), peakDb: +db(peak(buf)).toFixed(1) };
  results.push(row);
  console.log(`${group}/${name}`.padEnd(30), `${(row.durationMs / 1000).toFixed(1)}s`.padStart(7), `${(bytes / 1024).toFixed(0)} KB`.padStart(8), `rms ${row.rmsDb}`.padStart(10), `peak ${row.peakDb}`.padStart(11));
}

const wanted = (scope, name) => !only || only === scope || only === name;

// ---------------------------------------------------------------------------------------------------------------
// Story One: "The Distance Between Us" — sampled piano and bowed strings, around one theme.

const pianoCache = new Map();
const AVAILABLE = ['D2', 'F2', 'A2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'A5'];

async function sample(name) {
  if (pianoCache.has(name)) return pianoCache.get(name);
  const raw = await readMp3(path.join(SRC, 'piano', `${name}.mp3`));
  // Trim the silence before the hammer, and level each note so the score alone sets dynamics.
  let start = 0;
  const p = peak(raw);
  while (start < raw.L.length && Math.abs(raw.L[start]) < p * 0.02 && Math.abs(raw.R[start]) < p * 0.02) start++;
  const L = raw.L.slice(Math.max(0, start - 40));
  const R = raw.R.slice(Math.max(0, start - 40));
  const g = 0.8 / p;
  for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; }
  const buf = { L, R };
  pianoCache.set(name, buf);
  return buf;
}

/** A piano note: nearest recorded key, resampled to pitch. A low velocity is also darker, as a real hammer is. */
async function piano(note, vel = 0.6) {
  const target = m(note);
  const best = AVAILABLE.reduce((a, b) => (Math.abs(m(b) - target) < Math.abs(m(a) - target) ? b : a));
  const raw = shift(await sample(best), target - m(best));
  return biquad(raw, 'low', 700 + 6500 * vel * vel);
}

/** One cue from a written score. pads: [t, length, notes, gain, cutoff]. keys: [t, note, velocity, pan]. */
async function score(dur, { pads = [], keys = [], padRoom = 0.86, padMix = 0.35 }) {
  const padBus = stereo(dur);
  let seed = 1;
  for (const [t, len, notes, gain, cutoff = 1200] of pads) {
    for (const n of notes) mixIn(padBus, bowed(m(n), len, { attack: Math.min(3.5, len * 0.4), release: 3, cutoff, seed: seed++ }), t, gain);
  }
  const out = reverb(padBus, { room: padRoom, mix: padMix });
  const keyBus = stereo(dur);
  for (const [t, note, vel = 0.6, pan = 0] of keys) mixIn(keyBus, await piano(note, vel), t, vel * 0.9, pan);
  mixIn(out, reverb(keyBus, { room: 0.78, damp: 0.5, mix: 0.12 }));
  return out;
}

/** The theme: a reach up across the gap, then the long way back. Written against one beat of `b` seconds. */
const theme = (t, b, [a, c, d, e, f, g], vel = 0.55, pan = -0.08) => [
  [t, a, vel, pan],
  [t + 2 * b, c, vel + 0.08, pan],
  [t + 4 * b, d, vel, pan],
  [t + 5 * b, e, vel - 0.04, pan],
  [t + 7 * b, f, vel - 0.06, pan],
  [t + 8 * b, g, vel - 0.1, pan],
];
const D_THEME = ['D4', 'A4', 'G4', 'F4', 'E4', 'D4'];
const D_MAJOR_THEME = ['D4', 'A4', 'G4', 'F#4', 'E4', 'D4'];
const F_THEME = ['F4', 'C5', 'B4', 'A4', 'G4', 'F4'].map((n) => (n === 'B4' ? 'Bb4' : n));
const CROSSING_MUSIC = {
  // Arrival. Open fifths; the theme stated once, plainly, with room around it.
  dusk: { dur: 64, build: () => score(64, {
    pads: [[0, 18, ['D2', 'A2', 'A3'], 0.3, 800], [16, 18, ['Bb1', 'F2', 'F3'], 0.28, 800], [32, 18, ['F2', 'C3', 'A3'], 0.26, 900], [48, 16, ['A1', 'E2', 'E3'], 0.28, 800]],
    keys: [[3, 'D3', 0.4, -0.2], ...theme(6, 1, D_THEME), [17, 'Bb2', 0.38, -0.2], [20, 'F3', 0.34, 0.1], [33, 'F3', 0.36, -0.15], ...theme(37, 1, ['F4', 'C5', 'A4', 'G4', 'F4', 'E4'], 0.48), [50, 'A2', 0.36, -0.2], [54, 'E3', 0.3, 0.15]],
  }) },
  // A trade kept. The theme moves to F and something like company arrives in the left hand.
  thread: { dur: 60, build: () => {
    const b = 0.86;
    const arp = (t, ns) => ns.map((n, i) => [t + i * b * 2, n, 0.32, i % 2 ? 0.22 : -0.22]);
    return score(60, {
      pads: [[0, 16, ['F2', 'C3', 'A3'], 0.26, 1300], [14, 16, ['C2', 'G2', 'E3'], 0.25, 1300], [28, 16, ['D2', 'A2', 'F3'], 0.25, 1300], [42, 18, ['Bb1', 'F2', 'D3'], 0.25, 1300]],
      keys: [...arp(1, ['F3', 'C4', 'A3', 'C4']), ...theme(8, b, F_THEME, 0.55, 0), ...arp(15, ['C3', 'G3', 'E4', 'G3']), ...arp(29, ['D3', 'A3', 'F4', 'A3']), ...theme(36, b, ['A4', 'E5', 'D5', 'C5', 'Bb4', 'A4'], 0.5, 0.05), ...arp(44, ['Bb2', 'F3', 'D4', 'F3'])],
    });
  } },
  // After the breach. A held low second that won't settle; the theme can only get two notes out.
  unease: { dur: 56, build: () => score(56, {
    pads: [[0, 56, ['D2'], 0.34, 420], [6, 44, ['Eb2'], 0.2, 380], [22, 30, ['A3'], 0.09, 1000]],
    keys: [[5, 'A3', 0.34, 0.2], [9, 'A3', 0.3, 0.2], [13, 'Bb3', 0.36, 0.2], [24, 'D4', 0.42, -0.1], [26, 'A4', 0.46, -0.1], [40, 'A3', 0.3, 0.25], [44, 'Bb3', 0.32, 0.25], [50, 'D3', 0.3, -0.2]],
  }) },
  // Retaliation. Two figures answering each other across the stereo field, each answer a little lower.
  echo: { dur: 48, build: () => {
    const keys = [];
    const pairs = [['F4', 'E4'], ['E4', 'D4'], ['D4', 'C4'], ['C4', 'Bb3'], ['Bb3', 'A3'], ['A3', 'G3']];
    pairs.forEach(([a, b], i) => {
      const t = 2 + i * 7.4;
      keys.push([t, a, 0.44 - i * 0.02, -0.75], [t + 3.7, b, 0.42 - i * 0.02, 0.75]);
    });
    return score(48, { pads: [[0, 48, ['A1'], 0.3, 360], [0, 48, ['Bb1'], 0.14, 340], [20, 26, ['E3'], 0.07, 900]], keys });
  } },
  // The last frost. Thin high strings, the theme alone in the upper register, stopping short of home.
  frost: { dur: 64, build: () => score(64, {
    pads: [[0, 64, ['A4', 'E5'], 0.06, 2600], [0, 30, ['D2'], 0.16, 300], [32, 30, ['A1'], 0.16, 300]],
    keys: [...theme(5, 1.25, ['D5', 'A5', 'G4', 'F5', 'E5', 'D5'].map((n) => (n === 'G4' ? 'G5' : n)), 0.34, 0.1).slice(0, 5), [30, 'A2', 0.3, -0.2], ...theme(36, 1.25, ['A4', 'E5', 'D5', 'C5', 'B4', 'A4'], 0.3, 0.15).slice(0, 5)],
  }) },
  // Ending: The Span. The theme finally heard in D major, and then answered.
  span: { dur: 72, build: () => {
    const b = 0.95;
    const arp = (t, ns, v = 0.34) => ns.map((n, i) => [t + i * b, n, v, i % 2 ? 0.25 : -0.25]);
    return score(72, {
      pads: [[0, 16, ['D2', 'A2', 'F#3'], 0.26, 1500], [14, 14, ['A1', 'E2', 'C#3'], 0.25, 1500], [28, 14, ['B1', 'F#2', 'D3'], 0.25, 1500], [42, 14, ['G1', 'D2', 'B2'], 0.26, 1600], [56, 16, ['D2', 'A2', 'F#3', 'D4'], 0.26, 1700]],
      keys: [...arp(1, ['D3', 'A3', 'F#4', 'A3']), ...theme(6, b, D_MAJOR_THEME, 0.6, 0), ...arp(15, ['A2', 'E3', 'C#4', 'E3', 'A3', 'E3']), ...arp(29, ['B2', 'F#3', 'D4', 'F#3', 'B3', 'F#3']), ...theme(36, b, ['A4', 'E5', 'D5', 'C#5', 'B4', 'A4'], 0.52, 0.1), ...arp(46, ['G2', 'D3', 'B3', 'D3']), ...theme(56, 1.1, D_MAJOR_THEME, 0.5, 0), [66, 'D3', 0.36, -0.2], [66, 'A3', 0.32, 0.1], [66, 'F#4', 0.34, 0.2]],
    });
  } },
  // Ending: The Line Holds. No thirds in the pad: neither major nor minor. The theme ends on a question.
  line: { dur: 64, build: () => score(64, {
    pads: [[0, 20, ['G2', 'D3', 'A3'], 0.24, 1100], [18, 20, ['D2', 'A2', 'E3'], 0.24, 1100], [36, 14, ['G2', 'D3', 'A3'], 0.24, 1100], [48, 16, ['A1', 'E2', 'D3'], 0.22, 1000]],
    keys: [[2, 'G3', 0.34, -0.2], ...theme(6, 1.1, D_THEME, 0.46, 0).slice(0, 4), [14.5, 'A3', 0.32, 0.2], [20, 'D3', 0.34, -0.2], ...theme(37, 1.1, ['D4', 'A4', 'G4', 'A4', 'D5', 'A4'], 0.42, 0.05)],
  }) },
  // Ending: Two Banks. Almost nothing. Each phrase given up on sooner than the last.
  banks: { dur: 60, build: () => score(60, {
    pads: [[0, 60, ['D2'], 0.13, 260], [10, 44, ['A4'], 0.025, 1800]],
    keys: [[4, 'D4', 0.4, -0.15], [6.5, 'A4', 0.42, -0.15], [10, 'G4', 0.34, -0.15], [24, 'D4', 0.34, 0.15], [27, 'A4', 0.34, 0.15], [42, 'D4', 0.28, 0], [50, 'D3', 0.24, -0.2]],
  }) },
};

async function crossingAmbience() {
  const bed = async (name, srcName, secs, process, targetDb = -26) => {
    if (!wanted('crossing', name)) return;
    const src = await readMp3(path.join(SRC, 'ambience', `${srcName}.mp3`));
    const from = Math.max(0, Math.min(steadiestWindow(src, Math.min(secs, src.L.length / SR - 1)), src.L.length / SR - secs - 0.1));
    let cut = mono(slice(src, from, from + secs));
    if (process) cut = process(cut);
    await save('crossing/ambience', name, cut, { kbps: 56, channels: 1, targetDb, fadeIn: 0.05, fadeOut: 0.05 });
  };
  await bed('wind', 'leaves-wind', 40, (b) => biquad(b, 'high', 90));
  await bed('gusts', 'cold-gusts', 40, (b) => biquad(b, 'high', 150), -28);
  // The river is a long way down: take the top off it so it reads as depth, not a tap running beside you.
  await bed('river', 'river', 40, (b) => biquad(biquad(b, 'low', 3200), 'high', 120));
  await bed('rain', 'rain', 40, (b) => limit(b, -30), -27);
  await bed('storm', 'storm', 55, (b) => limit(biquad(b, 'high', 40), -14), -24);
  await bed('dawn', 'dawn-birds', 40, (b) => biquad(b, 'high', 900), -30);
}

async function crossingSfx() {
  const clip = async (name, srcName, from, to, { fadeOut = 0.15, targetDb = -18, process } = {}) => {
    if (!wanted('crossing', name)) return;
    const src = await readMp3(path.join(SRC, 'sfx', `${srcName}.mp3`));
    let cut = mono(slice(src, from, Math.min(to, src.L.length / SR)));
    if (process) cut = process(cut);
    await save('crossing/sfx', name, cut, { kbps: 64, channels: 1, targetDb, fadeIn: 0.01, fadeOut });
  };
  await clip('rope', 'rope-pulley', 2, 5.5, { fadeOut: 0.6 });
  await clip('creak', 'floorboard', 0, 2, { targetDb: -20 });
  await clip('steps', 'footsteps', 0, 3.2, { fadeOut: 0.4, targetDb: -22 });
  await clip('match', 'match', 0, 2.6, { fadeOut: 0.5, targetDb: -22 });
  await clip('cloth', 'fabric', 1, 3, { fadeOut: 0.5, targetDb: -24 });
  if (wanted('crossing', 'shutter')) {
    // The signal lamp's shutter: three small metal clacks in the old code's rhythm.
    const out = stereo(1.2);
    for (const [t, g] of [[0, 1], [0.28, 0.8], [0.72, 1]]) {
      mixIn(out, noiseBurst(0.05, (u) => (1 - u) ** 3, { low: 5200, high: 900, seed: 8 + t * 10 }), t, g * 0.8);
      mixIn(out, thump(1100, 700, 0.05, 90, 0.5), t, g * 0.5);
    }
    await save('crossing/sfx', 'shutter', reverb(out, { room: 0.4, mix: 0.08 }), { kbps: 64, channels: 1, targetDb: -24 });
  }
  if (wanted('crossing', 'plank')) {
    // A plank set down and a knot pulled tight: for the moments the crossing grows.
    const out = stereo(1.1);
    mixIn(out, thump(190, 95, 0.3, 18, 1), 0, 0.9);
    mixIn(out, noiseBurst(0.06, (u) => (1 - u) ** 2, { low: 2400, high: 200, seed: 21 }), 0, 0.6);
    mixIn(out, thump(150, 80, 0.2, 22, 0.8), 0.32, 0.6);
    await save('crossing/sfx', 'plank', reverb(out, { room: 0.5, mix: 0.1 }), { kbps: 64, channels: 1, targetDb: -21 });
  }
  if (wanted('crossing', 'thunder')) {
    const src = await readMp3(path.join(SRC, 'ambience', 'storm.mp3'));
    // Find the loudest moment in the recording and keep the roll around it.
    let best = 0, bestE = 0;
    for (let s = 0; s + 8 < src.L.length / SR; s += 1) {
      let e = 0;
      for (let i = seconds(s); i < seconds(s + 6); i += 16) e += src.L[i] * src.L[i];
      if (e > bestE) { bestE = e; best = s; }
    }
    await save('crossing/sfx', 'thunder', biquad(mono(slice(src, Math.max(0, best - 1), best + 8)), 'low', 1400), { kbps: 64, channels: 1, targetDb: -21, fadeIn: 0.8, fadeOut: 2.5 });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Story Two: "The Rules of the Game" — synthesised. Patterns of unequal length, so the music keeps re-pairing.

const STEP = 0.15; // sixteenth at 100 BPM
const PENT = ['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5'];

function pluckPattern(dst, dur, pattern, { start = 0, end = dur, gain = 0.5, pan = 0, ratio = 2, index = 1.1, decay = 5, transpose = () => 0, drop = () => false } = {}) {
  let i = 0;
  for (let t = start; t < end; t += STEP, i++) {
    const n = pattern[i % pattern.length];
    if (n == null || drop(i, t)) continue;
    const note = (typeof n === 'string' ? m(n) : n) + transpose(t, i);
    mixIn(dst, fm(note, { dur: 1.1, ratio, index, decay, indexDecay: 9 }), t, gain, pan);
  }
}

const MERIDIAN_MUSIC = {
  // The hall. Slow chords and a few glass notes, placed with a seeded hand. You are being invited to look around.
  hall: { dur: 52, build: () => {
    const out = stereo(52);
    const chords = [[0, ['A2', 'E3', 'B3', 'C4']], [13, ['F2', 'C3', 'G3', 'A3']], [26, ['C3', 'G3', 'D4', 'E4']], [39, ['G2', 'D3', 'A3', 'B3']]];
    for (const [t, notes] of chords) for (const n of notes) mixIn(out, glassPad(m(n), 12, { attack: 3, release: 3.5, gain: 0.28 }), t, 1);
    const r = rng(5);
    for (let t = 2; t < 49; t += 2.2 + (r() + 1) * 1.8) mixIn(out, fm(m(PENT[Math.floor((r() + 1) * 4.5)]) + 12, { dur: 3, ratio: 3.01, index: 0.5, decay: 1.6 }), t, 0.14, r() * 0.7);
    return reverb(delay(out, 0.45, 0.3, 0.3), { room: 0.86, mix: 0.3 });
  } },
  // One on one. A twelve-step figure against a sixteen-step figure: they line up, drift apart, line up again.
  encounter: { dur: 38.4, build: () => {
    const out = stereo(38.4);
    pluckPattern(out, 38.4, ['A3', null, null, 'E4', null, 'C4', null, null, 'D4', null, null, null], { gain: 0.3, pan: -0.55 });
    pluckPattern(out, 38.4, ['E4', null, null, null, 'G4', null, 'A4', null, null, 'E4', null, null, 'D4', null, null, null], { gain: 0.26, pan: 0.55 });
    for (let t = 0; t < 38.4; t += STEP * 8) mixIn(out, thump(82, 52, 0.4, 9, 0.5), t, 0.6);
    for (const [t, ns] of [[0, ['A2', 'E3']], [9.6, ['F2', 'C3']], [19.2, ['C3', 'G3']], [28.8, ['G2', 'D3']]]) for (const n of ns) mixIn(out, glassPad(m(n), 9, { attack: 2, release: 1.5, gain: 0.22 }), t, 1);
    return reverb(out, { room: 0.6, mix: 0.16 });
  } },
  // The echo. One note, thrown back and forth, never quite dying.
  echo: { dur: 38.4, build: () => {
    const out = stereo(38.4);
    for (let t = 0, i = 0; t < 36; t += STEP * 16, i++) mixIn(out, fm(m(i % 4 === 3 ? 'F4' : 'E4'), { dur: 1.2, ratio: 2, index: 1.4, decay: 4 }), t, 0.34, i % 2 ? 0.8 : -0.8);
    const wet = delay(out, STEP * 8, 0.62, 0.5);
    mixIn(wet, glassPad(m('A2'), 34, { attack: 4, release: 4, gain: 0.26 }), 0, 1);
    mixIn(wet, glassPad(m('Bb2'), 16, { attack: 6, release: 5, gain: 0.08 }), 14, 1);
    return reverb(wet, { room: 0.75, mix: 0.2 });
  } },
  // The trials. Layers arrive as the field fills in; a restrained pulse, never a beat you'd dance to.
  trials: { dur: 48, build: () => {
    const out = stereo(48);
    const change = (t) => [0, -4, 3, -2][Math.floor(t / 12) % 4];
    pluckPattern(out, 48, ['A3', null, 'E4', null, null, 'C4', null, null, 'D4', null, null, 'E4'], { gain: 0.26, pan: -0.5, transpose: change });
    pluckPattern(out, 48, ['E4', null, null, 'G4', null, null, 'A4', null, null, null, 'G4', null, 'E4', null, null, null], { start: 12, gain: 0.24, pan: 0.5, transpose: change });
    pluckPattern(out, 48, [null, 'A5', null, null, null, 'E5', null, null, 'C5'], { start: 24, gain: 0.1, pan: 0.15, ratio: 3.01, index: 0.5, transpose: change });
    for (let t = 0; t < 48; t += STEP * 8) mixIn(out, thump(78, 48, 0.42, 8, 0.6), t, 0.62);
    for (let t = 12; t < 48; t += STEP * 4) mixIn(out, noiseBurst(0.04, (u) => (1 - u) ** 3, { low: 0, high: 7000, seed: Math.round(t * 10) }), t, 0.05, 0.25);
    for (let bar = 0; bar < 4; bar++) for (const k of [45, 52]) mixIn(out, glassPad(k + [0, -4, 3, -2][bar], 11, { attack: 2, release: 2, gain: 0.24 }), bar * 12, 1);
    return reverb(out, { room: 0.62, mix: 0.16 });
  } },
  // The Garden Hall. The same materials, opened out into major and given air.
  garden: { dur: 38.4, build: () => {
    const out = stereo(38.4);
    pluckPattern(out, 38.4, ['C4', null, null, 'G4', null, 'E4', null, null, 'A4', null, null, null], { gain: 0.25, pan: -0.5, index: 0.7, decay: 3.5 });
    pluckPattern(out, 38.4, ['E4', null, null, null, 'G4', null, 'C5', null, null, 'A4', null, null, 'D5', null, null, null], { gain: 0.2, pan: 0.5, index: 0.7, decay: 3.5 });
    for (const [t, ns] of [[0, ['C3', 'G3', 'E4']], [9.6, ['F2', 'C3', 'A3']], [19.2, ['A2', 'E3', 'C4']], [28.8, ['G2', 'D3', 'B3']]]) for (const n of ns) mixIn(out, glassPad(m(n), 9, { attack: 2.4, release: 2, gain: 0.26 }), t, 1);
    return reverb(out, { room: 0.82, mix: 0.28 });
  } },
  // The Iron Hall. A metallic ostinato stuck on a semitone; tight, dry, closed.
  iron: { dur: 38.4, build: () => {
    const out = stereo(38.4);
    pluckPattern(out, 38.4, ['E3', null, 'E3', null, null, 'F3', null, null, 'E3', null, null, null], { gain: 0.3, ratio: 1.41, index: 3.2, decay: 9 });
    for (let t = 0; t < 38.4; t += STEP * 8) mixIn(out, thump(70, 40, 0.3, 14, 0.8), t, 0.7);
    for (let t = STEP * 4; t < 38.4; t += STEP * 8) mixIn(out, noiseBurst(0.03, (u) => (1 - u) ** 4, { low: 6000, high: 2200, seed: Math.round(t * 7) }), t, 0.1, 0.3);
    mixIn(out, glassPad(m('E2'), 34, { attack: 3, release: 3, gain: 0.22, beat: 1.1 }), 0, 1);
    return reverb(out, { room: 0.34, mix: 0.07 });
  } },
  // The Fog Hall. The encounter figure again, but about one note in twelve slips to a wrong pitch or vanishes.
  fog: { dur: 38.4, build: () => {
    const out = stereo(38.4);
    const r = rng(77);
    const slips = Array.from({ length: 400 }, () => (r() + 1) / 2);
    const slipAt = (i) => slips[i % slips.length] < 0.085;
    pluckPattern(out, 38.4, ['A3', null, null, 'E4', null, 'C4', null, null, 'D4', null, null, null], { gain: 0.26, pan: -0.5, transpose: (_, i) => (slipAt(i) ? 1 : 0), drop: (i) => slips[(i + 57) % slips.length] < 0.05 });
    pluckPattern(out, 38.4, ['E4', null, null, null, 'G4', null, 'A4', null, null, 'E4', null, null, 'D4', null, null, null], { gain: 0.22, pan: 0.5, transpose: (_, i) => (slipAt(i + 200) ? -1 : 0), drop: (i) => slips[(i + 131) % slips.length] < 0.05 });
    for (const [t, ns] of [[0, ['A2', 'E3']], [19.2, ['F2', 'C3']]]) for (const n of ns) mixIn(out, glassPad(m(n), 18, { attack: 4, release: 3, gain: 0.2, beat: 0.8 }), t, 1);
    mixIn(out, noiseBurst(38.4, (u) => 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 3), { low: 1800, high: 300, seed: 12 }), 0, 0.05);
    return reverb(delay(out, STEP * 6, 0.35, 0.4), { room: 0.86, mix: 0.34 });
  } },
  // The discovery. The pulse stops. What was restless in A minor comes to rest on C, without triumph.
  discovery: { dur: 52, build: () => {
    const out = stereo(52);
    for (const [t, ns] of [[0, ['A2', 'E3', 'C4', 'G4']], [13, ['F2', 'C3', 'A3', 'E4']], [26, ['G2', 'D3', 'B3', 'E4']], [39, ['C3', 'G3', 'E4', 'D5']]]) for (const n of ns) mixIn(out, glassPad(m(n), 12, { attack: 3, release: 4, gain: 0.26 }), t, 1);
    for (const [t, n, g] of [[4, 'E5', 0.16], [8, 'C5', 0.12], [17, 'A4', 0.14], [21, 'E5', 0.12], [30, 'D5', 0.14], [34, 'B4', 0.12], [41, 'G4', 0.16], [43, 'C5', 0.16], [45, 'E5', 0.16], [47, 'G5', 0.12]]) mixIn(out, fm(m(n), { dur: 3.5, ratio: 3.01, index: 0.45, decay: 1.4 }), t, g, Math.sin(t) * 0.5);
    return reverb(delay(out, 0.6, 0.25, 0.3), { room: 0.88, mix: 0.32 });
  } },
};

async function meridianAmbience() {
  if (wanted('meridian', 'room')) {
    // The hall's air: low room tone, a mains-like hum, and far-off mechanisms ticking over.
    const dur = 30;
    const out = stereo(dur);
    mixIn(out, noiseBurst(dur, () => 1, { low: 420, high: 40, seed: 2 }), 0, 0.6);
    mixIn(out, glassPad(m('A1'), dur, { attack: 1, release: 0.01, gain: 0.05 }), 0, 1);
    const r = rng(19);
    for (let t = 1; t < dur - 1; t += 1.1 + (r() + 1) * 1.7) {
      mixIn(out, noiseBurst(0.012, (u) => 1 - u, { low: 3200, high: 1200, seed: Math.round(t * 13) }), t, 0.07, r() * 0.8);
    }
    await save('meridian/ambience', 'room', reverb(out, { room: 0.82, mix: 0.3 }), { kbps: 56, channels: 1, targetDb: -30, fadeIn: 0.05, fadeOut: 0.05 });
  }
  if (wanted('meridian', 'fog')) {
    const dur = 30;
    const out = noiseBurst(dur, (u) => 0.55 + 0.45 * Math.sin(u * Math.PI * 2 * 4 + 1), { low: 2400, high: 500, seed: 31 });
    await save('meridian/ambience', 'fog', out, { kbps: 56, channels: 1, targetDb: -30, fadeIn: 0.05, fadeOut: 0.05 });
  }
}

async function meridianSfx() {
  const opts = { kbps: 64, channels: 1, targetDb: -20 };
  const one = async (name, make, o = {}) => wanted('meridian', name) && save('meridian/sfx', name, make(), { ...opts, ...o });
  await one('commit', () => { const b = stereo(0.5); mixIn(b, thump(170, 96, 0.3, 16, 1), 0, 0.9); return reverb(b, { room: 0.4, mix: 0.08 }); });
  await one('share', () => { const b = stereo(1.2); mixIn(b, fm(m('E4'), { dur: 1.1, ratio: 2, index: 0.5, decay: 4 }), 0, 0.7); mixIn(b, fm(m('B4'), { dur: 1, ratio: 2, index: 0.5, decay: 4 }), 0.09, 0.6); return reverb(b, { room: 0.62, mix: 0.2 }); });
  await one('take', () => { const b = stereo(0.7); mixIn(b, fm(m('F3'), { dur: 0.6, ratio: 1.41, index: 3.4, decay: 12, indexDecay: 14 }), 0, 0.9); mixIn(b, noiseBurst(0.04, (u) => (1 - u) ** 3, { low: 7000, high: 1500, seed: 4 }), 0, 0.3); return reverb(b, { room: 0.3, mix: 0.06 }); });
  await one('accord', () => { const b = stereo(1.6); for (const [n, t] of [['A3', 0], ['E4', 0.02], ['A4', 0.04], ['C#5', 0.06]]) mixIn(b, fm(m(n), { dur: 1.5, ratio: 2, index: 0.4, decay: 2.6 }), t, 0.45); return reverb(b, { room: 0.72, mix: 0.24 }); }, { targetDb: -21 });
  await one('clash', () => { const b = stereo(0.8); mixIn(b, thump(120, 60, 0.5, 11, 1), 0, 0.9); mixIn(b, fm(m('E3'), { dur: 0.5, ratio: 1.41, index: 2.6, decay: 12 }), 0, 0.4); mixIn(b, fm(m('F3'), { dur: 0.5, ratio: 1.41, index: 2.6, decay: 12 }), 0.01, 0.4); return reverb(b, { room: 0.3, mix: 0.06 }); });
  await one('tick', () => { const b = stereo(0.2); mixIn(b, fm(m('E5'), { dur: 0.18, ratio: 2, index: 0.3, decay: 22 }), 0, 0.8); return b; }, { targetDb: -26 });
  await one('crown', () => { const b = stereo(2.2); for (const [n, t] of [['A3', 0], ['C4', 0.12], ['E4', 0.24], ['A4', 0.36]]) mixIn(b, fm(m(n), { dur: 1.8, ratio: 3.01, index: 0.4, decay: 2 }), t, 0.45); return reverb(b, { room: 0.82, mix: 0.3 }); }, { targetDb: -22 });
  await one('roomshift', () => { const b = noiseBurst(2.2, (u) => Math.sin(u * Math.PI) ** 2, { low: 2600, high: 180, seed: 17 }); const o = stereo(2.4); mixIn(o, b, 0, 0.6); mixIn(o, glassPad(m('A2'), 1.1, { attack: 0.9, release: 1, gain: 0.5 }), 0.1, 0.8); return reverb(o, { room: 0.8, mix: 0.25 }); }, { targetDb: -24, fadeOut: 0.3 });
  await one('slip', () => { const b = stereo(0.5); mixIn(b, fm(m('E4'), { dur: 0.3, ratio: 2, index: 0.8, decay: 10 }), 0, 0.5); mixIn(b, fm(m('F4'), { dur: 0.35, ratio: 2, index: 0.8, decay: 10 }), 0.09, 0.5); return delay(b, 0.11, 0.3, 0.3); }, { targetDb: -24 });
}

// ---------------------------------------------------------------------------------------------------------------

async function writeManifest() {
  const rows = [];
  async function walk(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.mp3')) rows.push(path.relative(OUT, p).replace(/\\/g, '/'));
    }
  }
  await walk(OUT);
  rows.sort();
  const metaFile = path.join(OUT, 'durations.json');
  const prev = existsSync(metaFile) ? JSON.parse(await fs.readFile(metaFile, 'utf8')) : {};
  for (const r of results) prev[`${r.group}/${r.name}.mp3`] = { durationMs: r.durationMs, bytes: r.bytes, rmsDb: r.rmsDb, peakDb: r.peakDb };
  await fs.writeFile(metaFile, `${JSON.stringify(prev, Object.keys(prev).sort().concat(['durationMs', 'bytes', 'rmsDb', 'peakDb']), 2)}\n`);
  const line = (f) => {
    const id = f.replace(/\.mp3$/, '');
    return `  '${id}': { source: require('@/assets/audio/stories/${f}'), durationMs: ${prev[f]?.durationMs ?? 0} },`;
  };
  await fs.mkdir(path.dirname(MANIFEST), { recursive: true });
  await fs.writeFile(
    MANIFEST,
    `// AUTO-GENERATED by scripts/story-audio/render.mjs — do not edit by hand.\n// Music, ambience and effects for the Stories. Durations are measured, and drive the mixer's crossfaded loops.\n\nexport const STORY_SOUNDS = {\n${rows.map(line).join('\n')}\n} as const;\n\nexport type StorySound = keyof typeof STORY_SOUNDS;\n`,
  );
  console.log(`\nManifest: ${rows.length} sounds.`);
}

for (const [name, cue] of Object.entries(CROSSING_MUSIC)) {
  if (wanted('crossing', name)) await save('crossing/music', name, await cue.build(), { kbps: 64, channels: 2, targetDb: -21, fadeIn: 0.05, fadeOut: 2 });
}
await crossingAmbience();
await crossingSfx();
for (const [name, cue] of Object.entries(MERIDIAN_MUSIC)) {
  if (wanted('meridian', name)) await save('meridian/music', name, await cue.build(), { kbps: 64, channels: 2, targetDb: -22, fadeIn: 0.05, fadeOut: 2 });
}
await meridianAmbience();
await meridianSfx();
await writeManifest();
