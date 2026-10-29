/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ARENA } from '../catalog.ts';
import { LEVELS, type Level } from '../core.ts';
import {
  COOP_OPPONENTS,
  COOP_PAYOFFS,
  COOP_TUNING,
  COOP_VARIANTS,
  type CoopMove,
  type CoopOpponent,
  type CoopRound,
  type CoopSetup,
  type CoopState,
  type CoopVariant,
  coopBotMove,
  coopPayoff,
  cooperation,
  isDilemma,
  profilePlayer,
  resolveCoop,
} from '../cooperation.ts';
import { coopBriefing, coopInsights, coopLessons, coopOutcomeText, coopRevealNote, coopStats, opponentPatterns } from '../cooperation-analysis.ts';

const setup = (persona: CoopOpponent, level: Level = 'normal', seed = 42, variant: CoopVariant = 'classic'): CoopSetup => ({ persona, level, variant, length: 'standard', seed });
const P = COOP_PAYOFFS.classic;

/** The seven representative player strategies from the brief (plus a final-round defector). */
type Strategy = (h: readonly CoopRound[], total: number) => CoopMove;
const STRATEGIES: Record<string, Strategy> = {
  'always cooperate': () => 'C',
  'always defect': () => 'D',
  alternate: (h) => (h.length % 2 ? 'D' : 'C'),
  'tit-for-tat': (h) => (h.length ? h[h.length - 1].b : 'C'),
  'cooperate, then defect': (h, t) => (h.length < t / 2 ? 'C' : 'D'),
  'defect, then cooperate': (h, t) => (h.length < t / 2 ? 'D' : 'C'),
  'win-stay, lose-shift': (h) => (!h.length || h[h.length - 1].p === h[h.length - 1].b ? 'C' : 'D'),
};

function play(s0: CoopState, strategy: Strategy): CoopState {
  let s = s0;
  while (!cooperation.isOver(s)) s = resolveCoop(s, { move: strategy(s.rounds, s.total), round: s.rounds.length });
  return s;
}
const match = (persona: CoopOpponent, level: Level, strategy: Strategy, seed = 21, variant: CoopVariant = 'classic') => play(cooperation.create(setup(persona, level, seed, variant)), strategy);
const rounds = (moves: [CoopMove, CoopMove][]): CoopRound[] =>
  moves.map(([p, b]) => {
    const [ps, bs] = coopPayoff(P, p, b);
    return { pi: p, bi: b, p, b, ps, bs };
  });

// ── A. Payoffs ──────────────────────────────────────────────────────────────

describe('cooperation: payoffs', () => {
  it('uses the documented default matrix: 3/3, 0/5, 5/0, 1/1', () => {
    assert.deepEqual(coopPayoff(P, 'C', 'C'), [3, 3]);
    assert.deepEqual(coopPayoff(P, 'C', 'D'), [0, 5]);
    assert.deepEqual(coopPayoff(P, 'D', 'C'), [5, 0]);
    assert.deepEqual(coopPayoff(P, 'D', 'D'), [1, 1]);
  });

  it('every variant satisfies T > R > P > S and 2R > T + S', () => {
    for (const v of COOP_VARIANTS) assert.ok(isDilemma(COOP_PAYOFFS[v]), v);
  });

  it('is symmetric: swapping the players swaps the payoffs', () => {
    for (const v of COOP_VARIANTS)
      for (const a of ['C', 'D'] as const)
        for (const b of ['C', 'D'] as const) {
          const [x, y] = coopPayoff(COOP_PAYOFFS[v], a, b);
          assert.deepEqual(coopPayoff(COOP_PAYOFFS[v], b, a), [y, x]);
        }
  });

  it('assigns each round’s points to the right player', () => {
    for (const persona of COOP_OPPONENTS) {
      const s = match(persona, 'hard', STRATEGIES['alternate']);
      for (const r of s.rounds) assert.deepEqual([r.ps, r.bs], coopPayoff(P, r.p, r.b));
    }
  });
});

