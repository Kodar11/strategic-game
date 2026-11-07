/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import {
  type Claim,
  type DeletionQueue,
  type PostHogPersons,
  PostHogError,
  SECRET_HEADER,
  apiHost,
  deletionErrorSteps,
  handleWorkerRequest,
  postHogConfig,
  postHogPersons,
  processBatch,
  sameSecret,
} from '../functions/posthog-deletion/handler.ts';
import { addUser, createDatabase } from './pg.ts';

/** The posthog-deletion worker (supabase/functions/posthog-deletion/handler.ts). */

const ROOT = join(import.meta.dirname, '..', '..');
const SECRET = 's'.repeat(40);
const KEY = 'phx_test_personal_key_never_logged';
const ENV: Record<string, string> = {
  DELETION_WORKER_SECRET: SECRET,
  POSTHOG_PERSONAL_API_KEY: KEY,
  POSTHOG_PROJECT_ID: '12345',
  POSTHOG_HOST: 'https://eu.i.posthog.com',
};

/** A fake PostHog persons API: which ids exist, and what each call returns. */
function fakePostHog(opts: { people?: Set<string>; failLookup?: (id: string) => number | 'network' | null; failDelete?: (id: string) => number | null; deletionErrors?: unknown[] } = {}) {
  const people = opts.people ?? new Set<string>();
  const calls: { method: string; url: string; body?: string; auth?: string }[] = [];
  const fetchImpl = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ method: init?.method ?? 'GET', url, body: init?.body, auth: init?.headers?.Authorization });
    const u = new URL(url);
    if (init?.method === 'GET') {
      const id = u.searchParams.get('distinct_id') ?? '';
      const fail = opts.failLookup?.(id);
      if (fail === 'network') throw new TypeError('fetch failed');
      if (fail) return { status: fail, ok: false, text: async () => JSON.stringify({ type: 'server_error', code: 'error', detail: `person ${id} secret body` }) };
      const results = people.has(id) ? [{ id: 'p-uuid', distinct_ids: [id, 'anon-device-id'] }] : [];
      return { status: 200, ok: true, text: async () => JSON.stringify({ results }) };
    }
    const { distinct_ids } = JSON.parse(init?.body ?? '{}') as { distinct_ids: string[] };
    const fail = opts.failDelete?.(distinct_ids[0]);
    if (fail) return { status: fail, ok: false, text: async () => JSON.stringify({ type: 'authentication_error', code: 'permission_denied', detail: 'nope' }) };
    if (opts.deletionErrors) {
      // Documented: failures come back inside a 202, not as an error status.
      return { status: 202, ok: true, text: async () => JSON.stringify({ persons_found: 1, persons_queued_for_deletion: 0, deletion_errors: opts.deletionErrors }) };
    }
    for (const id of distinct_ids) people.delete(id);
    return { status: 202, ok: true, text: async () => '{"persons_found":1,"persons_queued_for_deletion":1,"persons_deleted":0,"events_queued_for_deletion":true,"recordings_queued_for_deletion":true,"deletion_errors":[]}' };
  };
  return { people, calls, fetchImpl };
}

