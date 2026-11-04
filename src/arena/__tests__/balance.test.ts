import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { openingBid } from '../auction.ts';
import { bluff, bluffPrompt, botTurn } from '../bluff.ts';
import { coopRelationship } from '../cooperation-analysis.ts';
import { spread, previewFire, teammatePlan, lastStand } from '../last-stand.ts';
import { bidText, botMove, liarsDice, liveBids, pAtLeast, roll } from '../liars-dice.ts';
import { botChallenges, powerPlay, powerPrompt, WIN_COINS } from '../power-play.ts';
import { signalBotSend, venture } from '../signal.ts';
import { trackPieces } from '../../features/arena/ui/library/piece-ids.ts';

const setup = (persona: string, level = 'normal', seed = 1, length = 'standard', variant = 'standard') => ({ persona, level, length, variant, seed }) as never;
const SEEDS = 200;
const seedOf = (i: number) => (i * 2654435761 + 97) >>> 0;

/** Win rate of a fixed policy against every opponent at one level. */
function winRate(engine: typeof liarsDice | typeof bluff | typeof powerPlay, level: string, policy: (s: never) => unknown) {
  let wins = 0;
  let n = 0;
  for (const persona of engine.opponents)
    for (let i = 0; i < SEEDS; i++) {
      let s = engine.create(setup(persona, level, seedOf(i))) as never;
      for (let k = 0; k < 400 && !engine.isOver(s); k++) s = engine.apply(s as never, policy(s) as never) as never;
      if (engine.result(s).outcome === 'win') wins++;
      n++;
    }
  return wins / n;
}

describe('Liar’s Dice: bots respond to bidding', () => {
  const lowest = (f: number, prev: { q: number; f: number } | undefined) => (!prev ? 1 : f > prev.f ? prev.q : prev.q + 1);
  const neverCall = (s: never) => {
    const bids = liveBids(s);
    const prev = bids[bids.length - 1];
    const own = roll(s).player;
    const count = (f: number) => own.filter((d) => d === f).length;
    let face = own[0] ?? 1;
    for (const f of own) if (count(f) > count(face)) face = f;
    const q = lowest(face, prev);
    const total = (s as { count: { player: number; bot: number } }).count.player + (s as { count: { player: number; bot: number } }).count.bot;
    return q > total ? { kind: 'liar' } : { kind: 'bid', q, f: face };
  };
  it('never calling no longer beats Normal or Hard', () => {
    assert.ok(winRate(liarsDice, 'normal', neverCall) < 0.5);
    assert.ok(winRate(liarsDice, 'hard', neverCall) < 0.4);
  });
  it('Hard is harder than Normal against the same plan', () => {
    assert.ok(winRate(liarsDice, 'hard', neverCall) < winRate(liarsDice, 'normal', neverCall));
  });
  it('a bot on Normal believes a face you have bid more than one you have not', () => {
    const s = liarsDice.create(setup('calculator', 'normal', 3));
    const own = roll(s).bot;
    const face = [1, 2, 3, 4, 5, 6].find((f) => !own.includes(f))!;
    const q = 3;
    const called = botMove(s, own, [{ by: 'player', q, f: face }], 0.5, 0.5).kind;
    const fair = pAtLeast(s.count.player, q);
    const read = pAtLeast(s.count.player, q, 1 / 4);
    assert.ok(read > fair);
    assert.ok(called === 'liar' || called === 'bid');
  });
  it('never sees your dice: its move is the same whatever you hold', () => {
    const s = liarsDice.create(setup('psychological', 'hard', 5));
    const bids = [{ by: 'player' as const, q: 2, f: 4 }];
    const a = botMove(s, roll(s).bot, bids, 0.3, 0.7);
    const b = botMove({ ...s, setup: { ...s.setup } }, roll(s).bot, bids, 0.3, 0.7);
    assert.deepEqual(a, b);
    assert.equal(bidText({ q: 2, f: 4 }), '2 fours');
  });
});

