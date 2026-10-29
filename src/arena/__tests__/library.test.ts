import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BLUFF_PERSONAS, bluff, bluffPrompt, botCalls, pAtLeast as pTokens, token } from '../bluff.ts';
import { ARENA } from '../catalog.ts';
import { COALITION_PERSONAS, MAJORITY, PRIZE, coalition, coalitionPrompt, minimalWinning, pivotal } from '../coalition.ts';
import { CODE_PERSONAS, botClue, botGuesses, boardFor, codebreaker, codePrompt, link, resolveGuesses } from '../codebreaker.ts';
import { COMMONS_PERSONAS, COLLAPSE_BELOW, commons, commonsBotTake, ration, regrow } from '../commons.ts';
import { ARENA_IDS, LEVELS, type Level, type MatchLength } from '../core.ts';
import { DEFUSAL_PERSONAS, allLive, consistent, defusal, defused, holds, trueClues } from '../defusal.ts';
import { GAMBIT_PERSONAS, gambit, gambitBotMove, legalMoves, resolveMove } from '../gambit.ts';
import { INSPECTOR_PERSONAS, equilibrium, inspectPayoff, inspector, inspectorChoice, operatorChoice } from '../inspector.ts';
import { BURNED, LAST_STAND_PERSONAS, held, lastStand, spread, teammatePlan } from '../last-stand.ts';
import { DICE_PERSONAS, isRaise, liarsDice, liveBids, pAtLeast, roll } from '../liars-dice.ts';
import { MOLE_STYLES, camera, mole, moleAccuses, molePosterior } from '../mole.ts';
import { POWER_PERSONAS, pHolds, powerPlay, powerPrompt } from '../power-play.ts';
import { READ_RULES, awaitingRead, hiddenOpponent, readAfter, readOpen, scoreRead } from '../reads.ts';
import { ARENA_ENGINES } from '../registry.ts';
import { SABOTEUR_STYLES, saboteur, saboteurPrompt, suspicion } from '../saboteur.ts';
import { CLAIM_MAX, CLAIM_MIN, TRAVELER_PERSONAS, travelPayoff, travelerClaim, travelers } from '../travelers.ts';

const setup = <P extends string, V extends string>(persona: P, level: Level, variant: V, seed = 42, length: MatchLength = 'standard') => ({ persona, level, variant, length, seed });
/** Plays an engine to the end with a fixed policy over its legal moves. */
function play(engine: any, s: any, pick: (s: any, ms: any[]) => any = (_s, ms) => ms[0]): any {
  let k = 0;
  while (!engine.isOver(s) && k++ < 400) s = engine.apply(s, pick(s, engine.moves(s)));
  return s;
}
const distinct = (xs: unknown[]) => new Set(xs.map((x) => JSON.stringify(x))).size;

// ── Prediction layer ────────────────────────────────────────────────────────

describe('personality prediction', () => {
  it('has a documented rule for every game, never beyond the match length', () => {
    for (const id of ARENA_IDS) {
      const r = READ_RULES[id];
      assert.ok(r.target.length >= 3 && r.evidence.length > 10, id);
      for (const length of ['short', 'standard', 'long'] as const) {
        const total = ARENA_ENGINES[id].rounds(length);
        const after = readAfter(id, total);
        assert.ok(after >= 1 && after <= total, `${id} ${length}: ${after} of ${total}`);
      }
    }
  });

  it('opens only after the evidence threshold and closes at the end', () => {
    const total = ARENA_ENGINES.commons.rounds('standard');
    const after = readAfter('commons', total);
    assert.equal(readOpen('commons', after - 1, total, false), false);
    assert.equal(readOpen('commons', after, total, false), true);
    assert.equal(readOpen('commons', total, total, true), false);
  });

  it('offers one guess before the reveal only in a mystery match without a guess', () => {
    assert.equal(awaitingRead(true, true, null, false), true);
    assert.equal(awaitingRead(true, true, 'x', false), false);
    assert.equal(awaitingRead(true, true, null, true), false);
    assert.equal(awaitingRead(false, true, null, false), false);
    assert.equal(awaitingRead(true, false, null, false), false);
  });

  it('scores right, wrong and no guess', () => {
    assert.equal(scoreRead('a', 'a'), 'correct');
    assert.equal(scoreRead('b', 'a'), 'incorrect');
    assert.equal(scoreRead(null, 'a'), 'unscored');
  });

  it('picks a hidden opponent from the seed, covering every personality and replaying exactly', () => {
    for (const id of ARENA_IDS) {
      const ops = ARENA_ENGINES[id].opponents;
      const seen = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) {
        const o = hiddenOpponent(ops, seed);
        assert.ok(ops.includes(o));
        assert.equal(hiddenOpponent(ops, seed), o);
        seen.add(o);
      }
      assert.equal(seen.size, ops.length, `${id}: every personality can be drawn`);
    }
  });

  it('the guess never changes the match: engines take no prediction input', () => {
    // A match is a pure function of setup and moves; replaying the same moves gives the same state.
    for (const id of ['mole', 'bluff', 'gambit'] as const) {
      const e = ARENA_ENGINES[id];
      const a = play(e, e.create(setup(e.opponents[1], 'normal', e.variants[0], 9)));
      const b = play(e, e.create(setup(e.opponents[1], 'normal', e.variants[0], 9)));
      assert.deepEqual(a, b);
    }
  });

  it('every new game’s opponents have a game-specific name and summary, and none is shared copy', () => {
    for (const id of ['mole', 'commons', 'coalition', 'inspector', 'travelers', 'saboteur', 'bluff', 'defusal', 'power-play', 'last-stand', 'liars-dice', 'codebreaker', 'gambit'] as const) {
      const ops = ARENA[id].opponents;
      assert.equal(ops.length, 4, id);
      assert.equal(distinct(ops.map((o) => o.summary)), 4, `${id}: four different summaries`);
    }
  });

  it('the reveal’s evidence names the real personality and cites the match', () => {
    for (const id of ['mole', 'commons', 'coalition', 'inspector', 'travelers', 'saboteur', 'bluff', 'defusal', 'power-play', 'last-stand', 'liars-dice', 'codebreaker', 'gambit'] as const) {
      const e = ARENA_ENGINES[id];
      for (const persona of e.opponents) {
        const s = play(e, e.create(setup(persona, 'normal', e.variants[0], 3)));
        const read = e.debrief(s).opponentRead;
        const name = ARENA[id].opponents.find((o) => o.id === persona)!.name;
        assert.ok(read.includes(name), `${id}/${persona}: "${read}" should name ${name}`);
        assert.match(read, /\d/, `${id}/${persona}: evidence should cite numbers from the match`);
      }
    }
  });
});

