import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LENGTHS, LEVELS } from '../core.ts';
import { CLUES, WIRES, allLive, consistent, defusal, holds, trueClues } from '../defusal.ts';
import { type GambitState, deadlocked, gambit, legalMoves, settleTurns } from '../gambit.ts';
import { bidText, liarsDice } from '../liars-dice.ts';

const setup = (persona: string, level = 'normal', seed = 1, length = 'standard') => ({ persona, level, length, variant: 'standard', seed }) as never;
const piece = (side: 'player' | 'bot', sq: string) => ({ side, c: 'ABCDE'.indexOf(sq[0]), r: Number(sq[1]) - 1 });

describe('The Gambit: no legal move', () => {
  const at = (pieces: ReturnType<typeof piece>[], extra: Partial<GambitState> = {}): GambitState => ({ ...gambit.create(setup('safe')), pieces, ...extra });
  const stuck = () => [piece('bot', 'A3'), piece('player', 'A2'), piece('bot', 'B2'), piece('bot', 'D2')];

  it('the reported A2 position has no legal player move', () => {
    assert.equal(legalMoves(at(stuck()), 'player').length, 0);
  });
  it('skips the stuck player and lets the bot move, moving nothing for the player', () => {
    const s = settleTurns(at(stuck()));
    assert.ok(s.skipped.some((x) => x.side === 'player'));
    assert.ok(s.turns.length > 0 && s.turns.every((t) => t.side === 'bot'));
    assert.ok(gambit.isOver(s) || legalMoves(s, 'player').length > 0);
  });
  it('a skipped turn counts toward the turn limit, so the match still ends', () => {
    const out = settleTurns(at(stuck(), { total: 1 }));
    assert.ok(gambit.isOver(out));
    assert.equal(gambit.played(out), 1);
  });
  it('one stuck side is not a deadlock', () => {
    assert.equal(deadlocked(at(stuck())), false);
    assert.equal(gambit.isOver(at(stuck())), false);
  });
  it('a stuck bot skips its turn and the player plays on', () => {
    // The bot on E5 is blocked by E4 below and D5 beside it, and has nothing to strike on D4.
    const s = at([piece('player', 'E4'), piece('player', 'D5'), piece('player', 'B1'), piece('bot', 'E5')]);
    assert.equal(legalMoves(s, 'bot').length, 0);
    const next = gambit.apply(s, { from: [0, 1], to: [1, 1] });
    assert.ok(next.skipped.some((x) => x.side === 'bot'));
    assert.ok(!gambit.isOver(next));
  });
  it('no match gets stuck, whatever is played', () => {
    let rng = 7;
    const rnd = () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (const persona of gambit.opponents)
      for (const level of LEVELS)
        for (let i = 0; i < 400; i++) {
          let s = gambit.create(setup(persona, level, (i * 2654435761 + 97) >>> 0));
          let guard = 0;
          while (!gambit.isOver(s)) {
            assert.ok(guard++ < 60, 'match did not end');
            const ms = legalMoves(s, 'player');
            assert.ok(ms.length > 0, 'open match with no legal move');
            const m = ms[Math.floor(rnd() * ms.length)];
            s = gambit.apply(s, { from: m.from, to: m.to });
          }
        }
  });
  it('the debrief states the odds correctly', () => {
    for (let seed = 1; seed < 40; seed++) {
      let s = gambit.create(setup('gambler', 'easy', seed));
      while (!gambit.isOver(s)) {
        const ms = legalMoves(s, 'player');
        const m = ms.find((x) => x.kind === 'dash') ?? ms[0];
        s = gambit.apply(s, { from: m.from, to: m.to });
      }
      assert.ok(!gambit.debrief(s).moments.join(' ').includes('fail often'));
    }
  });
});

describe('The Defusal: clues', () => {
  it('never deals a clue that rules nothing out', () => {
    for (const length of LENGTHS)
      for (const level of LEVELS)
        for (let i = 0; i < 200; i++) {
          const s = defusal.create(setup('methodical', level, (i * 2654435761 + 5) >>> 0, length));
          const all = consistent(s, []).length;
          for (const c of [...s.hands.player, ...s.hands.bot]) assert.ok(consistent(s, [c]).length < all);
        }
  });
  it('every clue is true of the real arrangement', () => {
    for (let i = 0; i < 200; i++) {
      const s = defusal.create(setup('bold', 'hard', i + 1));
      for (const c of [...s.hands.player, ...s.hands.bot]) assert.ok(holds(c, s.live));
    }
  });
  it('still leaves enough clues to deal both hands for every setup', () => {
    for (const length of LENGTHS)
      for (const level of LEVELS) {
        const n = WIRES(length);
        for (const live of allLive(n)) assert.ok(trueClues(n, live).length >= CLUES(level) * 2);
      }
  });
});

describe('Liar’s Dice wording', () => {
  it('says "1 two", not "1 twos"', () => {
    assert.equal(bidText({ q: 1, f: 2 }), '1 two');
    assert.equal(bidText({ q: 2, f: 2 }), '2 twos');
  });
  it('no debrief reads "1 <plural>"', () => {
    for (let seed = 1; seed < 60; seed++) {
      let s = liarsDice.create(setup('aggressive', 'easy', seed, 'short'));
      for (let k = 0; k < 200 && !liarsDice.isOver(s); k++) s = liarsDice.apply(s, liarsDice.moves!(s).at(-1)!);
      const d = liarsDice.debrief(s);
      assert.ok(!/\b1 (ones|twos|threes|fours|fives|sixes)\b/.test([...d.moments, d.opponentRead].join(' ')));
    }
  });
});
