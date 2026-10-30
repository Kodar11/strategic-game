import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { commons } from '../../arena/commons.ts';
import { type CoopState, coopBotMove, cooperation } from '../../arena/cooperation.ts';
import { ARENA_IDS, type ArenaEngine, LEVELS, type MatchLength, type Setup } from '../../arena/core.ts';
import { inspector, playerOperates } from '../../arena/inspector.ts';
import { awaitingRead } from '../../arena/reads.ts';
import { ARENA_ENGINES } from '../../arena/registry.ts';
import { type TravelerState, travelers } from '../../arena/travelers.ts';
import { DIFFICULTIES, GAME_IDS, type GameEngine, type GameId, type MatchSpec } from '../../games/core.ts';
import { readIsAwaited, lockRead, readMinRounds } from '../../games/reads.ts';
import { ENGINES } from '../../games/registry.ts';
import { RPS_ROUNDS, type RpsRound, beats, rpsBotMove } from '../../games/rps.ts';
import { SPLIT_ROUNDS, type SplitRound, splitBotMove } from '../../games/split-steal.ts';
import { type StagRound, stagBotMove } from '../../games/stag-hunt.ts';
import { cooperationRepeat, ARENA_REPEAT } from '../arena.ts';
import { REPEAT_AUDIT, type RepeatCategory } from '../audit.ts';
import { CLASSIC_REPEAT } from '../classic.ts';
import { type RepeatGame, type RepeatPlan, type RepeatProgress, completedIn, markSent, roundsLeft, runPlan, startPlan, strategyOf, tickPlan } from '../plan.ts';

// ── Harnesses: the engines' own resolve/apply, driven the way the screens drive them ───────────────────────────

/** A classic practice match: `play` resolves through the engine, exactly like usePracticeMatch. */
function classicMatch(game: GameId, bot: string, difficulty: (typeof DIFFICULTIES)[number], seed = 7) {
  const engine = ENGINES[game] as GameEngine<string, unknown, unknown, unknown>;
  const spec: MatchSpec = { bot, difficulty, seed };
  const rounds: unknown[] = [];
  const progress = (busy = false): RepeatProgress => ({ played: rounds.length, total: engine.rounds, busy, over: rounds.length >= engine.rounds });
  const play = (m: unknown) => {
    if (rounds.length >= engine.rounds) return false;
    const parsed = engine.parseMove(m, engine.prompt(spec, rounds));
    if (parsed === null) return false;
    rounds.push(engine.resolve(spec, rounds, parsed));
    return true;
  };
  return { engine, spec, rounds, progress, play, host: { ctx: () => rounds as readonly unknown[], progress: () => progress(), play } };
}

/** An arena match: validate, then apply — the useArenaMatch path. */
function arenaMatch<S extends { setup: Setup<string, string> }, A>(engine: ArenaEngine<S, A>, persona: string, level: (typeof LEVELS)[number], variant: string, length: MatchLength = 'standard', seed = 11) {
  const box = { s: engine.create({ persona, level, variant, length, seed }) };
  const progress = (): RepeatProgress => ({ played: engine.played(box.s), total: engine.rounds(length), busy: false, over: engine.isOver(box.s) });
  // Moves arrive untyped from the strategy registry; validate is the authority, exactly as on the screen.
  const play = (a: unknown) => {
    if (engine.validate(box.s, a as A) !== null) return false;
    box.s = engine.apply(box.s, a as A);
    return true;
  };
  return { box, progress, play, host: { ctx: () => box.s, progress, play } };
}

const plan = (game: RepeatGame<unknown, unknown>, id: string, count: number, p: RepeatProgress, amount?: number) => {
  const s = strategyOf(game, id)!;
  return startPlan(id, amount ?? s.amount?.initial ?? 0, count, p)!;
};

// ── The audit ───────────────────────────────────────────────────────────────────────────────────────────────────

