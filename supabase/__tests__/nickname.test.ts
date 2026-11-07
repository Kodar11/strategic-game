/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { addUser, createDatabase, pgRpc } from './pg.ts';

/** set_nickname's impersonation and offensive-name rules, against the real migrations. */

let db: PGlite;
const USER = '00000000-0000-4000-8000-00000000c0de';

before(async () => {
  db = await createDatabase({ seed: false });
  await addUser(db, USER);
});

after(async () => {
  await db.close();
});

/** One set_nickname call as `user`: 'ok', or the refusal reason ('nickname_taken', …). Refusals are returned as data. */
const attempt = (user: string, nickname: string) =>
  pgRpc(db, user)
    .call('set_nickname', { request: { nickname } })
    .then(
      (r) => {
        const refused = (r as { refused?: string }).refused;
        return refused ? (/games:(nickname_[a-z_]+)/.exec(refused)?.[1] ?? refused) : 'ok';
      },
      (e: Error) => /games:(nickname_[a-z_]+)/.exec(e.message)?.[1] ?? e.message,
    );

/** For the name-rule tests: each call starts with a clean rate-limit history, so only the name decides. */
const set = async (nickname: string) => {
  await db.query('delete from game_engine.nickname_attempts where user_id = $1', [USER]);
  return attempt(USER, nickname);
};

/** Moves every recorded attempt of `user` back in time, as if the clock had run on. */
const age = (user: string, interval: string) =>
  db.query(`update game_engine.nickname_attempts set at = at - $2::interval where user_id = $1`, [user, interval]);

describe('nickname rules', () => {
  it('refuses names that impersonate Tactiqo or its staff, disguised or not', async () => {
    for (const name of ['Tactiqo', 'Tactiqo_Team', 'TactiqoOfficial', 'tact1qo', 'The.Tactiqo', 'Admin', 'AdminBob', 'bob_support', 'Support Team', 'Official Ada', 'Moderator', 'm0derator', 'Tactiqo Staff', 'Founder', 'Ada Verified'])
      assert.equal(await set(name), 'nickname_reserved', name);
  });

  it('refuses offensive names, including digit look-alikes and separators', async () => {
    for (const name of ['fuckface', 'F.U.C.K', 'sh1tlord', 'b1tch99', 'Hitler88', 'n4zi', 'chutiya', 'bhenchod', 'big dick', 'Ass', 'r4pe'])
      assert.equal(await set(name), 'nickname_not_allowed', name);
  });

  it('allows ordinary names that only contain those letters inside other words', async () => {
    for (const name of ['Badminton Ace', 'Dickens Fan', 'Cassandra', 'Grapefruit', 'Torpedo', 'Titan', 'Classic', 'Sussex Sam', 'Dev Patel', 'Team Rocket', 'Scunthorpe Utd', 'Ada_Lovelace', 'Priya 21'])
      assert.equal(await set(name), 'ok', name);
  });

  it('keeps the existing rules and codes', async () => {
    assert.equal(await set('ab'), 'nickname_length');
    assert.equal(await set('_lead'), 'nickname_characters');
    assert.equal(await set('a.-_'), 'nickname_reserved');
    assert.equal(await set('Strategic Game'), 'nickname_reserved');
  });

  it('clients can’t call the checker directly', async () => {
    const r = await pgRpc(db, USER).call('set_nickname', { request: { nickname: 'Fine Name' } });
    assert.equal((r as { nickname: string }).nickname, 'Fine Name');
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.exec('set local role authenticated');
        await tx.query(`select game_engine.nickname_problem('x')`);
      }),
      /permission denied/,
    );
  });
});

// ── Rate limiting (20261106120000_nickname_rate_limit.sql) ─────────────────────────────────────────────────────────

