import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { ARENA_IDS, type ArenaGameId } from '../../src/arena/core.ts';
import { ARENA_ENGINES } from '../../src/arena/registry.ts';
import { type ArenaStore, handleArenaRequest } from '../../src/competition/arena-handler.ts';
import { configProblem, replay } from '../../src/competition/arena-match.ts';
import { PRIVATE_FIELDS } from '../../src/competition/arena-views.ts';
import { arenaCompetitionScore } from '../../src/competition/scoring.ts';
import { clientMove } from '../../src/competition/__tests__/client-moves.ts';
import { GAME_IDS } from '../../src/games/core.ts';
import { ENGINES } from '../../src/games/registry.ts';
import { addUser, createDatabase, failure, pgRpc } from './pg.ts';

/**
 * Game of the Week v2 against the real migrations: all 23 games eligible, automatic rotation, manual scheduling from
 * the SQL Editor (Gambit included), locks and audit, three ranked attempts with the best counting, server-run Arena
 * matches through the arena-match handler for every one of the 18 Arena games (seed and hidden information never
 * sent, illegal and duplicate actions refused, results persisted), the grace period, tie-breaks, champions and
 * history, and the client's lack of access to any of it.
 */

let db: PGlite;
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const P = Array.from({ length: 8 }, (_, i) => uid(0x900 + i));

before(async () => {
  db = await createDatabase({ seed: false });
  for (const u of P) await addUser(db, u);
  await db.query('update public.competition_settings set arena_server_enabled = true');
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
const rows = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

/** The arena-match Edge Function's store, over this database as the service role (what the function uses). */
function serviceStore(): ArenaStore {
  const asService = async <T>(sql: string, params: unknown[]) =>
    db.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      return (await tx.query<{ r: T }>(sql, params)).rows[0].r;
    });
  return {
    load: (matchId, userId) => asService('select public.arena_match_load($1::uuid, $2::uuid) as r', [matchId, userId]) as never,
    commit: (r) =>
      asService('select public.arena_match_commit($1::uuid, $2::uuid, $3::int, $4::jsonb, $5::jsonb) as r', [r.matchId, r.userId, r.step, JSON.stringify(r.action), r.final ? JSON.stringify(r.final) : null]) as never,
  };
}
const store = serviceStore();
const arena = (user: string, body: unknown) => handleArenaRequest(user, body, store);

/** A competition running now (or offset), inserted directly as the owner. */
async function competition(id: string, game: string, config: Record<string, unknown>, start = '-1 hour', end = '6 days', grace = 0) {
  await clearAroundNow();
  await db.query(
    `insert into public.game_competitions (id, game_id, bot, difficulty, starts_at, ends_at, config, scoring_version, grace_seconds)
     values ($1, $2, coalesce($3::jsonb ->> 'opponent', $3::jsonb ->> 'bot'), coalesce($3::jsonb ->> 'level', $3::jsonb ->> 'difficulty'), now() + $4::interval, now() + $5::interval, $3::jsonb, 2, $6)`,
    [id, game, JSON.stringify(config), start, end, grace],
  );
}
const cancel = (id: string) => db.query(`select content_admin.cancel_competition($1, 'test cleanup')`, [id]);
/** Cancel whatever is scheduled around now — e.g. the week the overview's lazy recovery created. */
const clearAroundNow = () =>
  db.query(`select content_admin.cancel_competition(id, 'test cleanup') from public.game_competitions
            where status = 'scheduled' and finalized_at is null and starts_at < now() + interval '8 days' and ends_at > now() - interval '8 days'`);

/** Play one ranked Arena match to the end through the handler, deciding from the redacted view only. */
async function playArena(user: string, game: ArenaGameId, matchId: string, shift = 0) {
  let r = await arena(user, { op: 'get', matchId });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  let v = r.body as any;
  let k = shift;
  while (!v.over) {
    assert.equal(v.state.setup.seed, 0, `${game}: the seed is never sent`);
    for (const f of PRIVATE_FIELDS[game] ?? []) assert.ok(v.state[f] === -1 || JSON.stringify(v.state[f]) === '[-1,-1]', `${game}: ${f} is masked`);
    r = await arena(user, { op: 'move', matchId, step: v.step, action: clientMove(game, v.state, k++) });
    assert.equal(r.status, 200, `${game}: ${JSON.stringify(r.body)}`);
    v = r.body;
    if (k > 400) throw new Error(`${game}: did not finish`);
  }
  return v;
}