// ── The Mole ────────────────────────────────────────────────────────────────

describe('the mole', () => {
  it('camera pairs follow the rule: two distinct suspects, the Mole included at about the stated rate', () => {
    let hits = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const s = mole.create(setup('investigator', 'normal', 'standard', seed));
      const p = camera(s.setup, s.mole, 0, 0);
      assert.notEqual(p[0], p[1]);
      if (p.includes(s.mole)) hits++;
    }
    assert.ok(Math.abs(hits / 2000 - 0.75) < 0.04, `${hits / 2000}`);
  });

  it('the posterior is a distribution and moves toward suspects caught on camera', () => {
    const p = molePosterior('standard', [[0, 1], [0, 2]]);
    assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(p[0] > p[1] && p[1] > p[3]);
  });

  it('accusations never depend on whom you interrogate, and nobody accuses themselves', () => {
    const s = mole.create(setup('deceiver', 'hard', 'standard', 11));
    const a = mole.apply(s, { kind: 'interrogate', suspect: 0 });
    const b = mole.apply(s, { kind: 'interrogate', suspect: 3 });
    assert.deepEqual(a.rounds[0].accusations, b.rounds[0].accusations);
    a.rounds[0].accusations.forEach((t: number, i: number) => assert.notEqual(t, i));
  });

  it('refuses accusing during the investigation and interrogating after it', () => {
    const s = mole.create(setup('opportunist', 'easy', 'standard', 2));
    assert.ok(mole.validate(s, { kind: 'accuse', suspect: 1 }));
    let t = s;
    while (t.rounds.length < t.investigation) t = mole.apply(t, { kind: 'interrogate', suspect: 0 });
    assert.ok(mole.validate(t, { kind: 'interrogate', suspect: 0 }));
    assert.equal(mole.validate(t, { kind: 'accuse', suspect: 2 }), null);
    assert.ok(mole.validate(t, { kind: 'accuse', suspect: 7 }));
  });

  it('a right accusation wins, a wrong one loses', () => {
    let s = mole.create(setup('investigator', 'normal', 'standard', 5));
    while (s.rounds.length < s.investigation) s = mole.apply(s, { kind: 'interrogate', suspect: 1 });
    assert.equal(mole.result(mole.apply(s, { kind: 'accuse', suspect: s.mole })).outcome, 'win');
    assert.equal(mole.result(mole.apply(s, { kind: 'accuse', suspect: (s.mole + 1) % 4 })).outcome, 'loss');
  });

  it('the four cover styles accuse differently', () => {
    const patterns = MOLE_STYLES.map((persona) => {
      const out: number[] = [];
      for (let seed = 1; seed <= 40; seed++) {
        let s = mole.create(setup(persona, 'normal', 'standard', seed));
        while (s.rounds.length < s.investigation) s = mole.apply(s, { kind: 'interrogate', suspect: 0 });
        out.push(...s.rounds.map((r: any) => r.accusations[s.mole]));
      }
      return out;
    });
    assert.equal(distinct(patterns), 4);
  });

  it('the Deceiver keeps accusing one scapegoat on Easy', () => {
    let s = mole.create(setup('deceiver', 'easy', 'standard', 8));
    while (s.rounds.length < s.investigation) s = mole.apply(s, { kind: 'interrogate', suspect: 0 });
    assert.equal(new Set(s.rounds.map((r: any) => r.accusations[s.mole])).size, 1);
    assert.equal(typeof moleAccuses, 'function');
  });
});

