import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ARENA_IDS } from '../../arena/core.ts';
import { countUpValues, revealDelays, shouldGuardLeave } from '../../components/game/reveal-plan.ts';
import { GAME_IDS } from '../core.ts';
import { LIBRARY_COUNT, LIBRARY_GROUPS, STARTER_GAMES, UNLISTED } from '../library.ts';
import { READ_POINTS, readCopy, readPointsFor } from '../read-rules.ts';

describe('the games library', () => {
  it('lists all 23 games exactly once (22 in the groups, the quick Ultimatum through its related game)', () => {
    const ids = [...LIBRARY_GROUPS.flatMap((g) => g.games), ...UNLISTED].map((x) => `${x.kind}:${x.id}`);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(LIBRARY_COUNT, 22);
    assert.equal(ids.length, 23);
    for (const id of GAME_IDS) assert.ok(ids.includes(`classic:${id}`), id);
    for (const id of ARENA_IDS) assert.ok(ids.includes(`arena:${id}`), id);
    // The starter set is eight listed games.
    assert.equal(STARTER_GAMES.length, 8);
    for (const e of STARTER_GAMES) assert.ok(LIBRARY_GROUPS.some((g) => g.games.some((x) => x.kind === e.kind && x.id === e.id)), e.id);
  });
});

describe('staged reveals', () => {
  it('reduced motion shows every step at once', () => {
    assert.deepEqual(revealDelays(4, 300, true), [0, 0, 0, 0]);
    assert.deepEqual(countUpValues(7, 10, true), [7]);
  });
  it('steps run in order with full motion', () => {
    assert.deepEqual(revealDelays(3, 100, false, 50), [50, 150, 250]);
  });
  it('a count-up always ends on the real value', () => {
    for (const to of [0, 1, 5, 7, -1, 23]) assert.equal(countUpValues(to, 10, false).at(-1), to);
  });
});

describe('leaving a match', () => {
  it('warns only while a match is in progress, and only until confirmed', () => {
    assert.equal(shouldGuardLeave(false, false, false), false);
    assert.equal(shouldGuardLeave(true, false, false), true);
    assert.equal(shouldGuardLeave(true, true, false), false);
    assert.equal(shouldGuardLeave(true, false, true), false);
  });
});

describe('reading an opponent', () => {
  it('uses one set of words whatever the game', () => {
    const a = readCopy('your opponent', 'its bids', 2);
    assert.match(a.waiting, /after 2 more rounds/);
    assert.match(a.body, new RegExp(`\\+${READ_POINTS} Insight Points`));
    assert.match(readCopy('the crowd', undefined, 1).waiting, /after 1 more round for/);
  });
  it('only a right read earns points', () => {
    assert.equal(readPointsFor('correct'), READ_POINTS);
    assert.equal(readPointsFor('incorrect'), 0);
    assert.equal(readPointsFor('unscored'), 0);
  });
});
