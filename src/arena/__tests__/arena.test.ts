/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ARENA } from '../catalog.ts';
import { BIDDERS, auction, auctionBotBid, auctionLot, auctionPrompt, auctionSeats, posteriorMean, type AuctionState } from '../auction.ts';
import { COOP_PAYOFFS, COOP_VARIANTS, cooperation, coopBotMove, coopPar, coopPayoff, isDilemma, trustLevel, type CoopMove, type CoopState } from '../cooperation.ts';
import { ARENA_IDS, LENGTHS, LEVELS, PERSONAS, type AnyArenaEngine, type Level, type Persona, type Setup, resultFrom } from '../core.ts';
import { PRICE_MAX, PRICE_MIN, bestReply, conditions, equilibriumPrice, market, marketBotPrice, marketOutcome, marketPar, type MarketState } from '../market.ts';
import { ARENA_ENGINES } from '../registry.ts';
import { FEE, GAIN, LOSS, STAKE, TEST_COST, afterTest, botBelief, hiddenSignal, payoffs, signalBotReceive, signalBotSend, signalPrompt, venture, type SignalState } from '../signal.ts';
import { ULT_POOLS, playerProposesUlt, ultBotMinAccept, ultBotOffer, ultPrompt, ultTerms, ultimatumGame, type UltState } from '../ultimatum-game.ts';

const setup = <V extends string>(persona: Persona, level: Level, variant: V, seed = 42, length: Setup['length'] = 'standard'): Setup<V> => ({ persona, level, variant, length, seed });

/** A legal move for any arena game, from a simple policy — enough to drive every engine to the end. */
function anyMove(id: string, s: any, k: number): unknown {
  switch (id) {
    case 'cooperation':
      return k % 3 === 0 ? 'D' : 'C';
    case 'ultimatum-game': {
      const p = ultPrompt(s)!;
      return p.terms.proposer === 'player' ? Math.floor(p.terms.pool / 2) : k % 2 ? 'accept' : 'reject';
    }
    case 'auction': {
      const p = auctionPrompt(s)!;
      return Math.min(p.cash, Math.max(0, Math.round(posteriorMean(p.lot, p.estimate) * 0.8)));
    }
    case 'market':
      return 8 + (k % 6);
    case 'signal': {
      const p = signalPrompt(s)!;
      if (p.role === 'send') return p.strong ? 'stake' : k % 2 ? 'pitch' : 'warn';
      if (p.test === null && k % 3 === 0) return 'investigate';
      return p.signal === 'warn' ? 'pass' : 'invest';
    }
  }
  throw new Error(id);
}

function playOut(engine: AnyArenaEngine, s: any): any {
  let k = 0;
  while (!engine.isOver(s)) s = engine.apply(s, anyMove(engine.id, s, k++));
  return s;
}

describe('every arena game', () => {
  for (const id of ARENA_IDS) {
    const engine = ARENA_ENGINES[id];
    it(`${id}: completes a match for every persona, level, variant and length`, () => {
      for (const persona of PERSONAS)
        for (const level of LEVELS)
          for (const variant of engine.variants)
            for (const length of LENGTHS) {
              const s = playOut(engine, engine.create({ persona, level, variant, length, seed: 7 }));
              assert.equal(engine.played(s), engine.rounds(length));
              const r = engine.result(s);
              assert.ok(['win', 'loss', 'draw'].includes(r.outcome));
              assert.equal(r.standings.find((x) => x.isPlayer)!.score, r.player);
              const d = engine.debrief(s);
              assert.ok(d.moments.length >= 1 && d.moments.length <= 3, `${id} ${persona} ${level}: ${d.moments.length} moments`);
              assert.ok(d.insight.length > 20 && d.opponentRead.length > 20);
            }
    });

    it(`${id}: refuses moves after the end and leaves the state unchanged`, () => {
      const s = playOut(engine, engine.create(setup('investor', 'normal', engine.variants[0])));
      assert.ok(engine.validate(s, anyMove(id, engine.create(setup('investor', 'normal', engine.variants[0])), 0)));
      assert.throws(() => engine.apply(s, 'C'));
    });

    it(`${id}: replays exactly from the same seed`, () => {
      const a = playOut(engine, engine.create(setup('opportunist', 'hard', engine.variants[engine.variants.length - 1], 99)));
      const b = playOut(engine, engine.create(setup('opportunist', 'hard', engine.variants[engine.variants.length - 1], 99)));
      assert.deepEqual(a, b);
    });

    it(`${id}: a rematch starts from a clean state`, () => {
      const fresh = engine.create(setup('banker', 'easy', engine.variants[0], 5));
      playOut(engine, fresh);
      assert.equal(engine.played(fresh), 0, 'apply must not mutate the previous state');
      assert.deepEqual(engine.create(setup('banker', 'easy', engine.variants[0], 5)), fresh);
    });

    it(`${id}: the catalog describes every persona and variant`, () => {
      const info = ARENA[id];
      for (const p of PERSONAS) assert.ok(info.personas[p].length > 10);
      assert.deepEqual(info.variants.map((v) => v.id), [...engine.variants]);
      assert.equal(info.variants.filter((v) => !v.challenge).length, 1, 'exactly one standard variant');
    });
  }
});

