/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DIFFICULTIES, type Difficulty, type MatchSpec, draw } from '../core.ts';
import { ENGINES } from '../registry.ts';
import { RPS_BOTS, RPS_MOVES, type RpsBot, type RpsMove, type RpsRound, beats, rps, rpsBotMove, rpsResult } from '../rps.ts';
import { type SplitBot, type SplitMove, type SplitRound, splitBotMove, splitPayoffs, splitSteal } from '../split-steal.ts';
import { type StagBot, type StagMove, type StagRound, stagBotMove, stagHunt, stagPayoffs } from '../stag-hunt.ts';
import {
  TT_PLAYERS,
  TWO_THIRDS_BOTS,
  type TwoThirdsBot,
  type TwoThirdsRound,
  botPick,
  lineup,
  playerPoints,
  roundStats,
  scaledDistance,
  twoThirds,
  winners,
} from '../two-thirds.ts';
import { ULTIMATUM_BOTS, type UltimatumBot, type UltimatumRound, botAccepts, botOffer, ultimatum } from '../ultimatum.ts';

const spec = <B extends string>(bot: B, difficulty: Difficulty = 'medium', seed = 42): MatchSpec<B> => ({ bot, difficulty, seed });

/** Play a whole match with a scripted player. */
function play<B extends string, M, R, P>(engine: { prompt: (s: MatchSpec<B>, h: R[]) => P; resolve: (s: MatchSpec<B>, h: R[], m: M) => R; rounds: number }, s: MatchSpec<B>, move: (h: R[], p: P) => M): R[] {
  const h: R[] = [];
  for (let i = 0; i < engine.rounds; i++) h.push(engine.resolve(s, h, move(h, engine.prompt(s, h))));
  return h;
}

describe('draw (counter-based randomness)', () => {
  it('is deterministic and in [0, 1)', () => {
    for (let s = 0; s < 50; s++) {
      for (let r = 0; r < 12; r++) {
        const u = draw(s * 7919, r, 3);
        assert.equal(u, draw(s * 7919, r, 3));
        assert.ok(u >= 0 && u < 1);
      }
    }
  });

  it('changes with seed, round and index', () => {
    const base = draw(1, 2, 3);
    assert.notEqual(base, draw(2, 2, 3));
    assert.notEqual(base, draw(1, 3, 3));
    assert.notEqual(base, draw(1, 2, 4));
  });

  it('is roughly uniform', () => {
    const buckets = [0, 0, 0, 0];
    for (let s = 0; s < 4000; s++) buckets[Math.floor(draw(s, 0, 0) * 4)] += 1;
    for (const b of buckets) assert.ok(b > 850 && b < 1150, `bucket ${b}`);
  });
});

describe('every engine', () => {
  for (const [id, engine] of Object.entries(ENGINES)) {
    it(`${id}: has 4 bots, rule version 1, and refuses a round after the match ends`, () => {
      assert.equal(engine.bots.length, 4);
      assert.equal(engine.rulesVersion, 1);
      for (const bot of engine.bots) {
        for (const difficulty of DIFFICULTIES) {
          const s = spec(bot, difficulty, 7);
          const h = play(engine, s, (_h, p) => firstLegalMove(id, p));
          assert.equal(h.length, engine.rounds);
          assert.throws(() => engine.resolve(s, h, firstLegalMove(id, engine.prompt(s, h))));
          // Same seed and same moves: the same match.
          assert.deepEqual(play(engine, s, (_h, p) => firstLegalMove(id, p)), h);
        }
      }
    });

    it(`${id}: a bot never sees the current move (same bot action whatever the player plays)`, () => {
      for (const bot of engine.bots) {
        for (const difficulty of DIFFICULTIES) {
          for (let seed = 1; seed <= 30; seed++) {
            const s = spec(bot, difficulty, seed * 1013);
            const h = play(engine, s, (hh, p) => legalMoves(id, p)[(seed + hh.length) % legalMoves(id, p).length]).slice(0, seed % engine.rounds);
            const prompt = engine.prompt(s, h);
            const actions = legalMoves(id, prompt).map((m) => botAction(id, engine.resolve(s, h, m)));
            // In the Ultimatum Game the responder legitimately sees the offer; the bot's *offer* must not depend on the reply.
            if (id === 'ultimatum' && (prompt as { role: string }).role === 'propose') continue;
            assert.ok(actions.every((a) => JSON.stringify(a) === JSON.stringify(actions[0])), `${id}/${bot}/${difficulty}`);
          }
        }
      }
    });
  }
});

