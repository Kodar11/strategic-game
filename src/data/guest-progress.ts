import type { ProgressData } from '../store/progress-state.ts';

/**
 * A guest's lesson progress, kept on this device only (nothing is sent to the server without an account). Saved a
 * moment after each change and whenever the app is backgrounded, and loaded at start-up when nobody is signed in.
 *
 * When the guest signs in with Google, src/data/session.ts sends this progress to the account through the outbox
 * (idempotent writes, so a returning account keeps everything it had) and clears it here once the outbox holds it.
 * Signing out or deleting the account clears it too, so the next guest on this phone starts empty.
 */

export const GUEST_PROGRESS_KEY = 'tactiqo/guest-progress/v1';

export interface GuestStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function guestProgressStore(storage: GuestStorage, debounceMs = 400) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: ProgressData | null = null;
  let writing: Promise<void> = Promise.resolve();

  const write = (data: ProgressData | null): Promise<void> => {
    writing = writing
      .then(() => (data ? storage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(data)) : storage.removeItem(GUEST_PROGRESS_KEY)))
      .catch(() => undefined);
    return writing;
  };

  return {
    /** The saved guest progress (unsanitised: the store's `hydrate` sanitises), or null when there is none. */
    async load(): Promise<unknown> {
      try {
        const raw = await storage.getItem(GUEST_PROGRESS_KEY);
        return raw ? (JSON.parse(raw) as unknown) : null;
      } catch {
        return null;
      }
    },

    /** Save soon (debounced): called on every store change while a guest is playing. */
    save(data: ProgressData): void {
      pending = data;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void this.flush(), debounceMs);
    },

    /** Write what's waiting now (app going to the background, or before sign-in reads it). */
    flush(): Promise<void> {
      if (timer) clearTimeout(timer);
      timer = null;
      const data = pending;
      pending = null;
      return data ? write(data) : writing;
    },

    /** Drop the saved guest progress and anything waiting to be saved. */
    clear(): Promise<void> {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      return write(null);
    },
  };
}

export type GuestProgressStore = ReturnType<typeof guestProgressStore>;