// ── B. Round lifecycle ──────────────────────────────────────────────────────

describe('cooperation: round lifecycle', () => {
  it('rejects invalid moves without changing anything', () => {
    const s = cooperation.create(setup('retaliator'));
    for (const bad of [null, undefined, 'C', { move: 'X', round: 0 }, { move: 'C' }, { move: 'C', round: 1 }, { move: 'C', round: -1 }]) {
      assert.ok(cooperation.validate(s, bad as never), JSON.stringify(bad));
      assert.throws(() => resolveCoop(s, bad as never));
    }
    assert.equal(s.rounds.length, 0);
  });

  it('resolves a round exactly once: a duplicate or stale submission is refused', () => {
    const s0 = cooperation.create(setup('collaborator'));
    const s1 = resolveCoop(s0, { move: 'C', round: 0 });
    assert.equal(s1.rounds.length, 1);
    assert.ok(cooperation.validate(s1, { move: 'C', round: 0 }), 'the same round again is refused');
    assert.throws(() => resolveCoop(s1, { move: 'D', round: 0 }));
    assert.equal(s0.rounds.length, 0, 'resolving never mutates the previous state');
  });

  it('advances the round by one, accumulates scores, and reconciles totals with the rounds', () => {
    let s = cooperation.create(setup('chameleon', 'hard'));
    let you = 0;
    let them = 0;
    for (let i = 0; i < s.total; i++) {
      const next = resolveCoop(s, { move: i % 3 ? 'C' : 'D', round: i });
      assert.equal(next.rounds.length, i + 1);
      you += next.rounds[i].ps;
      them += next.rounds[i].bs;
      s = next;
    }
    const r = cooperation.result(s);
    assert.equal(r.player, you);
    assert.equal(r.rival, them);
    assert.equal(coopStats(s).player, you);
  });

  it('ends after the configured rounds (10 by default) and accepts nothing after', () => {
    assert.equal(cooperation.create(setup('retaliator')).total, 10);
    assert.equal(cooperation.create({ ...setup('retaliator'), length: 'short' }).total, 6);
    const s = match('retaliator', 'normal', STRATEGIES['tit-for-tat']);
    assert.equal(s.rounds.length, 10);
    assert.ok(cooperation.isOver(s));
    assert.ok(cooperation.validate(s, { move: 'C', round: 10 }));
  });

  it('decides the winner by score alone; equal scores draw', () => {
    const nice = match('collaborator', 'normal', STRATEGIES['always cooperate']);
    assert.equal(cooperation.result(nice).outcome, 'draw');
    const lose = match('opportunist', 'normal', STRATEGIES['always cooperate']);
    assert.equal(cooperation.result(lose).outcome, 'loss');
    const win = match('collaborator', 'easy', STRATEGIES['always defect']);
    assert.equal(cooperation.result(win).outcome, 'win');
  });

  it('a rematch is a fresh state: zero scores, no history', () => {
    const played = match('opportunist', 'hard', STRATEGIES['alternate'], 9);
    const again = cooperation.create({ ...played.setup, seed: 10 });
    assert.equal(again.rounds.length, 0);
    assert.deepEqual(cooperation.result(again).player, 0);
    assert.notEqual(played.rounds.length, again.rounds.length);
  });

  it('replays identically from the same seed', () => {
    for (const persona of COOP_OPPONENTS) assert.deepEqual(match(persona, 'easy', STRATEGIES['alternate'], 5, 'noisy'), match(persona, 'easy', STRATEGIES['alternate'], 5, 'noisy'));
  });

  it('noisy slips are seeded, independent of difficulty, and revealed in the round', () => {
    const slips = (level: Level) => match('collaborator', level, STRATEGIES['always cooperate'], 11, 'noisy').rounds.map((r) => r.p !== r.pi);
    assert.deepEqual(slips('easy'), slips('hard'));
    assert.ok(match('collaborator', 'easy', STRATEGIES['always cooperate'], 11).rounds.every((r) => r.p === r.pi && r.b === r.bi));
  });
});

