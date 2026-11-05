-- Account deletion, including the player's PostHog analytics data.
--
-- delete_my_account() (20261028140000) deletes the Supabase account and, by cascade, everything tied to it. Analytics
-- live in PostHog, keyed by the same id (the Supabase user UUID is the PostHog distinct id: src/observability/core.ts
-- identifies with it and nothing else). PostHog can be down or slow, and the app must not wait on it, so deletion
-- there goes through a queue:
--
--   1. delete_my_account() adds a row to public.account_deletions IN THE SAME TRANSACTION as deleting the account.
--      Both happen or neither does; a deleted account always leaves a PostHog deletion request behind.
--   2. The posthog-deletion Edge Function (supabase/functions/posthog-deletion), called every 15 minutes by pg_cron
--      (supabase/scheduler.sql), claims a small batch, asks PostHog to delete each person with their events and
--      recordings, and reports back here.
--   3. PostHog accepts deletions asynchronously (HTTP 202; events and recordings are deleted later by PostHog's own
--      queue). A row therefore goes pending → processing → verifying → done: "done" means a later check found no
--      PostHog person for that id any more — not merely that a request was sent. Event and recording removal after
--      that point is PostHog's responsibility and can't be observed through its API.
--
-- Statuses
--   pending     waiting to send the deletion request to PostHog (also: resend after a failed check)
--   processing  claimed by a worker that is sending the request (a lease; a crashed worker's claim expires)
--   verifying   PostHog accepted the request; waiting to confirm the person is gone
--   done        no PostHog person exists for this id (deleted, or there never was one)
--   failed      gave up after max attempts — visible in public.account_deletions_health, never silently dropped;
--               public.account_deletions_retry_failed() puts failed rows back in the queue after the cause is fixed
--
-- What is stored: the Supabase user id (needed to find the PostHog person) and a SHA-256 fingerprint of it. No email,
-- no nickname, no name. Thirty days after a row is done, the id itself is erased and only the fingerprint stays: it
-- lets support answer "was this account's analytics deletion completed?" for someone who still knows their id, and
-- cannot be turned back into the id by us. Failed rows keep the id, because retrying needs it.
--
-- Access: RLS on with no policies, and no grants to anon/authenticated. Only the service role (the Edge Function) and
-- the database owner (SQL Editor) can read or change it. The worker uses the functions below, not the table.

create table public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  -- The PostHog distinct id = the deleted Supabase user's UUID, as text. No foreign key: that user row is deleted in
  -- the same transaction. Erased (null) 30 days after completion.
  distinct_id text check (distinct_id is null or distinct_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  -- SHA-256 (hex) of distinct_id; kept after the id is erased. One-way: it identifies a row only for someone who
  -- already has the id.
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  source text not null default 'app' check (source in ('app', 'admin')),
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processing', 'verifying', 'done', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  -- A worker's claim on the row. While it is in the future no other worker can take the row.
  claimed_until timestamptz,
  -- When PostHog last accepted a deletion request for this id.
  posthog_requested_at timestamptz,
  -- Short, technical and free of personal data: an HTTP status and PostHog's error code, never a response body.
  last_error text check (last_error is null or length(last_error) <= 300),
  completed_at timestamptz,
  constraint account_deletions_done check ((status = 'done') = (completed_at is not null)),
  constraint account_deletions_id_kept check (distinct_id is not null or status = 'done')
);
create unique index account_deletions_fingerprint on public.account_deletions (fingerprint);
create index account_deletions_due on public.account_deletions (next_attempt_at) where status in ('pending', 'processing', 'verifying');

alter table public.account_deletions enable row level security;
-- Supabase's default privileges give anon, authenticated AND service_role everything on new public tables; take it all
-- back, then let the worker's role read only. Writes go through the functions below.
revoke all on table public.account_deletions from public, anon, authenticated, service_role;
grant select on table public.account_deletions to service_role;

-- Most attempts before a row is marked failed. With the backoff below this is about a week of retrying.
create or replace function public.account_deletion_max_attempts() returns integer
language sql immutable set search_path = '' as $$ select 12 $$;

-- Wait before the next try, after `attempts` tries: 5 min, 30 min, 2 h, 12 h, then daily.
create or replace function public.account_deletion_backoff(attempts integer) returns interval
language sql immutable set search_path = '' as $$
  select case
    when attempts <= 1 then interval '5 minutes'
    when attempts = 2 then interval '30 minutes'
    when attempts = 3 then interval '2 hours'
    when attempts = 4 then interval '12 hours'
    else interval '24 hours'
  end
$$;

-- The row's one-way fingerprint: SHA-256 (hex) of the id as text. sha256() is built into PostgreSQL 11+.
create or replace function public.account_deletion_fingerprint(uid uuid) returns text
language sql immutable set search_path = '' as $$ select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(uid::text, 'UTF8')), 'hex') $$;

