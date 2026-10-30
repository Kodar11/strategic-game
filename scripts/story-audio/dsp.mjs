// Small offline DSP toolkit for the Stories soundscape: decode, process, synthesise, mix, encode. Dev-only; never bundled.
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Mp3Encoder } from '@breezystack/lamejs';
import { MPEGDecoder } from 'mpg123-decoder';

export const SR = 44100;

let decoder;
/** Decode an MP3 to stereo Float32 at 44.1 kHz (resampled linearly when the source differs). */
export async function readMp3(file) {
  decoder ??= new MPEGDecoder();
  await decoder.ready;
  await decoder.reset();
  const { channelData, sampleRate } = decoder.decode(new Uint8Array(await fs.readFile(file)));
  const L = channelData[0];
  const R = channelData[1] ?? L;
  return { L: resample(L, sampleRate), R: resample(R, sampleRate) };
}

function resample(x, from) {
  if (from === SR) return x;
  const ratio = from / SR;
  const out = new Float32Array(Math.floor(x.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const p = i * ratio;
    const a = Math.floor(p);
    out[i] = x[a] + (p - a) * ((x[a + 1] ?? x[a]) - x[a]);
  }
  return out;
}

export const seconds = (s) => Math.round(s * SR);
export const stereo = (dur) => ({ L: new Float32Array(seconds(dur)), R: new Float32Array(seconds(dur)) });

export function slice(buf, from, to) {
  return { L: buf.L.subarray(seconds(from), seconds(to)), R: buf.R.subarray(seconds(from), seconds(to)) };
}

export function mono(buf) {
  const out = new Float32Array(buf.L.length);
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * (buf.L[i] + buf.R[i]);
  return { L: out, R: out };
}

/** Add `src` into `dst` at `at` seconds with gain and equal-power pan (−1…1). */
export function mixIn(dst, src, at = 0, gain = 1, pan = 0) {
  const start = seconds(at);
  const a = ((pan + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * Math.SQRT2 * gain;
  const gr = Math.sin(a) * Math.SQRT2 * gain;
  const n = Math.min(src.L.length, dst.L.length - start);
  for (let i = 0; i < n; i++) {
    dst.L[start + i] += src.L[i] * gl;
    dst.R[start + i] += src.R[i] * gr;
  }
}

/** Fade in and out in place (equal-power curve). */
export function fades(buf, fadeIn, fadeOut) {
  const a = seconds(fadeIn);
  const b = seconds(fadeOut);
  const n = buf.L.length;
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < a) g *= Math.sin(((i / a) * Math.PI) / 2);
    if (n - i <= b) g *= Math.sin((((n - i) / b) * Math.PI) / 2);
    buf.L[i] *= g;
    if (buf.R !== buf.L) buf.R[i] *= g;
  }
  return buf;
}

/** Biquad, RBJ cookbook. Returns a filtered copy. */
export function biquad(buf, type, freq, q = 0.707) {
  const w = (2 * Math.PI * freq) / SR;
  const c = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'low') [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
  else if (type === 'high') [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha]; // band
  const a0 = 1 + alpha;
  const a1 = -2 * c;
  const a2 = 1 - alpha;
  const run = (x) => {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
      y[i] = v;
    }
    return y;
  };
  const L = run(buf.L);
  return { L, R: buf.R === buf.L ? L : run(buf.R) };
}

/** Freeverb-style reverb. `mix` is the wet level; the tail is kept within the buffer's length. */
export function reverb(buf, { room = 0.84, damp = 0.4, mix = 0.3 } = {}) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116];
  const allpasses = [225, 556, 441, 341];
  const run = (x, spread) => {
    const out = new Float32Array(x.length);
    for (const d of combs) {
      const line = new Float32Array(d + spread);
      let idx = 0, store = 0;
      for (let i = 0; i < x.length; i++) {
        const v = line[idx];
        store = v * (1 - damp) + store * damp;
        line[idx] = x[i] * 0.015 + store * room;
        idx = (idx + 1) % line.length;
        out[i] += v;
      }
    }
    for (const d of allpasses) {
      const line = new Float32Array(d + spread);
      let idx = 0;
      for (let i = 0; i < x.length; i++) {
        const b = line[idx];
        line[idx] = out[i] + b * 0.5;
        out[i] = b - out[i];
        idx = (idx + 1) % line.length;
      }
    }
    return out;
  };
  const wl = run(buf.L, 0);
  const wr = run(buf.R, 23);
  const L = new Float32Array(buf.L.length);
  const R = new Float32Array(buf.L.length);
  for (let i = 0; i < L.length; i++) {
    L[i] = buf.L[i] + wl[i] * mix;
    R[i] = buf.R[i] + wr[i] * mix;
  }
  return { L, R };
}

