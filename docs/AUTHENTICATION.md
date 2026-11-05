# Authentication: Google sign-in with Supabase

Tactiqo has one way to sign in: **Continue with Google**. It works for new and returning players alike. Signing in is optional. A guest can do the onboarding, lessons, practice games, Arena and Stories without an account.

There are no anonymous Supabase users, no email/password, no email sign-up, no password reset, no magic links and no email OTP. `src/auth/__tests__/google-only.test.ts` reads the source and `supabase/config.toml` and fails if any of these come back (a forbidden Supabase Auth call, a password field, "check your email" copy, a sign-up/reset route, or anonymous/email sign-ups switched on locally).

The email address Google provides stays in Supabase Auth (`auth.users.email`) and is shown only to its owner in Settings. It is never copied into `player_profiles`, leaderboards or analytics.

## Status at a glance

| Area | Status |
|---|---|
| Code: browser Google sign-in (PKCE, default) → `exchangeCodeForSession` | Implemented, **not verified on a device** (no Android SDK on the build machine) |
| Code: native Google sign-in (opt-in) → `signInWithIdToken` (nonce) | Implemented, **not verified on a device** |
| Code: guest mode, progress hand-over on sign-in | Implemented. Unit-tested; guest mode checked in the web preview |
| Code: secure session storage, refresh lifecycle, auth state | Implemented. Storage adapter unit-tested; not verified on a device |
| Code: sign-out, account switching, device-data cleanup | Implemented and unit-tested (owner marker, outbox race) |
| Code: account deletion (`delete_my_account`) + local cleanup | Server side verified against the real migrations; client flow not verified on a device |
| RLS and grants | Verified against the migrations (`supabase/__tests__/auth.test.ts`) |
| Google Cloud OAuth clients | **Requires Google Cloud configuration** |
| Supabase Google provider; anonymous and email sign-ups off | **Requires Supabase dashboard configuration** |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env` and EAS | **Requires configuration** |
| Android development build | **Requires an EAS build** (`eas build --profile development`) |
| iOS | Deferred. The architecture is ready; see the end of this document |

## How it works

```
Continue with Google
  → src/auth/google.ts       fresh random nonce; Google receives SHA-256(nonce)
  → Credential Manager       player picks an account → Google ID token (aud = Web client id, nonce claim)
  → src/data/session.ts      supabase.auth.signInWithIdToken({ provider: 'google', token, nonce })
  → Supabase Auth            verifies signature, audience, expiry, SHA-256(nonce) = claim;
                             creates the user the first time, signs in to the same user afterwards
  → Supabase session         access + refresh token, kept in the OS keystore (expo-secure-store)
  → loadAccount()            guest progress → outbox → server; then progress loads from Supabase
