/**
 * A Supabase auth storage adapter over a small key-value store with a per-value size limit (the OS keystore behind
 * expo-secure-store). A Google session — access token, refresh token, user metadata — is a few kilobytes, above what
 * some platforms accept in one secure entry, so a value is split into chunks:
 *
 *   <key>        → "chunks:<n>"   (the manifest)
 *   <key>.0..n-1 → the pieces
 *
 * Pure apart from the backend it is given, so it is tested with an in-memory one. Keys are sanitised to the
 * characters SecureStore allows (letters, digits, `.`, `-`, `_`).
 *
 * Writes go pieces-first, manifest-last, so an interrupted write leaves the previous manifest pointing at pieces that
 * may now be mixed: `getItem` then fails to parse and Supabase treats the session as missing (signed out) — never a
 * corrupted session used as valid. Stale pieces beyond the new count are removed after the manifest is written.
 */

export interface KeyValueBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SupabaseStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Comfortably under the 2048-byte limit older iOS keychains enforced; Android has no hard limit. */
export const CHUNK_SIZE = 1800;
const MANIFEST = /^chunks:(\d{1,3})$/;

export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function chunkedStorage(backend: KeyValueBackend, chunkSize = CHUNK_SIZE): SupabaseStorage {
  const countOf = async (k: string): Promise<number> => {
    const m = MANIFEST.exec((await backend.getItem(k)) ?? '');
    return m ? Number(m[1]) : 0;
  };

  return {
    async getItem(key) {
      const k = safeKey(key);
      const manifest = await backend.getItem(k);
      if (manifest === null) return null;
      const m = MANIFEST.exec(manifest);
      if (!m) return null;
      const parts: string[] = [];
      for (let i = 0; i < Number(m[1]); i++) {
        const part = await backend.getItem(`${k}.${i}`);
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      const k = safeKey(key);
      const before = await countOf(k);
      const parts: string[] = [];
      for (let i = 0; i < value.length; i += chunkSize) parts.push(value.slice(i, i + chunkSize));
      for (let i = 0; i < parts.length; i++) await backend.setItem(`${k}.${i}`, parts[i]);
      await backend.setItem(k, `chunks:${parts.length}`);
      for (let i = parts.length; i < before; i++) await backend.removeItem(`${k}.${i}`);
    },

    async removeItem(key) {
      const k = safeKey(key);
      const n = await countOf(k);
      await backend.removeItem(k);
      for (let i = 0; i < n; i++) await backend.removeItem(`${k}.${i}`);
    },
  };
}
