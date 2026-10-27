/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGamesStore } from '../../features/games/store.ts';
import { ago, opponentHistory } from '../../features/games/history.ts';
import type { GamesRepository, MyGames, PracticeRecord } from '../../data/games.ts';
import { DIFFICULTIES, type Difficulty, type MatchSpec, draw } from '../core.ts';
import { RPS_BOTS, RPS_CONFIG, RPS_INSIGHT, RPS_MOVES, RPS_POINTS, RPS_ROUNDS, type RpsBot, type RpsMove, type RpsRound, rps, rpsBotMove, rpsRuleMoves } from '../rps.ts';
import {
  MYSTERY_NAME,
  type OpponentRead,
  RPS_READS,
  RepeatThrow,
  awaitingRead,
  evidence,
  insightFor,
  lockPrediction,
  matchReveal,
  opponentName,
  pickOpponent,
  predictionOpen,
  ruleFit,
  rpsTakeaway,
} from '../rps-insight.ts';

/** A player with habits of its own: mostly rock, with a seed-dependent cycle mixed in. */
const habitPlayer = (seed: number) => (h: readonly RpsRound[]): RpsMove => (h.length % 3 === 0 ? 'rock' : RPS_MOVES[(h.length * 7 + seed) % 3]);

function playMatch(spec: MatchSpec<RpsBot>, player: (h: readonly RpsRound[]) => RpsMove, upTo = RPS_ROUNDS): RpsRound[] {
  const h: RpsRound[] = [];
  while (h.length < upTo) h.push(rps.resolve(spec, h, player(h)));
  return h;
}

const noisy = (spec: MatchSpec<RpsBot>, round: number) => {
  const noise = RPS_CONFIG[spec.bot][spec.difficulty].noise;
  return noise > 0 && round > 0 && draw(spec.seed, round, 0) < noise;
};

// ── Opponent assignment ─────────────────────────────────────────────────────

describe('opponent assignment', () => {
  it('a mystery match hides one of the four personalities, covering all of them', () => {
    const seen = new Set<RpsBot>();
    for (let i = 0; i < 100; i++) {
      const o = pickOpponent(null, i / 100);
      assert.equal(o.mode, 'mystery');
      assert.ok(RPS_BOTS.includes(o.bot));
      seen.add(o.bot);
    }
    assert.deepEqual([...seen].sort(), [...RPS_BOTS].sort());
    assert.equal(pickOpponent(undefined, 0.999999).bot, 'randomizer');
    assert.equal(pickOpponent('not-a-bot', 0).mode, 'mystery');
  });

  it('a chosen opponent is fixed whatever the random draw', () => {
    for (const bot of RPS_BOTS) {
      for (const u of [0, 0.3, 0.99]) assert.deepEqual(pickOpponent(bot, u), { bot, mode: 'chosen' });
    }
  });

  it('the name stays hidden until the match ends — chosen opponents are always named', () => {
    assert.equal(opponentName('counter', 'mystery', false), MYSTERY_NAME);
    assert.equal(opponentName('counter', 'mystery', true), 'The Counter');
    assert.equal(opponentName('counter', 'chosen', false), 'The Counter');
  });
});

// ── Every difficulty with every personality ─────────────────────────────────

