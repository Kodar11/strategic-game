/**
 * What the compact connection label says (src/components/ui/SyncIndicator.tsx). Pure, so it is tested directly.
 *
 * Two signals, never confused:
 * - `network`: what the operating system reports (expo-network). Wi-Fi without internet is `no_internet`. It is only a
 *   hint — a reason to try syncing — never proof the server is reachable.
 * - `backend`: what the app's own last request to Supabase found. `reachable` only after an actual answer.
 *
 * Nothing says "Synced" unless the queue really emptied after the server accepted it (the component shows that briefly
 * after a visible syncing/offline period). Online and idle shows nothing at all.
 */

export type NetworkState = 'unknown' | 'offline' | 'no_internet' | 'online';
export type BackendState = 'unknown' | 'reachable' | 'unreachable';

export interface SyncSnapshot {
  pending: number;
  state: 'idle' | 'saving' | 'retrying' | 'error';
}

export type IndicatorKind = 'offline' | 'saved' | 'syncing' | 'retrying' | 'error';

export interface Indicator {
  kind: IndicatorKind;
  label: string;
}

export function networkOf(s: { isConnected?: boolean | null; isInternetReachable?: boolean | null } | null | undefined): NetworkState {
  if (!s || s.isConnected == null) return 'unknown';
  if (!s.isConnected) return 'offline';
  if (s.isInternetReachable === false) return 'no_internet';
  return 'online';
}

/** The device looks unable to reach the server right now (the OS says so, or the last request failed). */
export function looksOffline(network: NetworkState, backend: BackendState): boolean {
  return network === 'offline' || network === 'no_internet' || backend === 'unreachable';
}

/**
 * Sync itself is silent: saving, retrying and uploading all happen in the background with no label. The only thing
 * ever shown is "Offline", while the device looks unable to reach the server.
 */
export function indicatorFor(input: { signedIn: boolean; network: NetworkState; backend: BackendState; sync: SyncSnapshot }): Indicator | null {
  return looksOffline(input.network, input.backend) ? { kind: 'offline', label: 'Offline' } : null;
}
