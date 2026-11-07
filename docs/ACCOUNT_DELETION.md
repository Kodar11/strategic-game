# Account deletion, including PostHog analytics data

What happens when a player deletes their Tactiqo account, how the analytics data linked to it is deleted from PostHog, and what an administrator does for a deletion request that arrives outside the app.

**Status (2026-11-06):** implemented and tested in the repository (PGlite against the real migrations, plus a fake PostHog API). **Not deployed.** The migration, the Edge Function, its secrets and the cron job are manual steps (end of this document). Nothing here has run against the live project or a real PostHog project.

## What is deleted

| Data | Where | How | When |
|---|---|---|---|
| The account and everything tied to it (progress, answers, Daily Challenge, nickname, games, Arena summaries, friend challenges created, nickname attempt log) | Supabase | `delete_my_account()` deletes `auth.users`; every table cascades | At once, in one transaction |
| PostHog person, their events and their session recordings | PostHog | `account_deletions` queue → `posthog-deletion` Edge Function → PostHog `bulk_delete` with `delete_events` and `delete_recordings` | Requested within ~15 minutes; PostHog removes events and recordings on its own schedule afterwards |
| Account data on the phone (Stories, Arena records, queued writes, exported file, analytics id) | Device | `clearAccountDeviceData()` and `posthog.reset()` (src/data/device-data.ts) | Once the server confirms the deletion |
| Device preferences (motion, haptics, narration, the analytics choice) | Device | Kept: they belong to the phone, not the account | — |

The app shows success only after the server confirms the account deletion. It never waits for PostHog, and the dialog says that analytics data is deleted in the background and can take a few weeks (PostHog deletes events in weekly batches).

## How it works

```
Delete account (app/settings.tsx)
  → src/data/session.ts deleteAccount()
      flushTelemetry(≤ 3 s)        queued analytics events reach PostHog first, so the deletion covers them
      delete_my_account()          ── one transaction ──────────────────────────────────────────────
                                     queue_account_deletion(uid)  → public.account_deletions (pending)
                                     delete from auth.users       → cascade
                                   ─────────────────────────────────────────────────────────────────
      clear device data, reset analytics identity, then send `account_deleted` as an anonymous event

pg_cron every 15 min (supabase/scheduler.sql) → pg_net POST → posthog-deletion (x-deletion-worker-secret)
  → account_deletions_claim(20, 300 s)      FOR UPDATE SKIP LOCKED + a lease: overlapping runs never share a row
  → per row, independently:
      submit:  GET /persons/?distinct_id=<id>   none → done · found → POST /persons/bulk_delete/ → verifying
      verify:  GET /persons/?distinct_id=<id>   none → done · still there → pending (sent again)
      error:   retry after 5 min, 30 min, 2 h, 12 h, then daily; failed after 12 attempts (≈ a week)
  → account_deletions_cleanup(30)            erases ids of rows done more than 30 days ago
```

### Atomicity

`delete_my_account()` calls `delete_account_and_queue()`, which inserts the queue row and then deletes the user. If the delete fails, the insert is rolled back too, and the reverse can't happen. Tested: `supabase/__tests__/account-deletion.test.ts`.

### The PostHog API (checked against PostHog's source, `posthog/api/person.py`, 2026-11-06)

- `GET /api/projects/:project_id/persons/?distinct_id=<id>`: exact match on any of a person's distinct ids. No match returns an empty `results`. Scope `person:read`.
- `POST /api/projects/:project_id/persons/bulk_delete/` with JSON `{"distinct_ids": [id], "delete_events": true, "delete_recordings": true}`. It accepts at most 1000 ids and returns **202**. Scope `person:write`. Event and recording deletion is **queued** by PostHog, and only events captured before the request are deleted.
- A **404** from either endpoint means a wrong host or project id, never "no person". It is treated as an error, never as done.

**Re-checked against PostHog's official docs** (posthog.com/docs/privacy/data-deletion, 2026-11-06, second pass):

- `bulk_delete` reports per-person failures in **`deletion_errors` inside a 202**, not as an error status. The worker now reads that list. Any entry means retry, and only the failed step names are recorded (e.g. `posthog delete accepted with errors (events)`). Before this pass, a 202 alone counted as submitted.
- Person deletion is queued and usually done within minutes. **Event deletion runs in batches during off-peak hours (weekends on PostHog Cloud).** A request must arrive about two days before a batch, or it waits for the next one. Recordings are crypto-shredded.
- Completion of the **event** deletion can be confirmed only through `GET /api/projects/:project_id/persons/deletion_status?person_uuid=…` (`delete_verified_at` is set when done). It is keyed by PostHog's person UUID, not the distinct id, and the docs list neither its scope nor its full response shape.
- **What `done` means here:** the PostHog person is gone (a lookup by distinct id finds nothing) **and** PostHog accepted the event and recording deletion without errors. It does **not** mean PostHog has finished deleting the events, which can take one or two weekly batches. The worker doesn't poll `deletion_status`. Adding that safely needs a real PostHog project to confirm the response shape and scope (see Known limitations below).
- The docs don't name the scopes. `person:read` + `person:write` is from PostHog's source. If a 403 shows up after deployment, the row records it and stays visible.

### Known limitations

