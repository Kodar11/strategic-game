-- Nickname rate limiting, on the server.
--
-- Nicknames are public (weekly boards, Hall of Fame, friend challenges), so set_nickname must not be usable to probe
-- the offensive-name list or which names are taken, or to rename every few seconds. Two limits, both counted here from
-- the server clock (now()), never from anything the client sends:
--   - at most 3 nickname CHANGES in a rolling 24 hours. Choosing the first nickname is free; saving the name the player
--     already has is not a change.
--   - at most 10 ATTEMPTS in a rolling hour, refused ones included (too short, bad characters, reserved, not allowed,
--     taken). Calls refused by the rate limit itself are not recorded, so hammering the function can't extend the wait
--     forever: the window frees itself an hour after the 10th attempt.
--
-- Why refusals are now RETURNED, not raised: a raised exception rolls back the whole request, and with it the record
-- of the refused attempt — so refused attempts could never count. set_nickname therefore answers a refusal with
-- {"refused": "games:nickname_<reason>"} (the same codes as before, plus games:nickname_rate_limited) and commits the
-- attempt record. A success is unchanged: {"nickname": "<saved name>"}. The app maps "refused" to the same errors it
-- showed before (src/data/games.ts). Errors that are not about the name (not signed in) still raise.
--
-- Concurrency: every call takes a transaction-scoped advisory lock on the caller's id before counting, so two requests
-- from one player run one after the other and can't both pass the same count. Different players never wait for each
-- other.
--
-- Unchanged: the ASCII-only character rule '^[A-Za-z0-9][A-Za-z0-9 _.-]*$' is deliberate. It keeps look-alike Unicode
-- letters (Cyrillic "а", full-width "Ａ", zero-width joiners) out entirely, so there is nothing to normalize and no
-- homoglyph can impersonate another player or Tactiqo. Uniqueness stays on nickname_key (lower case, separators
-- removed), and game_engine.nickname_problem() (20261104120100) still decides reserved and offensive names.

create table game_engine.nickname_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  -- 'first': the player's first nickname (free). 'changed': a rename. 'refused': refused for the name itself.
  outcome text not null check (outcome in ('first', 'changed', 'refused'))
);
create index nickname_attempts_user_at on game_engine.nickname_attempts (user_id, at desc);

-- Internal bookkeeping: no client role may read or write it (game_engine is not exposed, and this makes it explicit).
alter table game_engine.nickname_attempts enable row level security;
revoke all on table game_engine.nickname_attempts from public, anon, authenticated;

create or replace function public.set_nickname(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  name text := btrim(coalesce(request ->> 'nickname', ''));
  k text;
  problem text;
  current_name text;
  refusal text;
  attempts_last_hour int;
  changes_last_day int;
begin
  -- One request per player at a time (see the header).
  perform pg_advisory_xact_lock(hashtextextended('set_nickname:' || uid::text, 0));

  -- Old rows are never needed again (the longest window is 24 hours).
  delete from game_engine.nickname_attempts where user_id = uid and at < now() - interval '2 days';

  select count(*) into attempts_last_hour
    from game_engine.nickname_attempts where user_id = uid and at > now() - interval '1 hour';
  if attempts_last_hour >= 10 then
    return jsonb_build_object('refused', 'games:nickname_rate_limited');
  end if;

  -- The name's own rules, in the same order and with the same codes as before.
  if length(name) < 3 or length(name) > 20 then
    refusal := 'games:nickname_length';
  elsif name !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]*$' or position('  ' in name) > 0 then
    refusal := 'games:nickname_characters';
  else
    k := regexp_replace(lower(name), '[ _.-]', '', 'g');
    if length(k) < 3 then
      refusal := 'games:nickname_reserved';
    else
      problem := game_engine.nickname_problem(name);
      if problem = 'reserved' then refusal := 'games:nickname_reserved';
      elsif problem = 'not_allowed' then refusal := 'games:nickname_not_allowed';
      end if;
    end if;
  end if;
  if refusal is not null then
    insert into game_engine.nickname_attempts (user_id, outcome) values (uid, 'refused');
    return jsonb_build_object('refused', refusal);
  end if;

  select p.nickname into current_name from public.player_profiles p where p.user_id = uid;

  -- Saving the name the player already has changes nothing and costs nothing.
  if current_name is not distinct from name then
    return jsonb_build_object('nickname', name);
  end if;

  if current_name is not null then
    select count(*) into changes_last_day
      from game_engine.nickname_attempts where user_id = uid and outcome = 'changed' and at > now() - interval '24 hours';
    if changes_last_day >= 3 then
      return jsonb_build_object('refused', 'games:nickname_rate_limited');
    end if;
  end if;

  begin
    insert into public.player_profiles (user_id, nickname, nickname_key) values (uid, name, k)
    on conflict (user_id) do update set nickname = excluded.nickname, nickname_key = excluded.nickname_key, updated_at = now();
  exception when unique_violation then
    insert into game_engine.nickname_attempts (user_id, outcome) values (uid, 'refused');
    return jsonb_build_object('refused', 'games:nickname_taken');
  end;

  insert into game_engine.nickname_attempts (user_id, outcome)
  values (uid, case when current_name is null then 'first' else 'changed' end);
  return jsonb_build_object('nickname', name);
end;
$$;

revoke all on function public.set_nickname(jsonb) from public, anon;
grant execute on function public.set_nickname(jsonb) to authenticated;
