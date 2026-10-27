-- Strategic games: five replayable bot games, Game of the Week competitions, leaderboards, Hall of Fame, public
-- nicknames and friend challenges. See docs/GAMES.md.
--
-- Trust model
--   Practice games run on the device (src/games/) and never count competitively.
--   Competition and friend-challenge matches run here, one round per call. The server holds the match seed and
--   decides every bot move with the game_engine functions below — exact ports of the TypeScript engines, checked
--   move-for-move by supabase/__tests__/games.test.ts — so the device never learns a bot's future random choices
--   and can't submit a score: scores are computed from the moves the server resolved.
--
-- Tables (all RLS on, no client grants: every read and write goes through the functions at the end)
--   game_definitions        the five games, their rule versions and match lengths
--   player_profiles         public nickname per user (the only public identity; never an id or email)
--   game_competitions       one row per Game of the Week: game, opponent, explicit start/end timestamps, timezone
--                           policy, scoring version, attempts, winner bonus, finalization
--   game_challenges         friend challenges: opaque token, game, opponent, private seed, expiry
--   game_matches            server-run matches (competition or challenge), with their resolved rounds
--   competition_results     finalized weekly standings — immutable once written; the global leaderboard and the
--                           Hall of Fame are derived from it
--   game_practice_results   the player's own practice log (unverified, private, never ranked)
--
-- Competition timezone: Asia/Kolkata. A week is Monday 00:00 IST to the next Monday 00:00 IST, stored as UTC
-- timestamps; eligibility always compares against those, never against a device clock.

-- ── Engine (private) ─────────────────────────────────────────────────────────

create schema if not exists game_engine;
revoke all on schema game_engine from public, anon, authenticated;

-- Math.imul for unsigned 32-bit values held in bigint.
create or replace function game_engine.imul32(a bigint, b bigint) returns bigint
language sql immutable set search_path = '' as $$
  select ((a * (b & 65535)) + (((a * (b >> 16)) & 65535) << 16)) & 4294967295
$$;

-- First output of mulberry32 from a 32-bit state (src/games/core.ts mulberryFirst).
create or replace function game_engine.mulberry_first(state bigint) returns double precision
language plpgsql immutable set search_path = '' as $$
declare
  t bigint := (state + 1831565813) & 4294967295;