function legalMoves(id: string, prompt: unknown): unknown[] {
  switch (id) {
    case 'rps':
      return [...RPS_MOVES];
    case 'two-thirds':
      return [0, 1, 22, 33, 50, 67, 100];
    case 'split-steal':
      return ['split', 'steal'];
    case 'stag-hunt':
      return ['stag', 'hare'];
    default:
      return (prompt as { role: string }).role === 'propose' ? [1, 3, 5, 7, 9] : ['accept', 'reject'];
  }
}
const firstLegalMove = (id: string, prompt: unknown) => legalMoves(id, prompt)[0];

function botAction(id: string, r: unknown): unknown {
  const x = r as Record<string, unknown>;
  if (id === 'two-thirds') return x.bots;
  if (id === 'ultimatum') return x.proposer === 'bot' ? x.offer : null;
  return x.b;
}

// ── Rock, Paper, Scissors ────────────────────────────────────────────────────

describe('Rock, Paper, Scissors', () => {
  it('scores all nine combinations', () => {
    const expected: Record<string, number> = {
      'rock/rock': 0, 'rock/paper': -1, 'rock/scissors': 1,
      'paper/rock': 1, 'paper/paper': 0, 'paper/scissors': -1,
      'scissors/rock': -1, 'scissors/paper': 1, 'scissors/scissors': 0,
    };
    for (const p of RPS_MOVES) for (const b of RPS_MOVES) assert.equal(rpsResult(p, b), expected[`${p}/${b}`], `${p}/${b}`);
    assert.equal(beats('rock'), 'paper');
    assert.equal(beats('paper'), 'scissors');
    assert.equal(beats('scissors'), 'rock');
  });

  it('adds 3 for a win, 1 for a tie, 0 for a loss, for both sides', () => {
    const h: RpsRound[] = [
      { p: 'rock', b: 'scissors', r: 1 },
      { p: 'rock', b: 'rock', r: 0 },
      { p: 'rock', b: 'paper', r: -1 },
    ];
    assert.deepEqual(rps.totals(h), { player: 4, bot: 4 });
    assert.equal(rps.outcome(h), 'draw');
    assert.equal(rps.outcome(h.slice(0, 1)), 'win');
  });

  it('validates moves', () => {
    assert.equal(rps.parseMove('rock', null), 'rock');
    assert.equal(rps.parseMove('lizard', null), null);
    assert.equal(rps.parseMove(1, null), null);
  });

  it('Repeater (easy) repeats itself; win-stay lose-shift on medium; hard counters a double loss', () => {
    // With noise off for this check: find a seed whose round-1 draw is above the noise level.
    const quiet = (difficulty: Difficulty, round: number) => {
      for (let seed = 1; ; seed++) if (draw(seed, round, 0) >= 0.2) return spec<RpsBot>('repeater', difficulty, seed);
    };
    assert.equal(rpsBotMove(quiet('easy', 0), []), 'rock');
    assert.equal(rpsBotMove(quiet('easy', 1), [{ p: 'paper', b: 'scissors', r: -1 }]), 'scissors');
    // Medium: lost to paper → plays what beats paper.
    assert.equal(rpsBotMove(quiet('medium', 1), [{ p: 'paper', b: 'rock', r: 1 }]), 'scissors');
    assert.equal(rpsBotMove(quiet('medium', 1), [{ p: 'scissors', b: 'rock', r: -1 }]), 'rock');
    const twoLosses: RpsRound[] = [
      { p: 'paper', b: 'rock', r: 1 },
      { p: 'rock', b: 'scissors', r: 1 },
    ];
    assert.equal(rpsBotMove(quiet('hard', 2), twoLosses), 'rock');
    assert.equal(rpsBotMove(quiet('medium', 2), twoLosses), 'paper');
  });

  it('Counter and Mind Reader exploit a player who always throws rock (hard)', () => {
    for (const bot of ['counter', 'mind-reader'] as const) {
      const h = play(rps, spec<RpsBot>(bot, 'hard', 99), () => 'rock' as RpsMove);
      const late = h.slice(4);
      assert.ok(late.filter((r) => r.b === 'paper').length >= late.length - 2, bot);
      assert.equal(rps.outcome(h), 'loss');
    }
  });

  it('Mind Reader (hard) learns a rock → paper → scissors cycle', () => {
    const cycle: RpsMove[] = ['rock', 'paper', 'scissors'];
    const h = play(rps, spec<RpsBot>('mind-reader', 'hard', 5), (hh) => cycle[hh.length % 3]);
    assert.ok(h.slice(4).filter((r) => r.r === -1).length >= 6);
  });

  it('a predictor that only sees history is beaten by a player who counters its prediction', () => {
    // Against the Counter (medium), throwing what beats "what beats my most frequent throw" wins — it never peeks.
    const h = play(rps, spec<RpsBot>('counter', 'medium', 3), (hh) => {
      if (hh.length < 2) return 'rock';
      const counts = [0, 0, 0];
      hh.slice(-6).forEach((r) => (counts[RPS_MOVES.indexOf(r.p)] += 1));
      const fav = RPS_MOVES[counts.indexOf(Math.max(...counts))];
      return beats(beats(fav));
    });
    assert.equal(rps.outcome(h), 'win');
  });

  it('Randomizer plays each move about equally on every difficulty, and hard is uniform', () => {
    for (const difficulty of DIFFICULTIES) {
      const counts = { rock: 0, paper: 0, scissors: 0 };
      for (let seed = 0; seed < 300; seed++) {
        const h = play(rps, spec<RpsBot>('randomizer', difficulty, seed * 31 + 1), () => 'rock' as RpsMove);
        for (const r of h) counts[r.b] += 1;
      }
      for (const c of Object.values(counts)) assert.ok(c > 1050 && c < 1350, `${difficulty}: ${JSON.stringify(counts)}`);
    }
  });

  it('Randomizer (medium) never throws the same move three times in a row', () => {
    for (let seed = 0; seed < 200; seed++) {
      const h = play(rps, spec<RpsBot>('randomizer', 'medium', seed), () => 'paper' as RpsMove);
      for (let i = 2; i < h.length; i++) assert.ok(!(h[i].b === h[i - 1].b && h[i].b === h[i - 2].b));
    }
  });

  it('no difficulty guarantees the bot a win', () => {
    for (const bot of RPS_BOTS) {
      for (const difficulty of DIFFICULTIES) {
        let playerWins = 0;
        for (let seed = 0; seed < 60 && playerWins === 0; seed++) {
          const s = spec(bot, difficulty, seed);
          // A player who throws at random (independently of the bot's seed).
          const h = play(rps, s, (hh) => RPS_MOVES[Math.floor(draw(seed + 777, hh.length, 9) * 3)]);
          if (rps.outcome(h) === 'win') playerWins += 1;
        }
        assert.ok(playerWins > 0, `${bot}/${difficulty}`);
      }
    }
  });
});

