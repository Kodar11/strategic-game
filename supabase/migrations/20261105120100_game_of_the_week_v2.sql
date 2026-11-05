-- Game of the Week v2: all 23 games eligible (the five SQL-engine classics plus the 18 Strategy Arena games, run on
-- the server by the arena-match Edge Function), automatic rotation, manual scheduling from the SQL Editor with an
-- audit trail, a locked configuration once a week starts, a grace period for matches in progress at the end,
-- game-specific scoring with documented tie-breaks, permanent champion records and history.
-- See docs/GAME_OF_THE_WEEK.md and docs/SQL_EDITOR_OPERATIONS.md.
--
-- Builds on 20261027140000_games.sql. Nothing is dropped; finalized results stay exactly as they were.

-- ── Settings ─────────────────────────────────────────────────────────────────

-- The Arena games need the arena-match Edge Function. Until it is deployed and this is switched on, automatic
-- rotation uses the five SQL-engine games only and scheduling an Arena game is refused — so the app never features
-- a game nobody can play. After deploying: update public.competition_settings set arena_server_enabled = true;
alter table public.competition_settings add column arena_server_enabled boolean not null default false;

-- ── The 23 games ─────────────────────────────────────────────────────────────

alter table public.game_definitions drop constraint game_definitions_id_check;
alter table public.game_definitions
  -- 'sql': rounds resolved by the game_engine SQL functions. 'arena': run by the arena-match Edge Function.
  add column engine text not null default 'sql' check (engine in ('sql', 'arena')),
  add column variants text[] not null default '{}',
  -- Whether the game may be featured (its server-authoritative integration is in place and tested).
  add column competition_ready boolean not null default true;

insert into public.game_definitions (id, title, rules_version, rounds, bots, engine, variants)
select id, title, 1, rounds, bots, 'arena', variants from (values
    ('cooperation', 'The Cooperation Game', 10, array['collaborator', 'retaliator', 'opportunist', 'chameleon'], array['classic', 'high-stakes', 'noisy']),
    ('ultimatum-game', 'The Ultimatum Game', 6, array['investor', 'banker', 'dealmaker', 'opportunist'], array['standard', 'outside-options']),
    ('auction', 'The Auction House', 5, array['investor', 'banker', 'dealmaker', 'opportunist'], array['standard', 'fog']),
    ('market', 'The Market Rivals', 8, array['investor', 'banker', 'dealmaker', 'opportunist'], array['standard', 'price-war', 'volatile']),
    ('signal', 'The Hidden Signal', 8, array['investor', 'banker', 'dealmaker', 'opportunist'], array['standard', 'murky']),
    ('mole', 'The Mole', 5, array['investigator', 'social-reader', 'deceiver', 'opportunist'], array['standard', 'blurry']),
    ('commons', 'The Commons', 8, array['conservator', 'free-rider', 'conditional', 'maximizer'], array['standard', 'fragile']),
    ('coalition', 'The Coalition', 8, array['loyal', 'broker', 'switcher', 'fair'], array['standard']),
    ('inspector', 'The Inspector', 8, array['strict', 'calculated', 'rule-follower', 'risk-taker'], array['standard', 'heavy-fines']),
    ('travelers', 'The Traveler’s Dilemma', 8, array['purist', 'cooperative', 'undercutter', 'adaptive'], array['standard', 'big-bonus']),
    ('saboteur', 'The Saboteur', 6, array['planner', 'investigator', 'opportunist', 'deceiver'], array['standard']),
    ('bluff', 'Bluff', 8, array['cautious', 'risk-taker', 'observant', 'performer'], array['standard']),
    ('defusal', 'The Defusal', 7, array['methodical', 'cautious', 'bold', 'sharer'], array['standard']),
    ('power-play', 'The Power Play', 12, array['honest', 'bluffer', 'challenger', 'manipulator'], array['standard']),
    ('last-stand', 'The Last Stand', 8, array['planner', 'responder', 'guardian', 'coordinator'], array['standard', 'drought']),
    ('liars-dice', 'Liar’s Dice', 7, array['calculator', 'aggressive', 'conservative', 'psychological'], array['standard']),
    ('codebreaker', 'The Codebreaker', 6, array['literal', 'associative', 'risk-aware', 'creative'], array['standard']),
    ('gambit', 'The Gambit', 14, array['safe', 'gambler', 'positional', 'adaptive'], array['standard'])
  ) as v(id, title, rounds, bots, variants);

-- Opponents per game, for the table checks. Classic games keep their bots; Arena games use their engines' opponents
-- (src/arena/<game>.ts `opponents`; supabase/__tests__/weekly.test.ts checks they match).
create or replace function game_engine.bots(game text) returns text[]
language sql immutable set search_path = '' as $$
  select case game
    when 'rps' then array['repeater', 'counter', 'mind-reader', 'randomizer']
    when 'two-thirds' then array['crowd-follower', 'shallow', 'deep', 'chaos']
    when 'split-steal' then array['cooperator', 'opportunist', 'retaliator', 'strategist']
    when 'ultimatum' then array['maximizer', 'fair', 'hardliner', 'negotiator']
    when 'stag-hunt' then array['cautious', 'optimist', 'opportunistic', 'conditional']
    when 'cooperation' then array['collaborator', 'retaliator', 'opportunist', 'chameleon']
    when 'ultimatum-game' then array['investor', 'banker', 'dealmaker', 'opportunist']
    when 'auction' then array['investor', 'banker', 'dealmaker', 'opportunist']
    when 'market' then array['investor', 'banker', 'dealmaker', 'opportunist']
    when 'signal' then array['investor', 'banker', 'dealmaker', 'opportunist']
    when 'mole' then array['investigator', 'social-reader', 'deceiver', 'opportunist']
    when 'commons' then array['conservator', 'free-rider', 'conditional', 'maximizer']
    when 'coalition' then array['loyal', 'broker', 'switcher', 'fair']
    when 'inspector' then array['strict', 'calculated', 'rule-follower', 'risk-taker']
    when 'travelers' then array['purist', 'cooperative', 'undercutter', 'adaptive']
    when 'saboteur' then array['planner', 'investigator', 'opportunist', 'deceiver']
    when 'bluff' then array['cautious', 'risk-taker', 'observant', 'performer']
    when 'defusal' then array['methodical', 'cautious', 'bold', 'sharer']
    when 'power-play' then array['honest', 'bluffer', 'challenger', 'manipulator']
    when 'last-stand' then array['planner', 'responder', 'guardian', 'coordinator']
    when 'liars-dice' then array['calculator', 'aggressive', 'conservative', 'psychological']
    when 'codebreaker' then array['literal', 'associative', 'risk-aware', 'creative']
    when 'gambit' then array['safe', 'gambler', 'positional', 'adaptive']
  end
$$;
revoke all on function game_engine.bots(text) from public, anon, authenticated;

-- Why a competition configuration can't be used for `game`, or null.
--   sql games:   {"bot": <one of its bots>, "difficulty": "easy" | "medium" | "hard"}
--   arena games: {"opponent": <one of its opponents>, "level": "easy" | "normal" | "hard",
--                 "variant": <one of its variants>, "length": "short" | "standard" | "long"}
-- (The same rules as configProblem in src/competition/arena-match.ts.)
create or replace function game_engine.config_problem(game text, cfg jsonb) returns text
language plpgsql stable set search_path = '' as $$
declare
  g public.game_definitions;
  extra text;
begin
  select * into g from public.game_definitions where id = game;
  if g.id is null then return format('%s is not a game (see select * from content_admin.weekly_games)', coalesce(game, 'null')); end if;
  if jsonb_typeof(cfg) is distinct from 'object' then return 'config must be a JSON object'; end if;
  if g.engine = 'sql' then
    select string_agg(k, ', ') into extra from jsonb_object_keys(cfg) k where k not in ('bot', 'difficulty');
    if extra is not null then return format('unknown config fields for %s: %s', game, extra); end if;
    if not coalesce(cfg ->> 'bot' = any (g.bots), false) then return format('bot must be one of %s', array_to_string(g.bots, ', ')); end if;
    if coalesce(cfg ->> 'difficulty', '') not in ('easy', 'medium', 'hard') then return 'difficulty must be easy, medium or hard'; end if;
  else
    select string_agg(k, ', ') into extra from jsonb_object_keys(cfg) k where k not in ('opponent', 'level', 'variant', 'length');
    if extra is not null then return format('unknown config fields for %s: %s', game, extra); end if;
    if not coalesce(cfg ->> 'opponent' = any (g.bots), false) then return format('opponent must be one of %s', array_to_string(g.bots, ', ')); end if;
    if coalesce(cfg ->> 'level', '') not in ('easy', 'normal', 'hard') then return 'level must be easy, normal or hard'; end if;
    if not coalesce(cfg ->> 'variant' = any (g.variants), false) then return format('variant must be one of %s', array_to_string(g.variants, ', ')); end if;
    if coalesce(cfg ->> 'length', '') not in ('short', 'standard', 'long') then return 'length must be short, standard or long'; end if;
  end if;
  return null;
