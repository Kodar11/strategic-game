-- Content administration: importing the repository seed and validating the catalog.
--
-- These functions live in the `content_admin` schema, which is not exposed through the Data API, and only the
-- database owner may run them (SQL editor, `psql`, or the Supabase CLI). The app never calls them.
--
-- Import policy, per top-level row (module, lesson, scenario, challenge, assessment, …):
--   - absent from the database            → inserted (published), with its options/items
--   - present, seed `revision` is higher  → updated, its options/items replaced
--   - present, same or lower revision     → left untouched
-- So re-running the seed never duplicates rows and never overwrites an edit made in the database. To ship a change
-- from the repository, raise that row's `revision` in supabase/seed/content.json. To edit in the database, change
-- the row and raise its `revision` there too (then `npm run content:pull` brings the edit back into the repository).

create schema if not exists content_admin;
revoke all on schema content_admin from public, anon, authenticated;

create or replace function content_admin.decide(current_revision integer, incoming jsonb) returns text
language sql immutable as $$
  select case
    when current_revision is null then 'inserted'
    when coalesce((incoming ->> 'revision')::integer, 1) > current_revision then 'updated'
    else 'unchanged'
  end;
$$;

create or replace function content_admin.text_array(j jsonb) returns text[]
language sql immutable as $$
  select coalesce(array(select jsonb_array_elements_text(j)), '{}'::text[]);
$$;

create or replace function content_admin.import_content(doc jsonb)
returns table (entity text, id text, action text)
language plpgsql set search_path = '' as $$
declare
  x jsonb;
  cur integer;
  act text;
