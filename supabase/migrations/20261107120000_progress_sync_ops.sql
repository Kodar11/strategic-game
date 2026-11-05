-- Offline-first progress sync: exactly-once application of queued operations.
--
-- The app queues every progress change on the device as one operation with a stable UUID and sends the oldest ones
-- together when it can (src/data/outbox.ts). A request can succeed on the server and still look failed to the app — the
-- answer was lost to a timeout or a dropped connection — and the app then sends the same operations again.
-- apply_progress_changes is already idempotent for inserts, but not for everything: a resent `reset` would wipe progress
-- another device made in between, and a resent in-progress record could overwrite a newer one.
--
-- apply_progress_ops records each operation id it applies, in the same transaction as the operation's changes. An id
-- it has already recorded is reported back as a duplicate and not applied again. Either an operation's changes and its
-- id land together, or neither does.
--
-- Times are the server's: completions keep `now()` from apply_progress_changes; the client's clock is never trusted.
-- Ids are kept 180 days, far longer than any operation waits on a device.

create table public.progress_sync_ops (
  user_id uuid not null references auth.users (id) on delete cascade,
  op_id uuid not null,
  applied_at timestamptz not null default now(),
  primary key (user_id, op_id)
);

create index progress_sync_ops_applied_idx on public.progress_sync_ops (user_id, applied_at);

alter table public.progress_sync_ops enable row level security;
revoke all on public.progress_sync_ops from anon, authenticated;
create policy progress_sync_ops_select_own on public.progress_sync_ops for select to authenticated using (user_id = (select auth.uid()));
create policy progress_sync_ops_insert_own on public.progress_sync_ops for insert to authenticated with check (user_id = (select auth.uid()));
create policy progress_sync_ops_delete_own on public.progress_sync_ops for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.progress_sync_ops to authenticated;

-- ops: [{ "id": "<uuid>", "changes": { …apply_progress_changes batch… } }, …], oldest first, at most 100.
-- Returns { ok, applied: [ids], duplicates: [ids], skipped }. SECURITY INVOKER: row level security scopes everything to
-- the caller, exactly like apply_progress_changes, which it calls for each new operation in order.
create or replace function public.apply_progress_ops(ops jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  op jsonb;
  r jsonb;
  n integer;
  applied jsonb := '[]'::jsonb;
  duplicates jsonb := '[]'::jsonb;
  skipped integer := 0;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if jsonb_typeof(ops) is distinct from 'array' then
    raise exception 'ops must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(ops) > 100 then
    raise exception 'too many operations in one request' using errcode = '22023';
  end if;

  for op in select value from jsonb_array_elements(ops) loop
    if jsonb_typeof(op) is distinct from 'object'
       or coalesce(op ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(op -> 'changes') is distinct from 'object' then
      raise exception 'invalid operation' using errcode = '22023';
    end if;
    -- Claim the id first: a second request carrying the same operation waits here for the first to commit, then
    -- finds the id taken and skips it.
    insert into public.progress_sync_ops (user_id, op_id) values (uid, (op ->> 'id')::uuid) on conflict do nothing;
    get diagnostics n = row_count;
    if n = 0 then
      duplicates := duplicates || to_jsonb(op ->> 'id');
      continue;
    end if;
    r := public.apply_progress_changes(op -> 'changes');
    skipped := skipped + coalesce((r ->> 'skipped')::integer, 0);
    applied := applied || to_jsonb(op ->> 'id');
  end loop;

  delete from public.progress_sync_ops where user_id = uid and applied_at < now() - interval '180 days';

  return jsonb_build_object('ok', true, 'applied', applied, 'duplicates', duplicates, 'skipped', skipped);
end;
$$;

revoke all on function public.apply_progress_ops(jsonb) from public;
revoke all on function public.apply_progress_ops(jsonb) from anon;
grant execute on function public.apply_progress_ops(jsonb) to authenticated;