// ── The Commons ─────────────────────────────────────────────────────────────

describe('the commons', () => {
  it('regrowth is logistic and rationing is proportional', () => {
    assert.equal(regrow('standard', 50), 65);
    assert.equal(regrow('standard', 100), 100);
    assert.equal(regrow('standard', 0), 0);
    assert.deepEqual(ration(10, [10, 10, 0, 0]), [5, 5, 0, 0]);
    assert.deepEqual(ration(30, [3, 3, 3, 3]), [3, 3, 3, 3]);
  });

  it('bots never see your request: the same state gives the same bot requests whatever you ask for', () => {
    for (const persona of COMMONS_PERSONAS) {
      const s = commons.create(setup(persona, 'hard', 'standard', 3));
      const a = commons.apply(s, 0).rounds[0].requests.slice(1);
      const b = commons.apply(s, 10).rounds[0].requests.slice(1);
      assert.deepEqual(a, b, persona);
    }
  });

  it('greed collapses the lake, and a collapse is a loss', () => {
    const s = play(commons, commons.create(setup('free-rider', 'hard', 'standard', 4)), () => 10);
    assert.equal(s.lake, 0);
    assert.ok(s.rounds[s.rounds.length - 1].lakeBefore - s.rounds[s.rounds.length - 1].catches.reduce((a: number, b: number) => a + b, 0) < COLLAPSE_BELOW);
    assert.equal(commons.result(s).outcome, 'loss');
  });

  it('sustainable play can win against easy boats', () => {
    let wins = 0;
    for (let seed = 1; seed <= 30; seed++) if (commons.result(play(commons, commons.create(setup('conservator', 'easy', 'standard', seed)), (s) => (s.rounds.length === s.total - 1 ? 10 : 3))).outcome === 'win') wins++;
    assert.ok(wins >= 20, `${wins}`);
  });

  it('the four boats fish differently in the same lake', () => {
    const takes = COMMONS_PERSONAS.map((p) => {
      const s = play(commons, commons.create(setup(p, 'normal', 'standard', 6)), () => 3);
      return s.rounds.map((r: any) => r.requests[1]);
    });
    assert.equal(distinct(takes), 4);
    assert.equal(typeof commonsBotTake, 'function');
  });
});

// ── The Coalition ───────────────────────────────────────────────────────────

describe('the coalition', () => {
  it('minimal winning coalitions hold a majority and lose it without any member', () => {
    const s = coalition.create(setup('fair', 'normal', 'standard', 1));
    for (let seat = 0; seat < 4; seat++)
      for (const c of minimalWinning(s, seat)) {
        assert.ok(c.includes(seat));
        assert.ok(c.reduce((t: number, m: number) => t + s.weights[m], 0) >= MAJORITY);
        for (const m of c) assert.ok(pivotal(s, c, m));
      }
  });

  it('refuses a losing coalition, an unbalanced split and paying outsiders', () => {
    let s = coalition.create(setup('loyal', 'normal', 'standard', 2));
    while (coalitionPrompt(s)!.phase !== 'propose') s = coalition.apply(s, coalition.moves!(s)[0]);
    const smallest = [0, 1, 2, 3].sort((a, b) => s.weights[a] - s.weights[b]);
    const weak = [0, smallest.find((x) => x !== 0)!].sort();
    if (weak.reduce((t, m) => t + s.weights[m], 0) < MAJORITY) assert.ok(coalition.validate(s, { kind: 'propose', members: weak, shares: weak.map(() => 0).concat([0, 0]).slice(0, 4).map((_, i) => (i === 0 ? PRIZE : 0)) }));
    const ok = minimalWinning(s, 0)[0];
    const shares = [0, 0, 0, 0];
    shares[0] = PRIZE - 1;
    assert.ok(coalition.validate(s, { kind: 'propose', members: ok, shares }), 'must sum to the prize');
    const outsider = [0, 1, 2, 3].find((x) => !ok.includes(x))!;
    const pay = [0, 0, 0, 0];
    pay[0] = PRIZE - 1;
    pay[outsider] = 1;
    assert.ok(coalition.validate(s, { kind: 'propose', members: ok, shares: pay }), 'outsiders can’t be paid');
  });

  it('a bill passes only with every member’s yes, and pays only then', () => {
    let s = coalition.create(setup('broker', 'normal', 'standard', 3));
    s = play(coalition, s);
    for (const r of s.rounds) assert.equal(r.passed, r.responses.every((v: boolean | null) => v !== false));
    const paid = s.rounds.filter((r: any) => r.passed).length * PRIZE;
    assert.equal(s.points.reduce((a: number, b: number) => a + b, 0), paid);
  });

  it('personalities keep different shares when they propose', () => {
    const keep = COALITION_PERSONAS.map((p) => {
      let t = 0;
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const s = play(coalition, coalition.create(setup(p, 'normal', 'standard', seed)));
        for (const r of s.rounds) if (r.proposal.proposer === 1) [t, n] = [t + r.proposal.shares[1], n + 1];
      }
      return Math.round(t / n);
    });
    assert.ok(keep[1] > keep[3], `broker ${keep[1]} keeps more than fair ${keep[3]}`);
  });
});