// ── Two-Thirds ───────────────────────────────────────────────────────────────

describe('Two-Thirds Guess', () => {
  const round = (p: number, bots: number[]) => ({ p, bots });

  it('computes the average and ⅔ target over all nine picks', () => {
    const r = round(30, [10, 20, 30, 40, 50, 60, 70, 80]);
    const s = roundStats(r);
    assert.equal(s.sum, 390);
    assert.equal(s.average, 390 / 9);
    assert.ok(Math.abs(s.target - 28.888888) < 1e-5);
    assert.equal(scaledDistance(30, 390), Math.abs(27 * 30 - 780));
  });

  it('decides the winner exactly and shares ties', () => {
    // All identical: everyone is equally close, the win is shared.
    const same = round(50, Array(8).fill(50));
    assert.deepEqual(winners(same), { player: true, count: 9, best: Math.abs(27 * 50 - 2 * 450) });
    assert.equal(playerPoints(same), 5 + Math.max(0, 10 - Math.floor(Math.abs(27 * 50 - 900) / 27)));
    // A sole winner: target is ⅔ of 36 = 24; the player's 24 is exact.
    const sole = round(24, [0, 0, 100, 100, 10, 30, 30, 30]);
    assert.equal(roundStats(sole).sum, 324);
    assert.equal(winners(sole).player, true);
    assert.equal(winners(sole).count, 1);
    assert.equal(playerPoints(sole), 20);
  });

  it('handles the boundary picks 0 and 100', () => {
    const zeros = round(0, Array(8).fill(0));
    assert.equal(roundStats(zeros).target, 0);
    assert.equal(playerPoints(zeros), 5 + 10);
    const hundreds = round(100, Array(8).fill(100));
    assert.ok(Math.abs(roundStats(hundreds).target - 66.6667) < 1e-3);
    assert.equal(winners(hundreds).count, 9);
    assert.equal(playerPoints(hundreds), 5 + 0);
  });

  it('only accepts whole numbers 0–100', () => {
    for (const ok of [0, 1, 50, 100]) assert.equal(twoThirds.parseMove(ok, null), ok);
    for (const bad of [-1, 101, 33.3, NaN, '33', null]) assert.equal(twoThirds.parseMove(bad, null), null);
  });

  it('builds the group from 5 of the chosen crowd type and one of each other', () => {
    assert.deepEqual(lineup('deep'), ['deep', 'deep', 'deep', 'deep', 'deep', 'crowd-follower', 'shallow', 'chaos']);
    assert.equal(lineup('chaos').length, TT_PLAYERS - 1);
  });

  it('bots pick whole numbers in range, deterministically', () => {
    for (const crowd of TWO_THIRDS_BOTS) {
      for (const difficulty of DIFFICULTIES) {
        const s = spec<TwoThirdsBot>(crowd, difficulty, 11);
        const h = play(twoThirds, s, (hh) => [100, 0, 50, 33, 22][hh.length]);
        for (const r of h) for (const b of r.bots) assert.ok(Number.isInteger(b) && b >= 0 && b <= 100);
        assert.deepEqual(play(twoThirds, s, (hh) => [100, 0, 50, 33, 22][hh.length]), h);
      }
    }
  });

  it('deeper reasoning picks lower in the first round', () => {
    const avg = (t: TwoThirdsBot, d: Difficulty) => {
      let s = 0;
      for (let seed = 0; seed < 200; seed++) s += botPick(t, spec<TwoThirdsBot>(t, d, seed), [], 0);
      return s / 200;
    };
    assert.ok(avg('crowd-follower', 'easy') > avg('shallow', 'easy'));
    assert.ok(avg('shallow', 'easy') > avg('deep', 'easy'));
    assert.ok(avg('deep', 'easy') > avg('deep', 'hard'));
    assert.ok(Math.abs(avg('shallow', 'medium') - 33) < 1.5);
    assert.ok(Math.abs(avg('deep', 'easy') - 22) < 1.5);
  });

  it('bots adapt to what the group did last round', () => {
    const s = spec<TwoThirdsBot>('shallow', 'hard', 1);
    const prev: TwoThirdsRound = { p: 0, bots: Array(8).fill(0), ps: 15, botWon: false };
    assert.ok(botPick('shallow', s, [prev], 0) <= 2);
    assert.ok(botPick('crowd-follower', { ...s, difficulty: 'easy' }, [prev], 0) <= 10);
  });

  it('Chaos Agents stay in their ranges', () => {
    for (let seed = 0; seed < 300; seed++) {
      assert.ok(botPick('chaos', spec<TwoThirdsBot>('chaos', 'medium', seed), [], 0) <= 66);
      assert.ok(botPick('chaos', spec<TwoThirdsBot>('chaos', 'hard', seed), [], 0) <= 80);
    }
  });

  it('match totals and outcome come from rounds won', () => {
    const s = spec<TwoThirdsBot>('deep', 'medium', 3);
    const h = play(twoThirds, s, () => 100);
    assert.ok(h.every((r) => r.botWon));
    assert.equal(twoThirds.outcome(h), 'loss');
    assert.equal(twoThirds.totals(h).bot, 5);
    assert.equal(twoThirds.totals(h).player, h.reduce((x, r) => x + r.ps, 0));
  });
});