describe('every personality at every difficulty', () => {
  for (const bot of RPS_BOTS) {
    for (const difficulty of DIFFICULTIES) {
      it(`${bot} · ${difficulty}: its rule text and evidence match what the engine plays`, () => {
        assert.ok(RPS_READS[bot][difficulty].length > 10);
        assert.ok(rpsTakeaway(bot, difficulty).length > 10);
        for (let seed = 1; seed <= 40; seed++) {
          const spec = { bot, difficulty, seed };
          const rounds = playMatch(spec, habitPlayer(seed));
          // Outside its noise rounds, the bot's throw is always one the described rule allows.
          rounds.forEach((r, i) => {
            const rule = rpsRuleMoves(bot, difficulty, rounds.slice(0, i));
            if (rule && !noisy(spec, i)) assert.ok(rule.includes(r.b), `${bot}/${difficulty} seed ${seed} round ${i}`);
            assert.equal(r.b, rpsBotMove(spec, rounds.slice(0, i)));
          });
          // The reveal's counts are the real counts, and the verdict follows them.
          const lines = evidence(bot, difficulty, rounds);
          if (bot !== 'randomizer') {
            const fit = ruleFit(bot, difficulty, rounds);
            assert.match(lines[0], new RegExp(`matched that in ${fit.hits} of ${fit.chances} rounds`));
            const strong = lines.includes('The habit showed in most of its throws.');
            assert.equal(strong, fit.hits / fit.chances >= 0.5);
          } else {
            const counts = RPS_MOVES.map((m) => rounds.filter((x) => x.b === m).length);
            assert.equal(lines[0], `Its throws: rock ${counts[0]}, paper ${counts[1]}, scissors ${counts[2]}.`);
            assert.ok(!lines.some((l) => l.includes('The habit showed')));
          }
        }
      });
    }
  }

  it('difficulty changes how well a bot exploits a habit, never the rules or the scoring', () => {
    const always = () => 'rock' as const;
    const botAverage = (bot: RpsBot, d: Difficulty) => {
      let total = 0;
      for (let seed = 1; seed <= 200; seed++) total += rps.totals(playMatch({ bot, difficulty: d, seed }, always)).bot;
      return total / 200;
    };
    assert.ok(botAverage('counter', 'hard') > botAverage('counter', 'easy'));
    assert.ok(botAverage('mind-reader', 'hard') > botAverage('mind-reader', 'easy'));
    for (const d of DIFFICULTIES) {
      const rounds = playMatch({ bot: 'randomizer', difficulty: d, seed: 9 }, always);
      assert.equal(rounds.length, RPS_ROUNDS);
      const t = rps.totals(rounds);
      assert.equal(t.player, rounds.reduce((s, r) => s + (r.r === 1 ? RPS_POINTS.win : r.r === 0 ? RPS_POINTS.tie : RPS_POINTS.loss), 0));
    }
  });
});

// ── Repeat this throw ───────────────────────────────────────────────────────

describe('repeat this throw', () => {
  /** A practice match driven like the board: `play` appends a resolved round. */
  function harness(seed = 3) {
    const spec: MatchSpec<RpsBot> = { bot: 'mind-reader', difficulty: 'hard', seed };
    const rounds: RpsRound[] = [];
    const sent: RpsMove[] = [];
    const repeater = new RepeatThrow();
    const state = (busy = false, error = false) => ({ roundsPlayed: rounds.length, totalRounds: RPS_ROUNDS, busy, done: rounds.length >= RPS_ROUNDS, error });
    /** One timer firing on the board: tick, and play what it releases. */
    const tick = (busy = false, error = false) => {
      const m = repeater.tick(state(busy, error));
      if (m) {
        sent.push(m);
        if (!busy) rounds.push(rps.resolve(spec, rounds, m));
      }
      return m;
    };
    return { spec, rounds, sent, repeater, tick };
  }

  it('submits exactly one move per remaining round, however often it ticks, then disarms', () => {
    const t = harness();
    t.rounds.push(rps.resolve(t.spec, t.rounds, 'paper'));
    t.repeater.start('paper');
    for (let i = 0; i < 100; i++) t.tick();
    assert.equal(t.rounds.length, RPS_ROUNDS);
    assert.equal(t.sent.length, RPS_ROUNDS - 1);
    assert.ok(t.rounds.every((r) => r.p === 'paper'));
    assert.equal(t.repeater.move, null);
    // The bot kept playing by its own logic.
    t.rounds.forEach((r, i) => assert.equal(r.b, rpsBotMove(t.spec, t.rounds.slice(0, i))));
  });

  it('never submits twice for the same round when the round has not moved on', () => {
    const stuck = new RepeatThrow();
    stuck.start('rock');
    const released = Array.from({ length: 5 }, () => stuck.tick({ roundsPlayed: 4, totalRounds: RPS_ROUNDS, busy: false, done: false }));
    assert.deepEqual(released, ['rock', null, null, null, null]);
  });

  it('waits while a round is in flight and stops on a failed round', () => {
    const t = harness();
    t.repeater.start('scissors');
    assert.equal(t.tick(true), null);
    assert.equal(t.sent.length, 0);
    assert.equal(t.tick(), 'scissors');
    assert.equal(t.tick(false, true), null);
    assert.equal(t.repeater.move, null);
    assert.equal(t.sent.length, 1);
  });

  it('cancels cleanly mid-match: nothing more is sent', () => {
    const t = harness();
    t.repeater.start('rock');
    for (let i = 0; i < 4; i++) t.tick();
    t.repeater.cancel();
    for (let i = 0; i < 10; i++) assert.equal(t.tick(), null);
    assert.equal(t.sent.length, 4);
    assert.equal(t.rounds.length, 4);
    assert.equal(t.repeater.move, null);
  });

  it('does nothing in a finished match', () => {
    const t = harness();
    for (let i = 0; i < RPS_ROUNDS; i++) t.rounds.push(rps.resolve(t.spec, t.rounds, 'rock'));
    t.repeater.start('rock');
    assert.equal(t.tick(), null);
    assert.equal(t.sent.length, 0);
  });
});