// ── The Inspector ───────────────────────────────────────────────────────────

describe('the inspector', () => {
  it('pays the documented matrix and has the documented equilibrium', () => {
    assert.deepEqual(inspectPayoff('standard', 'comply', 'trust'), [2, 0]);
    assert.deepEqual(inspectPayoff('standard', 'comply', 'inspect'), [2, -2]);
    assert.deepEqual(inspectPayoff('standard', 'cut', 'trust'), [5, -3]);
    assert.deepEqual(inspectPayoff('standard', 'cut', 'inspect'), [-4, 2]);
    const eq = equilibrium('standard');
    assert.ok(Math.abs(eq.cheat - 2 / 7) < 1e-9 && Math.abs(eq.inspect - 1 / 3) < 1e-9);
  });

  it('alternates roles and refuses the wrong role’s move', () => {
    const s = inspector.create(setup('strict', 'normal', 'standard'));
    assert.ok(inspector.validate(s, 'inspect'));
    const t = inspector.apply(s, 'comply');
    assert.ok(inspector.validate(t, 'comply'));
    assert.equal(inspector.validate(t, 'trust'), null);
  });

  it('the bot never sees your current choice', () => {
    for (const persona of INSPECTOR_PERSONAS) {
      const s = inspector.create(setup(persona, 'hard', 'standard', 5));
      assert.equal(inspector.apply(s, 'comply').rounds[0].ins, inspector.apply(s, 'cut').rounds[0].ins);
      const t = inspector.apply(s, 'comply');
      assert.equal(inspector.apply(t, 'inspect').rounds[1].op, inspector.apply(t, 'trust').rounds[1].op);
    }
  });

  it('personalities differ in both roles', () => {
    const rates = INSPECTOR_PERSONAS.map((p) => {
      let ins = 0;
      let cut = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const s = play(inspector, inspector.create(setup(p, 'normal', 'standard', seed)), (st) => (st.rounds.length % 2 === 0 ? 'comply' : 'trust'));
        for (const r of s.rounds) {
          if (r.operator === 'player' && r.ins === 'inspect') ins++;
          if (r.operator === 'bot' && r.op === 'cut') cut++;
        }
      }
      return { ins, cut };
    });
    const [strict, , follower, risk] = rates;
    assert.ok(strict.ins > follower.ins && strict.ins > risk.ins, JSON.stringify(rates));
    assert.ok(risk.cut > follower.cut && risk.cut > strict.cut, JSON.stringify(rates));
    assert.equal(typeof inspectorChoice, 'function');
    assert.equal(typeof operatorChoice, 'function');
  });
});

// ── The Traveler's Dilemma ──────────────────────────────────────────────────

describe('the traveler’s dilemma', () => {
  it('pays the lower claim with the bonus and penalty', () => {
    assert.deepEqual(travelPayoff('standard', 20, 17), [15, 19]);
    assert.deepEqual(travelPayoff('standard', 12, 12), [12, 12]);
    assert.deepEqual(travelPayoff('big-bonus', 2, 20), [7, -3]);
  });

  it('refuses claims outside the range', () => {
    const s = travelers.create(setup('purist', 'normal', 'standard'));
    assert.ok(travelers.validate(s, CLAIM_MIN - 1));
    assert.ok(travelers.validate(s, CLAIM_MAX + 1));
    assert.ok(travelers.validate(s, 7.5));
    assert.equal(travelers.validate(s, CLAIM_MAX), null);
  });

  it('the purist claims the minimum on Hard; the cooperative traveller the maximum on Easy', () => {
    const p = play(travelers, travelers.create(setup('purist', 'hard', 'standard')), () => 20);
    assert.ok(p.rounds.every((r: any) => r.claims[1] === CLAIM_MIN));
    const c = play(travelers, travelers.create(setup('cooperative', 'easy', 'standard')), () => 2);
    assert.ok(c.rounds.every((r: any) => r.claims[1] === CLAIM_MAX));
  });

  it('reciprocity beats a race to the bottom, and both-minimum is below par', () => {
    const tit = play(travelers, travelers.create(setup('cooperative', 'hard', 'standard')), () => 20);
    assert.equal(travelers.result(tit).outcome, 'win');
    const low = play(travelers, travelers.create(setup('purist', 'hard', 'standard')), () => CLAIM_MIN);
    assert.notEqual(travelers.result(low).outcome, 'win');
  });

  it('claims don’t depend on your current claim', () => {
    for (const persona of TRAVELER_PERSONAS) {
      const s = travelers.apply(travelers.create(setup(persona, 'hard', 'standard', 4)), 15);
      assert.equal(travelers.apply(s, 2).rounds[1].claims[1], travelers.apply(s, 20).rounds[1].claims[1]);
    }
    assert.equal(typeof travelerClaim, 'function');
  });
});