// ── The 23 games ─────────────────────────────────────────────────────────────

describe('all 23 games are eligible', () => {
  it('game_definitions lists the 5 SQL-engine games and the 18 Arena games, matching their engines', async () => {
    const defs = await rows<{ id: string; engine: string; bots: string[]; variants: string[]; rounds: number; competition_ready: boolean }>('select * from public.game_definitions');
    assert.equal(defs.length, 23);
    assert.deepEqual(defs.filter((d) => d.engine === 'sql').map((d) => d.id).sort(), [...GAME_IDS].sort());
    for (const id of ARENA_IDS) {
      const d = defs.find((x) => x.id === id)!;
      const e = ARENA_ENGINES[id];
      assert.equal(d.engine, 'arena', id);
      assert.deepEqual(d.bots, [...e.opponents], `${id} opponents`);
      assert.deepEqual(d.variants, [...e.variants], `${id} variants`);
      assert.equal(d.rounds, e.rounds('standard'), `${id} rounds`);
      assert.equal(d.competition_ready, true);
    }
    const sqlBots = await rows<{ id: string; b: string[] }>(`select id, game_engine.bots(id) as b from public.game_definitions`);
    for (const r of sqlBots) assert.ok(r.b?.length === 4, `${r.id}: game_engine.bots`);
    for (const g of GAME_IDS) assert.deepEqual(sqlBots.find((r) => r.id === g)!.b, [...ENGINES[g].bots]);
  });

  it('every game has a valid fixed competition configuration, by the SQL and the TypeScript rules alike', async () => {
    const cfgs = await rows<{ game_id: string; config: Record<string, unknown> }>('select * from public.competition_game_configs');
    assert.equal(cfgs.length, 23);
    for (const c of cfgs) {
      assert.equal((await one('select game_engine.config_problem($1, $2::jsonb) as p', [c.game_id, JSON.stringify(c.config)])).p, null, c.game_id);
      if ((ARENA_IDS as readonly string[]).includes(c.game_id)) assert.equal(configProblem(c.game_id, c.config), null, c.game_id);
    }
    assert.match((await one(`select game_engine.config_problem('gambit', '{"opponent": "nobody", "level": "hard", "variant": "standard", "length": "short"}') as p`)).p, /opponent/);
    assert.match((await one(`select game_engine.config_problem('rps', '{"bot": "counter", "difficulty": "normal"}') as p`)).p, /difficulty/);
    assert.equal(configProblem('gambit', { opponent: 'nobody', level: 'hard', variant: 'standard', length: 'short' })?.includes('opponent'), true);
  });

  it('every game is featurable, and the SQL Editor overview says so', async () => {
    const g = await rows<{ game_id: string; featurable_now: boolean }>('select * from content_admin.weekly_games');
    assert.equal(g.length, 23);
    assert.ok(g.every((x) => x.featurable_now));
  });
});

// ── Rotation and manual scheduling ───────────────────────────────────────────