describe('repeat-play audit', () => {
  const KIND: Record<string, RepeatCategory> = { fixed: 'A', pattern: 'B', conditional: 'C' };

  it('covers every game in the library, each with its reasoning', () => {
    const ids = [...GAME_IDS, ...ARENA_IDS];
    assert.deepEqual(Object.keys(REPEAT_AUDIT).sort(), [...ids].sort());
    for (const id of ids) {
      const a = REPEAT_AUDIT[id];
      assert.ok(a.why.length > 40, id);
      assert.ok(a.categories.length > 0, id);
      if (a.categories.some((c) => c === 'D' || c === 'E')) assert.equal(a.categories.length, 1, `${id}: manual is exclusive`);
    }
  });

  it('offers strategies exactly where the audit says, of exactly those kinds', () => {
    for (const id of GAME_IDS) {
      const kinds = new Set((CLASSIC_REPEAT[id]?.strategies ?? []).map((s) => KIND[s.kind]));
      assert.deepEqual([...kinds].sort(), REPEAT_AUDIT[id].categories.filter((c) => c <= 'C').slice().sort(), id);
    }
    for (const id of ARENA_IDS) {
      const kinds = new Set((ARENA_REPEAT[id]?.strategies ?? []).map((s) => KIND[s.kind]));
      assert.deepEqual([...kinds].sort(), REPEAT_AUDIT[id].categories.filter((c) => c <= 'C').slice().sort(), id);
    }
  });
});

// ── The plan ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('repeat plan', () => {
  const at = (played: number, total = 10, extra: Partial<RepeatProgress> = {}): RepeatProgress => ({ played, total, busy: false, over: played >= total, ...extra });

  it('never covers more than the rounds left, and never starts on a finished match', () => {
    assert.equal(startPlan('x', 0, 12, at(3))!.count, 7);
    assert.equal(startPlan('x', 0, 0, at(3))!.count, 1);
    assert.equal(startPlan('x', 0, 4, at(3))!.count, 4);
    assert.equal(startPlan('x', 0, 4, at(10)), null);
    assert.equal(startPlan('x', 0, 4, at(5, 10, { over: true })), null);
    assert.equal(roundsLeft(at(4)), 6);
  });

  it('releases one move per round, waits while one is in flight, and keeps its counts apart', () => {
    let p: RepeatPlan = startPlan('x', 0, 3, at(2))!;
    assert.deepEqual(tickPlan(p, at(2)), { kind: 'release', step: 0 });
    p = markSent(p, 2);
    assert.deepEqual(tickPlan(p, at(2)), { kind: 'wait' }, 'same round again');
    assert.deepEqual(tickPlan(p, at(2, 10, { busy: true })), { kind: 'wait' });
    assert.deepEqual(tickPlan(p, at(3)), { kind: 'release', step: 1 });
    assert.equal(completedIn(p, 3), 1);
    p = markSent(p, 3);
    assert.deepEqual(tickPlan(p, at(4, 10, { busy: true })), { kind: 'wait' }, 'busy before the next pause');
    p = markSent(p, 4);
    assert.deepEqual(tickPlan(p, at(5)), { kind: 'end', reason: 'count' });
    assert.equal(completedIn(p, 5), 3);
    // 10 rounds in the match, 2 played before, 3 repeated: 5 left to play by hand.
    assert.equal(roundsLeft(at(5)), 5);
  });

  it('ends on the final round as match-over (results are then held for Continue), and on early endings', () => {
    const p = startPlan('x', 0, 2, at(8))!;
    assert.deepEqual(tickPlan(p, at(10)), { kind: 'end', reason: 'match-over' });
    assert.deepEqual(tickPlan(p, at(9, 10, { over: true })), { kind: 'end', reason: 'match-over' }, 'a collapse ends it early');
  });

  it('stops when its own submission fails, but not for an error left from before it started', () => {
    const p = startPlan('x', 0, 5, at(1))!;
    assert.deepEqual(tickPlan(p, at(1, 10, { error: true })), { kind: 'release', step: 0 });
    assert.deepEqual(tickPlan(markSent(p, 1), at(1, 10, { error: true })), { kind: 'end', reason: 'refused' });
  });
});

// ── Classic games ───────────────────────────────────────────────────────────────────────────────────────────────