describe('results and par', () => {
  const e = (player: number, rival: number) => [
    { id: 'you', name: 'You', score: player, isPlayer: true },
    { id: 'r', name: 'R', score: rival, isPlayer: false },
  ];
  it('wins on top at or above par, draws on top below it', () => {
    assert.equal(resultFrom(e(30, 30), 'p', { par: 21 }).outcome, 'win');
    assert.equal(resultFrom(e(14, 9), 'p', { par: 21 }).outcome, 'draw');
    assert.ok(resultFrom(e(14, 9), 'p', { par: 21 }).note);
    assert.equal(resultFrom(e(20, 25), 'p', { par: 21 }).outcome, 'loss');
    assert.equal(resultFrom(e(30, 30), 'p', { par: 21, tieWins: false }).outcome, 'draw');
    assert.equal(resultFrom(e(-3, -8), 'p', { positive: true }).outcome, 'draw');
  });
});

// ── Cooperation ─────────────────────────────────────────────────────────────

describe('cooperation', () => {
  it('every variant is a genuine repeated dilemma', () => {
    for (const v of COOP_VARIANTS) assert.ok(isDilemma(COOP_PAYOFFS[v]), v);
  });

  it('pays the four outcomes from the matrix', () => {
    const P = COOP_PAYOFFS.classic;
    assert.deepEqual(coopPayoff(P, 'C', 'C'), [P.R, P.R]);
    assert.deepEqual(coopPayoff(P, 'D', 'C'), [P.T, P.S]);
    assert.deepEqual(coopPayoff(P, 'C', 'D'), [P.S, P.T]);
    assert.deepEqual(coopPayoff(P, 'D', 'D'), [P.P, P.P]);
  });

  it('the bot chooses before seeing the current move (simultaneous)', () => {
    for (const persona of PERSONAS)
      for (const level of LEVELS) {
        let s = cooperation.create(setup(persona, level, 'classic', 3));
        for (let i = 0; i < 9; i++) {
          const c = cooperation.apply(s, 'C');
          const d = cooperation.apply(s, 'D');
          assert.equal(c.rounds[i].bi, d.rounds[i].bi, `${persona} ${level} round ${i + 1}`);
          s = i % 4 === 0 ? d : c;
        }
      }
  });

  it('accumulates scores and validates moves', () => {
    let s: CoopState = cooperation.create(setup('dealmaker', 'normal', 'classic'));
    assert.ok(cooperation.validate(s, 'X' as never));
    s = cooperation.apply(s, 'C');
    s = cooperation.apply(s, 'C');
    const r = cooperation.result(s);
    assert.equal(r.player, 6);
    assert.equal(r.rival, 6);
  });

  it('slips only happen in the noisy line, are independent of difficulty, and are revealed', () => {
    const run = (level: Level, variant: 'classic' | 'noisy') => {
      let s: CoopState = cooperation.create(setup('investor', level, variant, 11, 'long'));
      while (!cooperation.isOver(s)) s = cooperation.apply(s, 'C');
      return s.rounds.map((r) => r.p !== r.pi);
    };
    assert.ok(run('easy', 'classic').every((x) => !x));
    assert.deepEqual(run('easy', 'noisy'), run('hard', 'noisy'));
    let slips = 0;
    for (let seed = 0; seed < 200; seed++) {
      let s: CoopState = cooperation.create(setup('banker', 'normal', 'noisy', seed));
      while (!cooperation.isOver(s)) s = cooperation.apply(s, 'C');
      slips += s.rounds.filter((r) => r.p !== r.pi).length;
    }
    assert.ok(slips > 120 && slips < 280, `${slips} slips in 2000 choices`);
  });

  const vs = (persona: Persona, level: Level, policy: (h: CoopState['rounds'], s: CoopState) => CoopMove) => {
    let s: CoopState = cooperation.create(setup(persona, level, 'classic', 21));
    while (!cooperation.isOver(s)) s = cooperation.apply(s, policy(s.rounds, s));
    return s;
  };

  it('reciprocal personas cooperate with a cooperator and punish a defector', () => {
    for (const persona of ['investor', 'banker', 'dealmaker'] as const) {
      const nice = vs(persona, 'normal', () => 'C');
      assert.ok(nice.rounds.every((r) => r.b === 'C'), persona);
      const mean = vs(persona, 'normal', () => 'D');
      assert.ok(mean.rounds.filter((r) => r.b === 'D').length >= 7, persona);
    }
  });

  it('always defecting is never a win: it tops the table below par', () => {
    for (const persona of PERSONAS)
      for (const level of ['normal', 'hard'] as const) {
        const s = vs(persona, level, () => 'D');
        assert.notEqual(cooperation.result(s).outcome, 'win', `${persona} ${level}`);
        assert.ok(cooperation.result(s).player < coopPar(s));
      }
  });

  it('the Opportunist exploits an unconditional cooperator', () => {
    for (const level of LEVELS) {
      const s = vs('opportunist', level, () => 'C');
      assert.equal(cooperation.result(s).outcome, 'loss', level);
    }
  });

  it('difficulty changes the policy: Hard Banker takes the final-round defection, Easy and Normal do not', () => {
    for (const level of LEVELS) {
      const s = vs('banker', level, () => 'C');
      assert.equal(s.rounds[s.total - 1].b, level === 'hard' ? 'D' : 'C', level);
    }
  });

  it('difficulty changes exploitability: alternating defections pay more against Easy than Hard Investor', () => {
    const alt = (level: Level) => cooperation.result(vs('investor', level, (h) => (h.length % 2 ? 'D' : 'C'))).player;
    assert.ok(alt('easy') > alt('hard'), `${alt('easy')} vs ${alt('hard')}`);
  });

  it('Hard Opportunist punishes forgiveness: it keeps defecting on a player who never retaliates', () => {
    const s = vs('opportunist', 'hard', () => 'C');
    assert.ok(s.rounds.filter((r) => r.b === 'D').length >= 5);
    assert.equal(coopBotMove(s.setup, s.total, s.rounds.slice(0, s.total - 1)), 'D');
  });

  it('trust rises with mutual cooperation and falls with betrayal', () => {
    const good = vs('dealmaker', 'easy', () => 'C');
    assert.equal(trustLevel(good.rounds), 100);
    const bad = vs('investor', 'hard', () => 'D');
    assert.ok(trustLevel(bad.rounds) < 20);
  });

  it('the debrief names the first defection and its consequences', () => {
    const s = vs('investor', 'hard', (h) => (h.length === 3 ? 'D' : 'C'));
    const d = cooperation.debrief(s);
    assert.match(d.moments[0], /round 4/);
  });
});

