-- Game of the Week: make sure this week and the next seven have a competition. Run it in the SQL Editor (as the
-- project owner). Safe to re-run: weeks that are already scheduled — manually or automatically, started or not —
-- are left exactly as they are; empty weeks get the automatic rotation (every featurable game, never the same game
-- twice in a row, least recently featured first). The scheduler (supabase/scheduler.sql) does the same every few
-- minutes for the next `weekly_lead_weeks` weeks, so this is only needed to plan further ahead.
--
-- To feature a particular game in a particular week, use (see docs/SQL_EDITOR_OPERATIONS.md):
--   select * from content_admin.schedule_game_of_the_week(p_game_id => 'gambit', p_week_start => '2026-11-09');
-- Weeks run Monday 00:00 to the next Monday 00:00 in Asia/Kolkata (public.competition_settings).

select content_admin.ensure_competitions(now(), 7) as created;

select number, id, game_id, config, state, source, starts_local, ends_local
from content_admin.weekly_schedule order by number desc limit 10;