// ── C. Bots ─────────────────────────────────────────────────────────────────

describe('cooperation: bots only use completed rounds', () => {
  it('the opponent’s move is the same whatever the player submits this round', () => {
    for (const persona of COOP_OPPONENTS)
      for (const level of LEVELS)
        for (const [name, strategy] of Object.entries(STRATEGIES)) {
          let s = cooperation.create(setup(persona, level, 3));
          while (!cooperation.isOver(s)) {
            const n = s.rounds.length;
            const c = resolveCoop(s, { move: 'C', round: n });
            const d = resolveCoop(s, { move: 'D', round: n });
            assert.equal(c.rounds[n].bi, d.rounds[n].bi, `${persona} ${level} vs ${name}, round ${n + 1}`);
            assert.equal(c.rounds[n].bi, coopBotMove(s.setup, s.total, s.rounds));
            s = strategy(s.rounds, s.total) === 'C' ? c : d;
          }
        }
  });

  it('every bot opens by cooperating, and handles one-round histories', () => {
    for (const persona of COOP_OPPONENTS)
      for (const level of LEVELS)
        for (let seed = 0; seed < 20; seed++) {
          const sp = setup(persona, level, seed);
          assert.equal(coopBotMove(sp, 10, []), 'C', `${persona} ${level}`);
          for (const first of rounds([['D', 'C']]).concat(rounds([['C', 'C']]))) assert.ok(['C', 'D'].includes(coopBotMove(sp, 10, [first])));
        }
  });

  it('keeps tuning apart from policy: every opponent has Easy, Normal and Hard settings', () => {
    for (const persona of COOP_OPPONENTS) assert.deepEqual(Object.keys(COOP_TUNING[persona]).sort(), [...LEVELS].sort());
  });
});

describe('cooperation: the Collaborator', () => {
  it('cooperates with a cooperator at every level', () => {
    for (const level of LEVELS) assert.ok(match('collaborator', level, STRATEGIES['always cooperate']).rounds.every((r) => r.b === 'C'), level);
  });
  it('Easy forgives most defections; Normal and Hard become cautious under repeated exploitation', () => {
    const coop = (level: Level) => match('collaborator', level, STRATEGIES['always defect']).rounds.filter((r) => r.b === 'C').length;
    assert.ok(coop('easy') >= 6, `easy cooperated ${coop('easy')}`);
    assert.ok(coop('normal') <= 5 && coop('hard') <= 4, `normal ${coop('normal')}, hard ${coop('hard')}`);
  });
  it('returns to cooperation when the player resumes cooperating', () => {
    for (const level of LEVELS) {
      const s = match('collaborator', level, (h) => (h.length < 4 ? 'D' : 'C'));
      assert.ok(s.rounds.slice(-3).every((r) => r.b === 'C'), level);
    }
  });
  it('Hard absorbs a one-off defection that the Hard Retaliator answers', () => {
    const h = rounds([['C', 'C'], ['C', 'C'], ['D', 'C']]);
    assert.equal(coopBotMove(setup('collaborator', 'hard'), 10, h), 'C');
    assert.equal(coopBotMove(setup('retaliator', 'hard', 1), 10, h), 'D');
  });
  it('Hard reads an alternating player: alternation pays far less than against Easy', () => {
    const alt = (level: Level) => cooperation.result(match('collaborator', level, STRATEGIES['alternate'])).player;
    assert.ok(alt('easy') > alt('hard') + 10, `${alt('easy')} vs ${alt('hard')}`);
  });
});

