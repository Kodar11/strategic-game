-- The Tournament: the SQL Editor workflow, statement by statement. Run any statement on its own (select it, then
-- Run). Every statement here runs against the real migrations in supabase/__tests__/tournament.test.ts, after
-- season1.sql, so the names and paths are real.
--
-- The document is checked by the app before use (src/tournament/schema.ts). A document that fails — an unknown game,
-- variant or lesson, a duplicate id — is ignored and players keep their cached copy, so a typo can't break the app.
-- Devices pick up a change at their next start after a background refresh (at most every 30 minutes).

-- ── 1. Publish Season 1 ─────────────────────────────────────────────────────
-- Run the whole of supabase/tournament/season1.sql once.

-- ── 2. See what is live ─────────────────────────────────────────────────────
select id, status, revision, updated_at, document -> 'seasons' -> 0 ->> 'title' as first_season from public.tournament_documents;

-- Every match, in order, with its stage, game and level.
select s.value ->> 'id' as season, st.value ->> 'id' as stage, st.ordinality - 1 as stage_index, m.ordinality - 1 as match_index,
       m.value ->> 'id' as match, m.value -> 'game' ->> 'id' as game, m.value ->> 'level' as level, coalesce((m.value ->> 'duel')::boolean, false) as duel
from public.tournament_documents d,
     jsonb_array_elements(d.document -> 'seasons') s,
     jsonb_array_elements(s.value -> 'stages') with ordinality st,
     jsonb_array_elements(st.value -> 'matches') with ordinality m
where d.id = 'main'
order by stage_index, match_index;

-- ── 3. Change one match (here: make Vesper's Bluff match Hard) ─────────────
-- Finds the match by its id, wherever it sits, and sets one field. Change the id, the field and the value.
update public.tournament_documents d
set document = jsonb_set(d.document, array['seasons', p.si::text, 'stages', p.sti::text, 'matches', p.mi::text, 'level'], '"hard"'::jsonb),
    revision = d.revision + 1
from (
  select s.ordinality - 1 as si, st.ordinality - 1 as sti, m.ordinality - 1 as mi
  from public.tournament_documents x,
       jsonb_array_elements(x.document -> 'seasons') with ordinality s,
       jsonb_array_elements(s.value -> 'stages') with ordinality st,
       jsonb_array_elements(st.value -> 'matches') with ordinality m
  where x.id = 'main' and m.value ->> 'id' = 's1.vesper.bluff'
) p
where d.id = 'main';

-- ── 4. Change a rival's line ────────────────────────────────────────────────
update public.tournament_documents d
set document = jsonb_set(d.document, array['rivals', (r.ordinality - 1)::text, 'bio'], to_jsonb('Says everything with the same calm face, true or not.'::text)),
    revision = d.revision + 1
from public.tournament_documents x, jsonb_array_elements(x.document -> 'rivals') with ordinality r
where d.id = 'main' and x.id = 'main' and r.value ->> 'id' = 'vesper';

-- ── 5. Add a season as a draft (players don't see drafts) ──────────────────
-- Paste a full season object; set "status": "live" in a later update when it is ready. Ids must be new.
update public.tournament_documents
set document = jsonb_set(document, '{seasons}', (document -> 'seasons') || $season$
{ "id": "s2", "title": "Season 2", "status": "draft", "stages": [
  { "id": "s2.qualifiers", "kind": "qualifiers", "title": "Qualifiers", "theme": "Reading an opponent", "rival": "host", "style": "calculator", "lessons": [], "intro": ["Season 2 begins."],
    "matches": [ { "id": "s2.q.rps", "game": { "system": "classic", "id": "rps" }, "level": "normal",
      "intel": { "tendency": "Every player has a habit.", "counter": "Track what they did after a win and after a loss." } } ] } ] }
$season$::jsonb),
    revision = revision + 1
where id = 'main' and not (document -> 'seasons') @> '[{"id": "s2"}]';

-- Remove that draft season again.
update public.tournament_documents
set document = jsonb_set(document, '{seasons}', (select coalesce(jsonb_agg(s.value order by s.ordinality), '[]'::jsonb) from jsonb_array_elements(document -> 'seasons') with ordinality s where s.value ->> 'id' <> 's2')),
    revision = revision + 1
where id = 'main';

-- ── 6. Unpublish and publish ────────────────────────────────────────────────
-- Unpublished: devices keep the copy they have; new installs use the copy bundled with the app.
update public.tournament_documents set status = 'draft' where id = 'main';
update public.tournament_documents set status = 'published' where id = 'main';