// ── Split or Steal ───────────────────────────────────────────────────────────

describe('Split or Steal', () => {
  it('pays every cell of the matrix', () => {
    assert.deepEqual(splitPayoffs('split', 'split'), [5, 5]);
    assert.deepEqual(splitPayoffs('steal', 'split'), [8, 0]);
    assert.deepEqual(splitPayoffs('split', 'steal'), [0, 8]);
    assert.deepEqual(splitPayoffs('steal', 'steal'), [1, 1]);
  });

  it('is a prisoner’s dilemma: stealing pays more in one round, mutual stealing is worse than mutual splitting', () => {
    for (const b of ['split', 'steal'] as SplitMove[]) assert.ok(splitPayoffs('steal', b)[0] > splitPayoffs('split', b)[0]);
    assert.ok(splitPayoffs('steal', 'steal')[0] < splitPayoffs('split', 'split')[0]);
  });

  it('accumulates over 10 rounds', () => {
    const h = play(splitSteal, spec<SplitBot>('cooperator', 'easy'), () => 'split' as SplitMove);
    assert.deepEqual(splitSteal.totals(h), { player: 50, bot: 50 });
    assert.equal(splitSteal.outcome(h), 'draw');
    const greedy = play(splitSteal, spec<SplitBot>('cooperator', 'easy'), () => 'steal' as SplitMove);
    assert.deepEqual(splitSteal.totals(greedy), { player: 80, bot: 0 });
  });

  it('Retaliator: tit-for-tat (easy), two-for-one (medium), grim (hard)', () => {
    const mk = (moves: SplitMove[], bot: SplitMove[] = moves.map(() => 'split')): SplitRound[] =>
      moves.map((p, i) => ({ p, b: bot[i], ...Object.fromEntries([['ps', 0], ['bs', 0]]) }) as SplitRound);
    const once = mk(['split', 'steal']);
    assert.equal(splitBotMove(spec<SplitBot>('retaliator', 'easy'), once), 'steal');
    assert.equal(splitBotMove(spec<SplitBot>('retaliator', 'easy'), mk(['split', 'steal', 'split'])), 'split');
    assert.equal(splitBotMove(spec<SplitBot>('retaliator', 'medium'), mk(['split', 'steal', 'split'])), 'steal');
    assert.equal(splitBotMove(spec<SplitBot>('retaliator', 'medium'), mk(['split', 'steal', 'split', 'split'])), 'split');
    assert.equal(splitBotMove(spec<SplitBot>('retaliator', 'hard'), mk(['steal', 'split', 'split', 'split', 'split'])), 'steal');
    assert.equal(splitBotMove(spec<SplitBot>('retaliator', 'hard'), []), 'split');
  });

  it('memory resets with each match (a new, empty history)', () => {
    const s = spec<SplitBot>('retaliator', 'hard');
    const first = play(splitSteal, s, () => 'steal' as SplitMove);
    assert.equal(first[first.length - 1].b, 'steal');
    // Rematch: the grim bot starts by splitting again.
    assert.equal(splitSteal.resolve(s, [], 'split').b, 'split');
  });

  it('Opportunist exploits unconditional splitting, Strategist punishes frequent stealing', () => {
    const h = play(splitSteal, spec<SplitBot>('opportunist', 'medium'), () => 'split' as SplitMove);
    assert.ok(h.filter((r) => r.b === 'steal').length >= 4);
    const hard = play(splitSteal, spec<SplitBot>('opportunist', 'hard'), () => 'split' as SplitMove);
    assert.equal(hard[8].b, 'steal');
    assert.equal(hard[9].b, 'steal');
    const st = play(splitSteal, spec<SplitBot>('strategist', 'hard'), (hh) => (hh.length % 2 ? 'steal' : 'split'));
    assert.ok(st.slice(3).filter((r) => r.b === 'steal').length >= 5);
  });

  it('Cooperator (hard) forgives some steals', () => {
    let forgiven = 0;
    for (let seed = 0; seed < 300; seed++) {
      const s = spec<SplitBot>('cooperator', 'hard', seed);
      if (splitBotMove(s, [{ p: 'steal', b: 'split', ps: 8, bs: 0 }]) === 'split') forgiven += 1;
    }
    assert.ok(forgiven > 70 && forgiven < 130, String(forgiven));
  });

  it('no personality dominates: the best reply depends on the opponent', () => {
    const vs = (bot: SplitBot, m: SplitMove) => splitSteal.totals(play(splitSteal, spec(bot, 'hard'), () => m)).player;
    // Always stealing beats always splitting against the Cooperator on easy, but not against the grim Retaliator.
    assert.ok(splitSteal.totals(play(splitSteal, spec<SplitBot>('cooperator', 'easy'), () => 'steal' as SplitMove)).player > 50);
    assert.ok(vs('retaliator', 'split') > vs('retaliator', 'steal'));
  });
});

