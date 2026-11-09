import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ARENA_IDS } from '../../arena/core.ts';
import { ARENA_ENGINES } from '../../arena/registry.ts';
import { ARENA_DOSSIERS, DOSSIER_PAGE } from '../dossiers.ts';
import { STAR_KINDS, award, gameKey, gameStars, parseMastery, starCount, starsEarned } from '../rules.ts';

const win = { system: 'arena' as const, game: 'market', opponent: 'banker', level: 'normal', outcome: 'win' as const };

describe('mastery stars', () => {
  it('a win earns "beat", a Hard win also "hard", a right read "read"; draws and losses earn nothing', () => {
    assert.deepEqual(starsEarned(win), ['beat']);
    assert.deepEqual(starsEarned({ ...win, level: 'hard' }), ['beat', 'hard']);
    assert.deepEqual(starsEarned({ ...win, outcome: 'draw' }), []);
    assert.deepEqual(starsEarned({ ...win, outcome: 'loss', readCorrect: true }), ['read']);
    assert.deepEqual(starsEarned({ ...win, outcome: null, readCorrect: true }), ['read']);
  });

  it('awards only new stars, never takes one back, and keeps games and opponents apart', () => {
    let { map, fresh } = award({}, { ...win, level: 'hard' });
    assert.deepEqual(fresh, ['beat', 'hard']);
    const again = award(map, { ...win, level: 'hard' });
    assert.deepEqual(again.fresh, []);
    assert.equal(again.map, map, 'unchanged map is the same object');
    ({ map, fresh } = award(map, { ...win, outcome: 'loss' }));
    assert.equal(starCount(map[gameKey('arena', 'market')].banker), 2);
    ({ map } = award(map, { ...win, opponent: 'investor', outcome: null, readCorrect: true }));
    ({ map } = award(map, { ...win, system: 'classic', game: 'rps', opponent: 'counter' }));
    assert.deepEqual(gameStars(map, 'arena', 'market', ['investor', 'banker', 'dealmaker', 'opportunist']), { held: 3, total: 12 });
    assert.deepEqual(gameStars(map, 'classic', 'rps', ['counter']), { held: 1, total: 3 });
  });

  it('a stored map is validated', () => {
    const parsed = parseMastery({
      'arena:market': { banker: { beat: true, hard: true, bogus: true }, investor: { beat: 'yes' }, 'bad id!': { beat: true } },
      'weird:key': { x: { beat: true } },
      'classic:rps': 'nope',
    });
    assert.deepEqual(parsed, { 'arena:market': { banker: { beat: true, hard: true } } });
    assert.deepEqual(parseMastery(null), {});
  });
});

describe('rival dossiers', () => {
  it('every Arena opponent has all three pages, each a full sentence', () => {
    for (const id of ARENA_IDS) {
      const pages = ARENA_DOSSIERS[id];
      assert.deepEqual(Object.keys(pages).sort(), [...ARENA_ENGINES[id].opponents].sort(), `${id}: dossiers match the opponents`);
      for (const [opp, d] of Object.entries(pages))
        for (const k of STAR_KINDS) {
          const text = d[DOSSIER_PAGE[k].key];
          assert.ok(text.length >= 20 && /[.!?]$/.test(text), `${id}/${opp}/${k}: "${text}"`);
        }
    }
  });
});