end;
$$;
revoke all on function game_engine.config_problem(text, jsonb) from public, anon, authenticated;

-- The fixed configuration each game is featured with unless a manual schedule says otherwise. One opponent and one
-- difficulty for everybody, from the game's existing personalities and difficulty levels (nothing new is invented).
create table public.competition_game_configs (
  game_id text primary key references public.game_definitions (id) on delete cascade,
  config jsonb not null,
  -- false keeps a game out of automatic rotation (it can still be scheduled manually).
  in_rotation boolean not null default true,
  updated_at timestamptz not null default now(),
  check (game_engine.config_problem(game_id, config) is null)
);
alter table public.competition_game_configs enable row level security;
revoke all on public.competition_game_configs from anon, authenticated;
insert into public.competition_game_configs (game_id, config) values
  ('rps', '{"bot": "mind-reader", "difficulty": "hard"}'),
  ('two-thirds', '{"bot": "deep", "difficulty": "hard"}'),
  ('split-steal', '{"bot": "strategist", "difficulty": "hard"}'),
  ('ultimatum', '{"bot": "negotiator", "difficulty": "hard"}'),
  ('stag-hunt', '{"bot": "conditional", "difficulty": "hard"}'),
  ('cooperation', '{"opponent": "chameleon", "level": "normal", "variant": "classic", "length": "standard"}'),
  ('ultimatum-game', '{"opponent": "dealmaker", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('auction', '{"opponent": "banker", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('market', '{"opponent": "opportunist", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('signal', '{"opponent": "investor", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('mole', '{"opponent": "deceiver", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('commons', '{"opponent": "conditional", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('coalition', '{"opponent": "broker", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('inspector', '{"opponent": "calculated", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('travelers', '{"opponent": "adaptive", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('saboteur', '{"opponent": "deceiver", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('bluff', '{"opponent": "observant", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('defusal', '{"opponent": "methodical", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('power-play', '{"opponent": "manipulator", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('last-stand', '{"opponent": "planner", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('liars-dice', '{"opponent": "calculator", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('codebreaker', '{"opponent": "associative", "level": "normal", "variant": "standard", "length": "standard"}'),
  ('gambit', '{"opponent": "adaptive", "level": "normal", "variant": "standard", "length": "standard"}');
create trigger competition_game_configs_touch before update on public.competition_game_configs
  for each row execute function public.touch_updated_at();

-- ── Competitions ─────────────────────────────────────────────────────────────

alter table public.game_competitions drop constraint game_competitions_difficulty_check;
alter table public.game_competitions add constraint game_competitions_difficulty_check check (difficulty in ('easy', 'medium', 'normal', 'hard'));
alter table public.game_competitions drop constraint game_competitions_scoring_version_check;
alter table public.game_competitions add constraint game_competitions_scoring_version_check check (scoring_version in (1, 2));
alter table public.game_competitions
  add column number integer,
  -- The full fixed configuration snapshot (see game_engine.config_problem). bot/difficulty mirror it for the checks.
  add column config jsonb,
  add column rules_version integer,
  add column source text not null default 'manual' check (source in ('automatic', 'manual')),
  add column scheduled_by text not null default current_user,
  add column schedule_note text,
  -- Ranked matches started before the end may be finished up to this many seconds after it.
  add column grace_seconds integer not null default 0 check (grace_seconds between 0 and 7200),
  add column cancelled_at timestamptz,
  add column cancel_reason text,
  add column updated_at timestamptz not null default now();

-- Existing weeks: numbered in start order, configuration snapshotted from their columns.
update public.game_competitions c set number = n.num,
  config = jsonb_build_object('bot', c.bot, 'difficulty', c.difficulty),
  rules_version = (select d.rules_version from public.game_definitions d where d.id = c.game_id)
from (select id, row_number() over (order by starts_at, id) as num from public.game_competitions) n
where n.id = c.id;
alter table public.game_competitions alter column number set not null, alter column config set not null, alter column rules_version set not null;
alter table public.game_competitions add constraint game_competitions_number_key unique (number);
alter table public.game_competitions add constraint game_competitions_config_check check (game_engine.config_problem(game_id, config) is null);

-- Fill the derived columns on insert, so the SQL Editor and the scheduler can't forget them: the competition number
-- (next in sequence), the configuration snapshot from bot/difficulty (or bot/difficulty from the snapshot) and the
-- game's current rules version.
create or replace function public.game_competitions_fill() returns trigger
language plpgsql set search_path = '' as $$
declare
  g public.game_definitions;
begin
  select * into g from public.game_definitions where id = new.game_id;
  if new.number is null then
    perform pg_advisory_xact_lock(hashtext('weekly-number'));
    select coalesce(max(number), 0) + 1 into new.number from public.game_competitions;
  end if;
  if new.config is null then
    new.config := case when g.engine = 'arena'
      then jsonb_build_object('opponent', new.bot, 'level', case new.difficulty when 'medium' then 'normal' else new.difficulty end,
             'variant', g.variants[1], 'length', 'standard')
      else jsonb_build_object('bot', new.bot, 'difficulty', new.difficulty) end;
  end if;
  if g.engine = 'arena' then
    new.bot := new.config ->> 'opponent';
    new.difficulty := new.config ->> 'level';
  else
    new.bot := new.config ->> 'bot';
    new.difficulty := new.config ->> 'difficulty';
  end if;
  new.rules_version := coalesce(new.rules_version, g.rules_version);
  return new;
end;
$$;
create trigger game_competitions_fill before insert on public.game_competitions
  for each row execute function public.game_competitions_fill();
create trigger game_competitions_touch before update on public.game_competitions
  for each row execute function public.touch_updated_at();

-- Replaces the v1 guard. No two non-cancelled competitions overlap; a finalized one never changes; once a week has
-- started (or has matches) its game, configuration, dates and rules are locked — even with no matches yet — unless
-- the change comes from content_admin.correct_competition (the audited emergency path).
create or replace function public.game_competitions_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  locked_fields constant text[] := array['game_id', 'bot', 'difficulty', 'starts_at', 'ends_at', 'scoring_version', 'max_attempts',
    'winner_bonus', 'config', 'rules_version', 'grace_seconds'];
  changed boolean;
begin
  if new.status = 'scheduled' and exists (
    select 1 from public.game_competitions c
    where c.id <> new.id and c.status = 'scheduled' and c.starts_at < new.ends_at and new.starts_at < c.ends_at
  ) then
    raise exception 'competition %: overlaps another scheduled competition', new.id;
  end if;
  if tg_op = 'UPDATE' then
    if old.finalized_at is not null and (to_jsonb(new) - array['participants', 'updated_at']) is distinct from (to_jsonb(old) - array['participants', 'updated_at']) then
      raise exception 'competition % is finalized and can''t change', old.id;
    end if;
    if old.finalized_at is null and new.finalized_at is not distinct from old.finalized_at
       and current_setting('competition.correction', true) is distinct from 'on' then
      changed := exists (select 1 from unnest(locked_fields) f where to_jsonb(new) -> f is distinct from to_jsonb(old) -> f)
        or new.status is distinct from old.status;
      if changed and exists (select 1 from public.game_matches m where m.competition_id = old.id) then
        raise exception 'competition % has matches: its game, opponent, dates and rules can''t change', old.id;
      end if;
      if changed and now() >= old.starts_at then
        raise exception 'competition % has started: its game, opponent, dates and rules are locked (emergency: content_admin.correct_competition)', old.id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Every scheduling decision: created (automatic or manual), replaced, cancelled, corrected. Append-only.
create table public.competition_schedule_audit (
  seq bigint generated always as identity primary key,
  competition_id text not null,
  action text not null check (action in ('created', 'replaced', 'cancelled', 'corrected')),
  source text not null check (source in ('automatic', 'manual')),
  before jsonb,
  after jsonb,
  actor text not null default current_user,
  note text,
  at timestamptz not null default now()
);
create index competition_schedule_audit_comp_idx on public.competition_schedule_audit (competition_id, seq);
alter table public.competition_schedule_audit enable row level security;
revoke all on public.competition_schedule_audit from anon, authenticated;
create or replace function public.competition_schedule_audit_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'the schedule audit is append-only';
end;
$$;
create trigger competition_schedule_audit_immutable before update or delete on public.competition_schedule_audit
  for each row execute function public.competition_schedule_audit_immutable();

-- ── Matches ──────────────────────────────────────────────────────────────────

alter table public.game_matches drop constraint game_matches_difficulty_check;
alter table public.game_matches add constraint game_matches_difficulty_check check (difficulty in ('easy', 'medium', 'normal', 'hard'));
alter table public.game_matches
  -- Arena matches: the configuration snapshot and the player's action log (the match is its replay). Never sent to
  -- another player; the seed never leaves the server while the match is active.
  add column config jsonb,
  add column actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) <= 200),
  -- The official competition score (scoring version 2): match points for the classics; the game's documented score
  -- for Arena games (src/competition/scoring.ts). `secondary` is the game's tie-break or null.
  add column score integer,
  add column secondary integer,
  add column outcome text check (outcome is null or outcome in ('win', 'loss', 'draw')),
  add column score_label text,
  -- Arena: the server-computed result and debrief (shown on the result screen; never trusted from the device).
  add column result jsonb,
  add column debrief jsonb,
  add column scoring_version smallint;

alter table public.game_matches disable trigger game_matches_guard;
update public.game_matches set score = player_score, outcome = game_engine.outcome(game_id, rounds), scoring_version = 1,
  score_label = player_score::text || ' points'
where status = 'completed';
alter table public.game_matches enable trigger game_matches_guard;
create index game_matches_board_v2_idx on public.game_matches (competition_id, score desc, secondary desc, completed_at) where status = 'completed';

-- ── Results and champions ────────────────────────────────────────────────────

alter table public.competition_results
  add column secondary integer,
  add column score_label text,
  add column attempts_used smallint,
  -- The nickname at finalization, so a later rename doesn't rewrite history (null: the player had none).
  add column nickname_snapshot text,
  add column outcome text;

-- One row per champion of a finalized week — a permanent snapshot, never derived from a live query. Ties after every
-- tie-break share the title (several rows, shared = true): nobody is picked at random.
create table public.weekly_champions (
  competition_id text not null references public.game_competitions (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  competition_number integer not null,
  game_id text not null,
  nickname_snapshot text,
  score integer not null,
  secondary integer,
  score_label text,
  final_rank integer not null default 1 check (final_rank = 1),
  shared boolean not null,
  -- How the title was decided against the best non-champion: 'score', 'secondary' (the game's tie-break),
  -- 'earliest' (reached the winning score first), 'unopposed' (the only player), or 'shared'.
  decided_by text not null check (decided_by in ('score', 'secondary', 'earliest', 'unopposed', 'shared')),
  runner_up_score integer,
  field_size integer not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  finalized_at timestamptz not null default now(),
  scoring_version integer not null,
  rules_version integer not null,
  config jsonb not null,
  primary key (competition_id, user_id)
);
create index weekly_champions_user_idx on public.weekly_champions (user_id);
alter table public.weekly_champions enable row level security;
revoke all on public.weekly_champions from anon, authenticated;
create trigger weekly_champions_immutable before update or delete on public.weekly_champions
  for each row execute function public.competition_results_immutable();

-- Weeks finalized before v2: their winners become champion records (same data, from competition_results).
insert into public.weekly_champions (competition_id, user_id, competition_number, game_id, nickname_snapshot, score, final_rank, shared,
  decided_by, runner_up_score, field_size, starts_at, ends_at, finalized_at, scoring_version, rules_version, config)
select r.competition_id, r.user_id, c.number, c.game_id, game_engine.nickname_of(r.user_id), r.score, 1,
  (select count(*) from public.competition_results x where x.competition_id = r.competition_id and x.is_winner) > 1,
  case when (select count(*) from public.competition_results x where x.competition_id = r.competition_id and x.is_winner) > 1 then 'shared'
       when r.field_size = 1 then 'unopposed'
       when (select max(x.score) from public.competition_results x where x.competition_id = r.competition_id and not x.is_winner) < r.score then 'score'
       else 'earliest' end,
  (select max(x.score) from public.competition_results x where x.competition_id = r.competition_id and not x.is_winner),
  r.field_size, c.starts_at, c.ends_at, r.finalized_at, r.scoring_version, c.rules_version, c.config
from public.competition_results r join public.game_competitions c on c.id = r.competition_id
where r.is_winner;

do $$
declare
  t text;
begin
  foreach t in array array['competition_game_configs', 'competition_schedule_audit', 'weekly_champions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- The last moment a ranked match of `c` can be completed.
create or replace function game_engine.deadline(c public.game_competitions) returns timestamptz
language sql immutable set search_path = '' as $$ select c.ends_at + make_interval(secs => c.grace_seconds) $$;

-- The explicit lifecycle: scheduled → active → finalizing (ended; in-progress matches may finish during the grace
-- period, then results are finalized) → completed; or cancelled. Derived from the stored timestamps on every read,
-- so a week activates and closes on time even if no job runs; the scheduler only does the writes (finalization).
create or replace function game_engine.competition_state(c public.game_competitions, now_at timestamptz) returns text
language sql stable set search_path = '' as $$
  select case when c.status = 'cancelled' then 'cancelled'
              when c.finalized_at is not null then 'completed'
              when now_at < c.starts_at then 'scheduled'
              when now_at < c.ends_at then 'active'
              else 'finalizing' end
$$;

-- The start (00:00 in the weekly timezone) of the competition week containing local date `d`.
create or replace function game_engine.week_start_of(d date) returns date
language sql stable set search_path = '' as $$
  select d - ((extract(isodow from d)::integer - (select weekly_start_isodow from public.competition_settings) + 7) % 7)
$$;

drop function game_engine.live_standings(public.game_competitions);
-- Live standings (scoring v2): each player's best eligible match — completed before the deadline (a match can only
-- be started before the end: start_match, play_match_round and arena_match_commit enforce that) — ranked by score, then the game's tie-break, then the earliest time the best was reached. Identical on
-- all three: a shared rank. Also how many ranked attempts each player has used.
create or replace function game_engine.live_standings(c public.game_competitions)
returns table (user_id uuid, match_id uuid, score integer, secondary integer, score_label text, outcome text, achieved_at timestamptz,
  attempts integer, rank integer, field integer)
language sql stable set search_path = '' as $$
  with best as (
    select distinct on (m.user_id) m.user_id, m.id as match_id, coalesce(m.score, m.player_score) as score, m.secondary,
      coalesce(m.score_label, m.player_score::text || ' points') as score_label, m.outcome, m.completed_at as achieved_at
    from public.game_matches m
    where m.competition_id = c.id and m.status = 'completed' and m.completed_at < game_engine.deadline(c)
    order by m.user_id, coalesce(m.score, m.player_score) desc, m.secondary desc nulls last, m.completed_at asc, m.id
  )
  select b.user_id, b.match_id, b.score, b.secondary, b.score_label, b.outcome, b.achieved_at,
    (select count(*)::integer from public.game_matches m where m.competition_id = c.id and m.user_id = b.user_id),
    (rank() over (order by b.score desc, b.secondary desc nulls last, b.achieved_at asc))::integer, (count(*) over ())::integer
  from best b
$$;

-- The caller's position in a competition (for the overview and after each ranked match).
create or replace function game_engine.standing_of(c public.game_competitions, uid uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'attemptsUsed', (select count(*) from public.game_matches m where m.competition_id = c.id and m.user_id = uid),
    'maxAttempts', c.max_attempts,
    'activeMatchId', (select m.id from public.game_matches m where m.competition_id = c.id and m.user_id = uid and m.status = 'active'),
    'best', s.score, 'bestLabel', s.score_label, 'bestMatchId', s.match_id, 'rank', s.rank,
    'participants', (select count(*) from game_engine.live_standings(c)))
  from (select 1) one left join game_engine.live_standings(c) s on s.user_id = uid
$$;

create or replace function game_engine.competition_json(c public.game_competitions, now_at timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'number', c.number, 'game', c.game_id, 'engine', d.engine, 'title', d.title,
    'bot', c.bot, 'difficulty', c.difficulty, 'config', c.config, 'rulesVersion', c.rules_version,
    'startsAt', game_engine.ms(c.starts_at), 'endsAt', game_engine.ms(c.ends_at), 'deadline', game_engine.ms(game_engine.deadline(c)),
    'timezone', c.timezone, 'scoringVersion', c.scoring_version, 'maxAttempts', c.max_attempts, 'winnerBonus', c.winner_bonus,
    'phase', game_engine.phase(c, now_at), 'state', game_engine.competition_state(c, now_at),
    'participants', coalesce(c.participants, (select count(*) from game_engine.live_standings(c)))::integer,
    'finalizedAt', game_engine.ms(c.finalized_at))
  from public.game_definitions d where d.id = c.game_id
$$;

-- v1 plus: Arena matches (engine, config; no rounds or prompt here — the arena-match function serves the view),
-- the official score, and — for a competition match — the player's standing after it.
create or replace function game_engine.match_json(m public.game_matches) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'kind', m.kind, 'game', m.game_id, 'bot', m.bot, 'difficulty', m.difficulty, 'rulesVersion', m.rules_version,
    'engine', case when m.config ? 'opponent' then 'arena' else 'sql' end, 'config', m.config,
    'attempt', m.attempt, 'rounds', m.rounds,
    'totalRounds', coalesce(game_engine.rounds(m.game_id), (select d.rounds from public.game_definitions d where d.id = m.game_id)),
    'status', m.status,
    'prompt', case when m.status = 'active' and m.config is distinct from null and m.config ? 'opponent' then null
                   when m.status = 'active' then game_engine.prompt(m.game_id, m.bot, m.difficulty, m.seed, m.rounds) end,
    'playerScore', m.player_score, 'botScore', m.bot_score,
    'outcome', case when m.status = 'completed' then coalesce(m.outcome, game_engine.outcome(m.game_id, m.rounds)) end,
    'score', m.score, 'scoreLabel', m.score_label, 'secondary', m.secondary,
    'competitionId', m.competition_id,
    'challengeToken', (select token from public.game_challenges c where c.id = m.challenge_id),
    'startedAt', game_engine.ms(m.started_at), 'completedAt', game_engine.ms(m.completed_at),
    'standing', case when m.competition_id is not null and m.status <> 'active' then
      (select game_engine.standing_of(c, m.user_id) || jsonb_build_object('isBest', (game_engine.standing_of(c, m.user_id) ->> 'bestMatchId') = m.id::text)
       from public.game_competitions c where c.id = m.competition_id) end)
$$;

revoke all on all functions in schema game_engine from public, anon, authenticated;

-- ── Rotation and scheduling ──────────────────────────────────────────────────

-- Whether `game` may be featured now: it exists, is competition-ready, and an Arena game needs the Edge Function.
create or replace function game_engine.featurable(game text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select d.competition_ready and (d.engine = 'sql' or (select arena_server_enabled from public.competition_settings))
                   from public.game_definitions d where d.id = game), false)
$$;

-- The automatic pick for the week starting `ws`: from every featurable game in rotation, excluding the games of
-- the neighbouring weeks (never the same game twice in a row), preferring games featured least recently (never
-- featured first), then least often, then a per-week hash. Deterministic for a given history.
create or replace function content_admin.weekly_candidates(ws date)
returns table (game_id text, engine text, last_featured date, times integer, rank integer)
language sql stable set search_path = '' as $$
  with tz as (select weekly_timezone as z from public.competition_settings),
  bounds as (select (ws::timestamp at time zone (select z from tz)) as s, ((ws + 7)::timestamp at time zone (select z from tz)) as e),
  neighbours as (
    select c.game_id from public.game_competitions c, bounds b
    where c.status = 'scheduled' and (c.ends_at between b.s - interval '1 day' and b.s or c.starts_at between b.e and b.e + interval '1 day')
  ),
  history as (
    select c.game_id, max(c.starts_at) as last_at, count(*)::integer as times
    from public.game_competitions c where c.status = 'scheduled' and c.starts_at < (select s from bounds) group by c.game_id
  )
  select d.id, d.engine, (h.last_at at time zone (select z from tz))::date, coalesce(h.times, 0),
    (row_number() over (order by h.last_at nulls first, coalesce(h.times, 0), md5(ws::text || d.id)))::integer
  from public.game_definitions d
  join public.competition_game_configs g on g.game_id = d.id and g.in_rotation
  left join history h on h.game_id = d.id
  where game_engine.featurable(d.id) and d.id not in (select n.game_id from neighbours n)
  order by 5
$$;
revoke all on function content_admin.weekly_candidates(date) from public, anon, authenticated;

-- Insert (or, for an unplayed future week, replace) the competition for the week starting `ws`, with an audit row.
create or replace function content_admin.put_competition(ws date, game text, cfg jsonb, src text, max_attempts integer, winner_bonus integer, note text, allow_replace boolean)
returns public.game_competitions
language plpgsql security definer set search_path = '' as $$
declare
  st public.competition_settings;
  cid text := 'week-' || to_char(ws, 'IYYY') || '-w' || to_char(ws, 'IW');
  s timestamptz;
  e timestamptz;
  cur public.game_competitions;
  rec public.game_competitions;
  problem text;
begin
  select * into st from public.competition_settings;
  s := ws::timestamp at time zone st.weekly_timezone;
  e := (ws + 7)::timestamp at time zone st.weekly_timezone;
  if extract(isodow from ws) <> st.weekly_start_isodow then
    raise exception 'competition weeks start on ISO weekday % (Monday = 1); % is not one', st.weekly_start_isodow, ws;
  end if;
  problem := game_engine.config_problem(game, cfg);
  if problem is not null then raise exception 'not scheduled: %', problem; end if;
  if not game_engine.featurable(game) then
    raise exception 'not scheduled: % can''t be featured yet%', game,
      case when (select engine from public.game_definitions where id = game) = 'arena' and not st.arena_server_enabled
           then ' — deploy the arena-match Edge Function, then: update public.competition_settings set arena_server_enabled = true' else '' end;
  end if;
  perform pg_advisory_xact_lock(hashtext('weekly-schedule'));
  select * into cur from public.game_competitions where id = cid for update;
  if cur.id is null then
    insert into public.game_competitions (id, game_id, bot, difficulty, starts_at, ends_at, timezone, max_attempts, winner_bonus, config,
      scoring_version, source, schedule_note, grace_seconds)
    values (cid, game, coalesce(cfg ->> 'bot', cfg ->> 'opponent'), coalesce(cfg ->> 'difficulty', cfg ->> 'level'), s, e, st.weekly_timezone,
      coalesce(max_attempts, st.weekly_attempts), coalesce(winner_bonus, 25), cfg, 2, src, note, st.weekly_grace_minutes * 60)
    returning * into rec;
    insert into public.competition_schedule_audit (competition_id, action, source, after, note) values (cid, 'created', src, to_jsonb(rec), note);
    return rec;
  end if;
  if cur.finalized_at is not null then raise exception 'not scheduled: % is finalized and can''t change', cid; end if;
  if cur.status = 'cancelled' then raise exception 'not scheduled: % was cancelled (%); its history stays as it is', cid, coalesce(cur.cancel_reason, 'no reason given'); end if;
  if now() >= cur.starts_at then
    raise exception 'not scheduled: % has started, so its game and rules are locked (emergency: content_admin.correct_competition)', cid;
  end if;
  if cur.game_id = game and cur.config = cfg and cur.max_attempts = coalesce(max_attempts, cur.max_attempts)
     and cur.winner_bonus = coalesce(winner_bonus, cur.winner_bonus) and cur.source = src then
    return cur; -- the same schedule again: nothing to do
  end if;
  if not allow_replace then
    raise exception 'not scheduled: % is already scheduled (%: %); pass p_replace => true to replace it', cid, cur.source, cur.game_id;
  end if;
  update public.game_competitions set game_id = game, config = cfg, bot = coalesce(cfg ->> 'bot', cfg ->> 'opponent'),
    difficulty = coalesce(cfg ->> 'difficulty', cfg ->> 'level'),
    rules_version = (select rules_version from public.game_definitions where id = game),
    max_attempts = coalesce(put_competition.max_attempts, cur.max_attempts), winner_bonus = coalesce(put_competition.winner_bonus, cur.winner_bonus),
    source = src, schedule_note = note, scheduled_by = current_user, scoring_version = 2
  where id = cid returning * into rec;
  insert into public.competition_schedule_audit (competition_id, action, source, before, after, note) values (cid, 'replaced', src, to_jsonb(cur), to_jsonb(rec), note);
  return rec;
end;
$$;
revoke all on function content_admin.put_competition(date, text, jsonb, text, integer, integer, text, boolean) from public, anon, authenticated;

-- ★ SQL Editor: choose the Game of the Week for a future week. Overrides automatic selection; refused for a week
-- that has started. Unset options fall back to the game's competition configuration (competition_game_configs).
--   select * from content_admin.schedule_game_of_the_week(p_game_id => 'gambit', p_week_start => '2026-11-09');
-- To replace a week that is already manually scheduled, add p_replace => true. Everything is audited.
create or replace function content_admin.schedule_game_of_the_week(
  p_game_id text, p_week_start date, p_opponent text default null, p_level text default null, p_variant text default null,
  p_length text default null, p_max_attempts integer default null, p_replace boolean default false, p_note text default null
) returns public.game_competitions
language plpgsql security definer set search_path = '' as $$
declare
  g public.game_definitions;
  base jsonb;
  cfg jsonb;
  cur public.game_competitions;
begin
  select * into g from public.game_definitions where id = p_game_id;
  if g.id is null then raise exception 'not scheduled: % is not a game (see select * from content_admin.weekly_games)', p_game_id; end if;
  if (p_week_start::timestamp at time zone (select weekly_timezone from public.competition_settings)) <= now() then
    raise exception 'not scheduled: the week of % has started or is over — manual choices are for future weeks', p_week_start;
  end if;
  select config into base from public.competition_game_configs where game_id = g.id;
  if g.engine = 'arena' then
    cfg := jsonb_build_object('opponent', coalesce(p_opponent, base ->> 'opponent'), 'level', coalesce(p_level, base ->> 'level'),
      'variant', coalesce(p_variant, base ->> 'variant'), 'length', coalesce(p_length, base ->> 'length'));
  else
    if p_variant is not null or p_length is not null then raise exception 'not scheduled: % has no variants or lengths', g.id; end if;
    cfg := jsonb_build_object('bot', coalesce(p_opponent, base ->> 'bot'), 'difficulty', coalesce(p_level, base ->> 'difficulty'));
  end if;
  select * into cur from public.game_competitions where id = 'week-' || to_char(p_week_start, 'IYYY') || '-w' || to_char(p_week_start, 'IW');
  -- An automatic pick is replaced by an explicit manual choice; a manual one only with p_replace.
  return content_admin.put_competition(p_week_start, g.id, cfg, 'manual', p_max_attempts, null, p_note, p_replace or cur.source = 'automatic');
end;
$$;
revoke all on function content_admin.schedule_game_of_the_week(text, date, text, text, text, text, integer, boolean, text) from public, anon, authenticated;

-- v1's scheduling function, kept for existing scripts: now a manual schedule through the same path.
create or replace function content_admin.schedule_competition(
  week_start date, game text, opponent text, difficulty text default 'hard',
  max_attempts integer default 3, winner_bonus integer default 25
) returns public.game_competitions
language plpgsql security definer set search_path = '' as $$
declare
  g public.game_definitions;
  cfg jsonb;
begin
  select * into g from public.game_definitions where id = game;
  if g.id is null then raise exception 'not scheduled: % is not a game', game; end if;
  if not coalesce(opponent = any (g.bots), false) then
    raise exception 'not scheduled: check failed — % is not an opponent of %', opponent, game;
  end if;
  cfg := case when g.engine = 'arena'
    then jsonb_build_object('opponent', opponent, 'level', case difficulty when 'medium' then 'normal' else difficulty end, 'variant', g.variants[1], 'length', 'standard')
    else jsonb_build_object('bot', opponent, 'difficulty', difficulty) end;
  return content_admin.put_competition(week_start, game, cfg, 'manual', max_attempts, winner_bonus, null, true);
end;
$$;
revoke all on function content_admin.schedule_competition(date, text, text, text, integer, integer) from public, anon, authenticated;

-- Keep the current week and the next `weekly_lead_weeks` scheduled. A week without a competition gets the
-- automatic pick; nothing scheduled (manual or automatic, any state) is touched. Safe to run any number of times,
-- concurrently too (advisory lock + the unique week id). Returns how many competitions it created.
create or replace function content_admin.ensure_competitions(as_of timestamptz default now(), lead integer default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  st public.competition_settings;
  first_week date;
  ws date;
  pick text;
  made integer := 0;
begin
  select * into st from public.competition_settings;
  perform pg_advisory_xact_lock(hashtext('weekly-schedule'));
  first_week := game_engine.week_start_of((as_of at time zone st.weekly_timezone)::date);
  for i in 0 .. coalesce(lead, st.weekly_lead_weeks) loop
    ws := first_week + 7 * i;
    if exists (select 1 from public.game_competitions c
               where c.starts_at < ((ws + 7)::timestamp at time zone st.weekly_timezone) and (ws::timestamp at time zone st.weekly_timezone) < c.ends_at
                 and (c.status = 'scheduled' or c.id = 'week-' || to_char(ws, 'IYYY') || '-w' || to_char(ws, 'IW'))) then
      continue;
    end if;
    select c.game_id into pick from content_admin.weekly_candidates(ws) c order by c.rank limit 1;
    if pick is null then
      raise warning 'ensure_competitions: no featurable game for the week of %', ws;
      continue;
    end if;
    perform content_admin.put_competition(ws, pick, (select config from public.competition_game_configs where game_id = pick), 'automatic', null, null, null, false);
    made := made + 1;
  end loop;
  return made;
end;
$$;
revoke all on function content_admin.ensure_competitions(timestamptz, integer) from public, anon, authenticated;

-- Emergency only, from the SQL Editor: cancel a competition (e.g. a broken game). Its matches and history are kept;
-- a cancelled week is never finalized, never shown as current, and awards nothing. Audited.
create or replace function content_admin.cancel_competition(p_competition_id text, p_reason text) returns public.game_competitions
language plpgsql security definer set search_path = '' as $$
declare
  cur public.game_competitions;
  rec public.game_competitions;
begin
  if coalesce(length(p_reason), 0) < 5 then raise exception 'give a reason (at least 5 characters)'; end if;
  select * into cur from public.game_competitions where id = p_competition_id for update;
  if cur.id is null then raise exception 'competition % does not exist', p_competition_id; end if;
  if cur.finalized_at is not null then raise exception 'competition % is finalized and can''t be cancelled', cur.id; end if;
  perform set_config('competition.correction', 'on', true);
  update public.game_competitions set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason where id = cur.id returning * into rec;
  update public.game_matches set status = 'expired', updated_at = now() where competition_id = cur.id and status = 'active';
  perform set_config('competition.correction', 'off', true);
  insert into public.competition_schedule_audit (competition_id, action, source, before, after, note) values (cur.id, 'cancelled', 'manual', to_jsonb(cur), to_jsonb(rec), p_reason);
  return rec;
end;
$$;
revoke all on function content_admin.cancel_competition(text, text) from public, anon, authenticated;

-- Emergency only: change an active competition's end time or attempt limit (e.g. extend a week after an outage).
-- The game and configuration are never changed in place — cancel and schedule another week instead. Audited.
create or replace function content_admin.correct_competition(p_competition_id text, p_reason text, p_ends_at timestamptz default null, p_max_attempts integer default null)
returns public.game_competitions
language plpgsql security definer set search_path = '' as $$
declare
  cur public.game_competitions;
  rec public.game_competitions;
begin
  if coalesce(length(p_reason), 0) < 5 then raise exception 'give a reason (at least 5 characters)'; end if;
  select * into cur from public.game_competitions where id = p_competition_id for update;
  if cur.id is null then raise exception 'competition % does not exist', p_competition_id; end if;
  if cur.finalized_at is not null then raise exception 'competition % is finalized and can''t change', cur.id; end if;
  if p_max_attempts is not null and p_max_attempts < cur.max_attempts then
    raise exception 'the attempt limit can only go up (players may already have used %)', cur.max_attempts;
  end if;
  if p_ends_at is not null and p_ends_at <= now() then raise exception 'the new end must be in the future'; end if;
  perform set_config('competition.correction', 'on', true);
  update public.game_competitions set ends_at = coalesce(p_ends_at, ends_at), max_attempts = coalesce(p_max_attempts, max_attempts)
  where id = cur.id returning * into rec;
  perform set_config('competition.correction', 'off', true);
  insert into public.competition_schedule_audit (competition_id, action, source, before, after, note) values (cur.id, 'corrected', 'manual', to_jsonb(cur), to_jsonb(rec), p_reason);
  return rec;
end;
$$;
revoke all on function content_admin.correct_competition(text, text, timestamptz, integer) from public, anon, authenticated;

-- ── Finalization ─────────────────────────────────────────────────────────────

-- Replaces v1. Finalize every scheduled competition whose deadline (end + grace) has passed, exactly once (row lock
-- and re-check; results and champions are insert-only). Open matches expire. Results record the score, the game's
-- tie-break, the attempts used and the nickname at that moment; the champion rows are a permanent snapshot.
create or replace function content_admin.finalize_competitions(as_of timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.game_competitions;
  done integer := 0;
  n integer;
  top record;
  runner record;
  winners integer;
begin
  for c in
    select * from public.game_competitions
    where status = 'scheduled' and finalized_at is null and ends_at + make_interval(secs => grace_seconds) <= as_of
    order by ends_at
    for update skip locked
  loop
    if c.finalized_at is not null then continue; end if;
    update public.game_matches set status = 'expired', updated_at = now() where competition_id = c.id and status = 'active';
    insert into public.competition_results (competition_id, user_id, match_id, score, achieved_at, rank, field_size, is_winner, points, scoring_version,
      secondary, score_label, attempts_used, nickname_snapshot, outcome)
    select c.id, s.user_id, s.match_id, s.score, s.achieved_at, s.rank, s.field, s.rank = 1,
      10 + (40 * (s.field - s.rank + 1)) / s.field + case when s.rank = 1 then c.winner_bonus else 0 end,
      c.scoring_version, s.secondary, s.score_label, s.attempts, game_engine.nickname_of(s.user_id), s.outcome
    from game_engine.live_standings(c) s
    on conflict do nothing;
    get diagnostics n = row_count;

    select count(*) into winners from public.competition_results r where r.competition_id = c.id and r.is_winner;
    select * into top from public.competition_results r where r.competition_id = c.id and r.is_winner order by r.achieved_at limit 1;
    select * into runner from public.competition_results r where r.competition_id = c.id and not r.is_winner order by r.rank, r.achieved_at limit 1;
    insert into public.weekly_champions (competition_id, user_id, competition_number, game_id, nickname_snapshot, score, secondary, score_label,
      shared, decided_by, runner_up_score, field_size, starts_at, ends_at, scoring_version, rules_version, config)
    select c.id, r.user_id, c.number, c.game_id, r.nickname_snapshot, r.score, r.secondary, r.score_label, winners > 1,
      case when winners > 1 then 'shared'
           when runner.user_id is null then 'unopposed'
           when runner.score < r.score then 'score'
           when runner.secondary is distinct from r.secondary then 'secondary'
           else 'earliest' end,
      runner.score, r.field_size, c.starts_at, c.ends_at, c.scoring_version, c.rules_version, c.config
    from public.competition_results r where r.competition_id = c.id and r.is_winner
    on conflict do nothing;

    update public.game_competitions set finalized_at = now(), participants = n where id = c.id;
    done := done + 1;
  end loop;
  return done;
end;
$$;
revoke all on function content_admin.finalize_competitions(timestamptz) from public, anon, authenticated;

-- ── Client functions ─────────────────────────────────────────────────────────

-- v1 plus: the week is ensured to exist (recovery for a missed scheduler run), the configuration, state, number and
-- deadline, the caller's attempts/best/rank, and last week's champions from the permanent records.
create or replace function public.get_games_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  now_at timestamptz := now();
  c public.game_competitions;
  prev public.game_competitions;
  comp jsonb;
  last_week jsonb;
begin
  begin
    perform content_admin.ensure_competitions(now_at, 0);
  exception when others then
    raise warning 'get_games_overview: ensure_competitions failed: %', sqlerrm;
  end;
  perform content_admin.finalize_competitions(now_at);
  select * into c from public.game_competitions where status = 'scheduled' and starts_at <= now_at and now_at < ends_at order by starts_at limit 1;
  if c.id is null then
    select * into c from public.game_competitions where status = 'scheduled' and ends_at <= now_at and finalized_at is null order by ends_at desc limit 1;
  end if;
  if c.id is null then
    select * into c from public.game_competitions where status = 'scheduled' and starts_at > now_at order by starts_at limit 1;
  end if;
  if c.id is not null then
    comp := game_engine.competition_json(c, now_at) || jsonb_build_object('me', case when uid is not null then game_engine.standing_of(c, uid) end);
  end if;
  select * into prev from public.game_competitions where finalized_at is not null and status = 'scheduled' order by ends_at desc limit 1;
  if prev.id is not null then
    last_week := jsonb_build_object('id', prev.id, 'number', prev.number, 'game', prev.game_id, 'endsAt', game_engine.ms(prev.ends_at),
      'startsAt', game_engine.ms(prev.starts_at), 'participants', prev.participants,
      'winners', coalesce((select jsonb_agg(jsonb_build_object('nickname', w.nickname_snapshot, 'score', w.score, 'scoreLabel', w.score_label,
                             'isMe', w.user_id = uid, 'shared', w.shared) order by w.user_id)
                           from public.weekly_champions w where w.competition_id = prev.id), '[]'::jsonb),
      'mine', (select jsonb_build_object('rank', r.rank, 'score', r.score, 'scoreLabel', r.score_label, 'field', r.field_size)
               from public.competition_results r where r.competition_id = prev.id and r.user_id = uid));
  end if;
  return jsonb_build_object('now', game_engine.ms(now_at), 'competition', comp, 'lastWeek', last_week,
    'nickname', case when uid is not null then game_engine.nickname_of(uid) end,
    'rules', (select jsonb_object_agg(id, rules_version) from public.game_definitions),
    'next', (select jsonb_build_object('id', n.id, 'number', n.number, 'game', n.game_id, 'startsAt', game_engine.ms(n.starts_at))
             from public.game_competitions n where n.status = 'scheduled' and n.starts_at > now_at and n.id is distinct from c.id order by n.starts_at limit 1));
end;
$$;

-- v1 plus Arena games: a ranked Arena match is created here (attempt reserved, private seed, configuration
-- snapshot) and then played through the arena-match Edge Function. No new ranked match once the week has ended.
create or replace function public.start_match(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  now_at timestamptz := now();
  c public.game_competitions;
  g public.game_definitions;
  ch public.game_challenges;
  m public.game_matches;
  used integer;
begin
  if request ->> 'kind' = 'competition' then
    select * into c from public.game_competitions where id = request ->> 'competitionId' and status = 'scheduled';
    if c.id is null then raise exception 'games:not_found' using errcode = 'P0001'; end if;
    if now_at < c.starts_at then raise exception 'games:not_started' using errcode = 'P0001'; end if;
    if now_at >= c.ends_at or c.finalized_at is not null then raise exception 'games:closed' using errcode = 'P0001'; end if;
    select * into g from public.game_definitions where id = c.game_id;
    -- One start at a time per player and week, so two taps (or two devices) can't use two attempts.
    perform pg_advisory_xact_lock(hashtext('games:' || uid::text || ':' || c.id));
    select * into m from public.game_matches where competition_id = c.id and user_id = uid and status = 'active';
    if m.id is not null then return game_engine.match_json(m); end if;
    select count(*) into used from public.game_matches where competition_id = c.id and user_id = uid;
    if used >= c.max_attempts then raise exception 'games:no_attempts' using errcode = 'P0001'; end if;
    insert into public.game_matches (user_id, kind, competition_id, game_id, bot, difficulty, rules_version, seed, attempt, config, scoring_version)
    values (uid, 'competition', c.id, c.game_id, c.bot, c.difficulty, c.rules_version, game_engine.new_seed(), used + 1,
      case when g.engine = 'arena' then c.config end, c.scoring_version)
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

-- v1 plus: a competition match started before the end may finish within the grace period; the official score is
-- recorded on completion. Arena matches are refused here (they are played through arena-match).
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
  done boolean;
begin
  if jsonb_typeof(request -> 'round') is distinct from 'number' then raise exception 'games:invalid_request' using errcode = 'P0001'; end if;
  rnd := (request ->> 'round')::numeric::integer;
  select * into m from public.game_matches where id = game_engine.match_id(request ->> 'matchId') and user_id = uid for update;
  if m.id is null then raise exception 'games:not_found' using errcode = 'P0001'; end if;
  if m.config ? 'opponent' then raise exception 'games:invalid_request' using errcode = 'P0001', detail = 'Arena matches are played through arena-match'; end if;
  played := jsonb_array_length(m.rounds);
  if rnd < played then return game_engine.match_json(m) || jsonb_build_object('duplicate', true); end if;
  if m.status = 'expired' then raise exception 'games:closed' using errcode = 'P0001'; end if;
  if m.status <> 'active' then raise exception 'games:finished' using errcode = 'P0001'; end if;
  if rnd <> played then raise exception 'games:stale' using errcode = 'P0001'; end if;
  if m.competition_id is not null then
    select * into c from public.game_competitions where id = m.competition_id;
    if c.status <> 'scheduled' or c.finalized_at is not null or now() >= game_engine.deadline(c) or m.started_at >= c.ends_at then
      raise exception 'games:closed' using errcode = 'P0001';
    end if;
  end if;
  r := game_engine.resolve(m.game_id, m.bot, m.difficulty, m.seed, m.rounds, request -> 'move');
  m.rounds := m.rounds || jsonb_build_array(r);
  t := game_engine.totals(m.game_id, m.rounds);
  done := played + 1 >= game_engine.rounds(m.game_id);
  update public.game_matches
  set rounds = m.rounds, player_score = t[1], bot_score = t[2], updated_at = now(),
      status = case when done then 'completed' else 'active' end,
      completed_at = case when done then now() end,
      score = case when done then t[1] end,
      outcome = case when done then game_engine.outcome(m.game_id, m.rounds) end,
      score_label = case when done then t[1]::text || ' points' end
  where id = m.id
  returning * into m;
  return game_engine.match_json(m);
end;
$$;

-- ── Arena match persistence (service role only: the arena-match Edge Function) ─

-- The match the function replays: configuration, private seed and action log. Only the caller's own competition
-- match; status reads 'expired' once the deadline has passed even before finalization runs.
create or replace function public.arena_match_load(p_match uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'game', m.game_id, 'config', m.config, 'seed', m.seed, 'actions', m.actions,
    'status', case when m.status = 'active' and (now() >= game_engine.deadline(c) or c.status <> 'scheduled') then 'expired' else m.status end,
    'competitionId', m.competition_id, 'attempt', m.attempt)
  from public.game_matches m join public.game_competitions c on c.id = m.competition_id
  where m.id = p_match and m.user_id = p_user and m.config ? 'opponent'
$$;

-- Append action number `p_step` (optimistic concurrency: it must be the next one) and, with `p_final`, complete the
-- match with the server-computed score. Every competition rule is checked here, in one transaction with a row lock:
-- ownership, active, the week not cancelled/finalized, before the deadline, and started before the end.
create or replace function public.arena_match_commit(p_match uuid, p_user uuid, p_step integer, p_action jsonb, p_final jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.game_matches;
  c public.game_competitions;
  ok_int constant text := '^-?[0-9]{1,9}$';
begin
  select * into m from public.game_matches where id = p_match and user_id = p_user and config ? 'opponent' for update;
  if m.id is null then return jsonb_build_object('status', 'not_found'); end if;
  select * into c from public.game_competitions where id = m.competition_id;
  if m.status = 'completed' then return jsonb_build_object('status', 'finished'); end if;
  if m.status <> 'active' or c.status <> 'scheduled' or c.finalized_at is not null or now() >= game_engine.deadline(c) or m.started_at >= c.ends_at then
    return jsonb_build_object('status', 'closed');
  end if;
  if jsonb_array_length(m.actions) <> p_step then return jsonb_build_object('status', 'conflict'); end if;
  if p_action is null or octet_length(p_action::text) > 2048 then raise exception 'arena: invalid action'; end if;
  if p_final is not null and (coalesce(p_final ->> 'score', '') !~ ok_int or coalesce(p_final ->> 'outcome', '') not in ('win', 'loss', 'draw')
      or (p_final ->> 'secondary' is not null and p_final ->> 'secondary' !~ ok_int)) then
    raise exception 'arena: invalid final result';
  end if;
  update public.game_matches set actions = actions || jsonb_build_array(p_action), updated_at = now(),
    status = case when p_final is not null then 'completed' else 'active' end,
    completed_at = case when p_final is not null then now() end,
    score = (p_final ->> 'score')::integer, secondary = (p_final ->> 'secondary')::integer, outcome = p_final ->> 'outcome',
    score_label = left(p_final ->> 'label', 80), result = p_final -> 'result', debrief = p_final -> 'debrief',
    player_score = coalesce((p_final -> 'result' ->> 'player')::numeric::integer, player_score),
    bot_score = coalesce((p_final -> 'result' ->> 'rival')::numeric::integer, bot_score)
  where id = m.id returning * into m;
  return jsonb_build_object('status', 'ok', 'standing', case when p_final is not null then
    game_engine.standing_of(c, p_user) || jsonb_build_object('isBest', (game_engine.standing_of(c, p_user) ->> 'bestMatchId') = m.id::text) end);
end;
$$;

revoke all on function public.arena_match_load(uuid, uuid), public.arena_match_commit(uuid, uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.arena_match_load(uuid, uuid), public.arena_match_commit(uuid, uuid, integer, jsonb, jsonb) to service_role;

-- ── Leaderboards, history and champions (read) ───────────────────────────────

-- v1 plus attempts used, the score label and the game's tie-break; a finalized week reads its immutable results.
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
      coalesce((select jsonb_agg(jsonb_build_object('rank', r.rank, 'nickname', game_engine.nickname_of(r.user_id), 'score', r.score, 'scoreLabel', r.score_label,
                  'attemptsUsed', r.attempts_used, 'points', r.points, 'isWinner', r.is_winner, 'isMe', r.user_id = uid) order by r.rank, r.achieved_at)
                from (select * from public.competition_results where competition_id = c.id order by rank, achieved_at limit lim) r), '[]'::jsonb),
      (select jsonb_build_object('rank', r.rank, 'nickname', game_engine.nickname_of(r.user_id), 'score', r.score, 'scoreLabel', r.score_label,
         'attemptsUsed', r.attempts_used, 'points', r.points, 'isWinner', r.is_winner, 'isMe', true)
       from public.competition_results r where r.competition_id = c.id and r.user_id = uid)
    into top, mine;
  else
    select
      coalesce((select jsonb_agg(jsonb_build_object('rank', s.rank, 'nickname', game_engine.nickname_of(s.user_id), 'score', s.score, 'scoreLabel', s.score_label,
                  'attemptsUsed', s.attempts, 'isMe', s.user_id = uid) order by s.rank, s.achieved_at)
                from (select * from game_engine.live_standings(c) order by rank, achieved_at limit lim) s), '[]'::jsonb),
      (select jsonb_build_object('rank', s.rank, 'nickname', game_engine.nickname_of(s.user_id), 'score', s.score, 'scoreLabel', s.score_label,
         'attemptsUsed', s.attempts, 'isMe', true)
       from game_engine.live_standings(c) s where s.user_id = uid)
    into top, mine;
  end if;
  return jsonb_build_object('scope', 'weekly', 'entries', top, 'me', mine,
    'myAttempts', case when uid is not null then (select count(*) from public.game_matches m where m.competition_id = c.id and m.user_id = uid) end,
    'competition', game_engine.competition_json(c, now_at),
    'now', game_engine.ms(now_at));
end;
$$;

-- v1 shape (every finalized week, newest first, with its winner(s)), now read from the permanent champion records,
-- with the competition number and the winners' nickname as it was at the time.
create or replace function public.get_hall_of_fame(request jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  perform content_admin.finalize_competitions(now());
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'number', c.number, 'game', c.game_id, 'bot', c.bot, 'difficulty', c.difficulty, 'config', c.config,
      'startsAt', game_engine.ms(c.starts_at), 'endsAt', game_engine.ms(c.ends_at), 'participants', c.participants,
      'winners', coalesce((select jsonb_agg(jsonb_build_object('nickname', w.nickname_snapshot, 'score', w.score, 'scoreLabel', w.score_label,
                             'isMe', w.user_id = uid, 'decidedBy', w.decided_by) order by w.user_id)
                           from public.weekly_champions w where w.competition_id = c.id), '[]'::jsonb),
      'runnerUpScore', (select max(r.score) from public.competition_results r where r.competition_id = c.id and not r.is_winner))
      order by c.ends_at desc)
    from (select * from public.game_competitions where finalized_at is not null and status = 'scheduled' order by ends_at desc
          limit least(104, greatest(1, coalesce((request ->> 'limit')::integer, 104)))) c), '[]'::jsonb);
end;
$$;

-- One competition, current or past: its configuration and dates, its champions, the top 50 and the caller's result.
create or replace function public.get_competition(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.game_competitions;
  board jsonb;
begin
  select * into c from public.game_competitions where id = request ->> 'competitionId';
  if c.id is null then raise exception 'games:not_found' using errcode = 'P0001'; end if;
  board := case when c.status = 'scheduled' then public.get_leaderboard(jsonb_build_object('scope', 'weekly', 'competitionId', c.id)) end;
  return jsonb_build_object('competition', game_engine.competition_json(c, now()) || jsonb_build_object('cancelReason', c.cancel_reason),
    'champions', coalesce((select jsonb_agg(jsonb_build_object('nickname', w.nickname_snapshot, 'score', w.score, 'scoreLabel', w.score_label,
                   'decidedBy', w.decided_by, 'shared', w.shared, 'runnerUpScore', w.runner_up_score, 'isMe', w.user_id = (select auth.uid())))
                 from public.weekly_champions w where w.competition_id = c.id), '[]'::jsonb),
    'entries', coalesce(board -> 'entries', '[]'::jsonb), 'me', board -> 'me', 'now', game_engine.ms(now()));
end;
$$;

-- Past competitions, newest first, `limit` (≤ 30) before `before` (ms since epoch; default now). Each with its
-- champions and the caller's result.
create or replace function public.get_competition_history(request jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  before_t timestamptz := coalesce(to_timestamp((request ->> 'before')::numeric / 1000.0), now());
  lim integer := least(30, greatest(1, coalesce((request ->> 'limit')::integer, 20)));
  items jsonb;
begin
  perform content_admin.finalize_competitions(now());
  select coalesce(jsonb_agg(x order by (x ->> 'endsAt')::bigint desc), '[]'::jsonb) into items from (
    select game_engine.competition_json(c, now()) || jsonb_build_object(
      'champions', coalesce((select jsonb_agg(jsonb_build_object('nickname', w.nickname_snapshot, 'scoreLabel', w.score_label, 'score', w.score, 'isMe', w.user_id = uid))
                             from public.weekly_champions w where w.competition_id = c.id), '[]'::jsonb),
      'mine', (select jsonb_build_object('rank', r.rank, 'score', r.score, 'scoreLabel', r.score_label, 'field', r.field_size, 'isWinner', r.is_winner)
               from public.competition_results r where r.competition_id = c.id and r.user_id = uid)) as x
    from public.game_competitions c
    where c.ends_at <= now() and c.ends_at < before_t
    order by c.ends_at desc limit lim
  ) t;
  return jsonb_build_object('items', items,
    'next', case when jsonb_array_length(items) = lim then items -> (lim - 1) -> 'endsAt' end);
end;
$$;

-- All-time champions: weekly titles (shared titles count for each holder), weeks taken part in, best finish.
create or replace function public.get_champions_leaderboard(request jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  perform content_admin.finalize_competitions(now());
  return (with totals as (
      select r.user_id, count(*)::integer as weeks, min(r.rank)::integer as best_rank,
        (select count(*)::integer from public.weekly_champions w where w.user_id = r.user_id) as titles
      from public.competition_results r group by r.user_id
    ), ranked as (
      select t.*, (rank() over (order by t.titles desc, t.best_rank asc, t.weeks desc))::integer as rnk from totals t where t.titles > 0
    )
    select jsonb_build_object(
      'entries', coalesce((select jsonb_agg(jsonb_build_object('rank', x.rnk, 'nickname', game_engine.nickname_of(x.user_id), 'titles', x.titles,
                    'weeks', x.weeks, 'bestRank', x.best_rank, 'isMe', x.user_id = uid) order by x.rnk) from (select * from ranked order by rnk limit 50) x), '[]'::jsonb),
      'me', (select jsonb_build_object('titles', t.titles, 'weeks', t.weeks, 'bestRank', t.best_rank) from totals t where t.user_id = uid),
      'competitions', (select count(*) from public.game_competitions where finalized_at is not null and status = 'scheduled')));
end;
$$;

revoke all on function public.get_competition(jsonb), public.get_competition_history(jsonb), public.get_champions_leaderboard(jsonb) from public;
grant execute on function public.get_competition(jsonb), public.get_competition_history(jsonb), public.get_champions_leaderboard(jsonb) to anon, authenticated;

-- ── SQL Editor views (owner only) ────────────────────────────────────────────

-- All 23 games: engine, readiness, whether they can be featured now, rotation, configuration, how often featured.
create or replace view content_admin.weekly_games as
  select d.id as game_id, d.title, d.engine, d.competition_ready, game_engine.featurable(d.id) as featurable_now,
    g.in_rotation, g.config, d.rules_version, d.bots as opponents, d.variants,
    (select count(*) from public.game_competitions c where c.game_id = d.id and c.status = 'scheduled')::integer as times_scheduled,
    (select max(c.starts_at) from public.game_competitions c where c.game_id = d.id and c.status = 'scheduled' and c.starts_at <= now()) as last_featured
  from public.game_definitions d left join public.competition_game_configs g on g.game_id = d.id;

-- Every competition with its state, source and numbers.
create or replace view content_admin.weekly_schedule as
  select c.number, c.id, c.game_id, c.config, game_engine.competition_state(c, now()) as state, c.source, c.scheduled_by,
    (c.starts_at at time zone c.timezone) as starts_local, (c.ends_at at time zone c.timezone) as ends_local, c.timezone,
    c.max_attempts, c.grace_seconds, c.scoring_version, c.rules_version,
    (select count(*) from public.game_matches m where m.competition_id = c.id)::integer as matches,
    (select count(distinct m.user_id) from public.game_matches m where m.competition_id = c.id)::integer as players,
    c.finalized_at, c.cancel_reason
  from public.game_competitions c;

-- Competitions whose deadline has passed but which aren't finalized (expect none; run the scheduler or
-- select public.finalize_due_competitions();), and active matches past their deadline.
create or replace view content_admin.weekly_finalization_issues as
  select c.id, c.number, 'past its deadline but not finalized' as problem, game_engine.deadline(c) as deadline
  from public.game_competitions c where c.status = 'scheduled' and c.finalized_at is null and game_engine.deadline(c) <= now()
  union all
  select c.id, c.number, format('finalized with %s match(es) still active', count(*)), game_engine.deadline(c)
  from public.game_competitions c join public.game_matches m on m.competition_id = c.id and m.status = 'active'
  where c.finalized_at is not null group by c.id, c.number, c.ends_at, c.grace_seconds;

revoke all on content_admin.weekly_games, content_admin.weekly_schedule, content_admin.weekly_finalization_issues from public, anon, authenticated;

-- ── Practice and friend challenges stay on the five SQL-engine games ─────────
-- (game_definitions now lists all 23; Arena practice is on-device and recorded by record_arena_matches.) Ranked
-- Arena matches are kept out of the practice/match history in get_my_games, so the normal game records don't change.

create or replace function public.record_practice_game(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  g public.game_definitions;
begin
  select * into g from public.game_definitions where id = request ->> 'game';
  if g.id is null or g.engine <> 'sql' or not coalesce(request ->> 'bot' = any (g.bots), false) or coalesce(request ->> 'difficulty', '') not in ('easy', 'medium', 'hard')
     or coalesce(request ->> 'outcome', '') not in ('win', 'loss', 'draw')
     or jsonb_typeof(request -> 'playerScore') is distinct from 'number' or jsonb_typeof(request -> 'botScore') is distinct from 'number'
     or coalesce(request ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(request ->> 'opponent', 'mystery') not in ('mystery', 'chosen')
     or (request ->> 'prediction' is not null and (request ->> 'opponent' is distinct from 'mystery' or not request ->> 'prediction' = any (g.bots)))
     or (request ->> 'insightPoints' is not null and (jsonb_typeof(request -> 'insightPoints') <> 'number' or (request ->> 'insightPoints')::numeric not between 0 and 100)) then
    raise exception 'games:invalid_request' using errcode = 'P0001';
  end if;
  if (select count(*) from public.game_practice_results where user_id = uid and played_at > now() - interval '1 day') >= 300 then
    raise exception 'games:rate_limited' using errcode = 'P0001';
  end if;
  insert into public.game_practice_results (user_id, client_id, game_id, bot, difficulty, rules_version, player_score, bot_score, outcome, opponent, prediction, insight_points)
  values (uid, (request ->> 'id')::uuid, g.id, request ->> 'bot', request ->> 'difficulty', g.rules_version,
          (request ->> 'playerScore')::numeric::integer, (request ->> 'botScore')::numeric::integer, request ->> 'outcome',
          request ->> 'opponent', request ->> 'prediction', (request ->> 'insightPoints')::numeric::integer)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.create_challenge(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  g public.game_definitions;
  ch public.game_challenges;
begin
  select * into g from public.game_definitions where id = request ->> 'game';
  if g.id is null or g.engine <> 'sql' or not coalesce(request ->> 'bot' = any (g.bots), false) or coalesce(request ->> 'difficulty', '') not in ('easy', 'medium', 'hard') then
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
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('competitionId', r.competition_id, 'number', c.number, 'scoreLabel', r.score_label, 'game', c.game_id, 'endsAt', game_engine.ms(c.ends_at),
                         'rank', r.rank, 'field', r.field_size, 'score', r.score, 'points', r.points, 'isWinner', r.is_winner) order by c.ends_at desc)
                       from (select * from public.competition_results where user_id = uid) r join public.game_competitions c on c.id = r.competition_id), '[]'::jsonb),
    'practice', coalesce((select jsonb_agg(jsonb_build_object('game', p.game_id, 'bot', p.bot, 'difficulty', p.difficulty, 'playerScore', p.player_score,
                           'botScore', p.bot_score, 'outcome', p.outcome, 'playedAt', game_engine.ms(p.played_at),
                           'opponent', p.opponent, 'prediction', p.prediction, 'insightPoints', p.insight_points) order by p.played_at desc)
                         from (select * from public.game_practice_results where user_id = uid order by played_at desc limit 30) p), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'game', m.game_id, 'bot', m.bot, 'difficulty', m.difficulty,
                          'playerScore', m.player_score, 'botScore', m.bot_score, 'outcome', coalesce(m.outcome, game_engine.outcome(m.game_id, m.rounds)), 'competitionId', m.competition_id,
                          'completedAt', game_engine.ms(m.completed_at)) order by m.completed_at desc)
                        from (select * from public.game_matches where user_id = uid and status = 'completed' and not coalesce(config ? 'opponent', false) order by completed_at desc limit 30) m), '[]'::jsonb));
end;
$$;

revoke all on all functions in schema game_engine from public, anon, authenticated;