describe('scheduling', () => {
  it('rotates through all 23 games without repeating a game in consecutive weeks', async () => {
    const fresh = await createDatabase({ seed: false });
    try {
      await fresh.query('update public.competition_settings set arena_server_enabled = true');
      // Plan 40 weeks, starting 2031-01-06 (a Monday), one week at a time as the scheduler would.
      for (let i = 0; i < 40; i++) await fresh.query(`select content_admin.ensure_competitions(('2031-01-06'::date + 7 * $1::int)::timestamp at time zone 'Asia/Kolkata' + interval '1 hour', 0)`, [i]);
      const weeks = (await fresh.query<{ game_id: string; source: string; number: number }>(`select game_id, source, number from public.game_competitions order by starts_at`)).rows;
      assert.equal(weeks.length, 40);
      assert.ok(weeks.every((w) => w.source === 'automatic'));
      for (let i = 1; i < weeks.length; i++) assert.notEqual(weeks[i].game_id, weeks[i - 1].game_id, `week ${i}`);
      assert.equal(new Set(weeks.slice(0, 23).map((w) => w.game_id)).size, 23, 'every game in the first 23 weeks');
      assert.deepEqual(weeks.map((w) => w.number), weeks.map((_, i) => i + 1));
      // Re-running changes nothing.
      assert.equal((await fresh.query<{ n: number }>(`select content_admin.ensure_competitions(('2031-01-06'::date)::timestamp at time zone 'Asia/Kolkata' + interval '1 hour', 5) as n`)).rows[0].n, 0);
    } finally {
      await fresh.close();
    }
  });

  it('without the Edge Function enabled, only the five SQL games rotate and Arena games are refused', async () => {
    const fresh = await createDatabase({ seed: false });
    try {
      await fresh.query(`select content_admin.ensure_competitions(now(), 6)`);
      const games = (await fresh.query<{ game_id: string }>('select game_id from public.game_competitions')).rows.map((r) => r.game_id);
      assert.ok(games.length === 7 && games.every((g) => (GAME_IDS as readonly string[]).includes(g)));
      await assert.rejects(fresh.query(`select content_admin.schedule_game_of_the_week('gambit', '2035-01-01')`), /arena_server_enabled/);
    } finally {
      await fresh.close();
    }
  });

  it('schedules Gambit for a future week from the SQL Editor, overriding the automatic pick, with an audit trail', async () => {
    const ws = '2034-01-02'; // a Monday
    await db.query(`select content_admin.ensure_competitions($1::timestamp at time zone 'Asia/Kolkata' + interval '1 hour', 0)`, [ws]);
    const auto = await one(`select * from public.game_competitions where id = 'week-2034-w01'`);
    assert.equal(auto.source, 'automatic');
    const pickGame = auto.game_id === 'gambit' ? 'mole' : 'gambit';
    const c = await one(`select * from content_admin.schedule_game_of_the_week(p_game_id => $1, p_week_start => $2)`, [pickGame, ws]);
    assert.equal(c.game_id, pickGame);
    assert.equal(c.source, 'manual');
    assert.equal(c.id, 'week-2034-w01');
    assert.deepEqual(c.config, (await one('select config from public.competition_game_configs where game_id = $1', [pickGame])).config);
    // A second manual choice for the same week needs an explicit replace.
    await assert.rejects(db.query(`select content_admin.schedule_game_of_the_week('rps', $1)`, [ws]), /already scheduled.*p_replace/);
    const r = await one(`select * from content_admin.schedule_game_of_the_week(p_game_id => 'gambit', p_week_start => $1, p_level => 'hard', p_length => 'short', p_replace => true, p_note => 'launch week')`, [ws]);
    assert.deepEqual(r.config, { opponent: 'adaptive', level: 'hard', variant: 'standard', length: 'short' });
    assert.equal(r.difficulty, 'hard');
    const audit = await rows(`select action, source, note from public.competition_schedule_audit where competition_id = 'week-2034-w01' order by seq`);
    assert.deepEqual(audit.map((a) => a.action), ['created', 'replaced', 'replaced']);
    assert.equal(audit[2].note, 'launch week');
    await assert.rejects(db.query(`update public.competition_schedule_audit set note = 'x'`), /append-only/);
    // The automatic scheduler never overwrites it.
    await db.query(`select content_admin.ensure_competitions($1::timestamp at time zone 'Asia/Kolkata' + interval '1 hour', 0)`, [ws]);
    assert.equal((await one(`select game_id from public.game_competitions where id = 'week-2034-w01'`)).game_id, 'gambit');
  });

  it('refuses invalid manual schedules with clear errors', async () => {
    await assert.rejects(db.query(`select content_admin.schedule_game_of_the_week('chess', '2034-02-06')`), /not a game/);
    await assert.rejects(db.query(`select content_admin.schedule_game_of_the_week('gambit', '2034-02-07')`), /Monday/);
    await assert.rejects(db.query(`select content_admin.schedule_game_of_the_week('gambit', '2034-02-06', p_opponent => 'grandmaster')`), /opponent must be one of/);
    await assert.rejects(db.query(`select content_admin.schedule_game_of_the_week('rps', '2034-02-06', p_variant => 'fog')`), /no variants/);
    await assert.rejects(db.query(`select content_admin.schedule_game_of_the_week('gambit', '2020-01-06')`), /has started|overlaps/);
  });

  it('locks a week once it starts, even before anyone plays; only the audited correction can extend it', async () => {
    await competition('lock-test', 'travelers', { opponent: 'adaptive', level: 'normal', variant: 'standard', length: 'standard' });
    await assert.rejects(db.query(`update public.game_competitions set config = '{"opponent": "purist", "level": "easy", "variant": "standard", "length": "short"}' where id = 'lock-test'`), /has started/);
    await assert.rejects(db.query(`update public.game_competitions set max_attempts = 9 where id = 'lock-test'`), /has started/);
    const corrected = await one(`select * from content_admin.correct_competition('lock-test', 'outage on Tuesday', now() + interval '7 days', 4)`);
    assert.equal(corrected.max_attempts, 4);
    await assert.rejects(db.query(`select content_admin.correct_competition('lock-test', 'lower it', null, 2)`), /only go up/);
    await cancel('lock-test');
    const audit = await rows(`select action from public.competition_schedule_audit where competition_id = 'lock-test' order by seq`);
    assert.deepEqual(audit.map((a) => a.action), ['corrected', 'cancelled']);
  });

  it('only the owner can schedule; clients can’t touch schedules, configs, audit or champions', async () => {
    for (const sql of [
      `select content_admin.schedule_game_of_the_week('gambit', '2034-03-06')`,
      `select content_admin.ensure_competitions(now(), 1)`,
      `select content_admin.cancel_competition('x', 'because')`,
      `select content_admin.run_scheduled_jobs()`,
      `select * from public.competition_game_configs`,
      `select * from public.competition_schedule_audit`,
      `select * from public.weekly_champions`,
      `select * from public.competition_settings`,
      `update public.competition_settings set arena_server_enabled = false`,
      `insert into public.weekly_champions (competition_id, user_id, competition_number, game_id, score, shared, decided_by, field_size, starts_at, ends_at, scoring_version, rules_version, config) values ('x', '${P[0]}', 1, 'rps', 1, false, 'score', 1, now(), now(), 2, 1, '{}')`,
      `select public.arena_match_load('${P[0]}', '${P[0]}')`,
      `select public.arena_match_commit('${P[0]}', '${P[0]}', 0, '1', null)`,
    ]) {
      for (const who of [null, P[0]]) assert.match((await failure(db, who, sql)) ?? 'allowed', /permission denied/, `${who ?? 'anon'}: ${sql}`);
    }
  });
});