// ── Ultimatum ───────────────────────────────────────────────────────────────

describe('ultimatum game', () => {
  it('validates offers from 0 to the pool', () => {
    const s: UltState = ultimatumGame.create(setup('banker', 'normal', 'standard'));
    const pool = ultTerms(s.setup, 0).pool;
    assert.equal(ultimatumGame.validate(s, 0), null);
    assert.equal(ultimatumGame.validate(s, pool), null);
    assert.ok(ultimatumGame.validate(s, -1));
    assert.ok(ultimatumGame.validate(s, pool + 1));
    assert.ok(ultimatumGame.validate(s, 2.5));
    assert.ok(ultimatumGame.validate(s, 'accept'), 'can’t accept when proposing');
    const s1 = ultimatumGame.apply(s, 4);
    assert.ok(ultimatumGame.validate(s1, 3), 'can’t offer when responding');
    assert.equal(ultimatumGame.validate(s1, 'reject'), null);
  });

  it('conserves tokens: accepted splits sum to the pool, rejections pay walk-aways', () => {
    for (const variant of ['standard', 'outside-options'] as const)
      for (const persona of PERSONAS) {
        let s: UltState = ultimatumGame.create(setup(persona, 'hard', variant, 8, 'long'));
        let k = 0;
        while (!ultimatumGame.isOver(s)) s = ultimatumGame.apply(s, anyMove('ultimatum-game', s, k++) as never);
        for (const r of s.rounds) {
          assert.ok(ULT_POOLS.includes(r.pool as (typeof ULT_POOLS)[number]));
          if (r.accepted) assert.equal(r.ps + r.bs, r.pool);
          else assert.deepEqual([r.ps, r.bs], [r.walkPlayer, r.walkBot]);
          if (variant === 'standard') assert.deepEqual([r.walkPlayer, r.walkBot], [0, 0]);
        }
      }
  });

  it('roles alternate: the player proposes in odd rounds', () => {
    assert.deepEqual([0, 1, 2, 3].map(playerProposesUlt), [true, false, true, false]);
  });

  it('the bot accepts exactly at its threshold and rejects one below', () => {
    for (const persona of PERSONAS)
      for (const level of LEVELS) {
        const s: UltState = ultimatumGame.create(setup(persona, level, 'outside-options', 4));
        const t = ultTerms(s.setup, 0);
        const min = ultBotMinAccept(s.setup, s.total, [], t);
        assert.ok(min > t.walkBot, 'always needs more than its walk-away');
        if (min <= t.pool) assert.equal(ultimatumGame.apply(s, min).rounds[0].accepted, true);
        assert.equal(ultimatumGame.apply(s, min - 1).rounds[0].accepted, false);
      }
  });

  it('Easy accepts more than Normal, which accepts no more than Hard demands (Banker)', () => {
    const s: UltState = ultimatumGame.create(setup('banker', 'easy', 'standard', 4));
    const t = { ...ultTerms(s.setup, 0), pool: 20 };
    const m = (level: Level) => ultBotMinAccept({ ...s.setup, level }, s.total, [], t);
    assert.ok(m('easy') < m('normal') && m('normal') < m('hard'));
  });

  it('Hard Investor is tough while it can build a reputation and practical in its last response', () => {
    const sp = setup('investor', 'hard', 'standard' as const, 4);
    const t = { pool: 20, walkPlayer: 0, walkBot: 0, proposer: 'player' as const };
    const early = ultBotMinAccept(sp, 6, [], t);
    const fake = Array.from({ length: 4 }, () => ({ ...t, offer: 10, accepted: true, ps: 10, bs: 10, botMin: 5 }));
    const late = ultBotMinAccept(sp, 6, fake, t);
    assert.ok(early > late, `${early} vs ${late}`);
  });

  it('the Opportunist proposer probes lower after acceptances and higher after rejections (Normal)', () => {
    const sp = setup('opportunist', 'normal', 'standard' as const);
    const t = { pool: 20, walkPlayer: 0, walkBot: 0, proposer: 'bot' as const };
    const first = ultBotOffer(sp, [], t);
    const afterReject = ultBotOffer(sp, [{ ...t, offer: first, accepted: false, ps: 0, bs: 0, botMin: null }], t);
    const afterAccept = ultBotOffer(sp, [{ ...t, offer: first, accepted: true, ps: first, bs: 20 - first, botMin: null }], t);
    assert.ok(afterReject > first && afterAccept < first);
  });

  it('records the bot’s threshold for the debrief, which reports unused bargaining power', () => {
    let s: UltState = ultimatumGame.create(setup('opportunist', 'easy', 'standard', 2));
    s = ultimatumGame.apply(s, ultTerms(s.setup, 0).pool);
    assert.equal(s.rounds[0].accepted, true);
    assert.ok(s.rounds[0].botMin !== null && s.rounds[0].botMin < s.rounds[0].offer);
    while (!ultimatumGame.isOver(s)) s = ultimatumGame.apply(s, playerProposesUlt(s.rounds.length) ? ultTerms(s.setup, s.rounds.length).pool : 'accept');
    assert.ok(ultimatumGame.debrief(s).moments.some((m) => /would have taken/.test(m)));
  });
});

