/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LESSON_IDS } from '../../../content/lessons.ts';
import { LESSON_BRIDGES, lessonBridge } from '../game-bridge.ts';

describe('Lesson → game bridges', () => {
  it('lesson 1 leads to Split or Steal on Easy', () => {
    const b = lessonBridge('cooperation-trap');
    assert.equal(b?.title, 'Split or Steal');
    assert.deepEqual(b?.href, { pathname: '/games/[gameId]', params: { gameId: 'split-steal', difficulty: 'easy' } });
  });

  it('arena bridges open the arena setup screen with a level', () => {
    assert.deepEqual(lessonBridge('auctions')?.href, { pathname: '/arena/[gameId]', params: { gameId: 'auction', level: 'easy' } });
  });

  it('lessons with no honest match get no card', () => {
    for (const id of ['evolution', 'war-of-attrition', 'brinkmanship'] as const) assert.equal(lessonBridge(id), undefined);
  });

  it('every bridge resolves to a real game with a title and a hook', () => {
    const mapped = LESSON_IDS.filter((id) => LESSON_BRIDGES[id]);
    assert.equal(mapped.length, 19);
    for (const id of mapped) {
      const b = lessonBridge(id);
      assert.ok(b, id);
      assert.ok(b.title.length > 0 && b.hook.length > 0, id);
    }
  });
});
