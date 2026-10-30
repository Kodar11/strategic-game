#!/usr/bin/env node
// Downloads the recorded sources for the Stories soundscape into .audio-src/ (git-ignored) and writes
// .audio-src/credits.json. Each sound's own Freesound page must say Creative Commons 0, or the script stops.
// Uses the public high-quality MP3 previews, which need no account. Run: npm run stories:audio:fetch
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../.audio-src');
const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (Tactiqo story-audio fetch)' } };
const sources = JSON.parse(await fs.readFile(path.join(HERE, 'sources.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function text(url) {
  const res = await fetch(url, UA);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return { body: await res.text(), url: res.url };
}

/** Reads the sound's own page: author, title, license and preview. Refuses anything that is not CC0. */
async function inspect(id) {
  const { body, url } = await text(`https://freesound.org/s/${id}/`);
  const clean = body.replace(/\s+/g, ' ');
  const author = url.match(/people\/([^/]+)\//)?.[1];
  const title = clean.match(/<title>\s*Freesound - &quot;(.*?)&quot;/)?.[1] ?? clean.match(/<title>(.*?)<\/title>/)?.[1];
  const licenseLink = clean.match(/creativecommons\.org\/(publicdomain\/zero|licenses\/[a-z-]+)\/[0-9.]+/)?.[0];
  if (!licenseLink?.includes('publicdomain/zero')) throw new Error(`Sound ${id} (${title}) is not CC0: ${licenseLink}`);
  const mp3 = clean.match(/https:\/\/cdn\.freesound\.org\/previews\/\d+\/\d+_\d+-hq\.mp3/)?.[0] ?? clean.match(/https:\/\/cdn\.freesound\.org\/previews\/\d+\/\d+_\d+-lq\.mp3/)?.[0]?.replace('-lq', '-hq');
  if (!mp3) throw new Error(`No preview found for ${id}`);
  return { id, title, author, license: 'CC0 1.0', licenseUrl: `https://${licenseLink}/`, page: url, mp3 };
}

async function grab(file, info) {
  const target = path.join(OUT, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (!existsSync(target)) {
    const res = await fetch(info.mp3, UA);
    if (!res.ok) throw new Error(`${res.status} downloading ${info.mp3}`);
    await fs.writeFile(target, Buffer.from(await res.arrayBuffer()));
    await sleep(300);
  }
  return { file, ...info, bytes: (await fs.stat(target)).size };
}

const credits = [];
for (const group of ['ambience', 'sfx']) {
  for (const [name, id] of Object.entries(sources[group])) {
    const row = await grab(`${group}/${name}.mp3`, await inspect(id));
    credits.push({ name, group, ...row });
    console.log(`${group}/${name}: ${row.title} — ${row.author} (${(row.bytes / 1024).toFixed(0)} KB)`);
  }
}

// The piano pack (TEDAgame, "88 piano keys, long reverb"): only the notes the scores need.
for (const [note, id] of Object.entries(sources.piano.notes)) {
  const row = await grab(`piano/${note}.mp3`, await inspect(id));
  credits.push({ name: note, group: 'piano', ...row });
  console.log(`piano/${note}: ${row.author} (${(row.bytes / 1024).toFixed(0)} KB)`);
}
await fs.writeFile(path.join(OUT, 'credits.json'), `${JSON.stringify(credits, null, 2)}\n`);
console.log(`\n${credits.length} sources, all CC0.`);