/** Stereo feedback delay (a ping-pong when `cross`). */
export function delay(buf, time, feedback = 0.45, mix = 0.4, cross = true) {
  const d = seconds(time);
  const L = Float32Array.from(buf.L);
  const R = Float32Array.from(buf.R);
  for (let i = d; i < L.length; i++) {
    const a = cross ? R[i - d] : L[i - d];
    const b = cross ? L[i - d] : R[i - d];
    L[i] += a * feedback + (i < buf.L.length ? buf.L[i - d] * (mix - feedback > 0 ? mix - feedback : 0) : 0);
    R[i] += b * feedback;
  }
  return { L, R };
}

export function peak(buf) {
  let p = 0;
  for (const c of [buf.L, buf.R]) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return p;
}

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.L.length; i++) s += 0.5 * (buf.L[i] * buf.L[i] + buf.R[i] * buf.R[i]);
  return Math.sqrt(s / Math.max(1, buf.L.length));
}

export const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

/** Scale to a target RMS in dBFS, never letting the peak pass `ceiling` dBFS. */
export function loudness(buf, targetDb, ceiling = -1) {
  const g = Math.min(10 ** (targetDb / 20) / Math.max(rms(buf), 1e-9), 10 ** (ceiling / 20) / Math.max(peak(buf), 1e-9));
  for (let i = 0; i < buf.L.length; i++) {
    buf.L[i] *= g;
    if (buf.R !== buf.L) buf.R[i] *= g;
  }
  return buf;
}

/** Tames isolated transients (a close raindrop, a bump on the mic) so a bed's level reflects its texture. */
export function limit(buf, ceilingDb, release = 0.12) {
  const ceil = 10 ** (ceilingDb / 20);
  const look = seconds(0.005);
  const rel = Math.exp(-1 / (release * SR));
  const n = buf.L.length;
  const L = new Float32Array(n);
  const R = buf.R === buf.L ? L : new Float32Array(n);
  let g = 1;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(buf.L[Math.min(n - 1, i + look)]);
    const b = Math.abs(buf.R[Math.min(n - 1, i + look)]);
    const need = Math.min(1, ceil / Math.max(a, b, 1e-9));
    g = need < g ? need : 1 - (1 - g) * rel;
    L[i] = buf.L[i] * g;
    if (R !== L) R[i] = buf.R[i] * g;
  }
  return { L, R };
}

/** The loudest and quietest 1-second windows, used to pick steady stretches of field recordings. */
export function steadiestWindow(buf, length) {
  const w = SR;
  const blocks = [];
  for (let i = 0; i + w <= buf.L.length; i += w) {
    let s = 0;
    for (let j = i; j < i + w; j += 8) s += buf.L[j] * buf.L[j];
    blocks.push(Math.sqrt(s / (w / 8)));
  }
  const n = Math.round(length);
  let best = 0, bestScore = Infinity;
  for (let i = 0; i + n <= blocks.length; i++) {
    const part = blocks.slice(i, i + n);
    const mean = part.reduce((a, b) => a + b, 0) / n;
    const spread = Math.sqrt(part.reduce((a, b) => a + (b - mean) ** 2, 0) / n) / Math.max(mean, 1e-6);
    if (mean > 1e-4 && spread < bestScore) { bestScore = spread; best = i; }
  }
  return best;
}

/** Encode to MP3. Writes atomically; returns the size in bytes. */
export async function writeMp3(file, buf, { kbps = 80, channels = 2 } = {}) {
  const enc = new Mp3Encoder(channels, SR, kbps);
  const toInt = (x) => {
    const y = new Int16Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = Math.max(-1, Math.min(1, x[i])) * 32767;
    return y;
  };
  const l = toInt(buf.L);
  const r = channels === 2 ? toInt(buf.R) : null;
  const chunks = [];
  for (let i = 0; i < l.length; i += 1152) {
    const a = l.subarray(i, i + 1152);
    const out = channels === 2 ? enc.encodeBuffer(a, r.subarray(i, i + 1152)) : enc.encodeBuffer(a);
    if (out.length) chunks.push(Buffer.from(out));
  }
  chunks.push(Buffer.from(enc.flush()));
  const data = Buffer.concat(chunks);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
  return data.length;
}

// ---------------------------------------------------------------------------------------------------------------
// Synthesis

