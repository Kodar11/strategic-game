-- Game of the Week: the SQL Editor workflow, statement by statement. Run any statement on its own. Every statement
-- here is executed against the real migrations by supabase/__tests__/sql-editor.test.ts. Walkthrough:
-- docs/SQL_EDITOR_OPERATIONS.md. Weeks run Monday 00:00 → next Monday 00:00 in Asia/Kolkata; `p_week_start` is that
-- Monday's date. Example dates below are in the future; change them to the week you want.

-- ── 0. Once, after deploying the arena-match Edge Function: switch on the 18 Arena games ─
-- See docs/GAME_OF_THE_WEEK.md → "Deploying". Until this is true, only the five SQL-engine games are featured.
update public.competition_settings set arena_server_enabled = true;

-- ── 1. All 23 games: engine, readiness, configuration, how often featured ─────
-- featurable_now is false for the 18 Arena games until the arena-match Edge Function is deployed and switched on
-- (step 0).
select game_id, title, engine, competition_ready, featurable_now, in_rotation, config, times_scheduled, last_featured
from content_admin.weekly_games order by engine desc, game_id;

-- ── 2. Choose the Game of the Week for a future week ─────────────────────────
-- Gambit for the week starting Monday 2030-03-11, with its standard competition configuration. This overrides an
-- automatic pick for that week; a week that has started is refused.
select id, number, game_id, config, source, starts_at, ends_at
from content_admin.schedule_game_of_the_week(p_game_id => 'gambit', p_week_start => '2030-03-11');

-- Optional settings (any you leave out come from competition_game_configs):
--   p_opponent => 'adaptive', p_level => 'hard' ('easy' | 'normal' | 'hard'; classic games: 'easy' | 'medium' | 'hard'),
--   p_variant => 'standard', p_length => 'short' | 'standard' | 'long', p_max_attempts => 3, p_note => 'why'.
-- Changing a week that is already manually scheduled needs p_replace => true:
select id, game_id, config, source
from content_admin.schedule_game_of_the_week(p_game_id => 'gambit', p_week_start => '2030-03-11', p_level => 'hard', p_replace => true, p_note => 'Launch week: hard mode');

-- A classic game works the same way (opponent = bot, level = difficulty):
select id, game_id, config from content_admin.schedule_game_of_the_week(p_game_id => 'rps', p_week_start => '2030-03-18', p_opponent => 'mind-reader', p_level => 'hard');

-- ── 3. Upcoming, current and past competitions ───────────────────────────────
-- state: scheduled → active → finalizing (ended; in-progress matches may finish during the grace period) →
-- completed; or cancelled. Times are shown in India time.
select number, id, game_id, state, source, scheduled_by, starts_local, ends_local, max_attempts, matches, players, finalized_at
from content_admin.weekly_schedule order by number desc limit 20;

-- The current competition only:
select * from content_admin.weekly_schedule where state in ('active', 'finalizing');

-- ── 4. What automatic rotation would pick for a week, and the rotation so far ─
select * from content_admin.weekly_candidates('2030-03-25') limit 5;
select number, game_id, source, starts_local from content_admin.weekly_schedule where state <> 'cancelled' order by number;

-- Keep a game out of automatic rotation (it can still be scheduled manually), or change its standard configuration:
update public.competition_game_configs set in_rotation = false where game_id = 'two-thirds';
update public.competition_game_configs set in_rotation = true where game_id = 'two-thirds';
update public.competition_game_configs set config = '{"opponent": "adaptive", "level": "normal", "variant": "standard", "length": "standard"}' where game_id = 'gambit';

-- Schedule the empty weeks ahead now (the scheduler does this for the next weekly_lead_weeks weeks by itself):
select content_admin.ensure_competitions(now(), 4) as created;

-- ── 5. Every scheduling decision (append-only audit) ─────────────────────────
select seq, competition_id, action, source, actor, note, at, before ->> 'game_id' as was, after ->> 'game_id' as now
from public.competition_schedule_audit order by seq desc limit 20;

-- ── 6. A week's leaderboard ──────────────────────────────────────────────────
-- Live (from validated, completed ranked matches) while the week is on; the immutable results once finalized.
select s.rank, coalesce(p.nickname, 'Anonymous player') as nickname, s.score, s.secondary, s.score_label, s.attempts, s.achieved_at
from public.game_competitions c, game_engine.live_standings(c) s
left join public.player_profiles p on p.user_id = s.user_id
where c.id = (select id from content_admin.weekly_schedule where state in ('active', 'finalizing') order by number desc limit 1)
order by s.rank, s.achieved_at;

select r.rank, coalesce(r.nickname_snapshot, 'Anonymous player') as nickname, r.score, r.secondary, r.score_label, r.attempts_used, r.points, r.is_winner
from public.competition_results r
where r.competition_id = (select id from public.game_competitions where finalized_at is not null order by ends_at desc limit 1)
order by r.rank, r.achieved_at;

-- ── 7. Champions ─────────────────────────────────────────────────────────────
select competition_number, competition_id, game_id, coalesce(nickname_snapshot, 'Anonymous player') as champion, score_label,
  decided_by, shared, runner_up_score, field_size, finalized_at
from public.weekly_champions order by competition_number desc;

-- All-time: titles per player.
select coalesce(nickname_snapshot, 'Anonymous player') as champion, count(*) as titles
from public.weekly_champions group by 1 order by titles desc;

-- ── 8. Finalization and the scheduler ────────────────────────────────────────
-- Expect no rows. A row means a week is past its deadline but not finalized: run the next statement.
select * from content_admin.weekly_finalization_issues;
select public.finalize_due_competitions() as finalized;
-- One run of the whole scheduler (daily, weekly, finalize), and its log:
select content_admin.run_scheduled_jobs();
select * from content_admin.scheduler_health;
select * from content_admin.scheduler_runs order by id desc limit 20;

-- ── 9. Emergencies (audited) ────────────────────────────────────────────────
-- Extend a running week or raise its attempt limit (never lowers it; never changes the game):
--   select * from content_admin.correct_competition('week-2030-w11', 'Server outage on Tuesday', p_ends_at => '2030-03-19 00:00+05:30', p_max_attempts => 4);
-- Cancel a week (no champion, no points; matches kept for the record):
--   select * from content_admin.cancel_competition('week-2030-w11', 'Game rules bug found');
select * from content_admin.cancel_competition('week-2030-w12', 'Example: cancelled from the SQL Editor workflow');
