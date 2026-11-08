-- Tournament progress per account, and the aggregate numbers behind "only 9% of players read this correctly".
--
-- The app keeps its progress document on the device (src/features/tournament/store.ts) and, for a signed-in player,
-- merges it with this copy and writes the merge back (src/tournament/progress.ts `mergeProgress`: wins, stars and
-- checks only ever add up, so merging copies from two phones never loses anything). Guests have no server copy.
-- The row goes with the account (on delete cascade), like every other per-player table.
--
-- get_tournament_stats() publishes per-match counts across all players, and only for a match at least 200 players
-- have played: smaller groups are neither meaningful nor anonymous enough.

create table public.tournament_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  progress jsonb not null check (jsonb_typeof(progress) = 'object' and octet_length(progress::text) <= 262144),
  updated_at timestamptz not null default now()
);

create trigger tournament_progress_touch before update on public.tournament_progress
  for each row execute function public.touch_updated_at();

-- Read and written only through the functions below.
alter table public.tournament_progress enable row level security;
revoke all on public.tournament_progress from anon, authenticated;

-- The caller's progress document, or null when they have none yet.
create or replace function public.get_my_tournament() returns jsonb
language sql stable security definer set search_path = '' as $$
  select t.progress from public.tournament_progress t where t.user_id = game_engine.require_user();
$$;

-- Replace the caller's progress document with the (already merged) one sent.
create or replace function public.save_my_tournament(progress jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
begin
  if progress is null or jsonb_typeof(progress) <> 'object' or jsonb_typeof(progress -> 'matches') <> 'object' then
    raise exception 'tournament: a progress document is an object with matches' using errcode = '22023';
  end if;
  insert into public.tournament_progress as t (user_id, progress) values (uid, progress)
  on conflict (user_id) do update set progress = excluded.progress;
  return jsonb_build_object('ok', true);
end;
$$;

-- { "<match id>": { "players": n, "won": n, "read": n } } for matches with at least 200 players.
create or replace function public.get_tournament_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(match_id, jsonb_build_object('players', players, 'won', won, 'read', read)), '{}'::jsonb)
  from (
    select m.key as match_id,
           count(*)::int as players,
           count(*) filter (where (m.value ->> 'won')::boolean)::int as won,
           count(*) filter (where (m.value ->> 'read')::boolean)::int as read
    from public.tournament_progress t, jsonb_each(t.progress -> 'matches') m
    where jsonb_typeof(m.value) = 'object'
    group by m.key
    having count(*) >= 200
  ) s;
$$;

revoke all on function public.get_my_tournament() from public, anon;
revoke all on function public.save_my_tournament(jsonb) from public, anon;
revoke all on function public.get_tournament_stats() from public;
grant execute on function public.get_my_tournament() to authenticated;
grant execute on function public.save_my_tournament(jsonb) to authenticated;
grant execute on function public.get_tournament_stats() to anon, authenticated;
