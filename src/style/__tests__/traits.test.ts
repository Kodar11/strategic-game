/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EMPTY_STYLE, addStyle, parseStyle, styleFromMatch, summarizeStyle } from '../traits.ts';

const coop = (moves: string, theirs: string) => [...moves].map((m, i) => ({ pi: m, p: m, b: theirs[i] }));

describe('How you play', () => {
  it('says nothing until there is enough evidence', () => {
    const s = summarizeStyle(styleFromMatch('cooperation', coop('CCCC', 'CCCC')));
    assert.equal(s.headline, null);
    assert.equal(s.habits.length, 0);
  });

  it('reads trust and forgiveness from cooperation rounds', () => {
    let c = EMPTY_STYLE;
    for (let i = 0; i < 3; i++) c = addStyle(c, styleFromMatch('cooperation', coop('CCCCCC', 'CDCDCC')));
    const s = summarizeStyle(c);
    assert.equal(c.matches, 3);
    assert.equal(c.trust.n, 18);
    assert.equal(c.forgive.n, 6); // the round after each of the two defections, three matches
    assert.deepEqual(s.habits.map((h) => h.label), ['Trusting', 'Forgiving']);
    assert.equal(s.headline, 'You trust first and forgive quickly.');
  });

  it('reads fairness from offers in both Ultimatum games, and ignores games that say nothing', () => {
    const classic = styleFromMatch('ultimatum', [{ proposer: 'player', offer: 2 }, { proposer: 'bot', offer: 5 }, { proposer: 'player', offer: 2 }]);
    const arena = styleFromMatch('ultimatum-game', [{ proposer: 'player', offer: 3, pool: 12 }, { proposer: 'player', offer: 2, pool: 10 }]);
    const s = summarizeStyle(addStyle(classic, arena));
    assert.equal(s.habits[0].label, 'Hard bargainer');
    assert.equal(styleFromMatch('mole', [{}]).matches, 0);
  });

  it('treats malformed storage as no history', () => {
    assert.deepEqual(parseStyle({ trust: { n: 1, sum: 5 } }), EMPTY_STYLE);
    assert.deepEqual(parseStyle(null), EMPTY_STYLE);
  });
});
