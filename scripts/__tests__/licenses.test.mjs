import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildLicenses, serialize } from '../generate-licenses.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const FILE = path.join(ROOT, 'src', 'features', 'settings', 'licenses.json');

describe('open-source licences (scripts/generate-licenses.mjs)', () => {
  const built = buildLicenses(ROOT);

  it('the committed licenses.json matches the installed production dependencies (run `npm run licenses` if not)', () => {
    assert.equal(readFileSync(FILE, 'utf8'), serialize(built));
  });

  it('is deterministic', () => {
    assert.equal(serialize(buildLicenses(ROOT)), serialize(built));
  });

  it('lists the production tree and leaves out development-only packages', () => {
    const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const names = new Set(built.packages.map((p) => p.name));
    for (const dep of Object.keys(pkg.dependencies)) assert.ok(names.has(dep), `${dep} missing`);
    for (const [p, e] of Object.entries(lock.packages)) {
      if (!p || !e.dev) continue;
      const name = p.slice(p.lastIndexOf('node_modules/') + 'node_modules/'.length);
      const alsoProd = Object.entries(lock.packages).some(([q, f]) => q !== p && !f.dev && q.endsWith(`node_modules/${name}`));
      if (!alsoProd) assert.ok(!names.has(name), `dev-only ${name} listed`);
    }
    assert.ok(!names.has(pkg.name), 'the app itself is not a dependency');
  });

  it('every entry is well-formed; texts are referenced, deduplicated and never invented', () => {
    const keys = new Set();
    for (const p of built.packages) {
      assert.equal(typeof p.name, 'string');
      assert.equal(typeof p.version, 'string');
      assert.ok(typeof p.license === 'string' && p.license.length > 0);
      assert.ok(p.text === null || (Number.isInteger(p.text) && p.text >= 0 && p.text < built.texts.length));
      const key = `${p.name}@${p.version}`;
      assert.ok(!keys.has(key), `duplicate ${key}`);
      keys.add(key);
    }
    assert.equal(new Set(built.texts).size, built.texts.length);
    const used = new Set(built.packages.map((p) => p.text).filter((t) => t !== null));
    assert.equal(used.size, built.texts.length, 'no orphan texts');
  });

  it('keeps several installed versions of one package apart', () => {
    const versions = new Map();
    for (const p of built.packages) versions.set(p.name, [...(versions.get(p.name) ?? []), p.version]);
    for (const [name, vs] of versions) assert.equal(new Set(vs).size, vs.length, name);
  });
});