// ── Ultimatum ────────────────────────────────────────────────────────────────

describe('Ultimatum', () => {
  it('alternates roles: the player proposes in rounds 1, 3, 5', () => {
    const s = spec<UltimatumBot>('fair', 'medium');
    const h: UltimatumRound[] = [];
    for (let i = 0; i < 6; i++) {
      const p = ultimatum.prompt(s, h);
      assert.equal(p.role, i % 2 === 0 ? 'propose' : 'respond');
      h.push(ultimatum.resolve(s, h, p.role === 'propose' ? 5 : 'accept'));
    }
    assert.deepEqual(h.map((r) => r.proposer), ['player', 'bot', 'player', 'bot', 'player', 'bot']);
    assert.deepEqual(ultimatum.totals(h), { player: 30, bot: 30 });
  });

  it('validates offers: whole numbers 1–9, accept or reject when responding', () => {
    const propose = { role: 'propose' as const };
    for (const ok of [1, 5, 9]) assert.equal(ultimatum.parseMove(ok, propose), ok);
    for (const bad of [0, 10, 4.5, -1, 'accept']) assert.equal(ultimatum.parseMove(bad, propose), null);
    const respond = { role: 'respond' as const, offer: 3 };
    assert.equal(ultimatum.parseMove('accept', respond), 'accept');
    assert.equal(ultimatum.parseMove(5, respond), null);
    assert.throws(() => ultimatum.resolve(spec<UltimatumBot>('fair'), [], 0 as never));
  });

  it('accepted offers split the 10 coins; rejection gives both nothing', () => {
    const s = spec<UltimatumBot>('hardliner', 'medium');
    const low = ultimatum.resolve(s, [], 2);
    assert.deepEqual(low, { proposer: 'player', offer: 2, accepted: false, ps: 0, bs: 0 });
    const fair = ultimatum.resolve(s, [], 5);
    assert.deepEqual(fair, { proposer: 'player', offer: 5, accepted: true, ps: 5, bs: 5 });
    const botTurn = ultimatum.resolve(s, [fair], 'accept');
    assert.deepEqual(botTurn, { proposer: 'bot', offer: 4, accepted: true, ps: 4, bs: 6 });
    assert.deepEqual(ultimatum.resolve(s, [fair], 'reject'), { proposer: 'bot', offer: 4, accepted: false, ps: 0, bs: 0 });
  });

  it('the Maximizer accepts any offer; the Hardliner pays to punish low offers', () => {
    for (const d of DIFFICULTIES) {
      assert.equal(botAccepts(spec<UltimatumBot>('maximizer', d), [], 1), true);
      assert.equal(botAccepts(spec<UltimatumBot>('hardliner', d), [], 3), false);
    }
    assert.equal(botAccepts(spec<UltimatumBot>('fair', 'easy'), [], 3), true);
    assert.equal(botAccepts(spec<UltimatumBot>('fair', 'medium'), [], 3), false);
    const insult: UltimatumRound = { proposer: 'player', offer: 2, accepted: false, ps: 0, bs: 0 };
    assert.equal(botAccepts(spec<UltimatumBot>('hardliner', 'hard'), [insult], 5), false);
    assert.equal(botAccepts(spec<UltimatumBot>('hardliner', 'hard'), [insult], 6), true);
    assert.equal(botAccepts(spec<UltimatumBot>('hardliner', 'medium'), [insult], 5), true);
  });

  it('the Maximizer offers little and probes; the Fair Player offers half', () => {
    for (let seed = 0; seed < 50; seed++) {
      const o = botOffer(spec<UltimatumBot>('maximizer', 'easy', seed), []);
      assert.ok(o >= 1 && o <= 3);
    }
    const s = spec<UltimatumBot>('maximizer', 'hard');
    const rejected: UltimatumRound = { proposer: 'bot', offer: 2, accepted: false, ps: 0, bs: 0 };
    assert.equal(botOffer(s, [rejected]), 3);
    const accepted: UltimatumRound = { proposer: 'bot', offer: 3, accepted: true, ps: 3, bs: 7 };
    assert.equal(botOffer(s, [rejected, accepted]), 2);
    assert.equal(botOffer(spec<UltimatumBot>('fair', 'medium'), []), 5);
    assert.equal(botOffer(spec<UltimatumBot>('fair', 'hard'), [{ proposer: 'player', offer: 2, accepted: false, ps: 0, bs: 0 }]), 4);
  });

  it('the Negotiator adapts its offer and its demand to responses', () => {
    const s = spec<UltimatumBot>('negotiator', 'medium');
    assert.equal(botOffer(s, []), 4);
    assert.equal(botOffer(s, [{ proposer: 'bot', offer: 4, accepted: false, ps: 0, bs: 0 }]), 5);
    assert.equal(botOffer(s, [{ proposer: 'bot', offer: 4, accepted: true, ps: 4, bs: 6 }]), 3);
    // Threshold starts at 4; after accepting, it asks 5.
    assert.equal(botAccepts(s, [], 4), true);
    assert.equal(botAccepts(s, [{ proposer: 'player', offer: 4, accepted: true, ps: 6, bs: 4 }], 4), false);
    assert.equal(botAccepts(s, [{ proposer: 'player', offer: 2, accepted: false, ps: 0, bs: 0 }], 3), true);
  });

  it('every personality’s policy is distinct', () => {
    const fingerprint = (bot: UltimatumBot) =>
      JSON.stringify(DIFFICULTIES.map((d) => [botOffer(spec(bot, d, 1), []), [1, 2, 3, 4, 5, 6].map((o) => botAccepts(spec(bot, d), [], o))]));
    const prints = ULTIMATUM_BOTS.map(fingerprint);
    assert.equal(new Set(prints).size, prints.length);
  });
});

