/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type Design,
  type Entrant,
  MATCH_ROUNDS,
  NOISE,
  PAYOFFS,
  ROOMS,
  STARTER_DESIGN,
  STRATEGIES,
  type StrategyId,
  clearAir,
  designRule,
  entrant,
  evolve,
  hash01,
  placeOf,
  playMatch,
  runRoom,
  runTournament,
  standingOf,
  yours,
} from '../meridian/engine.ts';
import { stage } from '../../game/repeated.ts';

const moves = (m: ReturnType<typeof playMatch>, side: 'a' | 'b') => m.rounds.map((r) => r[side]).join('');
const scripted = (seq: string): Entrant => ({ id: 'yours', key: `script:${seq}`, play: ({ history }) => (seq[history.length] ?? seq[seq.length - 1]) as 'C' | 'D' });

describe('payoff matrix', () => {
  it('pays 3/3, 0/5, 5/0 and 1/1', () => {
    assert.deepEqual(stage(PAYOFFS, 'C', 'C'), [3, 3]);
    assert.deepEqual(stage(PAYOFFS, 'C', 'D'), [0, 5]);
    assert.deepEqual(stage(PAYOFFS, 'D', 'C'), [5, 0]);
    assert.deepEqual(stage(PAYOFFS, 'D', 'D'), [1, 1]);
  });

  it('is a genuine dilemma: defecting pays more either way, yet mutual cooperation beats mutual defection', () => {
    const { T, R, P, S } = PAYOFFS;
    assert.ok(T > R && R > P && P > S && 2 * R > T + S);
  });

  it('scores every round of a match from the matrix, simultaneously', () => {
    const m = playMatch(scripted('CDCD'), scripted('CCDD'), { rounds: 4 });
    assert.deepEqual(
      m.rounds.map((r) => [r.pa, r.pb]),
      [[3, 3], [5, 0], [0, 5], [1, 1]],
    );
    assert.equal(m.a, 9);
    assert.equal(m.b, 9);
  });
});

describe('strategy rules', () => {
  const vs = (a: Exclude<StrategyId, 'yours'>, b: Entrant, rounds = 8) => playMatch(entrant(a), b, { rounds });

  it('Open Hand always cooperates; Iron Wall always defects', () => {
    assert.equal(moves(vs('open-hand', scripted('DDDDCCCC')), 'a'), 'CCCCCCCC');
    assert.equal(moves(vs('iron-wall', scripted('CCCCCCCC')), 'a'), 'DDDDDDDD');
  });

  it('the Mirror opens with C and copies the partner’s previous move', () => {
    assert.equal(moves(vs('mirror', scripted('CDDCCDCC')), 'a'), 'CCDDCCDC');
  });

  it('the Wary Mirror opens with D, then copies', () => {
    assert.equal(moves(vs('wary-mirror', scripted('CCDC')), 'a').slice(0, 4), 'DCCD');
  });

  it('the Long Memory never cooperates again after one defection', () => {
    assert.equal(moves(vs('long-memory', scripted('CCDCCCCC')), 'a'), 'CCCDDDDD');
  });

  it('the Pendulum alternates regardless of the partner', () => {
    assert.equal(moves(vs('pendulum', scripted('DDDD'), 6), 'a'), 'CDCDCD');
  });

  it('the Prober exploits a partner that never hits back, and copies one that does', () => {
    assert.equal(moves(vs('prober', scripted('C')), 'a'), 'DCCDDDDD');
    // The partner defects in round 2 (its answer to the opening defection): the Prober switches to copying.
    assert.equal(moves(vs('prober', scripted('CDCCCCCC')), 'a'), 'DCCCCCCC');
  });

  it('the Settler repeats a move that paid and switches one that did not', () => {
    // vs always-D: C (got 0) → D (got 1) → C (got 0) → D …
    assert.equal(moves(vs('settler', scripted('D')), 'a').slice(0, 4), 'CDCD');
    assert.equal(moves(vs('settler', scripted('C')), 'a'), 'CCCCCCCC');
  });

  it('the Weathervane is random but reproducible from the seed', () => {
    const a = playMatch(entrant('weathervane'), entrant('open-hand'), { seed: 5 });
    const b = playMatch(entrant('weathervane'), entrant('open-hand'), { seed: 5 });
    const c = playMatch(entrant('weathervane'), entrant('open-hand'), { seed: 6 });
    assert.equal(moves(a, 'a'), moves(b, 'a'));
    assert.notEqual(moves(a, 'a'), moves(c, 'a'));
    const cs = moves(a, 'a').split('').filter((x) => x === 'C').length;
    assert.ok(cs > 10 && cs < 40, `roughly half cooperations, got ${cs}`);
  });

  it('the Calculator exploits a partner that keeps forgiving, but not a Mirror', () => {
    const farm = playMatch(entrant('calculator'), entrant('open-hand'));
    assert.ok(farm.a > farm.b, 'out-scores the Open Hand');
    const m = playMatch(entrant('calculator'), entrant('mirror'));
    assert.ok(m.a <= m.b + PAYOFFS.T, 'cannot get far ahead of a Mirror');
  });

  it('a designed strategy matches its preset', () => {
    for (const id of ['open-hand', 'mirror', 'iron-wall'] as const) {
      const a = playMatch(yours(STARTER_DESIGN[id]), entrant('weathervane'), { seed: 3 });
      const b = playMatch(entrant(id), entrant('weathervane'), { seed: 3 });
      assert.equal(moves(a, 'a'), moves(b, 'a'));
    }
  });

  it('“two” waits for two defections in a row; forgiveness turns some retaliations into cooperation', () => {
    const two = playMatch(yours({ opening: 'C', response: 'two', forgive: 0 }), scripted('DCDDCC'), { rounds: 6 });
    assert.equal(moves(two, 'a'), 'CCCCDC');
    const soft: Design = { opening: 'C', response: 'copy', forgive: 1 };
    assert.equal(moves(playMatch(yours(soft), scripted('D'), { rounds: 5 }), 'a'), 'CCCCC');
  });
});

