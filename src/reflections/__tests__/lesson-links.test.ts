import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { COMPETITION_GAME_IDS } from '../../competition/catalog.ts';
import { LESSON_IDS } from '../../content/lessons.ts';
import { REFLECTIONS } from '../registry.ts';

/**
 * Every reflection's "learn more" destination must be a lesson players can actually open. The seed catalogue
 * (supabase/seed/content.json) is the source of truth for what is published: content_admin.import_content inserts
 * every seed row as published unless the row says `"status": "draft"`, and a lesson in an unpublished module is not
 * shown either. The reflection card also checks the loaded catalogue at runtime (ReflectionCard.tsx) — this test makes
 * a broken or unpublished link fail before release instead of silently disappearing.
 */

interface SeedRow {
  id: string;
  status?: string;
  module?: string;
}
const seed = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'supabase', 'seed', 'content.json'), 'utf8')) as {
  lessons: SeedRow[];
  modules: SeedRow[];
};
const published = (row: SeedRow | undefined) => !!row && (row.status ?? 'published') === 'published';
const modules = new Map(seed.modules.map((m) => [m.id, m]));
const lessons = new Map(seed.lessons.map((l) => [l.id, l]));

/** Every lesson a game's reflections can link to: the game's own, and any rule's override. */
function linkedLessons(): { game: string; where: string; lesson: string }[] {
  const out: { game: string; where: string; lesson: string }[] = [];
  for (const [game, spec] of Object.entries(REFLECTIONS)) {
    if (spec.lesson) out.push({ game, where: 'game', lesson: spec.lesson });
    for (const rule of spec.rules) {
      if (rule.lesson) out.push({ game, where: `rule ${rule.id}`, lesson: rule.lesson });
    }
  }
  return out;
}

describe('reflection lesson links', () => {
  it('every game in the canonical registry has reflections with a lesson link', () => {
    assert.equal(COMPETITION_GAME_IDS.length, 23);
    assert.deepEqual([...COMPETITION_GAME_IDS].sort(), Object.keys(REFLECTIONS).sort());
    for (const g of COMPETITION_GAME_IDS) assert.ok(REFLECTIONS[g as keyof typeof REFLECTIONS].lesson, `${g} has no lesson link`);
  });

  it('every linked lesson is a canonical lesson id', () => {
    for (const l of linkedLessons()) assert.ok((LESSON_IDS as readonly string[]).includes(l.lesson), `${l.game} (${l.where}) → ${l.lesson}`);
  });

  it('every linked lesson exists in the seed catalogue and is published, in a published module', () => {
    for (const l of linkedLessons()) {
      const row = lessons.get(l.lesson);
      assert.ok(row, `${l.game} (${l.where}) links ${l.lesson}, which isn't in supabase/seed/content.json`);
      assert.ok(published(row), `${l.game} (${l.where}) links ${l.lesson}, which is not published`);
      assert.ok(published(modules.get(row!.module ?? '')), `${l.game} (${l.where}) links ${l.lesson}, whose module ${row!.module} is not published`);
    }
  });

  it('the check fails when a linked lesson is removed or unpublished', () => {
    const target = REFLECTIONS.defusal.lesson!;
    const without = new Map(lessons);
    without.delete(target);
    assert.equal(without.get(target), undefined);
    assert.equal(published({ id: target, status: 'draft' }), false);
    assert.equal(published({ id: target }), true);
  });
});