begin
  if doc ->> 'format' is distinct from 'strategic-game-content' or (doc ->> 'schemaVersion')::integer is distinct from 1 then
    raise exception 'Not a strategic-game-content document of schema version 1';
  end if;

  for x in select * from jsonb_array_elements(doc -> 'modules') loop
    select m.revision into cur from public.content_modules m where m.id = x ->> 'id';
    act := content_admin.decide(cur, x);
    if act = 'inserted' then
      insert into public.content_modules (id, position, number, title, objective, revision)
      values (x ->> 'id', (x ->> 'position')::int, (x ->> 'number')::int, x ->> 'title', x ->> 'objective', (x ->> 'revision')::int);
    elsif act = 'updated' then
      update public.content_modules set position = (x ->> 'position')::int, number = (x ->> 'number')::int, title = x ->> 'title',
        objective = x ->> 'objective', revision = (x ->> 'revision')::int where content_modules.id = x ->> 'id';
    end if;
    entity := 'module'; id := x ->> 'id'; action := act; return next;
  end loop;

  for x in select * from jsonb_array_elements(doc -> 'lessons') loop
    select l.revision into cur from public.content_lessons l where l.id = x ->> 'id';
    act := content_admin.decide(cur, x);
    if act = 'inserted' then
      insert into public.content_lessons (id, module_id, position, number, title, concept, description, minutes, scene, accent, revision)
      values (x ->> 'id', x ->> 'module', (x ->> 'position')::int, (x ->> 'number')::int, x ->> 'title', x ->> 'concept', x ->> 'description',
        (x ->> 'minutes')::int, x ->> 'scene', x ->> 'accent', (x ->> 'revision')::int);
    elsif act = 'updated' then
      update public.content_lessons set module_id = x ->> 'module', position = (x ->> 'position')::int, number = (x ->> 'number')::int,
        title = x ->> 'title', concept = x ->> 'concept', description = x ->> 'description', minutes = (x ->> 'minutes')::int,
        scene = x ->> 'scene', accent = x ->> 'accent', revision = (x ->> 'revision')::int where content_lessons.id = x ->> 'id';
    end if;
    entity := 'lesson'; id := x ->> 'id'; action := act; return next;
  end loop;

  for x in select * from jsonb_array_elements(doc -> 'skills') loop
    select k.revision into cur from public.content_skills k where k.id = x ->> 'id';
    act := content_admin.decide(cur, x);
    if act = 'inserted' then
      insert into public.content_skills (id, position, label, description, lesson_id, revision)
      values (x ->> 'id', (x ->> 'position')::int, x ->> 'label', x ->> 'description', x ->> 'lesson', (x ->> 'revision')::int);
    elsif act = 'updated' then
      update public.content_skills set position = (x ->> 'position')::int, label = x ->> 'label', description = x ->> 'description',
        lesson_id = x ->> 'lesson', revision = (x ->> 'revision')::int where content_skills.id = x ->> 'id';
    end if;
    entity := 'skill'; id := x ->> 'id'; action := act; return next;
  end loop;

  for x in select * from jsonb_array_elements(doc -> 'goals') loop
    select g.revision into cur from public.content_goals g where g.id = x ->> 'id';
    act := content_admin.decide(cur, x);
    if act = 'inserted' then
      insert into public.content_goals (id, position, label, revision) values (x ->> 'id', (x ->> 'position')::int, x ->> 'label', (x ->> 'revision')::int);
    elsif act = 'updated' then
      update public.content_goals set position = (x ->> 'position')::int, label = x ->> 'label', revision = (x ->> 'revision')::int where content_goals.id = x ->> 'id';
    end if;
    entity := 'goal'; id := x ->> 'id'; action := act; return next;
  end loop;

  for x in select * from jsonb_array_elements(doc -> 'lessonPredictions') loop
    select p.revision into cur from public.content_lesson_predictions p where p.id = x ->> 'id';
    act := content_admin.decide(cur, x);
    if act = 'inserted' then
      insert into public.content_lesson_predictions (id, position, lesson_id, skill_id, basis, question, revision)
      values (x ->> 'id', (x ->> 'position')::int, x ->> 'lesson', x ->> 'skill', x ->> 'basis', x ->> 'question', (x ->> 'revision')::int);
    elsif act = 'updated' then
      update public.content_lesson_predictions set position = (x ->> 'position')::int, lesson_id = x ->> 'lesson', skill_id = x ->> 'skill',
        basis = x ->> 'basis', question = x ->> 'question', revision = (x ->> 'revision')::int where content_lesson_predictions.id = x ->> 'id';
    end if;
    entity := 'lesson-prediction'; id := x ->> 'id'; action := act; return next;
  end loop;

  for x in select * from jsonb_array_elements(doc -> 'curriculumSpecs') loop
    select c.revision into cur from public.content_curriculum_specs c where c.lesson_id = x ->> 'lesson';
    act := content_admin.decide(cur, x);
    if act = 'inserted' then
      insert into public.content_curriculum_specs (lesson_id, spec, revision) values (x ->> 'lesson', x -> 'spec', (x ->> 'revision')::int);
    elsif act = 'updated' then
      update public.content_curriculum_specs set spec = x -> 'spec', revision = (x ->> 'revision')::int where lesson_id = x ->> 'lesson';
    end if;
    entity := 'curriculum-spec'; id := x ->> 'lesson'; action := act; return next;
  end loop;

  for x in select * from jsonb_array_elements(doc -> 'labs') loop
    select c.revision into cur from public.content_labs c where c.lesson_id = x ->> 'lesson';
    act := content_admin.decide(cur, x);
    if act = 'inserted' then
      insert into public.content_labs (lesson_id, kind, spec, revision) values (x ->> 'lesson', x -> 'spec' ->> 'kind', x -> 'spec', (x ->> 'revision')::int);
    elsif act = 'updated' then
      update public.content_labs set kind = x -> 'spec' ->> 'kind', spec = x -> 'spec', revision = (x ->> 'revision')::int where lesson_id = x ->> 'lesson';
    end if;
    entity := 'lab'; id := x ->> 'lesson'; action := act; return next;
  end loop;

  for x in select * from jsonb_array_elements(doc -> 'scenarios') loop
    select s.revision into cur from public.content_scenarios s where s.id = x ->> 'id';
    act := content_admin.decide(cur, x);
    if act <> 'unchanged' then
      if act = 'inserted' then
        insert into public.content_scenarios (id, lesson_id, slot, version, title, purpose, setup, speaker, rules, formal, visual,
          prediction_question, prediction_basis, model_answer, explain, takeaway, skill_id, explore, revision)
        values (x ->> 'id', x ->> 'lesson', x ->> 'slot', (x ->> 'version')::int, x ->> 'title', x ->> 'purpose', x ->> 'setup', x -> 'speaker',
          content_admin.text_array(x -> 'rules'), x -> 'formal', x -> 'visual', x -> 'predict' ->> 'question', x -> 'predict' ->> 'basis',
          x -> 'predict' ->> 'modelAnswer', content_admin.text_array(x -> 'explain'), x ->> 'takeaway', x ->> 'skill', x -> 'explore', (x ->> 'revision')::int);
      else
        update public.content_scenarios set lesson_id = x ->> 'lesson', slot = x ->> 'slot', version = (x ->> 'version')::int, title = x ->> 'title',
          purpose = x ->> 'purpose', setup = x ->> 'setup', speaker = x -> 'speaker', rules = content_admin.text_array(x -> 'rules'),
          formal = x -> 'formal', visual = x -> 'visual', prediction_question = x -> 'predict' ->> 'question',
          prediction_basis = x -> 'predict' ->> 'basis', model_answer = x -> 'predict' ->> 'modelAnswer',
          explain = content_admin.text_array(x -> 'explain'), takeaway = x ->> 'takeaway', skill_id = x ->> 'skill', explore = x -> 'explore',
          revision = (x ->> 'revision')::int
        where content_scenarios.id = x ->> 'id';
        delete from public.content_scenario_options o where o.scenario_id = x ->> 'id';
      end if;
      insert into public.content_scenario_options (scenario_id, id, position, label, verdict, feedback)
      select x ->> 'id', o.value ->> 'id', (o.ord - 1)::int, o.value ->> 'label', o.value ->> 'verdict', o.value ->> 'feedback'
      from jsonb_array_elements(x -> 'predict' -> 'options') with ordinality as o(value, ord);
    end if;
    entity := 'scenario'; id := x ->> 'id'; action := act; return next;
  end loop;

  for x in select * from jsonb_array_elements(doc -> 'challenges') loop
    select c.revision into cur from public.content_challenges c where c.id = x ->> 'id';
    act := content_admin.decide(cur, x);
    if act <> 'unchanged' then
      if act = 'inserted' then
        insert into public.content_challenges (id, position, lesson_id, sequence, version, level, title, scenario, question, skill_id, concept, takeaway, basis, revision)
        values (x ->> 'id', (x ->> 'position')::int, x ->> 'lesson', (x ->> 'order')::int, (x ->> 'version')::int, (x ->> 'level')::int, x ->> 'title',
          x ->> 'scenario', x ->> 'question', x ->> 'skill', x ->> 'concept', x ->> 'takeaway', x ->> 'basis', (x ->> 'revision')::int);
      else
        update public.content_challenges set position = (x ->> 'position')::int, lesson_id = x ->> 'lesson', sequence = (x ->> 'order')::int,
          version = (x ->> 'version')::int, level = (x ->> 'level')::int, title = x ->> 'title', scenario = x ->> 'scenario',
          question = x ->> 'question', skill_id = x ->> 'skill', concept = x ->> 'concept', takeaway = x ->> 'takeaway', basis = x ->> 'basis',
          revision = (x ->> 'revision')::int
        where content_challenges.id = x ->> 'id';
        delete from public.content_challenge_options o where o.challenge_id = x ->> 'id';
      end if;
      insert into public.content_challenge_options (challenge_id, id, position, label, verdict, feedback)
      select x ->> 'id', o.value ->> 'id', (o.ord - 1)::int, o.value ->> 'label', o.value ->> 'verdict', o.value ->> 'feedback'
      from jsonb_array_elements(x -> 'options') with ordinality as o(value, ord);
    end if;
    entity := 'challenge'; id := x ->> 'id'; action := act; return next;
  end loop;

  for x in select * from jsonb_array_elements(doc -> 'conceptReviews') loop
    select c.revision into cur from public.content_concept_reviews c where c.lesson_id = x ->> 'lesson';
    act := content_admin.decide(cur, x);
    if act = 'inserted' then
      insert into public.content_concept_reviews (lesson_id, concept, summary, revision) values (x ->> 'lesson', x ->> 'concept', x ->> 'summary', (x ->> 'revision')::int);
    elsif act = 'updated' then
      update public.content_concept_reviews set concept = x ->> 'concept', summary = x ->> 'summary', revision = (x ->> 'revision')::int where lesson_id = x ->> 'lesson';
    end if;
    entity := 'concept-review'; id := x ->> 'lesson'; action := act; return next;
  end loop;

  for x in select * from jsonb_array_elements(doc -> 'assessments') loop
    select a.revision into cur from public.content_assessments a where a.id = x ->> 'id';
    act := content_admin.decide(cur, x);
    if act <> 'unchanged' then
      if act = 'inserted' then
        insert into public.content_assessments (id, position, version, title, intro, case_text, pass_mark, reflection, revision)
        values (x ->> 'id', (x ->> 'position')::int, (x ->> 'version')::int, x ->> 'title', x ->> 'intro', x ->> 'case', (x ->> 'passMark')::numeric,
          x -> 'reflection', (x ->> 'revision')::int);
      else
        update public.content_assessments set position = (x ->> 'position')::int, version = (x ->> 'version')::int, title = x ->> 'title',
          intro = x ->> 'intro', case_text = x ->> 'case', pass_mark = (x ->> 'passMark')::numeric, reflection = x -> 'reflection',
          revision = (x ->> 'revision')::int
        where content_assessments.id = x ->> 'id';
        delete from public.content_assessment_items i where i.assessment_id = x ->> 'id';
      end if;
      insert into public.content_assessment_items (assessment_id, id, position, lesson_id, situation, data_table, question, multi, explanation)
      select x ->> 'id', i.value ->> 'id', (i.ord - 1)::int, i.value ->> 'lesson', i.value ->> 'situation', i.value -> 'table', i.value ->> 'question',
        coalesce((i.value ->> 'multi')::boolean, false), i.value ->> 'explanation'
      from jsonb_array_elements(x -> 'items') with ordinality as i(value, ord);
      insert into public.content_assessment_options (assessment_id, item_id, id, position, label, verdict, feedback)
      select x ->> 'id', i.value ->> 'id', o.value ->> 'id', (o.ord - 1)::int, o.value ->> 'label', o.value ->> 'verdict', o.value ->> 'feedback'
      from jsonb_array_elements(x -> 'items') as i(value), jsonb_array_elements(i.value -> 'options') with ordinality as o(value, ord);
    end if;
    entity := 'assessment'; id := x ->> 'id'; action := act; return next;
  end loop;
