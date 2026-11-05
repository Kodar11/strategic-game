# Offline-first experience and synchronization

Status as of 2026-11-06. Uncommitted. The new Supabase migration is **not applied** to the live project.

## 1. Architecture assessment (before this sprint)

| Area | What existed | Offline result |
|---|---|---|
| Start-up | `startAppData` fetched the whole catalog from Supabase and called `getUser()` before anything rendered | **App unusable offline**: "Couldn't load the lessons" |
| Progress sync | `Outbox` (src/data/outbox.ts): ordered, debounced, merged batches to `apply_progress_changes` (idempotent inserts), retry 1 s→30 s, saved as one AsyncStorage JSON blob | Worked while the app stayed open; no per-operation ids, so a resent `reset` or in-progress upsert after a lost answer could overwrite another device's newer state |
| Progress load | Signed in: always from the server after draining the outbox | Needed the network on every start |
| Guest progress | AsyncStorage (`tactiqo/guest-progress/v1`) | Already offline |
| Practice games | `recordPractice` tried twice, then dropped | **Results lost offline** |
| Arena summaries | `ArenaUploader`, AsyncStorage, deduped by match id | Already queued |
| Stories, story audio, narration | Zustand persist in AsyncStorage; audio bundled with the app (nothing downloaded) | Already offline |
| Daily Challenge | Graded on the server (`submit_daily_challenge`), server date (`daily_challenge_today()`) | Online only |
| Leaderboards, ranked, nickname, deletion | Server RPCs / Edge Function | Online only (correct) |
| Device-data registry | `src/data/device-data.ts`, enforced by tests | — |
| Analytics | PostHog SDK queue (its own buffering), consent-gated | Unchanged |

Things that were already right and were kept: Google-only auth, guest mode, server-authoritative daily/ranked/nickname/deletion, the idempotent progress RPC, the device-owner marker.

## 2. What was implemented

```
UI (unchanged screens, synchronous zustand store)
  └─ src/data/session.ts — local-first start-up, account loading, background reconcile
       ├─ src/data/local/      SQLite (expo-sqlite) on Android/iOS · key-value fallback on web
       ├─ src/data/outbox.ts   progress operations, one row each, stable UUIDs
       ├─ src/data/sync/       operation queue (practice games), retry policy, connectivity, indicator
       ├─ src/data/content-cache.ts   cache → server (6 s budget) → bundled seed
       └─ Supabase: apply_progress_ops (exactly-once), existing RPCs unchanged
```

### Start-up, step by step
1. Open the local database (once; migrations are versioned and transactional). If SQLite can't open, fall back to key-value storage and report `local_db_failed`.
2. Move a legacy AsyncStorage outbox (from older builds) into the database, same owner.
3. **Catalog**: the cached copy if it validates; otherwise the server if it answers within 6 s; otherwise the bundled `supabase/seed/content.json`. All three go through the same `buildCatalog` validation.
4. **Identity**: the server confirms the session. With no answer, the saved session is used **only if** the device-owner marker already names that user. It is marked `session_verified: false` and checked again as soon as the network returns. A definite "no" ends the session.
5. **Progress** (signed in): the device snapshot, with every queued operation re-applied on top (`applyProgressChanges`, the same rules as the server). The screen is ready immediately. Then in the background: send the queue, read the server copy, show server plus anything still queued. Sends are held during that read so nothing can vanish in the gap.
6. A device that has **never** loaded this account still needs the server once. It shows "Connect once to get started".

### What is offline now
| Feature | Behaviour |
|---|---|
| Lessons, scenarios, checkpoints, challenges | Open from the cached or bundled catalog; progress saved locally first, synced later |
| Lesson/scenario completion, attempts, runtime checkpoints | Queued as an operation (SQLite row) and shown immediately; snapshot updated within 0.8 s and on backgrounding |
| Practice games (all classic engines, all bots and difficulties) | Engines and bots were already local; results are now queued in SQLite and kept in `game_history` |
| Arena (bots) | Already local; summaries already queued |
| Stories (text and bundled audio) | Already local |
| Guest mode | Unchanged (AsyncStorage) |
| Daily Challenge, Game of the Week, leaderboards, ranked, friend challenges, nickname, sign-in, deletion | Online only. They show their existing "couldn't reach the server" states; nothing is faked |

## 3. Local schema (SQLite `tactiqo.db`, user_version 1)

| Table | Key | Purpose |
|---|---|---|
| `sync_queue` | `seq` autoinc, `id` UNIQUE (UUID) | `user_id, kind (progress / practice_game), entity_id, payload, created_at, attempts, last_attempt_at, next_attempt_at, status (pending / failed), last_error`. Index `(user_id, kind, status, seq)` |
| `progress_snapshots` | `user_id` | Last known progress on this device, `saved_at`, `server_loaded_at` |
| `content_cache` | `key` (catalog / categories) | `version` (FNV-1a hash), `revision`, `payload`, `fetched_at`. One-row upsert, so the old copy stays until the new one is fully written |
| `game_history` | `session_id` | `user_id, game, payload, played_at, synced` |

No tokens, passwords or analytics data are stored. Every query filters on `user_id`.

## 4. Server changes (migration `supabase/migrations/20261107120000_progress_sync_ops.sql`, NOT deployed)

