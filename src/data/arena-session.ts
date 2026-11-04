import AsyncStorage from '@react-native-async-storage/async-storage';

import { ArenaUploader, arenaRepository } from './arena';
import { toDataError } from './errors';
import { supabaseRpc } from './supabase';

/**
 * The app's one Arena summary uploader (see src/data/arena.ts). Start-up restores it for the signed-in user
 * (src/data/session.ts); a finished Arena match enqueues its summary (src/features/arena/records.ts); deleting the
 * account stops it before the server call and clears it after.
 */

export const ARENA_UPLOADS_KEY = 'tactiqo/arena-uploads/v1';

export const arenaRepo = arenaRepository(supabaseRpc);

export const arenaUploads = new ArenaUploader({
  send: (batch) => arenaRepo.record(batch),
  transient: (e) => toDataError(e).transient,
  storage: {
    load: () => AsyncStorage.getItem(ARENA_UPLOADS_KEY),
    save: (v) => (v === null ? AsyncStorage.removeItem(ARENA_UPLOADS_KEY) : AsyncStorage.setItem(ARENA_UPLOADS_KEY, v)),
  },
});

/** A v4 UUID for a finished match (only needs to be unique; the server dedupes on it). */
export function matchId(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
