import AsyncStorage from '@react-native-async-storage/async-storage';

import { errorCode, reportError } from '@/src/observability/api';
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
  send: async (batch) => {
    try {
      await arenaRepo.record(batch);
    } catch (e) {
      // Refused for good: the uploader drops this batch (src/data/arena.ts), so the summaries are lost — worth a look.
      // Transient failures are retried and not reported.
      const d = toDataError(e);
      if (!d.transient) reportError('arena_upload_failed', d, { error_code: errorCode(d.detail) ?? d.kind }, 'warning');
      throw e;
    }
  },
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
