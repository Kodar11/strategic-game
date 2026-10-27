-- Learner progress: one row set per Supabase Auth user (the app signs in anonymously; see docs/DATA_ARCHITECTURE.md).
--
-- The app keeps its existing pure rules (src/features/*) as the reference for what a valid state is: it validates
-- everything it loads with the same sanitizers it always used. The database adds what only a shared store can:
-- ownership, uniqueness and atomic writes.
--
-- Semantics carried over from the app:
-- - learning_attempts is append-only. Its id is `<item>@<lockedAt>`, the first record for an id wins, and `attempt`
--   is fixed when recorded. There is no UPDATE grant; a reset is the only delete.
-- - Completed lessons and finished scenarios only ever grow (except a reset); their order is kept with `seq`.
-- - Lesson runtime, scenario runs, challenge drafts and assessment runs are the learner's current in-progress state,
--   written by a single device and replaced as a whole. An assessment's first score can never be overwritten.

create sequence public.progress_seq;

create table public.learner_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goal text references public.content_goals (id) on delete set null,
  -- Incremented by every progress reset, so a device can tell its cached view is out of date.
  reset_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null references public.content_lessons (id) on delete restrict,
  completed_at timestamptz,
  completed_seq bigint,
  -- In-progress position {step, total, data, updatedAt}; null once completed or never started.
  runtime jsonb check (runtime is null or (jsonb_typeof(runtime) = 'object' and jsonb_typeof(runtime -> 'step') = 'number'
    and jsonb_typeof(runtime -> 'total') = 'number' and octet_length(runtime::text) <= 65536)),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id),
  check ((completed_at is null) = (completed_seq is null))
);

create table public.scenario_runs (
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario_id text not null references public.content_scenarios (id) on delete restrict,
  -- {prediction, inputs, seed, version}: replayed through the scenario's engine on load.
  run jsonb not null check (jsonb_typeof(run) = 'object' and octet_length(run::text) <= 16384),
  version integer generated always as ((run ->> 'version')::integer) stored,
  updated_at timestamptz not null default now(),
  primary key (user_id, scenario_id)
);

create table public.scenario_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario_id text not null references public.content_scenarios (id) on delete restrict,
  seq bigint not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, scenario_id)
);

create table public.challenge_drafts (
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_id text not null references public.content_challenges (id) on delete restrict,
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 4096),
  updated_at timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

create table public.assessment_runs (
  user_id uuid not null references auth.users (id) on delete cascade,
  assessment_id text not null references public.content_assessments (id) on delete restrict,
  run jsonb not null check (jsonb_typeof(run) = 'object' and octet_length(run::text) <= 32768),
  version integer generated always as ((run ->> 'version')::integer) stored,
  attempts integer generated always as ((run ->> 'attempts')::integer) stored,
  first_score numeric generated always as ((run ->> 'firstScore')::numeric) stored,
  best_score numeric generated always as ((run ->> 'bestScore')::numeric) stored,
  last_score numeric generated always as ((run ->> 'lastScore')::numeric) stored,
  updated_at timestamptz not null default now(),
  primary key (user_id, assessment_id)
);

create table public.learning_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (length(id) between 1 and 80),
  kind text not null check (kind in ('lesson', 'challenge', 'scenario')),
  lesson_id text not null references public.content_lessons (id) on delete restrict,
  item_id text not null check (length(item_id) between 1 and 80),
  skill_id text not null check (skill_id in ('anticipating', 'incentives', 'coordination', 'uncertainty')),
  basis text not null check (basis in ('calculable', 'uncertain')),
  answer text not null check (length(answer) between 1 and 40),
  confidence smallint not null check (confidence between 1 and 5),
  evaluation text not null check (evaluation in ('correct', 'partial', 'reasonable-miss', 'reasonable', 'misconception')),
  outcome text not null check (length(outcome) <= 200),
  locked_at bigint not null check (locked_at >= 0),
  attempt integer not null check (attempt > 0),
  lesson_completed boolean,
  content_version integer check (content_version is null or content_version > 0),
  schema_version integer not null check (schema_version > 0),
  recorded_at timestamptz not null default now(),
  primary key (user_id, id),
  -- The record's identity is its item and lock time, exactly as the app builds it.
  check (id = item_id || '@' || locked_at::text),
  unique (user_id, item_id, attempt)
);
create index learning_attempts_user_locked_idx on public.learning_attempts (user_id, locked_at);

-- ── Integrity triggers ───────────────────────────────────────────────────────

create or replace function public.keep_first_assessment_score() returns trigger
language plpgsql as $$
begin
  if old.run -> 'firstScore' is not null and old.run -> 'firstScore' <> 'null'::jsonb then
    new.run := jsonb_set(new.run, '{firstScore}', old.run -> 'firstScore');
  end if;
  return new;
end;
$$;
create trigger assessment_runs_keep_first_score before update on public.assessment_runs
  for each row execute function public.keep_first_assessment_score();

do $$
declare t text;
begin
  foreach t in array array['learner_profiles', 'lesson_progress', 'scenario_runs', 'challenge_drafts', 'assessment_runs']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end;
$$;

-- ── Row level security: every row belongs to auth.uid() ──────────────────────

do $$
declare t text;
begin
  foreach t in array array['learner_profiles', 'lesson_progress', 'scenario_runs', 'scenario_completions', 'challenge_drafts', 'assessment_runs', 'learning_attempts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
  -- Replaceable in-progress state may be updated by its owner. Attempts and completions may not.
  foreach t in array array['learner_profiles', 'lesson_progress', 'scenario_runs', 'challenge_drafts', 'assessment_runs']
  loop
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  grant select, insert, delete on public.scenario_completions to authenticated;
  grant select, insert, delete on public.learning_attempts to authenticated;
end;
$$;
grant usage on sequence public.progress_seq to authenticated;

-- ── Reading and writing progress ─────────────────────────────────────────────
--
-- get_my_progress returns the learner's state in the shape the app's store has always persisted, so loading goes
-- through the store's existing sanitizers unchanged.
--
-- apply_progress_changes applies one batch of changes in one transaction: everything one app action changed (a
-- finished scenario's run, its completion and its learning record) lands together or not at all. Every write is
-- idempotent — attempts and completions are insert-if-absent, in-progress state is replaced — so a retried batch
-- never duplicates anything. Both are SECURITY INVOKER: row level security scopes every statement to the caller.
-- Rows that reference content the database doesn't have are skipped and counted rather than failing the batch.

create or replace function public.get_my_progress() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'completed', coalesce((select jsonb_agg(lesson_id order by completed_seq) from public.lesson_progress where user_id = (select auth.uid()) and completed_at is not null), '[]'::jsonb),
    'runtime', coalesce((select jsonb_object_agg(lesson_id, runtime) from public.lesson_progress where user_id = (select auth.uid()) and runtime is not null), '{}'::jsonb),
    'learning', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'schemaVersion', schema_version, 'kind', kind, 'lesson', lesson_id, 'prediction', item_id, 'skill', skill_id, 'basis', basis,
        'answer', answer, 'confidence', confidence, 'evaluation', evaluation, 'outcome', outcome, 'lockedAt', locked_at, 'attempt', attempt,
        'lessonCompleted', lesson_completed, 'contentVersion', content_version) order by locked_at, attempt)
      from public.learning_attempts where user_id = (select auth.uid())), '[]'::jsonb),
    'goal', (select goal from public.learner_profiles where user_id = (select auth.uid())),
    'challengeDrafts', coalesce((select jsonb_object_agg(challenge_id, draft) from public.challenge_drafts where user_id = (select auth.uid())), '{}'::jsonb),
    'scenarioRuns', coalesce((select jsonb_object_agg(scenario_id, run) from public.scenario_runs where user_id = (select auth.uid())), '{}'::jsonb),
    'scenarioDone', coalesce((select jsonb_agg(scenario_id order by seq) from public.scenario_completions where user_id = (select auth.uid())), '[]'::jsonb),
    'assessmentRuns', coalesce((select jsonb_object_agg(assessment_id, run) from public.assessment_runs where user_id = (select auth.uid())), '{}'::jsonb)
  );
$$;

create or replace function public.apply_progress_changes(changes jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  skipped integer := 0;
  n integer;
  base bigint;
  x jsonb;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if jsonb_typeof(changes) is distinct from 'object' then
    raise exception 'changes must be an object' using errcode = '22023';
  end if;

  insert into public.learner_profiles (user_id) values (uid) on conflict (user_id) do nothing;

  -- A reset clears every progress record (the goal is a preference and stays), then the rest of the batch applies.
  if coalesce((changes ->> 'reset')::boolean, false) then
    delete from public.learning_attempts where user_id = uid;
    delete from public.lesson_progress where user_id = uid;
    delete from public.scenario_runs where user_id = uid;
    delete from public.scenario_completions where user_id = uid;
    delete from public.challenge_drafts where user_id = uid;
    delete from public.assessment_runs where user_id = uid;
    update public.learner_profiles set reset_count = reset_count + 1 where user_id = uid;
  end if;

  if changes ? 'goal' then
    update public.learner_profiles
      set goal = (select g.id from public.content_goals g where g.id = changes -> 'goal' ->> 'value')
      where user_id = uid;
  end if;

  -- Learning records: insert if absent. The first record for an id wins, as in the app.
  for x in select * from jsonb_array_elements(coalesce(changes -> 'attempts', '[]'::jsonb)) loop
    if not exists (select 1 from public.content_lessons where id = x ->> 'lesson') then
      skipped := skipped + 1;
      continue;
    end if;
    insert into public.learning_attempts (user_id, id, kind, lesson_id, item_id, skill_id, basis, answer, confidence, evaluation, outcome,
      locked_at, attempt, lesson_completed, content_version, schema_version)
    values (uid, x ->> 'id', x ->> 'kind', x ->> 'lesson', x ->> 'prediction', x ->> 'skill', x ->> 'basis', x ->> 'answer',
      (x ->> 'confidence')::smallint, x ->> 'evaluation', x ->> 'outcome', (x ->> 'lockedAt')::bigint, (x ->> 'attempt')::integer,
      (x ->> 'lessonCompleted')::boolean, (x ->> 'contentVersion')::integer, (x ->> 'schemaVersion')::integer)
    on conflict do nothing;
  end loop;

  -- Completed lessons: grow-only; the first completion's time and order are kept. Order within a batch follows the
  -- array, after every earlier batch (`base` comes from a sequence).
  base := nextval('public.progress_seq') * 1000;
  insert into public.lesson_progress as lp (user_id, lesson_id, completed_at, completed_seq)
  select uid, l.id, now(), base + e.ord
  from jsonb_array_elements_text(coalesce(changes -> 'lessonsCompleted', '[]'::jsonb)) with ordinality as e(lesson_id, ord)
  join public.content_lessons l on l.id = e.lesson_id
  on conflict (user_id, lesson_id) do update
    set completed_at = coalesce(lp.completed_at, excluded.completed_at),
        completed_seq = coalesce(lp.completed_seq, excluded.completed_seq);
  get diagnostics n = row_count;
  skipped := skipped + jsonb_array_length(coalesce(changes -> 'lessonsCompleted', '[]'::jsonb)) - n;

  -- In-progress state is replaced as a whole; when a key appears twice in one batch, the later entry wins.
  insert into public.lesson_progress as lp (user_id, lesson_id, runtime)
  select distinct on (l.id) uid, l.id, e.value -> 'runtime'
  from jsonb_array_elements(coalesce(changes -> 'runtimeUpsert', '[]'::jsonb)) with ordinality as e(value, ord)
  join public.content_lessons l on l.id = e.value ->> 'lesson'
  order by l.id, e.ord desc
  on conflict (user_id, lesson_id) do update set runtime = excluded.runtime;

  update public.lesson_progress set runtime = null
  where user_id = uid and lesson_id in (select jsonb_array_elements_text(coalesce(changes -> 'runtimeDelete', '[]'::jsonb)));

  insert into public.scenario_runs (user_id, scenario_id, run)
  select distinct on (s.id) uid, s.id, e.value -> 'run'
  from jsonb_array_elements(coalesce(changes -> 'scenarioRuns', '[]'::jsonb)) with ordinality as e(value, ord)
  join public.content_scenarios s on s.id = e.value ->> 'scenario'
  order by s.id, e.ord desc
  on conflict (user_id, scenario_id) do update set run = excluded.run;

  insert into public.scenario_completions (user_id, scenario_id, seq)
  select uid, s.id, base + e.ord
  from jsonb_array_elements_text(coalesce(changes -> 'scenariosDone', '[]'::jsonb)) with ordinality as e(scenario_id, ord)
  join public.content_scenarios s on s.id = e.scenario_id
  on conflict do nothing;

  insert into public.challenge_drafts (user_id, challenge_id, draft)
  select distinct on (c.id) uid, c.id, e.value -> 'draft'
  from jsonb_array_elements(coalesce(changes -> 'challengeDrafts', '[]'::jsonb)) with ordinality as e(value, ord)
  join public.content_challenges c on c.id = e.value ->> 'challenge'
  order by c.id, e.ord desc
  on conflict (user_id, challenge_id) do update set draft = excluded.draft;

  insert into public.assessment_runs (user_id, assessment_id, run)
  select distinct on (a.id) uid, a.id, e.value -> 'run'
  from jsonb_array_elements(coalesce(changes -> 'assessmentRuns', '[]'::jsonb)) with ordinality as e(value, ord)
  join public.content_assessments a on a.id = e.value ->> 'assessment'
  order by a.id, e.ord desc
  on conflict (user_id, assessment_id) do update set run = excluded.run;

  return jsonb_build_object('ok', true, 'skipped', skipped);
end;
$$;

revoke all on function public.get_my_progress() from public;
revoke all on function public.apply_progress_changes(jsonb) from public;
grant execute on function public.get_my_progress() to authenticated;
grant execute on function public.apply_progress_changes(jsonb) to authenticated;
