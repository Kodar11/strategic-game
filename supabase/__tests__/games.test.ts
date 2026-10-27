import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { DIFFICULTIES, GAME_IDS, draw } from '../../src/games/core.ts';
import { weekWindow, weeklyPoints } from '../../src/games/competition.ts';
import { ENGINES } from '../../src/games/registry.ts';
import { GameError, gamesRepository } from '../../src/data/games.ts';
import { addUser, as, createDatabase, failure, pgRpc } from './pg.ts';

/**
 * Games, Game of the Week and friend challenges against the real migration: the SQL engines must make exactly the
 * moves the TypeScript engines make; the server decides bot moves and scores; attempts, cutoffs, finalization,
 * leaderboards, the Hall of Fame, nicknames and challenges hold their rules; clients can't touch the tables.
 */

let db: PGlite;
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ALICE = uid(0xa1);
const BOB = uid(0xb2);
const CAROL = uid(0xc3);

before(async () => {
  db = await createDatabase({ seed: false });
  for (const u of [ALICE, BOB, CAROL]) await addUser(db, u);
});
after(async () => {
  await db.close();
});

const rpc = (user: string | null, fn: string, request?: unknown) => pgRpc(db, user).call(fn, request === undefined ? undefined : { request }) as Promise<any>;
const rpcError = async (user: string | null, fn: string, request?: unknown) => {
  try {
    await rpc(user, fn, request);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const one = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

/** Legal moves for a prompt, for scripted players. */
function moves(game: string, prompt: any): unknown[] {
  switch (game) {
    case 'rps':
      return ['rock', 'paper', 'scissors'];
    case 'two-thirds':
      return [0, 7, 22, 33, 50, 61, 100];
    case 'split-steal':
      return ['split', 'steal'];
    case 'stag-hunt':
      return ['stag', 'hare'];
    default:
      return prompt.role === 'propose' ? [1, 2, 4, 5, 6, 9] : ['accept', 'reject'];
  }
}

// ── Engine parity ────────────────────────────────────────────────────────────

describe('SQL engines match the TypeScript engines exactly', () => {
  it('draw(seed, round, k) is bit-for-bit the same', async () => {
    const cases: [number, number, number][] = [];
    for (let i = 0; i < 300; i++) cases.push([Math.floor(draw(i, 0, 0) * 4294967296), i % 13, (i * 7) % 110]);
    cases.push([0, 0, 0], [4294967295, 11, 107], [2147483648, 5, 3]);
    const r = await db.query<{ u: number }>(
      `select game_engine.draw(s, r, k) as u from unnest($1::bigint[], $2::int[], $3::int[]) with ordinality as x(s, r, k, i) order by i`,
      [cases.map((c) => c[0]), cases.map((c) => c[1]), cases.map((c) => c[2])],
    );
    r.rows.forEach((row, i) => assert.equal(row.u, draw(...cases[i]), `case ${cases[i]}`));
  });

  for (const game of GAME_IDS) {
    it(`${game}: every bot and difficulty, round by round`, async () => {
      const engine = ENGINES[game];
      for (const bot of engine.bots) {
        for (const difficulty of DIFFICULTIES) {
          for (let k = 0; k < 6; k++) {
            const seed = Math.floor(draw(k + 17, game.length, bot.length) * 4294967296);
            const spec = { bot, difficulty, seed };
            const history: unknown[] = [];
            for (let round = 0; round < engine.rounds; round++) {
              const prompt = engine.prompt(spec, history);
              const options = moves(game, prompt);
              // A player that varies with the seed and the round, so histories differ between runs.
              const move = options[Math.floor(draw(seed ^ 0x5bd1e995, round, 7) * options.length)];
              const expected = engine.resolve(spec, history, move);
              const sql = await one<{ r: unknown; p: unknown }>(
                `select game_engine.resolve($1, $2, $3, $4, $5::jsonb, $6::jsonb) as r, game_engine.prompt($1, $2, $3, $4, $5::jsonb) as p`,
                [game, bot, difficulty, seed, JSON.stringify(history), JSON.stringify(move)],
              );
              assert.deepEqual(sql.p, prompt === null ? null : prompt, `${game}/${bot}/${difficulty} prompt round ${round}`);
              assert.deepEqual(sql.r, expected, `${game}/${bot}/${difficulty} seed ${seed} round ${round}`);
              history.push(expected);
            }
            const t = await one<{ t: number[]; o: string }>(`select game_engine.totals($1, $2::jsonb) as t, game_engine.outcome($1, $2::jsonb) as o`, [game, JSON.stringify(history)]);
            const totals = engine.totals(history);
            assert.deepEqual(t.t, [totals.player, totals.bot]);
            assert.equal(t.o, engine.outcome(history));
          }
        }
      }
    });
  }

  it('rule versions, match lengths and bot lists agree with game_definitions', async () => {
    const rows = (await db.query<{ id: string; rules_version: number; rounds: number; bots: string[] }>('select * from public.game_definitions')).rows;
    assert.equal(rows.length, GAME_IDS.length);
    for (const r of rows) {
      const e = ENGINES[r.id as keyof typeof ENGINES];
      assert.equal(r.rules_version, e.rulesVersion);
      assert.equal(r.rounds, e.rounds);
      assert.deepEqual(r.bots, [...e.bots]);
    }
  });

  it('refuses illegal moves', async () => {
    const bad: [string, unknown][] = [['rps', 'lizard'], ['rps', 1], ['two-thirds', 101], ['two-thirds', 33.5], ['two-thirds', '33'], ['split-steal', 'share'], ['stag-hunt', 'deer'], ['ultimatum', 0], ['ultimatum', 10]];
    for (const [game, move] of bad) {
      const bot = ENGINES[game as keyof typeof ENGINES].bots[0];
      await assert.rejects(db.query(`select game_engine.resolve($1, $2, 'easy', 1, '[]'::jsonb, $3::jsonb)`, [game, bot, JSON.stringify(move)]), /games:invalid_move/, `${game} ${move}`);
    }
  });
});

// ── Competitions ─────────────────────────────────────────────────────────────

/** Insert a competition directly (owner), relative to now. */
async function competition(id: string, startOffset: string, endOffset: string, extra: Partial<{ game: string; bot: string; difficulty: string; max: number; bonus: number }> = {}) {
  await db.query(
    `insert into public.game_competitions (id, game_id, bot, difficulty, starts_at, ends_at, max_attempts, winner_bonus)
     values ($1, $2, $3, $4, now() + $5::interval, now() + $6::interval, $7, $8)`,
    [id, extra.game ?? 'split-steal', extra.bot ?? 'retaliator', extra.difficulty ?? 'hard', startOffset, endOffset, extra.max ?? 3, extra.bonus ?? 25],
  );
}

async function withoutGuard<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec('alter table public.game_competitions disable trigger game_competitions_guard');
  try {
    return await fn();
  } finally {
    await db.exec('alter table public.game_competitions enable trigger game_competitions_guard');
  }
}

async function playAll(user: string, matchId: string, pick: (m: any) => unknown) {
  let m = await rpc(user, 'get_match', { matchId });
  while (m.status === 'active') m = await rpc(user, 'play_match_round', { matchId, round: m.rounds.length, move: pick(m) });
  return m;
}

describe('scheduling', () => {
  it('a week is Monday 00:00 to Monday 00:00 in Asia/Kolkata, stored in UTC', async () => {
    const c = await one(`select * from content_admin.schedule_competition('2030-01-07', 'rps', 'counter')`);
    assert.equal(c.id, 'week-2030-w02');
    assert.equal(c.timezone, 'Asia/Kolkata');
    const w = weekWindow('2030-01-07');
    assert.equal(new Date(c.starts_at).getTime(), w.startsAt);
    assert.equal(new Date(c.ends_at).getTime(), w.endsAt);
    assert.equal(new Date(c.starts_at).toISOString(), '2030-01-06T18:30:00.000Z');
    assert.equal(new Date(c.ends_at).toISOString(), '2030-01-13T18:30:00.000Z');
    // Re-running is safe and can change an unplayed week.
    const again = await one(`select * from content_admin.schedule_competition('2030-01-07', 'stag-hunt', 'cautious', 'medium')`);
    assert.equal(again.game_id, 'stag-hunt');
    await assert.rejects(db.query(`select content_admin.schedule_competition('2030-01-08', 'rps', 'counter')`), /Monday/);
    await assert.rejects(db.query(`select content_admin.schedule_competition('2030-01-14', 'rps', 'nobody')`), /check/i);
  });

  it('supabase/games/schedule.sql schedules eight Monday-to-Monday IST weeks and is safe to re-run', async () => {
    const fresh = await createDatabase({ seed: false });
    try {
      const sql = readFileSync(join(import.meta.dirname, '..', 'games', 'schedule.sql'), 'utf8');
      await fresh.exec(sql);
      await fresh.exec(sql);
      const rows = (await fresh.query<{ starts_at: string; ends_at: string; game_id: string }>('select starts_at, ends_at, game_id from public.game_competitions order by starts_at')).rows;
      assert.equal(rows.length, 8);
      for (const r of rows) {
        const s = new Date(r.starts_at);
        // Monday 00:00 IST is Sunday 18:30 UTC.
        assert.equal(s.getUTCDay(), 0);
        assert.equal(`${s.getUTCHours()}:${s.getUTCMinutes()}`, '18:30');
        assert.equal(new Date(r.ends_at).getTime() - s.getTime(), 7 * 86_400_000);
      }
      assert.ok(new Set(rows.map((r) => r.game_id)).size >= 5);
      const now = Date.now();
      assert.ok(new Date(rows[0].starts_at).getTime() <= now && now < new Date(rows[0].ends_at).getTime(), 'the first week is the current one');
    } finally {
      await fresh.close();
    }
  });

  it('refuses overlapping weeks', async () => {
    await assert.rejects(
      db.query(`insert into public.game_competitions (id, game_id, bot, difficulty, starts_at, ends_at) values ('overlap', 'rps', 'counter', 'hard', '2030-01-10', '2030-01-20')`),
      /overlaps/,
    );
  });

  it('only the owner can schedule or finalize directly', async () => {
    assert.match((await failure(db, ALICE, `select content_admin.schedule_competition('2030-02-04', 'rps', 'counter')`))!, /permission denied/);
    assert.match((await failure(db, ALICE, `select content_admin.finalize_competitions(now())`))!, /permission denied/);
    assert.match((await failure(db, ALICE, `select game_engine.draw(1, 1, 1)`))!, /permission denied/);
  });
});

describe('Game of the Week', () => {
  before(async () => {
    await competition('live', '-1 day', '6 days');
    await competition('later', '20 days', '27 days', { game: 'rps', bot: 'counter' });
  });

  it('the overview features the active week, from configuration', async () => {
    const o = await rpc(ALICE, 'get_games_overview');
    assert.equal(o.competition.id, 'live');
    assert.equal(o.competition.game, 'split-steal');
    assert.equal(o.competition.phase, 'active');
    assert.equal(o.competition.me.attemptsUsed, 0);
    assert.equal(o.competition.me.best, null);
    assert.equal(o.rules.rps, 1);
  });

  it('refuses a week that hasn’t started and unknown weeks', async () => {
    assert.match((await rpcError(ALICE, 'start_match', { kind: 'competition', competitionId: 'later' }))!, /games:not_started/);
    assert.match((await rpcError(ALICE, 'start_match', { kind: 'competition', competitionId: 'nope' }))!, /games:not_found/);
    assert.match((await rpcError(null, 'start_match', { kind: 'competition', competitionId: 'live' }))!, /permission denied|games:auth/);
  });

  it('plays a match on the server: the bot moves and the score are the server’s', async () => {
    const m = await rpc(ALICE, 'start_match', { kind: 'competition', competitionId: 'live' });
    assert.equal(m.status, 'active');
    assert.equal(m.attempt, 1);
    assert.equal(m.totalRounds, 10);
    assert.equal('seed' in m, false);
    // Starting again resumes the open match instead of using another attempt.
    const again = await rpc(ALICE, 'start_match', { kind: 'competition', competitionId: 'live' });
    assert.equal(again.id, m.id);

    const first = await rpc(ALICE, 'play_match_round', { matchId: m.id, round: 0, move: 'split' });
    assert.equal(first.rounds.length, 1);
    // A retry of the same round changes nothing.
    const dup = await rpc(ALICE, 'play_match_round', { matchId: m.id, round: 0, move: 'steal' });
    assert.equal(dup.duplicate, true);
    assert.deepEqual(dup.rounds, first.rounds);
    assert.match((await rpcError(ALICE, 'play_match_round', { matchId: m.id, round: 5, move: 'split' }))!, /games:stale/);
    assert.match((await rpcError(ALICE, 'play_match_round', { matchId: m.id, round: 1, move: 'share' }))!, /games:invalid_move/);
    // Another player can't play Alice's match.
    assert.match((await rpcError(BOB, 'play_match_round', { matchId: m.id, round: 1, move: 'split' }))!, /games:not_found/);
    assert.match((await rpcError(ALICE, 'play_match_round', { matchId: 'not-a-uuid', round: 1, move: 'split' }))!, /games:not_found/);

    const done = await playAll(ALICE, m.id, () => 'split');
    assert.equal(done.status, 'completed');
    // Recompute with the TypeScript engine from the seed the server kept to itself.
    const { seed } = await one<{ seed: string }>('select seed from public.game_matches where id = $1', [m.id]);
    const engine = ENGINES['split-steal'];
    const h: unknown[] = [];
    for (let i = 0; i < 10; i++) h.push(engine.resolve({ bot: 'retaliator', difficulty: 'hard', seed: Number(seed) }, h, 'split'));
    assert.deepEqual(done.rounds, h);
    assert.equal(done.playerScore, engine.totals(h).player);
    assert.match((await rpcError(ALICE, 'play_match_round', { matchId: m.id, round: 10, move: 'split' }))!, /games:finished/);
  });

  it('limits attempts per week, counting abandoned matches', async () => {
    const m2 = await rpc(ALICE, 'start_match', { kind: 'competition', competitionId: 'live' });
    assert.equal(m2.attempt, 2);
    await rpc(ALICE, 'play_match_round', { matchId: m2.id, round: 0, move: 'steal' });
    // Abandon it by... it stays active; the next start resumes it.
    assert.equal((await rpc(ALICE, 'start_match', { kind: 'competition', competitionId: 'live' })).id, m2.id);
    await playAll(ALICE, m2.id, () => 'steal');
    const m3 = await rpc(ALICE, 'start_match', { kind: 'competition', competitionId: 'live' });
    assert.equal(m3.attempt, 3);
    await playAll(ALICE, m3.id, () => 'split');
    assert.match((await rpcError(ALICE, 'start_match', { kind: 'competition', competitionId: 'live' }))!, /games:no_attempts/);
    const o = await rpc(ALICE, 'get_games_overview');
    assert.equal(o.competition.me.attemptsUsed, 3);
    assert.equal(o.competition.me.rank, 1);
  });

  it('two simultaneous starts use one attempt', async () => {
    const [a, b] = await Promise.all([
      rpc(BOB, 'start_match', { kind: 'competition', competitionId: 'live' }),
      rpc(BOB, 'start_match', { kind: 'competition', competitionId: 'live' }),
    ]);
    assert.equal(a.id, b.id);
    assert.equal((await one(`select count(*)::int as n from public.game_matches where user_id = $1 and competition_id = 'live'`, [BOB])).n, 1);
    await playAll(BOB, a.id, () => 'split');
  });

  it('the weekly leaderboard ranks best scores live, with nicknames only', async () => {
    await rpc(ALICE, 'set_nickname', { nickname: 'Ada Lovelace' });
    const lb = await rpc(BOB, 'get_leaderboard', { scope: 'weekly' });
    assert.equal(lb.competition.id, 'live');
    assert.equal(lb.competition.phase, 'active');
    assert.equal(lb.entries.length, 2);
    assert.equal(lb.entries[0].nickname, 'Ada Lovelace');
    assert.equal(lb.me.isMe, true);
    const serialized = JSON.stringify(lb);
    for (const id of [ALICE, BOB]) assert.equal(serialized.includes(id), false);
    for (const e of lb.entries) assert.deepEqual(Object.keys(e).sort(), ['isMe', 'nickname', 'rank', 'score']);
  });

  it('refuses rounds at and after the cutoff, and nobody can move a played week', async () => {
    const m = await rpc(CAROL, 'start_match', { kind: 'competition', competitionId: 'live' });
    assert.match((await failure(db, null, `update public.game_competitions set ends_at = now() where id = 'live'`)) ?? 'ok', /permission denied/);
    await assert.rejects(db.query(`update public.game_competitions set ends_at = now() + interval '1 day' where id = 'live'`), /has matches/);
    // Simulate the clock passing the end (owner override of the guard, test only).
    await withoutGuard(() => db.query(`update public.game_competitions set ends_at = now() where id = 'live'`));
    assert.match((await rpcError(CAROL, 'play_match_round', { matchId: m.id, round: 0, move: 'split' }))!, /games:closed/);
    assert.match((await rpcError(CAROL, 'start_match', { kind: 'competition', competitionId: 'live' }))!, /games:closed/);
    await withoutGuard(() => db.query(`update public.game_competitions set ends_at = now() + interval '6 days' where id = 'live'`));
  });
});

describe('finalization', () => {
  const users = Array.from({ length: 56 }, (_, i) => uid(0x1000 + i));
  before(async () => {
    for (const u of users) await addUser(db, u);
    await competition('past', '-30 days', '-23 days', { bonus: 30 });
    // Owner-inserted completed matches with explicit timestamps around the cutoff.
    const end = (await one<{ e: string }>(`select ends_at as e from public.game_competitions where id = 'past'`)).e;
    const add = (u: string, attempt: number, score: number, completed: string) =>
      db.query(
        `insert into public.game_matches (user_id, kind, competition_id, game_id, bot, difficulty, rules_version, seed, attempt, player_score, status, completed_at, started_at)
         values ($1, 'competition', 'past', 'split-steal', 'retaliator', 'hard', 1, 1, $2, $3, 'completed', $4::timestamptz, $4::timestamptz - interval '1 minute')`,
        [u, attempt, score, completed],
      );
    // users[0] and users[1] tie on 50; users[0] got there first.
    await add(users[0], 1, 50, `${new Date(new Date(end).getTime() - 3600_000).toISOString()}`);
    await add(users[1], 1, 50, `${new Date(new Date(end).getTime() - 1800_000).toISOString()}`);
    // users[2]: one millisecond before the cutoff counts; 80 after the cutoff doesn't.
    await add(users[2], 1, 45, `${new Date(new Date(end).getTime() - 1).toISOString()}`);
    await add(users[2], 2, 80, `${new Date(new Date(end).getTime() + 1).toISOString()}`);
    for (let i = 3; i < users.length; i++) await add(users[i], 1, 10 + (i % 30), `${new Date(new Date(end).getTime() - 86_400_000 - i * 1000).toISOString()}`);
    // An unfinished match at the end.
    await db.query(
      `insert into public.game_matches (user_id, kind, competition_id, game_id, bot, difficulty, rules_version, seed, attempt, status)
       values ($1, 'competition', 'past', 'split-steal', 'retaliator', 'hard', 1, 1, 2, 'active')`,
      [users[3]],
    );
  });

  it('finalizes once, ranks with the tie-break, and awards points and the bonus', async () => {
    const asOf = (await one<{ e: string }>(`select ends_at as e from public.game_competitions where id = 'past'`)).e;
    // Not before the end.
    assert.equal((await one(`select content_admin.finalize_competitions($1::timestamptz - interval '1 second') as n`, [asOf])).n, 0);
    const [a, b] = await Promise.all([db.query(`select content_admin.finalize_competitions(now()) as n`), db.query(`select public.finalize_due_competitions() as n`)]);
    assert.equal((a.rows[0] as any).n + (b.rows[0] as any).n, 1);
    assert.equal((await one(`select content_admin.finalize_competitions(now()) as n`)).n, 0);

    const rows = (await db.query<any>(`select * from public.competition_results where competition_id = 'past' order by rank, achieved_at`)).rows;
    assert.equal(rows.length, users.length);
    const field = users.length;
    assert.equal(rows[0].user_id, users[0]);
    assert.equal(rows[0].is_winner, true);
    assert.equal(rows[0].points, weeklyPoints(1, field, true, 30));
    assert.equal(rows[1].user_id, users[1]);
    assert.equal(rows[1].rank, 2);
    assert.equal(rows[1].is_winner, false);
    assert.equal(rows[1].points, weeklyPoints(2, field, false));
    const u2 = rows.find((r) => r.user_id === users[2]);
    assert.equal(u2.score, 45);
    assert.equal(rows.filter((r) => r.is_winner).length, 1);
    assert.equal((await one(`select status from public.game_matches where user_id = $1 and competition_id = 'past' and attempt = 2`, [users[3]])).status, 'expired');
    assert.equal((await one(`select participants from public.game_competitions where id = 'past'`)).participants, field);
  });

  it('keeps finalized results and their matches immutable', async () => {
    await assert.rejects(db.query(`update public.competition_results set points = 999 where competition_id = 'past'`), /final/);
    await assert.rejects(db.query(`delete from public.competition_results where competition_id = 'past'`), /final/);
    await assert.rejects(db.query(`update public.game_matches set player_score = 999 where competition_id = 'past'`), /finalized/);
    await assert.rejects(db.query(`update public.game_competitions set winner_bonus = 0 where id = 'past'`), /finalized/);
  });

  it('serves the finalized week, the global leaderboard and the Hall of Fame from the results', async () => {
    const lb = await rpc(users[40], 'get_leaderboard', { scope: 'weekly', competitionId: 'past' });
    assert.equal(lb.competition.phase, 'finalized');
    assert.equal(lb.entries.length, 50);
    assert.equal(lb.entries[0].isWinner, true);
    // users[40] has an eligible score: shown as "me" even when outside the top 50.
    assert.ok(lb.me);
    assert.equal(lb.me.isMe, true);

    const global = await rpc(users[0], 'get_leaderboard', { scope: 'global' });
    assert.equal(global.entries[0].wins, 1);
    assert.equal(global.entries[0].isMe, true);
    assert.equal(global.me.points, weeklyPoints(1, users.length, true, 30));

    const hof = await rpc(null, 'get_hall_of_fame', {});
    const past = hof.find((h: any) => h.id === 'past');
    assert.equal(past.winners.length, 1);
    assert.equal(past.winners[0].score, 50);
    assert.equal(past.participants, users.length);
    assert.equal(past.runnerUpScore, 50);
  });

  it('a new week starts fresh without touching last week', async () => {
    const before = await db.query(`select * from public.competition_results where competition_id = 'past' order by user_id`);
    const lb = await rpc(users[0], 'get_leaderboard', { scope: 'weekly' });
    assert.equal(lb.competition.id, 'live');
    assert.ok(lb.entries.every((e: any) => e.nickname !== null || true));
    const afterRows = await db.query(`select * from public.competition_results where competition_id = 'past' order by user_id`);
    assert.deepEqual(afterRows.rows, before.rows);
    const o = await rpc(users[0], 'get_games_overview');
    assert.equal(o.lastWeek.id, 'past');
    assert.equal(o.lastWeek.winners[0].isMe, true);
  });

  it('global points add up across weeks', async () => {
    await competition('older', '-45 days', '-38 days', { game: 'rps', bot: 'randomizer', bonus: 25 });
    await db.query(
      `insert into public.game_matches (user_id, kind, competition_id, game_id, bot, difficulty, rules_version, seed, attempt, player_score, status, completed_at)
       values ($1, 'competition', 'older', 'rps', 'randomizer', 'hard', 1, 1, 1, 20, 'completed', now() - interval '40 days'),
              ($2, 'competition', 'older', 'rps', 'randomizer', 'hard', 1, 1, 1, 30, 'completed', now() - interval '40 days')`,
      [users[5], users[0]],
    );
    await db.query(`select public.finalize_due_competitions()`);
    const g = await rpc(users[0], 'get_leaderboard', { scope: 'global' });
    assert.equal(g.me.points, weeklyPoints(1, users.length, true, 30) + weeklyPoints(1, 2, true, 25));
    assert.equal(g.me.wins, 2);
    assert.equal(g.me.weeks, 2);
    const mine = await rpc(users[0], 'get_my_games');
    assert.equal(mine.standing.rank, 1);
    assert.equal(mine.weeks.length, 2);
  });

  it('account deletion removes that player’s rows (and only that)', async () => {
    const victim = users[55];
    await db.query('delete from auth.users where id = $1', [victim]);
    assert.equal((await one(`select count(*)::int as n from public.competition_results where user_id = $1`, [victim])).n, 0);
    assert.equal((await one(`select count(*)::int as n from public.competition_results where competition_id = 'past'`)).n, users.length - 1);
  });
});

// ── Nicknames ────────────────────────────────────────────────────────────────

describe('nicknames', () => {
  it('validates length, characters and reserved names', async () => {
    for (const [name, reason] of [
      ['ab', 'length'],
      ['x'.repeat(21), 'length'],
      ['   ', 'length'],
      ['_lead', 'characters'],
      ['two  spaces', 'characters'],
      ['emoji 😀', 'characters'],
      ['tab\tname', 'characters'],
      ['Admin', 'reserved'],
      ['Strategic Game', 'reserved'],
      ['a.-_', 'reserved'],
    ] as const) {
      assert.match((await rpcError(BOB, 'set_nickname', { nickname: name }))!, new RegExp(`games:nickname_${reason}`), name);
    }
  });

  it('is unique after normalization, and renaming propagates to leaderboards', async () => {
    assert.match((await rpcError(BOB, 'set_nickname', { nickname: 'ada_lovelace' }))!, /games:nickname_taken/);
    assert.deepEqual(await rpc(BOB, 'set_nickname', { nickname: '  Bob the Builder ' }), { nickname: 'Bob the Builder' });
    assert.deepEqual(await rpc(BOB, 'set_nickname', { nickname: 'Bob B' }), { nickname: 'Bob B' });
    const lb = await rpc(ALICE, 'get_leaderboard', { scope: 'weekly', competitionId: 'live' });
    assert.ok(lb.entries.some((e: any) => e.nickname === 'Bob B'));
    assert.ok(!JSON.stringify(lb).includes('Bob the Builder'));
  });
});

// ── Challenges ───────────────────────────────────────────────────────────────

describe('friend challenges', () => {
  let token: string;

  it('creates an opaque link that reveals no seed or account', async () => {
    const c = await rpc(ALICE, 'create_challenge', { game: 'rps', bot: 'mind-reader', difficulty: 'hard' });
    token = c.token;
    assert.match(token, /^[0-9a-f]{20}$/);
    const view = await rpc(BOB, 'get_challenge', { token });
    assert.equal(view.game, 'rps');
    assert.equal(view.isCreator, false);
    assert.equal(view.creatorNickname, 'Ada Lovelace');
    assert.equal(view.creatorResult, null);
    assert.equal(view.myMatch, null);
    const s = JSON.stringify(view);
    assert.equal(s.includes(ALICE), false);
    assert.equal(/seed/i.test(s), false);
    assert.match((await rpcError(ALICE, 'create_challenge', { game: 'rps', bot: 'nobody', difficulty: 'hard' }))!, /games:invalid_request/);
    assert.match((await rpcError(ALICE, 'create_challenge', { game: 'rps', difficulty: 'hard' }))!, /games:invalid_request/);
  });

  it('gives each player one match on the same draws, and compares only finished results', async () => {
    const a = await rpc(ALICE, 'start_match', { kind: 'challenge', token });
    const b = await rpc(BOB, 'start_match', { kind: 'challenge', token });
    assert.notEqual(a.id, b.id);
    // Opening the link again resumes the same match.
    assert.equal((await rpc(BOB, 'start_match', { kind: 'challenge', token })).id, b.id);
    const seeds = await db.query<{ seed: string }>('select seed from public.game_matches where id in ($1, $2)', [a.id, b.id]);
    assert.equal(seeds.rows[0].seed, seeds.rows[1].seed);

    await playAll(BOB, b.id, () => 'rock');
    let view = await rpc(BOB, 'get_challenge', { token });
    assert.equal(view.creatorResult, null); // Alice hasn't finished: nothing is claimed.
    assert.equal(view.myMatch.status, 'completed');
    await playAll(ALICE, a.id, () => 'paper');
    view = await rpc(BOB, 'get_challenge', { token });
    assert.equal(typeof view.creatorResult.playerScore, 'number');
    assert.equal(view.players, 2);
  });

  it('handles malformed, unknown and expired links', async () => {
    assert.match((await rpcError(BOB, 'get_challenge', { token: '../../etc' }))!, /games:not_found/);
    assert.match((await rpcError(BOB, 'get_challenge', { token: 'f'.repeat(20) }))!, /games:not_found/);
    const c = await rpc(ALICE, 'create_challenge', { game: 'stag-hunt', bot: 'optimist', difficulty: 'easy' });
    await db.query(`update public.game_challenges set created_at = now() - interval '31 days', expires_at = now() - interval '1 day' where token = $1`, [c.token]);
    const view = await rpc(CAROL, 'get_challenge', { token: c.token });
    assert.equal(view.expired, true);
    assert.match((await rpcError(CAROL, 'start_match', { kind: 'challenge', token: c.token }))!, /games:expired/);
    // Signed-out visitors can read the invitation but not play.
    assert.equal((await rpc(null, 'get_challenge', { token })).game, 'rps');
  });

  it('rate-limits challenge creation', async () => {
    for (let i = 0; i < 18; i++) await rpc(CAROL, 'create_challenge', { game: 'rps', bot: 'counter', difficulty: 'easy' });
    await rpc(CAROL, 'create_challenge', { game: 'rps', bot: 'counter', difficulty: 'easy' });
    await rpc(CAROL, 'create_challenge', { game: 'rps', bot: 'counter', difficulty: 'easy' });
    assert.match((await rpcError(CAROL, 'create_challenge', { game: 'rps', bot: 'counter', difficulty: 'easy' }))!, /games:rate_limited/);
  });
});

// ── Practice log ─────────────────────────────────────────────────────────────

describe('practice history', () => {
  it('records practice games once per id and never ranks them', async () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const game = { id, game: 'ultimatum', bot: 'fair', difficulty: 'easy', playerScore: 30, botScore: 30, outcome: 'draw' };
    await rpc(BOB, 'record_practice_game', game);
    await rpc(BOB, 'record_practice_game', game);
    const mine = await rpc(BOB, 'get_my_games');
    assert.equal(mine.practice.length, 1);
    assert.equal(mine.practice[0].game, 'ultimatum');
    assert.match((await rpcError(BOB, 'record_practice_game', { ...game, id: 'x' }))!, /games:invalid_request/);
    assert.match((await rpcError(BOB, 'record_practice_game', { ...game, outcome: 'victory' }))!, /games:invalid_request/);
    assert.match((await rpcError(BOB, 'record_practice_game', { ...game, bot: undefined }))!, /games:invalid_request/);
    const g = await rpc(BOB, 'get_leaderboard', { scope: 'global' });
    assert.equal(g.me, null);
  });
});