// ── Stag Hunt ────────────────────────────────────────────────────────────────

describe('Stag Hunt', () => {
  it('pays every combination', () => {
    assert.deepEqual(stagPayoffs('stag', 'stag'), [5, 5]);
    assert.deepEqual(stagPayoffs('stag', 'hare'), [0, 3]);
    assert.deepEqual(stagPayoffs('hare', 'stag'), [3, 0]);
    assert.deepEqual(stagPayoffs('hare', 'hare'), [3, 3]);
  });

  it('keeps the dilemma: neither action is better against everything', () => {
    assert.ok(stagPayoffs('stag', 'stag')[0] > stagPayoffs('hare', 'stag')[0]);
    assert.ok(stagPayoffs('hare', 'hare')[0] > stagPayoffs('stag', 'hare')[0]);
    // Expected payoff of Stag = 5p; of Hare = 3. Break-even at p = 0.6.
    for (const [p, stagBetter] of [[0.5, false], [0.6, false], [0.7, true]] as const) assert.equal(5 * p > 3, stagBetter);
  });

  it('Cautious (easy) always takes the hare; Optimist (easy) always hunts stag', () => {
    const c = play(stagHunt, spec<StagBot>('cautious', 'easy'), () => 'stag' as StagMove);
    assert.ok(c.every((r) => r.b === 'hare'));
    assert.deepEqual(stagHunt.totals(c), { player: 0, bot: 24 });
    const o = play(stagHunt, spec<StagBot>('optimist', 'easy'), () => 'stag' as StagMove);
    assert.deepEqual(stagHunt.totals(o), { player: 40, bot: 40 });
  });

  it('Opportunist hunts stag only when the expected value beats the sure hare', () => {
    const s = spec<StagBot>('opportunistic', 'medium');
    assert.equal(stagBotMove(s, []), 'hare'); // belief ½: 2.5 < 3
    const trusting = Array.from({ length: 3 }, () => ({ p: 'stag', b: 'hare', ps: 0, bs: 3 }) as StagRound);
    assert.equal(stagBotMove(s, trusting), 'stag'); // belief 4/5: 4 > 3
    assert.equal(stagBotMove({ ...s, difficulty: 'easy' }, trusting), 'stag');
    assert.equal(stagBotMove({ ...s, difficulty: 'easy' }, [...trusting, { p: 'hare', b: 'stag', ps: 3, bs: 0 }]), 'hare');
  });

  it('Conditional Partner opens with trust and keeps it only while it is returned', () => {
    for (const d of DIFFICULTIES) assert.equal(stagBotMove(spec<StagBot>('conditional', d), []), 'stag');
    const betrayed: StagRound[] = [{ p: 'hare', b: 'stag', ps: 3, bs: 0 }];
    assert.equal(stagBotMove(spec<StagBot>('conditional', 'hard'), betrayed), 'hare');
    assert.equal(stagBotMove(spec<StagBot>('conditional', 'easy'), betrayed), 'hare'); // belief 1/3 < ½
    // One stag, one hare: belief ½ clears the easy bar (½) but not the medium one (0.6).
    const mixed: StagRound[] = [{ p: 'stag', b: 'stag', ps: 5, bs: 5 }, ...betrayed];
    assert.equal(stagBotMove(spec<StagBot>('conditional', 'easy'), mixed), 'stag');
    assert.equal(stagBotMove(spec<StagBot>('conditional', 'medium'), mixed), 'hare');
  });

  it('a steady stag hunter coordinates with the Cautious hunter on hard only after building trust', () => {
    const h = play(stagHunt, spec<StagBot>('cautious', 'hard'), () => 'stag' as StagMove);
    const firstStag = h.findIndex((r) => r.b === 'stag');
    assert.ok(firstStag >= 3, String(firstStag));
    assert.ok(h.slice(firstStag).every((r) => r.b === 'stag'));
  });
});
