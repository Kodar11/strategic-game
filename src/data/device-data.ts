import AsyncStorage from '@react-native-async-storage/async-storage';

import { ARENA_RECORDS_KEY, useArenaRecords } from '@/src/features/arena/records';
import { GAMES_SEEN_KEY, useSeenRules } from '@/src/features/games/seen';
import { resetStoryAudioPrefs } from '@/src/features/stories/audio/session';
import { useStories } from '@/src/features/stories/store';
import { ARENA_UPLOADS_KEY, arenaUploads } from './arena-session';

/**
 * Everything this app keeps on the device (AsyncStorage on native, localStorage on web), and what happens to it when
 * the account is deleted. Keep this list in step with every AsyncStorage key in the app — a test reads the source for
 * keys and fails on one that isn't listed here.
 *
 * `account`: the player's own data or caches of it — cleared once the server has confirmed the deletion.
 * `device`: preferences about this device (reduced motion, haptics, narration on/off) — kept, as a new player on the
 *   same phone would expect. The "seen the intro" flag is reset separately so the new player gets the welcome.
 */
export const DEVICE_DATA = [
  { key: 'strategic-game/outbox', scope: 'account', what: 'Progress changes waiting to be sent to the server (owner-scoped)' },
  { key: ARENA_UPLOADS_KEY, scope: 'account', what: 'Arena match summaries waiting to be sent to the server (owner-scoped)' },
  { key: ARENA_RECORDS_KEY, scope: 'account', what: 'Arena records: results per game and opponent, recent matches, reads, last setup, coach tips seen' },
  { key: 'tactiqo/stories/v1', scope: 'account', what: 'Stories progress: positions, choices, endings seen' },
  { key: 'tactiqo/story-audio/v1', scope: 'account', what: 'Story sound levels' },
  { key: GAMES_SEEN_KEY, scope: 'account', what: 'Which classic games’ rules have been read' },
  { key: 'strategic-game/progress', scope: 'account', what: 'Legacy pre-server progress blob (read once for its settings, then removed)' },
  { key: 'strategic-game/settings', scope: 'device', what: 'Device preferences: reduced motion, haptics, narration, the intro-seen flag' },
] as const;

/**
 * Clears every account-scoped item from memory and storage. Only call this after the server has confirmed the
 * account is deleted. Never throws: a storage failure leaves that item, it doesn't stop the rest.
 */
export async function clearAccountDeviceData(): Promise<void> {
  await arenaUploads.clear();
  await Promise.all([
    useArenaRecords.getState().reset(),
    useStories.getState().reset(),
    resetStoryAudioPrefs(),
    useSeenRules.getState().reset(),
    AsyncStorage.removeItem('strategic-game/progress').catch(() => undefined),
  ]);
}