// ── The Saboteur ────────────────────────────────────────────────────────────

describe('the saboteur', () => {
  it('reveals only totals, keeps the leader on the team and never benches you', () => {
    const s = play(saboteur, saboteur.create(setup('deceiver', 'normal', 'standard', 6)));
    for (const m of s.history) {
      assert.ok(m.bench >= 1 && m.bench <= 3 && m.bench !== m.leader);
      assert.equal(m.total, m.cards.filter((c: number | null) => c !== null).reduce((a: number, b: number) => a + b, 0));
      assert.equal(m.success, m.total >= m.target);
    }
  });

  it('bot cards don’t depend on your card', () => {
    const s = saboteur.create(setup('opportunist', 'hard', 'standard', 7));
    const a = saboteur.apply(s, { kind: 'mission', bench: 1, card: 0 });
    const b = saboteur.apply(s, { kind: 'mission', bench: 1, card: 3 });
    assert.deepEqual(a.history[0].cards.slice(1), b.history[0].cards.slice(1));
  });

  it('refuses spending energy you don’t have, and benching when you don’t lead', () => {
    let s = saboteur.create(setup('planner', 'normal', 'standard', 8));
    assert.ok(saboteur.validate(s, { kind: 'mission', card: 2 }), 'you lead the first mission: bench someone');
    s = saboteur.apply(s, { kind: 'mission', bench: 2, card: 3 });
    assert.ok(saboteur.validate(s, { kind: 'mission', card: 4 }));
    assert.equal(saboteurPrompt(s)!.phase, 'mission');
  });

  it('the four methods jam at different times', () => {
    const when = SABOTEUR_STYLES.map((p) => {
      const out: number[] = [];
      for (let seed = 1; seed <= 40; seed++) {
        const s = play(saboteur, saboteur.create(setup(p, 'normal', 'standard', seed)));
        s.history.forEach((m: any, i: number) => m.cards[s.saboteur] === -1 && out.push(i));
      }
      return out;
    });
    assert.equal(distinct(when), 4);
    assert.ok(Array.isArray(suspicion([])));
  });
});

// ── Bluff ───────────────────────────────────────────────────────────────────

describe('bluff', () => {
  it('first two tokens are never cracks, and the odds are exact', () => {
    for (let seed = 1; seed <= 300; seed++) {
      assert.notEqual(token(seed, 0, 0), 'crack');
      assert.notEqual(token(seed, 0, 1), 'crack');
    }
    assert.ok(Math.abs(pTokens(2, 0) - 1) < 1e-9);
    assert.ok(Math.abs(pTokens(1, 3) - 0.25 / 0.85) < 1e-9);
  });

  it('scores believe, a failed call and a caught bluff as documented', () => {
    const s = bluff.create(setup('risk-taker', 'easy', 'standard', 12));
    const p = bluffPrompt(s) as any;
    const honest = bluff.apply(s, { claim: p.value });
    const r = honest.rounds[0];
    if (!r.call) assert.deepEqual(r.points, [p.value, 0]);
    else assert.deepEqual(r.points, [p.value, -2]);
    const big = bluff.apply(s, { claim: p.maxClaim });
    const b = big.rounds[0];
    if (b.call && p.maxClaim > p.value) assert.deepEqual(b.points, [-2, 3]);
  });

  it('the bot’s call depends only on count, claim and history', () => {
    const s = bluff.create(setup('observant', 'hard', 'standard', 3));
    assert.equal(botCalls(s, 3, 7, 0.5), botCalls(s, 3, 7, 0.5));
    assert.equal(botCalls(s, 3, 9, 0.5), true, 'a claim of the maximum on three tokens is a likely bluff');
  });

  it('personalities differ in how much they bluff and call', () => {
    const stats = BLUFF_PERSONAS.map((p) => {
      let over = 0;
      let calls = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const s = play(bluff, bluff.create(setup(p, 'normal', 'standard', seed)));
        for (const r of s.rounds) {
          if (r.claimant === 'bot' && !r.bust) over += r.claim - r.tokens.reduce((t: number, x: any) => t + (x === 'crack' ? 0 : x), 0);
          if (r.claimant === 'player' && r.call) calls++;
        }
      }
      return { over, calls };
    });
    assert.ok(stats[1].over > stats[0].over && stats[1].over > stats[2].over, JSON.stringify(stats));
    assert.equal(distinct(stats), 4);
  });
});

// ── The Defusal ─────────────────────────────────────────────────────────────

