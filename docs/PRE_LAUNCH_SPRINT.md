# Pre-launch engineering sprint (2026-11-06)

The code-side pre-launch work: Google-only auth guards, nickname rate limiting, PostHog data deletion, opt-in analytics consent, About & Support, local data cleanup, accessibility and copy polish, reflection-link integrity, and cleanup. Nothing here is deployed. The manual steps are at the end.

Statuses: **DONE** (implemented and tested in the repo), **PARTIALLY DONE**, **BLOCKED**, **NOT IMPLEMENTED**, **NEEDS DEVICE TESTING**. "DONE" never means deployed or verified end to end on a phone.

## Summary

| Area | Status | Notes |
|---|---|---|
| A. Google-only auth | DONE (code) · NEEDS DEVICE TESTING | Already Google-only; a guard test now fails if email/password, OTP, magic links, reset or anonymous sign-in come back. Live dashboard still had email sign-ups on (audit V2) — manual |
| B. Nickname rate limiting | DONE (code) · not applied live | 3 changes / rolling 24 h (first free), 10 attempts / hour including refusals, per-user advisory lock. One-time audit SQL |
| C. Account deletion + PostHog | PARTIALLY DONE | Queue, worker, retries, retention, admin path all tested; not deployed; needs a PostHog personal key and Supabase secrets |
| D. Analytics consent | DONE (code) · NEEDS DEVICE TESTING | Explicit opt-in, default off; no SDK before consent; one-time card on Learn; replay off in code |
| E. About & Support | DONE (code) | New `/about` and `/licenses` screens; Settings has one entry |
| F. Local data and sign-out | DONE (code) | Export file in cache registered and cleared; sign-out dialog lists what's kept and removed; report copy corrected |
| G. Contrast, scaling, copy | PARTIALLY DONE | Text tokens pass AA (tested); font scaling capped at 1.6×; empty states unified. Input/card borders not changed (below); not checked on a phone at large font sizes |
| H. Reflection links | DONE | Integrity test against the seed catalogue |
| I. TTS function | DONE (repo) · live deletion manual | Directory removed; tsc now 0 errors |
| J. Dependencies | DONE | Removed i18next, react-i18next, nativewind, tailwindcss. Kept expo-symbols (a dependency of expo-router) |

## Design decisions made in this sprint

- **Nickname refusals are returned, not raised.** A raised exception rolls back the request, which would erase the record of a refused attempt, so refused attempts could never count towards the hourly limit. `set_nickname` now answers `{"refused": "games:nickname_<reason>"}` (same codes as before, plus `games:nickname_rate_limited`). The app maps that to the same `GameError`s.
- **ASCII-only nicknames are deliberate.** `^[A-Za-z0-9][A-Za-z0-9 _.-]*$` keeps look-alike Unicode letters out entirely, so there is nothing to normalize. Uniqueness stays on the lower-case, separator-free key.
- **The PostHog queue verifies, not just requests.** PostHog's `bulk_delete` returns 202 and deletes events and recordings later. A row is `done` only once a later lookup finds no person for the id. A 404 is treated as a configuration error, never as "deleted".
- **Analytics are flushed before deletion, and `account_deleted` is sent anonymously after it.** Otherwise a late event under the deleted id could re-create the PostHog person.
- **Old consent values:** a stored `shareUsageData: true` came from the old default, so it becomes `unset` (asked again). A stored `false` was an explicit switch-off, so it becomes `denied`.
- **No farewell event on opt-out.** The old `analytics_opted_out` event is removed: nothing is sent after the player says no.
- **The consent card shows only where analytics can run** (a native build with telemetry switched on). Web and builds with telemetry off never ask.
- **The licence list covers the full production tree from package-lock.json** (612 packages, 246 distinct texts, 460 KB). It deliberately includes build-time packages that `expo` depends on, rather than guessing what ships in the binary. It is loaded only when the screen opens.
- **`npx expo install --fix` was not run.** expo-doctor reports 6 patch-level mismatches (`expo` 57.0.30 → 57.0.32, and `expo-asset`, `expo-constants`, `expo-router`, `expo-sharing`, `expo-splash-screen`). They were there before this sprint (newer SDK 57 patch releases) and aren't caused by the removals. Upgrading is unrelated to this work and should be done with a device build.