describe('cooperation: the Retaliator', () => {
  it('Normal is strict tit-for-tat', () => {
    for (const [name, strategy] of Object.entries(STRATEGIES)) {
      const s = match('retaliator', 'normal', strategy);
      s.rounds.forEach((r, i) => assert.equal(r.b, i === 0 ? 'C' : s.rounds[i - 1].p, `${name} round ${i + 1}`));
    }
  });
  it('answers defection and forgives once cooperation resumes', () => {
    for (const level of LEVELS) {
      const s = match('retaliator', level, (h) => (h.length < 3 ? 'D' : 'C'));
      assert.ok(s.rounds.slice(-4).every((r) => r.b === 'C'), level);
      assert.ok(s.rounds.slice(1, 4).some((r) => r.b === 'D'), level);
    }
  });
  it('Easy forgives some defections; Hard punishes repeated exploitation for two rounds', () => {
    const easy = match('retaliator', 'easy', STRATEGIES['always defect']).rounds.filter((r) => r.b === 'C').length;
    assert.ok(easy >= 2, `easy forgave ${easy}`);
    const h = rounds([['C', 'C'], ['D', 'C'], ['C', 'D'], ['D', 'C'], ['C', 'D']]);
    assert.equal(coopBotMove(setup('retaliator', 'hard'), 10, h), 'D', 'second round of punishment after repeated defections');
    assert.equal(coopBotMove(setup('retaliator', 'normal'), 10, h), 'C', 'Normal only looks at the last move');
  });
});

describe('cooperation: the Opportunist', () => {
  it('exploits unconditional cooperation at every level', () => {
    for (const level of LEVELS) assert.equal(cooperation.result(match('opportunist', level, STRATEGIES['always cooperate'])).outcome, 'loss', level);
  });
  it('Easy’s habit: defects after two cooperations in a row', () => {
    assert.equal(coopBotMove(setup('opportunist', 'easy'), 10, rounds([['C', 'C'], ['C', 'C']])), 'D');
    assert.equal(coopBotMove(setup('opportunist', 'easy'), 10, rounds([['D', 'C'], ['C', 'C']])), 'C');
  });
  it('Normal keeps exploiting a player who never answers, and backs off after being answered', () => {
    const allC = match('opportunist', 'normal', STRATEGIES['always cooperate']).rounds;
    assert.ok(allC.slice(-5).every((r) => r.b === 'D'));
    const h = rounds([['C', 'C'], ['C', 'C'], ['C', 'C'], ['C', 'D'], ['D', 'C']]);
    assert.equal(coopBotMove(setup('opportunist', 'normal'), 10, h), 'C');
  });
  it('Hard always defects in the final round and keeps exploiting a forgiving player', () => {
    const s = match('opportunist', 'hard', STRATEGIES['always cooperate']);
    assert.equal(s.rounds[s.total - 1].b, 'D');
    assert.ok(s.rounds.filter((r) => r.b === 'D').length >= 5);
  });
  it('changes behaviour when exploitation has consequences: it exploits tit-for-tat far less than always-cooperate', () => {
    for (const level of LEVELS) {
      const exploited = (st: Strategy) => coopStats(match('opportunist', level, st)).exploited;
      assert.ok(exploited(STRATEGIES['tit-for-tat']) < exploited(STRATEGIES['always cooperate']), level);
    }
  });
});

