-- Daily Challenge v2: India-time days, hybrid content (manual SQL-authored challenges first, otherwise an automatic
-- pick from the 66 lesson scenarios), scenario usage history with a cooldown, scoring, a daily leaderboard, history,
-- stricter immutability and SQL Editor tools. See docs/DAILY_CHALLENGE.md and docs/SQL_EDITOR_OPERATIONS.md.
--
-- Builds on 20261027130100_daily_challenges.sql (tables, keys, attempts, history, grading). Nothing existing is
-- dropped; official attempts keep their snapshotted results and are back-filled with a score.
--
-- Settings live in one row of public.competition_settings (also used by Game of the Week), so the timezone and the
-- cooldown are configuration, not constants scattered through the code.

-- ── Settings ─────────────────────────────────────────────────────────────────

create table public.competition_settings (
  id boolean primary key default true check (id),
  -- The product day. Validated by the check (an unknown zone name fails the insert/update).
  daily_timezone text not null default 'Asia/Kolkata' check ((now() at time zone daily_timezone) is not null),
  -- A scenario used for a Daily Challenge isn't picked again automatically for this many days, unless every eligible
  -- scenario is cooling down (then the least recently used is reused rather than publishing nothing).
  daily_cooldown_days integer not null default 30 check (daily_cooldown_days between 1 and 365),
  weekly_timezone text not null default 'Asia/Kolkata' check ((now() at time zone weekly_timezone) is not null),
  -- ISO day of week a competition week starts on (1 = Monday) at 00:00 in weekly_timezone.
  weekly_start_isodow smallint not null default 1 check (weekly_start_isodow between 1 and 7),
  weekly_attempts smallint not null default 3 check (weekly_attempts between 1 and 10),
  -- A ranked match started before the week ends may be finished up to this long after it (then it expires).
  weekly_grace_minutes integer not null default 15 check (weekly_grace_minutes between 0 and 120),
  -- How many weeks after the current one the scheduler keeps scheduled in advance.
  weekly_lead_weeks smallint not null default 2 check (weekly_lead_weeks between 0 and 8),
  updated_at timestamptz not null default now()
);
insert into public.competition_settings default values;
create trigger competition_settings_touch before update on public.competition_settings
  for each row execute function public.touch_updated_at();
alter table public.competition_settings enable row level security;
revoke all on public.competition_settings from anon, authenticated;

create or replace function public.daily_timezone() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select daily_timezone from public.competition_settings), 'Asia/Kolkata')
$$;

-- The product's "today": the calendar date in the configured timezone (Asia/Kolkata by default). Used by row level
-- security, submission and the app (which never trusts the device clock for the official day).
create or replace function public.daily_challenge_today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone public.daily_timezone())::date;
$$;
revoke all on function public.daily_timezone() from public, anon;
grant execute on function public.daily_timezone() to authenticated;
grant execute on function public.daily_challenge_today() to anon, authenticated;

-- The top-level keys of an object whose value isn't null (optional document fields). Nested values are untouched.
create or replace function content_admin.drop_null_keys(o jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(o) as e(k, v) where v <> 'null'::jsonb
$$;
revoke all on function content_admin.drop_null_keys(jsonb) from public, anon, authenticated;

-- ── Challenge metadata ───────────────────────────────────────────────────────

alter table public.daily_challenges
  -- 'manual': authored and scheduled in the SQL Editor. 'scenario': adapted automatically from a lesson scenario.
  add column source text not null default 'manual' check (source in ('manual', 'scenario')),
  -- Where the content came from, when it is derived from a lesson scenario (automatic picks always; manual optionally).
  add column source_scenario_id text,
  add column source_scenario_version integer,
  add column format text check (format is null or format in ('prediction', 'decision', 'reasoning', 'outcome')),
  add column concept text check (concept is null or length(concept) between 1 and 120),
  add column minutes smallint not null default 2 check (minutes between 1 and 10),
  -- How official attempts are scored (content_admin.daily_score). Recorded with every attempt.
  add column scoring_version smallint not null default 1 check (scoring_version = 1),
  -- Why the last versioned correction of a challenge that already had attempts was made (audit; see history).
  add column correction_note text check (correction_note is null or length(correction_note) between 1 and 500),
  add check ((source_scenario_id is null) = (source_scenario_version is null)),
  add check (source = 'manual' or source_scenario_id is not null);
create index daily_challenges_source_scenario_idx on public.daily_challenges (source_scenario_id) where source_scenario_id is not null;

alter table public.daily_challenge_attempts
  -- Official score 0–100 from the verdict; null when the challenge has no right answer (basis 'uncertain').
  add column score smallint check (score is null or score between 0 and 100),
  -- Calibration 0–100 (a Brier score of the confidence rating against the result). Secondary ranking only.
  add column calibration smallint check (calibration is null or calibration between 0 and 100),
  add column scoring_version smallint not null default 1;
create index daily_challenge_attempts_board_idx on public.daily_challenge_attempts (challenge_id, score desc, calibration desc, submitted_at);

-- ── Scoring ──────────────────────────────────────────────────────────────────

-- Scoring version 1. Correctness first: match 100, defensible 60, depends 40, misconception 0. A challenge without a
-- single right answer (basis 'uncertain', verdict 'reasonable') is not scored — it shows as taken part, never ranked
-- above or below anyone. Calibration (secondary): the confidence rating as a probability (1 → 20 %, 2 → 40 %,
-- 3 → 60 %, 4 → 80 %, 5 → 95 %) against the outcome (score / 100): 100 × (1 − (p − o)²), rounded. It rewards knowing
-- how sure you should be; there is no speed bonus and no timer.
create or replace function content_admin.daily_score(verdict text, basis text, confidence smallint, out score smallint, out calibration smallint)
language plpgsql immutable set search_path = '' as $$
declare
  p numeric;
  o numeric;
begin
  if basis = 'uncertain' or verdict = 'reasonable' or verdict is null then
    score := null; calibration := null; return;
  end if;
  score := case verdict when 'match' then 100 when 'defensible' then 60 when 'depends' then 40 else 0 end;
  if confidence is null then calibration := null; return; end if;
  p := (array[0.2, 0.4, 0.6, 0.8, 0.95])[confidence];
  o := score / 100.0;
  calibration := round(100 * (1 - (p - o) ^ 2));
end;
$$;
revoke all on function content_admin.daily_score(text, text, smallint) from public, anon, authenticated;

update public.daily_challenge_attempts a
set score = s.score, calibration = s.calibration
from (select x.user_id, x.challenge_date, (content_admin.daily_score(x.result ->> 'verdict', x.basis, x.confidence)).* from public.daily_challenge_attempts x) s
where s.user_id = a.user_id and s.challenge_date = a.challenge_date;

-- ── Integrity: content is immutable once answered ────────────────────────────

-- Replaces the v1 guard. Once anyone has answered a challenge officially:
--   * its date never moves and it can't be unpublished (the day's competition stays as it was played);
--   * any change at all (text included) needs a higher version and a correction_note — the controlled correction
--     process. Attempts keep the result they were graded with; every published state stays in the history table.
create or replace function public.daily_challenges_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.version < old.version then
    raise exception 'daily challenge %: version can''t go down (% → %)', old.id, old.version, new.version;
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  if exists (select 1 from public.daily_challenge_attempts a where a.challenge_id = old.id) then
    if new.challenge_date <> old.challenge_date then
      raise exception 'daily challenge % has attempts, so its date can''t change', old.id;
    end if;
    if new.status <> old.status then
      raise exception 'daily challenge % has attempts, so it can''t be unpublished', old.id;
    end if;
    if (to_jsonb(new) - array['version', 'updated_at', 'published_at', 'correction_note'])
        is distinct from (to_jsonb(old) - array['version', 'updated_at', 'published_at', 'correction_note']) then
      if new.version = old.version then
        raise exception 'daily challenge % has attempts: raise its version to change how it is answered or graded', old.id;
      end if;
      if new.correction_note is null or new.correction_note is not distinct from old.correction_note then
        raise exception 'daily challenge % has attempts: a corrected version needs a "correction" note explaining why', old.id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- A challenge's key is as protected as the challenge (v1 already required a version bump; keep that).

