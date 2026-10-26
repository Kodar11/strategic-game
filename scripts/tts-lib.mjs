// Pure helpers for generate-tts.mjs. Everything that touches the network takes an injected `fetch`,
// so the test suite never calls the paid API.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const API_BASE = 'https://texttospeech.googleapis.com/v1';
/** The API rejects input over 5000 bytes. */
export const MAX_TEXT_BYTES = 5000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const LESSON_NUMBER = {
  'cooperation-trap': 1,
  'strategy-detective': 2,
  'coordination-problem': 3,
  'predictability-trap': 4,
  'incentive-shift': 5,
};

export class TtsError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.name = 'TtsError';
    this.status = status;
    this.retryable = retryable;
  }
}

/** Remove the API key (and any `key=` query value) from text before it is printed or thrown. */
export function redact(text, apiKey) {
  let out = String(text ?? '');
  if (apiKey) out = out.split(apiKey).join('[redacted]');
  return out.replace(/([?&]key=)[^&\s"']+/gi, '$1[redacted]');
}

/** Stable hash of everything that affects a clip's audio. A changed hash marks the file as stale. */
export function clipHash(clip, voice, format) {
  const payload = JSON.stringify({
    text: clip.text,
    languageCode: voice.languageCode,
    name: voice.name,
    speakingRate: voice.speakingRate,
    format,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/** Validate the source manifest. Returns a list of human-readable problems (empty when valid). */
export function validateManifest(clips, voices, { fileNameFor } = {}) {
  const problems = [];
  const ids = new Set();
  const files = new Map();
  for (const clip of clips) {
    const where = clip?.id ? `"${clip.id}"` : JSON.stringify(clip);
    if (!clip || typeof clip.id !== 'string' || !/^l[1-5](\.[a-z0-9-]+)+$/.test(clip.id)) {
      problems.push(`${where}: id must look like "l1.step.line" (lowercase, dots and dashes)`);
      continue;
    }
    if (ids.has(clip.id)) problems.push(`${where}: duplicate id`);
    ids.add(clip.id);
    const n = LESSON_NUMBER[clip.lesson];
    if (!n) problems.push(`${where}: unknown lesson "${clip.lesson}"`);
    else if (!clip.id.startsWith(`l${n}.`)) problems.push(`${where}: id prefix does not match lesson ${n}`);
    if (!voices[clip.character]) problems.push(`${where}: no voice configured for character "${clip.character}"`);
    if (typeof clip.text !== 'string' || !clip.text.trim()) problems.push(`${where}: empty text`);
    else if (Buffer.byteLength(clip.text, 'utf8') > MAX_TEXT_BYTES) problems.push(`${where}: text exceeds ${MAX_TEXT_BYTES} bytes`);
    if (!['narration', 'dialogue', 'reaction'].includes(clip.style)) problems.push(`${where}: unknown style "${clip.style}"`);
    if (!['screen', 'computed', 'spoken'].includes(clip.sync)) problems.push(`${where}: unknown sync "${clip.sync}"`);
    if (fileNameFor) {
      const file = fileNameFor(clip);
      if (files.has(file)) problems.push(`${where}: output file collides with "${files.get(file)}"`);
      files.set(file, clip.id);
    }
  }
  for (const [character, voice] of Object.entries(voices)) {
    if (!voice?.name || !voice?.languageCode) problems.push(`voice for "${character}": name and languageCode are required`);
    if (voice && !(voice.speakingRate >= 0.25 && voice.speakingRate <= 2)) problems.push(`voice for "${character}": speakingRate must be 0.25–2.0`);
  }
  return problems;
}

/** Fetch with bounded retries for network failures and transient HTTP errors. */
export async function requestWithRetry(doFetch, url, init, { attempts = 4, baseDelayMs = 1000, sleep = defaultSleep, apiKey } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await doFetch(url, init);
      if (res.ok) return res;
      const body = await safeText(res);
      const message = redact(`HTTP ${res.status}: ${extractApiMessage(body)}`, apiKey);
      lastError = new TtsError(message, { status: res.status, retryable: RETRYABLE_STATUS.has(res.status) });
      if (!lastError.retryable) throw lastError;
    } catch (error) {
      if (error instanceof TtsError && !error.retryable) throw error;
      lastError = error instanceof TtsError ? error : new TtsError(redact(`Network error: ${error?.message ?? error}`, apiKey), { retryable: true });
    }
    if (attempt < attempts) await sleep(baseDelayMs * 2 ** (attempt - 1));
  }
  throw new TtsError(`${lastError.message} (gave up after ${attempts} attempts)`, { status: lastError.status });
}

export async function listVoices(doFetch, apiKey, languageCode, opts = {}) {
  const url = `${API_BASE}/voices?languageCode=${encodeURIComponent(languageCode)}`;
  const res = await requestWithRetry(doFetch, url, { method: 'GET', headers: { 'X-Goog-Api-Key': apiKey } }, { ...opts, apiKey });
  const json = await res.json();
  if (!json || !Array.isArray(json.voices)) throw new TtsError('Unexpected voices.list response');
  return json.voices;
}

/** Check every configured voice exists for its language. Returns problems (empty when all are valid). */
export function checkVoicesAvailable(configured, available) {
  const names = new Set(available.map((v) => v.name));
  const problems = [];
  for (const { label, name } of configured) {
    if (!names.has(name)) problems.push(`${label}: voice "${name}" is not in the current Google Cloud voice list`);
  }
  return problems;
}

export function synthesisRequest(text, voice, format) {
  return {
    input: { text },
    voice: { languageCode: voice.languageCode, name: voice.name },
    audioConfig: { ...format, speakingRate: voice.speakingRate },
  };
}

/** Synthesize one clip and return the validated MP3 bytes. */
export async function synthesize(doFetch, apiKey, text, voice, format, opts = {}) {
  const res = await requestWithRetry(
    doFetch,
    `${API_BASE}/text:synthesize`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Goog-Api-Key': apiKey },
      body: JSON.stringify(synthesisRequest(text, voice, format)),
    },
    { ...opts, apiKey },
  );
  let json;
  try {
    json = await res.json();
  } catch {
    throw new TtsError('Response was not JSON');
  }
  if (!json || typeof json.audioContent !== 'string' || !json.audioContent) throw new TtsError('Response had no audioContent');
  const audio = Buffer.from(json.audioContent, 'base64');
  if (!isLikelyMp3(audio)) throw new TtsError(`Response audio is not a valid MP3 (${audio.length} bytes)`);
  return audio;
}

/** Cheap sanity check: an ID3 tag or an MPEG frame sync at the start, and enough bytes to hold speech. */
export function isLikelyMp3(buf) {
  if (!buf || buf.length < 1024) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // "ID3"
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
}

/** Write via a temp file and rename, so an interrupted run never leaves a half-written MP3 in place. */
export async function writeFileAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Source for the app's generated asset map. Only clips with a file on disk are listed. */
export function renderAudioManifest(entries) {
  const lines = entries.map(({ id, file }) => `  '${id}': require('@/${file}'),`);
  return [
    '// AUTO-GENERATED by scripts/generate-tts.mjs — do not edit by hand.',
    '// Maps clip ids to bundled MP3 files that exist on disk. Clips without a file play silently.',
    '// Regenerate with: npm run tts -- --manifest-only',
    '',
    `export const AUDIO_ASSETS: Partial<Record<string, number>> = {${lines.length ? `\n${lines.join('\n')}\n` : ''}};`,
    '',
  ].join('\n');
}

function extractApiMessage(body) {
  try {
    const json = JSON.parse(body);
    return json?.error?.message ?? body.slice(0, 300);
  } catch {
    return String(body).slice(0, 300);
  }
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms + Math.floor(Math.random() * 250)));
}
