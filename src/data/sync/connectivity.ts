import * as Network from 'expo-network';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { type BackendState, type NetworkState, looksOffline, networkOf } from './indicator';

/**
 * Connectivity, observed — not polled. expo-network reports changes; requests to Supabase report whether the server
 * actually answered (`noteBackend`, called by the Supabase fetch wrapper in src/data/supabase.ts). A change back to
 * "online", or the app returning to the foreground, is an *opportunity* to sync (`onOpportunity`); the requests that
 * follow decide whether the server is really reachable.
 */

interface ConnectivityState {
  network: NetworkState;
  backend: BackendState;
}

export const useConnectivity = create<ConnectivityState>(() => ({ network: 'unknown', backend: 'unknown' }));

export function noteBackend(reachable: boolean): void {
  const backend: BackendState = reachable ? 'reachable' : 'unreachable';
  if (useConnectivity.getState().backend !== backend) useConnectivity.setState({ backend });
}

export function isOffline(): boolean {
  const s = useConnectivity.getState();
  return looksOffline(s.network, s.backend);
}

let started = false;

/**
 * Start observing (once for the app's lifetime). `onOpportunity` runs when the network comes back and when the app
 * returns to the foreground — at most once every few seconds, so a flapping connection can't start a storm of syncs.
 * The sync workers it kicks guard themselves against running concurrently.
 */
export function startConnectivity(onOpportunity: () => void): void {
  if (started) return;
  started = true;
  let last = 0;
  const opportunity = () => {
    const t = Date.now();
    if (t - last < 3000) return;
    last = t;
    onOpportunity();
  };
  const apply = (s: Network.NetworkState) => {
    const before = useConnectivity.getState().network;
    const network = networkOf(s);
    if (network === before) return;
    // A new network path: what the last request found no longer says anything about the server.
    useConnectivity.setState({ network, backend: 'unknown' });
    if (network === 'online' && before !== 'online') opportunity();
  };
  Network.getNetworkStateAsync().then(apply, () => undefined);
  try {
    Network.addNetworkStateListener(apply);
  } catch {
    // No network module (unusual web environments): requests still report reachability.
  }
  AppState.addEventListener('change', (state) => {
    if (state === 'active') opportunity();
  });
}