describe('classic repeat strategies', () => {
  it('play legal moves for every strategy, bot and difficulty, to the end of the match, through the engine', () => {
    for (const id of GAME_IDS) {
      const game = CLASSIC_REPEAT[id];
      if (!game) continue;
      for (const s of game.strategies)
        for (const bot of ENGINES[id].bots)
          for (const d of DIFFICULTIES) {
            const m = classicMatch(id, bot, d);
            const r: { end: string } = runPlan(game, plan(game, s.id, 99, m.progress()), m.host);
            assert.equal(r.end, 'match-over', `${id}/${s.id}/${bot}/${d}`);
            assert.equal(m.rounds.length, m.engine.rounds);
            // Scores come from the real history, unchanged.
            assert.deepEqual(m.engine.totals(m.rounds), m.engine.totals(m.rounds.slice()));
          }
    }
  });

  it('a fixed choice repeats exactly; the bot still answers by its own policy', () => {
    const m = classicMatch('split-steal', 'retaliator', 'hard');
    const game = CLASSIC_REPEAT['split-steal']!;
    runPlan(game, plan(game, 'always-steal', 99, m.progress()), m.host);
    const rs = m.rounds as SplitRound[];
    assert.ok(rs.every((r) => r.p === 'steal'));
    rs.forEach((r, i) => assert.equal(r.b, splitBotMove(m.spec as MatchSpec<'retaliator'>, rs.slice(0, i))));
  });

  it('a conditional strategy reads the actual history, not its own first move', () => {
    for (const bot of ENGINES['split-steal'].bots) {
      const m = classicMatch('split-steal', bot, 'medium', 3);
      const game = CLASSIC_REPEAT['split-steal']!;
      runPlan(game, plan(game, 'copy', 99, m.progress()), m.host);
      const rs = m.rounds as SplitRound[];
      assert.equal(rs[0].p, 'split');
      for (let i = 1; i < rs.length; i++) assert.equal(rs[i].p, rs[i - 1].b, `${bot} round ${i}`);
    }
    const st = classicMatch('stag-hunt', 'opportunistic', 'easy');
    runPlan(CLASSIC_REPEAT['stag-hunt']!, plan(CLASSIC_REPEAT['stag-hunt']!, 'copy', 99, st.progress()), st.host);
    const sr = st.rounds as StagRound[];
    for (let i = 1; i < sr.length; i++) assert.equal(sr[i].p, sr[i - 1].b);
    sr.forEach((r, i) => assert.equal(r.b, stagBotMove(st.spec as MatchSpec<'opportunistic'>, sr.slice(0, i))));
    // The opportunistic hunter opens with hare, so a copier must switch — not stay on its opening stag.
    assert.ok(sr.some((r) => r.p === 'hare'));
  });

  it('Rock, Paper, Scissors: a cycle follows its order from the first repeated round; "beat its last" answers the bot', () => {
    const m = classicMatch('rps', 'repeater', 'easy');
    m.play('paper');
    m.play('paper');
    const game = CLASSIC_REPEAT.rps!;
    runPlan(game, plan(game, 'cycle', 4, m.progress()), m.host);
    assert.deepEqual((m.rounds as RpsRound[]).slice(2).map((r) => r.p), ['rock', 'paper', 'scissors', 'rock']);
    const b = classicMatch('rps', 'counter', 'hard');
    runPlan(game, plan(game, 'beat-last', 99, b.progress()), b.host);
    const rs = b.rounds as RpsRound[];
    for (let i = 1; i < rs.length; i++) assert.equal(rs[i].p, beats(rs[i - 1].b));
    rs.forEach((r, i) => assert.equal(r.b, rpsBotMove(b.spec as MatchSpec<'counter'>, rs.slice(0, i))));
  });

  it('repeats fewer rounds than remain, then leaves the rest to the player', () => {
    const m = classicMatch('split-steal', 'cooperator', 'easy');
    m.play('split');
    const game = CLASSIC_REPEAT['split-steal']!;
    const r = runPlan(game, plan(game, 'always-steal', 4, m.progress()), m.host);
    assert.equal(r.end, 'count');
    assert.equal(m.rounds.length, 5);
    assert.equal(roundsLeft(m.progress()), SPLIT_ROUNDS - 5);
    // Manual play carries on normally.
    assert.ok(m.play('split'));
    assert.equal((m.rounds as SplitRound[])[5].p, 'split');
  });

  it('two-thirds repeats the chosen number', () => {
    const m = classicMatch('two-thirds', 'deep', 'hard');
    const game = CLASSIC_REPEAT['two-thirds']!;
    runPlan(game, plan(game, 'same-pick', 99, m.progress(), 0), m.host);
    assert.ok((m.rounds as { p: number }[]).every((r) => r.p === 0));
  });

  it('The Ultimatum stays manual', () => {
    assert.equal(CLASSIC_REPEAT.ultimatum, undefined);
  });
});

// ── Cancellation (the hook's rules, without timers) ─────────────────────────────────────────────────────────────

