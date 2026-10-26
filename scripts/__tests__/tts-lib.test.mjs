import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  TtsError,
  checkVoicesAvailable,
  clipHash,
  isLikelyMp3,
  listVoices,
  redact,
  renderAudioManifest,
  requestWithRetry,
  synthesize,
  synthesisRequest,
  validateManifest,
  writeFileAtomic,
} from '../tts-lib.mjs';

const KEY = 'AIzaFAKE-test-key-1234567890';
const VOICE = { languageCode: 'en-IN', name: 'en-IN-Chirp3-HD-Charon', speakingRate: 0.95 };
const FORMAT = { audioEncoding: 'MP3', sampleRateHertz: 24000 };
const noSleep = async () => undefined;
const mp3 = () => Buffer.concat([Buffer.from('ID3'), Buffer.alloc(2048, 1)]);

function response(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
}

/** A fetch that returns the given responses in order and records every call. */
function scriptedFetch(...steps) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
  fn.calls = calls;
  return fn;
}

const clip = (over = {}) => ({ id: 'l1.intro.sen', lesson: 'cooperation-trap', character: 'sen', style: 'narration', sync: 'screen', text: 'Hello.', ...over });

describe('Manifest validation', () => {
  it('accepts a valid manifest', () => {
    assert.deepEqual(validateManifest([clip()], { sen: VOICE }), []);
  });

  it('reports duplicates, bad ids, wrong lesson prefixes, empty text and unknown fields', () => {
    const problems = validateManifest(
      [clip(), clip(), clip({ id: 'Intro' }), clip({ id: 'l2.x' }), clip({ id: 'l1.empty', text: '  ' }), clip({ id: 'l1.style', style: 'shout' })],
      { sen: VOICE },
    );
    assert.ok(problems.some((p) => p.includes('duplicate id')));
    assert.ok(problems.some((p) => p.includes('"Intro"')));
    assert.ok(problems.some((p) => p.includes('prefix does not match lesson 1')));
    assert.ok(problems.some((p) => p.includes('empty text')));
    assert.ok(problems.some((p) => p.includes('unknown style')));
  });

  it('reports a character without a configured voice and an invalid voice config', () => {
    const problems = validateManifest([clip({ character: 'ghost' })], { sen: { ...VOICE, speakingRate: 9 } });
    assert.ok(problems.some((p) => p.includes('no voice configured for character "ghost"')));
    assert.ok(problems.some((p) => p.includes('speakingRate')));
  });

  it('reports output file collisions and over-long text', () => {
    const problems = validateManifest([clip({ id: 'l1.a-b' }), clip({ id: 'l1.a.b', text: 'x'.repeat(5001) })], { sen: VOICE }, { fileNameFor: (c) => c.id.replace(/[^a-z0-9]+/g, '_') });
    assert.ok(problems.some((p) => p.includes('collides')));
    assert.ok(problems.some((p) => p.includes('exceeds 5000 bytes')));
  });
});

describe('Voice validation', () => {
  it('flags configured voices missing from the live list', () => {
    const available = [{ name: 'en-IN-Chirp3-HD-Charon' }];
    assert.deepEqual(checkVoicesAvailable([{ label: 'sen', name: 'en-IN-Chirp3-HD-Charon' }], available), []);
    const problems = checkVoicesAvailable([{ label: 'maya', name: 'en-IN-Made-Up' }], available);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /maya: voice "en-IN-Made-Up"/);
  });

  it('lists voices with the key in a header, never in the URL', async () => {
    const fetch = scriptedFetch(response(200, { voices: [{ name: 'en-IN-Chirp3-HD-Charon' }] }));
    const voices = await listVoices(fetch, KEY, 'en-IN');
    assert.equal(voices.length, 1);
    assert.ok(!fetch.calls[0].url.includes(KEY));
    assert.equal(fetch.calls[0].init.headers['X-Goog-Api-Key'], KEY);
  });

  it('rejects a malformed voices response', async () => {
    await assert.rejects(listVoices(scriptedFetch(response(200, { nope: true })), KEY, 'en-IN'), /Unexpected voices.list/);
  });
});