// ── Ranked Arena matches, game by game ───────────────────────────────────────

describe('server-run Arena matches in a weekly competition', () => {
  for (const game of ARENA_IDS) {
    it(`${game}: three ranked matches, server-validated, best counts, seed and hidden state protected`, async () => {
      const cfg = (await one('select config from public.competition_game_configs where game_id = $1', [game])).config;
      const cid = `arena-${game}`;
      await competition(cid, game, cfg);
      const [me, rival] = [P[0], P[1]];
      const scores: number[] = [];
      for (let attempt = 1; attempt <= 3; attempt++) {
        const m = await rpc(me, 'start_match', { kind: 'competition', competitionId: cid });
        assert.equal(m.engine, 'arena');
        assert.equal(m.attempt, attempt);
        assert.equal('seed' in m, false);
        assert.deepEqual(m.config, cfg, 'the competition configuration, the same for everyone');
        // Starting again resumes the open match rather than using an attempt.
        assert.equal((await rpc(me, 'start_match', { kind: 'competition', competitionId: cid })).id, m.id);
        // Not playable through the SQL round function, and not by anyone else.
        assert.match((await rpcError(me, 'play_match_round', { matchId: m.id, round: 0, move: 'x' }))!, /games:invalid_request/);
        assert.equal((await arena(rival, { op: 'get', matchId: m.id })).status, 404);

        // An illegal action is refused and changes nothing; a malformed one too.
        const bad = await arena(me, { op: 'move', matchId: m.id, step: 0, action: { nonsense: true } });
        assert.equal(bad.status, 422, JSON.stringify(bad.body));
        assert.equal((await arena(me, { op: 'move', matchId: m.id, step: 5, action: 1 })).status, 409, 'a step ahead of the match is stale');

        const v = await playArena(me, game, m.id, attempt * 3);
        assert.equal(v.status, 'completed');
        assert.ok(v.final && v.final.result && v.final.debrief, 'the server computed the result and debrief');
        // The full state (hidden information, seed) only once the match is over.
        const row = await one('select * from public.game_matches where id = $1', [m.id]);
        assert.equal(v.state.setup.seed, Number(row.seed));
        const full = replay(game, cfg, Number(row.seed), row.actions);
        const expected = arenaCompetitionScore(game, full, ARENA_ENGINES[game].result(full));
        assert.equal(row.status, 'completed');
        assert.equal(row.score, expected.score, 'the stored score is the one the server recomputes from the action log');
        assert.equal(row.secondary, expected.secondary);
        assert.equal(row.outcome, expected.outcome);
        scores.push(row.score);
        assert.equal(v.standing.attemptsUsed, attempt);
        assert.equal(v.standing.best, Math.max(...scores));
        // A replayed final action is a duplicate, not a new move.
        const dup = await arena(me, { op: 'move', matchId: m.id, step: v.step - 1, action: row.actions[row.actions.length - 1] });
        assert.equal(dup.status, 200);
        assert.equal((dup.body as any).duplicate, true);
        assert.equal((await one('select jsonb_array_length(actions) as n from public.game_matches where id = $1', [m.id])).n, row.actions.length);
        assert.equal((await arena(me, { op: 'move', matchId: m.id, step: v.step, action: row.actions[0] })).status, 409, 'nothing after the end');
      }
      assert.match((await rpcError(me, 'start_match', { kind: 'competition', competitionId: cid }))!, /games:no_attempts/);

      // The rival plays once; the leaderboard ranks best scores, nicknames only.
      const rm = await rpc(rival, 'start_match', { kind: 'competition', competitionId: cid });
      await playArena(rival, game, rm.id, 1);
      const lb = await rpc(me, 'get_leaderboard', { scope: 'weekly', competitionId: cid });
      assert.equal(lb.entries.length, 2);
      assert.equal(lb.me.score, Math.max(...scores));
      assert.equal(lb.me.attemptsUsed, 3);
      assert.equal(JSON.stringify(lb).includes(me), false);
      await cancel(cid);
    });
  }
});