-- Queue a PostHog deletion for a user id. Safe to call twice for the same id: the second call changes nothing
-- (a row that is done or failed is put back to pending, since someone asked again).
create or replace function public.queue_account_deletion(uid uuid, src text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  fp text := public.account_deletion_fingerprint(uid);
begin
  insert into public.account_deletions (distinct_id, fingerprint, source)
  values (uid::text, fp, src)
  on conflict (fingerprint) do update
    set distinct_id = excluded.distinct_id,
        status = case when public.account_deletions.status in ('done', 'failed') then 'pending' else public.account_deletions.status end,
        completed_at = case when public.account_deletions.status in ('done', 'failed') then null else public.account_deletions.completed_at end,
        attempts = case when public.account_deletions.status in ('done', 'failed') then 0 else public.account_deletions.attempts end,
        next_attempt_at = case when public.account_deletions.status in ('done', 'failed') then now() else public.account_deletions.next_attempt_at end;
end;
$$;

-- The one place an account is deleted: the PostHog request is queued first, in the same transaction.
create or replace function public.delete_account_and_queue(uid uuid, src text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.queue_account_deletion(uid, src);
  delete from auth.users where id = uid;
  if not found then
    raise exception 'account:not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- As before (20261028140000): the caller's own account only, from the verified JWT. Now also queues the PostHog
-- deletion, atomically. The response is unchanged.
create or replace function public.delete_my_account() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'account:not_signed_in' using errcode = '28000';
  end if;
  perform public.delete_account_and_queue(uid, 'app');
  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- For a deletion request that arrives outside the app (support email, the website's deletion page). Run by an
-- authorized administrator in the SQL Editor (database owner) after verifying the requester owns the account — see
-- docs/ACCOUNT_DELETION.md. Takes the user id; it is NOT callable by any client role or by the Edge Functions.
create or replace function public.admin_delete_account(target uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if target is null then
    raise exception 'account:no_user' using errcode = '22004';
  end if;
  perform public.delete_account_and_queue(target, 'admin');
  return jsonb_build_object('deleted', true, 'user_id', target);
end;
$$;

-- ── Worker functions (service role only) ─────────────────────────────────────────────────────────────────────────

-- Claims up to `batch` due rows for `lease_seconds`. Rows another worker holds are skipped (FOR UPDATE SKIP LOCKED
-- plus the lease), so two overlapping runs never process the same row. Each claim counts as an attempt.
-- `phase` tells the worker what to do: 'submit' (send the deletion) or 'verify' (check the person is gone).
create or replace function public.account_deletions_claim(batch integer default 20, lease_seconds integer default 300)
returns table (id uuid, distinct_id text, phase text, attempts integer)
language plpgsql volatile security definer set search_path = '' as $$
begin
  return query
  with due as (
    select d.id from public.account_deletions d
    where d.next_attempt_at <= now()
      and d.distinct_id is not null
      and (d.status in ('pending', 'verifying') or (d.status = 'processing' and d.claimed_until < now()))
      and (d.claimed_until is null or d.claimed_until < now())
    order by d.next_attempt_at
    limit greatest(1, least(batch, 100))
    for update skip locked
  )
  update public.account_deletions d
     set claimed_until = now() + make_interval(secs => greatest(30, least(lease_seconds, 3600))),
         attempts = d.attempts + 1,
         status = case when d.status = 'verifying' then 'verifying' else 'processing' end
    from due
   where d.id = due.id
  returning d.id, d.distinct_id, case when d.status = 'verifying' then 'verify' else 'submit' end, d.attempts;
end;
$$;

-- Records the result of one claimed row.
--   'submitted'      PostHog accepted the deletion → verifying, checked again after the backoff
--   'gone'           PostHog has no person for this id → done
--   'still_present'  a check found the person still there → pending (resend; PostHog deletion is idempotent)
--   'retry'          a transient or configuration error → same phase, after the backoff
-- After max attempts a row that hasn't reached done becomes failed. Unknown ids or rows not claimed are ignored.
create or replace function public.account_deletions_report(p_id uuid, p_outcome text, p_error text default null)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.account_deletions%rowtype;
  next_status text;
  err text := left(nullif(btrim(coalesce(p_error, '')), ''), 300);
begin
  if p_outcome not in ('submitted', 'gone', 'still_present', 'retry') then
    raise exception 'account_deletions: unknown outcome %', p_outcome using errcode = '22023';
  end if;
  select * into r from public.account_deletions where id = p_id for update;
  if not found or r.status not in ('processing', 'verifying') then
    return null;
  end if;

  if p_outcome = 'gone' then
    update public.account_deletions
       set status = 'done', completed_at = now(), claimed_until = null, last_error = null
     where id = p_id;
    return 'done';
  end if;

  next_status := case
    when p_outcome = 'submitted' then 'verifying'
    when p_outcome = 'still_present' then 'pending'
    when r.status = 'verifying' then 'verifying'
    else 'pending'
  end;
  if r.attempts >= public.account_deletion_max_attempts() and p_outcome <> 'submitted' then
    next_status := 'failed';
  end if;

  update public.account_deletions
     set status = next_status,
         claimed_until = null,
         next_attempt_at = now() + public.account_deletion_backoff(r.attempts),
         posthog_requested_at = case when p_outcome = 'submitted' then now() else posthog_requested_at end,
         last_error = case
           when p_outcome = 'submitted' then null
           when p_outcome = 'still_present' then 'posthog: person still present after deletion request'
           else coalesce(err, 'unknown error')
         end
   where id = p_id;
  return next_status;
end;
$$;

-- Erases the user id from rows completed more than `days` days ago (the fingerprint stays). Returns how many.
create or replace function public.account_deletions_cleanup(days integer default 30) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.account_deletions
     set distinct_id = null
   where status = 'done' and distinct_id is not null and completed_at < now() - make_interval(days => greatest(days, 1));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- For operators: put failed rows back in the queue once the cause (e.g. a wrong API key) is fixed.
create or replace function public.account_deletions_retry_failed() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.account_deletions
     set status = 'pending', attempts = 0, next_attempt_at = now(), claimed_until = null
   where status = 'failed';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- For operators: is the queue healthy? Expect failed = 0 and no pending row older than a day.
create or replace view public.account_deletions_health with (security_invoker = true) as
  select status,
         count(*)::integer as count,
         min(requested_at) as oldest_requested,
         max(attempts) as max_attempts,
         (array_agg(last_error order by requested_at) filter (where last_error is not null))[1] as example_error
  from public.account_deletions
  group by status;

revoke all on public.account_deletions_health from public, anon, authenticated, service_role;

revoke all on function
  public.account_deletion_max_attempts(),
  public.account_deletion_backoff(integer),
  public.account_deletion_fingerprint(uuid),
  public.queue_account_deletion(uuid, text),
  public.delete_account_and_queue(uuid, text),
  public.admin_delete_account(uuid),
  public.account_deletions_claim(integer, integer),
  public.account_deletions_report(uuid, text, text),
  public.account_deletions_cleanup(integer),
  public.account_deletions_retry_failed()
-- service_role too (Supabase grants it new functions by default): the worker may only claim, report and clean up.
from public, anon, authenticated, service_role;

grant execute on function
  public.account_deletions_claim(integer, integer),
  public.account_deletions_report(uuid, text, text),
  public.account_deletions_cleanup(integer)
to service_role;