describe('nickname rate limits', () => {
  let n = 0;
  /** A fresh signed-in player for each test, so limits never leak between tests. */
  const newUser = async () => {
    const id = `00000000-0000-4000-8000-0000000a${String(++n).padStart(4, '0')}`;
    await addUser(db, id);
    return id;
  };
  const attempts = async (user: string) =>
    (await db.query<{ outcome: string }>('select outcome from game_engine.nickname_attempts where user_id = $1 order by id', [user])).rows.map((r) => r.outcome);
  const nicknameOf = async (user: string) =>
    (await db.query<{ nickname: string }>('select nickname from public.player_profiles where user_id = $1', [user])).rows[0]?.nickname;

  it('the first nickname is free; then three changes in 24 hours, and the fourth is refused', async () => {
    const u = await newUser();
    assert.equal(await attempt(u, 'Rate One'), 'ok');
    assert.equal(await attempt(u, 'Rate Two'), 'ok');
    assert.equal(await attempt(u, 'Rate Three'), 'ok');
    assert.equal(await attempt(u, 'Rate Four'), 'ok');
    assert.equal(await attempt(u, 'Rate Five'), 'nickname_rate_limited');
    assert.deepEqual(await attempts(u), ['first', 'changed', 'changed', 'changed']);
    assert.equal(await nicknameOf(u), 'Rate Four', 'the refused rename did not happen');
  });

  it('the 24-hour window is rolling, measured by the server clock', async () => {
    const u = await newUser();
    for (const name of ['Roll One', 'Roll Two', 'Roll Three', 'Roll Four']) assert.equal(await attempt(u, name), 'ok');
    assert.equal(await attempt(u, 'Roll Five'), 'nickname_rate_limited');
    await age(u, '23 hours');
    assert.equal(await attempt(u, 'Roll Five'), 'nickname_rate_limited');
    await age(u, '61 minutes');
    assert.equal(await attempt(u, 'Roll Five'), 'ok');
  });

  it('saving the name the player already has is not a change', async () => {
    const u = await newUser();
    assert.equal(await attempt(u, 'Same Name'), 'ok');
    for (let i = 0; i < 5; i++) assert.equal(await attempt(u, 'Same Name'), 'ok');
    assert.deepEqual(await attempts(u), ['first']);
  });

  it('at most ten attempts an hour, and refused names count towards them', async () => {
    const u = await newUser();
    for (let i = 0; i < 10; i++) assert.equal(await attempt(u, 'ab'), 'nickname_length');
    // An acceptable, never-used name is still refused: the hour's attempts are used up.
    assert.equal(await attempt(u, 'Hourly Ok'), 'nickname_rate_limited');
    // Calls refused by the limit itself are not recorded, so hammering can't extend the wait.
    assert.equal((await attempts(u)).length, 10);
    await age(u, '61 minutes');
    assert.equal(await attempt(u, 'Hourly Ok'), 'ok');
  });

  it('a taken name counts as a refused attempt', async () => {
    const owner = await newUser();
    const u = await newUser();
    assert.equal(await attempt(owner, 'Taken Name'), 'ok');
    assert.equal(await attempt(u, 'taken_name'), 'nickname_taken');
    assert.deepEqual(await attempts(u), ['refused']);
  });

  it('concurrent requests from one player can’t get past the change limit', async () => {
    const u = await newUser();
    assert.equal(await attempt(u, 'Race Zero'), 'ok');
    const names = ['Race One', 'Race Two', 'Race Three', 'Race Four', 'Race Five', 'Race Six'];
    const results = await Promise.all(names.map((name) => attempt(u, name)));
    assert.equal(results.filter((r) => r === 'ok').length, 3, results.join(', '));
    assert.equal(results.filter((r) => r === 'nickname_rate_limited').length, 3, results.join(', '));
    assert.equal((await attempts(u)).filter((o) => o === 'changed').length, 3);
  });

  it('serializes each player’s requests with a per-user advisory lock taken before any counting', async () => {
    // PGlite runs one transaction at a time, so the test above can't race for real; this pins the guard that makes
    // it safe on a real server.
    const src = (await db.query<{ src: string }>(`select prosrc as src from pg_proc where proname = 'set_nickname'`)).rows[0].src;
    assert.match(src, /pg_advisory_xact_lock\(hashtextextended\('set_nickname:' \|\| uid::text, 0\)\)/);
    assert.ok(src.indexOf('pg_advisory_xact_lock') < src.indexOf('count(*)'));
  });

  it('limits are per player', async () => {
    const a = await newUser();
    const b = await newUser();
    for (let i = 0; i < 10; i++) await attempt(a, 'ab');
    assert.equal(await attempt(a, 'Player A'), 'nickname_rate_limited');
    assert.equal(await attempt(b, 'Player B'), 'ok');
  });

  it('clients can’t read or write the attempt log', async () => {
    const u = await newUser();
    await attempt(u, 'Log Reader');
    const statements = [
      'select * from game_engine.nickname_attempts',
      'delete from game_engine.nickname_attempts',
      `insert into game_engine.nickname_attempts (user_id, outcome) values ('${u}', 'first')`,
    ];
    for (const sql of statements) {
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx.exec('set local role authenticated');
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: u, role: 'authenticated' })]);
          await tx.query(sql);
        }),
        /permission denied/,
        sql,
      );
    }
  });

  it('answers say how many changes are left, which limit was hit and when it frees up (server clock)', async () => {
    const u = await newUser();
    const call = (nickname: string) => pgRpc(db, u).call('set_nickname', { request: { nickname } }) as Promise<Record<string, unknown>>;
    assert.deepEqual(await call('Left One'), { nickname: 'Left One', changesLeft: 3 }, 'the first name is free');
    assert.deepEqual(await call('Left Two'), { nickname: 'Left Two', changesLeft: 2 });
    assert.deepEqual(await call('Left Two'), { nickname: 'Left Two', changesLeft: 2 }, 'same name costs nothing');
    assert.deepEqual(await call('Left Three'), { nickname: 'Left Three', changesLeft: 1 });
    assert.deepEqual(await call('Left Four'), { nickname: 'Left Four', changesLeft: 0 });
    // Move the oldest change 20 hours back: the 4th rename frees up ~4 hours from now (when that change is 24 h old).
    await db.query(
      `update game_engine.nickname_attempts set at = at - interval '20 hours'
       where id = (select min(id) from game_engine.nickname_attempts where user_id = $1 and outcome = 'changed')`,
      [u],
    );
    const refused = await call('Left Five');
    assert.equal(refused.refused, 'games:nickname_rate_limited');
    assert.equal(refused.limit, 'changes');
    const wait = refused.retryAfterSeconds as number;
    assert.ok(wait > 4 * 3600 - 60 && wait <= 4 * 3600, `retry after ${wait}s`);

    const h = await newUser();
    for (let i = 0; i < 10; i++) await attempt(h, 'ab');
    await age(h, '30 minutes');
    const hourly = (await pgRpc(db, h).call('set_nickname', { request: { nickname: 'Hour Name' } })) as Record<string, unknown>;
    assert.equal(hourly.limit, 'attempts');
    const w = hourly.retryAfterSeconds as number;
    assert.ok(w > 29 * 60 && w <= 30 * 60, `retry after ${w}s`);
  });

  it('the request carries nothing the server trusts but the name: a client-sent time or count changes nothing', async () => {
    const u = await newUser();
    for (const name of ['Trust One', 'Trust Two', 'Trust Three', 'Trust Four']) assert.equal(await attempt(u, name), 'ok');
    const r = (await pgRpc(db, u).call('set_nickname', { request: { nickname: 'Trust Five', at: '2000-01-01T00:00:00Z', changesLeft: 3, attempts: 0 } })) as Record<string, unknown>;
    assert.equal(r.refused, 'games:nickname_rate_limited');
  });

  it('the attempt log goes with the account', async () => {
    const u = await newUser();
    await attempt(u, 'Leaving Soon');
    await db.query('delete from auth.users where id = $1', [u]);
    assert.deepEqual(await attempts(u), []);
  });
});

