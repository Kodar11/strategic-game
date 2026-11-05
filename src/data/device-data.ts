import AsyncStorage from '@react-native-async-storage/async-storage';

import { ARENA_RECORDS_KEY, useArenaRecords } from '@/src/features/arena/records';
import { GAMES_SEEN_KEY, useSeenRules } from '@/src/features/games/seen';
import { clearExportFiles } from '@/src/features/learning/shareFile';
import { resetStoryAudioPrefs } from '@/src/features/stories/audio/session';
import { useStories } from '@/src/features/stories/store';
import { ARENA_UPLOADS_KEY, arenaUploads } from './arena-session';
import { GUEST_PROGRESS_KEY } from './guest-progress';

/**
 * Everything this app keeps on the device (AsyncStorage on native, localStorage on web; the session in the OS secure
 * store), and what happens to it when the player signs out, switches account or deletes the account. Keep this list
 * in step with every storage key in the app — a test reads the source for keys and fails on one that isn't listed.
 *
 * `account`: the current player's own data or caches of it. Cleared on sign-out, on account deletion (only after the
 *   server confirmed it) and whenever start-up finds the data belongs to someone else (src/data/device-owner.ts).
 * `session`: the Supabase session — owned and cleared by supabase-js (sign-out, deletion, revoked refresh token).
 * `device`: preferences about this phone (reduced motion, haptics, narration on/off, whether the sign-in invitation
 *   was dismissed) and the owner marker itself — kept, as a new player on the same phone would expect. The "seen the
 *   intro" flag is reset separately after deletion so the next player gets the welcome.
 */
export const DEVICE_DATA = [
  { key: 'strategic-game/outbox', scope: 'account', what: 'Legacy: progress changes waiting to be sent, from builds before the local database; moved into it once at start-up, then removed' },
  // ── The local database (src/data/local): SQLite `tactiqo.db` on Android / iOS; the same data as the four
  // key-value items below on web (and on a phone where SQLite can't be opened). Every row carries its owner's user id.
  // - sync_queue (progress operations, practice games): an explicit sign-out (after the player confirmed losing
  //   anything unsent) and account deletion remove the owner's rows. A session that ends by itself (revoked, expired)
  //   keeps them, scoped to that user and never shown or sent for anyone else, so their work reaches the server if
  //   they sign in again; rows left 90 days are purged.
  // - progress_snapshots, game_history: account data — removed with the account's data in every case, and at start-up
  //   for anyone but the current owner.
  // - content_cache: published content (not personal) — kept.
  { key: 'tactiqo.db', scope: 'account', what: 'Local database: queued writes, progress snapshot and practice-game history per user id; the published content cache' },
  { key: 'tactiqo/local-queue/v1', scope: 'account', what: 'Web / fallback: writes waiting for the server, one entry per operation, per user id' },
  { key: 'tactiqo/local-snapshots/v1', scope: 'account', what: 'Web / fallback: each account’s last known progress on this device' },
  { key: 'tactiqo/local-games/v1', scope: 'account', what: 'Web / fallback: practice games finished on this device, per user id' },
  { key: 'tactiqo/local-content/v1/', scope: 'device', what: 'Web / fallback: the published content cache, one key per document (`catalog`, `categories`); not personal' },
  { key: ARENA_UPLOADS_KEY, scope: 'account', what: 'Arena match summaries waiting to be sent to the server (owner-scoped)' },
  { key: 'tactiqo/guest-progress/v1', scope: 'account', what: 'A guest’s lesson progress (handed to the account on sign-in)' },
  { key: ARENA_RECORDS_KEY, scope: 'account', what: 'Arena records: results per game and opponent, recent matches, reads, last setup, coach tips seen' },
  { key: 'tactiqo/stories/v1', scope: 'account', what: 'Stories progress: positions, choices, endings seen' },
  { key: 'tactiqo/story-audio/v1', scope: 'account', what: 'Story sound levels' },
  { key: GAMES_SEEN_KEY, scope: 'account', what: 'Which classic games’ rules have been read' },
  { key: 'strategic-game/progress', scope: 'account', what: 'Legacy pre-server progress blob (read once for its settings, then removed)' },
  { key: 'sb-<project-ref>-auth-token', scope: 'session', what: 'The Supabase session, in the OS secure store (src/auth/session-storage.ts); the old AsyncStorage copy from anonymous builds is removed at start-up' },
  { key: 'tactiqo/device-owner/v1', scope: 'device', what: 'Whose data the account-scoped items hold: guest or a user id (src/data/device-owner.ts)' },
  { key: 'tactiqo/sign-in-invite/v1', scope: 'device', what: 'Whether the “Keep your progress safe” invitation was dismissed' },
  { key: 'strategic-game/settings', scope: 'device', what: 'Device preferences: reduced motion, haptics, narration, the intro-seen flag, the analytics choice (usageConsent)' },
  // ── Files (expo-file-system) ──
  // "Export data" writes the learning record (answers) to the app cache before the share sheet opens. The player may
  // keep a copy elsewhere; the cached file itself is removed with the account's data (clearExportFiles).
  { key: 'cache/strategic-thinking-data-<date>.json', scope: 'account', what: 'Learning-data export written for the share sheet (src/features/learning/shareFile.ts)' },
  // Story audio and narration play files bundled with the app (expo-audio); nothing is downloaded or cached by the app.
  // PostHog SDK files (src/observability), in the app's document directory, written by the SDK itself: the analytics
  // id, the opt-in state and events not sent yet. They exist only after the player chose "Share" (the SDK isn't
  // created before). Signing out, account deletion and a revoked session reset the id (`posthog.reset()` through
  // core.ts `setUser(null)`); turning the choice off resets it too. The choice itself is a device preference and stays.
  { key: '.posthog-rn.json', scope: 'device', what: 'Analytics SDK state and unsent events (only after consent; reset on sign-out, deletion and opt-out)' },
  { key: '.posthog-rn-logs.json', scope: 'device', what: 'Analytics SDK log queue (logs are not used; normally empty)' },
] as const;

/**
 * Clears every account-scoped item from memory and storage. Called when the device's data must stop belonging to the
 * current owner: sign-out, a confirmed account deletion, or a mismatch found at start-up. Never throws: a storage
 * failure leaves that item, it doesn't stop the rest.
 */
export async function clearAccountDeviceData(): Promise<void> {
  await arenaUploads.clear();
  clearExportFiles();
  await Promise.all([
    useArenaRecords.getState().reset(),
    useStories.getState().reset(),
    resetStoryAudioPrefs(),
    useSeenRules.getState().reset(),
    AsyncStorage.removeItem(GUEST_PROGRESS_KEY).catch(() => undefined),
    AsyncStorage.removeItem('strategic-game/outbox').catch(() => undefined),
    AsyncStorage.removeItem('strategic-game/progress').catch(() => undefined),
  ]);
}
