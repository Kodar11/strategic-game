-- Lesson categories: five strategic-thinking themes for browsing the existing 22 lessons.
--
-- A category is content (same conventions as content_*: stable id, `status`, `revision`, owner-only writes). Each
-- lesson has exactly one primary category (`lesson_id` is the primary key of the assignment table), so a lesson is
-- never duplicated to appear in two places. Lessons themselves are untouched: ids, order, modules and progress stay
-- exactly as they were; categories are an extra lens over the same catalog.
--
-- The app reads categories through get_lesson_categories(), separately from get_published_content(), so app builds
-- that predate categories keep loading the catalog unchanged (its document schema is strict).
--
-- The initial categories and assignments are inserted only when absent (`on conflict do nothing`): re-running this
-- file never overwrites a later edit made in the SQL editor. To move a lesson:
--   update public.content_lesson_categories set category_id = 'negotiation-bargaining' where lesson_id = 'credibility';

create table public.content_categories (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Deferrable so two categories can swap positions in one transaction.
  position integer not null check (position >= 0),
  title text not null check (length(title) between 1 and 80),
  description text not null check (length(description) between 1 and 400),
  status public.content_status not null default 'published',
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint content_categories_position_key unique (position) deferrable initially deferred
);

create table public.content_lesson_categories (
  lesson_id text primary key references public.content_lessons (id) on update cascade on delete cascade,
  category_id text not null references public.content_categories (id) on update cascade on delete restrict,
  updated_at timestamptz not null default now()
);
create index content_lesson_categories_category_idx on public.content_lesson_categories (category_id);

create trigger content_categories_touch before update on public.content_categories
  for each row execute function public.touch_updated_at();
create trigger content_lesson_categories_touch before update on public.content_lesson_categories
  for each row execute function public.touch_updated_at();

-- ── Access: published rows readable, nothing writable by the app ────────────

alter table public.content_categories enable row level security;
revoke all on public.content_categories from anon, authenticated;
grant select on public.content_categories to anon, authenticated;
create policy content_categories_read_published on public.content_categories for select to anon, authenticated
  using (status = 'published');

-- An assignment is visible exactly when both its category and its lesson are published.
alter table public.content_lesson_categories enable row level security;
revoke all on public.content_lesson_categories from anon, authenticated;
grant select on public.content_lesson_categories to anon, authenticated;
create policy content_lesson_categories_read_published on public.content_lesson_categories for select to anon, authenticated
  using (
    exists (select 1 from public.content_categories c where c.id = category_id and c.status = 'published')
    and exists (select 1 from public.content_lessons l where l.id = lesson_id and l.status = 'published')
  );

-- ── Read path ────────────────────────────────────────────────────────────────
--
-- { categories: [{id, position, title, description}] in display order, assignments: {lessonId: categoryId} }.
-- SECURITY INVOKER: row level security decides what is visible. Lessons of an unpublished module are left out, as
-- in get_published_content(), so every assignment refers to a lesson the app has.

create or replace function public.get_lesson_categories() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with
  c as (select * from public.content_categories where status = 'published'),
  l as (
    select l.id from public.content_lessons l
    join public.content_modules m on m.id = l.module_id and m.status = 'published'
    where l.status = 'published'
  )
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'position', position, 'title', title, 'description', description) order by position) from c), '[]'::jsonb),
    'assignments', coalesce((select jsonb_object_agg(a.lesson_id, a.category_id)
      from public.content_lesson_categories a join c on c.id = a.category_id join l on l.id = a.lesson_id), '{}'::jsonb)
  );
$$;

revoke all on function public.get_lesson_categories() from public;
grant execute on function public.get_lesson_categories() to anon, authenticated;

-- ── Initial taxonomy (validated against each lesson's objective; see docs/LESSON_CATEGORIES.md) ──

insert into public.content_categories (id, position, title, description) values
  ('strategic-foundations', 0, 'Strategic Foundations',
   'The core toolkit: read a payoff table, rule out bad moves, find stable outcomes, think from the end — and apply it when nobody labels the problem.'),
  ('cooperation-competition', 1, 'Cooperation and Competition',
   'When working together pays, when rivalry wins, and how shared expectations, unpredictability and the future change the outcome.'),
  ('incentives-decisions', 2, 'Incentives and Decision-Making',
   'How rules, commitments and voting procedures change what each person’s best move is.'),
  ('negotiation-bargaining', 3, 'Negotiation and Bargaining',
   'Who gets what: outside options, the cost of waiting, coalitions and deliberate risk.'),
  ('information-uncertainty', 4, 'Information and Uncertainty',
   'Deciding with hidden types and private information: beliefs, signals, auctions and market quality.')
on conflict (id) do nothing;

-- Only lessons that exist are assigned (a fresh database gets its lessons from seed.sql; run this block again after
-- seeding, or use content_admin.seed_lesson_categories(), which does exactly this).
create or replace function content_admin.seed_lesson_categories() returns integer
language plpgsql set search_path = '' as $$
declare n integer;
begin
  insert into public.content_lesson_categories (lesson_id, category_id)
  select v.lesson_id, v.category_id
  from (values
    ('iterated-dominance', 'strategic-foundations'),
    ('best-response', 'strategic-foundations'),
    ('sequential-moves', 'strategic-foundations'),
    ('strategy-detective', 'strategic-foundations'),
    ('strategic-practice', 'strategic-foundations'),
    ('cooperation-trap', 'cooperation-competition'),
    ('coordination-problem', 'cooperation-competition'),
    ('predictability-trap', 'cooperation-competition'),
    ('market-competition', 'cooperation-competition'),
    ('evolution', 'cooperation-competition'),
    ('repeated-cooperation', 'cooperation-competition'),
    ('credibility', 'incentives-decisions'),
    ('incentive-shift', 'incentives-decisions'),
    ('voting', 'incentives-decisions'),
    ('bargaining', 'negotiation-bargaining'),
    ('war-of-attrition', 'negotiation-bargaining'),
    ('coalitions', 'negotiation-bargaining'),
    ('brinkmanship', 'negotiation-bargaining'),
    ('bayesian-uncertainty', 'information-uncertainty'),
    ('signaling', 'information-uncertainty'),
    ('auctions', 'information-uncertainty'),
    ('market-quality', 'information-uncertainty')
  ) as v (lesson_id, category_id)
  join public.content_lessons l on l.id = v.lesson_id
  join public.content_categories c on c.id = v.category_id
  on conflict (lesson_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function content_admin.seed_lesson_categories() from public, anon, authenticated;

select content_admin.seed_lesson_categories();
