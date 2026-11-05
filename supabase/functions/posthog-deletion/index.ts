// PostHog deletion worker — deletes deleted accounts' PostHog persons, events and recordings.
//
// Called every 15 minutes by pg_cron through pg_net (supabase/scheduler.sql), never by the app. The work itself is in
// handler.ts (tested in supabase/__tests__/posthog-deletion.test.ts); this file only wires Deno, the environment and
// the two service-role RPCs. docs/ACCOUNT_DELETION.md has the full design and the deployment steps.
//
// Deploy:  npx supabase functions deploy posthog-deletion --no-verify-jwt
//          (verify_jwt is off because the caller is pg_cron, not a user; the shared secret below is checked first)
// Secrets (Supabase function secrets — NEVER in the app or any EXPO_PUBLIC_ variable):
//   DELETION_WORKER_SECRET    random, ≥ 32 characters; the same value is stored in Vault for the cron job
//   POSTHOG_PERSONAL_API_KEY  a personal API key (phx_…) scoped to this project with person:read and person:write only
//   POSTHOG_PROJECT_ID        the numeric project id
//   POSTHOG_HOST              https://us.posthog.com or https://eu.posthog.com (the app host, not *.i.posthog.com)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the Edge runtime.
//
// Logs carry counts only — never a user id, a PostHog response body or a key.

import { type Claim, type DeletionQueue, handleWorkerRequest, postHogPersons } from './handler.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): unknown };

const env = (name: string) => Deno.env.get(name);

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('posthog-deletion: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  // The status only: a PostgREST error body could echo arguments.
  if (!res.ok) throw new Error(`posthog-deletion: ${fn} failed (${res.status})`);
  return text ? JSON.parse(text) : null;
}

const queue: DeletionQueue = {
  claim: async (batch, leaseSeconds) => (await rpc('account_deletions_claim', { batch, lease_seconds: leaseSeconds })) as Claim[],
  report: async (id, outcome, error) => (await rpc('account_deletions_report', { p_id: id, p_outcome: outcome, p_error: error ?? null })) as string | null,
  cleanup: async (days) => (await rpc('account_deletions_cleanup', { days })) as number,
};

Deno.serve(async (req) => {
  try {
    const out = await handleWorkerRequest(
      { method: req.method, header: (name) => req.headers.get(name) },
      { env, queue, posthog: (config) => postHogPersons(config, fetch) },
    );
    if (out.status === 200) console.log('posthog-deletion', JSON.stringify(out.body));
    else if (out.status !== 401 && out.status !== 405) console.error('posthog-deletion', JSON.stringify(out.body));
    return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('posthog-deletion: unexpected', e instanceof Error ? e.message : 'error');
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
});
