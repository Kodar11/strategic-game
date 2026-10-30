/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type Beat,
  type Choices,
  type DecisionId,
  type EndingVariant,
  OPTIONS,
  START,
  beatAt,
  choose,
  ending,
  ledger,
  miraStance,
  next,
  playerHarms,
  restore,
  sceneBeats,
  stormReading,
} from '../crossing/story.ts';

/** Play from the start, answering each decision from `plan`. Returns every beat shown and the final choices. */
function play(plan: Choices) {
  let pos = START;
  let c: Choices = {};
  const shown: Beat[] = [];
  for (let guard = 0; guard < 500; guard++) {
    const beat = beatAt(pos, c)!;
    shown.push(beat);
    if (beat.kind === 'choice') {
      const v = plan[beat.id];
      assert.ok(v, `plan is missing ${beat.id}`);
      const r = choose(pos, c, beat.id, v);
      assert.ok(r, `choice ${beat.id}=${v} refused`);
      pos = r.pos;
      c = r.choices;
      continue;
    }
    const n = next(pos, c);
    if (!n) return { shown, choices: c, text: shown.map((b) => (b.kind === 'line' ? b.text : `[${b.id}]`)).join('\n') };
    assert.notDeepEqual(n, pos, 'a line beat must always advance');
    pos = n;
  }
  throw new Error('story did not finish');
}

/** Every complete plan (3,360 of them). */
function* allPlans(): Generator<Choices> {
  for (const open of OPTIONS.open)
    for (const basket of OPTIONS.basket)
      for (const rope of OPTIONS.rope)
        for (const answer of OPTIONS.answer)
          for (const again of answer === 'empty' ? OPTIONS.again : [undefined])
            for (const load of OPTIONS.load)
              for (const signal of OPTIONS.signal)
                for (const offer of OPTIONS.offer)
                  for (const after of offer === 'ask' ? OPTIONS.after : [undefined]) yield { open, basket, rope, answer, again, load, signal, offer, after };
}

const kind: Choices = { open: 'plain', basket: 'full', rope: 'all', answer: 'half', load: 'agreed', signal: 'explain', offer: 'together' };

describe('every path', () => {
  const variants = new Set<EndingVariant>();
  const endings = new Set<string>();

  it('finishes, with an ending, without contradictions', () => {
    let n = 0;
    for (const plan of allPlans()) {
      const run = play(plan);
      const e = ending(run.choices);
      assert.ok(e, JSON.stringify(plan));
      variants.add(e.variant);
      endings.add(e.id);
      // Dialogue that refers to the past only appears when that past happened.
      if (plan.basket !== 'short') assert.ok(!run.text.includes('half jar'), 'mentions a half jar that never crossed');
      if (plan.answer !== 'empty') assert.ok(!run.text.includes('Both baskets cross empty'));
      if (plan.load !== 'short') assert.ok(!run.text.includes('less than you promised'));
      if (plan.signal !== 'ask') assert.ok(!run.text.includes('You asked, the storm night too'));
      if (plan.rope === 'keep') assert.ok(!run.text.includes('second line across'));
      n++;
    }
    assert.equal(n, 3360);
  });

  it('reaches all three endings and every variant', () => {
    assert.deepEqual([...endings].sort(), ['banks', 'line', 'span']);
    assert.equal(variants.size, 8);
  });

  it('is deterministic: the same history always tells the same story', () => {
    assert.equal(play(kind).text, play({ ...kind }).text);
  });
});

describe('Mira follows the history', () => {
  it('mirrors openness on the first night', () => {
    assert.match(play({ ...kind, open: 'plain' }).text, /Full\. You actually filled it\./);
    assert.match(play({ ...kind, open: 'guarded' }).text, /I sent you a stranger’s share/);
  });

  it('tests a player who shorted her, and makes amends when she was the one who held back', () => {
    assert.match(play({ ...kind, basket: 'short' }).text, /one plank tonight/);
    assert.match(play({ ...kind, open: 'guarded', basket: 'full' }).text, /I’ll go first this time/);
  });

  it('breaks the agreement on night seven in every history, but her note depends on what came before', () => {
    assert.match(play(kind).text, /I’M SORRY\. I’LL MAKE IT RIGHT/);
    assert.match(play({ ...kind, rope: 'keep' }).text, /WE’RE EVEN/);
  });

  it('answers an empty basket with an empty basket', () => {
    const t = play({ ...kind, answer: 'empty', again: 'stop' }).text;
    assert.match(t, /she is answering last night, not tonight/);
  });
});

