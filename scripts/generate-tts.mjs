#!/usr/bin/env node
// Pre-generates narration MP3s with Google Cloud Text-to-Speech. Run locally only; the app never calls the API.
// Usage and options: docs/AUDIO.md, or `npm run tts -- --help`.
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  TtsError,
  checkVoicesAvailable,
  clipHash,
  isLikelyMp3,
  listVoices,
  redact,
  renderAudioManifest,
  synthesize,
  validateManifest,
  writeFileAtomic,
} from './tts-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_FILE = path.join(ROOT, 'assets/audio/clips.lock.json');
const APP_MANIFEST = path.join(ROOT, 'src/features/audio/audio-manifest.ts');
const AUDITION_DIR = path.join(ROOT, '.tts-audition');

const HELP = `Generate narration audio with Google Cloud Text-to-Speech.

  npm run tts -- [options]

  (no options)            Generate every clip that has no audio file yet.
  --dry-run               Validate the manifest and show what would be generated. No API calls, no writes.
  --manifest-only         Rebuild src/features/audio/audio-manifest.ts from files on disk. No API calls.
  --list-voices [lang]    Print available voices (default en-IN).
  --audition [character]  Generate the voice audition set into .tts-audition/ (not bundled).
  --only <id,id,...>      Limit to these clip ids.
  --lesson <lesson-id>    Limit to one lesson.
  --force                 Regenerate the selected clips even if files exist. Needs --only or --lesson.
  --force-all             Regenerate the entire library. Explicit on purpose.
  --help                  Show this help.

Reads GOOGLE_TTS_API_KEY from the environment or the root .env file.`;

function parseArgs(argv) {
  const args = { only: null, lesson: null, force: false, forceAll: false, dryRun: false, manifestOnly: false, listVoices: null, audition: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : null);
    if (a === '--only') args.only = (next() ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--lesson') args.lesson = next();
    else if (a === '--force') args.force = true;
    else if (a === '--force-all') args.forceAll = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--manifest-only') args.manifestOnly = true;
    else if (a === '--list-voices') args.listVoices = next() ?? 'en-IN';
    else if (a === '--audition') args.audition = next() ?? 'all';
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  if (args.force && !args.only && !args.lesson) throw new Error('--force needs --only or --lesson. Use --force-all to regenerate everything.');
  return args;
}

function loadApiKey() {
  const envFile = path.join(ROOT, '.env');
  if (existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      throw new Error('Could not read .env (check its syntax).');
    }
  }
  const key = process.env.GOOGLE_TTS_API_KEY?.trim();
  if (!key) throw new Error('GOOGLE_TTS_API_KEY is not set. Copy .env.example to .env and add your key.');
  return key;
}

async function loadSources() {
  const clipsMod = await import(pathToFileURL(path.join(ROOT, 'src/features/audio/clips.ts')).href);
  const voicesMod = await import(pathToFileURL(path.join(ROOT, 'src/features/audio/voices.ts')).href);
  return { ...clipsMod, ...voicesMod };
}

async function readLock() {
  try {
    return JSON.parse(await fs.readFile(LOCK_FILE, 'utf8'));
  } catch {
    return { version: 1, clips: {} };
  }
}

async function writeLock(lock) {
  const sorted = Object.fromEntries(Object.entries(lock.clips).sort(([a], [b]) => a.localeCompare(b)));
  await writeFileAtomic(LOCK_FILE, `${JSON.stringify({ version: 1, clips: sorted }, null, 2)}\n`);
}

async function writeAppManifest(CLIPS, clipOutputPath) {
  const entries = [];
  for (const clip of CLIPS) {
    const file = clipOutputPath(clip);
    if (existsSync(path.join(ROOT, file))) entries.push({ id: clip.id, file });
  }
  await writeFileAtomic(APP_MANIFEST, renderAudioManifest(entries));
  return entries.length;
}

