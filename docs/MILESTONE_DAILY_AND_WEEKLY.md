# Milestone: Daily Challenge v2 and Game of the Week v2 — implementation report

Date: 2026-11-05. Branch `claude/tender-einstein-6fsia8`. Feature docs: [DAILY_CHALLENGE.md](DAILY_CHALLENGE.md),
[GAME_OF_THE_WEEK.md](GAME_OF_THE_WEEK.md), [SQL_EDITOR_OPERATIONS.md](SQL_EDITOR_OPERATIONS.md).

## A. Investigation findings

**What existed.** Daily Challenge v1 was substantial: tables for challenges, private keys, attempts and history; a
SQL publishing function with validation; server grading for `choice`/`number`/`scenario`; one official attempt per
day (idempotent); practice graded but never recorded; RLS; a calendar UI. Game of the Week v1 was also real for the
five classic games: exact SQL ports of their engines, server-run rounds, three attempts with an advisory lock,
lazy finalization, leaderboards, a Hall of Fame.

**What was incomplete.** Daily: UTC days (not India), no automatic content (an unpublished day stayed empty), no
scenario pool or usage history, no score or leaderboard, no scheduler, text edits allowed after answers. Weekly: only
5 of 23 games — the 18 Strategy Arena games ran only on the device (records were explicitly unverified); manual SQL
scheduling only, no rotation, no audit, no lock before the first match, no grace period, ties broken only by time,
no champion snapshot, no competition history screens, the client schemas accepted only the 5 classic ids.

**What was reused.** The v1 tables, keys, history, grading and publishing validation (wrapped, not rewritten); the
classic SQL engines and match functions; nicknames; the 18 Arena engines unchanged in their rules (one `servedOf`
seam added to their prompt helpers); the boards, result chrome, scenario visual renderer and lesson components.

## B. Database changes

Migrations (apply in order after the existing ones):

| File | Adds / changes |
|---|---|
| `20261105120000_daily_challenge_v2.sql` | `competition_settings` (timezone, cooldown, weekly settings); `daily_challenge_today()` → Asia/Kolkata; daily columns `source`, `source_scenario_*`, `format`, `concept`, `minutes`, `scoring_version`, `correction_note`; attempt columns `score`, `calibration`, `scoring_version` (back-filled); `daily_scenario_pool` (66 rows), `daily_scenario_usage` (unique per date when not superseded); stricter guard; `daily_problems_v2`, `publish_daily_challenge` v2, `publish_scheduled_challenge`, `unpublish_daily_challenge`, `daily_doc_of`, `preview_daily_challenge`, `daily_candidates`, `daily_doc_from_scenario`, `ensure_daily_challenge`, `validate_scenario_pool`, `daily_score`, `daily_standings`; views `daily_schedule`, `daily_scenario_report`; client RPCs `ensure_daily_challenge_today`, `get_daily_leaderboard`, `get_daily_history`; `get_daily_challenges`/`submit_daily_challenge` v2 |
| `20261105120100_game_of_the_week_v2.sql` | `game_definitions` +18 Arena games (`engine`, `variants`, `competition_ready`); `arena_server_enabled` setting; `competition_game_configs`; competition columns `number` (unique), `config`, `rules_version`, `source`, `scheduled_by`, `grace_seconds`, `cancel_*`; match columns `config`, `actions`, `score`, `secondary`, `outcome`, `score_label`, `result`, `debrief`; result columns `secondary`, `score_label`, `attempts_used`, `nickname_snapshot`, `outcome`; `weekly_champions` (immutable, back-filled from v1 winners); `competition_schedule_audit` (append-only); guard v2 (locked once started); rotation, `schedule_game_of_the_week`, `ensure_competitions`, `cancel_competition`, `correct_competition`, finalization v2; service-role-only `arena_match_load`/`arena_match_commit`; client RPCs v2 and `get_competition`, `get_competition_history`, `get_champions_leaderboard`; views `weekly_games`, `weekly_schedule`, `weekly_finalization_issues`; practice and friend challenges restricted to the classics |
| `20261105120200_scheduler.sql` | `content_admin.scheduler_runs`, `run_scheduled_jobs()`, `scheduler_health` |

RLS: every new table has RLS on and no client grant; all reads and writes go through SECURITY DEFINER functions with
explicit checks. Admin functions live in `content_admin` (owner only). Edge Function: `supabase/functions/arena-match`.
Scheduler: `supabase/scheduler.sql` registers one pg_cron job (and removes the older finalize-only job).

## C. Daily Challenge

Hybrid content (manual first, else an adapted lesson scenario), controlled-random selection with a 30-day cooldown,
lesson spread, no back-to-back Hard days and format variety; idempotent activation from the scheduler and on read;
one official attempt, unlimited unrecorded practice; scoring by correctness with calibration as the tie-break; a
leaderboard; paginated history; source details withheld until answered; immutability with a versioned, noted
correction process. Details: [DAILY_CHALLENGE.md](DAILY_CHALLENGE.md).