## Known limitations

- **Input and card borders** (`borderStrong` / `border`, translucent slate) are below 3:1 against cards. WCAG 1.4.11 asks 3:1 for the boundary of inputs when it's the only way to see them. Raising it changes the visual identity, so it's left for a design decision. Text inside fields, placeholders and labels all pass.
- **Large-font layout** is reasoned and guarded by tests (scaling cap, `minHeight` on text chips), not checked on a phone at the largest system size.
- **Concurrency** of the nickname limit and the deletion claim is enforced by an advisory lock and `FOR UPDATE SKIP LOCKED`. PGlite runs one transaction at a time, so the tests check sequential correctness and the presence of the guards, not a real race.
- **Website legal pages** still describe anonymous accounts and say there's no analytics. They're out of scope here and must be updated before production analytics.
- **Service-role key:** the worker's SQL grants are minimal, but the service-role key itself is an admin key (it can delete users through the Auth admin API). Keep it only in the Edge runtime.

## Manual steps (outside the repository)

In order. None of these has been done.

### Supabase dashboard

1. Authentication → Providers: **Email off, sign-ups off**. Confirm **anonymous sign-ins off** and Google on. Check with `GET <project>/auth/v1/settings` (expect `external.email: false`, `disable_signup` true for email, `anonymous_users: false`).
2. Apply the pending migrations in order, including the earlier v2 ones the audit found missing (`20261105120000`, `20261105120100`, `20261105120200`), then `20261104120100_nickname_rules.sql` if missing, then **`20261106120000_nickname_rate_limit.sql`** and **`20261106120100_account_deletions.sql`**.
3. Run the read-only nickname audit `supabase/games/nickname-audit.sql` and review any flagged names by hand.
4. Delete the old template function: `npx supabase functions delete text-to-speech`. It had no secrets of its own. If a `GOOGLE_TTS_API_KEY` was ever set as a *function* secret, remove it with `npx supabase secrets unset GOOGLE_TTS_API_KEY`. The local `.env` key used by `scripts/generate-tts.mjs` for build-time narration is separate; keep it.

### PostHog and the deletion worker (docs/ACCOUNT_DELETION.md → Deployment)

5. Create a **personal API key** scoped to the project, with `person:read` and `person:write` only.
6. `npx supabase secrets set DELETION_WORKER_SECRET=… POSTHOG_PERSONAL_API_KEY=phx_… POSTHOG_PROJECT_ID=… POSTHOG_HOST=https://eu.posthog.com`
7. `npx supabase functions deploy posthog-deletion --no-verify-jwt`
8. Enable `pg_net`, create the two Vault secrets, and run the PostHog block of `supabase/scheduler.sql`.

### Google Cloud

9. OAuth consent screen and clients, as in docs/AUTHENTICATION.md. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` only if you use the native flow.

### Website (separate repository)

10. Update Privacy, Terms and Delete Account. Privacy must cover: Google sign-in email stored by Supabase; analytics only with opt-in; deletion of analytics data on account deletion; hosting regions. Draft text is in docs/OBSERVABILITY.md §8. Remove the "Draft" label.

### Device testing (preview APK)

11. Google sign-in, sign-out, account switch. A cancelled sign-in shows no error.
12. Fresh install: no PostHog traffic until "Share"; "Not now" hides the card for good; the Settings switch works both ways.
13. Nickname: set it, rename 3 times, the 4th is refused with "You've changed your nickname a lot recently".
14. Delete a test account. Within ~30 minutes, `public.account_deletions_health` shows it `done` and the person is gone in PostHog.
15. About & support, licences, and every screen at the largest system font size.
16. Only then switch production analytics on (`EXPO_PUBLIC_POSTHOG_ENABLED=true` in the production EAS environment). See docs/OBSERVABILITY.md §9.
