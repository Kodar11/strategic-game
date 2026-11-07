-- Nickname rate limit: say which limit was hit and when it frees up, and how many changes are left.
--
-- Same rules, order, codes, lock and attempt log as 20261106120000_nickname_rate_limit.sql. Only the answers are
-- richer, so the app can explain a refusal instead of guessing (the app never computes the quota itself):
--   refused by the hourly attempt limit → {"refused": "games:nickname_rate_limited", "limit": "attempts", "retryAfterSeconds": n}
--   refused by the 24-hour change limit → {"refused": "games:nickname_rate_limited", "limit": "changes",  "retryAfterSeconds": n}
--   success                             → {"nickname": "<saved name>", "changesLeft": n}  (renames left in the rolling 24 hours)
-- n is computed from the server clock: the moment the oldest attempt (or change) that still blocks leaves its window.
-- Older apps ignore the extra fields.

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
  frees_at timestamptz;
begin
  -- One request per player at a time: two requests can't both pass the same count.
  perform pg_advisory_xact_lock(hashtextextended('set_nickname:' || uid::text, 0));

  -- Old rows are never needed again (the longest window is 24 hours).
  delete from game_engine.nickname_attempts where user_id = uid and at < now() - interval '2 days';

  select count(*) into attempts_last_hour
    from game_engine.nickname_attempts where user_id = uid and at > now() - interval '1 hour';
  if attempts_last_hour >= 10 then
    -- The 10th most recent attempt leaving the hour brings the count back under the limit.
    select a.at + interval '1 hour' into frees_at
      from game_engine.nickname_attempts a where a.user_id = uid and a.at > now() - interval '1 hour'
      order by a.at desc offset 9 limit 1;
    return jsonb_build_object('refused', 'games:nickname_rate_limited', 'limit', 'attempts',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (frees_at - now())))::int));
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
  select count(*) into changes_last_day
    from game_engine.nickname_attempts where user_id = uid and outcome = 'changed' and at > now() - interval '24 hours';

  -- Saving the name the player already has changes nothing and costs nothing.
  if current_name is not distinct from name then
    return jsonb_build_object('nickname', name, 'changesLeft', greatest(0, 3 - changes_last_day));
  end if;

  if current_name is not null and changes_last_day >= 3 then
    select a.at + interval '24 hours' into frees_at
      from game_engine.nickname_attempts a
      where a.user_id = uid and a.outcome = 'changed' and a.at > now() - interval '24 hours'
      order by a.at desc offset 2 limit 1;
    return jsonb_build_object('refused', 'games:nickname_rate_limited', 'limit', 'changes',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (frees_at - now())))::int));
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
  return jsonb_build_object('nickname', name,
    'changesLeft', greatest(0, 3 - changes_last_day - case when current_name is null then 0 else 1 end));
end;
$$;

revoke all on function public.set_nickname(jsonb) from public, anon;
grant execute on function public.set_nickname(jsonb) to authenticated;