## D. Game of the Week

All 23 games eligible and server-authoritative (5 in SQL, 18 in the Edge Function with redacted views). Automatic
rotation without consecutive repeats; manual scheduling (Gambit included) with an audit trail; explicit lifecycle;
locked configuration once started; 3 ranked attempts reserved at match creation; best counts; per-game scoring and
tie-breaks; 15-minute grace; permanent champion snapshots with shared titles on full ties; history and all-time
champions. Details and the 23-game table: [GAME_OF_THE_WEEK.md](GAME_OF_THE_WEEK.md).

## E. Mobile UI

- Learn tab: Daily card with title, short intro, difficulty, duration, status, score; Explanation / Leaderboard / Past
  days (never the answer).
- Daily play: rules and payoff visual for adapted challenges, format and duration badges, official score and
  calibration, the concept, leaderboard link; India-time day.
- New: `app/daily/leaderboard.tsx`, `app/daily/history.tsx`, `app/games/ranked.tsx`, `app/competitions/index.tsx`,
  `app/competitions/[id].tsx` (champion announcement + final leaderboard).
- Games tab: Game of the Week card for any game (number, configuration, attempts used, rank, scoring rules, a ranked
  confirmation, resume), last week's champion, Past weeks.
- Leaderboards / Hall of Fame: any game, score labels, attempts used, leader highlight, links to final results.
- Loading, empty, error-with-retry and signed-out states throughout; nothing is fabricated.

## F. SQL Editor

Executable, tested statements: `supabase/daily/manage.sql` (create, preview, schedule, publish, unpublish, schedule
view, scenario usage, leaderboard, health, recovery) and `supabase/games/manage.sql` (23 games, schedule Gambit,
upcoming/current, rotation, audit, leaderboards, champions, finalization, emergencies). Guide:
[SQL_EDITOR_OPERATIONS.md](SQL_EDITOR_OPERATIONS.md).

## G. Tests

| Suite | Result |
|---|---|
| `npm test` (all suites) | 1348 passed, 0 failed, 0 skipped (baseline before the milestone: 1264) |
| `npx tsc --noEmit` | 4 errors, all the known baseline in the unused `supabase/functions/text-to-speech/index.ts`; 0 elsewhere |
| `npx expo lint` | clean |
| `npx expo export -p web` | builds; every route pre-renders |

New suites: `supabase/__tests__/daily-v2.test.ts` (20), `weekly.test.ts` (36 — every one of the 23 games in a ranked
competition), `sql-editor.test.ts` (3), `src/competition/__tests__/arena-competition.test.ts` (22),
`arena-client.test.ts` (2). Existing tests changed only where the requirements changed behaviour: the day's
timezone (UTC → Asia/Kolkata), text edits and unpublishing after answers (now refused), the public-RPC allowlist
(five new public boards), the leaderboard's public field set (adds `scoreLabel`, `attemptsUsed`), the game
definitions count (now 23) and `schedule.sql` (now uses the rotation).

**UI verification.** The web export was driven with Playwright against a local stand-in for Supabase built from the
real migrations and content (PGlite) and the real `arena-match` handler: the Learn, Games, daily leaderboard and
history, weekly leaderboard, competition history and champion screens at 320/360/390/430 dp (no page errors, no
horizontal overflow); today's adapted challenge answered officially (score, calibration, explanation); a ranked
Gambit match started from the confirmation, resumed after a reload, finished, with its result and debrief.

**Not done:** native-device testing (iOS/Android builds — no device or simulator in this environment); the Edge
Function was not deployed to a hosted project (its handler is tested in Node against the real SQL); the pg_cron job
was not registered on a hosted project.

## H. Remaining work

**Release blockers (operational, not code):** deploy `arena-match` and confirm the CLI bundles the `src/` imports
(fallback documented); switch `arena_server_enabled` on; run `supabase/scheduler.sql` and verify it; apply the three
migrations and re-run `supabase/seed.sql` on projects without content.

**Non-blocking improvements:** analytics events (no analytics infrastructure exists, so none was added; server logs —
`scheduler_runs`, the schedule audit, Edge Function logs — cover debugging); a "you've seen this lesson scenario"
hint on adapted challenges; per-game competition copy beyond the scoring line; native-device QA of the new screens
(text scaling, VoiceOver/TalkBack); a web session issue found during testing (the legacy-session cleanup appears to
remove the live web session on every start — filed as a separate task).

**Known limitations:** answers to *adapted* lesson scenarios exist in the public lesson content (inherent in reusing
lessons; manual challenges are unaffected). Several Google accounts per person still mean more attempts per person.
