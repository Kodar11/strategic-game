#!/usr/bin/env node
/**
 * Generates src/features/settings/licenses.json: the open-source licences of every production dependency, shown on
 * the in-app "Open-source licences" screen (app/licenses.tsx).
 *
 *   npm run licenses          write the file
 *   npm run licenses -- --check   exit 1 if the file is out of date (also enforced by scripts/__tests__/licenses.test.mjs)
 *
 * Source of truth: package-lock.json. Every installed package that is not marked `dev` is part of the production
 * dependency tree (the lockfile already resolves duplicates, nested versions and optional platform packages). This is
 * deliberately conservative: it includes build-time packages that `expo` depends on, rather than guessing which ones
 * end up in the binary. Development-only packages (`dev: true`) are left out.
 *
 * For each name@version (several versions of one package are listed separately): the licence from its package.json
 * (`license`, or the older `licenses` array), and the text of its LICENSE / LICENCE / COPYING file if it ships one.
 * Nothing is invented: a missing licence is recorded as "UNKNOWN" and a missing file as no text. Identical texts are
 * stored once. The output is sorted and has no timestamps, so it is deterministic.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'features', 'settings', 'licenses.json');
const LICENSE_FILE = /^(licen[cs]e|copying|unlicense)(\.(md|txt|markdown|mit|bsd|apache))?$/i;

function licenseOf(pkg) {
  if (typeof pkg.license === 'string' && pkg.license.trim()) return pkg.license.trim();
  if (pkg.license && typeof pkg.license === 'object' && typeof pkg.license.type === 'string') return pkg.license.type;
  if (Array.isArray(pkg.licenses)) {
    const types = pkg.licenses.map((l) => (typeof l === 'string' ? l : l?.type)).filter((t) => typeof t === 'string' && t.trim());
    if (types.length) return types.length === 1 ? types[0] : `(${types.join(' OR ')})`;
  }
  return 'UNKNOWN';
}

function licenseText(dir) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort();
  } catch {
    return null;
  }
  for (const f of files) {
    try {
      const text = readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim();
      if (text) return text;
    } catch {
      // Unreadable: try the next candidate.
    }
  }
  return null;
}

export function buildLicenses(root = ROOT) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const own = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;
  const byKey = new Map();
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path || entry.dev || entry.link) continue; // the root project, dev-only packages, workspace links
    const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (name === own) continue;
    const dir = join(root, path);
    let pkg = {};
    try {
      pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch {
      // Listed in the lockfile but not installed here (an optional package for another platform). Its lockfile
      // `license` is still authoritative; there is no text to read.
    }
    const version = pkg.version ?? entry.version ?? 'unknown';
    const key = `${name}@${version}`;
    if (byKey.has(key)) continue;
    const license = pkg.name ? licenseOf(pkg) : typeof entry.license === 'string' ? entry.license : 'UNKNOWN';
    byKey.set(key, { name, version, license, text: pkg.name ? licenseText(dir) : null });
  }

  const texts = [];
  const textIndex = new Map();
  const packages = [...byKey.values()]
    .sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)))
    .map(({ name, version, license, text }) => {
      let t = null;
      if (text) {
        if (!textIndex.has(text)) {
          textIndex.set(text, texts.length);
          texts.push(text);
        }
        t = textIndex.get(text);
      }
      return { name, version, license, text: t };
    });
  return { packages, texts };
}

export function serialize(data) {
  return `${JSON.stringify(data)}\n`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]);
if (isMain) {
  const next = serialize(buildLicenses());
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUT, 'utf8');
    } catch {
      // Missing counts as out of date.
    }
    if (current !== next) {
      console.error('src/features/settings/licenses.json is out of date. Run: npm run licenses');
      process.exit(1);
    }
    console.log('licenses.json is up to date.');
  } else {
    writeFileSync(OUT, next);
    const { packages, texts } = JSON.parse(next);
    console.log(`Wrote ${packages.length} packages (${texts.length} distinct licence texts, ${packages.filter((p) => p.license === 'UNKNOWN').length} with no licence field) to src/features/settings/licenses.json (${(next.length / 1024).toFixed(0)} KB).`);
  }
}