- `public.progress_sync_ops (user_id → auth.users ON DELETE CASCADE, op_id uuid, applied_at)`, RLS owner-only.
- `public.apply_progress_ops(ops jsonb)`, SECURITY INVOKER, authenticated only, at most 100 operations. For each operation it claims the id, then calls the existing `apply_progress_changes`, all in one transaction. An id it has already seen is returned in `duplicates` and not re-applied. Ids are kept for 180 days.
- **Compatibility**: until the migration is deployed, the app gets PGRST202 and falls back to the merged `apply_progress_changes` call, which is the old behaviour.
- No Edge Function changes. `record_practice_game` was already idempotent on `(user_id, client_id)`.

## 5. Sync queue rules

- Every write is saved before `enqueue` resolves. Rows survive restarts and the process being killed.
- One worker per queue and one request at a time. Progress requests carry up to 50 operations.
- Retry with jitter: ≈2 s, 5 s, 15 s, 30 s, 60 s, 120 s, then a 5 min cap. A network change back to online, or the app coming to the foreground, retries now (throttled to once every 3 s).
- Error categories (`classifySyncError`): network_unavailable, timeout, server_temporary and auth_expired are retried. Duplicate counts as delivered. permission_denied, validation_failed and rejected are set aside (status `failed`, kept 30 days, reported as `sync_failed`).
- Pending rows of an account that never returns are purged after 90 days.

## 6. Conflict rules

- Completions and learning attempts are grow-only facts, keyed by lesson/scenario id and attempt id. An older copy can never remove one.
- In-progress records (lesson runtime, scenario runs, challenge drafts, assessment runs) are replaced. The order of this device's operations is preserved, and the server applies each operation once, so a resend can no longer overwrite a newer write from another device.
- A reset is applied exactly once (server ledger).
- Reflections inside assessment runs follow the in-progress rule. There is **no** multi-device revision check for an assessment reflection edited on two devices at once: the later write wins. (The game reflection libraries in src/reflections are static content, not user data.)
- Content: the server is canonical. The cache is a read-only, versioned copy, and a new version is installed at the next start.
- Server timestamps (`now()`) are authoritative for completion times.

## 7. Account isolation

- Sign-out (explicit): the queue must drain (progress, Arena **and practice**), or the player must confirm "sign out anyway". Then the account's queue, snapshot and history are removed.
- Session ended by itself (revoked, expired): the snapshot and history are removed. **Queued writes are kept**, scoped to that user id, and sent only if that same user signs in again. They are never loaded for anyone else.
- Account switch: the outbox and practice queue are detached; in-memory entries never carry over (a bug caught and fixed during this sprint; covered by account-switch.test.ts).
- Account deletion: unchanged and server-confirmed. After confirmation, the account's rows are removed and `progress_sync_ops` cascades on the server.
- Start-up owner mismatch: snapshots and history of anyone but the current owner are removed.

## 8. UI

`src/components/ui/SyncIndicator.tsx`: a small pill at the top, shown only when there is something to say: "Offline", "Saved on device", "Syncing progress…" (only after 1.5 s), "Couldn't sync yet. We'll retry.", or "Some progress couldn't sync". "Synced" shows for 2 s only after a visible waiting state and once the queue has actually emptied. It never takes touches. The first-run-offline screen explains that a connection is needed once.

## 9. Observability

- `app_ready` gains `content_source` (cache / network / bundled) and `session_verified`, through the event catalogue. No direct PostHog calls.
- New error kind `local_db_failed`. `sync_failed` is no longer reported for "stuck" retries while the device is offline, and gains `sync_phase: practice_refused`.
- No lesson answers, reflections or game state are sent. Analytics stay in the PostHog SDK's own queue; no second queue was created.

## 10. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | 0 problems |
| `npm test` | See the final report (baseline was 1487 passing) |
| New suites | `src/data/__tests__/local-store.test.ts` (19), `src/data/__tests__/offline-sync.test.ts` (24) |
| Android device | **Not done**: no Android SDK on this machine; expo-sqlite needs a new development build |

## 11. Not implemented / follow-ups

- **Daily Challenge offline participation**: grading is server-side. An offline answer would have to be queued and submitted the same server day, with "result when online" UI. Not built; Daily stays online only.
- **Mid-game save/resume** for classic practice and Arena matches (only finished games are persisted).
- Showing unsynced local practice games in "your recent games" (the history table exists; the card still reads the server).
- Guest progress still lives in AsyncStorage (works offline; could move to SQLite).
- Story reading progress is device-only (never synced to the server); unchanged.
- Subscription/entitlements: there is no billing system. Policy for later: cache the last server-verified entitlement with `verified_at` and `expires_at`; honour it offline until `expires_at` plus a short grace period; never grant new entitlements offline; purchases and restores need the network.
- Content updates install at the next start, not live.
- Real-device tests in section 12 are all outstanding.

## 12. Manual device tests still required (Android development build)

1. Online start, then airplane mode: finish a lesson, play a practice game, play an Arena match. The pill shows "Saved on device".
2. Kill the app, reopen offline: progress and lessons are present, with no error screen.
3. Restore the network: the pill shows "Syncing progress…" then "Synced". Check rows in Supabase (`progress_sync_ops`, `game_practice_results`).
4. Repeat with a throttled or intermittent connection, and with Wi-Fi switched to mobile data mid-sync.
5. Fresh install with no network: bundled lessons open as a guest.
6. Two accounts on one device; sign-out with pending changes; session revoked from the dashboard while offline.
7. Apply the migration to a staging project first. Then verify duplicate suppression with a forced timeout.