end;
$$;

-- Structural rules the app also enforces when it loads content (src/content/build.ts). An empty result means valid.
-- Engine coverage (every scenario version and parameter lab has a registered implementation) can only be checked by
-- the app's code: run `npm run content:validate` for the full check.
create or replace function content_admin.validate_content()
returns table (problem text)
language sql stable set search_path = '' as $$
  select format('lesson %s has no published scenario %s', l.id, want.slot_name)
  from public.content_lessons l cross join unnest(array['A', 'B', 'C']) as want(slot_name)
  where l.status = 'published'
    and not exists (select 1 from public.content_scenarios s where s.lesson_id = l.id and s.slot = want.slot_name and s.status = 'published')
  union all
  select format('scenario %s has fewer than two options', s.id) from public.content_scenarios s
  where (select count(*) from public.content_scenario_options o where o.scenario_id = s.id) < 2
  union all
  select format('scenario %s is calculable but no option is a match', s.id) from public.content_scenarios s
  where s.prediction_basis = 'calculable' and not exists (select 1 from public.content_scenario_options o where o.scenario_id = s.id and o.verdict = 'match')
  union all
  select format('challenge %s is calculable but no option is a match', c.id) from public.content_challenges c
  where c.basis = 'calculable' and not exists (select 1 from public.content_challenge_options o where o.challenge_id = c.id and o.verdict = 'match')
  union all
  select format('challenge %s is uncertain but marks an option as a match', c.id) from public.content_challenges c
  where c.basis = 'uncertain' and exists (select 1 from public.content_challenge_options o where o.challenge_id = c.id and o.verdict = 'match')
  union all
  select format('challenge %s has fewer than two options', c.id) from public.content_challenges c
  where (select count(*) from public.content_challenge_options o where o.challenge_id = c.id) < 2
  union all
  select format('assessment item %s/%s has no matching option', i.assessment_id, i.id) from public.content_assessment_items i
  where not exists (select 1 from public.content_assessment_options o where o.assessment_id = i.assessment_id and o.item_id = i.id and o.verdict = 'match')
  union all
  select format('lesson %s has a curriculum spec but no lab, or a lab but no spec', l.id) from public.content_lessons l
  where (exists (select 1 from public.content_curriculum_specs c where c.lesson_id = l.id)) <> (exists (select 1 from public.content_labs c where c.lesson_id = l.id))
  union all
  select format('curriculum spec %s needs exactly one strong transfer option', c.lesson_id) from public.content_curriculum_specs c
  where (select count(*) from jsonb_array_elements(c.spec -> 'transfer' -> 'options') o where o ->> 'verdict' = 'strong') <> 1
  union all
  select format('module %s has no published lesson', m.id) from public.content_modules m
  where m.status = 'published' and not exists (select 1 from public.content_lessons l where l.module_id = m.id and l.status = 'published');
