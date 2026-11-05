import { type DataError, toDataError } from '../errors.ts';

/**
 * How sync failures are classified and when a failed write is tried again. Shared by the progress outbox and the
 * practice-game queue.
 */

export type SyncErrorCategory =
  | 'network_unavailable'
  | 'timeout'
  | 'server_temporary'
  | 'auth_expired'
  | 'permission_denied'
  | 'validation_failed'
  | 'duplicate'
  | 'rejected';

export interface SyncFailure {
  category: SyncErrorCategory;
  /** Retry later (the same request may succeed) or set aside for good. */
  retry: boolean;
  message: string;
}

/**
 * - No network, a timeout, a 5xx or an expired session (which supabase-js refreshes) → retry with backoff.
 * - A duplicate is success: the server already has the operation (callers treat it as acknowledged).
 * - Permission (42501), bad data (22xxx / 23xxx except unique violations), unknown function or a business refusal
 *   (P0xxx) → the same request will be refused again: don't retry forever.
 */
export function classifySyncError(e: unknown): SyncFailure {
  const d: DataError = toDataError(e);
  const code = /^([0-9A-Z]{5}|PGRST\d+)/.exec(d.detail)?.[1] ?? '';
  if (d.kind === 'network') {
    const timeout = /abort|timeout/i.test(d.detail);
    return { category: timeout ? 'timeout' : 'network_unavailable', retry: true, message: d.message };
  }
  if (d.kind === 'server') return { category: 'server_temporary', retry: true, message: d.message };
  if (d.kind === 'auth') return { category: 'auth_expired', retry: true, message: d.message };
  if (d.kind === 'signedOut') return { category: 'auth_expired', retry: true, message: d.message };
  if (code === '23505') return { category: 'duplicate', retry: false, message: d.message };
  if (code === '42501') return { category: 'permission_denied', retry: false, message: d.message };
  if (/^(22|23)/.test(code)) return { category: 'validation_failed', retry: false, message: d.message };
  return { category: 'rejected', retry: false, message: d.message };
}

/** Delays before retry n (1-based): ≈2 s, 5 s, 15 s, 30 s, 1 min, 2 min, then 5 min at most. */
export const RETRY_STEPS_MS = [2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000] as const;

/**
 * The wait before retry `failures` (1 = the first retry), with ±20 % jitter so devices that lost the network together
 * don't all come back in the same second. `random` is injectable for tests.
 */
export function retryDelay(failures: number, random: () => number = Math.random): number {
  const base = RETRY_STEPS_MS[Math.min(Math.max(failures, 1), RETRY_STEPS_MS.length) - 1];
  return Math.round(base * (0.8 + 0.4 * random()));
}