describe('noise and slips', () => {
  it('a scripted slip changes the executed move only, and both sides see the executed move', () => {
    const m = playMatch(entrant('mirror'), entrant('mirror'), { rounds: 8, slips: [{ side: 'a', round: 3 }] });
    assert.equal(m.rounds[3].ia, 'C');
    assert.equal(m.rounds[3].a, 'D');
    // The echo: each Mirror answers the other's last move, so the single slip bounces back and forth forever.
    assert.equal(moves(m, 'a'), 'CCCDCDCD');
    assert.equal(moves(m, 'b'), 'CCCCDCDC');
  });

  it('a patient partner absorbs the slip; an unforgiving one turns it into permanent defection', () => {
    const slip = { slips: [{ side: 'a' as const, round: 3 }], rounds: 10 };
    const patient = playMatch(entrant('mirror'), yours({ opening: 'C', response: 'two', forgive: 0 }), slip);
    assert.equal(moves(patient, 'a') + moves(patient, 'b'), 'CCCDCCCCCC' + 'CCCCCCCCCC');
    const grudge = playMatch(entrant('mirror'), entrant('long-memory'), slip);
    assert.equal(moves(grudge, 'b'), 'CCCCDDDDDD');
  });

  it('random noise flips roughly the stated share of moves, reproducibly', () => {
    let flips = 0;
    let total = 0;
    for (let s = 0; s < 40; s++) {
      const m = playMatch(entrant('open-hand'), entrant('open-hand'), { noise: NOISE, seed: s });
      for (const r of m.rounds) {
        total += 2;
        flips += (r.a !== r.ia ? 1 : 0) + (r.b !== r.ib ? 1 : 0);
      }
    }
    const rate = flips / total;
    assert.ok(rate > NOISE * 0.6 && rate < NOISE * 1.4, `rate ${rate}`);
    const x = playMatch(entrant('mirror'), entrant('mirror'), { noise: 0.1, seed: 9 });
    const y = playMatch(entrant('mirror'), entrant('mirror'), { noise: 0.1, seed: 9 });
    assert.deepEqual(x, y);
  });

  it('hash01 is deterministic and in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const u = hash01(i, i * 3, 7, 1);
      assert.equal(u, hash01(i, i * 3, 7, 1));
      assert.ok(u >= 0 && u < 1);
    }
  });
});

describe('tournament aggregation', () => {
  it('averages points per round against every entry, weighted by head count, including the twin match', () => {
    const field = [
      { entrant: entrant('open-hand'), count: 2 },
      { entrant: entrant('iron-wall'), count: 1 },
    ];
    const t = runTournament(field, { rounds: 10 });
    assert.deepEqual(t.avg, [
      [3, 0],
      [5, 1],
    ]);
    // Open Hand meets its two copies (3 each) and one Iron Wall (0): (3·2 + 0·1)/3 = 2.
    assert.equal(standingOf(t, 'open-hand').score, 2);
    // Iron Wall meets two Open Hands (5) and its twin (1): (5·2 + 1)/3.
    assert.equal(standingOf(t, 'iron-wall').score, 11 / 3);
    assert.equal(t.standings[0].id, 'iron-wall');
  });

  it('equal scores share a rank', () => {
    const t = runTournament([
      { entrant: yours(STARTER_DESIGN.mirror), count: 1 },
      { entrant: entrant('mirror'), count: 1 },
      { entrant: entrant('iron-wall'), count: 1 },
    ]);
    assert.equal(standingOf(t, 'yours').score, standingOf(t, 'mirror').score);
    assert.equal(standingOf(t, 'yours').rank, 1);
    assert.equal(standingOf(t, 'yours').rank, standingOf(t, 'mirror').rank);
  });

  it('an entry with the same rule as a contestant scores exactly the same, in every room, with or without noise', () => {
    for (const room of Object.values(ROOMS)) {
      for (const id of ['open-hand', 'mirror', 'iron-wall'] as const) {
        if (!room.others.some((o) => o.id === id)) continue;
        const t = runRoom(room, yours(STARTER_DESIGN[id]));
        assert.equal(standingOf(t, 'yours').score, standingOf(t, id).score, `${room.id}/${id}`);
        assert.equal(standingOf(t, 'yours').rank, standingOf(t, id).rank);
      }
    }
  });

  it('the Mirror never out-scores anyone head-to-head', () => {
    const t = runRoom(ROOMS.open, yours(STARTER_DESIGN['iron-wall']));
    assert.equal(standingOf(t, 'mirror').won, 0);
  });

  it('is deterministic', () => {
    const a = runRoom(ROOMS.noisy, yours(STARTER_DESIGN.mirror));
    const b = runRoom(ROOMS.noisy, yours(STARTER_DESIGN.mirror));
    assert.deepEqual(a.standings, b.standings);
    assert.deepEqual(a.avg, b.avg);
  });

  it('duel(i, j) mirrors duel(j, i)', () => {
    const t = runRoom(ROOMS.open, yours(STARTER_DESIGN['open-hand']));
    const ab = t.duel(0, 3);
    const ba = t.duel(3, 0);
    assert.equal(ab.a, ba.b);
    assert.equal(moves(ab, 'a'), moves(ba, 'b'));
    assert.equal(ab.rounds.length, MATCH_ROUNDS);
  });
});