describe('the defusal', () => {
  it('every generated clue is true, and the two hands don’t overlap', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = defusal.create(setup('methodical', 'normal', 'standard', seed));
      for (const c of [...s.hands.player, ...s.hands.bot]) assert.ok(holds(c, s.live));
      for (const c of s.hands.player) assert.ok(!s.hands.bot.includes(c));
      assert.ok(consistent(s, [...s.hands.player, ...s.hands.bot]).some((l: number[]) => l[0] === s.live[0] && l[1] === s.live[1]));
    }
    assert.equal(allLive(6).length, 15);
    assert.ok(trueClues(6, [0, 1]).every((c) => holds(c, [0, 1])));
  });

  it('difficulty deals fewer clues', () => {
    assert.equal(defusal.create(setup('bold', 'easy', 'standard')).hands.player.length, 4);
    assert.equal(defusal.create(setup('bold', 'hard', 'standard')).hands.player.length, 2);
  });

  it('cutting a live wire ends the mission; cutting every safe wire defuses it', () => {
    let s = defusal.create(setup('cautious', 'normal', 'standard', 4));
    const boom = defusal.apply(s, { kind: 'cut', wire: s.live[0] });
    assert.ok(defusal.isOver(boom) && defusal.result(boom).outcome === 'loss');
    s = play(defusal, s);
    assert.equal(defusal.result(s).outcome, defused(s) ? 'win' : 'loss');
    assert.ok(defusal.validate(s, { kind: 'cut', wire: 0 }));
  });

  it('the teammate never reads your unshared clues: its cut is the same whatever you hold back', () => {
    const s = defusal.create(setup('methodical', 'normal', 'standard', 9));
    const t = defusal.apply(s, { kind: 'cut', wire: [0, 1, 2, 3, 4, 5].find((w) => !s.live.includes(w))! });
    const k = t.hands.player.length;
    // Sharing different clues can change its cut; but with the same share, changing an *unshared* clue must not.
    const alt = { ...t, hands: { ...t.hands, player: t.hands.player.map((c: any, i: number) => (i === k - 1 ? { kind: 'parity', p: 'odd' } : c)) } };
    assert.deepEqual(defusal.apply(t, { kind: 'share', clue: 0 }).turns[1].cut, defusal.apply(alt, { kind: 'share', clue: 0 }).turns[1].cut);
  });

  it('teammates differ: the cautious checker holds, the bold solver doesn’t', () => {
    let holdsCautious = 0;
    let holdsBold = 0;
    for (let seed = 1; seed <= 60; seed++) {
      holdsCautious += play(defusal, defusal.create(setup('cautious', 'hard', 'standard', seed))).turns.filter((t: any) => t.cutter === 'bot' && t.cut === null).length;
      holdsBold += play(defusal, defusal.create(setup('bold', 'hard', 'standard', seed))).turns.filter((t: any) => t.cutter === 'bot' && t.cut === null).length;
    }
    assert.ok(holdsCautious > 0 && holdsBold === 0, `${holdsCautious} vs ${holdsBold}`);
    assert.equal(DEFUSAL_PERSONAS.length, 4);
  });
});

// ── The Power Play ──────────────────────────────────────────────────────────

describe('the power play', () => {
  it('deals two cards each from a 12-card deck and conserves every card', () => {
    const s = powerPlay.create(setup('honest', 'normal', 'standard', 3));
    assert.equal(s.player.hand.length, 2);
    assert.equal(s.bot.hand.length, 2);
    const end = play(powerPlay, s, (_st, ms) => ms[ms.length - 1]);
    const all = [...end.deck, ...end.player.hand, ...end.player.lost, ...end.bot.hand, ...end.bot.lost].map((c: any) => c.id).sort((a: number, b: number) => a - b);
    assert.deepEqual(all, [...Array(12).keys()]);
  });

  it('card counting is exact at the edges', () => {
    const s = powerPlay.create(setup('challenger', 'normal', 'standard', 4));
    for (const role of ['treasurer', 'thief', 'guard', 'oracle'] as const) {
      const p = pHolds(s, role);
      assert.ok(p >= 0 && p <= 1);
    }
    const allSeen = { ...s, bot: { ...s.bot, lost: [...s.deck.filter((c: any) => c.role === 'guard'), ...s.player.hand.filter((c: any) => c.role === 'guard')] } };
    const left = 3 - [...allSeen.bot.hand, ...allSeen.bot.lost].filter((c: any) => c.role === 'guard').length;
    if (left <= 0) assert.equal(pHolds(allSeen as any, 'guard'), 0);
  });

  it('a false claim that is challenged costs the claimant a card and fails', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = powerPlay.create(setup('challenger', 'normal', 'standard', seed));
      if (s.player.hand.some((c: any) => c.role === 'treasurer')) continue;
      const t = powerPlay.apply(s, { kind: 'act', move: 'treasury' });
      const turn = t.turns[0];
      if (turn.challenged) {
        assert.equal(turn.truthful, false);
        assert.equal(t.player.hand.length, 1);
        assert.equal(t.player.coins, s.player.coins);
        return;
      }
    }
  });

  it('personalities differ in how they claim and challenge', () => {
    const stats = POWER_PERSONAS.map((p) => {
      let bluffs = 0;
      let challenges = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const s = play(powerPlay, powerPlay.create(setup(p, 'normal', 'standard', seed)), (st, ms) => (powerPrompt(st)!.phase === 'act' ? ms[1] : ms[0]));
        for (const t of s.turns) {
          if (t.actor === 'player' && t.challenged) challenges++;
          if (t.actor === 'bot' && t.truthful === false) bluffs++;
        }
      }
      return { bluffs, challenges };
    });
    assert.ok(stats[2].challenges > stats[0].challenges, JSON.stringify(stats));
    assert.equal(distinct(stats), 4);
  });
});