describe('cooperation: the Chameleon', () => {
  it('opens C, C on every level, and probes in round 3 on Normal and Hard', () => {
    for (const level of LEVELS) {
      const s = match('chameleon', level, STRATEGIES['always cooperate']);
      assert.deepEqual([s.rounds[0].b, s.rounds[1].b], ['C', 'C'], level);
      if (level !== 'easy') assert.equal(s.rounds[2].b, 'D', level);
    }
  });
  it('profiles players from completed rounds', () => {
    assert.equal(profilePlayer(rounds([['C', 'C'], ['C', 'C'], ['C', 'D'], ['C', 'C']])), 'pushover');
    assert.equal(profilePlayer(rounds([['D', 'C'], ['D', 'D'], ['D', 'D'], ['C', 'D'], ['D', 'C']])), 'aggressive');
    assert.equal(profilePlayer(rounds([['C', 'C'], ['C', 'D'], ['D', 'C'], ['C', 'C'], ['C', 'C']])), 'reciprocal');
    assert.equal(profilePlayer(rounds([['C', 'C']])), 'unknown');
  });
  it('adapts: Hard exploits a pushover but cooperates with a reciprocal player who just cooperated', () => {
    const push = match('chameleon', 'hard', STRATEGIES['always cooperate']).rounds.filter((r) => r.b === 'D').length;
    assert.ok(push >= 6, `defected ${push} times against a pushover`);
    const recip = rounds([['C', 'C'], ['C', 'D'], ['D', 'C'], ['C', 'C'], ['C', 'C']]);
    assert.equal(profilePlayer(recip), 'reciprocal');
    assert.equal(coopBotMove(setup('chameleon', 'hard'), 10, recip), 'C');
    assert.equal(coopBotMove(setup('chameleon', 'hard'), 10, [...recip, ...rounds([['D', 'C']])]), 'D', 'but it answers a defection');
  });
  it('Normal follows broad rates; Easy mirrors your recent majority', () => {
    const hD = rounds([['D', 'C'], ['D', 'C'], ['D', 'D'], ['D', 'D']]);
    assert.equal(coopBotMove(setup('chameleon', 'normal'), 10, hD), 'D');
    const hC = rounds([['C', 'C'], ['C', 'C'], ['C', 'D'], ['C', 'C']]);
    assert.equal(coopBotMove(setup('chameleon', 'normal'), 10, hC), 'C');
  });
});

describe('cooperation: difficulty and distinctness', () => {
  const strategies = Object.values(STRATEGIES);
  const winRate = (persona: CoopOpponent, level: Level, st: Strategy) => {
    let w = 0;
    for (let seed = 1; seed <= 60; seed++) if (cooperation.result(match(persona, level, st, seed * 7919)).outcome === 'win') w += 1;
    return w / 60;
  };

  it('every Easy opponent can be beaten by at least one of the representative strategies most of the time', () => {
    for (const persona of COOP_OPPONENTS) assert.ok(strategies.some((st) => winRate(persona, 'easy', st) >= 0.7), persona);
  });

  it('Hard is a stronger opponent than Easy: across the strategies, the player scores less against Hard', () => {
    for (const persona of COOP_OPPONENTS) {
      const total = (level: Level) => strategies.reduce((t, st) => t + cooperation.result(match(persona, level, st)).player, 0);
      assert.ok(total('hard') < total('easy'), `${persona}: hard ${total('hard')} vs easy ${total('easy')}`);
    }
  });

  it('Normal and Hard punish a single repetitive cooperative strategy from the exploiting personalities', () => {
    for (const persona of ['opportunist', 'chameleon'] as const)
      for (const level of ['normal', 'hard'] as const) assert.equal(cooperation.result(match(persona, level, STRATEGIES['always cooperate'])).outcome, 'loss', `${persona} ${level}`);
  });

  it('the four personalities behave differently: at each level, every pair differs against some strategy', () => {
    for (const level of LEVELS)
      for (let i = 0; i < COOP_OPPONENTS.length; i++)
        for (let j = i + 1; j < COOP_OPPONENTS.length; j++) {
          const seq = (p: CoopOpponent) => strategies.map((st) => match(p, level, st).rounds.map((r) => r.bi).join('')).join('|');
          assert.notEqual(seq(COOP_OPPONENTS[i]), seq(COOP_OPPONENTS[j]), `${level}: ${COOP_OPPONENTS[i]} vs ${COOP_OPPONENTS[j]}`);
        }
  });

  it('never alters payoffs by difficulty: same moves, same points', () => {
    for (const persona of COOP_OPPONENTS)
      for (const level of LEVELS) for (const r of match(persona, level, STRATEGIES['alternate']).rounds) assert.deepEqual([r.ps, r.bs], coopPayoff(P, r.p, r.b));
  });
});

// ── D. Statistics, briefings, patterns, insights ────────────────────────────