// ── Auction ─────────────────────────────────────────────────────────────────

describe('auction house', () => {
  const fresh = (persona: Persona = 'investor', level: Level = 'normal', seed = 42) => auction.create(setup(persona, level, 'standard', seed)) as AuctionState;

  it('seats the player, the chosen rival and two other personalities', () => {
    for (const persona of PERSONAS) {
      const seats = auctionSeats(setup(persona, 'easy', 'standard', 3));
      assert.equal(seats.length, BIDDERS);
      assert.equal(seats[0], null);
      assert.equal(seats[1], persona);
      assert.equal(new Set(seats).size, BIDDERS);
    }
  });

  it('generates lots from validated ranges, reproducibly, independent of difficulty', () => {
    for (let n = 0; n < 8; n++) {
      const a = auctionLot(setup('banker', 'easy', 'standard', 5), n);
      const b = auctionLot(setup('opportunist', 'hard', 'standard', 5), n);
      assert.deepEqual(a, b);
      assert.ok(a.lot.lo >= 30 && a.lot.lo <= 60 && a.lot.hi - a.lot.lo >= 40 && a.lot.hi - a.lot.lo <= 80);
      assert.ok(a.value >= a.lot.lo && a.value <= a.lot.hi);
      assert.ok(a.lot.u >= 8 && a.lot.u <= 16);
      for (const e of a.estimates) assert.ok(Math.abs(e - a.value) <= a.lot.u);
      const fog = auctionLot(setup('banker', 'easy', 'fog', 5), n);
      assert.ok(fog.lot.u >= 20 && fog.lot.u <= 30);
    }
  });

  it('validates bids against the budget', () => {
    const s = fresh();
    assert.ok(auction.validate(s, -1));
    assert.ok(auction.validate(s, 3.5));
    assert.ok(auction.validate(s, s.cash[0] + 1));
    assert.equal(auction.validate(s, s.cash[0]), null);
    assert.equal(auction.validate(s, 0), null);
  });

  it('bots bid without seeing the player’s bid', () => {
    for (const persona of PERSONAS) {
      const s = fresh(persona, 'hard');
      const lo = auction.apply(s, 0);
      const hi = auction.apply(s, 50);
      assert.deepEqual(lo.rounds[0].bids.slice(1), hi.rounds[0].bids.slice(1));
    }
  });

  it('the highest bid wins and pays its own bid; profit is value minus price', () => {
    const s = fresh();
    const after = auction.apply(s, s.cash[0]);
    const r = after.rounds[0];
    assert.equal(r.winner, 0);
    assert.equal(r.price, s.cash[0]);
    assert.equal(after.profit[0], r.value - r.price);
    assert.equal(after.cash[0], 0);
    assert.ok(after.rounds[0].bids.every((b, i) => i === 0 || b <= r.price));
  });

  it('passing on everything never wins or loses money', () => {
    let s = fresh();
    while (!auction.isOver(s)) s = auction.apply(s, 0);
    assert.equal(s.profit[0], 0);
    assert.ok(s.rounds.every((r) => r.winner !== 0));
  });

  it('breaks equal top bids with a seeded draw among the tied bidders', () => {
    let s = fresh('banker', 'easy', 1);
    for (let i = 0; i < 40 && !auction.isOver(s); i++) {
      const bids = auction.apply(s, 0).rounds[s.rounds.length].bids;
      const top = Math.max(...bids.slice(1));
      const after = auction.apply(s, Math.min(top, s.cash[0]));
      const r = after.rounds[after.rounds.length - 1];
      if (top > 0 && top <= s.cash[0]) assert.ok(r.winner !== null && r.bids[r.winner] === top);
      s = after;
    }
  });

  it('bots never bid above their cash, and keep a reserve for later lots', () => {
    for (const persona of PERSONAS)
      for (const level of LEVELS) {
        let s = fresh(persona, level, 9);
        while (!auction.isOver(s)) {
          const p = auctionPrompt(s)!;
          for (let seat = 1; seat < BIDDERS; seat++) {
            const { estimates } = auctionLot(s.setup, s.rounds.length);
            const b = auctionBotBid(s, seat, p.lot, estimates[seat]);
            assert.ok(b >= 0 && b <= s.cash[seat] && Number.isInteger(b));
          }
          s = auction.apply(s, 0);
        }
      }
  });

  it('bidding your raw estimate against real competition falls to the winner’s curse', () => {
    let naive = 0;
    for (let seed = 1; seed <= 150; seed++) {
      let s = fresh('investor', 'normal', seed);
      while (!auction.isOver(s)) {
        const p = auctionPrompt(s)!;
        s = auction.apply(s, Math.min(p.cash, p.estimate));
      }
      naive += s.profit[0];
    }
    assert.ok(naive < 0, `naive bidding should lose on average (${naive})`);
  });

  it('difficulty matters: the same careful bidder earns more against Easy rooms than Hard ones', () => {
    const careful = (level: Level) => {
      let total = 0;
      for (let seed = 1; seed <= 150; seed++) {
        let s = fresh('dealmaker', level, seed);
        while (!auction.isOver(s)) {
          const p = auctionPrompt(s)!;
          s = auction.apply(s, Math.min(p.cash, Math.max(0, Math.round(posteriorMean(p.lot, p.estimate) - 0.6 * p.lot.u) - 3)));
        }
        total += s.profit[0];
      }
      return total;
    };
    assert.ok(careful('easy') > careful('normal') && careful('normal') > careful('hard'));
  });

  it('flags the winner’s curse only when an optimistic estimate won a loss-making lot', () => {
    let found = false;
    for (let seed = 1; seed < 80 && !found; seed++) {
      let s = fresh('banker', 'easy', seed);
      while (!auction.isOver(s)) {
        const p = auctionPrompt(s)!;
        s = auction.apply(s, Math.min(p.cash, p.estimate + 5));
      }
      const cursed = s.rounds.some((r) => r.winner === 0 && r.value < r.price && r.estimates[0] > r.value);
      const d = auction.debrief(s);
      if (cursed) {
        found = true;
        assert.match(d.insight, /winner’s curse/);
      } else assert.doesNotMatch(d.insight, /^The winner’s curse/);
    }
    assert.ok(found);
  });
});