describe('the storm night: miscommunication is not deliberate harm', () => {
  it('a storm-emptied basket is never counted as a harm; a short load is', () => {
    assert.deepEqual(playerHarms({ ...kind, signal: 'silent' }), []);
    assert.deepEqual(playerHarms({ ...kind, load: 'short' }), ['load']);
  });

  it('explaining clears it up on a good record, and only half-works on a poor one', () => {
    assert.equal(stormReading(kind), 'clear');
    assert.equal(stormReading({ ...kind, basket: 'short', rope: 'keep' }), 'doubt');
    assert.equal(stormReading({ ...kind, answer: 'empty', again: 'continue' }), 'doubt');
  });

  it('silence is read through the past; an accusation is always misread', () => {
    assert.equal(stormReading({ ...kind, signal: 'silent' }), 'doubt');
    assert.equal(stormReading({ ...kind, basket: 'short', signal: 'silent' }), 'misread');
    assert.equal(stormReading({ ...kind, signal: 'accuse' }), 'misread');
  });

  it('a lie about the storm can be believed — and the ending remembers it', () => {
    const t = play({ ...kind, load: 'short', signal: 'explain', offer: 'staged' });
    assert.equal(ending(t.choices)!.id, 'span');
    assert.match(t.text, /You don’t correct her/);
  });
});

describe('no choice is automatically rewarded or punished', () => {
  const ends = (c: Choices) => ending(play(c).choices)!;

  it('cooperating every time, with no conditions, does not get the best ending', () => {
    const e = ends({ ...kind, answer: 'anyway', offer: 'together' });
    assert.equal(e.variant, 'line-skimmed');
  });

  it('…but the same generosity with a boundary does', () => {
    assert.equal(ends({ ...kind, answer: 'anyway', offer: 'staged' }).id, 'span');
  });

  it('a player who distrusted her at first, then set terms and communicated, can still build the span', () => {
    assert.equal(ends({ open: 'guarded', basket: 'short', rope: 'one', answer: 'half', load: 'agreed', signal: 'explain', offer: 'staged' }).id, 'span');
  });

  it('retaliating once and then stopping first does not close the road', () => {
    assert.equal(ends({ ...kind, answer: 'empty', again: 'stop', offer: 'together' }).id, 'span');
  });

  it('a retaliation cycle closes her — offering trust afterwards is an opportunity she can decline', () => {
    const c = { ...kind, answer: 'empty' as const, again: 'continue' as const };
    assert.equal(miraStance(c), 'closed');
    assert.equal(ends({ ...c, offer: 'together' }).variant, 'line-not-this-winter');
  });

  it('self-protection is a valid ending, not a failure state', () => {
    assert.equal(ends({ ...kind, offer: 'alone' }).variant, 'line-trade');
  });

  it('blind trust with a wary partner stops at the first knot; a boundary gets further', () => {
    const wary = { ...kind, answer: 'away' as const };
    assert.equal(miraStance(wary), 'wary');
    assert.equal(ends({ ...wary, offer: 'together' }).variant, 'line-first-knot');
    assert.equal(ends({ ...wary, offer: 'staged' }).id, 'span');
  });

  it('asking about night seven can open a wary partner, but not a closed one', () => {
    const wary = { ...kind, answer: 'away' as const, offer: 'ask' as const, after: 'together' as const };
    assert.equal(ends(wary).variant, 'span-together');
    const closed = { ...kind, answer: 'empty' as const, again: 'continue' as const, offer: 'ask' as const, after: 'together' as const };
    assert.equal(ends(closed).variant, 'line-not-this-winter');
  });

  it('keeping the oil on the last night ends with two banks', () => {
    assert.equal(ends({ ...kind, offer: 'keep' }).variant, 'banks-kept');
  });
});