// ── Read your opponent ──────────────────────────────────────────────────────

describe('read your opponent', () => {
  const at = (roundsPlayed: number, revealed = false) => ({ mode: 'mystery' as const, roundsPlayed, revealed });

  it('opens only in a mystery match, once enough rounds are played, and until the reveal', () => {
    assert.equal(predictionOpen(null, at(RPS_INSIGHT.minRounds - 1)), false);
    assert.equal(predictionOpen(null, at(RPS_INSIGHT.minRounds)), true);
    assert.equal(predictionOpen(null, at(RPS_ROUNDS)), true);
    assert.equal(predictionOpen(null, at(RPS_ROUNDS, true)), false);
    assert.equal(predictionOpen(null, { mode: 'chosen', roundsPlayed: 6, revealed: false }), false);
    assert.equal(lockPrediction(null, 'counter', at(1)), null);
    assert.equal(lockPrediction(null, 'counter', { mode: 'chosen', roundsPlayed: 6, revealed: false }), null);
    assert.equal(lockPrediction(null, 'fair', at(6)), null);
  });

  it('locks on submit: one prediction per match', () => {
    const first = lockPrediction(null, 'counter', at(5));
    assert.deepEqual(first, { guess: 'counter', round: 5 });
    assert.equal(predictionOpen(first, at(6)), false);
    assert.equal(lockPrediction(first, 'repeater', at(6)), first);
    assert.equal(lockPrediction(first, 'repeater', at(RPS_ROUNDS, true)), first);
  });

  it('a quick finish (e.g. repeat mode) pauses before the reveal until the player reads or skips', () => {
    const end = (read: OpponentRead | null, revealed = false) => awaitingRead(read, { ...at(RPS_ROUNDS, revealed), totalRounds: RPS_ROUNDS });
    assert.equal(awaitingRead(null, { ...at(RPS_ROUNDS - 1), totalRounds: RPS_ROUNDS }), false);
    assert.equal(end(null), true);
    // Read after the last round: locks, and the pause ends.
    const late = lockPrediction(null, 'counter', at(RPS_ROUNDS));
    assert.deepEqual(late, { guess: 'counter', round: RPS_ROUNDS });
    assert.equal(end(late), false);
    // Skipped: revealed, and no read can be made any more.
    assert.equal(end(null, true), false);
    assert.equal(lockPrediction(null, 'counter', at(RPS_ROUNDS, true)), null);
    // Chosen opponents never pause.
    assert.equal(awaitingRead(null, { mode: 'chosen', roundsPlayed: RPS_ROUNDS, revealed: false, totalRounds: RPS_ROUNDS }), false);
  });

  it('awards the Insight Points from the scoring config once, for a right read', () => {
    const read: OpponentRead = { guess: 'repeater', round: 4 };
    assert.deepEqual(insightFor(read, 'repeater'), { correct: true, points: RPS_INSIGHT.points });
    assert.equal(RPS_INSIGHT.points, 3);
    assert.equal(insightFor(null, 'repeater'), null);
    // Later attempts to re-read can't add a second bonus: the lock keeps the first read.
    const again = lockPrediction(read, 'repeater', at(8));
    const rounds = playMatch({ bot: 'repeater', difficulty: 'easy', seed: 4 }, habitPlayer(4));
    assert.equal(matchReveal({ bot: 'repeater', difficulty: 'easy', mode: 'mystery', rounds, read: again })!.insight!.points, RPS_INSIGHT.points);
  });

  it('a wrong read earns nothing, explains the miss, and leaves match points alone', () => {
    const spec = { bot: 'counter' as const, difficulty: 'medium' as const, seed: 11 };
    const rounds = playMatch(spec, habitPlayer(11));
    const before = rps.totals(rounds);
    const reveal = matchReveal({ ...spec, mode: 'mystery', rounds, read: { guess: 'repeater', round: 6 } })!;
    assert.deepEqual(reveal.insight, { correct: false, points: 0 });
    assert.deepEqual(reveal.guessFit, ruleFit('repeater', 'medium', rounds));
    assert.deepEqual(rps.totals(rounds), before);
  });
});