- Event-deletion completion is not confirmed by the worker (above). For an audit, look the person UUID up in PostHog's deletion status, or ask PostHog support.
- Only events captured **before** the deletion request are deleted. The app sends nothing under the deleted id afterwards (flush first, then an anonymous `account_deleted`).
- The app's PostHog distinct id for a signed-in player is their Supabase user UUID (`src/observability/core.ts` identifies with it and nothing else). That is what the queue stores.

### Statuses

| Status | Meaning |
|---|---|
| `pending` | Waiting to send the deletion request (also after a check found the person still there) |
| `processing` | Claimed by a worker that is sending it (a lease; a crashed worker's claim expires after 5 minutes) |
| `verifying` | PostHog accepted (202); waiting to confirm the person is gone |
| `done` | PostHog has no person for this id: deleted, or there never was one (analytics never on). Event deletion was accepted and finishes on PostHog's batch schedule (not confirmed by the worker) |
| `failed` | 12 attempts without success. Visible in `public.account_deletions_health`, never silently dropped |

### What is stored, and for how long

- **Stored:** the Supabase user id as text (the PostHog distinct id), its SHA-256 fingerprint, the source (`app` / `admin`), timestamps, the attempt count and the last error. No email, nickname or name.
- **Errors** are reduced to an HTTP status and PostHog's short error code (e.g. `posthog delete 403 permission_denied (check the personal API key…)`). Response bodies, ids and keys are never stored or logged.
- **30 days after `done`**, the id is erased and only the fingerprint stays. The fingerprint can't be turned back into the id. It only lets support answer "was this account's analytics deletion completed?" for someone who still has the id.
- **`failed` rows keep the id**, because retrying needs it. Review them, fix the cause, then run `select public.account_deletions_retry_failed();`.

### Access

- `public.account_deletions` has RLS on, no policies, and no grants to `anon` or `authenticated`.
- The service role (the Edge Function) can only `select` from it and call `account_deletions_claim`, `account_deletions_report` and `account_deletions_cleanup`. It cannot delete accounts, delete rows or re-queue failures.
- `admin_delete_account()` and `account_deletions_retry_failed()` are callable only by the database owner (SQL Editor).
- The Edge Function runs with `verify_jwt = false`, because pg_cron has no user. It refuses every request before doing any work unless the `x-deletion-worker-secret` header matches `DELETION_WORKER_SECRET` (constant-time comparison, at least 32 characters). Without PostHog settings it returns 503 and claims nothing, so no attempts are burned.

All of this is tested in `supabase/__tests__/account-deletion.test.ts` and `supabase/__tests__/posthog-deletion.test.ts`.

## Deletion requests from outside the app

For a request made by email or through the website's deletion page (for example, the player no longer has the app):

1. **Verify the requester owns the account.** The request must come from the Google account's email address, or be confirmed from it. Look the user up in Supabase → Authentication → Users by that email and copy the user id. Never act on an id supplied by the requester.
2. In the **SQL Editor** (database owner), run:
   ```sql
   select public.admin_delete_account('<user id>');
   ```
   This is the same path the app uses: one transaction deletes the account, cascades its data and queues the PostHog deletion (`source = 'admin'`).
3. Check the queue after about 30 minutes:
   ```sql
   select status, attempts, last_error, completed_at
   from public.account_deletions
   where fingerprint = public.account_deletion_fingerprint('<user id>');
   ```
4. Reply to the requester once the account deletion is done, and say that analytics data is removed by PostHog over the following weeks (PostHog deletes events in weekly batches).

There is deliberately **no public endpoint** that takes a user id.

## Deployment (manual; not done)

1. **PostHog:** create a **personal API key** (Settings → Personal API keys) limited to this project, with scopes **`person:read` and `person:write`** only. Don't reuse the `POSTHOG_CLI_API_KEY` used for source maps. If PostHog requires another scope for recordings, the worker records `403 … check the personal API key` and the rows stay pending, then failed, so they're visible.
2. **Supabase function secrets:**
   ```bash
   npx supabase secrets set DELETION_WORKER_SECRET=<random ≥ 32 chars> POSTHOG_PERSONAL_API_KEY=phx_... POSTHOG_PROJECT_ID=<numeric id> POSTHOG_HOST=https://eu.posthog.com
   ```
   Use the **app host** (`https://eu.posthog.com` or `https://us.posthog.com`), not the ingestion host. The worker maps `*.i.posthog.com` to it anyway.
3. **Apply the migrations** `20261106120000_nickname_rate_limit.sql` and `20261106120100_account_deletions.sql`, after the earlier pending ones.
4. **Deploy the function:** `npx supabase functions deploy posthog-deletion --no-verify-jwt`
5. **Schedule it:** enable `pg_net`, store the two Vault secrets (`posthog_deletion_url`, `posthog_deletion_secret`), and run the PostHog block at the end of `supabase/scheduler.sql`.
6. **Verify:** delete a test account in a preview build. Within ~30 minutes, `public.account_deletions_health` should show it `done`, and PostHog should no longer list that person.
7. **Watch:** `select * from public.account_deletions_health;`. Expect no `failed` rows and no `pending` row older than a day.

Until step 6 passes, don't claim in the privacy policy or Play Data Safety that analytics data is deleted.