// ── The Last Stand ──────────────────────────────────────────────────────────

describe('the last stand', () => {
  it('fire spreads from 2+ into unprotected neighbours and grows', () => {
    const next = spread([2, 0, 0, 0, 0, 0], new Set([1]));
    assert.deepEqual(next, [3, 0, 0, 0, 0, 1]);
    assert.deepEqual(spread([BURNED, 0, 0, 0, 0, 0], new Set()), [BURNED, 0, 0, 0, 0, 0]);
  });

  it('the teammate commits first: its plan doesn’t depend on yours', () => {
    for (const persona of LAST_STAND_PERSONAS) {
      const s = lastStand.create(setup(persona, 'normal', 'standard', 5));
      assert.deepEqual(lastStand.apply(s, { kind: 'refill' }).rounds[0].bot, teammatePlan(s));
      assert.deepEqual(lastStand.apply(s, { kind: 'firebreak', d: 0 }).rounds[0].bot, teammatePlan(s));
    }
  });

  it('refuses dousing with no water and acting on a burned-out district', () => {
    const s = { ...lastStand.create(setup('responder', 'normal', 'standard', 2)), water: 0 };
    assert.ok(lastStand.validate(s, { kind: 'douse', d: 0 }));
    const burned = { ...s, water: 5, fire: s.fire.map((f: number, i: number) => (i === 0 ? BURNED : f)) };
    assert.ok(lastStand.validate(burned, { kind: 'firebreak', d: 0 }));
  });

  it('the guardian refills far more than the responder', () => {
    const count = (p: string) => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) n += play(lastStand, lastStand.create(setup(p, 'normal', 'standard', seed))).rounds.filter((r: any) => r.bot.kind === 'refill').length;
      return n;
    };
    assert.ok(count('guardian') > count('responder') * 2);
    assert.equal(typeof held, 'function');
  });
});

// ── Liar's Dice ─────────────────────────────────────────────────────────────

describe('liar’s dice', () => {
  it('raises must go up, and binomial odds are exact', () => {
    assert.ok(isRaise({ q: 3, f: 2 }, { q: 2, f: 6 }));
    assert.ok(isRaise({ q: 2, f: 5 }, { q: 2, f: 4 }));
    assert.ok(!isRaise({ q: 2, f: 4 }, { q: 2, f: 4 }));
    assert.ok(!isRaise({ q: 1, f: 6 }, { q: 2, f: 1 }));
    assert.ok(Math.abs(pAtLeast(1, 1) - 1 / 6) < 1e-12);
    assert.equal(pAtLeast(4, 0), 1);
    assert.equal(pAtLeast(2, 3), 0);
  });

  it('a call removes exactly one die from the right side', () => {
    let s = liarsDice.create(setup('calculator', 'normal', 'standard', 5));
    s = liarsDice.apply(s, { kind: 'bid', q: 1, f: 6 });
    if (s.rounds.length === 0) {
      const before = s.count.player + s.count.bot;
      const t = liarsDice.apply(s, { kind: 'liar' });
      assert.equal(t.count.player + t.count.bot, before - 1);
      const r = t.rounds[0];
      const last = r.bids[r.bids.length - 1];
      assert.equal(r.loser, r.count >= last.q ? 'player' : 'bot');
    }
  });

  it('refuses calling with no bid and non-raising bids', () => {
    const s = liarsDice.create(setup('aggressive', 'normal', 'standard', 6));
    assert.ok(liarsDice.validate(s, { kind: 'liar' }));
    const t = liarsDice.apply(s, { kind: 'bid', q: 1, f: 1 });
    if (liveBids(t).length) assert.ok(liarsDice.validate(t, { kind: 'bid', q: 1, f: 1 }));
  });

  it('the bot never sees your dice: changing your cup doesn’t change its reply', () => {
    const s = liarsDice.create(setup('calculator', 'hard', 'standard', 7));
    const a = liarsDice.apply(s, { kind: 'bid', q: 2, f: 3 });
    // Same state, same bid: replies come from the bot's own dice and the bids.
    const b = liarsDice.apply(s, { kind: 'bid', q: 2, f: 3 });
    assert.deepEqual(a, b);
    assert.equal(roll(s).player.length, 4);
  });

  it('personalities call at different points', () => {
    // How far the bidding goes before the bot calls: the Conservative Challenger calls early, the Aggressive Bidder late.
    const depth = DICE_PERSONAS.map((p) => {
      let t = 0;
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) for (const r of play(liarsDice, liarsDice.create(setup(p, 'normal', 'standard', seed))).rounds) if (r.caller === 'bot') [t, n] = [t + r.bids[r.bids.length - 1].q, n + 1];
      return t / n;
    });
    assert.ok(depth[2] < depth[1], `conservative ${depth[2]} vs aggressive ${depth[1]}`);
  });
});