describe('PostHog client', () => {
  it('uses the documented endpoints, the app host and the personal key', async () => {
    const ph = fakePostHog({ people: new Set(['u1']) });
    const client = postHogPersons({ host: 'https://eu.posthog.com', projectId: '12345', apiKey: KEY }, ph.fetchImpl);
    assert.equal(await client.exists('u1'), true);
    await client.requestDeletion('u1');
    assert.equal(await client.exists('u1'), false);
    assert.deepEqual(ph.calls.map((c) => `${c.method} ${c.url}`), [
      'GET https://eu.posthog.com/api/projects/12345/persons/?distinct_id=u1',
      'POST https://eu.posthog.com/api/projects/12345/persons/bulk_delete/',
      'GET https://eu.posthog.com/api/projects/12345/persons/?distinct_id=u1',
    ]);
    assert.deepEqual(JSON.parse(ph.calls[1].body!), { distinct_ids: ['u1'], delete_events: true, delete_recordings: true });
    assert.ok(ph.calls.every((c) => c.auth === `Bearer ${KEY}`));
  });

  it('a 202 that lists deletion_errors is a retry, keeping only the failed step names', async () => {
    const ph = fakePostHog({ people: new Set(['user-123']), deletionErrors: [{ person_uuid: 'p-uuid-secret', step: 'events' }, { person_uuid: 'p-uuid-secret', step: 'events' }] });
    const client = postHogPersons({ host: 'https://eu.posthog.com', projectId: '1', apiKey: KEY }, ph.fetchImpl);
    const err = await client.requestDeletion('user-123').then(() => null, (e: PostHogError) => e.safe);
    assert.equal(err, 'posthog delete accepted with errors (events)');
    // Through the batch: the row is retried, never reported as submitted.
    const reports: string[] = [];
    const queue: DeletionQueue = {
      claim: async () => [{ id: 'r1', distinct_id: 'user-123', phase: 'submit', attempts: 0 }],
      report: async (_id, outcome) => (reports.push(outcome), 'pending'),
      cleanup: async () => 0,
    };
    const summary = await processBatch(queue, client);
    assert.deepEqual(reports, ['retry']);
    assert.equal(summary.submitted, 0);
  });

  it('deletion_errors parsing: empty or unreadable is none; odd step values are not echoed', () => {
    assert.equal(deletionErrorSteps('{"deletion_errors":[]}'), null);
    assert.equal(deletionErrorSteps('{"persons_found":1}'), null);
    assert.equal(deletionErrorSteps('not json'), null);
    assert.equal(deletionErrorSteps('{"deletion_errors":[{"step":"recordings"},{"step":"Person 42 <x>"},{}]}'), 'recordings, unknown');
  });

  it('a 404 is a configuration error, never "no person"', async () => {
    const ph = fakePostHog({ failLookup: () => 404 });
    const client = postHogPersons({ host: 'https://eu.posthog.com', projectId: '1', apiKey: KEY }, ph.fetchImpl);
    await assert.rejects(client.exists('u1'), (e: unknown) => e instanceof PostHogError && /lookup 404 .*POSTHOG_PROJECT_ID/.test(e.safe));
  });

  it('errors keep only the status and PostHog’s short code — never the body, the id or the key', async () => {
    const ph = fakePostHog({ people: new Set(['user-123']), failDelete: () => 403 });
    const client = postHogPersons({ host: 'https://eu.posthog.com', projectId: '1', apiKey: KEY }, ph.fetchImpl);
    const err = await client.requestDeletion('user-123').then(() => null, (e: PostHogError) => e.safe);
    assert.match(err!, /^posthog delete 403 permission_denied/);
    assert.doesNotMatch(err!, /user-123|nope|phx_/);
    const net = fakePostHog({ failLookup: () => 'network' });
    const e2 = await postHogPersons({ host: 'https://eu.posthog.com', projectId: '1', apiKey: KEY }, net.fetchImpl).exists('user-123').then(() => null, (e: PostHogError) => e.safe);
    assert.equal(e2, 'posthog lookup network error');
  });

  it('API host: the ingestion host maps to the app host; anything but https is refused', () => {
    assert.equal(apiHost('https://us.i.posthog.com'), 'https://us.posthog.com');
    assert.equal(apiHost('https://eu.i.posthog.com/'), 'https://eu.posthog.com');
    assert.equal(apiHost('https://eu.posthog.com'), 'https://eu.posthog.com');
    assert.equal(apiHost('https://posthog.example.org'), 'https://posthog.example.org');
    assert.equal(apiHost('http://us.posthog.com'), null);
    assert.equal(apiHost('not a url'), null);
  });

  it('configuration: needs a personal key (phx_), a numeric project id and an https host', () => {
    const cfg = (over: Record<string, string | undefined>) => postHogConfig((n) => ({ ...ENV, ...over })[n]);
    assert.deepEqual(cfg({}), { host: 'https://eu.posthog.com', projectId: '12345', apiKey: KEY });
    assert.match((cfg({ POSTHOG_PERSONAL_API_KEY: undefined }) as { missing: string }).missing, /POSTHOG_PERSONAL_API_KEY/);
    assert.match((cfg({ POSTHOG_PERSONAL_API_KEY: 'phc_projectkey' }) as { missing: string }).missing, /personal API key/);
    assert.match((cfg({ POSTHOG_PROJECT_ID: 'abc' }) as { missing: string }).missing, /POSTHOG_PROJECT_ID/);
    assert.match((cfg({ POSTHOG_HOST: 'http://x' }) as { missing: string }).missing, /POSTHOG_HOST/);
  });
});