describe('environments change the result (real simulation, not scripted)', () => {
  const rankIn = (room: keyof typeof ROOMS, id: 'open-hand' | 'mirror' | 'iron-wall') => placeOf(runRoom(ROOMS[room], yours(STARTER_DESIGN[id])), 'yours').rank;

  it('in the open trials the Mirrors top the room while the Iron Wall, winner of most duels, does not', () => {
    const t = runRoom(ROOMS.open, yours(STARTER_DESIGN['iron-wall']));
    const top2 = t.standings.slice(0, 2).map((s) => s.id).sort();
    assert.deepEqual(top2, ['gentle-mirror', 'mirror']);
    assert.ok(standingOf(t, 'iron-wall').won > standingOf(t, 'mirror').won);
    assert.ok(standingOf(t, 'iron-wall').rank > t.standings.length / 2);
  });

  it('the Open Hand falls to last in the Iron Hall', () => {
    const t = runRoom(ROOMS.hostile, yours(STARTER_DESIGN['open-hand']));
    assert.equal(placeOf(t, 'yours').rank, t.standings.length);
  });

  it('a taker tops the Garden Hall whatever you enter, and the Iron Wall entry finishes near the top', () => {
    for (const id of ['open-hand', 'mirror', 'iron-wall'] as const) assert.equal(runRoom(ROOMS.friendly, yours(STARTER_DESIGN[id])).standings[0].id, 'prober');
    assert.ok(rankIn('friendly', 'iron-wall') <= 2);
  });

  it('fog costs the Mirror more than the forgiving strategies', () => {
    const mine = yours(STARTER_DESIGN.mirror);
    const fog = runRoom(ROOMS.noisy, mine);
    const clear = runRoom(clearAir(ROOMS.noisy), mine);
    const cost = (id: StrategyId) => standingOf(clear, id).score - standingOf(fog, id).score;
    assert.ok(cost('mirror') > cost('gentle-mirror'));
    assert.ok(cost('mirror') > cost('open-hand'));
    assert.ok(cost('long-memory') > cost('mirror'), 'the unforgiving rule loses most');
    assert.equal(fog.standings[0].id, 'gentle-mirror');
  });
});

describe('population model', () => {
  it('keeps shares summing to 1 and is deterministic', () => {
    const t = runRoom(ROOMS.open, yours(STARTER_DESIGN.mirror));
    const a = evolve(t, 30);
    assert.equal(a.length, 31);
    for (const g of a) assert.ok(Math.abs(g.reduce((s, x) => s + x, 0) - 1) < 1e-9);
    assert.deepEqual(a, evolve(t, 30));
  });

  it('grows strategies that out-score the mix and shrinks the rest', () => {
    const t = runRoom(ROOMS.open, yours(STARTER_DESIGN['open-hand']));
    const pop = evolve(t, 60);
    const iw = t.ids.indexOf('iron-wall');
    const mirrors = pop[60][t.ids.indexOf('mirror')] + pop[60][t.ids.indexOf('gentle-mirror')];
    assert.equal(pop[60][iw], 0, 'the Iron Wall dies out once there is no one left to exploit');
    assert.ok(mirrors > 0.75, 'the two Mirrors end up the large majority');
  });

  it('a lone strategy is a fixed point', () => {
    const t = runTournament([{ entrant: entrant('mirror'), count: 1 }]);
    assert.deepEqual(evolve(t, 5).at(-1), [1]);
  });
});

describe('strategy catalogue', () => {
  it('every listed strategy has a rule that returns a move', () => {
    for (const s of Object.values(STRATEGIES)) {
      const m = s.play({ history: [], rand: () => 0.5 });
      assert.ok(m === 'C' || m === 'D', s.id);
    }
    assert.equal(designRule({ opening: 'D', response: 'copy', forgive: 0 })({ history: [], rand: () => 0 }), 'D');
  });
});
