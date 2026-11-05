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

-- ── PostHog deletion worker (docs/ACCOUNT_DELETION.md) ───────────────────────────────────────────────────────────
-- Every 15 minutes, pg_net calls the posthog-deletion Edge Function, which deletes deleted accounts' PostHog persons,
-- events and recordings from the public.account_deletions queue. The function URL and the shared secret are read from
-- Supabase Vault at run time, so neither appears in cron.job. Before running this block, once:
--   1. Dashboard → Database → Extensions: enable pg_net (and pg_cron, above).
--   2. Store the two values in Vault (SQL Editor; replace the placeholders, keep the names):
--        select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/posthog-deletion', 'posthog_deletion_url');
--        select vault.create_secret('<the same value as the DELETION_WORKER_SECRET function secret>', 'posthog_deletion_secret');
--   3. Deploy the function and set its secrets (docs/ACCOUNT_DELETION.md → Deployment).

create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'tactiqo-posthog-deletion') then
    perform cron.unschedule('tactiqo-posthog-deletion');
  end if;
end;
$$;

select cron.schedule('tactiqo-posthog-deletion', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'posthog_deletion_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-deletion-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'posthog_deletion_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
$$);

-- Verify (after 15–30 minutes):
--   select jobid, jobname, schedule, active from cron.job where jobname = 'tactiqo-posthog-deletion';
--   select status_code, left(content::text, 200), created from net._http_response order by created desc limit 5;
--   select * from public.account_deletions_health;   -- expect no 'failed' row and no old 'pending' row