describe('every decision matters later', () => {
  const later = (plan: Choices, id: DecisionId) => {
    const run = play(plan);
    const idx = run.shown.findIndex((b) => b.kind === 'choice' && b.id === id);
    return run.shown.slice(idx + 1).map((b) => (b.kind === 'line' ? b.text : b.id)).join('\n') + JSON.stringify(ending(run.choices));
  };

  for (const [id, base] of [
    ['open', kind],
    ['basket', kind],
    ['rope', kind],
    ['answer', kind],
    ['again', { ...kind, answer: 'empty' }],
    ['load', kind],
    ['signal', kind],
    ['offer', kind],
    ['after', { ...kind, offer: 'ask' }],
  ] as [DecisionId, Choices][]) {
    it(`${id}: each option leads somewhere different`, () => {
      const outcomes = new Set(OPTIONS[id].map((v) => later({ ...base, after: base.after ?? 'together', again: base.again ?? 'stop', [id]: v } as Choices, id)));
      assert.equal(outcomes.size, OPTIONS[id].length);
    });
  }
});

describe('saving and resuming', () => {
  it('restores a mid-story position exactly', () => {
    const c: Choices = { open: 'plain', basket: 'full' };
    const r = restore({ pos: { scene: 'c', beat: 3 }, choices: c });
    assert.deepEqual(r, { pos: { scene: 'c', beat: 3 }, choices: c });
  });

  it('never lets a position skip past an unmade decision', () => {
    const r = restore({ pos: { scene: 'f', beat: 2 }, choices: { open: 'plain' } });
    assert.equal(r.pos.scene, 'b');
    const beat = beatAt(r.pos, r.choices)!;
    assert.equal(beat.kind === 'choice' && beat.id, 'basket');
  });

  it('drops unknown values, out-of-order decisions and decisions whose scene does not apply', () => {
    const r = restore({ pos: { scene: 'a', beat: 0 }, choices: { open: 'plain', basket: 'lots', rope: 'all', again: 'stop', answer: 'half' } });
    assert.deepEqual(r.choices, { open: 'plain', rope: 'all', answer: 'half' });
  });

  it('clamps a beat beyond the scene and survives garbage', () => {
    const r = restore({ pos: { scene: 'a', beat: 999 }, choices: {} });
    assert.equal(r.pos.scene, 'a');
    assert.equal(sceneBeats('a', {})[r.pos.beat].kind, 'choice');
    assert.deepEqual(restore(null), { pos: START, choices: {} });
    assert.deepEqual(restore({ pos: { scene: 'zz', beat: -1 }, choices: 7 }), { pos: START, choices: {} });
  });

  it('a saved finished run resumes at its last beat', () => {
    const run = play(kind);
    const r = restore({ pos: { scene: 'h', beat: 99 }, choices: run.choices });
    assert.equal(r.pos.scene, 'h');
    assert.equal(next(r.pos, r.choices), null);
  });

  it('refuses a choice that is not being asked', () => {
    assert.equal(choose(START, {}, 'open', 'plain'), null);
  });
});

describe('the ledger only records what happened', () => {
  it('lists the nights in order and matches the run', () => {
    const l = ledger({ ...kind, answer: 'empty', again: 'stop', signal: 'ask', offer: 'ask', after: 'staged' });
    assert.deepEqual(l.map((x) => x.night), ['Night 1', 'Night 4', 'Night 7', 'Night 9', 'Night 10', 'Night 13', 'Night 16']);
    assert.match(l[3].text, /empty basket/);
    assert.match(l[6].text, /asked about night seven first/);
  });

  it('mentions a shorted storm load only when there was one', () => {
    assert.doesNotMatch(ledger(kind).map((x) => x.text).join(' '), /shorted/);
    assert.match(ledger({ ...kind, load: 'short' }).map((x) => x.text).join(' '), /shorted/);
  });
});
