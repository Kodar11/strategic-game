/// <reference types="node" />
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PGlite, Transaction } from '@electric-sql/pglite';

import { accountRepository } from '../../src/data/account.ts';
import { addUser, as, createDatabase, failure, pgRpc } from './pg.ts';

/**
 * The PostHog deletion queue (20261106120100_account_deletions.sql) against the real migrations: atomic with account
 * deletion, private to the service role, safe under retries and overlapping workers, and never silently abandoned.
 */

let db: PGlite;
let next = 0x100;
const newUser = async () => {
  const id = `00000000-0000-4000-8000-${(next++).toString(16).padStart(12, '0')}`;
  await addUser(db, id);
  return id;
};

before(async () => {
  db = await createDatabase({ seed: false });
});
after(async () => {
  await db.close();
});

/** Runs `fn` as the service role (what the Edge Function uses through PostgREST). */
const asService = <T>(fn: (tx: Transaction) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return fn(tx);
  });
const claim = (batch = 20, lease = 300) =>
  asService(async (tx) => (await tx.query<{ id: string; distinct_id: string; phase: string; attempts: number }>('select * from public.account_deletions_claim($1, $2)', [batch, lease])).rows);
const report = (id: string, outcome: string, error: string | null = null) =>
  asService(async (tx) => (await tx.query<{ s: string | null }>('select public.account_deletions_report($1, $2, $3) as s', [id, outcome, error])).rows[0].s);
const row = async (distinctId: string) =>
  (await db.query<any>('select * from public.account_deletions where fingerprint = public.account_deletion_fingerprint($1::uuid)', [distinctId])).rows[0];
/** Makes every queued row due now (as if the backoff had passed). */
const makeDue = () => db.query('update public.account_deletions set next_attempt_at = now() - interval \'1 second\'');
const clearQueue = () => db.query('delete from public.account_deletions');