describe('cancelling a repeat', () => {
  const game = CLASSIC_REPEAT.rps!;

  /** One hook step: tick; release through the strategy and play; returns what happened. Cancel = drop the plan. */
  function step(m: ReturnType<typeof classicMatch>, p: RepeatPlan | null, busy = false): { plan: RepeatPlan | null; sent: boolean } {
    if (!p) return { plan: null, sent: false };
    const t = tickPlan(p, m.progress(busy));
    if (t.kind !== 'release') return { plan: t.kind === 'end' ? null : p, sent: false };
    const next = markSent(p, m.rounds.length);
    if (!busy) m.play(strategyOf(game, p.strategy)!.next(m.rounds, t.step, p.amount));
    return { plan: next, sent: true };
  }

  it('before the first automatic decision: nothing is played, the match is untouched', () => {
    const m = classicMatch('rps', 'mind-reader', 'medium');
    m.play('rock');
    let p: RepeatPlan | null = plan(game, 'always-paper', 99, m.progress());
    p = null; // Cancel Repeat during the opening pause.
    for (let i = 0; i < 5; i++) step(m, p);
    assert.equal(m.rounds.length, 1);
  });

  it('between rounds, after several: completed rounds stay, the next decision is manual, the match can finish', () => {
    const m = classicMatch('rps', 'randomizer', 'hard');
    let p: RepeatPlan | null = plan(game, 'always-scissors', 99, m.progress());
    for (let i = 0; i < 5; i++) p = step(m, p).plan;
    const before = JSON.stringify(m.rounds);
    p = null;
    for (let i = 0; i < 5; i++) assert.equal(step(m, p).sent, false);
    assert.equal(JSON.stringify(m.rounds), before, 'nothing undone or added');
    assert.equal(m.rounds.length, 5);
    while (m.rounds.length < RPS_ROUNDS) assert.ok(m.play('rock'));
    assert.equal(m.rounds.length, RPS_ROUNDS);
    assert.ok((m.rounds as RpsRound[]).slice(5).every((r) => r.p === 'rock'));
  });

  it('while a round is resolving: that round finishes once, no further move is sent', () => {
    const m = classicMatch('rps', 'counter', 'easy');
    let p: RepeatPlan | null = plan(game, 'always-rock', 99, m.progress());
    // A server match: the move is sent for round 0 and the round is now in flight (busy, not yet resolved).
    const t = tickPlan(p, m.progress());
    assert.deepEqual(t, { kind: 'release', step: 0 });
    p = markSent(p, 0);
    assert.equal(step(m, p, true).sent, false, 'nothing more while it is in flight');
    assert.equal(step(m, p, false).sent, false, 'and never a second move for the same round');
    p = null; // Cancel Repeat arrives during the flight…
    m.play('rock'); // …and the in-flight round still resolves, once.
    assert.equal(step(m, p).sent, false);
    assert.equal(m.rounds.length, 1);
  });
});

