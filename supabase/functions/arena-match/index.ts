// Game of the Week — server-run Strategy Arena matches.
//
// The device sends one action at a time; this function replays the match from its stored action log with the shared
// engines (src/arena, the same code the app runs in practice), checks the new action, runs the opponent, and stores
// the action — plus the server-computed score once the match ends — through two SQL functions that only the service
// role can call (public.arena_match_load / public.arena_match_commit; supabase/migrations/20261105120000_*.sql).
// The seed and the hidden information never leave the server while the match is in play.
//
// Deploy:  npx supabase functions deploy arena-match   (from the repository root; see docs/GAME_OF_THE_WEEK.md)
// Env:     SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the Edge runtime. Never ship either key in the app.
//
// No third-party imports: plain fetch to Auth (/auth/v1/user, to verify the caller's JWT) and PostgREST (/rest/v1/rpc).

import { type ArenaStore, handleArenaRequest } from '../../../src/competition/arena-handler.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): unknown };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`arena-match: missing ${name}`);
  return v;
}

/** The caller's user id from their access token, verified by Supabase Auth — or null. */
async function verifiedUser(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, { headers: { Authorization: auth, apikey: env('SUPABASE_SERVICE_ROLE_KEY') } });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: unknown };
  return typeof user.id === 'string' ? user.id : null;
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`arena-match: ${fn} failed (${res.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const store: ArenaStore = {
  async load(matchId, userId) {
    return (await rpc('arena_match_load', { p_match: matchId, p_user: userId })) as Awaited<ReturnType<ArenaStore['load']>>;
  },
  async commit(r) {
    return (await rpc('arena_match_commit', { p_match: r.matchId, p_user: r.userId, p_step: r.step, p_action: r.action, p_final: r.final })) as Awaited<ReturnType<ArenaStore['commit']>>;
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  try {
    const userId = await verifiedUser(req);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_request' });
    }
    const out = await handleArenaRequest(userId, body, store);
    if (out.status >= 500) console.error('arena-match', JSON.stringify({ userId, body, out }));
    return json(out.status, out.body);
  } catch (e) {
    // Logged with context for the dashboard's function logs; the device gets a retryable error.
    console.error('arena-match: unexpected', e instanceof Error ? e.stack ?? e.message : String(e));
    return json(503, { error: 'unavailable' });
  }
});
