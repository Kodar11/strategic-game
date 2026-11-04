-- Strategy Arena match summaries: one row per finished Arena match, so Arena play is no longer device-only.
--
-- The 18 Arena games run entirely on the device (src/arena) and keep their records there
-- (src/features/arena/records.ts). This adds a server copy of each finished match's *summary* — what the result
-- screen already shows — for match history, the profile and later aggregate analysis. Nothing here is a game state:
-- no seed, no rounds, no hidden roles or private information, and no bot decision data.
--
-- Arena results are the player's own and unverified (the device ran the match), exactly like game_practice_results;
-- they are private and never ranked.
--
-- Writes: only through record_arena_matches (below), which takes the caller from the verified JWT, so a request can't
-- write for anyone else. The device's id for each match is the primary key and `on conflict do nothing` makes a
-- retried or replayed upload a no-op. There is no update or delete path for clients; rows go with the account
-- (`on delete cascade` from auth.users, so delete_my_account removes them).
-- Reads: the owner only (row level security), and nobody else — not even other signed-in players.

create table public.arena_matches (
  -- The device's id for the match (a UUID made when the match finished), so a retried upload is recorded once.
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null check (game_id in (
    'cooperation', 'ultimatum-game', 'auction', 'market', 'signal', 'mole', 'commons', 'coalition', 'inspector',
    'travelers', 'saboteur', 'bluff', 'defusal', 'power-play', 'last-stand', 'liars-dice', 'codebreaker', 'gambit')),
  -- The opponent personality the match was played against (revealed to the player at the end of every match).
  opponent text not null check (opponent ~ '^[a-z][a-z-]{1,31}$'),
  level text not null check (level in ('easy', 'normal', 'hard')),
  variant text not null check (variant ~ '^[a-z][a-z-]{1,31}$'),
  match_length text not null check (match_length in ('short', 'standard', 'long')),
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  player_score integer not null check (player_score between -10000 and 100000),
  rival_score integer not null check (rival_score between -10000 and 100000),
  rounds_played integer not null check (rounds_played between 0 and 200),
  -- When the match finished, by the device clock (bounded below, so it can't claim to be from the future).
  played_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  check (played_at <= recorded_at + interval '1 day')
);
create index arena_matches_user_idx on public.arena_matches (user_id, played_at desc);

alter table public.arena_matches enable row level security;
revoke all on public.arena_matches from anon, authenticated;
grant select on public.arena_matches to authenticated;
create policy arena_matches_owner_read on public.arena_matches for select to authenticated using (user_id = (select auth.uid()));

-- Records a batch of finished matches for the caller: { "matches": [ { id, game, opponent, level, variant, length,
-- outcome, playerScore, rivalScore, rounds, playedAt (ms since epoch) }, … ] }, at most 50 per call. Validates every
-- entry before writing any (a bad batch writes nothing), ignores ids already recorded, and returns how many were new.
create or replace function public.record_arena_matches(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  items jsonb := request -> 'matches';
  m jsonb;
  added integer;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 50 then
    raise exception 'arena:invalid_request' using errcode = 'P0001';
  end if;
  for m in select * from jsonb_array_elements(items) loop
    if jsonb_typeof(m) is distinct from 'object'
       or coalesce(m ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(m -> 'game') is distinct from 'string'
       or jsonb_typeof(m -> 'opponent') is distinct from 'string'
       or jsonb_typeof(m -> 'variant') is distinct from 'string'
       or coalesce(m ->> 'level', '') not in ('easy', 'normal', 'hard')
       or coalesce(m ->> 'length', '') not in ('short', 'standard', 'long')
       or coalesce(m ->> 'outcome', '') not in ('win', 'loss', 'draw')
       or jsonb_typeof(m -> 'playerScore') is distinct from 'number'
       or jsonb_typeof(m -> 'rivalScore') is distinct from 'number'
       or jsonb_typeof(m -> 'rounds') is distinct from 'number'
       or jsonb_typeof(m -> 'playedAt') is distinct from 'number'
       or (m ->> 'playedAt')::numeric < 1735689600000 -- 2025-01-01: older than the app
    then
      raise exception 'arena:invalid_request' using errcode = 'P0001';
    end if;
  end loop;
  if (select count(*) from public.arena_matches where user_id = uid and recorded_at > now() - interval '1 day') + jsonb_array_length(items) > 500 then
    raise exception 'arena:rate_limited' using errcode = 'P0001';
  end if;
  begin
    insert into public.arena_matches (id, user_id, game_id, opponent, level, variant, match_length, outcome, player_score, rival_score, rounds_played, played_at)
    select (x ->> 'id')::uuid, uid, x ->> 'game', x ->> 'opponent', x ->> 'level', x ->> 'variant', x ->> 'length', x ->> 'outcome',
           round((x ->> 'playerScore')::numeric)::integer, round((x ->> 'rivalScore')::numeric)::integer, round((x ->> 'rounds')::numeric)::integer,
           to_timestamp((x ->> 'playedAt')::numeric / 1000.0)
    from jsonb_array_elements(items) x
    on conflict (id) do nothing;
  exception when check_violation or numeric_value_out_of_range or invalid_text_representation then
    raise exception 'arena:invalid_request' using errcode = 'P0001';
  end;
  get diagnostics added = row_count;
  return jsonb_build_object('recorded', added);
end;
$$;

-- The caller's own recent Arena summaries (newest first, at most 100), for history and the profile.
create or replace function public.get_my_arena_matches() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'game', a.game_id, 'opponent', a.opponent, 'level', a.level, 'variant', a.variant, 'length', a.match_length,
    'outcome', a.outcome, 'playerScore', a.player_score, 'rivalScore', a.rival_score, 'rounds', a.rounds_played,
    'playedAt', (extract(epoch from a.played_at) * 1000)::bigint) order by a.played_at desc), '[]'::jsonb)
  from (select * from public.arena_matches where user_id = game_engine.require_user() order by played_at desc limit 100) a
$$;

revoke all on function public.record_arena_matches(jsonb), public.get_my_arena_matches() from public;
-- Supabase grants new functions to anon by default; these need a signed-in user.
revoke all on function public.record_arena_matches(jsonb), public.get_my_arena_matches() from anon;
grant execute on function public.record_arena_matches(jsonb), public.get_my_arena_matches() to authenticated;
