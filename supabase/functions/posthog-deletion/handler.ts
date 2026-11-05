/**
 * PostHog deletion worker — the testable core of the posthog-deletion Edge Function (index.ts is the Deno wrapper).
 *
 * Each run: check the shared secret, claim a bounded batch from public.account_deletions, and for every row, on its
 * own (one failure never stops the rest):
 *   submit phase  look the person up by exact distinct id → none: done (nothing to delete)
 *                                                          → found: ask PostHog to delete the person with their events
 *                                                            and recordings → verifying
 *   verify phase  look the person up again → none: done; still there: back to pending (sent again; idempotent)
 * Any error is reported as 'retry'; the database applies the backoff and, after max attempts, marks the row failed.
 * Finally, ids of rows completed more than 30 days ago are erased.
 *
 * PostHog API (checked against PostHog's source, posthog/api/person.py, 2026-11-06):
 *   GET  /api/projects/:project_id/persons/?distinct_id=<id>  exact match on any of a person's distinct ids;
 *        no matching person → empty `results`. Needs scope person:read.
 *   POST /api/projects/:project_id/persons/bulk_delete/  JSON {distinct_ids: [...≤1000], delete_events, delete_recordings}
 *        → 202. Needs scope person:write. Events and recordings are QUEUED for deletion and removed later by PostHog;
 *        only events captured before the request are deleted.
 * A 404 from these endpoints means a wrong host or project id, not "no person": it is an error, never "done".
 *
 * Privacy: nothing here logs or stores a distinct id, a response body or a key. Errors are reduced to an HTTP status
 * and PostHog's short error code.
 */

export type Phase = 'submit' | 'verify';
export type Outcome = 'submitted' | 'gone' | 'still_present' | 'retry';

export interface Claim {
  id: string;
  distinct_id: string;
  phase: Phase;
  attempts: number;
}

/** The database side (service-role RPCs in 20261106120100_account_deletions.sql). */
export interface DeletionQueue {
  claim(batch: number, leaseSeconds: number): Promise<Claim[]>;
  report(id: string, outcome: Outcome, error?: string | null): Promise<string | null>;
  cleanup(days: number): Promise<number>;
}

/** The PostHog side. */
export interface PostHogPersons {
  /** Whether a person with exactly this distinct id exists. Throws PostHogError on any failure. */
  exists(distinctId: string): Promise<boolean>;
  /** Asks PostHog to delete the person, their events and their recordings. Throws PostHogError unless accepted. */
  requestDeletion(distinctId: string): Promise<void>;
}

export class PostHogError extends Error {
  /** A short, personal-data-free description for account_deletions.last_error. */
  readonly safe: string;
  constructor(safe: string) {
    super(safe);
    this.safe = safe.slice(0, 300);
  }
}

export interface PostHogConfig {
  host: string;
  projectId: string;
  apiKey: string;
}

type Fetch = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number;
  ok: boolean;
  text(): Promise<string>;
}>;

/**
 * PostHog's private API lives on the app host (https://us.posthog.com, https://eu.posthog.com or a self-hosted
 * origin), not the ingestion host the app sends events to (us.i.posthog.com). Accept either and use the app host.
 * Returns null for anything that isn't an https origin.
 */
export function apiHost(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^(us|eu)\.i\.posthog\.com$/, '$1.posthog.com').replace(/^(us|eu)-assets\.i\.posthog\.com$/, '$1.posthog.com');
  return `https://${host}${url.port ? `:${url.port}` : ''}`;
}

/** Reads and checks the PostHog settings. Returns a reason instead of throwing, so the worker can say what's missing. */
export function postHogConfig(env: (name: string) => string | undefined): PostHogConfig | { missing: string } {
  const key = env('POSTHOG_PERSONAL_API_KEY')?.trim();
  const projectId = env('POSTHOG_PROJECT_ID')?.trim();
  const host = apiHost(env('POSTHOG_HOST') ?? '');
  if (!key) return { missing: 'POSTHOG_PERSONAL_API_KEY' };
  // A personal API key starts with phx_. The project key (phc_) the app uses can't delete anything.
  if (!key.startsWith('phx_')) return { missing: 'POSTHOG_PERSONAL_API_KEY (must be a personal API key, phx_…)' };
  if (!projectId || !/^\d+$/.test(projectId)) return { missing: 'POSTHOG_PROJECT_ID (numeric project id)' };
  if (!host) return { missing: 'POSTHOG_HOST (https origin, e.g. https://us.posthog.com)' };
  return { host, projectId, apiKey: key };
}

/** A safe one-line description of a failed PostHog response: status and PostHog's error code only. */
async function describe(res: { status: number; text(): Promise<string> }, what: string): Promise<string> {
  let code = '';
  try {
    const body = JSON.parse(await res.text()) as { code?: unknown; type?: unknown };
    // PostHog's specific `code` wins over its broader `type`.
    for (const v of [body.type, body.code]) if (typeof v === 'string' && /^[a-z_]{1,40}$/.test(v)) code = ` ${v}`;
  } catch {
    // Not JSON: say nothing more.
  }
  const hint =
    res.status === 401 || res.status === 403 ? ' (check the personal API key and its person:read/person:write scopes)'
    : res.status === 404 ? ' (check POSTHOG_HOST and POSTHOG_PROJECT_ID)'
    : res.status === 429 ? ' (rate limited)'
    : '';
  return `posthog ${what} ${res.status}${code}${hint}`;
}

