# Running Daily Challenge and Game of the Week from the SQL Editor

Everything about both features is managed from **Supabase → SQL Editor**. There is no admin dashboard. Every
statement below is in a runnable file that the test suite executes against the real migrations:

| File | What |
|---|---|
| `supabase/daily/manage.sql` | Daily Challenge: write, preview, schedule, publish, unpublish, inspect usage, leaderboard, health, recovery |
| `supabase/daily/examples.sql` | Three complete challenge documents (choice, number, scenario) |
| `supabase/games/manage.sql` | Game of the Week: the 23 games, scheduling (Gambit included), rotation, audit, leaderboards, champions, finalization, emergencies |
| `supabase/games/schedule.sql` | Plan the next eight weeks with the automatic rotation |
| `supabase/scheduler.sql` | Register the one scheduled job (pg_cron) and verify it |

`supabase/__tests__/sql-editor.test.ts` runs the two `manage.sql` files statement by statement, so a renamed column
or function fails the build instead of the documentation. Run one statement at a time in the editor (select it, then
**Run**).

Times: a Daily Challenge day and a Game of the Week both use **Asia/Kolkata** (`public.competition_settings`). A
day's challenge goes live at 00:00 India time; a week runs Monday 00:00 → the next Monday 00:00 India time.

---

## Part 1 · Daily Challenge

### Where the day's challenge comes from

1. A **manual** challenge published for that date (you wrote it in the SQL Editor) — always wins.
2. Otherwise an **automatic** pick: one of the 66 lesson scenarios, adapted into a standalone `choice` challenge.

The scheduler makes today's (and tomorrow's) challenge a few minutes after midnight; if it hasn't run, the first
player to open the Daily screen makes it (the same idempotent function — never two challenges for one date). Once a
date has its challenge it never changes because someone else opened the app.

### Create, preview, schedule and publish a manual challenge

```sql
-- 1. Check a document without saving anything: `problems` must be empty; `shown` is what players see first.
select content_admin.preview_daily_challenge($doc$ { …document… } $doc$::jsonb);

-- 2. Schedule it, hidden: the document with "status": "draft".
select * from content_admin.publish_daily_challenge($doc$ { …document… } $doc$::jsonb);

-- 3. Publish the draft (validated again; it goes live at 00:00 India time on its date).
select * from content_admin.publish_scheduled_challenge('bakery-price-war');

-- 4. See it as stored, with its private key, lifecycle and attempts.
select content_admin.preview_daily_challenge(to_jsonb('bakery-price-war'::text));

-- 5. Back to draft — only while nobody has answered it.
select content_admin.unpublish_daily_challenge('bakery-price-war');
```

The full document with every field is step 1 of `supabase/daily/manage.sql`. The fields:

| Field | Notes |
|---|---|
| `id` | Lowercase words joined by hyphens, ≤ 80. Never reused. |
| `date` | `YYYY-MM-DD`, an India-time calendar day. |
| `version` | Starts at 1. Any change to an existing id needs a higher version. |
| `status` | `draft` (scheduled, hidden) or `published` (default). |
| `title`, `intro`, `prompt`, `instructions` | ≤ 120, 800, 1500, 400 characters. Keep the intro short — players shouldn't read long paragraphs before acting. |
| `interaction` | `choice`, `number` or `scenario` (see `docs/DAILY_CHALLENGE.md`). |
| `config` | `choice`: `options` (2–6 `{id, label}`), optional `rules` (≤ 8 lines) and `visual` (a payoff `matrix`, game `tree` or `table`, in the lesson-scenario format). |
| `key` | Private, never sent before answering: `evaluation` (a verdict + feedback per option, or number bands), `modelAnswer`, `explanation` (paragraphs), `takeaway`. |
| `askConfidence` | Default `true`; the confidence rating drives calibration, the tie-break. |
| `difficulty` | 1 Easy · 2 Medium · 3 Hard. Judge by the reasoning it takes, not by topic. |
| `format` | `prediction` · `decision` · `reasoning` · `outcome` (optional). |
| `concept` | The strategic concept, shown after answering (optional). |
| `minutes` | Estimated time, 1–10 (default 2). |
| `skill`, `basis`, `lesson` | Profile area, `calculable` (one right answer → scored) or `uncertain` (no right answer → taken part, not ranked), and the lesson for "More on this". |
| `sourceScenario` | `{"id": "l6.b.bertrand", "version": 1}` when the challenge is built on a lesson scenario; it then counts in that scenario's usage. |
| `correction` | Required to change a challenge that already has official answers (see below). |