describe('batch processing (fake queue)', () => {
  function fakeQueue(claims: Claim[]) {
    const reports: { id: string; outcome: string; error: string | null }[] = [];
    const queue: DeletionQueue = {
      claim: async () => claims,
      report: async (id, outcome, error) => {
        reports.push({ id, outcome, error: error ?? null });
        return outcome === 'gone' ? 'done' : outcome === 'submitted' ? 'verifying' : 'pending';
      },
      cleanup: async () => 0,
    };
    return { queue, reports };
  }
  const posthog = (people: Set<string>, broken = new Set<string>()): PostHogPersons => ({
    exists: async (id) => {
      if (broken.has(id)) throw new PostHogError('posthog lookup 503');
      return people.has(id);
    },
    requestDeletion: async (id) => {
      people.delete(id);
    },
  });

  it('submits present persons, completes absent ones, and one failure doesn’t stop the rest', async () => {
    const { queue, reports } = fakeQueue([
      { id: 'a', distinct_id: 'ua', phase: 'submit', attempts: 1 },
      { id: 'b', distinct_id: 'ub', phase: 'submit', attempts: 1 },
      { id: 'c', distinct_id: 'uc', phase: 'submit', attempts: 1 },
      { id: 'd', distinct_id: 'ud', phase: 'verify', attempts: 1 },
      { id: 'e', distinct_id: 'ue', phase: 'verify', attempts: 1 },
    ]);
    const summary = await processBatch(queue, posthog(new Set(['ua', 'ue']), new Set(['uc'])));
    assert.deepEqual(reports, [
      { id: 'a', outcome: 'submitted', error: null },
      { id: 'b', outcome: 'gone', error: null },
      { id: 'c', outcome: 'retry', error: 'posthog lookup 503' },
      { id: 'd', outcome: 'gone', error: null },
      { id: 'e', outcome: 'still_present', error: null },
    ]);
    assert.deepEqual(summary, { claimed: 5, submitted: 1, done: 2, resent: 1, retried: 1, failed: 0, cleaned: 0 });
  });

  it('an unexpected error is recorded generically, without its message', async () => {
    const { queue, reports } = fakeQueue([{ id: 'a', distinct_id: 'ua', phase: 'submit', attempts: 1 }]);
    await processBatch(queue, { exists: async () => { throw new Error('secret detail ua'); }, requestDeletion: async () => undefined });
    assert.deepEqual(reports, [{ id: 'a', outcome: 'retry', error: 'worker error' }]);
  });
});

describe('request handling', () => {
  const deps = (env: Record<string, string | undefined> = ENV) => {
    let claimed = 0;
    const queue: DeletionQueue = { claim: async () => (claimed++, []), report: async () => null, cleanup: async () => 0 };
    return { deps: { env: (n: string) => env[n], queue, posthog: () => ({ exists: async () => false, requestDeletion: async () => undefined }) }, claimed: () => claimed };
  };
  const req = (headers: Record<string, string>, method = 'POST') => ({ method, header: (n: string) => headers[n.toLowerCase()] ?? null });

  it('rejects a missing or wrong secret before doing any work', async () => {
    const attempts: Record<string, string>[] = [{}, { [SECRET_HEADER]: 'wrong' }, { [SECRET_HEADER]: SECRET.slice(1) }, { authorization: `Bearer ${SECRET}` }];
    for (const headers of attempts) {
      const d = deps();
      const out = await handleWorkerRequest(req(headers), d.deps);
      assert.equal(out.status, 401);
      assert.equal(d.claimed(), 0);
    }
  });

  it('refuses to run at all without a strong secret configured', async () => {
    for (const secret of [undefined, 'short']) {
      const d = deps({ ...ENV, DELETION_WORKER_SECRET: secret });
      const out = await handleWorkerRequest(req({ [SECRET_HEADER]: secret ?? '' }), d.deps);
      assert.equal(out.status, 503);
      assert.equal(d.claimed(), 0);
    }
  });

  it('only POST', async () => {
    assert.equal((await handleWorkerRequest(req({ [SECRET_HEADER]: SECRET }, 'GET'), deps().deps)).status, 405);
  });

  it('without PostHog settings it leaves the queue alone (no attempts burned) and says what is missing', async () => {
    const d = deps({ ...ENV, POSTHOG_PERSONAL_API_KEY: undefined });
    const out = await handleWorkerRequest(req({ [SECRET_HEADER]: SECRET }), d.deps);
    assert.deepEqual([out.status, out.body.error], [503, 'posthog_not_configured']);
    assert.equal(d.claimed(), 0);
  });

  it('with the right secret it runs one batch', async () => {
    const d = deps();
    const out = await handleWorkerRequest(req({ [SECRET_HEADER]: SECRET }), d.deps);
    assert.equal(out.status, 200);
    assert.equal(d.claimed(), 1);
    assert.doesNotMatch(JSON.stringify(out.body), /phx_/);
  });

  it('secret comparison', () => {
    assert.equal(sameSecret(SECRET, SECRET), true);
    assert.equal(sameSecret(`${SECRET}x`, SECRET), false);
    assert.equal(sameSecret('', SECRET), false);
    assert.equal(sameSecret(null, SECRET), false);
  });
});

