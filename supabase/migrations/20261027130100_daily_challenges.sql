-- Daily Strategic Challenge: one short challenge per calendar day, published from the SQL editor, graded on the
-- server, with one official attempt per learner per day.
--
-- Schedule timezone: UTC. A "day" is a UTC calendar date everywhere — in daily_challenge_today(), in row level
-- security, in submission and in the app (which takes `today` from the server rather than from the device clock).
--
-- Tables
--   daily_challenges          public content: what the learner reads and how the app renders it (typed columns for
--                             what is queried, `config` JSONB for the interaction's validated settings). Readable only
--                             once published *and* on or after its date, so future challenges never leak.
--   daily_challenge_keys      private grading data (option verdicts and feedback, number bands, the model answer,
--                             explanation and takeaway). No client grant at all; only SECURITY DEFINER functions read it.
--   daily_challenge_attempts  official attempts: one per user per date (primary key) and per challenge (unique), with
--                             the graded result snapshotted, so a result never changes after a later content edit.
--   daily_challenge_history   append-only snapshot of every published state of a challenge and its key.
--
-- Interaction types (each has a TypeScript engine registered in src/features/daily/interactions.ts; the database
-- only stores configuration and never code):
--   choice    options [{id, label}], graded by a private verdict per option
--   number    a slider {min, max, step, initial, unit?}, graded by private bands [{min, max, verdict, feedback}]
--   scenario  an existing paired scenario {scenario, version}, played with its own engine; graded by the scenario's
--             prediction options, which are public content — such challenges have no secret answer
--
-- Publishing: content_admin.publish_daily_challenge(doc) — see docs/DAILY_CHALLENGE.md for the template.

-- ── Schedule clock ───────────────────────────────────────────────────────────

create or replace function public.daily_challenge_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'UTC')::date;
$$;
grant execute on function public.daily_challenge_today() to anon, authenticated;

-- ── Content ──────────────────────────────────────────────────────────────────

create table public.daily_challenges (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 80),
  challenge_date date not null,
  -- Content version, recorded with every attempt. Any change through publish_daily_challenge needs a higher one.
  version integer not null default 1 check (version > 0),
  status public.content_status not null default 'published',
  title text not null check (length(title) between 1 and 120),
  intro text not null check (length(intro) between 1 and 800),
  prompt text not null check (length(prompt) between 1 and 1500),
  instructions text check (instructions is null or length(instructions) between 1 and 400),
  interaction text not null check (interaction in ('choice', 'number', 'scenario')),
  config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 16384),
  ask_confidence boolean not null default true,
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  -- Profile metadata: which existing skill area this practises, and whether the answer follows from what is shown.
  skill_id text references public.content_skills (id) on delete restrict,
  basis text not null default 'calculable' check (basis in ('calculable', 'uncertain')),
  -- Optional: the lesson to open for more on this idea.
  lesson_id text references public.content_lessons (id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one published challenge per date; drafts may share a date while being prepared.
create unique index daily_challenges_one_published_per_date on public.daily_challenges (challenge_date) where status = 'published';
create index daily_challenges_date_idx on public.daily_challenges (challenge_date);

create table public.daily_challenge_keys (
  challenge_id text primary key references public.daily_challenges (id) on delete cascade,
  -- The challenge version this key grades.
  version integer not null check (version > 0),
  evaluation jsonb not null default '{}'::jsonb check (jsonb_typeof(evaluation) = 'object' and octet_length(evaluation::text) <= 32768),
  -- Null only for scenario challenges, which fall back to the scenario's own model answer, explanation and takeaway.
  model_answer text check (model_answer is null or length(model_answer) between 1 and 300),
  explanation text[] check (explanation is null or cardinality(explanation) > 0),
  takeaway text check (takeaway is null or length(takeaway) between 1 and 600),
  updated_at timestamptz not null default now()
);

create table public.daily_challenge_history (
  seq bigint generated always as identity primary key,
  challenge_id text not null,
  version integer not null,
  source text not null check (source in ('challenge', 'key')),
  challenge jsonb,
  key jsonb,
  recorded_at timestamptz not null default now()
);
create index daily_challenge_history_challenge_idx on public.daily_challenge_history (challenge_id, seq);

-- ── Official attempts ────────────────────────────────────────────────────────

create table public.daily_challenge_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_id text not null references public.daily_challenges (id) on delete restrict,
  challenge_date date not null,
  content_version integer not null check (content_version > 0),
  interaction text not null check (interaction in ('choice', 'number', 'scenario')),
  answer jsonb not null check (jsonb_typeof(answer) = 'object' and octet_length(answer::text) <= 8192),
  confidence smallint check (confidence is null or confidence between 1 and 5),
  evaluation text not null check (evaluation in ('correct', 'partial', 'reasonable', 'misconception')),
  -- Snapshotted when graded, so the profile and the result screen read what applied at the time.
  skill_id text,
  basis text not null check (basis in ('calculable', 'uncertain')),
  lesson_id text,
  -- What the learner was shown after submitting: verdict, feedback, model answer, explanation, takeaway, title.
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  submitted_at timestamptz not null default now(),
  primary key (user_id, challenge_date),
  unique (user_id, challenge_id)
);