**Publication safeguards.** A document with any problem is refused with every problem listed, and nothing is half
saved. A manual challenge replaces an *automatic* pick for its date only if nobody has answered the automatic one; a
second *manual* challenge for a date is refused — unpublish the first. Once anyone has answered a challenge:

- it can't be unpublished, and its date never moves;
- any change at all — text included — needs a higher `version` **and** a `"correction": "why"` note. Everyone keeps
  the result they were graded with (it's snapshotted in their attempt); the old content stays in
  `public.daily_challenge_history`. This is the controlled correction process; there is no silent edit.

### Upcoming and recent challenges

```sql
select challenge_date, id, title, lifecycle, source, source_scenario_id, format, difficulty, attempts
from content_admin.daily_schedule
where challenge_date >= public.daily_challenge_today() - 7
order by challenge_date, lifecycle;
```

`lifecycle`: `draft` · `scheduled` (published, date ahead) · `live` (today) · `archived` (a past day: read-only history,
open for practice).

### Scenario usage and the automatic selection

```sql
-- Which scenarios have been used, how often, when last, and which are cooling down.
select scenario_id, lesson_id, title, format, difficulty, uses, automatic_uses, last_used, cooling_down, enabled
from content_admin.daily_scenario_report order by last_used desc nulls last, scenario_id;

-- What the automatic selection would pick for tomorrow (first row), and why.
select * from content_admin.daily_candidates(public.daily_challenge_today() + 1) limit 5;

-- Exclude a scenario from automatic selection (a reason is required), and bring it back.
update public.daily_scenario_pool set enabled = false, exclusion_reason = 'Needs a clearer standalone intro' where scenario_id = 'l4.c.focal-meeting';
update public.daily_scenario_pool set enabled = true, exclusion_reason = null where scenario_id = 'l4.c.focal-meeting';

-- The cooldown (days before a scenario can be picked again automatically; default 30).
update public.competition_settings set daily_cooldown_days = 30;
```

The pick order: not cooling down (if every scenario is, all compete — a challenge is always published) → never two
Hard days in a row → fewest appearances → its lesson featured longest ago → a different format from yesterday →
least recently used → a per-date hash. Over 66 days every scenario and all 22 lessons appear before any repeat.

### Participation and the leaderboard

```sql
select s.rank, coalesce(p.nickname, 'Anonymous player') as nickname, s.score, s.calibration, s.evaluation, s.submitted_at, s.field
from content_admin.daily_standings((select id from public.daily_challenges where challenge_date = public.daily_challenge_today() and status = 'published')) s
left join public.player_profiles p on p.user_id = s.user_id
order by s.rank nulls last, s.submitted_at;
```

Ranking: score (match 100 · defensible 60 · depends 40 · misconception 0), then calibration, then the earlier
answer; identical on all three → a shared rank. Practice is never recorded, so it can't appear here.

### Troubleshooting a missed daily activation

```sql
select * from content_admin.scheduler_health;                                   -- the last run of each step
select content_admin.ensure_daily_challenge(public.daily_challenge_today());    -- make today's exist now (safe)
select * from content_admin.validate_scenario_pool();                          -- expect no rows
select * from content_admin.validate_daily_challenges();                       -- expect no rows
```

If `ensure_daily_challenge` returns null, no scenario could be adapted: `validate_scenario_pool()` says why (usually
the content seed wasn't imported — run `supabase/seed.sql`). If the job isn't running at all, see Part 3.

---

## Part 2 · Game of the Week

### Prerequisite for the 18 Arena games

The five classic games run in SQL. The 18 Strategy Arena games run in the `arena-match` Edge Function. Until it is
deployed (`docs/GAME_OF_THE_WEEK.md` → Deploying) and switched on, automatic rotation uses the classics only and
scheduling an Arena game is refused with this message:

```sql
update public.competition_settings set arena_server_enabled = true;
```

### The 23 games

```sql
select game_id, title, engine, competition_ready, featurable_now, in_rotation, config, times_scheduled, last_featured
from content_admin.weekly_games order by engine desc, game_id;
```

### Schedule Gambit (or any game) for a future week

```sql
select id, number, game_id, config, source, starts_at, ends_at
from content_admin.schedule_game_of_the_week(p_game_id => 'gambit', p_week_start => '2030-03-11');
```

`p_week_start` is the Monday the week starts on (India time). Optional: `p_opponent`, `p_level`
(`easy`/`normal`/`hard`; classic games `easy`/`medium`/`hard`), `p_variant`, `p_length` (`short`/`standard`/`long`),
`p_max_attempts`, `p_note`. Anything you leave out comes from the game's standard configuration
(`public.competition_game_configs`).

Safeguards: the game must exist and be featurable; the configuration is validated against the game's own opponents,
levels and variants; the week must not have started; a finalized or cancelled week never changes. A manual choice
replaces an automatic pick for the same week; replacing an existing *manual* choice needs `p_replace => true`. Every
decision is recorded in `public.competition_schedule_audit` (append-only) with the database user who made it.

### Inspect the schedule, rotation and audit

```sql
select number, id, game_id, state, source, scheduled_by, starts_local, ends_local, max_attempts, matches, players, finalized_at
from content_admin.weekly_schedule order by number desc limit 20;

select * from content_admin.weekly_candidates('2030-03-25') limit 5;          -- what rotation would pick
select seq, competition_id, action, source, actor, note, at from public.competition_schedule_audit order by seq desc limit 20;
```

`state`: `scheduled` → `active` → `finalizing` (ended; a match already in progress may finish within the grace
period, default 15 minutes) → `completed`; or `cancelled`. Rotation never repeats last week's game and prefers the
game featured longest ago (never-featured games first).

### Leaderboards and champions

```sql
-- This week, live:
select s.rank, coalesce(p.nickname, 'Anonymous player') as nickname, s.score, s.secondary, s.score_label, s.attempts, s.achieved_at
from public.game_competitions c, game_engine.live_standings(c) s
left join public.player_profiles p on p.user_id = s.user_id
where c.id = (select id from content_admin.weekly_schedule where state in ('active', 'finalizing') order by number desc limit 1)
order by s.rank, s.achieved_at;

-- Champions, newest first:
select competition_number, competition_id, game_id, coalesce(nickname_snapshot, 'Anonymous player') as champion, score_label,
  decided_by, shared, runner_up_score, field_size, finalized_at
from public.weekly_champions order by competition_number desc;
```

### Failed or incomplete finalization

```sql
select * from content_admin.weekly_finalization_issues;   -- expect no rows
select public.finalize_due_competitions();                -- finalize anything overdue now (safe to repeat)
```

### Emergencies

```sql
-- Extend a running week or raise its attempt limit (never lowers it, never changes the game). Audited.
select * from content_admin.correct_competition('week-2030-w11', 'Server outage on Tuesday', p_ends_at => '2030-03-19 00:00+05:30', p_max_attempts => 4);
-- Cancel a week: no champion, no points, its matches kept for the record. Audited.
select * from content_admin.cancel_competition('week-2030-w11', 'Game rules bug found');
```

The game and configuration of a week that has started are never changed in place: cancel it and schedule a new week.

---

## Part 3 · The scheduler

Run `supabase/scheduler.sql` once. It enables `pg_cron`, removes the older `finalize-game-of-the-week` job if present
(one scheduler, not two), and runs `content_admin.run_scheduled_jobs()` every 5 minutes. Verify after 5–10 minutes:

```sql
select jobid, jobname, schedule, active from cron.job where jobname = 'tactiqo-competitions';
select status, return_message, start_time from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'tactiqo-competitions') order by start_time desc limit 5;
select * from content_admin.scheduler_health;    -- ok = true, last_run within minutes
select * from content_admin.scheduler_runs order by id desc limit 20;   -- the step-by-step log, with errors
```

Each run's steps (daily, weekly, finalize) are independent: one failing is logged and the others still run.