begin
  t := game_engine.imul32(t # (t >> 15), t | 1);
  t := t # ((t + game_engine.imul32(t # (t >> 7), t | 61)) & 4294967295);
  return ((t # (t >> 14)) & 4294967295)::double precision / 4294967296.0;
end;
$$;

-- draw(seed, round, k) in src/games/core.ts.
create or replace function game_engine.draw(seed bigint, rnd integer, k integer) returns double precision
language sql immutable set search_path = '' as $$
  select game_engine.mulberry_first((seed # game_engine.imul32(rnd + 1, 2654435761)) # game_engine.imul32(k + 1, 2246822519))
$$;

create or replace function game_engine.clamp(x integer, lo integer, hi integer) returns integer
language sql immutable set search_path = '' as $$ select least(hi, greatest(lo, x)) $$;

create or replace function game_engine.bots(game text) returns text[]
language sql immutable set search_path = '' as $$
  select case game
    when 'rps' then array['repeater', 'counter', 'mind-reader', 'randomizer']
    when 'two-thirds' then array['crowd-follower', 'shallow', 'deep', 'chaos']
    when 'split-steal' then array['cooperator', 'opportunist', 'retaliator', 'strategist']
    when 'ultimatum' then array['maximizer', 'fair', 'hardliner', 'negotiator']
    when 'stag-hunt' then array['cautious', 'optimist', 'opportunistic', 'conditional']
  end
$$;

create or replace function game_engine.rounds(game text) returns integer
language sql immutable set search_path = '' as $$
  select case game when 'rps' then 12 when 'two-thirds' then 5 when 'split-steal' then 10 when 'ultimatum' then 6 when 'stag-hunt' then 8 end
$$;

create or replace function game_engine.invalid_move(detail text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'games:invalid_move' using errcode = 'P0001', detail = detail;
end;
$$;

-- ── Rock, Paper, Scissors (src/games/rps.ts) ─────────────────────────────────

create or replace function game_engine.rps_idx(m text) returns integer
language sql immutable set search_path = '' as $$ select case m when 'rock' then 0 when 'paper' then 1 when 'scissors' then 2 end $$;

create or replace function game_engine.rps_move(i integer) returns text
language sql immutable set search_path = '' as $$ select (array['rock', 'paper', 'scissors'])[i + 1] $$;

create or replace function game_engine.rps_beats(m text) returns text
language sql immutable set search_path = '' as $$ select game_engine.rps_move((game_engine.rps_idx(m) + 1) % 3) $$;

create or replace function game_engine.rps_random(u double precision) returns text
language sql immutable set search_path = '' as $$ select game_engine.rps_move(floor(u * 3)::integer) $$;

create or replace function game_engine.rps_argmax(c integer[], seed bigint, rnd integer) returns text
language plpgsql immutable set search_path = '' as $$
declare
  best integer := greatest(c[1], c[2], c[3]);
  tied text[] := '{}';
begin
  for i in 1..3 loop
    if c[i] = best then tied := tied || game_engine.rps_move(i - 1); end if;
  end loop;
  if cardinality(tied) = 1 then return tied[1]; end if;
  return tied[floor(game_engine.draw(seed, rnd, 2) * cardinality(tied))::integer + 1];
end;
$$;

create or replace function game_engine.rps_frequency(h jsonb, win integer, weighted boolean) returns integer[]
language plpgsql immutable set search_path = '' as $$
declare
  n integer := jsonb_array_length(h);
  start integer := case when win > 0 then greatest(0, n - win) else 0 end;
  c integer[] := array[0, 0, 0];
  j integer;
begin
  for i in start..n - 1 loop
    j := game_engine.rps_idx(h -> i ->> 'p') + 1;
    c[j] := c[j] + case when weighted then i - start + 1 else 1 end;
  end loop;
  return c;
end;
$$;

create or replace function game_engine.rps_transitions(h jsonb, ord integer) returns integer[]
language plpgsql immutable set search_path = '' as $$
declare
  n integer := jsonb_array_length(h);
  c integer[] := array[0, 0, 0];
  found_any boolean := false;
  j integer;
begin
  if n < ord + 1 then return null; end if;
  for i in ord..n - 1 loop
    if (ord = 1 and h -> (i - 1) ->> 'p' = h -> (n - 1) ->> 'p')
       or (ord = 2 and h -> (i - 2) ->> 'p' = h -> (n - 2) ->> 'p' and h -> (i - 1) ->> 'p' = h -> (n - 1) ->> 'p') then
      j := game_engine.rps_idx(h -> i ->> 'p') + 1;
      c[j] := c[j] + 1;
      found_any := true;
    end if;
  end loop;
  return case when found_any then c end;
end;
$$;

create or replace function game_engine.rps_bot(bot text, diff text, seed bigint, h jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  n integer := jsonb_array_length(h);
  lst jsonb := case when n >= 1 then h -> (n - 1) end;
  prv jsonb := case when n >= 2 then h -> (n - 2) end;
  noise double precision;
  min_hist integer;
  u double precision;
  counts integer[];
begin
  noise := case bot
    when 'repeater' then case diff when 'medium' then 0.15 else 0.1 end
    when 'counter' then case diff when 'easy' then 0.3 when 'medium' then 0.15 else 0.08 end
    when 'mind-reader' then case diff when 'easy' then 0.35 when 'medium' then 0.2 else 0.1 end
    else 0 end;
  if noise > 0 and n > 0 and game_engine.draw(seed, n, 0) < noise then
    return game_engine.rps_random(game_engine.draw(seed, n, 1));
  end if;

  if bot = 'repeater' then
    if lst is null then return 'rock'; end if;
    if diff = 'easy' then return lst ->> 'b'; end if;
    if diff = 'hard' and (lst ->> 'r')::integer = 1 and prv is not null and (prv ->> 'r')::integer = 1 then return lst ->> 'p'; end if;
    return case when (lst ->> 'r')::integer = 1 then game_engine.rps_beats(lst ->> 'p') else lst ->> 'b' end;

  elsif bot = 'counter' then
    min_hist := case diff when 'easy' then 3 when 'medium' then 2 else 1 end;
    if n < min_hist then return game_engine.rps_random(game_engine.draw(seed, n, 1)); end if;
    counts := game_engine.rps_frequency(h, case diff when 'easy' then 0 when 'medium' then 6 else 5 end, diff = 'hard');
    return game_engine.rps_beats(game_engine.rps_argmax(counts, seed, n));

  elsif bot = 'mind-reader' then
    min_hist := case diff when 'easy' then 4 when 'medium' then 3 else 2 end;
    if n < min_hist then return game_engine.rps_random(game_engine.draw(seed, n, 1)); end if;
    counts := coalesce(case when diff = 'hard' then game_engine.rps_transitions(h, 2) end, game_engine.rps_transitions(h, 1), game_engine.rps_frequency(h, 0, false));
    return game_engine.rps_beats(game_engine.rps_argmax(counts, seed, n));

  else -- randomizer
    u := game_engine.draw(seed, n, 1);
    if diff = 'easy' then
      return case when lst is not null and game_engine.draw(seed, n, 0) < 0.5 then lst ->> 'b' else game_engine.rps_random(u) end;
    end if;
    if diff = 'medium' and prv is not null and lst ->> 'b' = prv ->> 'b' then
      return (select array_agg(m order by ord) from unnest(array['rock', 'paper', 'scissors']) with ordinality as x(m, ord) where m <> lst ->> 'b')[floor(u * 2)::integer + 1];
    end if;
    return game_engine.rps_random(u);
  end if;
end;
$$;

create or replace function game_engine.rps_resolve(bot text, diff text, seed bigint, h jsonb, move jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  p text;
  b text;
begin
  if jsonb_typeof(move) is distinct from 'string' or move #>> '{}' not in ('rock', 'paper', 'scissors') then
    perform game_engine.invalid_move('rps: rock, paper or scissors');
  end if;
  p := move #>> '{}';
  b := game_engine.rps_bot(bot, diff, seed, h);
  return jsonb_build_object('p', p, 'b', b, 'r', case when p = b then 0 when p = game_engine.rps_beats(b) then 1 else -1 end);
end;
$$;

-- ── Two-Thirds (src/games/two-thirds.ts) ─────────────────────────────────────

create or replace function game_engine.tt_lineup(crowd text) returns text[]
language sql immutable set search_path = '' as $$
  select array[crowd, crowd, crowd, crowd, crowd]
    || (select array_agg(t order by ord) from unnest(array['crowd-follower', 'shallow', 'deep', 'chaos']) with ordinality as x(t, ord) where t <> crowd)
$$;

create or replace function game_engine.tt_sum(r jsonb) returns integer
language sql immutable set search_path = '' as $$
  select (r ->> 'p')::integer + (select coalesce(sum(x::integer), 0)::integer from jsonb_array_elements_text(r -> 'bots') as x)
$$;

create or replace function game_engine.tt_pick(kind text, diff text, seed bigint, h jsonb, slot integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  n integer := jsonb_array_length(h);
  u double precision := game_engine.draw(seed, n, slot);
  lst jsonb := case when n >= 1 then h -> (n - 1) end;
  prv jsonb := case when n >= 2 then h -> (n - 2) end;
  a double precision := case when n >= 1 then game_engine.tt_sum(h -> (n - 1))::double precision / 9 else 50::double precision end;
  a_prev double precision;
  est double precision;
  base double precision;
  anchor double precision;
  k integer;
  j integer;
begin
  if kind = 'crowd-follower' then
    if diff = 'easy' then base := a; j := 10;
    elsif diff = 'medium' then base := (a * 5) / 6; j := 5;
    else
      a_prev := case when prv is not null then game_engine.tt_sum(prv)::double precision / 9 else 0 end;
      est := case when prv is not null and a_prev > 0 then least(100::double precision, (a * a) / a_prev) else a end;
      base := (est * 2) / 3; j := 2;
    end if;
  elsif kind = 'shallow' then
    if diff = 'easy' then base := (50::double precision * 2) / 3; j := 8;
    elsif diff = 'medium' then base := (50::double precision * 2) / 3; j := 4;
    else base := (a * 2) / 3; j := 2;
    end if;
  elsif kind = 'deep' then
    if diff = 'easy' then anchor := 50; k := 2; j := 5;
    elsif diff = 'medium' then
      if lst is not null then anchor := a; k := 2; else anchor := 50; k := 3; end if;
      j := 3;
    else
      if lst is not null then anchor := (a * 2) / 3; k := 2; else anchor := 50; k := 4; end if;
      j := 1;
    end if;
    base := anchor;
    for i in 1..k loop base := (base * 2) / 3; end loop;
  else -- chaos
    if diff = 'easy' then return floor(u * 101)::integer; end if;
    if diff = 'medium' then return floor(u * 67)::integer; end if;
    return floor(u * 41)::integer + floor(game_engine.draw(seed, n, 100 + slot) * 41)::integer;
  end if;
  return game_engine.clamp(floor(base + 0.5)::integer + (floor(u * (2 * j + 1))::integer - j), 0, 100);
end;
$$;

create or replace function game_engine.tt_resolve(bot text, diff text, seed bigint, h jsonb, move jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  p integer;
  lineup text[] := game_engine.tt_lineup(bot);
  picks integer[] := '{}';
  s integer;
  best integer;
  winners integer := 0;
  player_wins boolean;
  d integer;
  ps integer;
begin
  if jsonb_typeof(move) is distinct from 'number' or (move #>> '{}')::numeric <> trunc((move #>> '{}')::numeric)
     or (move #>> '{}')::numeric not between 0 and 100 then
    perform game_engine.invalid_move('two-thirds: a whole number from 0 to 100');
  end if;
  p := (move #>> '{}')::numeric::integer;
  for slot in 0..7 loop
    picks := picks || game_engine.tt_pick(lineup[slot + 1], diff, seed, h, slot);
  end loop;
  s := p + (select sum(x) from unnest(picks) x);
  best := abs(27 * p - 2 * s);
  for i in 1..8 loop best := least(best, abs(27 * picks[i] - 2 * s)); end loop;
  winners := (case when abs(27 * p - 2 * s) = best then 1 else 0 end) + (select count(*) from unnest(picks) x where abs(27 * x - 2 * s) = best);
  player_wins := abs(27 * p - 2 * s) = best;
  d := abs(27 * p - 2 * s);
  ps := (case when player_wins then case when winners = 1 then 10 else 5 end else 0 end) + greatest(0, 10 - d / 27);
  return jsonb_build_object('p', p, 'bots', to_jsonb(picks), 'ps', ps, 'botWon', not player_wins);
end;
$$;

-- ── Split or Steal (src/games/split-steal.ts) ────────────────────────────────

create or replace function game_engine.split_bot(bot text, diff text, seed bigint, h jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  n integer := jsonb_array_length(h);
  lst jsonb := case when n >= 1 then h -> (n - 1) end;
  prv jsonb := case when n >= 2 then h -> (n - 2) end;
  copy_last text := coalesce(case when n >= 1 then h -> (n - 1) ->> 'p' end, 'split');
  steals integer := (select count(*) from jsonb_array_elements(h) r where r ->> 'p' = 'steal');
  streak3 boolean := n >= 3 and (select bool_and(r ->> 'p' = 'split') from jsonb_array_elements(h) with ordinality as e(r, i) where i > n - 3);
  streak2 boolean := n >= 2 and (select bool_and(r ->> 'p' = 'split') from jsonb_array_elements(h) with ordinality as e(r, i) where i > n - 2);
  last3_splits integer := (select count(*) from jsonb_array_elements(h) with ordinality as e(r, i) where i > n - 3 and r ->> 'p' = 'split');
begin
  if bot = 'cooperator' then
    if diff = 'easy' then return 'split'; end if;
    if diff = 'medium' then
      return case when lst ->> 'p' = 'steal' and prv ->> 'p' = 'steal' then 'steal' else 'split' end;
    end if;
    return case when lst ->> 'p' = 'steal' and game_engine.draw(seed, n, 0) >= 1::double precision / 3 then 'steal' else 'split' end;
  elsif bot = 'opportunist' then
    if diff = 'easy' then return case when game_engine.draw(seed, n, 0) < 0.5 then 'steal' else 'split' end; end if;
    if diff = 'medium' then return case when streak2 then 'steal' else 'split' end; end if;
    if n >= 8 then return 'steal'; end if;
    if streak3 then return 'steal'; end if;
    return copy_last;
  elsif bot = 'retaliator' then
    if diff = 'easy' then return copy_last; end if;
    if diff = 'medium' then
      return case when lst ->> 'p' = 'steal' or prv ->> 'p' = 'steal' then 'steal' else 'split' end;
    end if;
    return case when steals > 0 then 'steal' else 'split' end;
  else -- strategist
    if diff = 'easy' then
      if n < 3 then return 'split'; end if;
      return case when last3_splits >= 2 then 'split' else 'steal' end;
    end if;
    if diff = 'medium' then
      return case when lst is null or lst ->> 'p' = lst ->> 'b' then 'split' else 'steal' end;
    end if;
    if n = 9 then return 'steal'; end if;
    if n < 2 then return 'split'; end if;
    if steals * 10 >= n * 4 then return 'steal'; end if;
    if steals = 0 and n >= 7 then return 'steal'; end if;
    return copy_last;
  end if;
end;
$$;

create or replace function game_engine.split_resolve(bot text, diff text, seed bigint, h jsonb, move jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  p text;
  b text;
begin
  if jsonb_typeof(move) is distinct from 'string' or move #>> '{}' not in ('split', 'steal') then
    perform game_engine.invalid_move('split-steal: split or steal');
  end if;
  p := move #>> '{}';
  b := game_engine.split_bot(bot, diff, seed, h);
  return jsonb_build_object('p', p, 'b', b,
    'ps', case when p = 'split' and b = 'split' then 5 when p = 'steal' and b = 'split' then 8 when p = 'split' then 0 else 1 end,
    'bs', case when p = 'split' and b = 'split' then 5 when b = 'steal' and p = 'split' then 8 when b = 'split' then 0 else 1 end);
end;
$$;

-- ── Ultimatum (src/games/ultimatum.ts) ───────────────────────────────────────

create or replace function game_engine.ult_offer(bot text, diff text, seed bigint, h jsonb) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  n integer := jsonb_array_length(h);
  r jsonb;
  last_mine jsonb;
  last_theirs jsonb;
  offer integer;
  lo integer;
  hi integer;
begin
  for r in select x from jsonb_array_elements(h) with ordinality as e(x, i) order by i loop
    if r ->> 'proposer' = 'bot' then last_mine := r; else last_theirs := r; end if;
  end loop;
  if bot = 'maximizer' then
    if diff = 'easy' then return 1 + floor(game_engine.draw(seed, n, 0) * 3)::integer; end if;
    if diff = 'medium' then
      return least(5, 2 + (select count(*)::integer from jsonb_array_elements(h) x where x ->> 'proposer' = 'bot' and not (x ->> 'accepted')::boolean));
    end if;
    if last_mine is null then return 2; end if;
    return game_engine.clamp((last_mine ->> 'offer')::integer + case when (last_mine ->> 'accepted')::boolean then -1 else 1 end, 1, 5);
  elsif bot = 'fair' then
    if diff = 'hard' and last_theirs is not null and (last_theirs ->> 'offer')::integer < 4 then return 4; end if;
    return 5;
  elsif bot = 'hardliner' then
    return case diff when 'hard' then 3 else 4 end;
  else -- negotiator
    offer := case diff when 'easy' then 5 when 'medium' then 4 else 3 end;
    lo := case diff when 'easy' then 3 else 2 end;
    hi := case diff when 'hard' then 5 else 6 end;
    for r in select x from jsonb_array_elements(h) with ordinality as e(x, i) where x ->> 'proposer' = 'bot' order by i loop
      offer := game_engine.clamp(offer + case when (r ->> 'accepted')::boolean then -1 else 1 end, lo, hi);
    end loop;
    return offer;
  end if;
end;
$$;

create or replace function game_engine.ult_accepts(bot text, diff text, h jsonb, offer integer) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  r jsonb;
  thr integer;
  lo integer;
  hi integer;
begin
  if bot = 'maximizer' then return offer >= 1; end if;
  if bot = 'fair' then return offer >= case diff when 'easy' then 3 else 4 end; end if;
  if bot = 'hardliner' then
    if diff = 'hard' and exists (select 1 from jsonb_array_elements(h) x where x ->> 'proposer' = 'player' and (x ->> 'offer')::integer <= 2) then
      return offer >= 6;
    end if;
    return offer >= case diff when 'easy' then 4 else 5 end;
  end if;
  thr := case diff when 'easy' then 3 when 'medium' then 4 else 5 end;
  lo := case diff when 'easy' then 2 else 3 end;
  hi := case diff when 'easy' then 4 when 'medium' then 5 else 6 end;
  for r in select x from jsonb_array_elements(h) with ordinality as e(x, i) where x ->> 'proposer' = 'player' order by i loop
    thr := game_engine.clamp(thr + case when (r ->> 'accepted')::boolean then 1 else -1 end, lo, hi);
  end loop;
  return offer >= thr;
end;
$$;

create or replace function game_engine.ult_prompt(bot text, diff text, seed bigint, h jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_array_length(h) % 2 = 0 then jsonb_build_object('role', 'propose')
    else jsonb_build_object('role', 'respond', 'offer', game_engine.ult_offer(bot, diff, seed, h)) end
$$;

create or replace function game_engine.ult_resolve(bot text, diff text, seed bigint, h jsonb, move jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  o integer;
  ok boolean;
begin
  if jsonb_array_length(h) % 2 = 0 then
    if jsonb_typeof(move) is distinct from 'number' or (move #>> '{}')::numeric <> trunc((move #>> '{}')::numeric)
       or (move #>> '{}')::numeric not between 1 and 9 then
      perform game_engine.invalid_move('ultimatum: offer a whole number of coins from 1 to 9');
    end if;
    o := (move #>> '{}')::numeric::integer;
    ok := game_engine.ult_accepts(bot, diff, h, o);
    return jsonb_build_object('proposer', 'player', 'offer', o, 'accepted', ok,
      'ps', case when ok then 10 - o else 0 end, 'bs', case when ok then o else 0 end);
  end if;
  if jsonb_typeof(move) is distinct from 'string' or move #>> '{}' not in ('accept', 'reject') then
    perform game_engine.invalid_move('ultimatum: accept or reject');
  end if;
  o := game_engine.ult_offer(bot, diff, seed, h);
  ok := move #>> '{}' = 'accept';
  return jsonb_build_object('proposer', 'bot', 'offer', o, 'accepted', ok,
    'ps', case when ok then o else 0 end, 'bs', case when ok then 10 - o else 0 end);
end;
$$;

-- ── Stag Hunt (src/games/stag-hunt.ts) ───────────────────────────────────────

create or replace function game_engine.stag_bot(bot text, diff text, seed bigint, h jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  n integer := jsonb_array_length(h);
  lst jsonb := case when n >= 1 then h -> (n - 1) end;
  prv jsonb := case when n >= 2 then h -> (n - 2) end;
  stags integer := (select count(*) from jsonb_array_elements(h) r where r ->> 'p' = 'stag');
  ws integer := 0;
  wt integer := 0;
  w integer;
begin
  if bot = 'cautious' then
    if diff = 'easy' then return 'hare'; end if;
    if diff = 'medium' then
      return case when n >= 3 and (select bool_and(r ->> 'p' = 'stag') from jsonb_array_elements(h) with ordinality as e(r, i) where i > n - 3) then 'stag' else 'hare' end;
    end if;
    return case when (stags + 1) * 5 >= (n + 2) * 4 then 'stag' else 'hare' end;
  elsif bot = 'optimist' then
    if diff = 'easy' then return 'stag'; end if;
    if diff = 'medium' then
      return case when lst ->> 'b' = 'stag' and lst ->> 'p' = 'hare' and prv ->> 'b' = 'stag' and prv ->> 'p' = 'hare' then 'hare' else 'stag' end;
    end if;
    if n < 2 then return 'stag'; end if;
    return case when (stags + 1) * 10 >= (n + 2) * 4 and game_engine.draw(seed, n, 0) < 0.85 then 'stag' else 'hare' end;
  elsif bot = 'opportunistic' then
    if diff = 'easy' then return case when lst ->> 'p' = 'stag' then 'stag' else 'hare' end; end if;
    if diff = 'medium' then return case when 5 * (stags + 1) > 3 * (n + 2) then 'stag' else 'hare' end; end if;
    for i in greatest(0, n - 4)..n - 1 loop
      w := 4 - (n - 1 - i);
      wt := wt + w;
      if h -> i ->> 'p' = 'stag' then ws := ws + w; end if;
    end loop;
    return case when 5 * (ws + 1) > 3 * (wt + 2) then 'stag' else 'hare' end;
  else -- conditional
    if n = 0 then return 'stag'; end if;
    if diff = 'easy' then return case when 2 * (stags + 1) >= n + 2 then 'stag' else 'hare' end; end if;
    if diff = 'medium' then return case when 5 * (stags + 1) >= 3 * (n + 2) then 'stag' else 'hare' end; end if;
    return case when 10 * (stags + 1) >= 7 * (n + 2) and lst ->> 'p' = 'stag' then 'stag' else 'hare' end;
  end if;
end;
$$;

create or replace function game_engine.stag_resolve(bot text, diff text, seed bigint, h jsonb, move jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  p text;
  b text;
begin
  if jsonb_typeof(move) is distinct from 'string' or move #>> '{}' not in ('stag', 'hare') then
    perform game_engine.invalid_move('stag-hunt: stag or hare');
  end if;
  p := move #>> '{}';
  b := game_engine.stag_bot(bot, diff, seed, h);
  return jsonb_build_object('p', p, 'b', b,
    'ps', case when p = 'hare' then 3 when b = 'stag' then 5 else 0 end,
    'bs', case when b = 'hare' then 3 when p = 'stag' then 5 else 0 end);
end;
$$;

-- ── Dispatch ─────────────────────────────────────────────────────────────────

create or replace function game_engine.prompt(game text, bot text, diff text, seed bigint, h jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when game = 'ultimatum' then game_engine.ult_prompt(bot, diff, seed, h) end
$$;

create or replace function game_engine.resolve(game text, bot text, diff text, seed bigint, h jsonb, move jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_array_length(h) >= game_engine.rounds(game) then
    raise exception 'games:finished' using errcode = 'P0001';
  end if;
  return case game
    when 'rps' then game_engine.rps_resolve(bot, diff, seed, h, move)
    when 'two-thirds' then game_engine.tt_resolve(bot, diff, seed, h, move)
    when 'split-steal' then game_engine.split_resolve(bot, diff, seed, h, move)
    when 'ultimatum' then game_engine.ult_resolve(bot, diff, seed, h, move)
    when 'stag-hunt' then game_engine.stag_resolve(bot, diff, seed, h, move)
  end;
end;
$$;

-- [player, bot] totals, as the engines' `totals`. RPS: 3/1/0 points. Two-Thirds: player points / rounds bots won.
create or replace function game_engine.totals(game text, h jsonb) returns integer[]
language sql immutable set search_path = '' as $$
  select case game
    when 'rps' then array[
      coalesce(sum(case (r ->> 'r')::integer when 1 then 3 when 0 then 1 else 0 end), 0)::integer,
      coalesce(sum(case (r ->> 'r')::integer when -1 then 3 when 0 then 1 else 0 end), 0)::integer]
    when 'two-thirds' then array[coalesce(sum((r ->> 'ps')::integer), 0)::integer, count(*) filter (where (r ->> 'botWon')::boolean)::integer]
    else array[coalesce(sum((r ->> 'ps')::integer), 0)::integer, coalesce(sum((r ->> 'bs')::integer), 0)::integer]
  end
  from jsonb_array_elements(h) r
$$;

-- 'win' | 'loss' | 'draw'. Two-Thirds compares rounds won by the player against rounds won by bots.
create or replace function game_engine.outcome(game text, h jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  t integer[] := game_engine.totals(game, h);
  mine integer;
begin
  if game = 'two-thirds' then
    mine := jsonb_array_length(h) - t[2];
    return case when mine > t[2] then 'win' when mine < t[2] then 'loss' else 'draw' end;
  end if;
  return case when t[1] > t[2] then 'win' when t[1] < t[2] then 'loss' else 'draw' end;
end;
$$;

revoke all on all functions in schema game_engine from public, anon, authenticated;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.game_definitions (
  id text primary key check (id in ('rps', 'two-thirds', 'split-steal', 'ultimatum', 'stag-hunt')),
  title text not null,
  -- The rules version the server's engine implements. Matches and challenges record it.
  rules_version integer not null check (rules_version > 0),
  rounds integer not null check (rounds > 0),
  bots text[] not null
);
insert into public.game_definitions (id, title, rules_version, rounds, bots)
select g, t, 1, game_engine.rounds(g), game_engine.bots(g)
from (values ('rps', 'Rock, Paper, Scissors'), ('two-thirds', 'Two-Thirds Guess'), ('split-steal', 'Split or Steal'),
             ('ultimatum', 'The Ultimatum'), ('stag-hunt', 'Stag Hunt')) as v(g, t);

create table public.player_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (length(nickname) between 3 and 20),
  -- Lower case, spaces/_/./- removed: "Ada Lovelace" and "ada_lovelace" can't both exist.
  nickname_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_competitions (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 60),
  game_id text not null references public.game_definitions (id),
  -- Everyone faces the same opponent at the same difficulty, so scores are comparable.
  bot text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  scoring_version integer not null default 1 check (scoring_version = 1),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 10),
  winner_bonus integer not null default 25 check (winner_bonus between 0 and 50),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  finalized_at timestamptz,
  participants integer,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (bot = any (game_engine.bots(game_id)))
);
create index game_competitions_window_idx on public.game_competitions (starts_at, ends_at) where status = 'scheduled';

create table public.game_challenges (
  id uuid primary key default gen_random_uuid(),
  -- Opaque link token (20 hex characters from a random UUID). Reveals nothing about the challenge or its creator.
  token text not null unique check (token ~ '^[0-9a-f]{20}$'),
  game_id text not null references public.game_definitions (id),
  bot text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  rules_version integer not null,
  -- Private: both players face the same random draws. Never returned to a client.
  seed bigint not null check (seed between 0 and 4294967295),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (bot = any (game_engine.bots(game_id))),
  check (expires_at > created_at)
);
create index game_challenges_creator_idx on public.game_challenges (created_by, created_at);

create table public.game_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('competition', 'challenge')),
  competition_id text references public.game_competitions (id) on delete restrict,
  challenge_id uuid references public.game_challenges (id) on delete restrict,
  game_id text not null references public.game_definitions (id),
  bot text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  rules_version integer not null,
  seed bigint not null check (seed between 0 and 4294967295),
  attempt smallint not null default 1 check (attempt >= 1),
  rounds jsonb not null default '[]'::jsonb check (jsonb_typeof(rounds) = 'array'),
  player_score integer not null default 0,
  bot_score integer not null default 0,
  status text not null default 'active' check (status in ('active', 'completed', 'expired')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((kind = 'competition') = (competition_id is not null) and (kind = 'challenge') = (challenge_id is not null)),
  check ((status = 'completed') = (completed_at is not null))
);
create unique index game_matches_attempt_uniq on public.game_matches (competition_id, user_id, attempt) where competition_id is not null;
create unique index game_matches_one_active_uniq on public.game_matches (competition_id, user_id) where competition_id is not null and status = 'active';
create unique index game_matches_challenge_uniq on public.game_matches (challenge_id, user_id) where challenge_id is not null;
create index game_matches_leaderboard_idx on public.game_matches (competition_id, player_score desc, completed_at) where status = 'completed';
create index game_matches_user_idx on public.game_matches (user_id, started_at desc);

create table public.competition_results (
  competition_id text not null references public.game_competitions (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  match_id uuid not null references public.game_matches (id) on delete restrict,
  score integer not null,
  achieved_at timestamptz not null,
  rank integer not null check (rank >= 1),
  field_size integer not null check (field_size >= 1),
  is_winner boolean not null,
  points integer not null check (points >= 0),
  scoring_version integer not null,
  finalized_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);
create index competition_results_user_idx on public.competition_results (user_id);
create index competition_results_winner_idx on public.competition_results (competition_id) where is_winner;

create table public.game_practice_results (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The device's id for the game, so a retried save is recorded once.
  client_id uuid not null,
  game_id text not null references public.game_definitions (id),
  bot text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  rules_version integer not null,
  player_score integer not null check (player_score between 0 and 1000),
  bot_score integer not null check (bot_score between 0 and 1000),
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  played_at timestamptz not null default now(),
  primary key (user_id, client_id),
  check (bot = any (game_engine.bots(game_id)))
);
create index game_practice_results_user_idx on public.game_practice_results (user_id, played_at desc);

-- ── Integrity ────────────────────────────────────────────────────────────────

-- No two scheduled competitions overlap, and once anyone has played one, what it measures can't change.
create or replace function public.game_competitions_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'scheduled' and exists (
    select 1 from public.game_competitions c
    where c.id <> new.id and c.status = 'scheduled' and c.starts_at < new.ends_at and new.starts_at < c.ends_at
  ) then
    raise exception 'competition %: overlaps another scheduled competition', new.id;
  end if;
  if tg_op = 'UPDATE' then
    if old.finalized_at is not null and (to_jsonb(new) - 'participants') is distinct from (to_jsonb(old) - 'participants') then
      raise exception 'competition % is finalized and can''t change', old.id;
    end if;
    if exists (select 1 from public.game_matches m where m.competition_id = old.id)
       and (new.game_id, new.bot, new.difficulty, new.starts_at, new.ends_at, new.scoring_version, new.max_attempts, new.winner_bonus, new.status)
           is distinct from (old.game_id, old.bot, old.difficulty, old.starts_at, old.ends_at, old.scoring_version, old.max_attempts, old.winner_bonus, old.status)
       and old.finalized_at is null and new.finalized_at is not distinct from old.finalized_at then
      raise exception 'competition % has matches: its game, opponent, dates and rules can''t change', old.id;
    end if;
  end if;
  return new;
end;
$$;
create trigger game_competitions_guard before insert or update on public.game_competitions
  for each row execute function public.game_competitions_guard();

-- Finalized results are permanent. The one exception is deleting a whole account (auth.users), whose cascade removes
-- that player's rows: a nested trigger depth means the delete came from that cascade, not from a direct statement.
create or replace function public.competition_results_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'competition results are final and can''t be changed or deleted';
end;
$$;
create trigger competition_results_immutable before update or delete on public.competition_results
  for each row execute function public.competition_results_immutable();

-- A finalized week's matches don't change either.
create or replace function public.game_matches_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  if old.competition_id is not null and exists (select 1 from public.game_competitions c where c.id = old.competition_id and c.finalized_at is not null) then
    raise exception 'match % belongs to a finalized competition', old.id;
  end if;
  return new;
end;
$$;
create trigger game_matches_guard before update or delete on public.game_matches
  for each row execute function public.game_matches_guard();

-- ── Row level security: no direct client access ──────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['game_definitions', 'player_profiles', 'game_competitions', 'game_challenges', 'game_matches', 'competition_results', 'game_practice_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- ── Helpers ──────────────────────────────────────────────────────────────────

create or replace function game_engine.ms(t timestamptz) returns bigint
language sql immutable set search_path = '' as $$ select (extract(epoch from t) * 1000)::bigint $$;

create or replace function game_engine.new_seed() returns bigint
language sql volatile set search_path = '' as $$
  select ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint
$$;

create or replace function game_engine.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'games:auth' using errcode = 'P0001'; end if;
  return uid;
end;
$$;

create or replace function game_engine.match_id(raw text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  if coalesce(raw, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'games:not_found' using errcode = 'P0001';
  end if;
  return raw::uuid;
end;
$$;

create or replace function game_engine.nickname_of(uid uuid) returns text
language sql stable set search_path = '' as $$ select nickname from public.player_profiles where user_id = uid $$;

create or replace function game_engine.phase(c public.game_competitions, now_at timestamptz) returns text
language sql stable set search_path = '' as $$
  select case when c.finalized_at is not null then 'finalized' when now_at < c.starts_at then 'upcoming' when now_at < c.ends_at then 'active' else 'closed' end
$$;

create or replace function game_engine.match_json(m public.game_matches) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'kind', m.kind, 'game', m.game_id, 'bot', m.bot, 'difficulty', m.difficulty, 'rulesVersion', m.rules_version,
    'attempt', m.attempt, 'rounds', m.rounds, 'totalRounds', game_engine.rounds(m.game_id), 'status', m.status,
    'prompt', case when m.status = 'active' then game_engine.prompt(m.game_id, m.bot, m.difficulty, m.seed, m.rounds) end,
    'playerScore', m.player_score, 'botScore', m.bot_score,
    'outcome', case when m.status = 'completed' then game_engine.outcome(m.game_id, m.rounds) end,
    'competitionId', m.competition_id,
    'challengeToken', (select token from public.game_challenges c where c.id = m.challenge_id),
    'startedAt', game_engine.ms(m.started_at), 'completedAt', game_engine.ms(m.completed_at))
$$;

-- Live weekly standings: each player's best completed match before the end. Earlier achievement breaks ties;
-- identical score and time share a rank.
create or replace function game_engine.live_standings(c public.game_competitions)
returns table (user_id uuid, match_id uuid, score integer, achieved_at timestamptz, rank integer, field integer)
language sql stable set search_path = '' as $$
  with best as (
    select distinct on (m.user_id) m.user_id, m.id as match_id, m.player_score as score, m.completed_at as achieved_at
    from public.game_matches m
    where m.competition_id = c.id and m.status = 'completed' and m.completed_at < c.ends_at
    order by m.user_id, m.player_score desc, m.completed_at asc, m.id
  )
  select b.user_id, b.match_id, b.score, b.achieved_at,
    (rank() over (order by b.score desc, b.achieved_at asc))::integer, (count(*) over ())::integer
  from best b
$$;

revoke all on all functions in schema game_engine from public, anon, authenticated;

-- ── Finalization ─────────────────────────────────────────────────────────────

-- Finalize every scheduled competition that ended at or before `as_of`, exactly once: the competition row is locked
-- and re-checked, results are insert-only, and a second run (or a concurrent one) finds nothing to do. Matches
-- still open at the end are marked expired and don't count. Safe to run any number of times, late or early.
create or replace function content_admin.finalize_competitions(as_of timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.game_competitions;
  done integer := 0;
  n integer;
begin
  for c in
    select * from public.game_competitions
    where status = 'scheduled' and finalized_at is null and ends_at <= as_of
    order by ends_at
    for update
  loop
    update public.game_matches set status = 'expired', updated_at = now() where competition_id = c.id and status = 'active';
    insert into public.competition_results (competition_id, user_id, match_id, score, achieved_at, rank, field_size, is_winner, points, scoring_version)
    select c.id, s.user_id, s.match_id, s.score, s.achieved_at, s.rank, s.field, s.rank = 1,
      10 + (40 * (s.field - s.rank + 1)) / s.field + case when s.rank = 1 then c.winner_bonus else 0 end,
      c.scoring_version
    from game_engine.live_standings(c) s
    on conflict do nothing;
    get diagnostics n = row_count;
    update public.game_competitions set finalized_at = now(), participants = n where id = c.id;
    done := done + 1;
  end loop;
  return done;
end;
$$;
revoke all on function content_admin.finalize_competitions(timestamptz) from public, anon, authenticated;

-- What the app (and a scheduled job) calls. Only ever finalizes competitions that have ended.
create or replace function public.finalize_due_competitions() returns integer
language sql security definer set search_path = '' as $$ select content_admin.finalize_competitions(now()) $$;
revoke all on function public.finalize_due_competitions() from public;
grant execute on function public.finalize_due_competitions() to anon, authenticated;

-- ── Scheduling (owner only) ──────────────────────────────────────────────────

-- Schedule the Game of the Week that starts on `week_start` (a Monday): Monday 00:00 to next Monday 00:00 in
-- Asia/Kolkata, stored as UTC timestamps. Re-running for the same week with the same settings is a no-op; changing
-- an unplayed week is allowed, a played one is refused by the guard.
create or replace function content_admin.schedule_competition(
  week_start date, game text, opponent text, difficulty text default 'hard',
  max_attempts integer default 3, winner_bonus integer default 25
) returns public.game_competitions
language plpgsql security definer set search_path = '' as $$
declare
  cid text := 'week-' || to_char(week_start, 'IYYY') || '-w' || to_char(week_start, 'IW');
  s timestamptz := week_start::timestamp at time zone 'Asia/Kolkata';
  e timestamptz := (week_start + 7)::timestamp at time zone 'Asia/Kolkata';
  rec public.game_competitions;
begin
  if extract(isodow from week_start) <> 1 then
    raise exception 'competition weeks start on a Monday; % is not one', week_start;
  end if;
  insert into public.game_competitions (id, game_id, bot, difficulty, starts_at, ends_at, timezone, max_attempts, winner_bonus)
  values (cid, game, opponent, difficulty, s, e, 'Asia/Kolkata', max_attempts, winner_bonus)
  on conflict (id) do update set game_id = excluded.game_id, bot = excluded.bot, difficulty = excluded.difficulty,
    max_attempts = excluded.max_attempts, winner_bonus = excluded.winner_bonus
  returning * into rec;
  return rec;
end;
$$;
revoke all on function content_admin.schedule_competition(date, text, text, text, integer, integer) from public, anon, authenticated;

-- ── Client functions ─────────────────────────────────────────────────────────
-- Errors the app understands are raised as 'games:<reason>' (see src/data/games.ts).

create or replace function public.set_nickname(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  name text := btrim(coalesce(request ->> 'nickname', ''));
  k text;
begin
  if length(name) < 3 or length(name) > 20 then raise exception 'games:nickname_length' using errcode = 'P0001'; end if;
  if name !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]*$' or position('  ' in name) > 0 then
    raise exception 'games:nickname_characters' using errcode = 'P0001';
  end if;
  k := regexp_replace(lower(name), '[ _.-]', '', 'g');
  if length(k) < 3 or k = any (array['admin', 'administrator', 'moderator', 'mod', 'official', 'support', 'staff', 'system', 'strategic', 'strategicgame', 'anonymous', 'anonymousplayer', 'null', 'undefined']) then
    raise exception 'games:nickname_reserved' using errcode = 'P0001';
  end if;
  begin
    insert into public.player_profiles (user_id, nickname, nickname_key) values (uid, name, k)
    on conflict (user_id) do update set nickname = excluded.nickname, nickname_key = excluded.nickname_key, updated_at = now();
  exception when unique_violation then
    raise exception 'games:nickname_taken' using errcode = 'P0001';
  end;
  return jsonb_build_object('nickname', name);
end;
$$;

-- The Games home: the featured competition (active; else ended and awaiting results; else the next one), the
-- caller's standing in it, last week's official winner, and the caller's nickname. Finalizes anything overdue first.
create or replace function public.get_games_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  now_at timestamptz := now();
  c public.game_competitions;
  prev public.game_competitions;
  me jsonb;
  comp jsonb;
  last_week jsonb;
begin
  perform content_admin.finalize_competitions(now_at);
  select * into c from public.game_competitions where status = 'scheduled' and starts_at <= now_at and now_at < ends_at order by starts_at limit 1;
  if c.id is null then
    select * into c from public.game_competitions where status = 'scheduled' and ends_at <= now_at and finalized_at is null order by ends_at desc limit 1;
  end if;
  if c.id is null then
    select * into c from public.game_competitions where status = 'scheduled' and starts_at > now_at order by starts_at limit 1;
  end if;
  if c.id is not null then
    if uid is not null then
      select jsonb_build_object(
        'attemptsUsed', (select count(*) from public.game_matches m where m.competition_id = c.id and m.user_id = uid),
        'activeMatchId', (select m.id from public.game_matches m where m.competition_id = c.id and m.user_id = uid and m.status = 'active'),
        'best', s.score, 'rank', s.rank)
      into me
      from (select 1) one left join game_engine.live_standings(c) s on s.user_id = uid;
    end if;
    comp := jsonb_build_object(
      'id', c.id, 'game', c.game_id, 'bot', c.bot, 'difficulty', c.difficulty,
      'startsAt', game_engine.ms(c.starts_at), 'endsAt', game_engine.ms(c.ends_at), 'timezone', c.timezone,
      'scoringVersion', c.scoring_version, 'maxAttempts', c.max_attempts, 'winnerBonus', c.winner_bonus,
      'phase', game_engine.phase(c, now_at), 'participants', (select count(*) from game_engine.live_standings(c)),
      'me', me);
  end if;
  select * into prev from public.game_competitions where finalized_at is not null order by ends_at desc limit 1;
  if prev.id is not null then
    last_week := jsonb_build_object('id', prev.id, 'game', prev.game_id, 'endsAt', game_engine.ms(prev.ends_at), 'participants', prev.participants,
      'winners', coalesce((select jsonb_agg(jsonb_build_object('nickname', game_engine.nickname_of(r.user_id), 'score', r.score, 'isMe', r.user_id = uid))
                           from public.competition_results r where r.competition_id = prev.id and r.is_winner), '[]'::jsonb));
  end if;
  return jsonb_build_object('now', game_engine.ms(now_at), 'competition', comp, 'lastWeek', last_week,
    'nickname', case when uid is not null then game_engine.nickname_of(uid) end,
    'rules', (select jsonb_object_agg(id, rules_version) from public.game_definitions));
end;
$$;

-- Start (or resume) a server-run match. Competition: needs an active week and an unused attempt; an open match is
-- resumed rather than starting another. Challenge: one match per player per challenge, started before it expires.
create or replace function public.start_match(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  now_at timestamptz := now();
  c public.game_competitions;
  ch public.game_challenges;
  m public.game_matches;
  used integer;
begin
  if request ->> 'kind' = 'competition' then
    select * into c from public.game_competitions where id = request ->> 'competitionId' and status = 'scheduled';
    if c.id is null then raise exception 'games:not_found' using errcode = 'P0001'; end if;
    if now_at < c.starts_at then raise exception 'games:not_started' using errcode = 'P0001'; end if;
    if now_at >= c.ends_at or c.finalized_at is not null then raise exception 'games:closed' using errcode = 'P0001'; end if;
    -- One start at a time per player and week, so two taps can't use two attempts.
    perform pg_advisory_xact_lock(hashtext('games:' || uid::text || ':' || c.id));
    select * into m from public.game_matches where competition_id = c.id and user_id = uid and status = 'active';
    if m.id is not null then return game_engine.match_json(m); end if;
    select count(*) into used from public.game_matches where competition_id = c.id and user_id = uid;
    if used >= c.max_attempts then raise exception 'games:no_attempts' using errcode = 'P0001'; end if;
    insert into public.game_matches (user_id, kind, competition_id, game_id, bot, difficulty, rules_version, seed, attempt)
    select uid, 'competition', c.id, c.game_id, c.bot, c.difficulty, d.rules_version, game_engine.new_seed(), used + 1
    from public.game_definitions d where d.id = c.game_id
    returning * into m;
    return game_engine.match_json(m);
  elsif request ->> 'kind' = 'challenge' then
    select * into ch from public.game_challenges where token = request ->> 'token';
    if ch.id is null then raise exception 'games:not_found' using errcode = 'P0001'; end if;
    select * into m from public.game_matches where challenge_id = ch.id and user_id = uid;
    if m.id is not null then return game_engine.match_json(m); end if;
    if now_at >= ch.expires_at then raise exception 'games:expired' using errcode = 'P0001'; end if;
    if ch.rules_version <> (select rules_version from public.game_definitions where id = ch.game_id) then
      raise exception 'games:outdated' using errcode = 'P0001';
    end if;
    insert into public.game_matches (user_id, kind, challenge_id, game_id, bot, difficulty, rules_version, seed)
    values (uid, 'challenge', ch.id, ch.game_id, ch.bot, ch.difficulty, ch.rules_version, ch.seed)
    on conflict do nothing
    returning * into m;
    if m.id is null then select * into m from public.game_matches where challenge_id = ch.id and user_id = uid; end if;
    return game_engine.match_json(m);
  end if;
  raise exception 'games:invalid_request' using errcode = 'P0001';
end;
$$;

-- Play one round. `round` is the 0-based round the player answered: a repeat of an already-played round returns the
-- match unchanged (a retry or double tap), any other mismatch is 'stale'. The bot's move is decided here from the
-- rounds already played; the score is computed here. Competition rounds are refused once the week has ended.
create or replace function public.play_match_round(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  m public.game_matches;
  c public.game_competitions;
  played integer;
  rnd integer;
  r jsonb;
  t integer[];
begin
  if jsonb_typeof(request -> 'round') is distinct from 'number' then raise exception 'games:invalid_request' using errcode = 'P0001'; end if;
  rnd := (request ->> 'round')::numeric::integer;
  select * into m from public.game_matches where id = game_engine.match_id(request ->> 'matchId') and user_id = uid for update;
  if m.id is null then raise exception 'games:not_found' using errcode = 'P0001'; end if;
  played := jsonb_array_length(m.rounds);
  if rnd < played then return game_engine.match_json(m) || jsonb_build_object('duplicate', true); end if;
  if m.status = 'expired' then raise exception 'games:closed' using errcode = 'P0001'; end if;
  if m.status <> 'active' then raise exception 'games:finished' using errcode = 'P0001'; end if;
  if rnd <> played then raise exception 'games:stale' using errcode = 'P0001'; end if;
  if m.competition_id is not null then
    select * into c from public.game_competitions where id = m.competition_id;
    if now() >= c.ends_at or c.finalized_at is not null then raise exception 'games:closed' using errcode = 'P0001'; end if;
  end if;
  r := game_engine.resolve(m.game_id, m.bot, m.difficulty, m.seed, m.rounds, request -> 'move');
  m.rounds := m.rounds || jsonb_build_array(r);
  t := game_engine.totals(m.game_id, m.rounds);
  update public.game_matches
  set rounds = m.rounds, player_score = t[1], bot_score = t[2], updated_at = now(),
      status = case when played + 1 >= game_engine.rounds(m.game_id) then 'completed' else 'active' end,
      completed_at = case when played + 1 >= game_engine.rounds(m.game_id) then now() end
  where id = m.id
  returning * into m;
  return game_engine.match_json(m);
end;
$$;

create or replace function public.get_match(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  m public.game_matches;
begin
  select * into m from public.game_matches where id = game_engine.match_id(request ->> 'matchId') and user_id = uid;
  if m.id is null then raise exception 'games:not_found' using errcode = 'P0001'; end if;
  return game_engine.match_json(m);
end;
$$;

-- Leaderboards. scope 'weekly' (a competition; default: the featured one) or 'global'. Top 50, plus the caller's
-- own row when they have one. Nicknames only — never ids or emails.
create or replace function public.get_leaderboard(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  now_at timestamptz := now();
  c public.game_competitions;
  top jsonb;
  mine jsonb;
  lim integer := 50;
begin
  perform content_admin.finalize_competitions(now_at);
  if request ->> 'scope' = 'global' then
    with totals as (
      select r.user_id, sum(r.points)::integer as points, count(*) filter (where r.is_winner)::integer as wins, count(*)::integer as weeks
      from public.competition_results r group by r.user_id
    ), ranked as (
      select t.*, (rank() over (order by t.points desc, t.wins desc))::integer as rnk from totals t
    )
    select
      coalesce((select jsonb_agg(jsonb_build_object('rank', x.rnk, 'nickname', game_engine.nickname_of(x.user_id), 'points', x.points, 'wins', x.wins, 'weeks', x.weeks, 'isMe', x.user_id = uid) order by x.rnk, x.points desc)
                from (select * from ranked order by rnk limit lim) x), '[]'::jsonb),
      (select jsonb_build_object('rank', x.rnk, 'nickname', game_engine.nickname_of(x.user_id), 'points', x.points, 'wins', x.wins, 'weeks', x.weeks, 'isMe', true)
       from ranked x where x.user_id = uid)
    into top, mine;
    return jsonb_build_object('scope', 'global', 'entries', top, 'me', mine,
      'players', (select count(distinct user_id) from public.competition_results));
  end if;

  if request ->> 'competitionId' is not null then
    select * into c from public.game_competitions where id = request ->> 'competitionId' and status = 'scheduled';
  else
    select * into c from public.game_competitions where status = 'scheduled' and starts_at <= now_at order by starts_at desc limit 1;
  end if;
  if c.id is null then return jsonb_build_object('scope', 'weekly', 'competition', null, 'entries', '[]'::jsonb, 'me', null); end if;

  if c.finalized_at is not null then
    select
      coalesce((select jsonb_agg(jsonb_build_object('rank', r.rank, 'nickname', game_engine.nickname_of(r.user_id), 'score', r.score, 'points', r.points, 'isWinner', r.is_winner, 'isMe', r.user_id = uid) order by r.rank, r.achieved_at)
                from (select * from public.competition_results where competition_id = c.id order by rank, achieved_at limit lim) r), '[]'::jsonb),
      (select jsonb_build_object('rank', r.rank, 'nickname', game_engine.nickname_of(r.user_id), 'score', r.score, 'points', r.points, 'isWinner', r.is_winner, 'isMe', true)
       from public.competition_results r where r.competition_id = c.id and r.user_id = uid)
    into top, mine;
  else
    select
      coalesce((select jsonb_agg(jsonb_build_object('rank', s.rank, 'nickname', game_engine.nickname_of(s.user_id), 'score', s.score, 'isMe', s.user_id = uid) order by s.rank, s.achieved_at)
                from (select * from game_engine.live_standings(c) order by rank, achieved_at limit lim) s), '[]'::jsonb),
      (select jsonb_build_object('rank', s.rank, 'nickname', game_engine.nickname_of(s.user_id), 'score', s.score, 'isMe', true)
       from game_engine.live_standings(c) s where s.user_id = uid)
    into top, mine;
  end if;
  return jsonb_build_object('scope', 'weekly', 'entries', top, 'me', mine,
    'competition', jsonb_build_object('id', c.id, 'game', c.game_id, 'bot', c.bot, 'difficulty', c.difficulty,
      'startsAt', game_engine.ms(c.starts_at), 'endsAt', game_engine.ms(c.ends_at), 'phase', game_engine.phase(c, now_at),
      'participants', coalesce(c.participants, (select count(*) from game_engine.live_standings(c)))::integer),
    'now', game_engine.ms(now_at));
end;
$$;

-- Every finalized week, newest first, with its official winner(s). Derived from competition_results only.
create or replace function public.get_hall_of_fame(request jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  perform content_admin.finalize_competitions(now());
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'game', c.game_id, 'bot', c.bot, 'difficulty', c.difficulty,
      'startsAt', game_engine.ms(c.starts_at), 'endsAt', game_engine.ms(c.ends_at), 'participants', c.participants,
      'winners', coalesce((select jsonb_agg(jsonb_build_object('nickname', game_engine.nickname_of(r.user_id), 'score', r.score, 'isMe', r.user_id = uid) order by r.achieved_at)
                           from public.competition_results r where r.competition_id = c.id and r.is_winner), '[]'::jsonb),
      'runnerUpScore', (select max(r.score) from public.competition_results r where r.competition_id = c.id and not r.is_winner))
      order by c.ends_at desc)
    from (select * from public.game_competitions where finalized_at is not null order by ends_at desc limit 104) c), '[]'::jsonb);
end;
$$;

-- Create a friend challenge: the same game, opponent and random draws for everyone who opens the link. At most 20 a
-- day per player. Valid for 30 days.
create or replace function public.create_challenge(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  g public.game_definitions;
  ch public.game_challenges;
begin
  select * into g from public.game_definitions where id = request ->> 'game';
  if g.id is null or not coalesce(request ->> 'bot' = any (g.bots), false) or coalesce(request ->> 'difficulty', '') not in ('easy', 'medium', 'hard') then
    raise exception 'games:invalid_request' using errcode = 'P0001';
  end if;
  if (select count(*) from public.game_challenges where created_by = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'games:rate_limited' using errcode = 'P0001';
  end if;
  insert into public.game_challenges (token, game_id, bot, difficulty, rules_version, seed, created_by, expires_at)
  values (substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), g.id, request ->> 'bot', request ->> 'difficulty', g.rules_version,
          game_engine.new_seed(), uid, now() + interval '30 days')
  returning * into ch;
  return jsonb_build_object('token', ch.token, 'game', ch.game_id, 'bot', ch.bot, 'difficulty', ch.difficulty, 'expiresAt', game_engine.ms(ch.expires_at));
end;
$$;

-- What a challenge link shows: the game and opponent, whether it's still open, the creator's nickname and result
-- (only once they've actually finished it), and the caller's own match. Never the seed or any user id.
create or replace function public.get_challenge(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  ch public.game_challenges;
  creator public.game_matches;
  mine public.game_matches;
begin
  if coalesce(request ->> 'token', '') !~ '^[0-9a-f]{20}$' then raise exception 'games:not_found' using errcode = 'P0001'; end if;
  select * into ch from public.game_challenges where token = request ->> 'token';
  if ch.id is null then raise exception 'games:not_found' using errcode = 'P0001'; end if;
  select * into creator from public.game_matches where challenge_id = ch.id and user_id = ch.created_by and status = 'completed';
  if uid is not null then select * into mine from public.game_matches where challenge_id = ch.id and user_id = uid; end if;
  return jsonb_build_object(
    'token', ch.token, 'game', ch.game_id, 'bot', ch.bot, 'difficulty', ch.difficulty, 'rulesVersion', ch.rules_version,
    'createdAt', game_engine.ms(ch.created_at), 'expiresAt', game_engine.ms(ch.expires_at), 'expired', now() >= ch.expires_at,
    'isCreator', uid is not null and ch.created_by = uid,
    'creatorNickname', game_engine.nickname_of(ch.created_by),
    'creatorResult', case when creator.id is not null then jsonb_build_object('playerScore', creator.player_score, 'botScore', creator.bot_score,
                       'outcome', game_engine.outcome(creator.game_id, creator.rounds), 'completedAt', game_engine.ms(creator.completed_at)) end,
    'players', (select count(*) from public.game_matches m where m.challenge_id = ch.id and m.status = 'completed'),
    'myMatch', case when mine.id is not null then game_engine.match_json(mine) end);
end;
$$;

-- Save a practice game to the player's own history. Practice is played on the device, so this is unverified and
-- never ranked; it exists for "your recent games". Idempotent per client id; at most 300 a day.
create or replace function public.record_practice_game(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  g public.game_definitions;
begin
  select * into g from public.game_definitions where id = request ->> 'game';
  if g.id is null or not coalesce(request ->> 'bot' = any (g.bots), false) or coalesce(request ->> 'difficulty', '') not in ('easy', 'medium', 'hard')
     or coalesce(request ->> 'outcome', '') not in ('win', 'loss', 'draw')
     or jsonb_typeof(request -> 'playerScore') is distinct from 'number' or jsonb_typeof(request -> 'botScore') is distinct from 'number'
     or coalesce(request ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'games:invalid_request' using errcode = 'P0001';
  end if;
  if (select count(*) from public.game_practice_results where user_id = uid and played_at > now() - interval '1 day') >= 300 then
    raise exception 'games:rate_limited' using errcode = 'P0001';
  end if;
  insert into public.game_practice_results (user_id, client_id, game_id, bot, difficulty, rules_version, player_score, bot_score, outcome)
  values (uid, (request ->> 'id')::uuid, g.id, request ->> 'bot', request ->> 'difficulty', g.rules_version,
          (request ->> 'playerScore')::numeric::integer, (request ->> 'botScore')::numeric::integer, request ->> 'outcome')
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- The caller's own game record: recent practice and server matches, and their competitive standing (global rank,
-- points, weekly wins, recent weekly results). Competitive points are kept apart from anything in the learning profile.
create or replace function public.get_my_games() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  standing jsonb;
begin
  perform content_admin.finalize_competitions(now());
  with totals as (
    select r.user_id, sum(r.points)::integer as points, count(*) filter (where r.is_winner)::integer as wins, count(*)::integer as weeks
    from public.competition_results r group by r.user_id
  ), ranked as (select t.*, (rank() over (order by t.points desc, t.wins desc))::integer as rnk from totals t)
  select jsonb_build_object('rank', rnk, 'points', points, 'wins', wins, 'weeks', weeks, 'players', (select count(*) from totals))
  into standing from ranked where user_id = uid;
  return jsonb_build_object(
    'nickname', game_engine.nickname_of(uid),
    'standing', standing,
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('competitionId', r.competition_id, 'game', c.game_id, 'endsAt', game_engine.ms(c.ends_at),
                         'rank', r.rank, 'field', r.field_size, 'score', r.score, 'points', r.points, 'isWinner', r.is_winner) order by c.ends_at desc)
                       from (select * from public.competition_results where user_id = uid) r join public.game_competitions c on c.id = r.competition_id), '[]'::jsonb),
    'practice', coalesce((select jsonb_agg(jsonb_build_object('game', p.game_id, 'bot', p.bot, 'difficulty', p.difficulty, 'playerScore', p.player_score,
                           'botScore', p.bot_score, 'outcome', p.outcome, 'playedAt', game_engine.ms(p.played_at)) order by p.played_at desc)
                         from (select * from public.game_practice_results where user_id = uid order by played_at desc limit 30) p), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'game', m.game_id, 'bot', m.bot, 'difficulty', m.difficulty,
                          'playerScore', m.player_score, 'botScore', m.bot_score, 'outcome', game_engine.outcome(m.game_id, m.rounds), 'competitionId', m.competition_id,
                          'completedAt', game_engine.ms(m.completed_at)) order by m.completed_at desc)
                        from (select * from public.game_matches where user_id = uid and status = 'completed' order by completed_at desc limit 30) m), '[]'::jsonb));
end;
$$;

revoke all on function public.set_nickname(jsonb), public.get_games_overview(), public.start_match(jsonb), public.play_match_round(jsonb),
  public.get_match(jsonb), public.get_leaderboard(jsonb), public.get_hall_of_fame(jsonb), public.create_challenge(jsonb),
  public.get_challenge(jsonb), public.record_practice_game(jsonb), public.get_my_games() from public;
grant execute on function public.get_games_overview(), public.get_leaderboard(jsonb), public.get_hall_of_fame(jsonb), public.get_challenge(jsonb) to anon, authenticated;
-- Supabase grants new functions to anon by default; these need a signed-in user.
revoke all on function public.set_nickname(jsonb), public.start_match(jsonb), public.play_match_round(jsonb), public.get_match(jsonb),
  public.create_challenge(jsonb), public.record_practice_game(jsonb), public.get_my_games() from anon;
grant execute on function public.set_nickname(jsonb), public.start_match(jsonb), public.play_match_round(jsonb), public.get_match(jsonb),
  public.create_challenge(jsonb), public.record_practice_game(jsonb), public.get_my_games() to authenticated;