-- ── The scenario pool (automatic content) ────────────────────────────────────

-- How each of the 66 lesson scenarios works as a standalone Daily Challenge. The scenario itself is never changed:
-- the adaptation reads its setup, rules, payoff visual, prediction question and options from content_scenarios when
-- it is picked, and records which version it used. `format` and `difficulty` were assigned by reading each
-- scenario: what the question asks (predict someone's behaviour, choose your own action, explain a result, or work
-- out what several players' choices produce) and how much reasoning it takes (one comparison → 1; a chain or an
-- expected value → 2; several steps, conditional probability or equilibrium mixing → 3).
-- No foreign key: scenarios are imported after the migrations (seed.sql). Picks check the scenario is published.
create table public.daily_scenario_pool (
  scenario_id text primary key,
  format text not null check (format in ('prediction', 'decision', 'reasoning', 'outcome')),
  difficulty smallint not null check (difficulty between 1 and 3),
  -- Optional override of the lesson's concept name shown after the answer.
  concept text check (concept is null or length(concept) between 1 and 120),
  enabled boolean not null default true,
  -- Why a scenario is excluded (required when enabled = false).
  exclusion_reason text,
  updated_at timestamptz not null default now(),
  check (enabled or exclusion_reason is not null)
);
create trigger daily_scenario_pool_touch before update on public.daily_scenario_pool
  for each row execute function public.touch_updated_at();
alter table public.daily_scenario_pool enable row level security;
revoke all on public.daily_scenario_pool from anon, authenticated;

insert into public.daily_scenario_pool (scenario_id, format, difficulty) values
  ('l1.a.classic-dilemma', 'prediction', 1), ('l1.b.shared-project', 'decision', 1), ('l1.c.community-fund', 'decision', 1),
  ('l2.a.dominant-action', 'decision', 1), ('l2.b.negotiation-elimination', 'outcome', 2), ('l2.c.candidate-positions', 'outcome', 2),
  ('l3.a.best-response-grid', 'outcome', 1), ('l3.b.penalty-kick', 'reasoning', 2), ('l3.c.partnership', 'prediction', 1),
  ('l4.a.stag-hunt', 'decision', 2), ('l4.b.battle-of-sexes', 'reasoning', 1), ('l4.c.focal-meeting', 'prediction', 1),
  ('l5.a.matching-pennies', 'decision', 2), ('l5.b.penalty-mix', 'decision', 3), ('l5.c.tax-audit', 'reasoning', 3),
  ('l6.a.cournot', 'decision', 2), ('l6.b.bertrand', 'outcome', 2), ('l6.c.positioning', 'decision', 2),
  ('l7.a.hawk-dove', 'outcome', 2), ('l7.b.driving', 'outcome', 1), ('l7.c.rare-invader', 'reasoning', 3),
  ('l8.a.stackelberg', 'decision', 3), ('l8.b.centipede', 'prediction', 2), ('l8.c.first-offer', 'prediction', 2),
  ('l9.a.market-entry', 'prediction', 2), ('l9.b.commitment', 'reasoning', 2), ('l9.c.empty-threat', 'prediction', 2),
  ('l10.a.sales-commission', 'decision', 2), ('l10.b.quality-inspection', 'decision', 2), ('l10.c.metric-hacking', 'prediction', 1),
  ('l11.a.ultimatum', 'prediction', 1), ('l11.b.alternating-offers', 'prediction', 2), ('l11.c.hold-up', 'reasoning', 2),
  ('l12.a.endurance', 'decision', 2), ('l12.b.all-pay', 'reasoning', 3), ('l12.c.standoff', 'decision', 2),
  ('l13.a.repeated-trust', 'decision', 2), ('l13.b.grim-trigger', 'reasoning', 3), ('l13.c.cheating-detection', 'reasoning', 3),
  ('l14.a.two-thirds', 'outcome', 2), ('l14.b.never-best-response', 'reasoning', 2), ('l14.c.reasoning-depth', 'decision', 3),
  ('l15.a.unknown-competitor', 'reasoning', 2), ('l15.b.buy-information', 'decision', 3), ('l15.c.new-evidence', 'reasoning', 3),
  ('l16.a.education-signal', 'reasoning', 1), ('l16.b.quality-certificate', 'reasoning', 2), ('l16.c.screening', 'prediction', 2),
  ('l17.a.first-price', 'decision', 3), ('l17.b.second-price', 'decision', 2), ('l17.c.coin-jar', 'reasoning', 2),
  ('l18.a.pooling-separating', 'decision', 3), ('l18.b.copy-the-leader', 'reasoning', 3), ('l18.c.lemons', 'decision', 3),
  ('l19.a.build-coalition', 'decision', 2), ('l19.b.project-allocation', 'reasoning', 2), ('l19.c.blocking-coalition', 'reasoning', 3),
  ('l20.a.strategic-vote', 'decision', 3), ('l20.b.agenda-control', 'decision', 2), ('l20.c.majority-coalition', 'decision', 2),
  ('l21.a.chicken', 'outcome', 2), ('l21.b.escalation-ladder', 'decision', 3), ('l21.c.point-of-no-return', 'decision', 3),
  ('l22.a.startup-launch', 'prediction', 2), ('l22.b.team-crisis', 'outcome', 3), ('l22.c.negotiation-pressure', 'decision', 2);