// ── The app's quick check agrees with the server ─────────────────────────────────────────────────────────────────

describe('client and server nickname rules agree', () => {
  it('on length, characters and reserved names (only the server judges offensive names)', async () => {
    const { nicknameProblem } = await import('../../src/games/competition.ts');
    const corpus = [
      'Ada', 'Ada Lovelace', 'ravi_k', 'r.k-42', '  padded  ', 'Priya 21', 'Badminton Ace', 'Scunthorpe Utd',
      '', 'ab', 'x'.repeat(21), '   ', '_lead', '-dash', '.dot', 'two  spaces', 'emoji 😀', 'tab\tname', '\tlead', 'Adмin', 'Ｆull',
      'Admin', 'ADMIN', 'Strategic Game', 'Strategic-Game', 'a.-_', 'Anonymous Player', 'Tactiqo', 'Tactiqo_Team', 'my tactiqo',
      'You', 'Opponent', 'bot', 'null', 'Undefined', 'Support', 'Staff', 'System',
    ];
    for (const name of corpus) {
      const server = await set(name);
      const serverRule = server === 'ok' ? null : server.replace('nickname_', '');
      const client = nicknameProblem(name);
      if (client === null) assert.equal(serverRule, null, `server refused "${name}" (${serverRule}) but the app accepts it`);
      else assert.equal(serverRule, client, `"${name}": app says ${client}, server says ${serverRule}`);
    }
  });
});