// ── Market ──────────────────────────────────────────────────────────────────

describe('market rivals', () => {
  const cond = { customers: 100, cost: 6, beta: 0.35 };

  it('gives equal prices equal shares, and lower prices more share', () => {
    const eq = marketOutcome(cond, [10, 10, 10]);
    assert.equal(eq.units[0], eq.units[1]);
    assert.equal(eq.units[1], eq.units[2]);
    const cut = marketOutcome(cond, [9, 10, 10]);
    assert.ok(cut.shares[0] > eq.shares[0] && cut.shares[1] < eq.shares[1]);
    assert.ok(eq.shares.reduce((a, b) => a + b, 0) < 1, 'some customers buy nothing');
  });

  it('computes revenue, cost and profit consistently', () => {
    const o = marketOutcome(cond, [12, 9, 15]);
    o.units.forEach((u, i) => assert.equal(o.profits[i], u * ([12, 9, 15][i] - 6)));
    assert.ok(o.units.reduce((a, b) => a + b, 0) <= cond.customers + 1);
    assert.ok(marketOutcome(cond, [5, 10, 10]).profits[0] < 0, 'selling below cost loses money');
  });

  it('has the intended tension: high joint prices beat the equilibrium, and undercutting them pays', () => {
    const p = equilibriumPrice(cond);
    assert.ok(p >= 9 && p <= 11, `equilibrium ${p}`);
    const nash = marketOutcome(cond, [p, p, p]).profits[0];
    const joint = marketOutcome(cond, [15, 15, 15]).profits[0];
    const undercut = marketOutcome(cond, [12, 15, 15]).profits[0];
    assert.ok(joint > nash && undercut > joint);
    assert.equal(bestReply(cond, 0, [p, p, p]), p);
  });

  it('validates price bounds', () => {
    const s = market.create(setup('banker', 'normal', 'standard')) as MarketState;
    assert.ok(market.validate(s, PRICE_MIN - 1));
    assert.ok(market.validate(s, PRICE_MAX + 1));
    assert.ok(market.validate(s, 9.5));
    assert.equal(market.validate(s, PRICE_MIN), null);
  });

  it('conditions are public, seeded and independent of difficulty; the variants change them as documented', () => {
    for (let n = 0; n < 12; n++) {
      assert.deepEqual(conditions(setup('banker', 'easy', 'standard', 3), n), conditions(setup('opportunist', 'hard', 'standard', 3), n));
      assert.equal(conditions(setup('banker', 'easy', 'price-war', 3), n).beta, 0.6);
      const v = conditions(setup('banker', 'easy', 'volatile', 3), n).cost;
      assert.ok(v >= 4 && v <= 9);
    }
  });

  it('bots price without seeing the player’s current price, inside the bounds', () => {
    for (const persona of PERSONAS)
      for (const level of LEVELS) {
        let s = market.create(setup(persona, level, 'standard', 4)) as MarketState;
        while (!market.isOver(s)) {
          const a = market.apply(s, 6);
          const b = market.apply(s, 18);
          const n = s.rounds.length;
          assert.deepEqual(a.rounds[n].prices.slice(1), b.rounds[n].prices.slice(1));
          for (const p of a.rounds[n].prices) assert.ok(p >= PRICE_MIN && p <= PRICE_MAX);
          s = n % 2 ? a : b;
        }
      }
  });

  it('accumulates profit across rounds', () => {
    let s = market.create(setup('investor', 'normal', 'standard')) as MarketState;
    while (!market.isOver(s)) s = market.apply(s, 11);
    assert.equal(s.profit[0], s.rounds.reduce((t, r) => t + r.profits[0], 0));
  });

  it('a race to the bottom is never a win', () => {
    for (const persona of PERSONAS)
      for (const level of LEVELS) {
        let s = market.create(setup(persona, level, 'standard', 13)) as MarketState;
        while (!market.isOver(s)) s = market.apply(s, conditions(s.setup, s.rounds.length).cost + 1);
        assert.notEqual(market.result(s).outcome, 'win', `${persona} ${level}`);
        assert.ok(s.profit[0] < marketPar(s));
      }
  });

  it('personalities differ: the Banker keeps a margin floor, the Opportunist undercuts a high-priced rival', () => {
    const s = market.create(setup('banker', 'normal', 'standard', 2)) as MarketState;
    const low = market.apply(s, 4);
    assert.ok(marketBotPrice(low, 1, conditions(s.setup, 1)) >= conditions(s.setup, 1).cost + 4);
    const o = market.create(setup('opportunist', 'normal', 'standard', 2)) as MarketState;
    const high = market.apply(o, 18);
    const c = conditions(o.setup, 1);
    assert.ok(marketBotPrice(high, 1, c) < 18);
  });
});