describe('Synthesis', () => {
  it('builds the documented request body', () => {
    assert.deepEqual(synthesisRequest('Hi', VOICE, FORMAT), {
      input: { text: 'Hi' },
      voice: { languageCode: 'en-IN', name: 'en-IN-Chirp3-HD-Charon' },
      audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000, speakingRate: 0.95 },
    });
  });

  it('returns decoded, validated MP3 bytes', async () => {
    const fetch = scriptedFetch(response(200, { audioContent: mp3().toString('base64') }));
    const audio = await synthesize(fetch, KEY, 'Hi', VOICE, FORMAT, { sleep: noSleep });
    assert.ok(isLikelyMp3(audio));
    assert.ok(!fetch.calls[0].url.includes(KEY));
  });

  it('rejects empty or non-MP3 audio', async () => {
    await assert.rejects(synthesize(scriptedFetch(response(200, {})), KEY, 'Hi', VOICE, FORMAT), /no audioContent/);
    const junk = Buffer.alloc(4096, 0).toString('base64');
    await assert.rejects(synthesize(scriptedFetch(response(200, { audioContent: junk })), KEY, 'Hi', VOICE, FORMAT), /not a valid MP3/);
  });

  it('retries transient failures with a bounded number of attempts', async () => {
    const ok = response(200, { audioContent: mp3().toString('base64') });
    const fetch = scriptedFetch(new Error('ECONNRESET'), response(503, 'busy'), ok);
    await synthesize(fetch, KEY, 'Hi', VOICE, FORMAT, { sleep: noSleep });
    assert.equal(fetch.calls.length, 3);

    const always = scriptedFetch(response(429, { error: { message: 'quota' } }));
    await assert.rejects(requestWithRetry(always, 'u', {}, { attempts: 3, sleep: noSleep }), /gave up after 3 attempts/);
    assert.equal(always.calls.length, 3);
  });

  it('does not retry client errors and never leaks the key in errors', async () => {
    const fetch = scriptedFetch(response(400, { error: { message: `API key not valid: ${KEY}` } }));
    const error = await synthesize(fetch, KEY, 'Hi', VOICE, FORMAT, { sleep: noSleep }).catch((e) => e);
    assert.ok(error instanceof TtsError);
    assert.equal(error.status, 400);
    assert.equal(fetch.calls.length, 1);
    assert.ok(!error.message.includes(KEY));
    assert.match(error.message, /\[redacted\]/);
  });

  it('redacts keys in arbitrary text and query strings', () => {
    assert.equal(redact(`bad ${KEY} here`, KEY), 'bad [redacted] here');
    assert.equal(redact('https://x/v1/voices?key=SECRET&a=1'), 'https://x/v1/voices?key=[redacted]&a=1');
  });
});

describe('Output', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('writes atomically and leaves no temp files behind', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'tts-'));
    const file = path.join(dir, 'nested', 'clip.mp3');
    await writeFileAtomic(file, mp3());
    assert.ok(existsSync(file));
    assert.deepEqual(readdirSync(path.dirname(file)), ['clip.mp3']);
    assert.ok(isLikelyMp3(readFileSync(file)));
  });

  it('hashes change when the text or voice changes', () => {
    const base = clipHash(clip(), VOICE, FORMAT);
    assert.equal(base, clipHash(clip(), VOICE, FORMAT));
    assert.notEqual(base, clipHash(clip({ text: 'Hello!' }), VOICE, FORMAT));
    assert.notEqual(base, clipHash(clip(), { ...VOICE, name: 'en-IN-Chirp3-HD-Puck' }, FORMAT));
  });

  it('renders an app manifest with static requires only for existing files', () => {
    assert.match(renderAudioManifest([]), /AUDIO_ASSETS: Partial<Record<string, number>> = \{\};/);
    const src = renderAudioManifest([{ id: 'l1.intro.sen', file: 'assets/audio/cooperation-trap/l1_intro_sen.mp3' }]);
    assert.match(src, /'l1\.intro\.sen': require\('@\/assets\/audio\/cooperation-trap\/l1_intro_sen\.mp3'\),/);
  });
});
