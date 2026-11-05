# Observability: PostHog analytics, errors and crash reporting

*Implemented 5 November 2026 on `main` after `12aaf21` (uncommitted). PostHog React Native SDK 4.85.3, `@posthog/react-native-plugin` 2.13.0, `@posthog/cli` 0.19.0, Expo SDK 57.0.30, React Native 0.86.3.*

Tactiqo uses one PostHog project for:

- product analytics
- handled and unhandled errors
- native crashes
- (later) session replay

Supabase logs stay the source of truth for the backend. **Telemetry is off in every build until it is switched on** (see "Release gate").

## 1. How it works

```
app/_layout.tsx ── startObservability() ─► src/observability/start.ts
                     │                       resolves config (config.ts) → off, or creates the client (posthog.ts)
                     │                       follows: auth store → identity; settings → consent; sync status → errors
                     ├─ useScreenTracking() ─► routes.ts allow-list → one $screen per screen view
                     └─ ErrorBoundary ───────► Expo Router's recovery screen + one render_error report
features ── track(), reportError(), useGameTelemetry(), useLessonTelemetry()  (src/observability/index.ts)
data layer ── track(), reportError()                                        (src/observability/api.ts)
                     ▼
             core.ts: Telemetry engine — catalogue check (events.ts), privacy filter (privacy.ts), buffer until
             ready, error grouping and rate limits, identity and consent rules. Never throws, never blocks.
```

| File | Role |
|---|---|
| `events.ts` | The event catalogue: name, trigger, privacy class, allowed properties and their types |
| `privacy.ts` | Banned property names, value rules (ids, ints, bools, enums only), error-message scrubbing |
| `config.ts` | Whether this build sends anything (pure, tested) |
| `core.ts` | The engine: `track`, `screen`, `reportError`, `setUser`, `setConsent`, buffering, rate limits |
| `lifecycle.ts` | Match and lesson state machines (started / finished / exited), tested |
| `routes.ts` | Expo Router route → screen name allow-list |
| `posthog.ts` / `.web.ts` | The only place the SDK is constructed (all options documented in the file); no SDK on web |
| `start.ts` | Start-up wiring |
| `hooks.ts` | React hooks over `lifecycle.ts` and `routes.ts` |
| `ErrorBoundary.tsx` | Route error boundary that reports |
| `Sensitive.tsx` | Masks personal text in session replay |
| `api.ts` / `index.ts` | The public interface. `api.ts` exists so `src/data` can import without a cycle |

**Rules enforced by tests** (`src/observability/__tests__`):

- No file outside `src/observability` imports the SDK.
- No event can list a banned property.
- Every app route is either tracked or deliberately ignored.
- The event list is a reviewed snapshot.

## 2. Configuration and environments

| Variable | Where | Meaning |
|---|---|---|
| `EXPO_PUBLIC_POSTHOG_ENABLED` | EAS env per environment, `.env` locally | Must be exactly `true`, or nothing is sent. **The release gate.** |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | EAS env, `.env` | The *project* key (`phc_…`), public by design. A personal key (`phx_…`) switches telemetry off |
| `EXPO_PUBLIC_POSTHOG_HOST` | EAS env, `.env` | `https://eu.i.posthog.com` (default) or the US host |
| `EXPO_PUBLIC_POSTHOG_REPLAY_SAMPLE_RATE` | EAS env | 0–1; `0`/unset means session replay is off (the default) |
| `POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_PROJECT_ID`, `POSTHOG_CLI_HOST` | **EAS secret** only | Source-map and native-symbol upload during builds. Never `EXPO_PUBLIC_`, never committed |

**Environment.** It comes from the EAS build profile (`app.config.js` → `extra.observability.environment`):

- `development` for local runs and development builds
- `preview` for preview builds
- `production` for production builds

Every event carries it as `environment`. One project, filtered by `environment = production` in dashboards. The web build never sends anything.

**What every event carries.** The SDK's own `$app_version`, `$app_build`, `$os_name`, `$os_version`, `$device_manufacturer`, `$device_name` and `$locale`, plus:

- `environment`
- `git_sha` (the EAS build commit)
- `content_revision` (sum of lesson and scenario revisions)
- `auth_state` (`guest` / `signed_in`)

**Not set up:** OTA updates (`expo-updates` isn't installed, and wasn't added for this). If you add OTA later, upload each update's maps after publishing:

```bash
npx eas-cli@latest update --platform android
```