/** Reproducible noise. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

export const midi = (m) => 440 * 2 ** ((m - 69) / 12);

/** A held string-like voice: detuned saws through a slow low-pass, with a soft bow-like attack and vibrato. */
export function bowed(note, dur, { attack = 1.2, release = 1.5, cutoff = 1400, detune = 0.09, vib = 0.12, seed = 1 } = {}) {
  const n = seconds(dur + release);
  const out = { L: new Float32Array(n), R: new Float32Array(n) };
  const r = rng(seed);
  const voices = [-1, -0.45, 0.45, 1].map((k) => ({ k, phase: (r() + 1) / 2, f: midi(note) * 2 ** ((k * detune) / 12), pan: k * 0.7 }));
  for (const v of voices) {
    let ph = v.phase;
    const gl = Math.cos(((v.pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((v.pan + 1) * Math.PI) / 4);
    const rate = 4.6 + v.k * 0.4;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (v.f * (1 + 0.0022 * vib * 8 * Math.sin(2 * Math.PI * rate * t))) / SR;
      ph -= Math.floor(ph);
      const saw = 2 * ph - 1;
      out.L[i] += saw * gl * 0.25;
      out.R[i] += saw * gr * 0.25;
    }
  }
  const shaped = biquad(biquad(out, 'low', cutoff), 'low', cutoff * 1.4);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = t < attack ? Math.sin(((t / attack) * Math.PI) / 2) ** 2 : t > dur ? Math.cos(((Math.min(t - dur, release) / release) * Math.PI) / 2) ** 2 : 1;
    shaped.L[i] *= env;
    shaped.R[i] *= env;
  }
  return shaped;
}

/** FM bell/pluck with exponential decay. Soft, glassy at low index; metallic at a high ratio. */
export function fm(note, { dur = 1.6, ratio = 2, index = 1.2, decay = 3.5, indexDecay = 6, attack = 0.002, gain = 1 } = {}) {
  const n = seconds(dur);
  const x = new Float32Array(n);
  const f = midi(note);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const mod = Math.sin(2 * Math.PI * f * ratio * t) * index * Math.exp(-indexDecay * t);
    const env = Math.min(1, t / attack) * Math.exp(-decay * t);
    x[i] = Math.sin(2 * Math.PI * f * t + mod) * env * gain;
  }
  return { L: x, R: x };
}

/** A soft sine pad note with a slow beating partner. */
export function glassPad(note, dur, { attack = 2, release = 2, beat = 0.25, gain = 0.5 } = {}) {
  const n = seconds(dur + release);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const f = midi(note);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = t < attack ? Math.sin(((t / attack) * Math.PI) / 2) ** 2 : t > dur ? Math.cos(((Math.min(t - dur, release) / release) * Math.PI) / 2) ** 2 : 1;
    const a = Math.sin(2 * Math.PI * f * t) + 0.28 * Math.sin(2 * Math.PI * f * 2 * t) + 0.08 * Math.sin(2 * Math.PI * f * 3 * t);
    const b = Math.sin(2 * Math.PI * (f + beat) * t) + 0.28 * Math.sin(2 * Math.PI * (f + beat) * 2 * t);
    L[i] = (a * 0.7 + b * 0.3) * env * gain * 0.5;
    R[i] = (a * 0.3 + b * 0.7) * env * gain * 0.5;
  }
  return { L, R };
}

/** Filtered noise with an amplitude shape function of time (0…1). */
export function noiseBurst(dur, shape, { low = 8000, high = 0, seed = 3, gain = 1 } = {}) {
  const n = seconds(dur);
  const r = rng(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * shape(i / n) * gain;
  let buf = { L: x, R: x };
  if (low) buf = biquad(buf, 'low', low);
  if (high) buf = biquad(buf, 'high', high);
  return buf;
}

/** A pitched thump: a sine that falls quickly. */
export function thump(from, to, dur = 0.25, decay = 14, gain = 1) {
  const n = seconds(dur);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (to + (from - to) * Math.exp(-t * 30)) / SR;
    x[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-decay * t) * gain;
  }
  return { L: x, R: x };
}

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const m = (name) => {
  const [, l, acc, o] = name.match(/^([A-G])([#b]?)(-?\d)$/);
  return 12 * (Number(o) + 1) + NOTE[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
};

/** Pitch-shift by resampling, for sampled piano notes between the fetched ones. */
export function shift(buf, semis) {
  if (!semis) return buf;
  const ratio = 2 ** (semis / 12);
  const n = Math.floor(buf.L.length / ratio);
  const run = (x) => {
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * ratio;
      const a = Math.floor(p);
      y[i] = x[a] + (p - a) * ((x[a + 1] ?? 0) - x[a]);
    }
    return y;
  };
  const L = run(buf.L);
  return { L, R: buf.R === buf.L ? L : run(buf.R) };
}
