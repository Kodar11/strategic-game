-- The Tournament's content: one published JSON document per tournament (rivals, seasons, stages, matches).
--
-- The app knows only the game engines; a season, an arc, a rival's lines or a match's level are all data here, so a
-- new arc or season ships without an app release. The document is checked by the app before it is used
-- (src/tournament/schema.ts: shape, and every game, level, variant and lesson must exist); a document that fails is
-- ignored and the device keeps its cached or bundled copy. Editing happens in the SQL editor
-- (supabase/tournament/manage.sql). Same conventions as content_*: `status`, `revision`, owner-only writes.
--
-- Player progress is not stored here: in this release it stays on the device.

create table public.tournament_documents (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status public.content_status not null default 'draft',
  revision integer not null default 1 check (revision > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object' and document ->> 'id' = id and (document ->> 'schemaVersion')::int = 1),
  updated_at timestamptz not null default now()
);

create trigger tournament_documents_touch before update on public.tournament_documents
  for each row execute function public.touch_updated_at();

alter table public.tournament_documents enable row level security;
revoke all on public.tournament_documents from anon, authenticated;
grant select on public.tournament_documents to anon, authenticated;
create policy tournament_documents_read_published on public.tournament_documents for select to anon, authenticated
  using (status = 'published');

-- The published main tournament, or null when none is published (the app then keeps its own copy).
-- SECURITY INVOKER: row level security decides what is visible.
create or replace function public.get_tournament_content() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select d.document from public.tournament_documents d where d.id = 'main' and d.status = 'published';
$$;

revoke all on function public.get_tournament_content() from public;
grant execute on function public.get_tournament_content() to anon, authenticated;