-- Global usage: which scenario was the Daily Challenge on which date, and how it got there. Independent of anyone's
-- participation, and of lesson progress (having played a scenario in its lesson never removes it from the pool).
create table public.daily_scenario_usage (
  seq bigint generated always as identity primary key,
  challenge_date date not null,
  scenario_id text not null,
  scenario_version integer not null,
  lesson_id text not null,
  challenge_id text not null references public.daily_challenges (id) on delete restrict,
  selection text not null check (selection in ('automatic', 'manual')),
  selected_at timestamptz not null default now(),
  -- Set when an unanswered automatic pick was replaced by a manual challenge for the same date.
  superseded_at timestamptz
);
create unique index daily_scenario_usage_one_per_date on public.daily_scenario_usage (challenge_date) where superseded_at is null;
create index daily_scenario_usage_scenario_idx on public.daily_scenario_usage (scenario_id, challenge_date desc) where superseded_at is null;
alter table public.daily_scenario_usage enable row level security;
revoke all on public.daily_scenario_usage from anon, authenticated;

-- ── Authoring: validation and publishing (owner only) ────────────────────────

-- Every problem with a v2 challenge document. The v1 checks (content_admin.daily_problems) still apply to the
-- original fields; this adds the v2 fields and the optional context of a choice challenge.
--   format          prediction | decision | reasoning | outcome (optional)
--   concept         the strategic concept, shown after answering (optional, ≤120)
--   minutes         estimated minutes, 1–10 (default 2)
--   sourceScenario  {"id": "<scenario id>", "version": <n>} when derived from a lesson scenario (optional)
--   correction      why a challenge that already has attempts is being corrected (required then)
--   config.rules    choice only: up to 8 short rule lines shown with the situation
--   config.visual   choice only: a payoff table, game tree or table in the scenario-visual format
create or replace function content_admin.daily_problems_v2(doc jsonb) returns setof text
language plpgsql stable set search_path = '' as $$
declare
  base jsonb;
  cfg jsonb := doc -> 'config';
  x jsonb;