describe('server-run classic matches in a weekly competition', () => {
  const moveFor = (game: string, prompt: any, k: number): unknown => {
    switch (game) {
      case 'rps':
        return ['rock', 'paper', 'scissors'][k % 3];
      case 'two-thirds':
        return [22, 33, 15][k % 3];
      case 'split-steal':
        return k % 4 ? 'split' : 'steal';
      case 'stag-hunt':
        return k % 3 ? 'stag' : 'hare';
      default:
        return prompt?.role === 'respond' ? (k % 2 ? 'accept' : 'reject') : 5;
    }
  };
  for (const game of GAME_IDS) {
    it(`${game}: ranked matches count their official score; the best of three ranks`, async () => {
      const cfg = (await one('select config from public.competition_game_configs where game_id = $1', [game])).config;
      const cid = `classic-${game}`;
      await competition(cid, game, cfg);
      const best: number[] = [];
      for (let attempt = 1; attempt <= 3; attempt++) {
        let m = await rpc(P[2], 'start_match', { kind: 'competition', competitionId: cid });
        assert.equal(m.engine, 'sql');
        let k = attempt;
        while (m.status === 'active') m = await rpc(P[2], 'play_match_round', { matchId: m.id, round: m.rounds.length, move: moveFor(game, m.prompt, k++) });
        assert.equal(m.score, m.playerScore);
        assert.equal(m.standing.attemptsUsed, attempt);
        best.push(m.score);
        assert.equal(m.standing.best, Math.max(...best));
      }
      const lb = await rpc(P[2], 'get_leaderboard', { scope: 'weekly', competitionId: cid });
      assert.equal(lb.me.score, Math.max(...best));
      await cancel(cid);
    });
  }
});

