-- Content catalog: every lesson, scenario, challenge and assessment as typed rows.
--
-- Ids are the app's stable ids (they appear in saved progress and exported learning data) and are never reused.
-- `status` publishes or hides a row; `revision` counts content edits and decides whether a re-run of the seed may
-- update a row (see content_admin.import_content). `version` on scenarios, challenges and assessments is the
-- *semantic* version recorded with every attempt: bump it only when a change alters meaning (for scenarios it must
-- match the engine registered in the app).
--
-- Clients only read published rows. Nobody but the database owner (SQL editor, service role) can write content.

create type public.content_status as enum ('draft', 'published');

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Modules and lessons ──────────────────────────────────────────────────────

create table public.content_modules (
  id text primary key check (id ~ '^m[1-9]$'),
  position integer not null unique check (position >= 0),
  number integer not null unique check (number > 0),
  title text not null,
  objective text not null,
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

create table public.content_lessons (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  module_id text not null references public.content_modules (id) on update cascade on delete restrict,
  position integer not null unique check (position >= 0),
  number integer not null unique check (number > 0),
  title text not null,
  concept text not null,
  description text not null,
  minutes integer not null check (minutes > 0),
  scene text not null check (scene in ('market', 'crowd', 'meetup', 'shootout', 'policy')),
  accent text not null check (accent in ('blue', 'orange', 'cyan', 'amber')),
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create index content_lessons_module_idx on public.content_lessons (module_id);

create table public.content_skills (
  id text primary key check (id in ('anticipating', 'incentives', 'coordination', 'uncertainty')),
  position integer not null unique check (position >= 0),
  label text not null,
  description text not null,
  lesson_id text not null references public.content_lessons (id) on delete restrict,
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

create table public.content_goals (
  id text primary key check (id in ('anticipating', 'incentives', 'coordination', 'uncertainty', 'none')),
  position integer not null unique check (position >= 0),
  label text not null,
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

-- The predictions asked inside the five original lessons (e.g. `l1.rival`). The lessons themselves are registered
-- components in the app; this table holds what the learning record and profile say about each prediction.
create table public.content_lesson_predictions (
  id text primary key,
  position integer not null unique check (position >= 0),
  lesson_id text not null references public.content_lessons (id) on delete restrict,
  skill_id text not null references public.content_skills (id) on delete restrict,
  basis text not null check (basis in ('calculable', 'uncertain')),
  question text not null,
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create index content_lesson_predictions_lesson_idx on public.content_lesson_predictions (lesson_id);

-- Lesson material for the curriculum runner: intro, objectives, concept panels, transfer question, completion.
-- One validated document per lesson (the app checks it with the same schema as the seed).
create table public.content_curriculum_specs (
  lesson_id text primary key references public.content_lessons (id) on delete cascade,
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

-- The interactive lab of each curriculum lesson. `param` labs name a calculation registered in the app.
create table public.content_labs (
  lesson_id text primary key references public.content_lessons (id) on delete cascade,
  kind text not null check (kind in ('matrix', 'tree', 'param', 'reveal')),
  spec jsonb not null check (jsonb_typeof(spec) = 'object' and spec ->> 'kind' = kind),
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

-- ── Paired scenarios ─────────────────────────────────────────────────────────

create table public.content_scenarios (
  id text primary key,
  lesson_id text not null references public.content_lessons (id) on delete restrict,
  slot text not null check (slot in ('A', 'B', 'C')),
  version integer not null check (version > 0),
  title text not null,
  purpose text not null,
  setup text not null,
  speaker jsonb check (speaker is null or jsonb_typeof(speaker) = 'object'),
  rules text[] not null check (cardinality(rules) > 0),
  formal jsonb not null check (jsonb_typeof(formal) = 'object'),
  -- Payoff tables and game trees shown to the learner. The app refuses a scenario whose matrix or tree differs from
  -- the one its engine plays, so the rules on screen are always the rules applied.
  visual jsonb check (visual is null or jsonb_typeof(visual) = 'object'),
  prediction_question text not null,
  prediction_basis text not null check (prediction_basis in ('calculable', 'uncertain')),
  model_answer text not null,
  explain text[] not null check (cardinality(explain) > 0),
  takeaway text not null,
  skill_id text not null references public.content_skills (id) on delete restrict,
  explore jsonb check (explore is null or jsonb_typeof(explore) in ('object', 'boolean')),
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  unique (lesson_id, slot)
);

create table public.content_scenario_options (
  scenario_id text not null references public.content_scenarios (id) on delete cascade,
  id text not null check (length(id) between 1 and 40),
  position integer not null check (position >= 0),
  label text not null,
  verdict text not null check (verdict in ('match', 'defensible', 'misconception', 'depends', 'reasonable')),
  feedback text not null,
  primary key (scenario_id, id),
  unique (scenario_id, position)
);

-- ── Practice challenges ──────────────────────────────────────────────────────

create table public.content_challenges (
  id text primary key,
  position integer not null unique check (position >= 0),
  lesson_id text not null references public.content_lessons (id) on delete restrict,
  sequence integer not null check (sequence between 1 and 3),
  version integer not null check (version > 0),
  level integer not null check (level between 1 and 3),
  title text not null,
  scenario text not null,
  question text not null,
  skill_id text not null references public.content_skills (id) on delete restrict,
  concept text not null,
  takeaway text not null,
  basis text not null check (basis in ('calculable', 'uncertain')),
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  unique (lesson_id, sequence)
);

create table public.content_challenge_options (
  challenge_id text not null references public.content_challenges (id) on delete cascade,
  id text not null check (length(id) between 1 and 40),
  position integer not null check (position >= 0),
  label text not null,
  verdict text not null check (verdict in ('match', 'defensible', 'misconception', 'depends', 'reasonable')),
  feedback text not null,
  primary key (challenge_id, id),
  unique (challenge_id, position)
);

create table public.content_concept_reviews (
  lesson_id text primary key references public.content_lessons (id) on delete cascade,
  concept text not null,
  summary text not null,
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

-- ── Assessments ──────────────────────────────────────────────────────────────

create table public.content_assessments (
  id text primary key check (id ~ '^(m[1-9]|final)$'),
  position integer not null unique check (position >= 0),
  version integer not null check (version > 0),
  title text not null,
  intro text not null,
  case_text text,
  pass_mark numeric(4, 3) not null check (pass_mark > 0 and pass_mark <= 1),
  reflection jsonb check (reflection is null or jsonb_typeof(reflection) = 'object'),
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

create table public.content_assessment_items (
  assessment_id text not null references public.content_assessments (id) on delete cascade,
  id text not null,
  position integer not null check (position >= 0),
  lesson_id text not null references public.content_lessons (id) on delete restrict,
  situation text,
  data_table jsonb check (data_table is null or jsonb_typeof(data_table) = 'object'),
  question text not null,
  multi boolean not null default false,
  explanation text not null,
  primary key (assessment_id, id),
  unique (assessment_id, position)
);
create index content_assessment_items_lesson_idx on public.content_assessment_items (lesson_id);

create table public.content_assessment_options (
  assessment_id text not null,
  item_id text not null,
  id text not null check (length(id) between 1 and 40),
  position integer not null check (position >= 0),
  label text not null,
  verdict text not null check (verdict in ('match', 'defensible', 'misconception', 'depends', 'reasonable')),
  feedback text not null,
  primary key (assessment_id, item_id, id),
  unique (assessment_id, item_id, position),
  foreign key (assessment_id, item_id) references public.content_assessment_items (assessment_id, id) on delete cascade
);

-- ── Housekeeping ─────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['content_modules', 'content_lessons', 'content_skills', 'content_goals', 'content_lesson_predictions',
    'content_curriculum_specs', 'content_labs', 'content_scenarios', 'content_challenges', 'content_concept_reviews', 'content_assessments']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end;
$$;

-- ── Access: published rows are readable by the app; nothing is writable by it ─

do $$
declare t text;
begin
  foreach t in array array['content_modules', 'content_lessons', 'content_skills', 'content_goals', 'content_lesson_predictions',
    'content_curriculum_specs', 'content_labs', 'content_scenarios', 'content_challenges', 'content_concept_reviews', 'content_assessments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (status = ''published'')', t || '_read_published', t);
  end loop;
end;
$$;

-- Child rows are visible exactly when their parent is.
alter table public.content_scenario_options enable row level security;
revoke all on public.content_scenario_options from anon, authenticated;
grant select on public.content_scenario_options to anon, authenticated;
create policy content_scenario_options_read_published on public.content_scenario_options for select to anon, authenticated
  using (exists (select 1 from public.content_scenarios p where p.id = scenario_id and p.status = 'published'));

alter table public.content_challenge_options enable row level security;
revoke all on public.content_challenge_options from anon, authenticated;
grant select on public.content_challenge_options to anon, authenticated;
create policy content_challenge_options_read_published on public.content_challenge_options for select to anon, authenticated
  using (exists (select 1 from public.content_challenges p where p.id = challenge_id and p.status = 'published'));

alter table public.content_assessment_items enable row level security;
revoke all on public.content_assessment_items from anon, authenticated;
grant select on public.content_assessment_items to anon, authenticated;
create policy content_assessment_items_read_published on public.content_assessment_items for select to anon, authenticated
  using (exists (select 1 from public.content_assessments p where p.id = assessment_id and p.status = 'published'));

alter table public.content_assessment_options enable row level security;
revoke all on public.content_assessment_options from anon, authenticated;
grant select on public.content_assessment_options to anon, authenticated;
create policy content_assessment_options_read_published on public.content_assessment_options for select to anon, authenticated
  using (exists (select 1 from public.content_assessments p where p.id = assessment_id and p.status = 'published'));

-- ── The published catalog as one document ────────────────────────────────────
--
-- One consistent snapshot in the app's content-document shape (src/content/schema.ts). SECURITY INVOKER, so row
-- level security applies: a caller sees exactly the published rows. A row is included only when everything it
-- belongs to is published too (a scenario of a draft lesson is left out), so the app never gets dangling references.

create or replace function public.get_published_content() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with
  m as (select * from public.content_modules where status = 'published'),
  l as (select l.* from public.content_lessons l join m on m.id = l.module_id where l.status = 'published'),
  s as (select s.* from public.content_scenarios s join l on l.id = s.lesson_id where s.status = 'published'),
  c as (select c.* from public.content_challenges c join l on l.id = c.lesson_id where c.status = 'published'),
  a as (select * from public.content_assessments where status = 'published')
  select jsonb_build_object(
    'format', 'strategic-game-content',
    'schemaVersion', 1,
    'modules', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'position', position, 'number', number, 'title', title, 'objective', objective, 'revision', revision) order by position) from m), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'position', position, 'number', number, 'module', module_id, 'title', title, 'concept', concept,
        'description', description, 'minutes', minutes, 'scene', scene, 'accent', accent, 'revision', revision) order by position) from l), '[]'::jsonb),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'position', k.position, 'label', k.label, 'description', k.description, 'lesson', k.lesson_id, 'revision', k.revision) order by k.position)
        from public.content_skills k join l on l.id = k.lesson_id where k.status = 'published'), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'position', position, 'label', label, 'revision', revision) order by position)
        from public.content_goals where status = 'published'), '[]'::jsonb),
    'lessonPredictions', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'position', p.position, 'lesson', p.lesson_id, 'skill', p.skill_id, 'basis', p.basis,
        'question', p.question, 'revision', p.revision) order by p.position)
        from public.content_lesson_predictions p join l on l.id = p.lesson_id where p.status = 'published'), '[]'::jsonb),
    'curriculumSpecs', coalesce((select jsonb_agg(jsonb_build_object('lesson', x.lesson_id, 'revision', x.revision, 'spec', x.spec) order by l.position)
        from public.content_curriculum_specs x join l on l.id = x.lesson_id where x.status = 'published'), '[]'::jsonb),
    'labs', coalesce((select jsonb_agg(jsonb_build_object('lesson', x.lesson_id, 'revision', x.revision, 'spec', x.spec) order by l.position)
        from public.content_labs x join l on l.id = x.lesson_id where x.status = 'published'), '[]'::jsonb),
    'scenarios', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', s.id, 'lesson', s.lesson_id, 'slot', s.slot, 'version', s.version, 'revision', s.revision, 'title', s.title, 'purpose', s.purpose,
          'setup', s.setup, 'speaker', s.speaker, 'rules', to_jsonb(s.rules), 'formal', s.formal, 'visual', s.visual,
          'predict', jsonb_build_object('question', s.prediction_question, 'basis', s.prediction_basis, 'modelAnswer', s.model_answer,
            'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'verdict', o.verdict, 'feedback', o.feedback) order by o.position)
              from public.content_scenario_options o where o.scenario_id = s.id)),
          'explain', to_jsonb(s.explain), 'takeaway', s.takeaway, 'skill', s.skill_id, 'explore', s.explore))
        order by l.position, s.slot) from s join l on l.id = s.lesson_id), '[]'::jsonb),
    'challenges', coalesce((select jsonb_agg(jsonb_build_object(
          'id', c.id, 'position', c.position, 'lesson', c.lesson_id, 'order', c.sequence, 'version', c.version, 'revision', c.revision, 'level', c.level,
          'title', c.title, 'scenario', c.scenario, 'question', c.question,
          'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'verdict', o.verdict, 'feedback', o.feedback) order by o.position)
            from public.content_challenge_options o where o.challenge_id = c.id),
          'skill', c.skill_id, 'concept', c.concept, 'takeaway', c.takeaway, 'basis', c.basis)
        order by c.position) from c), '[]'::jsonb),
    'conceptReviews', coalesce((select jsonb_agg(jsonb_build_object('lesson', r.lesson_id, 'concept', r.concept, 'summary', r.summary, 'revision', r.revision) order by l.position)
        from public.content_concept_reviews r join l on l.id = r.lesson_id where r.status = 'published'), '[]'::jsonb),
    'assessments', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', a.id, 'position', a.position, 'version', a.version, 'revision', a.revision, 'title', a.title, 'intro', a.intro, 'case', a.case_text,
          'passMark', a.pass_mark, 'reflection', a.reflection,
          'items', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'id', i.id, 'lesson', i.lesson_id, 'situation', i.situation, 'table', i.data_table, 'question', i.question,
                'multi', case when i.multi then true end, 'explanation', i.explanation,
                'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'verdict', o.verdict, 'feedback', o.feedback) order by o.position)
                  from public.content_assessment_options o where o.assessment_id = i.assessment_id and o.item_id = i.id)))
              order by i.position)
            from public.content_assessment_items i where i.assessment_id = a.id)))
        order by a.position) from a), '[]'::jsonb)
  );
$$;

revoke all on function public.get_published_content() from public;
grant execute on function public.get_published_content() to anon, authenticated;