```bash
npx posthog-cli hermes upload --directory dist
```

Run it one platform at a time.

## 3. Manual setup (you)

1. **Region.** Choose EU or US once; it can't be changed after connecting. EU is recommended. Confirm against your privacy policy's processor list.
2. **Connect** (needs a browser login):
   ```bash
   npx eas-cli@latest integrations:posthog:connect
   ```
   Pick the region, keep **Error tracking** on, and turn **Session replay** on only if you want the plugin's replay flag set. It creates the project, writes `EXPO_PUBLIC_POSTHOG_API_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` to `.env.local` and EAS, and asks for a personal API key with the "Source map upload" preset (stored as `POSTHOG_CLI_*`).
   - `app.config.js` is dynamic, so the command prints the plugin entry instead of editing it. **Don't add it.** `app.config.js` already adds `posthog-react-native/expo` whenever `POSTHOG_CLI_API_KEY` is set.
   - It may also try to install packages; they are already installed.
3. **EAS variables:** set `EXPO_PUBLIC_POSTHOG_ENABLED=true` for `development` and `preview` only, so you can test. Leave `production` without it until the release gate (§9).
4. **PostHog project settings:**
   - Error tracking → **Enable exception autocapture**. Without it, the SDK's autocapture handlers stay inactive.
   - Project → **Discard client IP data**: on.
   - Session replay → "Record user sessions": off, until §7 is done.
   - Data retention: set it to match the policy (§8).
   - Filter out internal and test users: add your own account's person to a "Team" cohort and filter it out, plus `environment != production`.
5. **Build a preview APK** and run the device checks in §10:
   ```bash
   npx eas-cli@latest build --profile preview --platform android
   ```

## 4. Event catalogue

Full definitions, triggers and property types are in `src/observability/events.ts`.

| Area | Events | Fires at |
|---|---|---|
| Onboarding | `onboarding_step`, `onboarding_finished` | `app/onboarding.tsx` stage changes; finish or skip |
| Learning | `lesson_started`, `lesson_completed`, `lesson_exited` | `useLessonFlow` (all 22 lessons) via `LessonTracker` |
| Learning | `scenario_completed` | `ScenarioPlayer`, when a run reaches its result |
| Learning | `checkpoint_submitted` | Checkpoint submit (pass/fail plus a score band) |
| Games | `game_started`, `game_finished`, `game_exited` | Arena practice (`app/arena/play.tsx`, Cooperation), classic practice / ranked / friend (`app/games/play.tsx`), ranked Arena (`app/games/ranked.tsx`), via `MatchTracker` |
| Games | `reflection_link_opened` | Post-game reflection's lesson link |
| Daily | `daily_submitted` | Official or practice answer checked (`official`, `result`) |
| Stories | `story_started`, `story_finished` | Story screen open; ending reached (stories store) |
| Social | `challenge_link_created`, `challenge_link_opened`, `nickname_set` | Challenge create, link open, nickname save |
| Account | `sign_in_started`, `sign_in_finished`, `sign_in_invite_dismissed`, `signed_out`, `account_deleted`, `analytics_opted_out` | `SignInPanel`, `src/data/session.ts`, invite, Settings toggle |
| Performance | `app_ready` | Cold start finished: `total_ms`, `catalog_ms`, `categories_ms`, result |
| Billing (reserved) | `paywall_viewed`, `plan_selected`, `checkout_started`, `checkout_result`, `purchase_restored` | **Refused until billing exists.** Revenue must come from RevenueCat's server integration, not the app |
| SDK | `Application Installed/Updated/Opened/Became Active/Backgrounded`, `$screen`, `$exception` | Lifecycle, the screen allow-list, errors |

**Design decisions:**

- **Game of the Week** is `game_*` with `mode: ranked`, not separate events.
- **Replays** are derived (`game_started` count per person and game; lesson `is_replay`), not sent as events.
- **Dropped from the earlier plan:** `play_number`. Replay counts come from the event history instead.

**Never sent:**

- answers, predictions, confidence ratings, verdicts
- reflection or any typed text
- nicknames, emails, names
- tokens
- seeds, hidden roles, a mystery opponent's identity (only `mystery: true`)
- query parameters, request or response bodies

**Budget estimate:**

- Per session: about 3 lifecycle events, plus screens, plus about 6 product events.
- That's roughly 100 events per active user per month, so about 10k monthly users fit in the free tier.
- Check PostHog's current pricing and your Billing page monthly.

