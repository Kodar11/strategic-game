import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { useAuth } from '@/src/auth/store';
import { useSyncStatus } from '@/src/data/session';
import { useProgress } from '@/src/store/progress';
import type { UsageConsent } from '@/src/store/settings';
import { resolveConfig } from './config';
import { telemetry } from './core';
import { createPostHogClient } from './posthog';

/**
 * Turns observability on for this launch, or off. Called once from the root layout; never awaited and never able to
 * delay or break start-up. Everything it does is a no-op when telemetry is switched off for the build (config.ts).
 *
 * Order matters:
 * 1. Identity follows the auth store from the start (src/auth/store.ts): `signedIn` → the confirmed Supabase user id,
 *    `signedOut` → a guest. Busy states (signing in/out, deleting) change nothing until they settle.
 * 2. Device settings are loaded first. The SDK is created only if the player chose "Share" (`usageConsent:
 *    'granted'`); with `unset` or `denied` it is never constructed, so nothing — not even the SDK's own lifecycle
 *    events or its anonymous id file — exists before consent.
 * 3. The consent setting is followed for the rest of the launch: granting creates the SDK at once, denying stops
 *    collection at once (core.ts setConsent). Progress sync problems are followed once the SDK is installed.
 */

let started = false;

interface ObservabilityExtra {
  environment?: string;
  gitSha?: string | null;
}

export function startObservability(): void {
  if (started) return;
  started = true;
  try {
    const extra = (Constants.expoConfig?.extra?.observability ?? {}) as ObservabilityExtra;
    const config = resolveConfig({
      platform: Platform.OS,
      // EXPO_PUBLIC_* values are inlined at build time, so they are read with these literal names.
      enabledFlag: process.env.EXPO_PUBLIC_POSTHOG_ENABLED,
      apiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
      environment: extra.environment,
      gitSha: extra.gitSha,
    });
    if (!config.enabled) {
      telemetry.disable(`${config.reason} (${config.environment})`);
      return;
    }

    followIdentity();
    // The SDK is created only once the player has chosen "Share" — at start-up if they already had, or the moment
    // they do. Until then it doesn't exist: no analytics id, no files, nothing queued.
    const install = () => {
      if (telemetry.installed) return;
      try {
        const client = createPostHogClient(config, true);
        if (!client) {
          telemetry.disable('no client on this platform');
          return;
        }
        telemetry.install(client, { environment: config.environment, ...(config.gitSha ? { git_sha: config.gitSha } : {}) });
        followSync();
      } catch (e) {
        telemetry.disable(`start failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    const apply = (consent: UsageConsent) => {
      const granted = consent === 'granted';
      telemetry.setConsent(granted);
      if (granted) install();
    };
    const begin = () => {
      apply(useProgress.getState().settings.usageConsent);
      useProgress.subscribe((s, prev) => {
        if (s.settings.usageConsent !== prev.settings.usageConsent) apply(s.settings.usageConsent);
      });
    };
    if (useProgress.persist.hasHydrated()) begin();
    else useProgress.persist.onFinishHydration(() => begin());
  } catch (e) {
    telemetry.disable(`start failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function followIdentity(): void {
  const apply = (s: ReturnType<typeof useAuth.getState>) => {
    if (s.status === 'signedIn' && s.user) telemetry.setUser(s.user.id);
    else if (s.status === 'signedOut') telemetry.setUser(null);
  };
  apply(useAuth.getState());
  useAuth.subscribe(apply);
}

/** How long progress sync may keep retrying before it is reported as stuck. */
const STUCK_MS = 5 * 60_000;

/**
 * Progress sync (src/data/outbox.ts) problems worth a look: a change the server refused for good (`error`), or retries
 * that have gone on for five minutes. Ordinary retries while offline are not errors and are not reported.
 */
function followSync(): void {
  let retryingSince: number | null = null;
  let stuckTimer: ReturnType<typeof setTimeout> | null = null;
  useSyncStatus.subscribe((s, prev) => {
    if (s.state === 'error' && prev.state !== 'error') {
      telemetry.reportError('sync_failed', new Error('Progress sync stopped: a change was refused'), { sync_phase: 'refused' });
    }
    if (s.state === 'retrying' && retryingSince === null) {
      retryingSince = Date.now();
      stuckTimer = setTimeout(() => {
        if (useSyncStatus.getState().state === 'retrying') {
          telemetry.reportError('sync_failed', new Error('Progress sync has been retrying for 5 minutes'), { sync_phase: 'stuck', stuck_minutes: 5 }, 'warning');
        }
      }, STUCK_MS);
    } else if (s.state !== 'retrying') {
      retryingSince = null;
      if (stuckTimer) clearTimeout(stuckTimer);
      stuckTimer = null;
    }
  });
}