begin
  if jsonb_typeof(doc) is distinct from 'object' then
    return next 'the document must be a JSON object';
    return;
  end if;
  base := doc - array['format', 'concept', 'minutes', 'sourceScenario', 'correction'];
  if doc ->> 'interaction' = 'choice' and jsonb_typeof(cfg) = 'object' then
    base := jsonb_set(base, '{config}', cfg - array['rules', 'visual']);
    if cfg ? 'rules' and (jsonb_typeof(cfg -> 'rules') is distinct from 'array' or jsonb_array_length(cfg -> 'rules') not between 1 and 8
        or exists (select 1 from jsonb_array_elements(cfg -> 'rules') r where jsonb_typeof(r) <> 'string' or length(r #>> '{}') not between 1 and 300)) then
      return next 'config.rules must be 1 to 8 lines of text (each 1–300 characters)';
    end if;
    if cfg ? 'visual' and (jsonb_typeof(cfg -> 'visual') is distinct from 'object' or coalesce(cfg -> 'visual' ->> 'kind', '') not in ('matrix', 'tree', 'table')
        or octet_length((cfg -> 'visual')::text) > 8192) then
      return next 'config.visual must be a matrix, tree or table visual (at most 8 KB)';
    end if;
  end if;
  return query select * from content_admin.daily_problems(base);
  if doc ? 'format' and coalesce(doc ->> 'format', '') not in ('prediction', 'decision', 'reasoning', 'outcome') then
    return next 'format must be prediction, decision, reasoning or outcome';
  end if;
  if doc ? 'concept' and coalesce(length(doc ->> 'concept'), 0) not between 1 and 120 then return next 'concept must be 1–120 characters'; end if;
  if doc ? 'minutes' and coalesce(doc ->> 'minutes', '') !~ '^([1-9]|10)$' then return next 'minutes must be a whole number from 1 to 10'; end if;
  if doc ? 'correction' and coalesce(length(doc ->> 'correction'), 0) not between 1 and 500 then return next 'correction must be 1–500 characters'; end if;
  if doc ? 'sourceScenario' then
    x := doc -> 'sourceScenario';
    if jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x -> 'version') is distinct from 'number'
        or not exists (select 1 from public.content_scenarios s where s.id = x ->> 'id' and s.version = (x ->> 'version')::numeric) then
      return next 'sourceScenario must be {"id": <an existing scenario id>, "version": <its version>}';
    end if;
  end if;
end;
$$;
revoke all on function content_admin.daily_problems_v2(jsonb) from public, anon, authenticated;

-- Publish, schedule or update one challenge from a JSON document (the SQL Editor statement). Replaces v1 with the
-- same results and rules, plus:
--   * the v2 fields above;
--   * a manual challenge for a date that already has an *automatic* (scenario) challenge nobody has answered replaces
--     it: the automatic one goes back to draft and its usage is marked superseded. One that has attempts is never
--     replaced. Another manual challenge on the date is still refused — nothing manual is replaced silently;
--   * a challenge that already has attempts can only change with a higher version and a "correction" note.
create or replace function content_admin.publish_daily_challenge(doc jsonb)
returns table (action text, id text, challenge_date date, version integer, status public.content_status)
language plpgsql set search_path = '' as $$
#variable_conflict use_column
declare
  problems text;
  cur public.daily_challenges;
  s public.content_scenarios;
  d date;
  st public.content_status;
  other public.daily_challenges;
  incoming jsonb;
  existing jsonb;
  src text := coalesce(doc ->> '_source', 'manual');
begin
  select string_agg(p, E'\n') into problems from content_admin.daily_problems_v2(doc - '_source') p;
  if problems is not null then
    raise exception E'daily challenge not published:\n%', problems;
  end if;
  d := (doc ->> 'date')::date;
  st := coalesce(doc ->> 'status', 'published')::public.content_status;
  if doc ->> 'interaction' = 'scenario' then
    select * into s from public.content_scenarios where content_scenarios.id = doc -> 'config' ->> 'scenario';
  end if;
  -- One writer per date at a time (the automatic scheduler takes the same lock).
  perform pg_advisory_xact_lock(hashtext('daily-date:' || d::text));

  if st = 'published' then
    select * into other from public.daily_challenges c
      where c.challenge_date = d and c.status = 'published' and c.id <> doc ->> 'id';
    if other.id is not null then
      if src = 'manual' and other.source = 'scenario'
          and not exists (select 1 from public.daily_challenge_attempts a where a.challenge_id = other.id) then
        update public.daily_challenges c set status = 'draft' where c.id = other.id;
        update public.daily_scenario_usage u set superseded_at = now() where u.challenge_id = other.id and u.superseded_at is null;
      else
        raise exception '%', format('daily challenge not published: %s is already published for %s%s. Unpublish it first (select content_admin.unpublish_daily_challenge(%L)).',
          other.id, d, case when exists (select 1 from public.daily_challenge_attempts a where a.challenge_id = other.id) then ' and has official attempts, so it stays' else '' end, other.id);
      end if;
    end if;
  end if;

  incoming := jsonb_build_object(
    'challenge_date', d, 'status', st, 'title', doc ->> 'title', 'intro', doc ->> 'intro', 'prompt', doc ->> 'prompt',
    'instructions', doc ->> 'instructions', 'interaction', doc ->> 'interaction', 'config', doc -> 'config',
    'ask_confidence', coalesce((doc ->> 'askConfidence')::boolean, true), 'difficulty', coalesce((doc ->> 'difficulty')::smallint, 2),
    'skill_id', coalesce(doc ->> 'skill', s.skill_id), 'basis', coalesce(doc ->> 'basis', s.prediction_basis, 'calculable'),
    'lesson_id', coalesce(doc ->> 'lesson', s.lesson_id),
    'source', src, 'source_scenario_id', doc -> 'sourceScenario' ->> 'id', 'source_scenario_version', (doc -> 'sourceScenario' ->> 'version')::integer,
    'format', doc ->> 'format', 'concept', doc ->> 'concept', 'minutes', coalesce((doc ->> 'minutes')::smallint, 2),
    'evaluation', coalesce(doc -> 'key' -> 'evaluation', '{}'::jsonb), 'model_answer', doc -> 'key' ->> 'modelAnswer',
    'explanation', doc -> 'key' -> 'explanation', 'takeaway', doc -> 'key' ->> 'takeaway');

  select * into cur from public.daily_challenges c where c.id = doc ->> 'id' for update;
  if cur.id is null then
    insert into public.daily_challenges (id, challenge_date, version, status, title, intro, prompt, instructions, interaction, config,
      ask_confidence, difficulty, skill_id, basis, lesson_id, source, source_scenario_id, source_scenario_version, format, concept, minutes)
    values (doc ->> 'id', d, (doc ->> 'version')::integer, st, incoming ->> 'title', incoming ->> 'intro', incoming ->> 'prompt',
      incoming ->> 'instructions', incoming ->> 'interaction', incoming -> 'config', (incoming ->> 'ask_confidence')::boolean,
      (incoming ->> 'difficulty')::smallint, incoming ->> 'skill_id', incoming ->> 'basis', incoming ->> 'lesson_id',
      src, incoming ->> 'source_scenario_id', (incoming ->> 'source_scenario_version')::integer, incoming ->> 'format', incoming ->> 'concept',
      (incoming ->> 'minutes')::smallint);
    insert into public.daily_challenge_keys (challenge_id, version, evaluation, model_answer, explanation, takeaway)
    values (doc ->> 'id', (doc ->> 'version')::integer, incoming -> 'evaluation', incoming ->> 'model_answer',
      case when jsonb_typeof(incoming -> 'explanation') = 'array' then content_admin.text_array(incoming -> 'explanation') end, incoming ->> 'takeaway');
    action := 'inserted';
  else
    select jsonb_build_object(
      'challenge_date', c.challenge_date, 'status', c.status, 'title', c.title, 'intro', c.intro, 'prompt', c.prompt,
      'instructions', c.instructions, 'interaction', c.interaction, 'config', c.config, 'ask_confidence', c.ask_confidence,
      'difficulty', c.difficulty, 'skill_id', c.skill_id, 'basis', c.basis, 'lesson_id', c.lesson_id,
      'source', c.source, 'source_scenario_id', c.source_scenario_id, 'source_scenario_version', c.source_scenario_version,
      'format', c.format, 'concept', c.concept, 'minutes', c.minutes,
      'evaluation', coalesce(k.evaluation, '{}'::jsonb), 'model_answer', k.model_answer,
      'explanation', to_jsonb(k.explanation), 'takeaway', k.takeaway)
    into existing
    from public.daily_challenges c left join public.daily_challenge_keys k on k.challenge_id = c.id where c.id = cur.id;
    if existing = incoming and (doc ->> 'version')::integer = cur.version then
      action := 'unchanged';
    elsif (doc ->> 'version')::integer <= cur.version then
      raise exception 'daily challenge % not published: it differs from the stored version %, so give it "version": % or higher', cur.id, cur.version, cur.version + 1;
    else
      update public.daily_challenges c set challenge_date = d, version = (doc ->> 'version')::integer, status = st,
        title = incoming ->> 'title', intro = incoming ->> 'intro', prompt = incoming ->> 'prompt', instructions = incoming ->> 'instructions',
        interaction = incoming ->> 'interaction', config = incoming -> 'config', ask_confidence = (incoming ->> 'ask_confidence')::boolean,
        difficulty = (incoming ->> 'difficulty')::smallint, skill_id = incoming ->> 'skill_id', basis = incoming ->> 'basis',
        lesson_id = incoming ->> 'lesson_id', source = src, source_scenario_id = incoming ->> 'source_scenario_id',
        source_scenario_version = (incoming ->> 'source_scenario_version')::integer, format = incoming ->> 'format',
        concept = incoming ->> 'concept', minutes = (incoming ->> 'minutes')::smallint, correction_note = coalesce(doc ->> 'correction', c.correction_note)
      where c.id = cur.id;
      insert into public.daily_challenge_keys as k (challenge_id, version, evaluation, model_answer, explanation, takeaway)
      values (cur.id, (doc ->> 'version')::integer, incoming -> 'evaluation', incoming ->> 'model_answer',
        case when jsonb_typeof(incoming -> 'explanation') = 'array' then content_admin.text_array(incoming -> 'explanation') end, incoming ->> 'takeaway')
      on conflict (challenge_id) do update set version = excluded.version, evaluation = excluded.evaluation,
        model_answer = excluded.model_answer, explanation = excluded.explanation, takeaway = excluded.takeaway;
      action := 'updated';
    end if;
  end if;

  -- A published manual challenge derived from a lesson scenario counts in that scenario's usage history.
  if st = 'published' and incoming ->> 'source_scenario_id' is not null then
    insert into public.daily_scenario_usage (challenge_date, scenario_id, scenario_version, lesson_id, challenge_id, selection)
    select d, sc.id, sc.version, sc.lesson_id, doc ->> 'id', case when src = 'manual' then 'manual' else 'automatic' end
    from public.content_scenarios sc where sc.id = incoming ->> 'source_scenario_id'
      and not exists (select 1 from public.daily_scenario_usage u where u.challenge_date = d and u.superseded_at is null);
  end if;

  select c.id, c.challenge_date, c.version, c.status into id, challenge_date, version, status
    from public.daily_challenges c where c.id = doc ->> 'id';
  return next;
end;
$$;
revoke all on function content_admin.publish_daily_challenge(jsonb) from public, anon, authenticated;

-- Unpublish (back to draft) a challenge nobody has answered yet. Refused once it has official attempts.
create or replace function content_admin.unpublish_daily_challenge(challenge text) returns text
language plpgsql set search_path = '' as $$
declare
  c public.daily_challenges;
begin
  select * into c from public.daily_challenges where id = challenge for update;
  if c.id is null then raise exception 'daily challenge % does not exist', challenge; end if;
  if exists (select 1 from public.daily_challenge_attempts a where a.challenge_id = c.id) then
    raise exception 'daily challenge % has official attempts and stays published (use a versioned correction instead)', c.id;
  end if;
  update public.daily_challenges set status = 'draft' where id = c.id;
  update public.daily_scenario_usage set superseded_at = now() where challenge_id = c.id and superseded_at is null;
  return format('%s is now a draft', c.id);
end;
$$;
revoke all on function content_admin.unpublish_daily_challenge(text) from public, anon, authenticated;

-- A stored challenge as the JSON document publish_daily_challenge takes (to copy, edit and publish again).
create or replace function content_admin.daily_doc_of(challenge text) returns jsonb
language sql stable set search_path = '' as $$
  select content_admin.drop_null_keys(jsonb_build_object(
    'id', c.id, 'date', c.challenge_date, 'version', c.version, 'status', c.status, 'title', c.title, 'intro', c.intro,
    'prompt', c.prompt, 'instructions', c.instructions, 'interaction', c.interaction, 'config', c.config,
    'askConfidence', c.ask_confidence, 'difficulty', c.difficulty, 'skill', c.skill_id, 'basis', c.basis, 'lesson', c.lesson_id,
    'format', c.format, 'concept', c.concept, 'minutes', c.minutes,
    'sourceScenario', case when c.source_scenario_id is not null then jsonb_build_object('id', c.source_scenario_id, 'version', c.source_scenario_version) end,
    'key', content_admin.drop_null_keys(jsonb_build_object('evaluation', k.evaluation, 'modelAnswer', k.model_answer,
      'explanation', to_jsonb(k.explanation), 'takeaway', k.takeaway))))
  from public.daily_challenges c left join public.daily_challenge_keys k on k.challenge_id = c.id
  where c.id = challenge
$$;
revoke all on function content_admin.daily_doc_of(text) from public, anon, authenticated;

-- Publish a scheduled draft as it is stored: validated exactly like publish_daily_challenge, with the same date rules
-- (it replaces an unanswered automatic pick for its date; never another manual challenge).
create or replace function content_admin.publish_scheduled_challenge(challenge text)
returns table (action text, id text, challenge_date date, version integer, status public.content_status)
language plpgsql set search_path = '' as $$
declare
  doc jsonb := content_admin.daily_doc_of(challenge);
  src text;
begin
  if doc is null then raise exception 'daily challenge % does not exist', challenge; end if;
  if doc ->> 'status' = 'published' then raise exception 'daily challenge % is already published', challenge; end if;
  select c.source into src from public.daily_challenges c where c.id = challenge;
  return query select * from content_admin.publish_daily_challenge(
    doc || jsonb_build_object('status', 'published', 'version', (doc ->> 'version')::integer + 1, '_source', src));
end;
$$;
revoke all on function content_admin.publish_scheduled_challenge(text) from public, anon, authenticated;

-- ── Automatic selection ──────────────────────────────────────────────────────

-- The candidates for date `d`, best first, with the reasons — what ensure_daily_challenge would pick (first row).
-- Controlled randomness: the order is fixed by the history and a per-date hash, so the same state gives the same
-- pick, but it isn't a fixed rotation.
--   1. not cooling down (not used in the last `daily_cooldown_days` days) — if every candidate is, all compete;
--   2. no two Hard (difficulty 3) days in a row;
--   3. fewer appearances overall (every scenario gets its turn before any is reused);
--   4. its lesson featured longest ago (never, or 22+ days ago, all count the same) — spreads the 22 lessons;
--   5. a different format from the previous day;
--   6. the least recently used scenario, then the per-date hash.
create or replace function content_admin.daily_candidates(d date)
returns table (scenario_id text, scenario_version integer, lesson_id text, format text, difficulty smallint, uses integer,
  last_used date, lesson_last_used date, cooling_down boolean, rank integer)
language sql stable set search_path = '' as $$
  with settings as (select daily_cooldown_days as cooldown from public.competition_settings),
  used as (
    select u.scenario_id, count(*)::integer as uses, max(u.challenge_date) as last_used
    from public.daily_scenario_usage u where u.superseded_at is null and u.challenge_date < d group by u.scenario_id
  ),
  lesson_used as (
    select u.lesson_id, max(u.challenge_date) as last_used
    from public.daily_scenario_usage u where u.superseded_at is null and u.challenge_date < d group by u.lesson_id
  ),
  yesterday as (
    select c.difficulty, c.format from public.daily_challenges c where c.challenge_date = d - 1 and c.status = 'published' limit 1
  ),
  pool as (
    select p.scenario_id, s.version as scenario_version, s.lesson_id, p.format, p.difficulty,
      coalesce(u.uses, 0) as uses, u.last_used, lu.last_used as lesson_last_used,
      coalesce(u.last_used > d - (select cooldown from settings), false) as cooling_down
    from public.daily_scenario_pool p
    join public.content_scenarios s on s.id = p.scenario_id and s.status = 'published'
    join public.content_lessons l on l.id = s.lesson_id and l.status = 'published'
    left join used u on u.scenario_id = p.scenario_id
    left join lesson_used lu on lu.lesson_id = s.lesson_id
    where p.enabled
      and (select count(*) from public.content_scenario_options o where o.scenario_id = s.id) between 2 and 6
  ),
  usable as (
    select * from pool where not cooling_down or not exists (select 1 from pool where not cooling_down)
  )
  select x.scenario_id, x.scenario_version, x.lesson_id, x.format, x.difficulty, x.uses, x.last_used, x.lesson_last_used, x.cooling_down,
    (row_number() over (order by
      (x.difficulty = 3 and coalesce((select difficulty from yesterday), 0) = 3),
      x.uses,
      coalesce(least(d - x.lesson_last_used, 22), 22) desc,
      (x.format = (select format from yesterday)) is true,
      x.last_used nulls first,
      md5(d::text || x.scenario_id)))::integer
  from usable x
  order by 10;
$$;
revoke all on function content_admin.daily_candidates(date) from public, anon, authenticated;

-- The challenge document for scenario `sid` on date `d`: the scenario's setup, rules, visual, question and options as
-- a 'choice' challenge with a private key. Option ids are opaque letters in a per-date shuffled order, so the
-- position or id of an option never hints at its verdict. The scenario's content is read, never modified.
create or replace function content_admin.daily_doc_from_scenario(sid text, d date) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  s public.content_scenarios;
  p public.daily_scenario_pool;
  l public.content_lessons;
  opts jsonb;
  ev jsonb;
begin
  select * into s from public.content_scenarios where id = sid;
  if s.id is null then raise exception 'scenario % does not exist', sid; end if;
  select * into p from public.daily_scenario_pool where scenario_id = sid;
  select * into l from public.content_lessons where id = s.lesson_id;
  with shuffled as (
    select o.*, chr(96 + (row_number() over (order by md5(d::text || ':' || o.scenario_id || ':' || o.id)))::integer) as letter
    from public.content_scenario_options o where o.scenario_id = sid
  )
  select jsonb_agg(jsonb_build_object('id', letter, 'label', label) order by letter),
         jsonb_object_agg(letter, jsonb_build_object('verdict', verdict, 'feedback', feedback))
  into opts, ev from shuffled;
  -- Top-level nulls only are dropped (optional fields); nested content such as a visual is passed through untouched.
  return content_admin.drop_null_keys(jsonb_build_object(
    'id', 'daily-' || to_char(d, 'YYYYMMDD') || '-' || regexp_replace(lower(sid), '[^a-z0-9]+', '-', 'g'),
    'date', d,
    'version', 1,
    'status', 'published',
    'title', s.title,
    'intro', s.setup,
    'prompt', s.prediction_question,
    'interaction', 'choice',
    'config', content_admin.drop_null_keys(jsonb_build_object('options', opts, 'rules', to_jsonb(s.rules), 'visual', s.visual)),
    'askConfidence', true,
    'difficulty', coalesce(p.difficulty, 2),
    'skill', s.skill_id,
    'basis', s.prediction_basis,
    'lesson', s.lesson_id,
    'format', p.format,
    'concept', coalesce(p.concept, l.concept),
    'minutes', 2,
    'sourceScenario', jsonb_build_object('id', s.id, 'version', s.version),
    'key', jsonb_build_object('evaluation', jsonb_build_object('options', ev), 'modelAnswer', s.model_answer,
      'explanation', to_jsonb(s.explain), 'takeaway', s.takeaway)
  ));
end;
$$;
revoke all on function content_admin.daily_doc_from_scenario(text, date) from public, anon, authenticated;

-- Make sure date `d` has its official challenge. Idempotent and safe under concurrency:
--   * a published challenge for `d` (manual or automatic) → it stands, nothing changes;
--   * otherwise the best candidate scenario is adapted and published for `d` (source 'scenario'), and its usage
--     recorded — once. Concurrent calls serialize on a per-date advisory lock and re-check; the partial unique index
--     on (challenge_date) where published is the last line of defence.
-- Returns the challenge id, or null when nothing can be published (no eligible scenario: an empty or broken pool).
-- Drafts for `d` are never published automatically.
create or replace function content_admin.ensure_daily_challenge(d date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  existing text;
  pick text;
  doc jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('daily-date:' || d::text));
  select id into existing from public.daily_challenges where challenge_date = d and status = 'published';
  if existing is not null then return existing; end if;
  for pick in select c.scenario_id from content_admin.daily_candidates(d) c order by c.rank limit 5 loop
    doc := content_admin.daily_doc_from_scenario(pick, d);
    if not exists (select 1 from content_admin.daily_problems_v2(doc)) then
      perform content_admin.publish_daily_challenge(doc || '{"_source": "scenario"}'::jsonb);
      return doc ->> 'id';
    end if;
    -- An invalid adaptation is skipped (and visible in content_admin.validate_scenario_pool()), never published.
  end loop;
  return null;
end;
$$;
revoke all on function content_admin.ensure_daily_challenge(date) from public, anon, authenticated;

-- What the app calls before reading: today's challenge exists even if the scheduled job didn't run (recovery).
-- Never raises: a failure is logged and reading continues with whatever is published.
create or replace function public.ensure_daily_challenge_today() returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  return content_admin.ensure_daily_challenge(public.daily_challenge_today());
exception when others then
  raise warning 'ensure_daily_challenge_today failed: %', sqlerrm;
  return null;
end;
$$;
revoke all on function public.ensure_daily_challenge_today() from public, anon;
grant execute on function public.ensure_daily_challenge_today() to authenticated;

-- Pool health: scenarios that can't be adapted as written. Expect no rows.
create or replace function content_admin.validate_scenario_pool() returns table (scenario_id text, problem text)
language plpgsql stable set search_path = '' as $$
declare
  r record;
  p text;
begin
  for r in select x.scenario_id, x.enabled from public.daily_scenario_pool x order by 1 loop
    if not exists (select 1 from public.content_scenarios s where s.id = r.scenario_id and s.status = 'published') then
      scenario_id := r.scenario_id; problem := 'not a published scenario'; return next; continue;
    end if;
    for p in select * from content_admin.daily_problems_v2(content_admin.daily_doc_from_scenario(r.scenario_id, '2000-01-01')) loop
      scenario_id := r.scenario_id; problem := p; return next;
    end loop;
  end loop;
  for r in select s.id from public.content_scenarios s where s.status = 'published'
      and not exists (select 1 from public.daily_scenario_pool x where x.scenario_id = s.id) loop
    scenario_id := r.id; problem := 'published scenario missing from daily_scenario_pool'; return next;
  end loop;
end;
$$;
revoke all on function content_admin.validate_scenario_pool() from public, anon, authenticated;

-- ── SQL Editor views (owner only) ────────────────────────────────────────────

-- Every challenge with its lifecycle: draft (hidden) · scheduled (published, date ahead) · live (today) ·
-- archived (a past day: read-only history, open for practice).
create or replace view content_admin.daily_schedule as
  select c.challenge_date, c.id, c.title,
    case when c.status = 'draft' then 'draft'
         when c.challenge_date > public.daily_challenge_today() then 'scheduled'
         when c.challenge_date = public.daily_challenge_today() then 'live'
         else 'archived' end as lifecycle,
    c.source, c.source_scenario_id, c.interaction, c.format, c.difficulty, c.concept, c.version, c.scoring_version,
    (select count(*) from public.daily_challenge_attempts a where a.challenge_id = c.id)::integer as attempts,
    c.published_at, c.updated_at
  from public.daily_challenges c;

-- Each pool scenario: how often and when it has been the Daily Challenge, and whether it is cooling down.
create or replace view content_admin.daily_scenario_report as
  select p.scenario_id, s.lesson_id, s.title, p.format, p.difficulty, p.enabled, p.exclusion_reason,
    count(u.seq) filter (where u.superseded_at is null)::integer as uses,
    count(u.seq) filter (where u.superseded_at is null and u.selection = 'automatic')::integer as automatic_uses,
    max(u.challenge_date) filter (where u.superseded_at is null) as last_used,
    coalesce(max(u.challenge_date) filter (where u.superseded_at is null) > public.daily_challenge_today() - (select daily_cooldown_days from public.competition_settings), false) as cooling_down
  from public.daily_scenario_pool p
  left join public.content_scenarios s on s.id = p.scenario_id
  left join public.daily_scenario_usage u on u.scenario_id = p.scenario_id
  group by p.scenario_id, s.lesson_id, s.title, p.format, p.difficulty, p.enabled, p.exclusion_reason;

revoke all on content_admin.daily_schedule, content_admin.daily_scenario_report from public, anon, authenticated;

-- A challenge exactly as the app will show it, plus its private key, its problems and its attempts — for checking
-- before (or after) publishing. Accepts an id, or a document that hasn't been published yet.
create or replace function content_admin.preview_daily_challenge(target jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  c public.daily_challenges;
  k public.daily_challenge_keys;
begin
  if jsonb_typeof(target) = 'object' then
    return jsonb_build_object('problems', coalesce((select jsonb_agg(p) from content_admin.daily_problems_v2(target) p), '[]'::jsonb),
      'shown', target - array['key', 'correction'], 'key', target -> 'key');
  end if;
  select * into c from public.daily_challenges where id = target #>> '{}';
  if c.id is null then raise exception 'daily challenge % does not exist', target #>> '{}'; end if;
  select * into k from public.daily_challenge_keys where challenge_id = c.id;
  return jsonb_build_object('challenge', to_jsonb(c), 'key', to_jsonb(k),
    'lifecycle', (select lifecycle from content_admin.daily_schedule s where s.id = c.id),
    'attempts', (select count(*) from public.daily_challenge_attempts a where a.challenge_id = c.id));
end;
$$;
revoke all on function content_admin.preview_daily_challenge(jsonb) from public, anon, authenticated;

-- ── Ranking ──────────────────────────────────────────────────────────────────

-- Official standings of one challenge: score, then calibration, then the earliest submission. Players identical on
-- all three share a rank. Unscored challenges list everyone who took part with rank null.
create or replace function content_admin.daily_standings(challenge text)
returns table (user_id uuid, score smallint, calibration smallint, submitted_at timestamptz, evaluation text, rank integer, field integer)
language sql stable set search_path = '' as $$
  select a.user_id, a.score, a.calibration, a.submitted_at, a.evaluation,
    case when a.score is null then null else (rank() over (order by a.score desc nulls last, a.calibration desc nulls last, a.submitted_at))::integer end,
    (count(*) over ())::integer
  from public.daily_challenge_attempts a where a.challenge_id = challenge
$$;
revoke all on function content_admin.daily_standings(text) from public, anon, authenticated;

-- ── Client functions ─────────────────────────────────────────────────────────

create or replace function public.daily_attempt_json(a public.daily_challenge_attempts) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'challengeId', a.challenge_id, 'date', a.challenge_date, 'version', a.content_version, 'interaction', a.interaction,
    'answer', a.answer, 'confidence', a.confidence, 'evaluation', a.evaluation, 'skill', a.skill_id, 'basis', a.basis,
    'lesson', a.lesson_id, 'result', a.result, 'submittedAt', (extract(epoch from a.submitted_at) * 1000)::bigint,
    'score', a.score, 'calibration', a.calibration, 'scoringVersion', a.scoring_version);
$$;

-- v1 plus: today's challenge is ensured first (recovery for a missed scheduled run), the timezone is the configured
-- one, and the v2 metadata. Where the content came from (lesson, source scenario, concept) is withheld for today's
-- challenge until the caller has answered it — it could point straight at the answer.
create or replace function public.get_daily_challenges(request jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  d_from date;
  d_to date;
  today date;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  d_from := (request ->> 'from')::date;
  d_to := (request ->> 'to')::date;
  if d_from is null or d_to is null or d_to < d_from or d_to - d_from > 62 then
    raise exception 'daily:bad_range' using errcode = '22023';
  end if;
  today := public.daily_challenge_today();
  if today between d_from and d_to then perform public.ensure_daily_challenge_today(); end if;
  return jsonb_build_object(
    'today', today,
    'timezone', public.daily_timezone(),
    'challenges', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', c.id, 'date', c.challenge_date, 'version', c.version, 'title', c.title, 'intro', c.intro, 'prompt', c.prompt,
        'instructions', c.instructions, 'interaction', c.interaction, 'config', c.config, 'askConfidence', c.ask_confidence,
        'difficulty', c.difficulty, 'skill', c.skill_id, 'basis', c.basis, 'format', c.format, 'minutes', c.minutes,
        'source', c.source, 'scored', c.basis = 'calculable',
        'lesson', case when open.revealed then c.lesson_id end,
        'concept', case when open.revealed then c.concept end,
        'sourceScenario', case when open.revealed then c.source_scenario_id end)) order by c.challenge_date)
      from public.daily_challenges c
      cross join lateral (select c.challenge_date < today
        or exists (select 1 from public.daily_challenge_attempts a where a.user_id = uid and a.challenge_id = c.id) as revealed) open
      where c.challenge_date between d_from and d_to), '[]'::jsonb),
    'attempts', coalesce((select jsonb_agg(public.daily_attempt_json(a) order by a.challenge_date)
      from public.daily_challenge_attempts a where a.user_id = uid and a.challenge_date between d_from and d_to), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
        'challengeId', a.challenge_id, 'date', a.challenge_date, 'version', a.content_version, 'interaction', a.interaction,
        'confidence', a.confidence, 'evaluation', a.evaluation, 'skill', a.skill_id, 'basis', a.basis, 'lesson', a.lesson_id,
        'submittedAt', (extract(epoch from a.submitted_at) * 1000)::bigint, 'score', a.score,
        -- The lesson scenario an answer was built on, so the profile doesn't count that scenario twice.
        'sourceScenario', (select c.source_scenario_id from public.daily_challenges c where c.id = a.challenge_id)) order by a.challenge_date)
      from public.daily_challenge_attempts a where a.user_id = uid), '[]'::jsonb)
  );
