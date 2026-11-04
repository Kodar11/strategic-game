import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { personality } from '../catalog.ts';
import { sharedOutcome } from '../shared-outcome.ts';
import { TWO_THIRDS_BOTS } from '../two-thirds.ts';
import { twoThirdsPublic } from '../two-thirds-view.ts';

describe('Two-Thirds: a hidden crowd', () => {
  const bots = [34, 32, 33, 35, 31, 67, 12, 50];
  it('every crowd type produces identical public text and dots while hidden', () => {
    const views = TWO_THIRDS_BOTS.map((c) => JSON.stringify(twoThirdsPublic(c, true, bots)));
    assert.equal(new Set(views).size, 1);
  });
  it('never names a type, or says how the group is made up, while hidden', () => {
    for (const c of TWO_THIRDS_BOTS) {
      const v = twoThirdsPublic(c, true, bots);
      for (const t of TWO_THIRDS_BOTS) {
        const name = personality('two-thirds', t)!.name;
        assert.ok(!v.groupLine.includes(name) && !v.intro.includes(name));
      }
      assert.ok(!/5 ×/.test(v.groupLine));
      assert.ok(v.dotTones.every((d) => d === 'neutral'));
    }
  });
  it('lists hidden picks by value, so lineup order gives nothing away', () => {
    assert.deepEqual(twoThirdsPublic(TWO_THIRDS_BOTS[1], true, bots).picks, [...bots].sort((a, b) => a - b));
  });
  it('names the crowd and colours it once revealed, or in a chosen match', () => {
    const v = twoThirdsPublic(TWO_THIRDS_BOTS[0], false, bots);
    assert.ok(v.groupLine.includes(personality('two-thirds', TWO_THIRDS_BOTS[0])!.name));
    assert.equal(v.dotTones.filter((d) => d === 'crowd').length, 5);
    assert.equal(v.dotTones.filter((d) => d === 'other').length, 3);
  });
});

describe('shared outcomes', () => {
  const base = { rounds: 10, jointEach: 5, themName: 'the bot' };
  it('calls a full partnership that, not a draw', () => {
    const o = sharedOutcome({ ...base, kind: 'split', you: 50, them: 50, joint: 10 });
    assert.equal(o.headline, 'A full partnership');
    assert.ok(o.full && /50 each/.test(o.tradeoff));
  });
  it('reports a betrayal win honestly, with what mutual play would have paid', () => {
    const o = sharedOutcome({ ...base, kind: 'split', you: 24, them: 8, joint: 0 });
    assert.equal(o.headline, 'You out-scored the bot');
    assert.match(o.shared, /32 of the 100/);
    assert.match(o.tradeoff, /would have paid you 50: 26 more/);
  });
  it('does not hide it when betrayal did pay more', () => {
    const o = sharedOutcome({ ...base, kind: 'cooperate', you: 62, them: 22, joint: 2 });
    assert.match(o.tradeoff, /12 more than cooperating/);
  });
  it('leads a hunt with the stags caught', () => {
    assert.equal(sharedOutcome({ ...base, rounds: 8, kind: 'hunt', you: 21, them: 24, joint: 3 }).headline, '3 of 8 stags caught together');
    assert.equal(sharedOutcome({ ...base, rounds: 8, kind: 'hunt', you: 40, them: 40, joint: 8 }).headline, 'All 8 stags caught together');
    assert.equal(sharedOutcome({ ...base, rounds: 8, kind: 'hunt', you: 24, them: 24, joint: 0 }).headline, 'No stag caught together');
  });
});