$$;

-- Row counts per table, for a quick look after an import.
create or replace function content_admin.content_counts()
returns table (entity text, total bigint, published bigint)
language sql stable set search_path = '' as $$
  select 'modules', count(*), count(*) filter (where status = 'published') from public.content_modules
  union all select 'lessons', count(*), count(*) filter (where status = 'published') from public.content_lessons
  union all select 'skills', count(*), count(*) filter (where status = 'published') from public.content_skills
  union all select 'goals', count(*), count(*) filter (where status = 'published') from public.content_goals
  union all select 'lesson predictions', count(*), count(*) filter (where status = 'published') from public.content_lesson_predictions
  union all select 'curriculum specs', count(*), count(*) filter (where status = 'published') from public.content_curriculum_specs
  union all select 'labs', count(*), count(*) filter (where status = 'published') from public.content_labs
  union all select 'scenarios', count(*), count(*) filter (where status = 'published') from public.content_scenarios
  union all select 'scenario options', count(*), null from public.content_scenario_options
  union all select 'challenges', count(*), count(*) filter (where status = 'published') from public.content_challenges
  union all select 'challenge options', count(*), null from public.content_challenge_options
  union all select 'concept reviews', count(*), count(*) filter (where status = 'published') from public.content_concept_reviews
  union all select 'assessments', count(*), count(*) filter (where status = 'published') from public.content_assessments
  union all select 'assessment items', count(*), null from public.content_assessment_items
  union all select 'assessment options', count(*), null from public.content_assessment_options;
$$;

revoke all on all functions in schema content_admin from public, anon, authenticated;