export function postHogPersons(config: PostHogConfig, fetchImpl: Fetch, timeoutMs = 15_000): PostHogPersons {
  const base = `${config.host}/api/projects/${encodeURIComponent(config.projectId)}/persons`;
  const headers = { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' };
  const send = async (url: string, init: { method: string; body?: string }, what: string) => {
    try {
      return await fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      const name = e instanceof Error ? e.name : 'Error';
      throw new PostHogError(`posthog ${what} network ${name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'error'}`);
    }
  };
  return {
    async exists(distinctId) {
      const res = await send(`${base}/?distinct_id=${encodeURIComponent(distinctId)}`, { method: 'GET' }, 'lookup');
      if (!res.ok) throw new PostHogError(await describe(res, 'lookup'));
      let body: { results?: unknown };
      try {
        body = JSON.parse(await res.text()) as { results?: unknown };
      } catch {
        throw new PostHogError('posthog lookup returned invalid JSON');
      }
      if (!Array.isArray(body.results)) throw new PostHogError('posthog lookup returned no results list');
      // PostHog filters exactly; still, only count persons that really carry this id.
      return body.results.some((p) => {
        const ids = (p as { distinct_ids?: unknown } | null)?.distinct_ids;
        return Array.isArray(ids) ? ids.includes(distinctId) : true;
      });
    },
    async requestDeletion(distinctId) {
      const res = await send(
        `${base}/bulk_delete/`,
        { method: 'POST', body: JSON.stringify({ distinct_ids: [distinctId], delete_events: true, delete_recordings: true }) },
        'delete',
      );
      if (res.status !== 202 && res.status !== 200) throw new PostHogError(await describe(res, 'delete'));
    },
  };
}

export interface BatchSummary {
  claimed: number;
  submitted: number;
  done: number;
  resent: number;
  retried: number;
  failed: number;
  cleaned: number;
}

export async function processBatch(queue: DeletionQueue, posthog: PostHogPersons, opts: { batch?: number; leaseSeconds?: number; retentionDays?: number } = {}): Promise<BatchSummary> {
  const claims = await queue.claim(opts.batch ?? 20, opts.leaseSeconds ?? 300);
  const summary: BatchSummary = { claimed: claims.length, submitted: 0, done: 0, resent: 0, retried: 0, failed: 0, cleaned: 0 };
  for (const c of claims) {
    let outcome: Outcome;
    let error: string | null = null;
    try {
      const present = await posthog.exists(c.distinct_id);
      if (!present) outcome = 'gone';
      else if (c.phase === 'verify') outcome = 'still_present';
      else {
        await posthog.requestDeletion(c.distinct_id);
        outcome = 'submitted';
      }
    } catch (e) {
      outcome = 'retry';
      error = e instanceof PostHogError ? e.safe : 'worker error';
    }
    try {
      const status = await queue.report(c.id, outcome, error);
      if (status === 'failed') summary.failed++;
      else if (outcome === 'gone') summary.done++;
      else if (outcome === 'submitted') summary.submitted++;
      else if (outcome === 'still_present') summary.resent++;
      else summary.retried++;
    } catch {
      // The claim expires after its lease and the row is picked up again; nothing is lost.
      summary.retried++;
    }
  }
  summary.cleaned = await queue.cleanup(opts.retentionDays ?? 30);
  return summary;
}

/** Constant-time comparison, so response timing doesn't reveal how much of a guessed secret was right. */
export function sameSecret(given: string | null | undefined, expected: string): boolean {
  if (!given) return false;
  const enc = new TextEncoder();
  const a = enc.encode(given);
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i % a.length] ?? 0) ^ (b[i % b.length] ?? 0);
  return diff === 0;
}

export const SECRET_HEADER = 'x-deletion-worker-secret';

export interface WorkerDeps {
  env(name: string): string | undefined;
  queue: DeletionQueue;
  /** Builds the PostHog client once the configuration is known to be complete. */
  posthog(config: PostHogConfig): PostHogPersons;
}

/** The whole request: method, secret, configuration, then one batch. Never does any work before the secret matches. */
export async function handleWorkerRequest(req: { method: string; header(name: string): string | null }, deps: WorkerDeps): Promise<{ status: number; body: Record<string, unknown> }> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'method' } };
  const secret = deps.env('DELETION_WORKER_SECRET');
  // Refuse to run unprotected: a missing secret is a deployment error, not "open to everyone".
  if (!secret || secret.length < 32) return { status: 503, body: { error: 'not_configured' } };
  if (!sameSecret(req.header(SECRET_HEADER), secret)) return { status: 401, body: { error: 'unauthorized' } };
  const config = postHogConfig(deps.env);
  // Without PostHog settings, leave the queue alone: claiming would only burn attempts.
  if ('missing' in config) return { status: 503, body: { error: 'posthog_not_configured', missing: config.missing } };
  const summary = await processBatch(deps.queue, deps.posthog(config));
  return { status: 200, body: { ...summary } };
}