describe('account deletion queues the PostHog deletion atomically', () => {
  it('delete_my_account deletes the account and queues exactly one row with only the id and its fingerprint', async () => {
    const u = await newUser();
    await accountRepository(pgRpc(db, u) as never).deleteMyAccount();
    assert.equal((await db.query('select 1 from auth.users where id = $1', [u])).rows.length, 0);
    const r = await row(u);
    assert.equal(r.distinct_id, u);
    assert.match(r.fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(r.status, 'pending');
    assert.equal(r.source, 'app');
    // Nothing else about the person is stored: the columns are fixed and none holds an email or a nickname.
    const columns = (await db.query<{ c: string }>(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = 'account_deletions' order by ordinal_position`)).rows.map((x) => x.c);
    assert.deepEqual(columns, ['id', 'distinct_id', 'fingerprint', 'source', 'requested_at', 'status', 'attempts', 'next_attempt_at', 'claimed_until', 'posthog_requested_at', 'last_error', 'completed_at']);
  });

  it('if the account deletion fails, no queue row is left behind (both or neither)', async () => {
    const u = await newUser();
    // Make the delete itself fail after the queue insert ran: a trigger that refuses deleting this user.
    await db.exec(`
      create function pg_temp.refuse() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
      create trigger refuse_delete before delete on auth.users for each row when (old.id = '${u}') execute function pg_temp.refuse();`);
    try {
      assert.match((await failure(db, u, 'select public.delete_my_account()'))!, /boom/);
      assert.equal(await row(u), undefined);
      assert.equal((await db.query('select 1 from auth.users where id = $1', [u])).rows.length, 1);
    } finally {
      await db.exec('drop trigger refuse_delete on auth.users');
    }
  });

  it('a second deletion request (lost response, retry) is safe: the account is already gone and there is still one row', async () => {
    const u = await newUser();
    const repo = accountRepository(pgRpc(db, u) as never);
    await repo.deleteMyAccount();
    await repo.deleteMyAccount(); // the app treats account:not_found as success
    assert.equal((await db.query<{ n: number }>('select count(*)::int as n from public.account_deletions where distinct_id = $1', [u])).rows[0].n, 1);
  });

  it('queueing the same id twice keeps one row; a completed one goes back to pending because someone asked again', async () => {
    const u = await newUser();
    await db.query(`select public.queue_account_deletion($1, 'admin')`, [u]);
    await db.query(`select public.queue_account_deletion($1, 'admin')`, [u]);
    assert.equal((await db.query<{ n: number }>('select count(*)::int as n from public.account_deletions where distinct_id = $1', [u])).rows[0].n, 1);
    await db.query(`update public.account_deletions set status = 'done', completed_at = now() where distinct_id = $1`, [u]);
    await db.query(`select public.queue_account_deletion($1, 'admin')`, [u]);
    assert.equal((await row(u)).status, 'pending');
  });

  it('admin_delete_account (out-of-app requests) uses the same path, and no client or worker role can call it', async () => {
    const u = await newUser();
    const other = await newUser();
    assert.deepEqual((await db.query<any>('select public.admin_delete_account($1) as r', [u])).rows[0].r, { deleted: true, user_id: u });
    assert.equal((await row(u)).source, 'admin');
    for (const who of [other, null]) assert.match((await failure(db, who, 'select public.admin_delete_account($1)', [other]))!, /permission denied/);
    await assert.rejects(asService((tx) => tx.query('select public.admin_delete_account($1)', [other])), /permission denied/);
    assert.equal((await db.query('select 1 from auth.users where id = $1', [other])).rows.length, 1);
  });
});

describe('the queue is private', () => {
  it('signed-in users and guests can’t read, write or work the queue', async () => {
    const u = await newUser();
    const statements = [
      'select * from public.account_deletions',
      `insert into public.account_deletions (distinct_id, fingerprint) values ('${u}', repeat('a', 64))`,
      'delete from public.account_deletions',
      'select * from public.account_deletions_health',
      'select * from public.account_deletions_claim(1, 60)',
      `select public.account_deletions_report(gen_random_uuid(), 'gone')`,
      'select public.account_deletions_cleanup(30)',
      'select public.account_deletions_retry_failed()',
      `select public.queue_account_deletion('${u}', 'app')`,
      `select public.delete_account_and_queue('${u}', 'app')`,
    ];
    for (const who of [u, null]) for (const sql of statements) assert.match((await failure(db, who, sql))!, /permission denied/, `${who ? 'user' : 'guest'}: ${sql}`);
  });

  it('row level security is on, with no policies', async () => {
    const r = (await db.query<any>(`select relrowsecurity as rls, (select count(*)::int from pg_policies where tablename = 'account_deletions') as policies from pg_class where oid = 'public.account_deletions'::regclass`)).rows[0];
    assert.deepEqual(r, { rls: true, policies: 0 });
  });

  it('the service role can claim, report and clean up, but can’t delete accounts or empty the queue', async () => {
    const u = await newUser();
    await assert.rejects(asService((tx) => tx.query(`select public.delete_account_and_queue($1, 'app')`, [u])), /permission denied/);
    await assert.rejects(asService((tx) => tx.query('delete from public.account_deletions')), /permission denied/);
    await assert.rejects(asService((tx) => tx.query('select public.account_deletions_retry_failed()')), /permission denied/);
  });
});

describe('the worker’s lifecycle', () => {
  it('pending → processing (claimed) → verifying (PostHog accepted) → done (person gone)', async () => {
    await clearQueue();
    const u = await newUser();
    await db.query('select public.admin_delete_account($1)', [u]);
    const [c] = await claim();
    assert.deepEqual([c.distinct_id, c.phase, c.attempts], [u, 'submit', 1]);
    assert.equal((await row(u)).status, 'processing');
    assert.equal(await report(c.id, 'submitted'), 'verifying');
    const afterSubmit = await row(u);
    assert.ok(afterSubmit.posthog_requested_at);
    assert.ok(new Date(afterSubmit.next_attempt_at) > new Date(), 'the check waits for the backoff');
    assert.equal((await claim()).length, 0, 'not due yet');
    await makeDue();
    const [v] = await claim();
    assert.equal(v.phase, 'verify');
    assert.equal(await report(v.id, 'gone'), 'done');
    const done = await row(u);
    assert.equal(done.status, 'done');
    assert.ok(done.completed_at);
    assert.equal((await claim()).length, 0, 'done rows are never claimed again');
  });

  it('no PostHog person at all (analytics never on) is done at once', async () => {
    await clearQueue();
    const u = await newUser();
    await db.query('select public.admin_delete_account($1)', [u]);
    const [c] = await claim();
    assert.equal(await report(c.id, 'gone'), 'done');
  });

  it('a person still there after the check is sent again', async () => {
    await clearQueue();
    const u = await newUser();
    await db.query('select public.admin_delete_account($1)', [u]);
    await report((await claim())[0].id, 'submitted');
    await makeDue();
    assert.equal(await report((await claim())[0].id, 'still_present'), 'pending');
    await makeDue();
    assert.equal((await claim())[0].phase, 'submit');
  });

  it('transient errors retry with the staged backoff: 5 min, 30 min, 2 h, 12 h, then daily', async () => {
    const steps = (await db.query<{ i: string }>(`select public.account_deletion_backoff(n)::text as i from generate_series(1, 7) n`)).rows.map((r) => r.i);
    assert.deepEqual(steps, ['00:05:00', '00:30:00', '02:00:00', '12:00:00', '24:00:00', '24:00:00', '24:00:00']);
    await clearQueue();
    const u = await newUser();
    await db.query('select public.admin_delete_account($1)', [u]);
    assert.equal(await report((await claim())[0].id, 'retry', 'posthog lookup 503'), 'pending');
    const r = await row(u);
    assert.equal(r.last_error, 'posthog lookup 503');
    const wait = (new Date(r.next_attempt_at).getTime() - Date.now()) / 60_000;
    assert.ok(wait > 4 && wait <= 5.1, `waits about 5 minutes, got ${wait}`);
  });

  it('after max attempts a row is failed — visible in the health view — and can be put back by an operator', async () => {
    await clearQueue();
    const u = await newUser();
    await db.query('select public.admin_delete_account($1)', [u]);
    const max = (await db.query<{ m: number }>('select public.account_deletion_max_attempts() as m')).rows[0].m;
    let status: string | null = null;
    for (let i = 0; i < max; i++) {
      await makeDue();
      const [c] = await claim();
      assert.ok(c, `attempt ${i + 1} was claimable`);
      status = await report(c.id, 'retry', 'posthog delete 403 (check the personal API key and its person:read/person:write scopes)');
    }
    assert.equal(status, 'failed');
    await makeDue();
    assert.equal((await claim()).length, 0, 'failed rows are not retried automatically');
    const health = (await db.query<any>('select * from public.account_deletions_health')).rows;
    const failed = health.find((h) => h.status === 'failed');
    assert.equal(failed.count, 1);
    assert.match(failed.example_error, /403/);
    assert.equal((await row(u)).distinct_id, u, 'a failed row keeps the id so it can be retried');
    assert.equal((await db.query<{ n: number }>('select public.account_deletions_retry_failed() as n')).rows[0].n, 1);
    assert.deepEqual([(await row(u)).status, (await row(u)).attempts], ['pending', 0]);
  });

  it('overlapping workers never get the same row, and a crashed worker’s claim expires', async () => {
    await clearQueue();
    const users = [await newUser(), await newUser(), await newUser()];
    for (const u of users) await db.query('select public.admin_delete_account($1)', [u]);
    const first = await claim(2, 300);
    const second = await claim(20, 300);
    assert.equal(first.length, 2);
    assert.equal(second.length, 1);
    assert.equal(new Set([...first, ...second].map((c) => c.id)).size, 3);
    assert.equal((await claim()).length, 0, 'everything is held');
    // The first worker died: once its lease runs out the rows are claimable again.
    await db.query(`update public.account_deletions set claimed_until = now() - interval '1 second' where id = any($1::uuid[])`, [first.map((c) => c.id)]);
    const third = await claim();
    assert.deepEqual(third.map((c) => c.id).sort(), first.map((c) => c.id).sort());
    assert.ok(third.every((c) => c.phase === 'submit' && c.attempts === 2));
  });

  it('claims are bounded', async () => {
    await clearQueue();
    for (let i = 0; i < 3; i++) await db.query('select public.admin_delete_account($1)', [await newUser()]);
    assert.equal((await claim(1)).length, 1);
    assert.equal((await claim(0)).length, 1, 'a batch is at least one');
  });

  it('reports for rows that aren’t claimed, and unknown outcomes, change nothing', async () => {
    await clearQueue();
    const u = await newUser();
    await db.query('select public.admin_delete_account($1)', [u]);
    const id = (await row(u)).id;
    assert.equal(await report(id, 'gone'), null, 'not claimed');
    assert.equal((await row(u)).status, 'pending');
    await assert.rejects(report(id, 'deleted'), /unknown outcome/);
  });

  it('errors are stored short', async () => {
    await clearQueue();
    const u = await newUser();
    await db.query('select public.admin_delete_account($1)', [u]);
    await report((await claim())[0].id, 'retry', 'x'.repeat(1000));
    assert.equal((await row(u)).last_error.length, 300);
  });
});

describe('with hosted Supabase’s default privileges', () => {
  // Supabase grants every new public table and function to anon, authenticated and service_role by default. The
  // migration must take those grants back explicitly, or the worker's key could empty the queue or delete accounts.
  let sdb: PGlite;
  before(async () => {
    sdb = await createDatabase({ seed: false, supabaseDefaults: true });
  });
  after(async () => {
    await sdb.close();
  });
  const service = (sql: string, params: unknown[] = []) =>
    sdb.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      return tx.query(sql, params);
    });

  it('the worker role can still only read the queue and call its three functions', async () => {
    const u = '00000000-0000-4000-8000-00000000e001';
    await sdb.query('insert into auth.users (id) values ($1)', [u]);
    await sdb.query('select public.admin_delete_account($1)', [u]);
    await service('select * from public.account_deletions');
    await service('select * from public.account_deletions_claim(1, 60)');
    await service('select public.account_deletions_cleanup(30)');
    for (const sql of [
      'delete from public.account_deletions',
      `update public.account_deletions set status = 'done'`,
      `insert into public.account_deletions (distinct_id, fingerprint) values (null, repeat('b', 64))`,
      'select * from public.account_deletions_health',
      'select public.account_deletions_retry_failed()',
      `select public.admin_delete_account('${u}')`,
      `select public.delete_account_and_queue('${u}', 'app')`,
      `select public.queue_account_deletion('${u}', 'app')`,
    ]) {
      await assert.rejects(service(sql), /permission denied/, sql);
    }
  });

  it('players and guests still can’t touch the queue, and only signed-in players can delete their own account', async () => {
    const u = '00000000-0000-4000-8000-00000000e002';
    await sdb.query('insert into auth.users (id) values ($1)', [u]);
    for (const who of [u, null]) {
      for (const sql of ['select * from public.account_deletions', 'select * from public.account_deletions_claim(1, 60)', `select public.admin_delete_account('${u}')`]) {
        assert.match((await failure(sdb, who, sql))!, /permission denied/, sql);
      }
    }
    assert.match((await failure(sdb, null, 'select public.delete_my_account()'))!, /permission denied/);
    assert.deepEqual(await as(sdb, u, async (tx) => (await tx.query<any>('select public.delete_my_account() as r')).rows[0].r), { deleted: true });
  });
});

describe('retention', () => {
  it('erases the id 30 days after completion and keeps only the fingerprint; recent and failed rows keep it', async () => {
    await clearQueue();
    const old = await newUser();
    const recent = await newUser();
    const stuck = await newUser();
    for (const u of [old, recent, stuck]) await db.query('select public.admin_delete_account($1)', [u]);
    await db.query(`update public.account_deletions set status = 'done', completed_at = now() - interval '31 days' where distinct_id = $1`, [old]);
    await db.query(`update public.account_deletions set status = 'done', completed_at = now() - interval '29 days' where distinct_id = $1`, [recent]);
    await db.query(`update public.account_deletions set status = 'failed' where distinct_id = $1`, [stuck]);
    assert.equal(await asService(async (tx) => (await tx.query<{ n: number }>('select public.account_deletions_cleanup(30) as n')).rows[0].n), 1);
    assert.equal((await row(old)).distinct_id, null);
    assert.equal((await row(old)).fingerprint, (await db.query<{ f: string }>('select public.account_deletion_fingerprint($1) as f', [old])).rows[0].f);
    assert.equal((await row(recent)).distinct_id, recent);
    assert.equal((await row(stuck)).distinct_id, stuck);
    // An erased row is never claimed.
    await makeDue();
    assert.ok((await claim()).every((c) => c.distinct_id !== null));
  });

  it('only a completed row may lose its id', async () => {
    const u = await newUser();
    await db.query('select public.admin_delete_account($1)', [u]);
    await assert.rejects(db.query('update public.account_deletions set distinct_id = null where distinct_id = $1', [u]), /account_deletions_id_kept/);
  });

  it('the delete_my_account response and the not-signed-in error are unchanged', async () => {
    const u = await newUser();
    assert.deepEqual(await as(db, u, async (tx) => (await tx.query<any>('select public.delete_my_account() as r')).rows[0].r), { deleted: true });
    assert.match((await failure(db, null, 'select public.delete_my_account()'))!, /permission denied/);
  });
});
