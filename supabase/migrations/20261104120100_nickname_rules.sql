-- Public nicknames: refuse impersonation of Tactiqo or its staff, and offensive names, on the server.
--
-- Nicknames show on public boards (weekly leaderboard, Hall of Fame, friend challenges). set_nickname already enforced
-- length (3–20), characters and a short list of exact reserved names; "Tactiqo_Team" or abusive names got through.
-- This adds game_engine.nickname_problem(name) and makes set_nickname call it. Length, character rules, uniqueness
-- and every existing error code are unchanged; one new refusal, games:nickname_not_allowed, is added for offensive
-- names. Existing nicknames are left as they are (no data changes); they are checked again only when changed.
--
-- Matching works on folded forms of the name so simple disguises don't pass:
--   key   lower case, separators ( _ . -) removed — the existing uniqueness key
--   fold  key with look-alike digits read as letters: 0→o 1→i 3→e 4→a 5→s 7→t 8→b (and a second fold with 1→l)
--   words the lower-case name split on separators, each folded the same way
-- Brand terms are refused anywhere in the name. Staff terms are refused as a whole word, or at the start or end of
-- the key ("AdminBob", "bob_support"), but not inside an ordinary word ("badminton"). Long offensive terms are
-- refused anywhere; short ones that occur inside ordinary words only as a whole word or at the start of the key.
-- This is a small, local list — not a moderation service — so it catches the obvious cases, not every one.

create or replace function game_engine.nickname_fold(s text, one text) returns text
language sql immutable set search_path = '' as $$
  select translate(s, '0134578', 'o' || one || 'eastb')
$$;

create or replace function game_engine.nickname_problem(name text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  key text := regexp_replace(lower(name), '[ _.-]', '', 'g');
  folds text[] := array[game_engine.nickname_fold(key, 'i'), game_engine.nickname_fold(key, 'l')];
  words text[];
  f text;
  t text;
  brand text[] := array['tactiqo', 'tactiq0', 'tactiko'];
  staff text[] := array['admin', 'administrator', 'moderator', 'mod', 'official', 'support', 'staff', 'system',
    'helpdesk', 'developer', 'owner', 'founder', 'ceo', 'verified'];
  exact text[] := array['admin', 'administrator', 'moderator', 'mod', 'official', 'support', 'staff', 'system',
    'strategic', 'strategicgame', 'anonymous', 'anonymousplayer', 'null', 'undefined', 'you', 'opponent', 'bot'];
  anywhere text[] := array['fuck', 'fuk', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'bitch', 'whore', 'slut',
    'rapist', 'hitler', 'nazi', 'retard', 'pedophile', 'paedo', 'porn', 'pussy', 'asshole', 'bastard', 'wank',
    'twat', 'dickhead', 'motherf', 'chutiya', 'chutia', 'madarchod', 'maderchod', 'bhenchod', 'behenchod', 'bhosdi',
    'bhosad', 'gandu', 'harami', 'kamina'];
  whole text[] := array['fag', 'rape', 'kike', 'spic', 'chink', 'dick', 'cock', 'cum', 'sex', 'tit', 'tits', 'ass',
    'lund', 'loda', 'lauda', 'kutta', 'kutti', 'randi', 'suck'];
begin
  -- Impersonation first, so "Tactiqo" reads as reserved, not offensive.
  if key = any (exact) then return 'reserved'; end if;
  foreach f in array folds loop
    foreach t in array brand loop
      if position(t in f) > 0 then return 'reserved'; end if;
    end loop;
  end loop;
  words := regexp_split_to_array(lower(name), '[ _.-]+');
  foreach f in array words loop
    if game_engine.nickname_fold(f, 'i') = any (staff) or game_engine.nickname_fold(f, 'l') = any (staff) then return 'reserved'; end if;
  end loop;
  foreach f in array folds loop
    foreach t in array staff loop
      if length(t) >= 5 and (starts_with(f, t) or right(f, length(t)) = t) then return 'reserved'; end if;
    end loop;
  end loop;

  foreach f in array folds loop
    -- Place names that famously contain a term (the Scunthorpe problem) are read without it.
    foreach t in array anywhere loop
      if position(t in replace(replace(f, 'scunthorpe', ''), 'penistone', '')) > 0 then return 'not_allowed'; end if;
    end loop;
    foreach t in array whole loop
      if starts_with(f, t) and length(f) <= length(t) + 1 then return 'not_allowed'; end if;
    end loop;
  end loop;
  foreach f in array words loop
    if game_engine.nickname_fold(f, 'i') = any (whole) or game_engine.nickname_fold(f, 'l') = any (whole) then return 'not_allowed'; end if;
  end loop;
  return null;
end;
$$;

-- As before (20261027140000_games.sql), plus the impersonation and offensive-name checks.
create or replace function public.set_nickname(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  name text := btrim(coalesce(request ->> 'nickname', ''));
  k text;
  problem text;
begin
  if length(name) < 3 or length(name) > 20 then raise exception 'games:nickname_length' using errcode = 'P0001'; end if;
  if name !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]*$' or position('  ' in name) > 0 then
    raise exception 'games:nickname_characters' using errcode = 'P0001';
  end if;
  k := regexp_replace(lower(name), '[ _.-]', '', 'g');
  if length(k) < 3 then
    raise exception 'games:nickname_reserved' using errcode = 'P0001';
  end if;
  problem := game_engine.nickname_problem(name);
  if problem = 'reserved' then raise exception 'games:nickname_reserved' using errcode = 'P0001'; end if;
  if problem = 'not_allowed' then raise exception 'games:nickname_not_allowed' using errcode = 'P0001'; end if;
  begin
    insert into public.player_profiles (user_id, nickname, nickname_key) values (uid, name, k)
    on conflict (user_id) do update set nickname = excluded.nickname, nickname_key = excluded.nickname_key, updated_at = now();
  exception when unique_violation then
    raise exception 'games:nickname_taken' using errcode = 'P0001';
  end;
  return jsonb_build_object('nickname', name);
end;
$$;

revoke all on function public.set_nickname(jsonb) from public, anon;
grant execute on function public.set_nickname(jsonb) to authenticated;
revoke all on function game_engine.nickname_fold(text, text), game_engine.nickname_problem(text) from public, anon, authenticated;