-- ── Integrity ────────────────────────────────────────────────────────────────

create trigger daily_challenges_touch before update on public.daily_challenges
  for each row execute function public.touch_updated_at();
create trigger daily_challenge_keys_touch before update on public.daily_challenge_keys
  for each row execute function public.touch_updated_at();

-- Once anyone has answered a challenge, its meaning can't change silently: the date never moves, and the
-- interaction, its configuration, confidence, skill or basis change only together with a higher version.
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
    if new.version = old.version and (new.interaction, new.config, new.ask_confidence, new.skill_id, new.basis)
        is distinct from (old.interaction, old.config, old.ask_confidence, old.skill_id, old.basis) then
      raise exception 'daily challenge % has attempts: raise its version to change how it is answered or graded', old.id;
    end if;
  end if;
  return new;
end;
$$;
create trigger daily_challenges_guard before update on public.daily_challenges
  for each row execute function public.daily_challenges_guard();

create or replace function public.daily_challenges_set_published_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger daily_challenges_published_at before insert on public.daily_challenges
  for each row execute function public.daily_challenges_set_published_at();

create or replace function public.daily_challenge_keys_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.version < old.version then
    raise exception 'daily challenge key %: version can''t go down', old.challenge_id;
  end if;
  if new.version = old.version and (new.evaluation, new.model_answer, new.explanation, new.takeaway) is distinct from (old.evaluation, old.model_answer, old.explanation, old.takeaway)
      and exists (select 1 from public.daily_challenge_attempts a where a.challenge_id = old.challenge_id) then
    raise exception 'daily challenge % has attempts: raise its version to change its answer key', old.challenge_id;
  end if;
  return new;
end;
$$;
create trigger daily_challenge_keys_guard before update on public.daily_challenge_keys
  for each row execute function public.daily_challenge_keys_guard();

-- Every inserted or updated state is appended to the history (never updated or deleted).
create or replace function public.daily_challenge_snapshot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'daily_challenges' then
    insert into public.daily_challenge_history (challenge_id, version, source, challenge, key)
    values (new.id, new.version, 'challenge', to_jsonb(new), (select to_jsonb(k) from public.daily_challenge_keys k where k.challenge_id = new.id));
  else
    insert into public.daily_challenge_history (challenge_id, version, source, challenge, key)
    values (new.challenge_id, new.version, 'key', (select to_jsonb(c) from public.daily_challenges c where c.id = new.challenge_id), to_jsonb(new));
  end if;
  return null;
end;
$$;
create trigger daily_challenges_snapshot after insert or update on public.daily_challenges
  for each row execute function public.daily_challenge_snapshot();
create trigger daily_challenge_keys_snapshot after insert or update on public.daily_challenge_keys
  for each row execute function public.daily_challenge_snapshot();

-- ── Row level security ───────────────────────────────────────────────────────

alter table public.daily_challenges enable row level security;
revoke all on public.daily_challenges from anon, authenticated;
grant select on public.daily_challenges to anon, authenticated;
create policy daily_challenges_read_released on public.daily_challenges for select to anon, authenticated
  using (status = 'published' and challenge_date <= (select public.daily_challenge_today()));

-- Private: no policy and no grant, so no client role can read or write it.
alter table public.daily_challenge_keys enable row level security;
revoke all on public.daily_challenge_keys from anon, authenticated;

alter table public.daily_challenge_history enable row level security;
revoke all on public.daily_challenge_history from anon, authenticated;

-- Learners read their own attempts. Nobody writes them directly: submission goes through submit_daily_challenge.
alter table public.daily_challenge_attempts enable row level security;
revoke all on public.daily_challenge_attempts from anon, authenticated;
grant select on public.daily_challenge_attempts to authenticated;
create policy daily_challenge_attempts_select_own on public.daily_challenge_attempts for select to authenticated
  using (user_id = (select auth.uid()));

-- ── Grading (private) ────────────────────────────────────────────────────────

create schema if not exists content_admin;
revoke all on schema content_admin from public, anon, authenticated;