// ── The Codebreaker ─────────────────────────────────────────────────────────

describe('the codebreaker', () => {
  it('boards have three targets and the level’s traps', () => {
    for (const level of LEVELS) {
      const b = boardFor(9, 0, level);
      assert.equal(b.key.filter((k) => k === 'target').length, 3);
      assert.equal(b.key.filter((k) => k === 'trap').length, level === 'hard' ? 2 : 1);
      assert.equal(new Set(b.words).size, b.words.length);
    }
  });

  it('guessing stops at the first miss and the trap costs 3', () => {
    const b = boardFor(3, 1, 'normal');
    const trap = b.key.indexOf('trap');
    const target = b.key.indexOf('target');
    assert.deepEqual(resolveGuesses(b, [target, trap, target], 4), { guesses: [target, trap], points: 1 - 3 });
  });

  it('the bot guesses from the board and clue only; risk-aware clues stay clear of the trap', () => {
    let clean = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const b = boardFor(seed, 0, 'normal');
      const c = botClue('risk-aware', b);
      const trap = b.words[b.key.indexOf('trap')];
      if (link(trap, c.theme) === 0) clean++;
      assert.ok(c.n >= 1);
      const g1 = botGuesses('literal', b, c);
      const g2 = botGuesses('literal', { ...b, key: b.key.map(() => 'neutral') }, c);
      assert.deepEqual(g1, g2, 'the key never changes the guesses');
    }
    assert.ok(clean >= 27, `${clean} of 30 clues avoid the trap`);
  });

  it('clue-givers differ in how many words they reach for', () => {
    const avg = CODE_PERSONAS.map((p) => {
      let t = 0;
      for (let seed = 1; seed <= 60; seed++) t += botClue(p, boardFor(seed, 0, 'normal')).n;
      return t;
    });
    assert.ok(avg[3] > avg[0], `creative ${avg[3]} vs literal ${avg[0]}`);
  });

  it('refuses a clue outside the theme list and guesses on revealed words', () => {
    let s = codebreaker.create(setup('associative', 'normal', 'standard'));
    assert.equal(codePrompt(s)!.phase, 'guess');
    s = codebreaker.apply(s, { kind: 'guess', word: 0 });
    if (s.rounds.length === 0) assert.ok(codebreaker.validate(s, { kind: 'guess', word: 0 }));
    s = play(codebreaker, codebreaker.create(setup('associative', 'normal', 'standard')), (st, ms) => (codePrompt(st)!.phase === 'clue' ? ms[0] : ms[0]));
    assert.ok(codebreaker.validate(codebreaker.create(setup('literal', 'normal', 'standard')), { kind: 'clue', theme: 'ocean', n: 1 }));
  });
});

// ── The Gambit ──────────────────────────────────────────────────────────────

describe('the gambit', () => {
  it('opening moves are steps and dashes only, all legal', () => {
    const s = gambit.create(setup('safe', 'normal', 'standard'));
    const ms = legalMoves(s, 'player');
    assert.ok(ms.length > 0 && ms.every((m) => m.kind !== 'strike'));
    assert.ok(ms.some((m) => m.kind === 'dash'));
  });

  it('a failed strike knocks the attacker back; a successful one captures', () => {
    const pos = { pieces: [{ side: 'player' as const, r: 2, c: 2 }, { side: 'bot' as const, r: 3, c: 3 }], home: { player: 0, bot: 0 } };
    const m = legalMoves(pos, 'player').find((x) => x.kind === 'strike')!;
    assert.ok(m);
    const hit = resolveMove(pos, 'player', m, true);
    assert.equal(hit.pos.pieces.length, 1);
    assert.deepEqual([hit.pos.pieces[0].r, hit.pos.pieces[0].c], [3, 3]);
    const miss = resolveMove(pos, 'player', m, false);
    assert.equal(miss.pos.pieces.find((x) => x.side === 'player')!.r, 1);
  });

  it('refuses moving an enemy piece or an illegal square', () => {
    const s = gambit.create(setup('gambler', 'normal', 'standard'));
    assert.ok(gambit.validate(s, { from: [5, 1], to: [4, 1] }));
    assert.ok(gambit.validate(s, { from: [0, 1], to: [3, 1] }));
    assert.equal(gambit.validate(s, { from: [0, 1], to: [1, 1] }), null);
  });

  it('risk attitude separates the personalities', () => {
    const risky = GAMBIT_PERSONAS.map((p) => {
      let r = 0;
      let n = 0;
      for (let seed = 1; seed <= 30; seed++)
        for (const t of play(gambit, gambit.create(setup(p, 'normal', 'standard', seed)), (_s, ms) => ms[ms.length - 1]).turns)
          if (t.side === 'bot') [r, n] = [r + (t.move.kind === 'step' ? 0 : 1), n + 1];
      return r / n;
    });
    assert.ok(risky[1] > risky[2] && risky[2] > risky[0], JSON.stringify(risky));
    assert.equal(typeof gambitBotMove, 'function');
  });
});