describe('end to end against the real queue', () => {
  let db: PGlite;
  before(async () => {
    db = await createDatabase({ seed: false });
  });
  after(async () => {
    await db.close();
  });

  /** The service-role RPCs, as the Edge Function calls them through PostgREST. */
  const sqlQueue = (): DeletionQueue => {
    const asService = async <T>(sql: string, params: unknown[]) =>
      db.transaction(async (tx) => {
        await tx.exec('set local role service_role');
        return (await tx.query<T>(sql, params)).rows;
      });
    return {
      claim: async (batch, lease) => asService<Claim>('select * from public.account_deletions_claim($1, $2)', [batch, lease]),
      report: async (id, outcome, error) => (await asService<{ s: string | null }>('select public.account_deletions_report($1, $2, $3) as s', [id, outcome, error ?? null]))[0].s,
      cleanup: async (days) => (await asService<{ n: number }>('select public.account_deletions_cleanup($1) as n', [days]))[0].n,
    };
  };
  const status = async (u: string) => (await db.query<{ status: string }>('select status from public.account_deletions where distinct_id = $1', [u])).rows[0]?.status;

  it('deleted accounts end up done; PostHog’s outage only delays them', async () => {
    const withData = '00000000-0000-4000-8000-00000000d001';
    const noData = '00000000-0000-4000-8000-00000000d002';
    for (const u of [withData, noData]) {
      await addUser(db, u);
      await db.query('select public.admin_delete_account($1)', [u]);
    }
    const ph = fakePostHog({ people: new Set([withData]) });
    let down = true;
    const outage = fakePostHog({ people: ph.people, failLookup: () => (down ? 503 : null) });
    const client = (f: typeof ph) => postHogPersons({ host: 'https://eu.posthog.com', projectId: '1', apiKey: KEY }, f.fetchImpl);

    // PostHog is down: both rows wait, with the error recorded.
    await processBatch(sqlQueue(), client(outage));
    assert.deepEqual([await status(withData), await status(noData)], ['pending', 'pending']);
    const err = (await db.query<{ e: string }>('select last_error as e from public.account_deletions where distinct_id = $1', [withData])).rows[0].e;
    assert.match(err, /^posthog lookup 503/);
    assert.doesNotMatch(err, /d001|secret body/);

    // Back up: the person is submitted, the empty one completes.
    down = false;
    await db.query(`update public.account_deletions set next_attempt_at = now() - interval '1 second'`);
    await processBatch(sqlQueue(), client(ph));
    assert.deepEqual([await status(withData), await status(noData)], ['verifying', 'done']);

    // The check confirms the person is gone.
    await db.query(`update public.account_deletions set next_attempt_at = now() - interval '1 second' where status <> 'done'`);
    await processBatch(sqlQueue(), client(ph));
    assert.equal(await status(withData), 'done');
    assert.equal(ph.people.size, 0);
  });
});

describe('secrets stay on the server', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return name === 'node_modules' || name === '__tests__' ? [] : files(p);
      return /\.(ts|tsx|js|json)$/.test(name) ? [p] : [];
    });

  it('no app code mentions the worker’s secrets, and no EXPO_PUBLIC_ variable carries a personal key or secret', () => {
    const hits: string[] = [];
    for (const f of [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src')), join(ROOT, 'app.json'), join(ROOT, 'app.config.js'), join(ROOT, 'eas.json')]) {
      let text: string;
      try {
        text = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      if (/POSTHOG_PERSONAL_API_KEY|DELETION_WORKER_SECRET|SUPABASE_SERVICE_ROLE_KEY|account_deletions_(claim|report|cleanup)/.test(text)) hits.push(relative(ROOT, f));
      if (/EXPO_PUBLIC_[A-Z_]*(PERSONAL|SECRET|SERVICE_ROLE)/.test(text)) hits.push(`${relative(ROOT, f)} (EXPO_PUBLIC_ secret)`);
    }
    assert.deepEqual(hits, []);
  });

  it('the function never logs ids, keys or response bodies', () => {
    const index = readFileSync(join(ROOT, 'supabase', 'functions', 'posthog-deletion', 'index.ts'), 'utf8');
    for (const m of index.matchAll(/console\.(log|error|warn)\(([^;]*)\);/g)) {
      assert.doesNotMatch(m[2], /distinct|claim\b|text\b|KEY|SECRET|stack/, m[0]);
    }
  });
});