-- Grade an answer against a challenge and its key. Raises `daily:invalid_answer` for anything the interaction
-- doesn't accept. Returns the result the learner sees.
create or replace function content_admin.daily_evaluate(c public.daily_challenges, answer jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  k public.daily_challenge_keys;
  opt jsonb;
  band jsonb;
  verdict text;
  feedback text;
  label text;
  model text;
  expl text[];
  take text;
  v numeric;
  lo numeric;
  hi numeric;
  st numeric;
  s public.content_scenarios;
  so public.content_scenario_options;
begin
  if jsonb_typeof(answer) is distinct from 'object' then
    raise exception 'daily:invalid_answer' using errcode = 'P0001', detail = 'answer must be an object';
  end if;
  select * into k from public.daily_challenge_keys where challenge_id = c.id;

  if c.interaction = 'choice' then
    select x into opt from jsonb_array_elements(c.config -> 'options') x where x ->> 'id' = answer ->> 'option';
    if opt is null or k.challenge_id is null or k.evaluation -> 'options' -> (answer ->> 'option') is null then
      raise exception 'daily:invalid_answer' using errcode = 'P0001', detail = 'unknown option';
    end if;
    verdict := k.evaluation -> 'options' -> (answer ->> 'option') ->> 'verdict';
    feedback := k.evaluation -> 'options' -> (answer ->> 'option') ->> 'feedback';
    label := opt ->> 'label';
    model := k.model_answer;
    expl := k.explanation;
    take := k.takeaway;

  elsif c.interaction = 'number' then
    if jsonb_typeof(answer -> 'value') is distinct from 'number' or k.challenge_id is null then
      raise exception 'daily:invalid_answer' using errcode = 'P0001', detail = 'value must be a number';
    end if;
    v := (answer ->> 'value')::numeric;
    lo := (c.config ->> 'min')::numeric;
    hi := (c.config ->> 'max')::numeric;
    st := (c.config ->> 'step')::numeric;
    if v < lo or v > hi or abs(round((v - lo) / st) * st + lo - v) > st * 0.000001 then
      raise exception 'daily:invalid_answer' using errcode = 'P0001', detail = 'value out of range or off the step grid';
    end if;
    -- Snap away floating-point noise from the device.
    v := round((v - lo) / st) * st + lo;
    select x into band from jsonb_array_elements(k.evaluation -> 'bands') with ordinality as e(x, n)
      where v between (x ->> 'min')::numeric and (x ->> 'max')::numeric order by n limit 1;
    if band is null then
      raise exception 'daily:invalid_answer' using errcode = 'P0001', detail = 'no band covers the value';
    end if;
    verdict := band ->> 'verdict';
    feedback := band ->> 'feedback';
    label := trim(trailing '.' from trim(trailing '0' from v::text)) || coalesce(case when c.config ->> 'unit' = '%' then '%' else ' ' || (c.config ->> 'unit') end, '');
    if v = trunc(v) then label := trunc(v)::text || coalesce(case when c.config ->> 'unit' = '%' then '%' else ' ' || (c.config ->> 'unit') end, ''); end if;
    model := k.model_answer;
    expl := k.explanation;
    take := k.takeaway;

  elsif c.interaction = 'scenario' then
    select * into s from public.content_scenarios where id = c.config ->> 'scenario' and version = (c.config ->> 'version')::integer;
    select * into so from public.content_scenario_options where scenario_id = s.id and id = answer ->> 'option';
    if s.id is null or so.id is null
        or jsonb_typeof(answer -> 'seed') is distinct from 'number'
        or jsonb_typeof(answer -> 'inputs') is distinct from 'array' or jsonb_array_length(answer -> 'inputs') > 60 then
      raise exception 'daily:invalid_answer' using errcode = 'P0001', detail = 'unknown option or malformed play-through';
    end if;
    verdict := so.verdict;
    feedback := so.feedback;
    label := so.label;
    model := coalesce(k.model_answer, s.model_answer);
    expl := coalesce(k.explanation, s.explain);
    take := coalesce(k.takeaway, s.takeaway);

  else
    raise exception 'daily:unsupported' using errcode = 'P0001', detail = c.interaction;
  end if;

  return jsonb_build_object(
    'verdict', verdict,
    'evaluation', case verdict when 'match' then 'correct' when 'misconception' then 'misconception' when 'reasonable' then 'reasonable' else 'partial' end,
    'feedback', feedback,
    'answerLabel', label,
    'modelAnswer', model,
    'explanation', to_jsonb(expl),
    'takeaway', take,
    'title', c.title,
    'version', c.version
  );
end;
$$;
revoke all on function content_admin.daily_evaluate(public.daily_challenges, jsonb) from public, anon, authenticated;

-- ── Client functions ─────────────────────────────────────────────────────────

create or replace function public.daily_attempt_json(a public.daily_challenge_attempts) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'challengeId', a.challenge_id, 'date', a.challenge_date, 'version', a.content_version, 'interaction', a.interaction,
    'answer', a.answer, 'confidence', a.confidence, 'evaluation', a.evaluation, 'skill', a.skill_id, 'basis', a.basis,
    'lesson', a.lesson_id, 'result', a.result, 'submittedAt', (extract(epoch from a.submitted_at) * 1000)::bigint);