// ── Interruption, grace and finalization ─────────────────────────────────────

describe('lifecycle', () => {
  it('resumes an interrupted Arena match exactly where it was, on any device', async () => {
    await competition('resume', 'liars-dice', { opponent: 'calculator', level: 'normal', variant: 'standard', length: 'standard' });
    const m = await rpc(P[3], 'start_match', { kind: 'competition', competitionId: 'resume' });
    const first = (await arena(P[3], { op: 'get', matchId: m.id })).body as any;
    const after1 = (await arena(P[3], { op: 'move', matchId: m.id, step: 0, action: clientMove('liars-dice', first.state, 0) })).body as any;
    // "App restart": a fresh get returns the same view; start_match resumes the same match.
    const { standing: _s, ...expected } = after1;
    assert.deepEqual((await arena(P[3], { op: 'get', matchId: m.id })).body, expected);
    assert.equal((await rpc(P[3], 'start_match', { kind: 'competition', competitionId: 'resume' })).id, m.id);
    const o = await rpc(P[3], 'get_games_overview');
    assert.ok(o.competition === null || typeof o.competition === 'object');
    await cancel('resume');
    // Cancelled: the open match expired; no more moves.
    const closed = await arena(P[3], { op: 'move', matchId: m.id, step: 1, action: clientMove('liars-dice', after1.state, 1) });
    assert.equal(closed.status, 409);
  });

  it('a match in progress at the end can finish within the grace period; then the week finalizes with champions', async () => {
    await clearAroundNow();
    // Ends in 2 seconds, with a 3-second grace period.
    await competition('grace', 'travelers', { opponent: 'purist', level: 'easy', variant: 'standard', length: 'short' }, '-1 hour', '2 seconds', 3);
    const a = await rpc(P[4], 'start_match', { kind: 'competition', competitionId: 'grace' });
    const b = await rpc(P[5], 'start_match', { kind: 'competition', competitionId: 'grace' });
    await new Promise((r) => setTimeout(r, 2100));
    assert.match((await rpcError(P[6], 'start_match', { kind: 'competition', competitionId: 'grace' }))!, /games:closed/, 'no new ranked match after the end');
    assert.equal((await rpc(P[4], 'get_leaderboard', { scope: 'weekly', competitionId: 'grace' })).competition.state, 'finalizing');
    const va = await playArena(P[4], 'travelers', a.id); // finishes during the grace period
    assert.equal(va.status, 'completed');
    assert.equal(await db.query('select public.finalize_due_competitions()').then((r) => (r.rows[0] as any).finalize_due_competitions), 0, 'not finalized during the grace period');
    await new Promise((r) => setTimeout(r, 3100));
    const late = await arena(P[5], { op: 'move', matchId: b.id, step: 0, action: 20 });
    assert.equal(late.status, 409, 'after the deadline, an open match is closed');
    await db.query('select content_admin.run_scheduled_jobs()');
    const c = await one(`select * from public.game_competitions where id = 'grace'`);
    assert.ok(c.finalized_at);
    assert.equal((await one('select status from public.game_matches where id = $1', [b.id])).status, 'expired');
    const champs = await rows(`select * from public.weekly_champions where competition_id = 'grace'`);
    assert.equal(champs.length, 1);
    assert.equal(champs[0].user_id, P[4]);
    assert.equal(champs[0].decided_by, 'unopposed');
    assert.equal(champs[0].competition_number, c.number);
    assert.deepEqual(champs[0].config, c.config);
    // Permanent.
    await assert.rejects(db.query(`update public.weekly_champions set score = 0 where competition_id = 'grace'`), /final/);
    await assert.rejects(db.query(`update public.game_competitions set max_attempts = 9 where id = 'grace'`), /finalized/);
    const run = await rows(`select step, ok from content_admin.scheduler_runs order by id desc limit 3`);
    assert.deepEqual(run.map((r) => r.step).sort(), ['daily', 'finalize', 'weekly']);
  });

  it('ties: the game’s tie-break first, then earliest; still tied → a shared championship', async () => {
    await clearAroundNow();
    await competition('ties', 'mole', { opponent: 'deceiver', level: 'normal', variant: 'standard', length: 'standard' }, '-3 days', '-2 days');
    const ins = (user: string, score: number, secondary: number | null, ago: string) =>
      db.query(
        `insert into public.game_matches (user_id, kind, competition_id, game_id, bot, difficulty, rules_version, seed, attempt, config, status, score, secondary, completed_at, started_at, outcome, score_label)
         values ($1, 'competition', 'ties', 'mole', 'deceiver', 'normal', 1, 1, 1, '{"opponent": "deceiver", "level": "normal", "variant": "standard", "length": "standard"}', 'completed', $2::int, $3::int, now() - $4::interval, now() - interval '3 days', 'win', $2::int || ' case points')`,
        [user, score, secondary, ago],
      );
    await ins(P[0], 10, 80, '50 hours'); // best tie-break: champion outright on secondary
    await ins(P[1], 10, 60, '60 hours');
    await ins(P[2], 0, 40, '61 hours');
    await db.query('select public.finalize_due_competitions()');
    const res = await rows(`select user_id, rank, is_winner from public.competition_results where competition_id = 'ties' order by rank`);
    assert.deepEqual(res.map((r) => [r.user_id, r.rank]), [[P[0], 1], [P[1], 2], [P[2], 3]]);
    const ch = await rows(`select * from public.weekly_champions where competition_id = 'ties'`);
    assert.deepEqual(ch.map((c) => [c.user_id, c.decided_by, c.shared]), [[P[0], 'secondary', false]]);

    await clearAroundNow();
    await competition('shared', 'mole', { opponent: 'deceiver', level: 'normal', variant: 'standard', length: 'standard' }, '-5 days', '-4 days');
    const same = `now() - interval '100 hours'`;
    for (const u of [P[3], P[4]]) {
      await db.query(
        `insert into public.game_matches (user_id, kind, competition_id, game_id, bot, difficulty, rules_version, seed, attempt, config, status, score, secondary, completed_at, started_at, outcome)
         values ($1, 'competition', 'shared', 'mole', 'deceiver', 'normal', 1, 1, 1, '{"opponent": "deceiver", "level": "normal", "variant": "standard", "length": "standard"}', 'completed', 10, 70, ${same}, now() - interval '5 days', 'win')`,
        [u],
      );
    }
    // Identical timestamps need one statement time: fix both to the same instant.
    await db.exec(`alter table public.game_matches disable trigger game_matches_guard`);
    await db.query(`update public.game_matches set completed_at = (select min(completed_at) from public.game_matches where competition_id = 'shared') where competition_id = 'shared'`);
    await db.exec(`alter table public.game_matches enable trigger game_matches_guard`);
    await db.query('select public.finalize_due_competitions()');
    const sh = await rows(`select user_id, shared, decided_by from public.weekly_champions where competition_id = 'shared' order by user_id`);
    assert.equal(sh.length, 2);
    assert.ok(sh.every((c) => c.shared && c.decided_by === 'shared'));
  });

  it('history: past competitions, champions and the all-time board, read-only and paginated', async () => {
    const h = await rpc(null, 'get_competition_history', { limit: 2 });
    assert.equal(h.items.length, 2);
    assert.ok(h.next);
    const more = await rpc(null, 'get_competition_history', { limit: 2, before: h.next });
    assert.ok(more.items.every((x: any) => x.endsAt < h.next));
    const ties = await rpc(P[0], 'get_competition', { competitionId: 'ties' });
    assert.equal(ties.competition.state, 'completed');
    assert.equal(ties.champions.length, 1);
    assert.equal(ties.champions[0].isMe, true);
    assert.equal(ties.entries.length, 3);
    assert.equal(ties.me.rank, 1);
    const board = await rpc(null, 'get_champions_leaderboard');
    assert.ok(board.entries.length >= 3);
    assert.ok(board.entries.every((e: any) => e.titles >= 1 && !('userId' in e)));
    const fame = await rpc(null, 'get_hall_of_fame');
    assert.ok(fame.some((w: any) => w.id === 'shared' && w.winners.length === 2));
    const serialized = JSON.stringify([h, more, ties, board, fame]);
    for (const u of P) assert.equal(serialized.includes(u), false, 'no user ids in public boards');
  });
});