end;
$$;

-- v1 plus the score, calibration and scoring version, and the source details in the result once answered.
create or replace function public.submit_daily_challenge(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  c public.daily_challenges;
  a public.daily_challenge_attempts;
  graded jsonb;
  conf smallint;
  sc record;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if jsonb_typeof(request) is distinct from 'object' then
    raise exception 'daily:invalid_answer' using errcode = 'P0001';
  end if;
  select * into c from public.daily_challenges
    where id = request ->> 'challengeId' and status = 'published' and challenge_date <= public.daily_challenge_today();
  if c.id is null then
    raise exception 'daily:not_found' using errcode = 'P0001';
  end if;

  select * into a from public.daily_challenge_attempts where user_id = uid and challenge_id = c.id;
  if a.user_id is not null then
    return jsonb_build_object('status', 'existing', 'attempt', public.daily_attempt_json(a));
  end if;
  if c.challenge_date <> public.daily_challenge_today() then
    raise exception 'daily:closed' using errcode = 'P0001';
  end if;
  if (request ->> 'version') is null or (request ->> 'version')::integer <> c.version then
    raise exception 'daily:stale' using errcode = 'P0001';
  end if;
  if jsonb_typeof(request -> 'confidence') = 'number' then
    conf := (request ->> 'confidence')::smallint;
  end if;
  if (c.ask_confidence and (conf is null or conf not between 1 and 5)) or (not c.ask_confidence and conf is not null) then
    raise exception 'daily:confidence' using errcode = 'P0001';
  end if;

  graded := content_admin.daily_evaluate(c, request -> 'answer')
    || jsonb_strip_nulls(jsonb_build_object('concept', c.concept, 'lesson', c.lesson_id, 'sourceScenario', c.source_scenario_id, 'format', c.format));
  select * into sc from content_admin.daily_score(graded ->> 'verdict', c.basis, conf);

  insert into public.daily_challenge_attempts (user_id, challenge_id, challenge_date, content_version, interaction, answer, confidence,
    evaluation, skill_id, basis, lesson_id, result, score, calibration, scoring_version)
  values (uid, c.id, c.challenge_date, c.version, c.interaction, request -> 'answer', conf,
    graded ->> 'evaluation', c.skill_id, c.basis, c.lesson_id, graded || jsonb_build_object('score', sc.score), sc.score, sc.calibration, c.scoring_version)
  on conflict do nothing
  returning * into a;

  if a.user_id is null then
    select * into a from public.daily_challenge_attempts where user_id = uid and challenge_date = c.challenge_date;
    return jsonb_build_object('status', 'existing', 'attempt', public.daily_attempt_json(a));
  end if;
  return jsonb_build_object('status', 'recorded', 'attempt', public.daily_attempt_json(a));
end;
$$;

-- The leaderboard of one day's challenge (default: today). Top 50, the caller's own row, the field size. Nicknames
-- only. Built from official attempts only — practice is never recorded, so it can't appear here.
create or replace function public.get_daily_leaderboard(request jsonb default '{}'::jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  d date;
  c public.daily_challenges;
  top jsonb;
  mine jsonb;
  n integer;
begin
  d := coalesce((request ->> 'date')::date, public.daily_challenge_today());
  if d > public.daily_challenge_today() then raise exception 'daily:not_found' using errcode = 'P0001'; end if;
  if d = public.daily_challenge_today() then perform public.ensure_daily_challenge_today(); end if;
  select * into c from public.daily_challenges where challenge_date = d and status = 'published';
  if c.id is null then
    return jsonb_build_object('date', d, 'challenge', null, 'entries', '[]'::jsonb, 'me', null, 'participants', 0, 'today', public.daily_challenge_today());
  end if;
  select
    coalesce((select jsonb_agg(jsonb_build_object('rank', s.rank, 'nickname', game_engine.nickname_of(s.user_id), 'score', s.score,
        'calibration', s.calibration, 'isMe', s.user_id = uid) order by s.rank nulls last, s.submitted_at)
      from (select * from content_admin.daily_standings(c.id) order by rank nulls last, submitted_at limit 50) s), '[]'::jsonb),
    (select jsonb_build_object('rank', s.rank, 'nickname', game_engine.nickname_of(s.user_id), 'score', s.score, 'calibration', s.calibration,
        'evaluation', s.evaluation, 'isMe', true)
      from content_admin.daily_standings(c.id) s where s.user_id = uid),
    (select count(*) from public.daily_challenge_attempts a where a.challenge_id = c.id)
  into top, mine, n;
  return jsonb_build_object('date', d, 'today', public.daily_challenge_today(),
    'challenge', jsonb_build_object('id', c.id, 'title', c.title, 'difficulty', c.difficulty, 'scored', c.basis = 'calculable', 'format', c.format),
    'entries', top, 'me', mine, 'participants', n,
    'status', case when mine is not null then 'completed' when uid is null then 'signed_out' else 'not_attempted' end);
end;
$$;

-- Past challenges, newest first, `limit` (≤ 30) at a time before `before` (default: today, exclusive). Each with
-- its concept and field size and, for the caller, their official result and rank.
create or replace function public.get_daily_history(request jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  before_d date := coalesce((request ->> 'before')::date, public.daily_challenge_today());
  lim integer := least(30, greatest(1, coalesce((request ->> 'limit')::integer, 20)));
  items jsonb;
begin
  if before_d > public.daily_challenge_today() then before_d := public.daily_challenge_today(); end if;
  select coalesce(jsonb_agg(x order by x ->> 'date' desc), '[]'::jsonb) into items from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', c.id, 'date', c.challenge_date, 'title', c.title, 'concept', c.concept, 'format', c.format, 'difficulty', c.difficulty,
      'lesson', c.lesson_id, 'source', c.source, 'scored', c.basis = 'calculable',
      'participants', (select count(*) from public.daily_challenge_attempts a where a.challenge_id = c.id),
      'mine', (select jsonb_build_object('evaluation', s.evaluation, 'score', s.score, 'rank', s.rank)
               from content_admin.daily_standings(c.id) s where s.user_id = uid))) as x
    from public.daily_challenges c
    where c.status = 'published' and c.challenge_date < before_d
    order by c.challenge_date desc limit lim
  ) t;
  return jsonb_build_object('items', items, 'today', public.daily_challenge_today(),
    'next', case when jsonb_array_length(items) = lim then items -> (lim - 1) ->> 'date' end);
end;
$$;

revoke all on function public.get_daily_leaderboard(jsonb), public.get_daily_history(jsonb) from public;
grant execute on function public.get_daily_leaderboard(jsonb), public.get_daily_history(jsonb) to anon, authenticated;
grant execute on function public.get_daily_challenges(jsonb), public.submit_daily_challenge(jsonb), public.daily_attempt_json(public.daily_challenge_attempts) to authenticated;