$$;

-- The calendar's data for a date range (at most 62 days): released challenges, the caller's attempts in the range,
-- and a compact list of all the caller's attempts (for summaries and the profile). SECURITY INVOKER, so row level
-- security decides what is visible: nothing scheduled after today, no drafts, only the caller's own attempts.
create or replace function public.get_daily_challenges(request jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  d_from date;
  d_to date;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  d_from := (request ->> 'from')::date;
  d_to := (request ->> 'to')::date;
  if d_from is null or d_to is null or d_to < d_from or d_to - d_from > 62 then
    raise exception 'daily:bad_range' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'today', public.daily_challenge_today(),
    'timezone', 'UTC',
    'challenges', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', c.id, 'date', c.challenge_date, 'version', c.version, 'title', c.title, 'intro', c.intro, 'prompt', c.prompt,
        'instructions', c.instructions, 'interaction', c.interaction, 'config', c.config, 'askConfidence', c.ask_confidence,
        'difficulty', c.difficulty, 'skill', c.skill_id, 'basis', c.basis, 'lesson', c.lesson_id)) order by c.challenge_date)
      from public.daily_challenges c where c.challenge_date between d_from and d_to), '[]'::jsonb),
    'attempts', coalesce((select jsonb_agg(public.daily_attempt_json(a) order by a.challenge_date)
      from public.daily_challenge_attempts a where a.user_id = uid and a.challenge_date between d_from and d_to), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
        'challengeId', a.challenge_id, 'date', a.challenge_date, 'version', a.content_version, 'interaction', a.interaction,
        'confidence', a.confidence, 'evaluation', a.evaluation, 'skill', a.skill_id, 'basis', a.basis, 'lesson', a.lesson_id,
        'submittedAt', (extract(epoch from a.submitted_at) * 1000)::bigint) order by a.challenge_date)
      from public.daily_challenge_attempts a where a.user_id = uid), '[]'::jsonb)
  );
end;
$$;

