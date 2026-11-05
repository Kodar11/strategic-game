-- Scheduler setup: one pg_cron job runs content_admin.run_scheduled_jobs() every 5 minutes. Run this once in the
-- Supabase SQL Editor (as the project owner), after the migrations. Safe to re-run: the job is replaced, not doubled.
-- Requires the pg_cron extension (Dashboard → Database → Extensions → pg_cron, or the create statement below).
--
-- What each run does (all idempotent; a missed or late run is caught up by the next one, and the app's reads do the
-- same "ensure" steps lazily):
--   daily     ensure today's Daily Challenge exists (manual first, else the automatic scenario pick) — and tomorrow's,
--             so the 00:00 India-time switch never waits on a pick
--   weekly    keep the current week and the next `weekly_lead_weeks` weeks scheduled
--   finalize  finalize every Game of the Week past its deadline: results, champion records, completed
-- A week activates and closes on its stored timestamps by itself; no job is needed for that.
--
-- There is exactly one scheduler. The older 'finalize-game-of-the-week' job (docs/GAMES.md before v2) is removed
-- below, because run_scheduled_jobs() already finalizes.

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'finalize-game-of-the-week') then
    perform cron.unschedule('finalize-game-of-the-week');
  end if;
  if exists (select 1 from cron.job where jobname = 'tactiqo-competitions') then
    perform cron.unschedule('tactiqo-competitions');
  end if;
end;
$$;

select cron.schedule('tactiqo-competitions', '*/5 * * * *', $$select content_admin.run_scheduled_jobs()$$);

-- Verify (run after 5–10 minutes):
--   1. The job exists and is active:
select jobid, jobname, schedule, command, active from cron.job where jobname = 'tactiqo-competitions';
--   2. Its recent runs succeeded (pg_cron's own log):
--      select status, return_message, start_time from cron.job_run_details
--      where jobid = (select jobid from cron.job where jobname = 'tactiqo-competitions') order by start_time desc limit 5;
--   3. Each step's last result (expect ok = true and a last_run within the last few minutes):
--      select * from content_admin.scheduler_health;