## 5. Errors and crashes

| Captured | How |
|---|---|
| Uncaught JS exceptions, unhandled promise rejections | SDK autocapture (`posthog.ts`); requires "Enable exception autocapture" in the project |
| Render errors | `src/observability/ErrorBoundary.tsx` wraps Expo Router's boundary; one report (`render_error`, fatal). Console capture is off, so no duplicate |
| Native Android (Java/Kotlin) and iOS crashes | `nativeCrashes: true`, through `@posthog/react-native-plugin`. Reported on the next launch. Not in Expo Go |
| Android NDK (C/C++) crashes | `androidNdkCrashes: true` (Android 12+, plugin ≥ 2.12). Reported on the next launch |

**Handled failures** (`reportError`) are grouped by `$exception_fingerprint = kind:code`. Each is reported at most 3 times per session, with 50 reports per session in all.

| Kind | Reported when | Not reported |
|---|---|---|
| `startup_failed` | The start-up error screen, except for no connection | Offline start (that's `app_ready` with `result: error`) |
| `sync_failed` | Progress sync refused for good, or retrying for over 5 minutes | Ordinary retries |
| `rpc_failed` | Missing function or table (PGRST2xx), bad data or permission (22/23/42), server 5xx | Network, expired session, the functions' own refusals (P0xxx) |
| `arena_upload_failed` | The server refused an Arena summary batch (it is dropped) | Transient failures |
| `sign_in_failed` | Any sign-in failure except no connection | Cancelling (it's `sign_in_finished` with `result: cancelled`) |
| `delete_account_failed` | Deletion failed, except no connection | — |
| `ranked_move_failed` | `invalid_request` or an unexpected server error on a ranked move | Stale step, week closed, illegal move, connection lost |
| `audio_failed` | A narration clip can't play (warning) | — |

**Context on every error:**

- the screen (`route`)
- the operation, RPC name and error code
- the game, lesson or scenario id
- every event's common properties
- device and OS
- **exception steps**: the last screens and events, as breadcrumbs

**Source maps and symbols:** `metro.config.js` adds PostHog's serializer (debug ids). When `POSTHOG_CLI_API_KEY` is present at build time, `app.config.js` adds the `posthog-react-native/expo` plugin with `uploadNativeSymbols: true`. That uploads Hermes source maps, Android mapping files and `.so` symbols on Android, and dSYMs on iOS. Without the key, builds still succeed: the plugin's upload step would otherwise fail the build.

**Backend:** Supabase stays the source of truth. Look in these places:

- Edge Function logs for `arena-match` (Dashboard → Edge Functions → arena-match → Logs; 5xx include the request context)
- Postgres logs
- `content_admin.scheduler_runs`
- `weekly_finalization_issues`

The app's `rpc_failed` and `ranked_move_failed` carry the RPC or operation name, to match against them. There's no server-side PostHog integration (not needed yet).

## 6. Identity, consent and account deletion

| Situation | What happens (`core.ts` `setUser`, driven by the auth store in `start.ts`) |
|---|---|
| Guest | Anonymous PostHog id; no person profile (`personProfiles: identified_only`) |
| Guest signs in | `identify(supabase uuid)`. The guest's earlier events join that person. No email or name is sent |
| App opens with a session | `identify` only after `getUser()` confirmed it (`restored`) |
| Sign-out, revoked session | `signed_out` (sign-out only) → `reset()` → new anonymous id |
| Switch account | `reset()` before `identify(next)` |
| Account deletion | `account_deleted` → `reset()` |
| "Share usage and crash data" off | `analytics_opted_out`, then `optOut()`: nothing more is sent, including errors. Stored in device settings (`shareUsageData`), so it survives sign-out. Re-applied after every `reset()`, which would otherwise clear it. Applied before the SDK sends anything at start-up (`defaultOptIn`) |

### Account deletion: what is and isn't done

- **Done:**
  - Deletion resets the device's analytics identity.
  - PostHog never receives an email, name or nickname; the only link to a person is the Supabase UUID.
  - Deleting the account deletes that UUID's `auth.users` row, so no one can map the PostHog person back to a Google account (except database backups, within Supabase's backup retention).
- **Not done:** PostHog's own person and events for that UUID are **not deleted**. Deleting them needs PostHog's admin API with a personal API key, which must never be in the app.

**Decision needed before production** (legal and privacy review):

- **(A) Pseudonymous retention.** State in the privacy policy that usage and crash data are pseudonymous, kept for N months (set PostHog's retention to match), and not linked to the person after account deletion. No code.
- **(B) Server-side deletion.** A Supabase Edge Function, called with the user's JWT just before `delete_my_account`, deletes the PostHog person (`/api/projects/:id/persons/` with a secret stored in Supabase). On failure, it writes the UUID to a small `analytics_deletion_queue` table (a new migration) that a pg_cron job retries. The account deletion itself never waits on PostHog.

Until then, **don't claim in the policy or Data Safety that deletion removes analytics data.**

## 7. Session replay

- **Built in, off.** `EXPO_PUBLIC_POSTHOG_REPLAY_SAMPLE_RATE` defaults to 0. The option is read once at start-up, so turning it off needs no remote flag.
- **Settings:** all text inputs and all images masked, sandboxed views masked, console logs and network telemetry not captured, RGB_565 screenshots, a 1 s throttle.
- **Masked with `<Sensitive>`:** the account email and the player's nickname in Settings.

**Before raising the rate above 0**, all of these must pass:

1. **Check on a device** whether `maskAllTextInputs` masks plain text as well as inputs. The SDK's comment says "all text and text input fields".
2. **If it doesn't, wrap other players' nicknames in `<Sensitive>`** in:
   - `app/leaderboard.tsx` (rows and Hall of Fame)
   - `app/daily/leaderboard.tsx`
   - `app/competitions/index.tsx`
   - `app/competitions/[id].tsx`
   - `app/(tabs)/games.tsx` (last week's champion)
   - `src/features/games/ui/GameRecordCard.tsx`
3. **Record one session on a low-end Android phone:** frame drops, memory, battery.
4. **Update the policy** to mention recordings.
5. **Then start at 0.1** in production.

## 8. Privacy policy and Play Data Safety (to do before switching production on)

The current website policy says the app has "no advertising, analytics or crash-reporting SDKs" and describes anonymous accounts. Both are wrong once this ships. Text to adapt (not legal advice):

> **Usage and diagnostics.** If "Share usage and crash data" is on (Settings → Experience), the app sends pseudonymous usage events to PostHog (our analytics provider, hosted in the [EU/US]): which screens, lessons, scenarios, games and stories you open and finish, how long they take, sign-in outcomes, how long the app takes to start, and crash and error reports (the error, the app version, your device model and OS version, and the screens and actions just before it). Events are linked to a random analytics id, and, if you are signed in, to your account's internal id — never your name, email, nickname, answers or anything you type. You can turn this off at any time in Settings; it stops at once. We keep this data for [N] months. [Deletion: A or B above.]

**Play Data Safety:**

| Category | Item | Collected | Shared | Purpose | Optional |
|---|---|---|---|---|---|
| App activity | App interactions | Yes | No (PostHog is a service provider) | Analytics, app functionality | Yes (the toggle) |
| App info and performance | Crash logs, Diagnostics | Yes | No | Analytics (diagnostics) | Yes |
| Device or other IDs | The analytics id, plus the account id when signed in | Yes | No | Analytics | Yes |

- Encrypted in transit: yes.
- Deletion: describe exactly what decision A or B does.
- Re-check the Play definitions when filling the form.

## 9. Release gate

Production collection stays off (`EXPO_PUBLIC_POSTHOG_ENABLED` unset for `production`) until:

1. The privacy policy is updated (§8) and the Data Safety form matches.
2. The deletion decision (A or B) is made, and the policy says what it does.
3. The **consent default** is confirmed. The code defaults "Share usage and crash data" to **on**, with a disclosed opt-out (`DEFAULT_SETTINGS.shareUsageData` in `src/store/settings.ts`). If the legal review requires opt-in, change that one default to `false`.
4. The device checks in §10 pass on a preview build, including readable stack traces.

## 10. Device verification (preview APK; not yet done)

Use this as a checklist:

- [ ] `app_ready`, screens and lesson / game events appear in Live events with `environment = preview`.
- [ ] A test JS exception (temporary button; remove it afterwards) shows original `.ts` file and line numbers.
- [ ] A render error shows the recovery screen and one `render_error`.
- [ ] A native crash (temporary) is reported on the next launch, with readable frames.
- [ ] An NDK crash is reported on Android 12+.
- [ ] Offline start, then reconnect: queued events arrive with their original times.
- [ ] Sign in: `identify` with the UUID, `sign_in_finished` success, `is_new_account` correct.
- [ ] Sign out: a new anonymous id.
- [ ] Switching accounts: the second account has no first-account events.
- [ ] Turn the toggle off: no further events or exceptions. Sign out and in: still off.
- [ ] Delete account: `account_deleted`, then a new anonymous id.
- [ ] Background and foreground: lifecycle events; no duplicate screens.
- [ ] A failed RPC (e.g. against a project without the v2 migrations): one `rpc_failed` with `rpc` and `PGRST202`.
- [ ] Before any replay: the §7 checks.
- [ ] Repeat the native checks on iOS before an iOS release. The New Architecture compatibility of `@posthog/react-native-plugin` is confirmed only by a real build.

## 11. Dashboards and alerts (create in PostHog; not created from here)

Filter every insight on `environment = production` and exclude the "Team" cohort.

| Dashboard | Insights |
|---|---|
| **App health** | Error tracking → Issues (sort by users affected); Trends: `$exception` count and unique users, broken down by `$app_version`, and by `$os_name`; Trends: `$exception` with `$exception_level = fatal` or native crash type |
| **Activation** | Funnel (14-day window, by person): `app_ready` → `onboarding_finished` → `lesson_started` → `lesson_completed` → `game_finished`; Retention: `app_ready` → `app_ready`, 7 days |
| **Learning** | Trends: `lesson_started` vs `lesson_completed` by `lesson_id`; `lesson_exited` broken down by `lesson_id` and `step` (where people stop); `scenario_completed` by `lesson_id`; `checkpoint_submitted` by `passed` |
| **Games** | Trends: `game_started` / `game_finished` / `game_exited` by `game_id`; completion rate (formula: finished ÷ started) by `game_id`, `level`, `mode`; repeat play: users with `game_started` ≥ 2 per `game_id` (stickiness); `game_finished` by `outcome` and `level`. Not a balance verdict without a large sample |
| **Retention** | Retention (`Application Opened` → `Application Opened`) D1 / D7 / D30, by first `$app_version` and by `auth_state` |
| **Reliability** | `app_ready.total_ms` median and p90 by `$app_version`; `app_ready` by `result`; `$exception` where `error_kind` in `startup_failed`, `sync_failed`, `rpc_failed`, `sign_in_failed`, by `rpc` / `error_code`; `sign_in_finished` by `result` |

**Alerts (email):**

- Error tracking → issue alerts for **new issues** and **regressions** (production).
- Spikes: an insight alert on `$exception` unique users over 1 hour, above 2× the baseline (set it after two weeks of data).
- Insight alerts:
  - `app_ready` with `result = error` above 2% of `app_ready` per day.
  - `sign_in_finished` with `result = failed` above 10% per day.
  - `sync_failed` above 5 users per day.

## 12. Status

| Area | Status | Evidence |
|---|---|---|
| Observability layer, catalogue, privacy filter, config gate | **PASS** | 36 tests in `src/observability/__tests__`; full suite 1,384/1,384 |
| No SDK calls outside the layer | **PASS** | Architecture test |
| Disabled mode and web | **PASS** | Config tests; web export builds without the SDK and starts with no errors and no PostHog requests (static web build, 360 px) |
| Event hooks in lessons, scenarios, checkpoints, games (all modes), daily, stories, social, auth, start-up | **PARTIAL** | Wired, typechecked and lifecycle-tested; never observed arriving in PostHog (no project or device) |
| Identity and consent rules | **PARTIAL** | Unit-tested, including consent surviving `reset()`; not exercised with real Google sign-in |
| JS, render, native and NDK crash capture | **BLOCKED** | Configured; needs the PostHog project plus a preview build on a device |
| Source maps and native symbols | **BLOCKED** | `metro.config.js` and the conditional plugin are in place, and prebuild config evaluation passes; needs `POSTHOG_CLI_*` secrets and a build |
| Session replay | **NOT IMPLEMENTED (off)** | Code ready at 0%; the §7 checks are pending |
| Account deletion of PostHog data | **BLOCKED** (decision) | §6, A or B |
| Privacy policy and Data Safety | **BLOCKED** (owner) | §8 text drafted; the website is not changed |
| Dashboards and alerts | **NOT IMPLEMENTED** | No project access; definitions in §11 |
| Website analytics, billing events | **NOT IMPLEMENTED** | Phase 2 / future, by design |