async function validateConfiguredVoices(apiKey, voiceList) {
  const byLang = new Map();
  for (const v of voiceList) byLang.set(v.languageCode, [...(byLang.get(v.languageCode) ?? []), v]);
  const problems = [];
  for (const [lang, configured] of byLang) {
    const available = await listVoices(fetch, apiKey, lang);
    problems.push(...checkVoicesAvailable(configured, available));
  }
  return problems;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return console.log(HELP);

  const { CLIPS, VOICES, AUDIO_FORMAT, AUDITION_LINES, MANIFEST_VERSION, clipOutputPath } = await loadSources();
  const problems = validateManifest(CLIPS, VOICES, { fileNameFor: clipOutputPath });
  if (problems.length) {
    console.error(`Manifest has ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }

  if (args.manifestOnly) {
    const n = await writeAppManifest(CLIPS, clipOutputPath);
    return console.log(`Wrote audio-manifest.ts with ${n} of ${CLIPS.length} clips.`);
  }

  if (args.listVoices) {
    const voices = await listVoices(fetch, loadApiKey(), args.listVoices);
    for (const v of voices.sort((a, b) => a.name.localeCompare(b.name))) console.log(`${v.name}\t${v.ssmlGender}\t${v.naturalSampleRateHertz} Hz`);
    return;
  }

  if (args.audition) {
    const apiKey = loadApiKey();
    const characters = args.audition === 'all' ? Object.keys(VOICES) : [args.audition];
    const configured = [];
    for (const c of characters) {
      if (!VOICES[c]) throw new Error(`Unknown character "${c}"`);
      for (const name of VOICES[c].auditionCandidates) configured.push({ label: `${c} candidate`, name, languageCode: VOICES[c].languageCode });
    }
    const voiceProblems = await validateConfiguredVoices(apiKey, configured);
    if (voiceProblems.length) console.warn(`Skipping unavailable voices:\n  ${voiceProblems.join('\n  ')}`);
    const bad = new Set(voiceProblems.map((p) => p.match(/"([^"]+)"/)?.[1]));
    for (const c of characters) {
      for (const name of VOICES[c].auditionCandidates.filter((n) => !bad.has(n))) {
        for (const line of AUDITION_LINES) {
          const file = path.join(AUDITION_DIR, c, `${name}-${line.id}.mp3`);
          const audio = await synthesize(fetch, apiKey, line.text, { ...VOICES[c], name }, AUDIO_FORMAT);
          await writeFileAtomic(file, audio);
        }
        console.log(`  ${c}: ${name}`);
      }
    }
    return console.log(`Audition files written to ${path.relative(ROOT, AUDITION_DIR)}/ (git-ignored, not bundled).`);
  }

  // Select clips.
  let selected = CLIPS;
  if (args.only) {
    const unknown = args.only.filter((id) => !CLIPS.some((c) => c.id === id));
    if (unknown.length) throw new Error(`Unknown clip id(s): ${unknown.join(', ')}`);
    selected = CLIPS.filter((c) => args.only.includes(c.id));
  }
  if (args.lesson) selected = selected.filter((c) => c.lesson === args.lesson);
  if (!selected.length) throw new Error('No clips match the selection.');

  const lock = await readLock();
  const plan = selected.map((clip) => {
    const voice = VOICES[clip.character];
    const file = clipOutputPath(clip);
    const hash = clipHash(clip, voice, AUDIO_FORMAT);
    const exists = existsSync(path.join(ROOT, file));
    const stale = exists && lock.clips[clip.id]?.hash !== hash;
    const regenerate = args.forceAll || args.force || !exists;
    return { clip, voice, file, hash, exists, stale, regenerate };
  });

  const todo = plan.filter((p) => p.regenerate);
  const stale = plan.filter((p) => p.stale && !p.regenerate);
  console.log(`Manifest v${MANIFEST_VERSION}: ${CLIPS.length} clips. Selected ${plan.length}; ${todo.length} to generate, ${plan.length - todo.length} already present.`);
  if (stale.length) console.log(`Stale (text or voice changed since generation): ${stale.map((p) => p.clip.id).join(', ')}\n  Regenerate with --only <ids> --force.`);

  if (args.dryRun) {
    for (const p of todo) console.log(`  would generate ${p.clip.id} → ${p.file} [${p.voice.name}]`);
    return;
  }
  if (!todo.length) {
    const n = await writeAppManifest(CLIPS, clipOutputPath);
    return console.log(`Nothing to generate. audio-manifest.ts lists ${n} clips.`);
  }

  const apiKey = loadApiKey();
  const voiceProblems = await validateConfiguredVoices(
    apiKey,
    [...new Set(todo.map((p) => p.clip.character))].map((c) => ({ label: c, name: VOICES[c].name, languageCode: VOICES[c].languageCode })),
  );
  if (voiceProblems.length) {
    console.error(`Voice check failed — nothing generated:\n  ${voiceProblems.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }

  const failed = [];
  let bytes = 0;
  for (const [i, p] of todo.entries()) {
    try {
      const audio = await synthesize(fetch, apiKey, p.clip.text, p.voice, AUDIO_FORMAT);
      await writeFileAtomic(path.join(ROOT, p.file), audio);
      const written = await fs.readFile(path.join(ROOT, p.file));
      if (!isLikelyMp3(written)) throw new TtsError('Written file failed MP3 validation');
      lock.clips[p.clip.id] = { hash: p.hash, voice: p.voice.name, bytes: audio.length };
      bytes += audio.length;
      console.log(`  [${i + 1}/${todo.length}] ${p.clip.id} (${(audio.length / 1024).toFixed(1)} KB)`);
      // Persist progress as we go, so an interrupted run keeps its finished clips.
      await writeLock(lock);
    } catch (error) {
      failed.push(p.clip.id);
      console.error(`  [${i + 1}/${todo.length}] ${p.clip.id} FAILED: ${redact(error?.message ?? error, apiKey)}`);
      if (error instanceof TtsError && (error.status === 401 || error.status === 403)) {
        console.error('  Authentication or permission error — stopping. Check the key and its API restrictions.');
        failed.push(...todo.slice(i + 1).map((t) => t.clip.id));
        break;
      }
    }
  }

  const n = await writeAppManifest(CLIPS, clipOutputPath);
  console.log(`Generated ${todo.length - failed.length} clip(s), ${(bytes / 1024).toFixed(0)} KB. audio-manifest.ts lists ${n} clips.`);
  if (failed.length) {
    console.error(`Failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(redact(error?.message ?? error, process.env.GOOGLE_TTS_API_KEY));
  process.exitCode = 1;
});
