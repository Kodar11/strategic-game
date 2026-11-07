-- Which migrations are already in this database? Read-only: run it in the SQL editor, nothing is changed.
--
-- Use it when `supabase db push` tries to re-run migrations that were applied by hand in the SQL editor (the CLI's
-- history table, supabase_migrations.schema_migrations, doesn't know about those). Every row says whether the
-- objects a migration creates exist. Mark the `applied` ones in the CLI history with
--   npx supabase migration repair --status applied <version> ...
-- and then `npx supabase db push` runs only the missing ones.

select version, name, case when present then 'applied' else 'MISSING' end as status
from (values
  ('20261027120000', 'content_catalog',        to_regclass('public.content_modules') is not null),
  ('20261027120100', 'learner_progress',       to_regclass('public.lesson_progress') is not null),
  ('20261027120200', 'content_admin',          exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'content_admin' and p.proname = 'import_content')),
  ('20261027130000', 'lesson_categories',      to_regclass('public.content_categories') is not null),
  ('20261027130100', 'daily_challenges',       to_regclass('public.daily_challenges') is not null),
  ('20261027140000', 'games',                  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'game_engine' and p.proname = 'mulberry_first')),
  ('20261028120000', 'rps_opponent_reads',     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_practice_results' and column_name = 'insight_points')),
  ('20261028140000', 'delete_account',         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'delete_my_account')),
  ('20261104120000', 'arena_match_summaries',  to_regclass('public.arena_matches') is not null),
  ('20261104120100', 'nickname_rules',         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'game_engine' and p.proname = 'nickname_problem')),
  ('20261105120000', 'daily_challenge_v2',     to_regclass('public.competition_settings') is not null),
  ('20261105120100', 'game_of_the_week_v2',    to_regclass('public.competition_game_configs') is not null),
  ('20261105120200', 'scheduler',              to_regclass('content_admin.scheduler_runs') is not null),
  ('20261106120000', 'nickname_rate_limit',    to_regclass('game_engine.nickname_attempts') is not null),
  ('20261106120100', 'account_deletions',      to_regclass('public.account_deletions') is not null),
  ('20261107120000', 'progress_sync_ops',      to_regclass('public.progress_sync_ops') is not null),
  ('20261108120000', 'nickname_limit_details', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_nickname' and p.prosrc like '%retryAfterSeconds%')),
  ('20261109120000', 'tournament_content',     to_regclass('public.tournament_documents') is not null)
) as m(version, name, present)
order by version;