describe('cooperation: statistics', () => {
  const state = (moves: [CoopMove, CoopMove][]): CoopState => ({ setup: setup('retaliator'), total: 10, rounds: rounds(moves) });

  it('handles zero rounds without dividing by zero', () => {
    const st = coopStats(state([]));
    assert.equal(st.rounds, 0);
    assert.equal(st.playerCoopRate, null);
    assert.equal(st.botCoopRate, null);
    assert.match(st.pattern, /Too few/);
    assert.deepEqual(coopInsights(state([])), ['Too few rounds for a clear picture of how you played.']);
  });

  it('all cooperation', () => {
    const st = coopStats(state(Array.from({ length: 10 }, () => ['C', 'C'] as [CoopMove, CoopMove])));
    assert.deepEqual([st.player, st.bot, st.mutualC, st.mutualD, st.exploited, st.exploits, st.playerCoopRate, st.botCoopRate], [30, 30, 10, 0, 0, 0, 1, 1]);
    assert.equal(st.combinedMutualC, 60);
    assert.match(st.pattern, /every round/);
  });

  it('all defection', () => {
    const st = coopStats(state(Array.from({ length: 10 }, () => ['D', 'D'] as [CoopMove, CoopMove])));
    assert.deepEqual([st.player, st.mutualC, st.mutualD, st.playerCoopRate], [10, 0, 10, 0]);
    assert.ok(coopInsights(state(Array.from({ length: 10 }, () => ['D', 'D'] as [CoopMove, CoopMove])))[0].includes('Neither of you cooperated'));
  });

  it('alternating actions, no mutual cooperation', () => {
    const moves = Array.from({ length: 10 }, (_, i) => (i % 2 ? ['D', 'C'] : ['C', 'D']) as [CoopMove, CoopMove]);
    const st = coopStats(state(moves));
    assert.deepEqual([st.mutualC, st.mutualD, st.exploited, st.exploits, st.player, st.bot], [0, 0, 5, 5, 25, 25]);
    assert.equal(st.diff, 0);
  });

  it('no exploitation', () => {
    const st = coopStats(state([['C', 'C'], ['D', 'D'], ['C', 'C'], ['D', 'D']]));
    assert.equal(st.exploited, 0);
    assert.equal(st.exploits, 0);
  });

  it('counts conditional responses with explicit denominators', () => {
    const st = coopStats(state([['C', 'D'], ['D', 'D'], ['C', 'D'], ['C', 'C']]));
    assert.deepEqual(st.youAnsweredBetrayal, { k: 1, n: 2 });
    assert.deepEqual(st.youKeptCooperating, { k: 1, n: 2 });
    assert.deepEqual(st.itAnsweredDefection, { k: 1, n: 1 });
  });

  it('every insight is backed by the numbers it quotes', () => {
    for (const persona of COOP_OPPONENTS)
      for (const level of LEVELS)
        for (const st of Object.values(STRATEGIES)) {
          const s = match(persona, level, st);
          const stats = coopStats(s);
          for (const text of coopInsights(s, stats)) {
            const m = text.match(/You cooperated in (\d+) of (\d+) rounds/);
            if (m) assert.deepEqual([+m[1], +m[2]], [stats.playerCoop, stats.rounds]);
            const k = text.match(/took advantage of that (once|twice|(\d+) times)/);
            if (k) assert.equal(k[1] === 'once' ? 1 : k[1] === 'twice' ? 2 : +k[2], stats.exploited);
            const o = text.match(/You out-scored .* (\d+)–(\d+)/);
            if (o) assert.deepEqual([+o[1], +o[2]], [stats.player, stats.bot]);
          }
          const lessons = coopLessons(s, stats);
          assert.ok(lessons.length >= 1 && lessons.length <= 2);
        }
  });

  it('a win by mass defection says what cooperation would have paid', () => {
    const s = match('collaborator', 'hard', STRATEGIES['always defect']);
    assert.equal(cooperation.result(s).outcome, 'win');
    assert.match(coopInsights(s)[0], /would have paid you 30/);
  });
});

