import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { installCatalog } from '@/src/content/catalog';
import { useProgress } from '@/src/store/progress';
import type { ProgressData } from '@/src/store/progress-state';
import { diffProgress } from './changes';
import { DataError, toDataError } from './errors';
import { Outbox, type OutboxStatus } from './outbox';
import { contentRepository, progressRepository } from './repositories';
import { ensureUser, supabaseRpc } from './supabase';

/**
 * The app's connection to its data: start-up (content, session, progress) and the write-back of every progress
 * change. Online-first: the app starts once the published content and the learner's progress have loaded from
 * Supabase, and shows a retryable error otherwise — there is no built-in content to fall back to.
 *
 * After start-up the store is the live state for the screens, and each change is diffed and queued in the outbox,
 * which writes it to Supabase in order (see outbox.ts for retry and conflict behaviour).
 */

export type AppDataState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: DataError };

export const useAppData = create<AppDataState>(() => ({ status: 'loading' }));
export const useSyncStatus = create<OutboxStatus>(() => ({ pending: 0, state: 'idle', message: null }));

const OUTBOX_KEY = 'strategic-game/outbox';
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

const progress = progressRepository(supabaseRpc);
const content = contentRepository(supabaseRpc);

export const outbox = new Outbox({
  send: async (changes) => {
    await progress.apply(changes);
  },
  classify: (e) => {
    const d = toDataError(e);
    return { kind: d.transient ? 'transient' : 'permanent', message: d.message };
  },
  storage: {
    load: () => AsyncStorage.getItem(OUTBOX_KEY),
    save: (v) => (v === null ? AsyncStorage.removeItem(OUTBOX_KEY) : AsyncStorage.setItem(OUTBOX_KEY, v)),
  },
  onStatus: (s) => useSyncStatus.setState(s),
});

function progressOf(s: ProgressData): ProgressData {
  const { completed, runtime, learning, goal, challengeDrafts, scenarioRuns, scenarioDone, assessmentRuns } = s;
  return { completed, runtime, learning, goal, challengeDrafts, scenarioRuns, scenarioDone, assessmentRuns };
}

let unsubscribe: (() => void) | null = null;

function startSync(): void {
  unsubscribe?.();
  const offStore = useProgress.subscribe((next, prev) => {
    // The update that loads progress from the server is not a change to write back.
    if (!next.hydrated || !prev.hydrated) return;
    outbox.enqueue(diffProgress(progressOf(prev), progressOf(next), next.resets !== prev.resets));
  });
  // Send what's pending before the app is backgrounded (it may not come back).
  const offApp = AppState.addEventListener('change', (state) => {
    if (state !== 'active') void outbox.drain();
  });
  unsubscribe = () => {
    offStore();
    offApp.remove();
  };
}

let starting: Promise<void> | null = null;

/** Load everything the app needs. Safe to call again after an error (the "Try again" button). */
export function startAppData(): Promise<void> {
  if (isServer) return Promise.resolve();
  if (starting) return starting;
  useAppData.setState({ status: 'loading' });
  starting = (async () => {
    try {
      const [catalog, userId] = await Promise.all([content.fetchCatalog(), ensureUser()]);
      installCatalog(catalog);
      // Changes saved before the last shutdown go first, so the progress loaded next includes them.
      await outbox.restore(userId);
      if (!(await outbox.drain())) throw new DataError('network', 'pending progress changes could not be sent');
      useProgress.getState().hydrate(await progress.load());
      startSync();
      useAppData.setState({ status: 'ready' });
    } catch (e) {
      const error = toDataError(e);
      if (__DEV__) console.warn(`[data] start-up failed (${error.kind}): ${error.detail}`);
      useAppData.setState({ status: 'error', error });
    } finally {
      starting = null;
    }
  })();
  return starting;
}