// ── Arena games ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('arena repeat strategies', () => {
  it('play legal actions for every strategy, opponent, level and variant, to the end, through validate/apply', () => {
    for (const id of ARENA_IDS) {
      const game = ARENA_REPEAT[id];
      if (!game) continue;
      const engine = ARENA_ENGINES[id];
      for (const s of game.strategies)
        for (const persona of engine.opponents)
          for (const level of LEVELS)
            for (const variant of engine.variants) {
              const m = arenaMatch(engine, persona, level, variant);
              const r: { end: string } = runPlan(game, plan(game, s.id, 99, m.progress()), m.host);
              assert.equal(r.end, 'match-over', `${id}/${s.id}/${persona}/${level}/${variant}`);
              assert.ok(engine.isOver(m.box.s));
            }
    }
  });

  it('Cooperation: tit for tat copies what the opponent actually delivered, slips included', () => {
    for (const persona of cooperation.opponents) {
      const m = arenaMatch(cooperation, persona, 'hard', 'noisy', 'long', 5);
      runPlan(cooperationRepeat, plan(cooperationRepeat as RepeatGame<unknown, unknown>, 'tit-for-tat', 99, m.progress()), m.host);
      const h = (m.box.s as CoopState).rounds;
      assert.equal(h[0].pi, 'C');
      for (let i = 1; i < h.length; i++) assert.equal(h[i].pi, h[i - 1].b);
      // The opponent's intended move is still its own policy's, from completed rounds only.
      h.forEach((r, i) => assert.equal(r.bi, coopBotMove(m.box.s.setup, h.length, h.slice(0, i))));
    }
  });

  it('Traveler’s Dilemma: matching and undercutting follow the real claims', () => {
    const game = ARENA_REPEAT.travelers!;
    const m = arenaMatch(travelers, 'undercutter', 'normal', 'standard');
    runPlan(game, plan(game, 'match', 99, m.progress(), 15), m.host);
    const h = (m.box.s as TravelerState).rounds;
    assert.equal(h[0].claims[0], 15);
    for (let i = 1; i < h.length; i++) assert.equal(h[i].claims[0], h[i - 1].claims[1]);
    const u = arenaMatch(travelers, 'cooperative', 'hard', 'big-bonus');
    runPlan(game, plan(game, 'undercut', 99, u.progress()), u.host);
    const hu = (u.box.s as TravelerState).rounds;
    for (let i = 1; i < hu.length; i++) assert.equal(hu[i].claims[0], Math.max(2, hu[i - 1].claims[1] - 1));
  });

  it('The Commons: a greedy repeat that collapses the lake ends with the season, not after it', () => {
    const game = ARENA_REPEAT.commons!;
    const m = arenaMatch(commons, 'maximizer', 'hard', 'fragile');
    const r = runPlan(game, plan(game, 'same-take', 99, m.progress(), 10), m.host);
    assert.equal(r.end, 'match-over');
    assert.ok(m.box.s.lake === 0 || m.box.s.rounds.length === m.box.s.total);
    assert.ok(m.box.s.rounds.every((x) => x.requests[0] === 10));
  });

  it('The Inspector: one choice per role, played in the role each round needs', () => {
    const game = ARENA_REPEAT.inspector!;
    const m = arenaMatch(inspector, 'calculated', 'normal', 'standard');
    runPlan(game, plan(game, 'cut-inspect', 99, m.progress()), m.host);
    m.box.s.rounds.forEach((r, i) => {
      assert.equal(r.operator, playerOperates(i) ? 'player' : 'bot');
      if (r.operator === 'player') assert.equal(r.op, 'cut');
      else assert.equal(r.ins, 'inspect');
    });
  });

  it('every other arena game stays manual', () => {
    const manual = ARENA_IDS.filter((id) => !ARENA_REPEAT[id]);
    assert.equal(manual.length, ARENA_IDS.length - 4);
    for (const id of manual) assert.deepEqual(REPEAT_AUDIT[id].categories, ['D']);
  });
});

// ── Prediction after a repeat (the existing read rules, unchanged) ──────────────────────────────────────────────

describe('prediction around a repeat', () => {
  it('classic: a repeat that ends the match with no read leaves the read awaited — the reveal waits for it', () => {
    const m = classicMatch('split-steal', 'opportunist', 'hard');
    const game = CLASSIC_REPEAT['split-steal']!;
    runPlan(game, plan(game, 'copy', 99, m.progress()), m.host);
    const status = { mystery: true, roundsPlayed: m.rounds.length, totalRounds: SPLIT_ROUNDS, revealed: false };
    const min = readMinRounds('split-steal');
    assert.equal(readIsAwaited(null, status, min), true);
    const read = lockRead(null, 'retaliator', status, min, ENGINES['split-steal'].bots);
    assert.equal(readIsAwaited(read, status, min), false, 'one read, then no second ask');
    assert.equal(lockRead(read, 'cooperator', status, min, ENGINES['split-steal'].bots), read, 'never duplicated or replaced');
  });

  it('classic: a read made before or during the repeat is kept, so nothing is asked again', () => {
    const m = classicMatch('stag-hunt', 'cautious', 'medium');
    for (let i = 0; i < 3; i++) m.play('stag');
    const min = readMinRounds('stag-hunt');
    const read = lockRead(null, 'cautious', { mystery: true, roundsPlayed: 3, totalRounds: 8, revealed: false }, min, ENGINES['stag-hunt'].bots);
    assert.ok(read);
    runPlan(CLASSIC_REPEAT['stag-hunt']!, plan(CLASSIC_REPEAT['stag-hunt']!, 'always-stag', 99, m.progress()), m.host);
    assert.equal(readIsAwaited(read, { mystery: true, roundsPlayed: 8, totalRounds: 8, revealed: false }, min), false);
  });

  it('arena: the end-of-match guess is offered once when none was made, and not when one was', () => {
    assert.equal(awaitingRead(true, true, null, false), true);
    assert.equal(awaitingRead(true, true, 'banker', false), false);
    assert.equal(awaitingRead(false, true, null, false), false, 'a chosen opponent has no prediction stage');
  });
});