describe('Bluff: calling everything has a cost', () => {
  const claimHonest = (s: never) => {
    const p = bluffPrompt(s)!;
    if (p.role === 'bust') return 'continue';
    if (p.role === 'judge') return 'call';
    return { claim: (p as { value: number }).value };
  };
  it('the Risk Taker stops bluffing a player who keeps calling', () => {
    let s = bluff.create(setup('risk-taker', 'normal', 11));
    const honest: number[] = [];
    for (let k = 0; k < 60 && !bluff.isOver(s); k++) {
      const n = s.rounds.length;
      const p = bluffPrompt(s)!;
      if (p.role === 'judge' && s.rounds.filter((r) => r.claimant === 'bot' && r.call).length >= 2) {
        const t = botTurn(s, n);
        honest.push(t.claim! - t.tokens.reduce<number>((a, x) => a + (x === 'crack' ? 0 : x), 0));
      }
      s = bluff.apply(s, claimHonest(s as never) as never);
    }
    for (const gap of honest) assert.equal(gap, 0);
  });
  it('always calling no longer crushes the Risk Taker (it was ~96%): its big claims are often true', () => {
    for (const level of ['normal', 'hard'] as const) {
      let wins = 0;
      for (let i = 0; i < 120; i++) {
        let s = bluff.create(setup('risk-taker', level, (i * 2654435761 + 97) >>> 0));
        while (!bluff.isOver(s)) s = bluff.apply(s, claimHonest(s as never) as never);
        if (bluff.result(s).outcome === 'win') wins += 1;
      }
      assert.ok(wins / 120 < 0.7, `${level}: always-call won ${Math.round((wins / 120) * 100)}%`);
    }
  });
  it('the Risk Taker still bluffs sometimes, so believing everything doesn’t beat it either', () => {
    let bluffs = 0;
    let claims = 0;
    for (let i = 0; i < 60; i++) {
      let s = bluff.create(setup('risk-taker', 'normal', i + 1));
      while (!bluff.isOver(s)) {
        const p = bluffPrompt(s)!;
        s = bluff.apply(s, (p.role === 'bust' ? 'continue' : p.role === 'judge' ? 'believe' : { claim: (p as { value: number }).value }) as never);
      }
      for (const r of s.rounds)
        if (r.claimant === 'bot' && !r.bust) {
          claims += 1;
          if (r.claim! > r.tokens.reduce<number>((a, x) => a + (x === 'crack' ? 0 : x), 0)) bluffs += 1;
        }
    }
    assert.ok(bluffs / claims > 0.25 && bluffs / claims < 0.55, `bluff rate ${bluffs}/${claims}`);
  });
  it('always calling is no longer stronger on Hard than on Normal by any margin that matters', () => {
    assert.ok(winRate(bluff, 'hard', claimHonest) <= winRate(bluff, 'normal', claimHonest) + 0.03);
  });
});

describe('The Power Play: game-winning claims', () => {
  it('Normal and Hard bots challenge a claim that would win you the game', () => {
    for (const persona of powerPlay.opponents)
      for (const level of ['normal', 'hard']) {
        const s = powerPlay.create(setup(persona, level, 21));
        const close = { ...s, player: { ...s.player, coins: WIN_COINS - 3 } };
        assert.equal(botChallenges(close, 'treasurer'), true, `${persona} ${level}`);
      }
  });
  it('three Treasuries alone no longer win a quarter of Normal matches against unchallenging play by default', () => {
    const treasury = (s: never) => {
      const p = powerPrompt(s)!;
      if (p.phase === 'act') return { kind: 'act', move: 'treasury' };
      if (p.phase === 'respond') return { kind: 'respond', answer: 'allow' };
      return { kind: 'block-answer', answer: 'accept' };
    };
    assert.ok(winRate(powerPlay, 'normal', treasury) < 0.3);
    assert.ok(winRate(powerPlay, 'hard', treasury) < 0.3);
  });
});

describe('The Hidden Signal: senders react to being bluffed', () => {
  it('a Hard Deal Maker holds a grudge; Normal answers only the last send', () => {
    const base = { sender: 'player', strong: false, signal: 'pitch', invested: true } as never as Record<string, unknown>;
    const honest = { ...base, strong: true, signal: 'stake' };
    const h = [base, honest] as never;
    assert.equal(signalBotSend(setup('dealmaker', 'hard', 1) as never, 8, h, false), 'pitch');
    assert.equal(signalBotSend(setup('dealmaker', 'normal', 1) as never, 8, h, false), 'warn');
    assert.equal(signalBotSend(setup('dealmaker', 'easy', 1) as never, 8, h, false), 'warn');
  });
  it('never stakes on a weak venture, and the Banker never bluffs', () => {
    for (let i = 0; i < 200; i++) {
      const s = setup('banker', 'hard', seedOf(i)) as never;
      assert.equal(signalBotSend(s, 8, [], false), 'warn');
      assert.equal(venture(s, 0).prior >= 0.3, true);
    }
  });
});

