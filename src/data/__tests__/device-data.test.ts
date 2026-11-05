import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Local data inventory (src/data/device-data.ts) beyond AsyncStorage keys, which arena-sync.test.ts already checks:
 * files written with expo-file-system, what sign-out and deletion clear, and what they must keep.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' || f === 'node_modules' ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
const SOURCES = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'app'))];
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const inventory = read('src', 'data', 'device-data.ts');

describe('local data on the device', () => {
  it('every module that writes files with expo-file-system is known and its files are in the inventory', () => {
    const writers = SOURCES.filter((f) => /from 'expo-file-system'/.test(readFileSync(f, 'utf8')) && /new File\(|\.write\(|\.create\(/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(writers.map((f) => relative(ROOT, f).replaceAll('\\', '/')), ['src/features/learning/shareFile.ts']);
    assert.match(inventory, /'cache\/strategic-thinking-data-<date>\.json', scope: 'account'/);
  });

  it('the export file written for sharing is removed with the account’s data', () => {
    const share = read('src', 'features', 'learning', 'shareFile.ts');
    const records = read('src', 'features', 'learning', 'records.ts');
    // The cleanup pattern matches exactly the names exportFileName produces.
    const pattern = /export const EXPORT_FILE_PATTERN = (\/.+\/);/.exec(share)![1];
    const re = new RegExp(pattern.slice(1, -1));
    assert.match(records, /return `strategic-thinking-data-\$\{now\.getFullYear\(\)\}/);
    assert.ok(re.test('strategic-thinking-data-2026-11-06.json'));
    assert.ok(!re.test('other.json') && !re.test('strategic-thinking-data-2026-11-06.json.bak'));
    assert.match(inventory, /export async function clearAccountDeviceData\(\): Promise<void> \{\n\s+await arenaUploads\.clear\(\);\n\s+clearExportFiles\(\);/);
    assert.match(read('src', 'features', 'learning', 'shareFile.web.ts'), /export function clearExportFiles\(\): void \{\}/);
  });

  it('no audio is downloaded or cached by the app (story audio and narration play bundled files)', () => {
    for (const f of SOURCES) {
      const text = readFileSync(f, 'utf8');
      assert.doesNotMatch(text, /downloadAsync|File\.downloadFileAsync|\bfetch\([^)]*\.(mp3|m4a|wav)/, relative(ROOT, f));
    }
  });

  it('sign-out and deletion clear account data but keep device preferences, including the analytics choice', () => {
    const clear = /export async function clearAccountDeviceData[\s\S]*?\n\}/.exec(inventory)![0];
    assert.doesNotMatch(clear, /strategic-game\/settings|usageConsent|setSetting/);
    const session = read('src', 'data', 'session.ts');
    const guest = /async function becomeGuest[\s\S]*?\n\}/.exec(session)![0];
    // Only the welcome flag is reset after a deletion; the analytics choice stays with the phone.
    assert.match(guest, /if \(welcomeAgain\) useProgress\.getState\(\)\.setSetting\('onboarded', false\);/);
    assert.doesNotMatch(guest, /usageConsent/);
  });

  it('the inventory lists the analytics choice as a device preference, under its current name', () => {
    assert.match(inventory, /'strategic-game\/settings', scope: 'device', what: '[^']*usageConsent/);
    assert.doesNotMatch(inventory, /Share usage and crash data/);
  });
});
