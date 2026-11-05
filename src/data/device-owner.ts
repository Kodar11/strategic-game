/**
 * Whose data the device-only stores hold right now: `guest`, or a Supabase user id. Several things live only on the
 * phone (Stories progress, detailed Arena tallies, queued uploads), and they must never be shown to, or uploaded as,
 * a different person.
 *
 * Start-up compares the marker with who is actually signed in (`reconcileOwner`). Any mismatch — a session that was
 * revoked or expired while the app was closed, an account deleted on another device, a crash halfway through signing
 * out — means the device data belongs to someone else, so it is cleared before anything renders. The one deliberate
 * hand-over, guest → newly signed-in account, rewrites the marker itself (src/data/session.ts).
 *
 * A device with no marker (a fresh install, or a build from before Google sign-in) is treated as unknown and cleared.
 */

export const DEVICE_OWNER_KEY = 'tactiqo/device-owner/v1';

export type Owner = 'guest' | { user: string };

export interface OwnerStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function ownerValue(o: Owner): string {
  return o === 'guest' ? 'guest' : `user:${o.user}`;
}

/** True when the device data may be kept for `current`: the marker says it already belongs to them. */
export function ownsDeviceData(marker: string | null, current: Owner): boolean {
  return marker === ownerValue(current);
}

/**
 * Make the device data belong to `current`: clear it if the marker names anyone else (or nobody), then record the
 * new owner. Clearing runs before the marker is rewritten, so an interrupted clear is retried on the next start.
 */
export async function reconcileOwner(storage: OwnerStorage, current: Owner, clear: () => Promise<void>): Promise<{ cleared: boolean }> {
  let marker: string | null = null;
  try {
    marker = await storage.getItem(DEVICE_OWNER_KEY);
  } catch {
    marker = null;
  }
  if (ownsDeviceData(marker, current)) return { cleared: false };
  await clear();
  await storage.setItem(DEVICE_OWNER_KEY, ownerValue(current)).catch(() => undefined);
  return { cleared: true };
}

export async function setOwner(storage: OwnerStorage, current: Owner): Promise<void> {
  await storage.setItem(DEVICE_OWNER_KEY, ownerValue(current)).catch(() => undefined);
}