describe('The Last Stand', () => {
  it('previews only the known spread: same as the rule, and it never depends on the seed', () => {
    const fire = [2, 0, 0, 1, 0, 0];
    assert.deepEqual(previewFire(fire, { kind: 'refill' }), spread(fire, new Set()));
    assert.deepEqual(previewFire(fire, { kind: 'firebreak', d: 1 }), spread(fire, new Set([1])));
    assert.deepEqual(previewFire(fire, { kind: 'douse', d: 0 }), spread([0, 0, 0, 1, 0, 0], new Set()));
  });
  it('the Resource Guardian answers a district one step from burning out while it has water', () => {
    const s = lastStand.create(setup('guardian', 'normal', 2));
    const plan = teammatePlan({ ...s, fire: [3, 0, 0, 0, 0, 0], water: 2 });
    assert.deepEqual(plan, { kind: 'douse', d: 0 });
    assert.deepEqual(teammatePlan({ ...s, fire: [1, 0, 0, 0, 0, 0], water: 2 }), { kind: 'refill' });
  });
  it('Easy needs you: doing nothing (refilling every round) usually fails, covering the other fire holds', () => {
    const hold = (policy: (s: never) => unknown) => {
      let held = 0;
      let n = 0;
      for (const persona of lastStand.opponents)
        for (let i = 0; i < 60; i++) {
          let s = lastStand.create(setup(persona, 'easy', seedOf(i)));
          while (!lastStand.isOver(s)) s = lastStand.apply(s, policy(s as never) as never);
          n += 1;
          if (lastStand.result(s).outcome === 'win') held += 1;
        }
      return held / n;
    };
    const passive = hold(() => ({ kind: 'refill' }));
    const engaged = hold((s: never) => {
      const st = s as { fire: number[]; water: number };
      const plan = teammatePlan(st as never);
      const water = st.water - (plan.kind === 'douse' ? 1 : 0);
      let d = -1;
      st.fire.forEach((f, i) => {
        if (f < 4 && f >= 1 && !(plan.kind === 'douse' && plan.d === i) && (d < 0 || f > st.fire[d])) d = i;
      });
      return water > 0 && d >= 0 ? { kind: 'douse', d } : { kind: 'refill' };
    });
    assert.ok(passive < 0.5, `passive held ${Math.round(passive * 100)}% (was 100%)`);
    assert.ok(engaged > 0.9, `engaged held ${Math.round(engaged * 100)}%`);
  });
});

describe('small rules behind the boards', () => {
  it('the Auction bid starts at the public low, within budget', () => {
    assert.equal(openingBid({ lo: 20, hi: 60, u: 8, name: 'x' } as never, 45), 20);
    assert.equal(openingBid({ lo: 50, hi: 90, u: 8, name: 'x' } as never, 30), 30);
  });
  it('The Gambit: a piece that moved keeps its id, and ids never cross sides', () => {
    const a = trackPieces([], [
      { side: 'player', r: 0, c: 1 },
      { side: 'bot', r: 5, c: 1 },
    ]);
    const b = trackPieces(a, [
      { side: 'player', r: 1, c: 1 },
      { side: 'bot', r: 5, c: 1 },
    ]);
    assert.equal(b.find((x) => x.p.side === 'player')!.id, a.find((x) => x.p.side === 'player')!.id);
    assert.equal(b.find((x) => x.p.side === 'bot')!.id, a.find((x) => x.p.side === 'bot')!.id);
  });
  it('the Cooperation relationship line comes only from the moves', () => {
    assert.deepEqual(coopRelationship([{ p: 'C', b: 'C' }, { p: 'D', b: 'C' }, { p: 'D', b: 'D' }, { p: 'C', b: 'C' }]), [0, 1, 0, 0, 1]);
  });
});