// ── The reveal ──────────────────────────────────────────────────────────────

describe('post-game reveal', () => {
  it('appears only once the match has ended', () => {
    const spec = { bot: 'mind-reader' as const, difficulty: 'hard' as const, seed: 5 };
    for (let n = 0; n < RPS_ROUNDS; n++) assert.equal(matchReveal({ ...spec, mode: 'mystery', rounds: playMatch(spec, habitPlayer(5), n), read: null }), null);
    const reveal = matchReveal({ ...spec, mode: 'mystery', rounds: playMatch(spec, habitPlayer(5)), read: null })!;
    assert.equal(reveal.name, 'The Mind Reader');
    assert.equal(reveal.difficulty, 'hard');
    assert.equal(reveal.insight, null);
    assert.ok(reveal.evidence.length > 0);
    assert.equal(reveal.takeaway, rpsTakeaway('mind-reader', 'hard'));
  });
});

// ── Opponent history ────────────────────────────────────────────────────────

describe('opponent history', () => {
  const empty: MyGames = { nickname: null, standing: null, weeks: [], practice: [], matches: [] };

  function fakeRepo(): GamesRepository & { saved: PracticeRecord[] } {
    const saved: PracticeRecord[] = [];
    const no = () => Promise.reject(new Error('unused'));
    return {
      saved,
      overview: no,
      setNickname: no,
      startCompetitionMatch: no,
      startChallengeMatch: no,
      playRound: no,
      getMatch: no,
      weekly: no,
      global: no,
      hallOfFame: no,
      createChallenge: no,
      getChallenge: no,
      recordPractice: async (r) => {
        saved.push(r);
      },
      myGames: async () => ({
        ...empty,
        matches: [{ id: 'm1', kind: 'competition', game: 'rps', bot: 'counter', difficulty: 'hard', playerScore: 20, botScore: 16, outcome: 'win', competitionId: 'w', completedAt: 1_000 }],
      }),
    };
  }

  it('is populated from completed games as they are recorded, newest first, revealed and with the read', async () => {
    let now = 5_000;
    const repo = fakeRepo();
    const store = createGamesStore(repo, () => now);
    await store.getState().loadMine();
    const base = { game: 'rps' as const, difficulty: 'easy' as const, playerScore: 18, botScore: 12, outcome: 'win' as const };
    await store.getState().recordPractice({ ...base, id: 'a', bot: 'repeater', opponent: 'mystery', prediction: 'repeater', insightPoints: 3 });
    now = 6_000;
    await store.getState().recordPractice({ ...base, id: 'b', bot: 'randomizer', opponent: 'chosen', prediction: null, insightPoints: null });
    now = 7_000;
    await store.getState().recordPractice({ ...base, id: 'c', game: 'stag-hunt', bot: 'optimist' });
    const mine = store.getState().mine;
    assert.equal(mine.status, 'ready');
    const items = opponentHistory(mine.status === 'ready' ? mine.data : empty, 'rps');
    assert.deepEqual(
      items.map((h) => [h.bot, h.kind, h.read?.correct ?? null, h.read?.points ?? null]),
      [
        ['randomizer', 'chosen', null, null],
        ['repeater', 'mystery', true, 3],
        ['counter', 'competition', null, null],
      ],
    );
    assert.equal(repo.saved[0].opponent, 'mystery');
  });

  it('marks a missed read and labels older practice logs', () => {
    const items = opponentHistory(
      {
        ...empty,
        practice: [
          { game: 'rps', bot: 'counter', difficulty: 'hard', playerScore: 10, botScore: 20, outcome: 'loss', playedAt: 2, opponent: 'mystery', prediction: 'mind-reader', insightPoints: 0 },
          { game: 'rps', bot: 'counter', difficulty: 'hard', playerScore: 10, botScore: 20, outcome: 'loss', playedAt: 1 },
        ],
      },
      'rps',
    );
    assert.deepEqual(items[0].read, { correct: false, points: 0 });
    assert.equal(items[1].kind, 'practice');
  });

  it('says how long ago', () => {
    const min = 60_000;
    assert.equal(ago(0, 30_000), 'just now');
    assert.equal(ago(0, 5 * min), '5 min ago');
    assert.equal(ago(0, 3 * 60 * min), '3 h ago');
    assert.equal(ago(0, 30 * 60 * min), 'yesterday');
    assert.equal(ago(0, 72 * 60 * min), '3 days ago');
  });
});
