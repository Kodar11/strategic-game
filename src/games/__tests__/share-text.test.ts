/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GAMES, GAME_ORDER, personality, takeaway } from '../catalog.ts';
import { GAME_IDS } from '../core.ts';
import { ENGINES } from '../registry.ts';
import { inviteText, resultShareText } from '../share-text.ts';

describe('share and invite text', () => {
  it('describes the result in a short line with no identifiers', () => {
    const t = resultShareText('split-steal', 'retaliator', 'hard', 'loss', { player: 22, bot: 38 });
    assert.match(t, /The Retaliator \(Hard\) beat me at Split or Steal, 22–38 in coins\./);
    assert.ok(t.length < 200);
    assert.doesNotMatch(t, /seed|[0-9a-f]{8}-[0-9a-f]{4}|user/i);
    assert.match(resultShareText('rps', 'counter', 'easy', 'win', { player: 20, bot: 14 }), /^I beat The Counter \(Easy\) at Rock, Paper, Scissors, 20–14 on points\./);
    assert.match(resultShareText('two-thirds', 'deep', 'medium', 'loss', { player: 41, bot: 3 }), /41 points out of 100/);
    assert.match(t, /Played on Tactiqo\.$/);
  });

  it('invites without claiming anything the friend hasn’t done', () => {
    assert.equal(inviteText('stag-hunt', 'conditional', 'medium', null), 'I challenge you to Stag Hunt on Tactiqo: same opponent — The Conditional Partner (Medium) — and the same luck for both of us. Can you beat it?');
    assert.match(inviteText('rps', 'counter', 'hard', 27), /I scored 27\./);
  });
});

describe('catalog', () => {
  it('describes every game and every bot the engines have', () => {
    assert.deepEqual([...GAME_ORDER].sort(), [...GAME_IDS].sort());
    for (const id of GAME_IDS) {
      assert.deepEqual(GAMES[id].personalities.map((p) => p.id), [...ENGINES[id].bots], id);
      for (const bot of ENGINES[id].bots) assert.ok(personality(id, bot)?.name, `${id}/${bot}`);
      for (const o of ['win', 'loss', 'draw'] as const) assert.ok(takeaway(id, o, { player: 10, bot: 10 }, ENGINES[id].rounds).length > 20);
    }
  });

  it('never claims one strategy always wins', () => {
    for (const id of GAME_IDS) {
      const text = [GAMES[id].concept, ...GAMES[id].rules, ...(['win', 'loss', 'draw'] as const).map((o) => takeaway(id, o, { player: 50, bot: 20 }, 10))].join(' ');
      assert.doesNotMatch(text, /always wins|guaranteed|best strategy is/i, id);
    }
  });
});
