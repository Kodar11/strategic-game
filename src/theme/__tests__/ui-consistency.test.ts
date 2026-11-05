import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

import { MAX_FONT_SCALE } from '../tokens.ts';

/** Source-level guards for text scaling, navigation terms and empty states (the pre-launch UI polish). */

const ROOT = join(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const tsx = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' || f === 'node_modules' ? [] : tsx(p);
    return f.endsWith('.tsx') ? [p] : [];
  });
const UI = [...tsx(join(ROOT, 'app')), ...tsx(join(ROOT, 'src'))];

describe('text scaling', () => {
  it('all app text follows the system font size up to 1.6×, and scaling is never switched off', () => {
    assert.equal(MAX_FONT_SCALE, 1.6);
    const appText = read('src', 'components', 'ui', 'AppText.tsx');
    assert.match(appText, /maxFontSizeMultiplier = MAX_FONT_SCALE/);
    assert.match(appText, /maxFontSizeMultiplier=\{maxFontSizeMultiplier\}/);
    for (const f of UI) assert.doesNotMatch(readFileSync(f, 'utf8'), /allowFontScaling=\{false\}/, relative(ROOT, f));
  });

  it('every text input is capped the same way', () => {
    for (const f of UI) {
      const text = readFileSync(f, 'utf8');
      const inputs = text.match(/<TextInput\b/g)?.length ?? 0;
      const capped = text.match(/<TextInput\s+maxFontSizeMultiplier=\{MAX_FONT_SCALE\}/g)?.length ?? 0;
      assert.equal(capped, inputs, relative(ROOT, f));
    }
  });

  it('buttons render their labels with AppText (so they inherit the cap)', () => {
    const button = read('src', 'components', 'ui', 'Button.tsx');
    assert.ok(!/<Text\b/.test(button));
    assert.match(button, /<AppText/);
  });
});

describe('navigation terms', () => {
  const tabs = read('app', '(tabs)', '_layout.tsx');
  const titles = [...tabs.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);

  it('the tabs are Learn, Games, Stories and Profile', () => {
    assert.deepEqual(titles, ['Learn', 'Games', 'Stories', 'Profile']);
  });

  it('onboarding names the tabs exactly as the tab bar does', () => {
    const world = read('src', 'features', 'onboarding', 'ui', 'WorldStage.tsx');
    const overlines = [...world.matchAll(/<PillarText overline="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(overlines, ['Learn', 'Games', 'Stories']);
    for (const t of overlines) assert.ok(titles.includes(t));
    for (const m of world.matchAll(/accessibilityLabel=\{`(\w+) tab\./g)) assert.ok(titles.includes(m[1]), m[1]);
  });

  it('no screen refers to a tab that doesn’t exist', () => {
    for (const f of UI) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\b(Home|Play|Explore|Learn|Games|Stories|Profile) tab\b/g)) {
        assert.ok(titles.includes(m[1]), `${relative(ROOT, f)}: "${m[0]}"`);
      }
    }
  });
});

describe('empty states', () => {
  it('lists with nothing in them use the one EmptyState pattern (icon, one sentence, at most one action)', () => {
    const empty = read('src', 'components', 'ui', 'EmptyState.tsx');
    assert.match(empty, /action\?: \{ label: string; onPress: \(\) => void \}/);
    const users = [
      ['app', 'competitions', 'index.tsx'],
      ['app', 'daily', 'history.tsx'],
      ['app', 'leaderboard.tsx'],
      ['app', 'report', 'history.tsx'],
    ];
    for (const p of users) {
      const text = read(...p);
      assert.match(text, /<EmptyState/, p.join('/'));
      for (const m of text.matchAll(/<EmptyState[^>]*?text="([^"]+)"/g)) {
        assert.ok(m[1].split(/(?<=\.)\s/).length <= 2, `${p.join('/')}: keep empty-state text short: ${m[1]}`);
        assert.ok(m[1].length <= 90, `${p.join('/')}: ${m[1]}`);
      }
    }
  });
});