```

- **Source of truth.** The Supabase session decides who is signed in. The app never uses Google profile data for authorization. The Google ID token is used once and dropped. No Google access token is requested or stored, and the only scopes are `openid email profile`.
- **Identity.** The Supabase user UUID is the only identifier. Email is shown in Settings and is never used as a key. Every server function takes the user from the verified JWT (`auth.uid()`), never from the request.
- **One account per Google identity.** Supabase maps a Google `sub` to exactly one user. Nothing is merged or overwritten, and no duplicate identities are created.

### Code map

| File | Role |
|---|---|
| `src/auth/google.ts` / `google.web.ts` | Platform Google module: native picker + nonce; on web, "not available" |
| `src/auth/errors.ts` | Google/Supabase failures → plain messages; cancelling returns null (not an error) |
| `src/auth/state.ts`, `store.ts` | Auth state machine: `initializing · signedOut · signingIn · signedIn · signingOut · deleting` + recoverable `error` |
| `src/auth/chunked-storage.ts`, `session-storage.ts` | Supabase storage adapter over SecureStore, split into ≤1800-byte chunks |
| `src/data/supabase.ts` | The single client (foreground-only auto refresh, one auth listener registry), `endLocalSession`, guest gate on per-player RPCs |
| `src/data/public-rpcs.ts` | Functions a guest may call; tested against the real grants |
| `src/data/session.ts` | Start-up, `signInWithGoogle`, `signOut`, `deleteAccount`, session-ended handling |
| `src/data/guest-progress.ts` | A guest's lesson progress on the device |
| `src/data/device-owner.ts` | Whose data the device holds; clears it on any mismatch |
| `src/data/device-data.ts` | Inventory of every stored key and what sign-out/deletion does to it |
| `src/components/auth/*` | Google button (branding guidelines), sign-in panel, "needs an account" screen |
| `app/sign-in.tsx` | "Welcome back" sign-in screen (modal) |
| `src/features/account/SignInInvite.tsx` | "Keep your progress safe" card on Learn |

### Where sign-in appears

- **Onboarding:** never. The welcome flow is unchanged and needs no account.
- **Learn tab:** a "Keep your progress safe" card. It appears only after onboarding, once the guest has made at least one decision. "Not now" hides it for good on that device. It is never a modal.
- **Settings → Account:** always. A guest sees "Not signed in", why signing in helps, and Continue with Google. A signed-in player sees their email, "Signed in with Google", Sign out and Delete account.
- **Features with per-player server records:** Daily Challenge, Game of the Week matches, friend challenges, nickname and game record. A guest gets a short explanation and the Google button instead of an error. The same screen turns into the real feature once sign-in finishes.

### Guests and the hand-over

- A guest's lesson progress is saved on the device (`tactiqo/guest-progress/v1`). Nothing goes to the server without an account. The copy says so ("saved on this device only") and never suggests it is backed up.
- On sign-in, that progress is queued in the outbox as a diff from empty, then sent. The writes are idempotent (attempts and completions are insert-if-absent by id), so a **returning account keeps everything it had** and gains what was done as a guest. The outbox entry is saved before the guest copy is removed.
- Device-only data (Stories, Arena tallies) carries over to the account that signs in on that device.
- Arena match summaries played as a guest are not uploaded (the uploader runs only for a signed-in owner).

### Session persistence and refresh

- supabase-js owns tokens, expiry, refresh and sign-out. The session is stored through `chunkedStorage` in SecureStore (Android Keystore; iOS keychain `AFTER_FIRST_UNLOCK`). Web uses localStorage.
- Auto-refresh runs only while the app is in the foreground (`AppState`). There is one listener and one client; supabase-js (2.118+) coordinates refreshes itself, so a refresh token is never spent twice.
- At start-up the saved session is **confirmed with the server** (`getUser()`):
  - valid → signed in;
  - revoked or deleted → the local session ends and the app continues as a guest;
  - no answer (offline) → the usual "Couldn't load" screen with Try again (start-up was already online-first for content).
- If a session ends while the app is running (the refresh token was revoked), the `SIGNED_OUT` listener moves the app to guest and clears the account's device data.
- `initializing` is never treated as signed out. Nothing renders until start-up has decided.
- An old anonymous session left in AsyncStorage by earlier builds is deleted at start-up.

### Sign-out and switching accounts

1. Confirmation dialog: the account stays, and device-only Stories and Arena records are removed.
2. Pending writes are sent first. If they can't be sent (offline), the dialog says so and offers **Sign out anyway**.
3. `signOut({ scope: 'local' })`, falling back to removing the stored session and replacing the client if the network is down. Google's auto-select is cleared.
4. The outbox, Arena upload queue, guest progress, Arena records, Stories, story audio levels and games-seen are cleared. The games and Daily caches are reset with an epoch, so late responses from the previous account are dropped. Progress is emptied, and the owner marker is set to `guest`. The navigation stack is dismissed back to `/`.
5. The next Google sign-in loads only that account's data. The outbox's generation counter ensures a write still in flight for the previous account can't remove the next account's queued changes (tested).

### Account deletion

- **One mechanism:** the existing `public.delete_my_account()` SQL function (`20261028140000_delete_account.sql`). It takes no arguments, deletes `auth.uid()`'s `auth.users` row, and in the **same transaction** cascades to every user table (all reference `auth.users ... on delete cascade`, checked from the catalog in tests).
  - I kept it instead of adding an Edge Function. It is atomic, needs no service-role key anywhere, and is already covered by tests.
  - The project has **no Storage buckets or user-owned objects** to clean up. If Storage is added later, move deletion to an Edge Function that removes the objects and then calls `auth.admin.deleteUser`. Don't add it alongside this one.
- **Client order:** stop progress sync and Arena uploads, then call the RPC. Only after the server confirms `{deleted: true}` does the app end the local session, clear all account device data, reset the welcome and continue as a guest. On failure nothing local changes, everything resumes, and the dialog shows why ("…wasn't deleted").
- **Retries:** a retry after a lost response gets `account:not_found`, which the app reads as done. A retry can never target another account because there is no argument.
- **No resurrection:** queues are cleared after confirmation and all writes are owner-scoped. An access token that is still valid after deletion can't write anything back, because every insert hits the foreign key to the now-missing user (tested). A crash between server deletion and local cleanup is handled at the next start: `getUser()` fails, the session ends, and the owner marker triggers cleanup.
- **Residual JWT window:** Supabase access tokens are stateless and stay cryptographically valid until they expire (default 1 hour). The app drops its copy at once. The refresh tokens are deleted with the user. A copied access token could still *read* until expiry, but every owner-scoped table is empty for that user.
- **Signing in again** with the same Google account after deletion creates a new, empty account.

### Profile data

No new profile table. Identity (email, Google name and picture) comes from the verified Supabase user and is not copied into a user-editable row. The existing rows stay as they are:

- `learner_profiles` (the learning goal), created idempotently by `apply_progress_changes`;
- `player_profiles` (the public nickname, separate from the Google name, editable in Settings), created by `set_nickname`.

Both are keyed by the auth UUID and created on first use. A missing row just means "no goal" or "Anonymous player". No trigger on `auth.users` is needed, and there is no broken-profile state to recover from.

## Sign-in paths (updated 2026-11-05)

**Default everywhere — browser sign-in** (`src/auth/browser-sign-in.ts`). This covers Expo Go, development builds, the APK and store builds. It uses Supabase's Google OAuth in the system browser, with PKCE (SHA-256 via `src/auth/crypto-polyfill.ts`):

```
signInWithOAuth(google, redirectTo, skipBrowserRedirect) → Google → https://<ref>.supabase.co/auth/v1/callback
  → redirectTo?code=… → exchangeCodeForSession(code, { flowId })
```

| Where the app runs | `redirectTo` (logged in Metro as `[auth] Google sign-in redirectTo = …`) |
|---|---|
| Expo Go | `exp://<your PC's LAN IP>:<port>/--/auth-callback` (changes with the network) |
| Any installed build (dev build, APK, Play) | `tactiqo://auth-callback` |

- The browser path needs **no** Android OAuth client, **no** SHA-1 and **no** client ID in the app.
- `app/auth-callback.tsx` finishes the sign-in if the JavaScript restarted on the way back (Expo Go does this on Android).
- If the browser closes without returning a code, the app says "Sign-in wasn't completed" instead of failing silently. In development builds the message also names the address Supabase has to allow.

**Opt-in — native Credential Manager** (`EXPO_PUBLIC_GOOGLE_SIGN_IN=native`). This gives the in-app account sheet, then `signInWithIdToken` with a nonce. It is not available in Expo Go. It only works when the Android OAuth client has the SHA-1 of the exact key that signed the installed build. If the SHA-1 is wrong, Google cancels right after the player picks an account, and nothing reaches Supabase. That is what the earlier preview APK did.

## Configuration checklist (what makes it work)

**Supabase → Authentication → Sign In / Providers → Google**
- Enabled. Client ID = the Google **Web application** client ID (`277405757381-qu00…`, already set). Client Secret = that Web client's secret.
- Off: **Allow anonymous sign-ins** (already off).
- Email provider: turn off "Allow new users to sign up" (currently on). This doesn't break Google, but it lets anyone create a password account.

**Supabase → Authentication → URL Configuration**
- Site URL: `https://tactiqo.vercel.app`. Don't use an `exp://` address here: when an allow-list match fails, a stale IP sends Expo Go to its "Something went wrong" screen.
- Redirect URLs:
  - `tactiqo://auth-callback` (all installed builds, keep it for release);
  - `exp://**` (Expo Go, development only, remove before release);
  - optionally the exact Expo Go address from the Metro log.

**Google Cloud → Clients → the Web application client**
- Authorized redirect URIs: `https://gpthypkouxaicjvalbhu.supabase.co/auth/v1/callback`
- Audience / consent screen: while it says **Testing**, add every Google account you sign in with as a test user, or publish it.

**EAS environment variables** (`eas env:list --environment <env>`)
- `preview` and `production` have `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
- `development` has **only** the Google client ID. Add the two Supabase variables before you build a development client.
- The browser path doesn't read the Google client ID. It's only used with `EXPO_PUBLIC_GOOGLE_SIGN_IN=native`.

**Builds**
- Commit before `eas build`. The last preview APK was built from `957852c`, which predates the sign-in work.
- Rebuild the APK after these changes. A Metro reload doesn't change an installed APK.

**Only if you opt into the native path later**
- Create an Android OAuth client for `com.tactiqo.app` with the SHA-1 from `npx eas-cli@latest credentials -p android`.
- For Play Store builds, also add the App signing key SHA-1 from Play Console → App integrity.
- Set `EXPO_PUBLIC_GOOGLE_SIGN_IN=native` in that EAS environment.

## Device-data inventory

The full list is in `src/data/device-data.ts`, and a test fails if a storage key in the code isn't listed there.

| Key | Scope | On sign-out / deletion / owner mismatch |
|---|---|---|
| `strategic-game/outbox` | account | cleared |
| `tactiqo/arena-uploads/v1` | account | cleared |
| `tactiqo/guest-progress/v1` | account | cleared |
| `tactiqo/arena-records/v1` | account | cleared |
| `tactiqo/stories/v1` | account | cleared |
| `tactiqo/story-audio/v1` | account | cleared |
| `strategic-game/games-seen` | account | cleared |
| `strategic-game/progress` (legacy) | account | cleared |
| `sb-<ref>-auth-token` (SecureStore) | session | removed by supabase-js / `endLocalSession` |
| `tactiqo/device-owner/v1` | device | rewritten to the new owner |
| `tactiqo/sign-in-invite/v1` | device | kept |
| `strategic-game/settings` | device | kept (the intro flag is reset after deletion) |

In-memory caches: the progress store is emptied, and the games and Daily stores are reset (epoch-guarded).

## Security review findings

- **RLS:** on for every table in `public` (tested). Progress and Arena tables have owner-only policies on `auth.uid()`. Games and Daily tables have no direct client grants; all access goes through SECURITY DEFINER functions that take the user from `auth.uid()`.
- **Guest surface:** `anon` can execute exactly `get_published_content`, `get_lesson_categories`, `daily_challenge_today`, `get_games_overview`, `get_leaderboard`, `get_hall_of_fame`, `get_challenge` and `finalize_due_competitions`. The test compares this with `PUBLIC_RPCS` so the client and the grants stay in step.
- **Secrets:** the app ships only the Supabase URL, the publishable key and the Google Web client id, all public by design. The client refuses a service-role key. No Google client secret or service-role key exists in the repository.
- **Tokens:** never logged or put in app state. Dev logs carry only error codes.
- **Nonce:** always sent. `skip_nonce_check = false` in local config. Never disable it on the hosted project.
- **Removed (2026-11-06):** the unused `supabase/functions/text-to-speech` "Hello" template is deleted from the repository. The copy still deployed on the hosted project must be deleted by hand: `npx supabase functions delete text-to-speech` (docs/PRE_LAUNCH_SPRINT.md).
- ⚠️ **Dashboard settings decide part of the attack surface.** If anonymous sign-ins or email sign-ups stay enabled on the hosted project, anyone with the public key can create an `authenticated` user through the Auth API without Google. Data stays isolated per user, but it should be turned off (below).

## External configuration still required

Nothing below has been done. None of it can be done from the repository.

### Google Cloud Console

1. Project → **Google Auth Platform**: set up the consent screen (app name Tactiqo, support email, privacy policy `https://tactiqo.vercel.app/privacy`, terms `https://tactiqo.vercel.app/terms`). Use only the scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. Set the audience to External, and publish it to Production before release (in Testing, only listed test users can sign in).
2. **Web application** OAuth client: its client id goes into `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and into Supabase. Its secret goes **only** into Supabase. No redirect URIs are needed for the native ID-token flow.
3. **Android** OAuth clients with package `com.tactiqo.app`, one per signing certificate SHA-1:
   - EAS development/preview builds: `npx eas-cli@latest credentials -p android` shows the keystore SHA-1.
   - Google Play App Signing: Play Console → Setup → App signing → app signing key SHA-1 (and the upload key's).
   - A local debug keystore, if you ever run `npx expo run:android`.

   The Android client id is not used in code. Google uses it to check that the APK's package and signature are allowed. Without a matching SHA-1, sign-in fails with `DEVELOPER_ERROR` ("isn't set up correctly in this build").

### Supabase dashboard

1. Authentication → Sign In / Providers → **Google**: enable it. **Client IDs:** the Web client id (add the iOS client id later, comma-separated). **Client Secret:** the Web client secret. Leave **Skip nonce check** off.
2. Turn off **Allow anonymous sign-ins**.
3. Email provider: turn off **Allow new users to sign up** (or disable the provider). Leave phone and other providers off.
4. Authentication → Sessions: defaults are fine (access token 1 h, refresh token rotation on). Optional: a shorter JWT expiry shrinks the post-deletion window.
5. Apply the migrations not yet on the live project (see `docs/QUALITY_MILESTONE_2026-11-04.md`). This change adds **no new migration**.
6. Redirect URLs: the native flow uses none. For Expo Go development, add `exp://**` (see "Expo Go: browser sign-in for development") and remove it before release.

### Expo / EAS

- Packages added: `react-native-nitro-google-signin` 2.3.1 and its peer `react-native-nitro-modules` 0.37.2 (supports RN 0.86; uses Android Credential Manager; per-request nonce), plus `expo-secure-store` (session in the OS keystore) and `expo-crypto` (nonce and SHA-256). `expo-secure-store` has its config plugin in `app.json`.
- The Google library's config plugin is **not** in `app.json`. Without Firebase it only adds the iOS URL scheme and Podfile entries, and it refuses to run without an `iosUrlScheme`. Android needs nothing from it.
- Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env` for local builds, and as an EAS environment variable (plain text, all profiles) for cloud builds.
- This needs a **development build**. It doesn't work in Expo Go:

  ```bash
  npx eas-cli@latest build --profile development --platform android
  ```

- Production: `production` profile (app bundle). Register the Play app-signing SHA-1 as above before testing a Play build.

### Manual device verification (not yet done)

On a real Android development build:

- [ ] First sign-in creates the user (check Supabase → Authentication → Users).
- [ ] Returning sign-in restores the same progress.
- [ ] The picker shows multiple accounts, and switching accounts shows only the new account's data.
- [ ] Cancelling the picker shows no error.
- [ ] Airplane-mode start, then reconnect → Try again works.
- [ ] Kill the app or reboot → still signed in; after an hour (token refresh) → still signed in.
- [ ] Revoke the session (dashboard → user → sign out) → next start is a guest with device data cleared.
- [ ] Sign out offline → "Sign out anyway" appears.
- [ ] Delete account → user gone in the dashboard, app restarts as a guest with the welcome; signing in again gives an empty account.
- [ ] Onboarding works as a guest, end to end.

## iOS later

- Create an iOS OAuth client for the bundle id `com.tactiqo.app`.
- Set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
- Add the iOS client id to Supabase's Client IDs.
- Add the plugin to `app.json`: `["react-native-nitro-google-signin", { "iosUrlScheme": "com.googleusercontent.apps.<IOS_CLIENT_ID_PREFIX>" }]`.

`src/auth/google.ts` already passes `iosClientId`. Nothing else in the session, profile, deletion or RLS layers is platform-specific. Apple sign-in isn't implemented.