// ── Hidden signal ───────────────────────────────────────────────────────────

describe('hidden signal', () => {
  it('pays the documented outcomes', () => {
    const base = { tested: false, sender: 'bot' as const };
    assert.deepEqual(payoffs({ ...base, strong: true, signal: 'pitch', invested: true }), [GAIN, FEE]);
    assert.deepEqual(payoffs({ ...base, strong: false, signal: 'pitch', invested: true }), [-LOSS, FEE]);
    assert.deepEqual(payoffs({ ...base, strong: false, signal: 'stake', invested: true }), [-LOSS + STAKE, FEE - STAKE]);
    assert.deepEqual(payoffs({ ...base, strong: false, signal: 'stake', invested: false }), [0, 0]);
    assert.deepEqual(payoffs({ ...base, strong: true, signal: 'warn', invested: false, tested: true }), [-TEST_COST, 0]);
    assert.deepEqual(payoffs({ ...base, sender: 'player', strong: true, signal: 'stake', invested: true }), [FEE, GAIN]);
  });

  it('a stake is credible: staking on a Weak venture costs the sender', () => {
    assert.ok(FEE - STAKE < 0);
  });

  it('the hidden state is fixed by the seed, matches its prior on average, and ignores difficulty', () => {
    let strong = 0;
    let expected = 0;
    for (let seed = 0; seed < 400; seed++)
      for (let n = 0; n < 8; n++) {
        const v = venture(setup('banker', 'easy', 'standard', seed), n);
        assert.deepEqual(v, venture(setup('opportunist', 'hard', 'standard', seed), n));
        strong += Number(v.strong);
        expected += v.prior;
      }
    assert.ok(Math.abs(strong - expected) < 120, `${strong} vs ${expected}`);
  });

  it('the test is as accurate as the rules say', () => {
    let right = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const v = venture(setup('banker', 'easy', 'murky', seed), 0);
      right += Number(v.test === v.strong);
    }
    assert.ok(right > 1300 && right < 1500, `${right}/2000`);
  });

  it('Bayes after a test', () => {
    assert.ok(Math.abs(afterTest(0.5, true, 0.8) - 0.8) < 1e-9);
    assert.ok(Math.abs(afterTest(0.3, false, 0.8) - (0.3 * 0.2) / (0.3 * 0.2 + 0.7 * 0.8)) < 1e-9);
  });

  it('enforces the turn: investigate once, then invest or pass; senders send', () => {
    let s = hiddenSignal.create(setup('investor', 'normal', 'standard')) as SignalState;
    assert.equal(signalPrompt(s)!.role, 'receive');
    assert.ok(hiddenSignal.validate(s, 'stake'));
    s = hiddenSignal.apply(s, 'investigate');
    assert.ok(hiddenSignal.validate(s, 'investigate'));
    const p = signalPrompt(s)!;
    assert.ok(p.role === 'receive' && p.test !== null);
    s = hiddenSignal.apply(s, 'pass');
    assert.equal(s.rounds[0].ps, -TEST_COST);
    assert.equal(signalPrompt(s)!.role, 'send');
    assert.ok(hiddenSignal.validate(s, 'invest'));
  });

  it('the player’s view never includes the hidden state as investor', () => {
    const s = hiddenSignal.create(setup('opportunist', 'hard', 'standard')) as SignalState;
    const p = signalPrompt(s)!;
    assert.equal(p.role, 'receive');
    assert.ok(!('strong' in p));
  });

  it('bot investors decide without the hidden state: same prior, signal and test → same decision', () => {
    for (const persona of PERSONAS)
      for (const level of LEVELS)
        for (const signal of ['warn', 'pitch', 'stake'] as const)
          for (const says of [true, false]) {
            const sp = setup(persona, level, 'standard' as const);
            // signalBotReceive has no access to the state; calling it twice must agree.
            assert.deepEqual(signalBotReceive(sp, [], 0.5, signal, says), signalBotReceive(sp, [], 0.5, signal, says));
          }
  });

  it('bot senders never stake on a Weak venture', () => {
    for (const persona of PERSONAS)
      for (const level of LEVELS)
        for (let seed = 0; seed < 40; seed++) assert.notEqual(signalBotSend(setup(persona, level, 'standard', seed), 8, [], false), 'stake');
  });

  it('only the Opportunist bluffs on Normal, and Hard bluffs more against a credulous player', () => {
    const bluffRate = (persona: Persona, level: Level, history: SignalState['rounds']) => {
      let b = 0;
      for (let seed = 0; seed < 300; seed++) b += Number(signalBotSend(setup(persona, level, 'standard', seed), 12, history, false) === 'pitch');
      return b / 300;
    };
    for (const persona of ['investor', 'banker', 'dealmaker'] as const) assert.equal(bluffRate(persona, 'normal', []), 0, persona);
    assert.ok(bluffRate('opportunist', 'normal', []) > 0.4);
    const pitch = { prior: 0.5, strong: false, sender: 'bot' as const, signal: 'pitch' as const, tested: false, test: null, ps: -LOSS, bs: FEE };
    const credulous = [{ ...pitch, invested: true }, { ...pitch, invested: true }];
    const wary = [{ ...pitch, invested: false, ps: 0, bs: 0 }, { ...pitch, invested: false, ps: 0, bs: 0 }];
    assert.ok(bluffRate('opportunist', 'hard', credulous) > bluffRate('opportunist', 'hard', wary));
    assert.ok(bluffRate('opportunist', 'easy', []) < bluffRate('opportunist', 'normal', []));
  });

  it('bot investors learn: a player who bluffs makes their pitches less believable', () => {
    const honest = Array.from({ length: 3 }, () => ({ prior: 0.5, strong: true, sender: 'player' as const, signal: 'pitch' as const, tested: false, test: null, invested: true, ps: FEE, bs: GAIN }));
    const liar = honest.map((r) => ({ ...r, strong: false }));
    assert.ok(botBelief('dealmaker', honest, 0.5, 'pitch') > botBelief('dealmaker', liar, 0.5, 'pitch'));
  });

  it('Easy takes signals at face value; Hard investigates when the evidence is evenly balanced', () => {
    const sp = (level: Level) => setup('investor', level, 'standard' as const);
    assert.deepEqual(signalBotReceive(sp('easy'), [], 0.5, 'pitch', false), { tested: false, invested: true });
    assert.equal(signalBotReceive(sp('hard'), [], 0.5, 'pitch', false).tested, true);
    assert.equal(signalBotReceive(sp('hard'), [], 0.5, 'pitch', false).invested, false);
  });
});