-- Submit today's official answer: {challengeId, version, answer, confidence}. Idempotent per learner and day — a
-- retry, a second device or a double tap returns the attempt already recorded (status 'existing') and never changes
-- it. Errors (P0001, message prefix `daily:`): not_found, closed (not today's challenge), stale (the content changed
-- since it was loaded; reload and answer again), confidence, invalid_answer.
create or replace function public.submit_daily_challenge(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  c public.daily_challenges;
  a public.daily_challenge_attempts;
  graded jsonb;
  conf smallint;
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

  graded := content_admin.daily_evaluate(c, request -> 'answer');

  insert into public.daily_challenge_attempts (user_id, challenge_id, challenge_date, content_version, interaction, answer, confidence,
    evaluation, skill_id, basis, lesson_id, result)
  values (uid, c.id, c.challenge_date, c.version, c.interaction, request -> 'answer', conf,
    graded ->> 'evaluation', c.skill_id, c.basis, c.lesson_id, graded)
  on conflict do nothing
  returning * into a;

  if a.user_id is null then
    -- A concurrent request recorded it first; that one stands.
    select * into a from public.daily_challenge_attempts where user_id = uid and challenge_date = c.challenge_date;
    return jsonb_build_object('status', 'existing', 'attempt', public.daily_attempt_json(a));
  end if;
  return jsonb_build_object('status', 'recorded', 'attempt', public.daily_attempt_json(a));
end;
$$;

-- Practice: grade an answer without recording anything. Only for a challenge whose day has passed, or that the
-- caller has already answered officially — so practice can never reveal today's key before the official answer.
create or replace function public.check_daily_practice(request jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  c public.daily_challenges;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into c from public.daily_challenges
    where id = request ->> 'challengeId' and status = 'published' and challenge_date <= public.daily_challenge_today();
  if c.id is null then
    raise exception 'daily:not_found' using errcode = 'P0001';
  end if;
  if c.challenge_date = public.daily_challenge_today()
      and not exists (select 1 from public.daily_challenge_attempts a where a.user_id = uid and a.challenge_id = c.id) then
    raise exception 'daily:locked' using errcode = 'P0001';
  end if;
  if (request ->> 'version') is null or (request ->> 'version')::integer <> c.version then
    raise exception 'daily:stale' using errcode = 'P0001';
  end if;
  return content_admin.daily_evaluate(c, request -> 'answer');
end;
$$;

-- Review: the model answer, explanation and takeaway, under the same rule as practice.
create or replace function public.get_daily_reveal(request jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  c public.daily_challenges;
  k public.daily_challenge_keys;
  s public.content_scenarios;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into c from public.daily_challenges
    where id = request ->> 'challengeId' and status = 'published' and challenge_date <= public.daily_challenge_today();
  if c.id is null then
    raise exception 'daily:not_found' using errcode = 'P0001';
  end if;
  if c.challenge_date = public.daily_challenge_today()
      and not exists (select 1 from public.daily_challenge_attempts a where a.user_id = uid and a.challenge_id = c.id) then
    raise exception 'daily:locked' using errcode = 'P0001';
  end if;
  select * into k from public.daily_challenge_keys where challenge_id = c.id;
  if c.interaction = 'scenario' then
    select * into s from public.content_scenarios where id = c.config ->> 'scenario' and version = (c.config ->> 'version')::integer;
  end if;
  return jsonb_build_object(
    'challengeId', c.id,
    'version', c.version,
    'modelAnswer', coalesce(k.model_answer, s.model_answer),
    'explanation', to_jsonb(coalesce(k.explanation, s.explain)),
    'takeaway', coalesce(k.takeaway, s.takeaway)
  );
end;
$$;

revoke all on function public.daily_attempt_json(public.daily_challenge_attempts) from public;
revoke all on function public.get_daily_challenges(jsonb) from public;
revoke all on function public.submit_daily_challenge(jsonb) from public;
revoke all on function public.check_daily_practice(jsonb) from public;
revoke all on function public.get_daily_reveal(jsonb) from public;
grant execute on function public.daily_attempt_json(public.daily_challenge_attempts) to authenticated;
grant execute on function public.get_daily_challenges(jsonb) to authenticated;
grant execute on function public.submit_daily_challenge(jsonb) to authenticated;
grant execute on function public.check_daily_practice(jsonb) to authenticated;
grant execute on function public.get_daily_reveal(jsonb) to authenticated;

-- ── Authoring (owner only) ───────────────────────────────────────────────────

-- Every problem with a challenge document, as readable messages. Empty means it can be published.
create or replace function content_admin.daily_problems(doc jsonb) returns setof text
language plpgsql stable set search_path = '' as $$
declare
  cfg jsonb := doc -> 'config';
  ev jsonb := doc -> 'key' -> 'evaluation';
  kind text := doc ->> 'interaction';
  basis text := coalesce(doc ->> 'basis', 'calculable');
  x jsonb;
  ids text[];
  n integer;
  matches integer := 0;
  lo numeric;
  hi numeric;
  st numeric;
  v numeric;
  s public.content_scenarios;
  verdicts constant text[] := array['match', 'defensible', 'misconception', 'depends', 'reasonable'];
begin
  if jsonb_typeof(doc) is distinct from 'object' then
    return next 'the document must be a JSON object';
    return;
  end if;
  for x in select to_jsonb(k) from jsonb_object_keys(doc) k
    where k not in ('id', 'date', 'version', 'status', 'title', 'intro', 'prompt', 'instructions', 'interaction', 'config',
      'askConfidence', 'difficulty', 'skill', 'basis', 'lesson', 'key') loop
    return next format('unknown field %s', x #>> '{}');
  end loop;
  if coalesce(doc ->> 'id', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(doc ->> 'id') > 80 then
    return next 'id must be lowercase words joined by hyphens (at most 80 characters)';
  end if;
  if coalesce(doc ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return next 'date must be YYYY-MM-DD';
  else
    begin
      perform (doc ->> 'date')::date;
    exception when others then
      return next 'date is not a real calendar date';
    end;
  end if;
  if (case when jsonb_typeof(doc -> 'version') = 'number' then (doc ->> 'version')::numeric <> trunc((doc ->> 'version')::numeric) or (doc ->> 'version')::numeric < 1 else true end) then
    return next 'version must be a whole number ≥ 1';
  end if;
  if coalesce(doc ->> 'status', 'published') not in ('published', 'draft') then
    return next 'status must be published or draft';
  end if;
  if coalesce(length(doc ->> 'title'), 0) not between 1 and 120 then return next 'title is required (at most 120 characters)'; end if;
  if coalesce(length(doc ->> 'intro'), 0) not between 1 and 800 then return next 'intro is required (at most 800 characters)'; end if;
  if coalesce(length(doc ->> 'prompt'), 0) not between 1 and 1500 then return next 'prompt is required (at most 1500 characters)'; end if;
  if doc ? 'instructions' and coalesce(length(doc ->> 'instructions'), 0) not between 1 and 400 then return next 'instructions must be 1–400 characters when given'; end if;
  if doc ? 'askConfidence' and jsonb_typeof(doc -> 'askConfidence') is distinct from 'boolean' then return next 'askConfidence must be true or false'; end if;
  if doc ? 'difficulty' and coalesce(doc ->> 'difficulty', '') not in ('1', '2', '3') then return next 'difficulty must be 1, 2 or 3'; end if;
  if basis not in ('calculable', 'uncertain') then return next 'basis must be calculable or uncertain'; end if;
  if doc ? 'skill' and not exists (select 1 from public.content_skills k where k.id = doc ->> 'skill') then
    return next format('skill %s does not exist', doc ->> 'skill');
  end if;
  if doc ? 'lesson' and not exists (select 1 from public.content_lessons l where l.id = doc ->> 'lesson') then
    return next format('lesson %s does not exist', doc ->> 'lesson');
  end if;
  if jsonb_typeof(cfg) is distinct from 'object' then
    return next 'config must be an object';
    return;
  end if;
  if jsonb_typeof(doc -> 'key') is distinct from 'object' then
    return next 'key must be an object';
    return;
  end if;
  if kind in ('choice', 'number') then
    if coalesce(length(doc -> 'key' ->> 'modelAnswer'), 0) not between 1 and 300 then return next 'key.modelAnswer is required (at most 300 characters)'; end if;
    if jsonb_typeof(doc -> 'key' -> 'explanation') is distinct from 'array' or jsonb_array_length(doc -> 'key' -> 'explanation') = 0 then
      return next 'key.explanation must be a non-empty array of paragraphs';
    end if;
    if coalesce(length(doc -> 'key' ->> 'takeaway'), 0) not between 1 and 600 then return next 'key.takeaway is required (at most 600 characters)'; end if;
  end if;

  if kind = 'choice' then
    for x in select to_jsonb(k) from jsonb_object_keys(cfg) k where k <> 'options' loop
      return next format('config: unknown field %s', x #>> '{}');
    end loop;
    if jsonb_typeof(cfg -> 'options') is distinct from 'array' or jsonb_array_length(cfg -> 'options') not between 2 and 6 then
      return next 'config.options must list 2 to 6 options';
      return;
    end if;
    select array_agg(o ->> 'id') into ids from jsonb_array_elements(cfg -> 'options') o;
    if exists (select 1 from jsonb_array_elements(cfg -> 'options') o
        where coalesce(o ->> 'id', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(o ->> 'id') > 40 or coalesce(length(o ->> 'label'), 0) not between 1 and 300
          or exists (select 1 from jsonb_object_keys(o) k where k not in ('id', 'label'))) then
      return next 'every option needs an id (lowercase-hyphenated, at most 40 characters) and a label (1–300 characters), nothing else';
    end if;
    if (select count(distinct i) from unnest(ids) i) <> cardinality(ids) then return next 'option ids must be unique'; end if;
    if jsonb_typeof(ev -> 'options') is distinct from 'object' then
      return next 'key.evaluation.options must map every option id to {verdict, feedback}';
      return;
    end if;
    if (select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(ev -> 'options') k) <> (select coalesce(array_agg(i order by i), '{}') from unnest(ids) i) then
      return next 'key.evaluation.options must have exactly one entry per option id';
    end if;
    for x in select value from jsonb_each(ev -> 'options') loop
      if coalesce(x ->> 'verdict', '') <> all (verdicts) then return next format('verdict must be one of %s', array_to_string(verdicts, ', ')); end if;
      if coalesce(length(x ->> 'feedback'), 0) not between 1 and 800 then return next 'every option needs feedback (1–800 characters)'; end if;
      if x ->> 'verdict' = 'match' then matches := matches + 1; end if;
    end loop;
    if basis = 'calculable' and matches = 0 then return next 'a calculable challenge needs at least one option with verdict match'; end if;
    if basis = 'uncertain' and matches > 0 then return next 'an uncertain challenge can''t mark an option as match (use reasonable)'; end if;

  elsif kind = 'number' then
    for x in select to_jsonb(k) from jsonb_object_keys(cfg) k where k not in ('min', 'max', 'step', 'initial', 'unit', 'minLabel', 'maxLabel') loop
      return next format('config: unknown field %s', x #>> '{}');
    end loop;
    if exists (select 1 from unnest(array['min', 'max', 'step', 'initial']) f where jsonb_typeof(cfg -> f) is distinct from 'number') then
      return next 'config needs numeric min, max, step and initial';
      return;
    end if;
    lo := (cfg ->> 'min')::numeric; hi := (cfg ->> 'max')::numeric; st := (cfg ->> 'step')::numeric; v := (cfg ->> 'initial')::numeric;
    if st <= 0 or hi <= lo then return next 'config needs min < max and step > 0'; return; end if;
    if mod(hi - lo, st) <> 0 then return next 'max must be min plus a whole number of steps'; end if;
    if (hi - lo) / st > 1000 then return next 'at most 1000 steps'; return; end if;
    if v < lo or v > hi or mod(v - lo, st) <> 0 then return next 'initial must be on the slider (between min and max, on a step)'; end if;
    if cfg ? 'unit' and coalesce(length(cfg ->> 'unit'), 0) not between 1 and 12 then return next 'unit must be 1–12 characters'; end if;
    if jsonb_typeof(ev -> 'bands') is distinct from 'array' or jsonb_array_length(ev -> 'bands') = 0 then
      return next 'key.evaluation.bands must list {min, max, verdict, feedback} ranges';
      return;
    end if;
    for x in select value from jsonb_array_elements(ev -> 'bands') loop
      if (case when jsonb_typeof(x -> 'min') = 'number' and jsonb_typeof(x -> 'max') = 'number' then (x ->> 'min')::numeric > (x ->> 'max')::numeric else true end) then
        return next 'every band needs numeric min ≤ max';
        return;
      end if;
      if coalesce(x ->> 'verdict', '') <> all (verdicts) then return next format('verdict must be one of %s', array_to_string(verdicts, ', ')); end if;
      if coalesce(length(x ->> 'feedback'), 0) not between 1 and 800 then return next 'every band needs feedback (1–800 characters)'; end if;
      if x ->> 'verdict' = 'match' then matches := matches + 1; end if;
    end loop;
    -- Every value the slider can produce must be graded.
    for n in 0 .. ((hi - lo) / st)::integer loop
      v := lo + n * st;
      if not exists (select 1 from jsonb_array_elements(ev -> 'bands') b where v between (b ->> 'min')::numeric and (b ->> 'max')::numeric) then
        return next format('no band covers the value %s', v);
        exit;
      end if;
    end loop;
    if basis = 'calculable' and matches = 0 then return next 'a calculable challenge needs at least one band with verdict match'; end if;
    if basis = 'uncertain' and matches > 0 then return next 'an uncertain challenge can''t mark a band as match (use reasonable)'; end if;

  elsif kind = 'scenario' then
    for x in select to_jsonb(k) from jsonb_object_keys(cfg) k where k not in ('scenario', 'version') loop
      return next format('config: unknown field %s', x #>> '{}');
    end loop;
    select * into s from public.content_scenarios where id = cfg ->> 'scenario' and status = 'published';
    if s.id is null then
      return next format('config.scenario %s is not a published scenario', coalesce(cfg ->> 'scenario', '(missing)'));
    elsif (case when jsonb_typeof(cfg -> 'version') = 'number' then (cfg ->> 'version')::numeric <> s.version else true end) then
      return next format('config.version must be %s, the scenario''s current version', s.version);
    else
      -- A scenario's grading is its public prediction options: its skill and basis are the scenario's own.
      if doc ? 'skill' and doc ->> 'skill' <> s.skill_id then return next format('skill must be %s (the scenario''s skill) or omitted', s.skill_id); end if;
      if doc ? 'basis' and doc ->> 'basis' <> s.prediction_basis then return next format('basis must be %s (the scenario''s) or omitted', s.prediction_basis); end if;
    end if;
    if ev is not null and ev <> '{}'::jsonb then return next 'scenario challenges are graded by the scenario''s own options: leave key.evaluation empty'; end if;

  else
    return next format('interaction must be choice, number or scenario (got %s)', coalesce(kind, 'nothing'));
  end if;
end;
$$;

-- Publish (or schedule, with "status": "draft") one challenge from a single JSON document — the statement to paste
-- in the SQL editor. One transaction: the public row and its private key land together or not at all.
--   new id                               → inserted
--   same id, same content                → unchanged (safe to re-run)
--   same id, changed, higher version     → updated (the old state stays in daily_challenge_history; attempts keep
--                                          the result they were graded with)
--   same id, changed, same/lower version → refused
--   another challenge already published on that date → refused (unpublish it first; nothing is replaced silently)
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
  other text;
  incoming jsonb;
  existing jsonb;
begin
  select string_agg(p, E'\n') into problems from content_admin.daily_problems(doc) p;
  if problems is not null then
    raise exception E'daily challenge not published:\n%', problems;
  end if;
  d := (doc ->> 'date')::date;
  st := coalesce(doc ->> 'status', 'published')::public.content_status;
  if doc ->> 'interaction' = 'scenario' then
    select * into s from public.content_scenarios where content_scenarios.id = doc -> 'config' ->> 'scenario';
  end if;

  if st = 'published' then
    select c.id into other from public.daily_challenges c
      where c.challenge_date = d and c.status = 'published' and c.id <> doc ->> 'id';
    if other is not null then
      raise exception 'daily challenge not published: % is already published for %. Unpublish it first (update public.daily_challenges set status = ''draft'' where id = ''%'').', other, d, other;
    end if;
  end if;

  -- The row exactly as it will be stored, for comparison with what is there.
  incoming := jsonb_build_object(
    'challenge_date', d, 'status', st, 'title', doc ->> 'title', 'intro', doc ->> 'intro', 'prompt', doc ->> 'prompt',
    'instructions', doc ->> 'instructions', 'interaction', doc ->> 'interaction', 'config', doc -> 'config',
    'ask_confidence', coalesce((doc ->> 'askConfidence')::boolean, true), 'difficulty', coalesce((doc ->> 'difficulty')::smallint, 2),
    'skill_id', coalesce(doc ->> 'skill', s.skill_id), 'basis', coalesce(doc ->> 'basis', s.prediction_basis, 'calculable'),
    'lesson_id', coalesce(doc ->> 'lesson', s.lesson_id),
    'evaluation', coalesce(doc -> 'key' -> 'evaluation', '{}'::jsonb), 'model_answer', doc -> 'key' ->> 'modelAnswer',
    'explanation', doc -> 'key' -> 'explanation', 'takeaway', doc -> 'key' ->> 'takeaway');

  select * into cur from public.daily_challenges c where c.id = doc ->> 'id' for update;
  if cur.id is null then
    insert into public.daily_challenges (id, challenge_date, version, status, title, intro, prompt, instructions, interaction, config,
      ask_confidence, difficulty, skill_id, basis, lesson_id)
    values (doc ->> 'id', d, (doc ->> 'version')::integer, st, incoming ->> 'title', incoming ->> 'intro', incoming ->> 'prompt',
      incoming ->> 'instructions', incoming ->> 'interaction', incoming -> 'config', (incoming ->> 'ask_confidence')::boolean,
      (incoming ->> 'difficulty')::smallint, incoming ->> 'skill_id', incoming ->> 'basis', incoming ->> 'lesson_id');
    insert into public.daily_challenge_keys (challenge_id, version, evaluation, model_answer, explanation, takeaway)
    values (doc ->> 'id', (doc ->> 'version')::integer, incoming -> 'evaluation', incoming ->> 'model_answer',
      case when jsonb_typeof(incoming -> 'explanation') = 'array' then content_admin.text_array(incoming -> 'explanation') end, incoming ->> 'takeaway');
    action := 'inserted';
  else
    select jsonb_build_object(
      'challenge_date', c.challenge_date, 'status', c.status, 'title', c.title, 'intro', c.intro, 'prompt', c.prompt,
      'instructions', c.instructions, 'interaction', c.interaction, 'config', c.config, 'ask_confidence', c.ask_confidence,
      'difficulty', c.difficulty, 'skill_id', c.skill_id, 'basis', c.basis, 'lesson_id', c.lesson_id,
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
        lesson_id = incoming ->> 'lesson_id'
      where c.id = cur.id;
      insert into public.daily_challenge_keys as k (challenge_id, version, evaluation, model_answer, explanation, takeaway)
      values (cur.id, (doc ->> 'version')::integer, incoming -> 'evaluation', incoming ->> 'model_answer',
        case when jsonb_typeof(incoming -> 'explanation') = 'array' then content_admin.text_array(incoming -> 'explanation') end, incoming ->> 'takeaway')
      on conflict (challenge_id) do update set version = excluded.version, evaluation = excluded.evaluation,
        model_answer = excluded.model_answer, explanation = excluded.explanation, takeaway = excluded.takeaway;
      action := 'updated';
    end if;
  end if;

  select c.id, c.challenge_date, c.version, c.status into id, challenge_date, version, status
    from public.daily_challenges c where c.id = doc ->> 'id';
  return next;
end;
$$;
revoke all on function content_admin.daily_problems(jsonb) from public, anon, authenticated;
revoke all on function content_admin.publish_daily_challenge(jsonb) from public, anon, authenticated;

-- Published challenges that this database can no longer grade or render as written (e.g. a referenced scenario
-- moved to a new version). Expect no rows.
create or replace function content_admin.validate_daily_challenges() returns table (id text, challenge_date date, problem text)
language sql stable set search_path = '' as $$
  select c.id, c.challenge_date, 'its scenario ' || (c.config ->> 'scenario') || ' version ' || (c.config ->> 'version') || ' is not published'
  from public.daily_challenges c
  where c.status = 'published' and c.interaction = 'scenario'
    and not exists (select 1 from public.content_scenarios s where s.id = c.config ->> 'scenario' and s.version = (c.config ->> 'version')::integer and s.status = 'published')
  union all
  select c.id, c.challenge_date, 'it has no answer key'
  from public.daily_challenges c
  where c.status = 'published' and c.interaction <> 'scenario' and not exists (select 1 from public.daily_challenge_keys k where k.challenge_id = c.id)
  order by 2, 1;
$$;
revoke all on function content_admin.validate_daily_challenges() from public, anon, authenticated;