describe('cooperation: round briefings and the opponent panel', () => {
  it('briefings are true to the history and never repeat back to back', () => {
    for (const persona of COOP_OPPONENTS)
      for (const st of Object.values(STRATEGIES)) {
        const s = match(persona, 'normal', st);
        let prev = '';
        for (let n = 0; n < s.total; n++) {
          const h = s.rounds.slice(0, n);
          const b = coopBriefing(h, s.total);
          assert.notEqual(b, prev, `${persona} round ${n + 1}: "${b}"`);
          prev = b;
          const last = h[n - 1];
          if (b === 'Your opponent defected in the last round.') assert.equal(last.b, 'D');
          if (b === 'Your opponent cooperated last round.') assert.equal(last.b, 'C');
          if (b.startsWith('Final round')) assert.equal(n, s.total - 1);
          const run = b.match(/You have (cooperated|defected) (\d+) times in a row/);
          if (run) assert.ok(h.slice(-+run[2]).every((r) => r.pi === (run[1] === 'cooperated' ? 'C' : 'D')));
        }
      }
  });

  it('round 1 and the final round get their own briefing', () => {
    assert.match(coopBriefing([], 10), /^Round 1/);
    const h = rounds(Array.from({ length: 9 }, () => ['C', 'C'] as [CoopMove, CoopMove]));
    assert.match(coopBriefing(h, 10), /^Final round/);
  });

  it('the opponent panel only claims patterns with enough evidence', () => {
    assert.deepEqual(opponentPatterns(rounds([['C', 'C']])).notes, ['Too early to call a pattern.']);
    const two = opponentPatterns(rounds([['C', 'C'], ['C', 'C']]));
    assert.ok(!two.notes.some((n) => n.startsWith('Usually')), 'two samples are not enough for “usually”');
    const many = opponentPatterns(rounds([['C', 'C'], ['C', 'C'], ['C', 'C'], ['C', 'C']]));
    assert.ok(many.notes.includes('Usually cooperates after you do (3 of 3).'));
    assert.equal(many.summary, 'Cooperated in 4 of 4 rounds.');
    const punished = opponentPatterns(rounds([['D', 'C'], ['D', 'D'], ['C', 'D']]));
    assert.ok(punished.notes.includes('Answers your defections with one (2 of 2).'));
  });

  it('outcome and reveal notes describe the round that happened', () => {
    const [cc, cd, dc, dd] = rounds([['C', 'C'], ['C', 'D'], ['D', 'C'], ['D', 'D']]);
    assert.equal(coopOutcomeText(cc), 'Good teamwork. You both earned 3 points.');
    assert.equal(coopOutcomeText(cd), 'You gave them the opportunity to take the advantage. You earned 0 while they earned 5.');
    assert.equal(coopOutcomeText(dc), 'You took the immediate advantage. You earned 5, while they earned 0.');
    assert.equal(coopOutcomeText(dd), 'Neither of you trusted the other. You both earned 1 point.');
    assert.equal(coopRevealNote(rounds([['C', 'C'], ['C', 'C'], ['C', 'C'], ['C', 'D']])), 'That broke a run of 3 rounds of mutual cooperation.');
    assert.equal(coopRevealNote(rounds([['D', 'C'], ['C', 'D']])), 'It defected right after your defection.');
    assert.equal(coopRevealNote(rounds([['C', 'C']])), null);
  });
});

describe('cooperation: catalog', () => {
  it('lists the four opponents with summaries and tendencies, in engine order', () => {
    const g = ARENA.cooperation;
    assert.deepEqual(g.opponents.map((o) => o.id), [...COOP_OPPONENTS]);
    for (const o of g.opponents) assert.ok(o.summary && o.tendency);
    assert.equal(g.subtitle, 'Trust is easy to build. Harder to keep.');
    assert.ok(g.rules.some((r) => r.includes('higher total score wins')));
  });
});
