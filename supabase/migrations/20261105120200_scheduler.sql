-- One scheduled job for both features: content_admin.run_scheduled_jobs(). It is idempotent, so it can run as often
-- as you like (supabase/scheduler.sql registers it with pg_cron every 5 minutes), and a missed or late run is
-- harmless: the next one catches up, and the app's reads perform the same "ensure" steps lazily.
--
-- Each run, each step in its own sub-transaction (a failure in one is logged and doesn't stop the others):
--   1. daily      ensure today's Daily Challenge (and tomorrow's, so the midnight switch never waits on a pick)
--   2. weekly     keep the current week and the next `weekly_lead_weeks` scheduled (manual choices first, else the
--                 automatic rotation)
--   3. finalize   finalize every competition past its deadline: results, champions, then the week is completed
-- Every run is logged in content_admin.scheduler_runs (kept 90 days).
--
-- Activation and closing need no job: a week is active between its stored timestamps and a day's challenge is
-- visible from 00:00 India time, both checked against the database clock on every request.

create table content_admin.scheduler_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  step text not null check (step in ('daily', 'weekly', 'finalize', 'run')),
  ok boolean,
  detail jsonb,
  error text
);
create index scheduler_runs_started_idx on content_admin.scheduler_runs (started_at desc);
revoke all on content_admin.scheduler_runs from public, anon, authenticated;

create or replace function content_admin.run_scheduled_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  today date := public.daily_challenge_today();
  out jsonb := '{}'::jsonb;
  v jsonb;
begin
  -- 1. Daily Challenge
  begin
    v := jsonb_build_object('today', today, 'challenge', content_admin.ensure_daily_challenge(today),
      'tomorrow', content_admin.ensure_daily_challenge(today + 1));
    insert into content_admin.scheduler_runs (step, ok, detail, finished_at) values ('daily', v ->> 'challenge' is not null, v, clock_timestamp());
    if v ->> 'challenge' is null then
      update content_admin.scheduler_runs set error = 'no challenge could be published for today: check content_admin.validate_scenario_pool()'
      where id = (select max(id) from content_admin.scheduler_runs);
    end if;
  exception when others then
    v := jsonb_build_object('error', sqlerrm);
    insert into content_admin.scheduler_runs (step, ok, error, finished_at) values ('daily', false, sqlerrm || ' (' || sqlstate || ')', clock_timestamp());
  end;
  out := out || jsonb_build_object('daily', v);

  -- 2. Game of the Week schedule
  begin
    v := jsonb_build_object('created', content_admin.ensure_competitions(now()));
    insert into content_admin.scheduler_runs (step, ok, detail, finished_at) values ('weekly', true, v, clock_timestamp());
  exception when others then
    v := jsonb_build_object('error', sqlerrm);
    insert into content_admin.scheduler_runs (step, ok, error, finished_at) values ('weekly', false, sqlerrm || ' (' || sqlstate || ')', clock_timestamp());
  end;
  out := out || jsonb_build_object('weekly', v);

  -- 3. Finalization
  begin
    v := jsonb_build_object('finalized', content_admin.finalize_competitions(now()));
    insert into content_admin.scheduler_runs (step, ok, detail, finished_at) values ('finalize', true, v, clock_timestamp());
  exception when others then
    v := jsonb_build_object('error', sqlerrm);
    insert into content_admin.scheduler_runs (step, ok, error, finished_at) values ('finalize', false, sqlerrm || ' (' || sqlstate || ')', clock_timestamp());
  end;
  out := out || jsonb_build_object('finalize', v);

  delete from content_admin.scheduler_runs where started_at < now() - interval '90 days';
  return out;
end;
$$;
revoke all on function content_admin.run_scheduled_jobs() from public, anon, authenticated;

-- The last run of each step and whether anything needs attention. Expect ok = true and a recent last_run.
create or replace view content_admin.scheduler_health as
  select s.step, r.started_at as last_run, r.ok, r.detail, r.error,
    (select max(x.started_at) from content_admin.scheduler_runs x where x.step = s.step and x.ok = false) as last_failure
  from (values ('daily'), ('weekly'), ('finalize')) as s(step)
  left join lateral (select * from content_admin.scheduler_runs x where x.step = s.step order by x.started_at desc limit 1) r on true;
revoke all on content_admin.scheduler_health from public, anon, authenticated;