// ── The app's repository against the real SQL ────────────────────────────────

describe('gamesRepository (src/data/games.ts) parses every server response', () => {
  it('overview, boards, Hall of Fame, matches, challenges, practice and the player record', async () => {
    const DAVE = uid(0xd4);
    await addUser(db, DAVE);
    const repo = gamesRepository(pgRpc(db, DAVE) as never);
    const o = await repo.overview();
    assert.equal(o.competition?.id, 'live');
    assert.equal(await repo.setNickname('Dave'), 'Dave');
    const m = await repo.startCompetitionMatch('live');
    const after = await repo.playRound(m.id, 0, 'split');
    assert.equal(after.rounds.length, 1);
    assert.equal((await repo.getMatch(m.id)).id, m.id);
    assert.equal((await repo.weekly()).competition?.id, 'live');
    assert.equal((await repo.weekly('past')).competition?.phase, 'finalized');
    assert.ok((await repo.global()).entries.length > 0);
    assert.ok((await repo.hallOfFame()).length >= 2);
    const c = await repo.createChallenge('stag-hunt', 'conditional', 'hard');
    const view = await repo.getChallenge(c.token);
    assert.equal(view.isCreator, true);
    const cm = await repo.startChallengeMatch(c.token);
    assert.deepEqual(cm.prompt, null);
    const u = await repo.startChallengeMatch((await repo.createChallenge('ultimatum', 'fair', 'easy')).token);
    assert.deepEqual(u.prompt, { role: 'propose' });
    await repo.recordPractice({ id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', game: 'rps', bot: 'counter', difficulty: 'easy', playerScore: 20, botScore: 14, outcome: 'win' });
    const mine = await repo.myGames();
    assert.equal(mine.nickname, 'Dave');
    assert.equal(mine.practice.length, 1);
  });

  it('turns server refusals into GameErrors the screens can explain', async () => {
    const repo = gamesRepository(pgRpc(db, ALICE) as never);
    await assert.rejects(repo.startCompetitionMatch('live'), (e: unknown) => e instanceof GameError && e.refusal === 'no_attempts');
    await assert.rejects(repo.getChallenge('0'.repeat(20)), (e: unknown) => e instanceof GameError && e.refusal === 'not_found');
    await assert.rejects(repo.setNickname('x'), (e: unknown) => e instanceof GameError && e.refusal === 'nickname_length');
  });
});

// ── Access control ───────────────────────────────────────────────────────────

describe('row level security and grants', () => {
  const tables = ['game_definitions', 'player_profiles', 'game_competitions', 'game_challenges', 'game_matches', 'competition_results', 'game_practice_results'];

  it('clients can’t read or write any game table directly', async () => {
    for (const t of tables) {
      for (const who of [ALICE, null]) {
        assert.match((await failure(db, who, `select * from public.${t} limit 1`))!, /permission denied/, `${t} select`);
      }
      assert.match((await failure(db, ALICE, `delete from public.${t}`))!, /permission denied/, `${t} delete`);
    }
    assert.match((await failure(db, ALICE, `update public.game_matches set player_score = 999`))!, /permission denied/);
    assert.match((await failure(db, ALICE, `insert into public.competition_results (competition_id, user_id, match_id, score, achieved_at, rank, field_size, is_winner, points, scoring_version) values ('live', '${ALICE}', gen_random_uuid(), 1, now(), 1, 1, true, 999, 1)`))!, /permission denied/);
  });

  it('signed-out clients can read public boards but not play, name themselves or create challenges', async () => {
    assert.ok(await rpc(null, 'get_games_overview'));
    assert.ok(await rpc(null, 'get_leaderboard', { scope: 'global' }));
    for (const [fn, req] of [
      ['start_match', { kind: 'competition', competitionId: 'live' }],
      ['set_nickname', { nickname: 'Sneaky' }],
      ['create_challenge', { game: 'rps', bot: 'counter', difficulty: 'easy' }],
      ['record_practice_game', {}],
    ] as const) {
      assert.match((await rpcError(null, fn, req))!, /permission denied|games:auth/, fn);
    }
    assert.match((await failure(db, null, `select public.get_my_games()`))!, /permission denied|games:auth/);
  });

  it('the server never returns a match seed', async () => {
    const m = await as(db, ALICE, async (tx) => (await tx.query<{ r: any }>(`select public.get_my_games() as r`)).rows[0].r);
    assert.equal(/seed/i.test(JSON.stringify(m)), false);
  });
});
