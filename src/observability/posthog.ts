import PostHog from 'posthog-react-native';

import type { ResolvedConfig } from './config';
import type { TelemetryClient } from './core';
import { runDeliveryCheck } from './debug';
import { isBannedKey } from './privacy';

/**
 * The only place the PostHog SDK is constructed (iOS and Android; posthog.web.ts on web). Options are chosen for a
 * small, explicit, privacy-safe setup — every default that would send more than the catalogue is turned off here:
 *
 * - No touch or screen autocapture: the client is used directly (no PostHogProvider), and screens are tracked by
 *   the allow-list in routes.ts.
 * - Lifecycle events on (Application Installed / Updated / Opened / Became Active / Backgrounded): sessions,
 *   retention and version adoption for about three events per session.
 * - Person profiles only for identified (signed-in) players; guests stay anonymous events.
 * - No feature-flag preload or `$feature_flag_called` events, no surveys, no push-notification capture and no iOS
 *   rage-click events: none is used yet, and each would spend event budget.
 * - Errors: uncaught JS exceptions, unhandled promise rejections, native crashes and Android NDK crashes. Console
 *   capture is off: render errors are reported once by the route error boundary (ErrorBoundary.tsx).
 * - Session replay off, always (config.ts SESSION_REPLAY_SAMPLE_RATE): not part of the analytics consent.
 * - Constructed only after the player chose "Share" (start.ts), so the SDK writes no id or file before that.
 * - `before_send` removes any banned property name the SDK or a future call might add (privacy.ts).
 */
export function createPostHogClient(config: Extract<ResolvedConfig, { enabled: true }>, consent: boolean): TelemetryClient | null {
  const ph = new PostHog(config.apiKey, {
    host: config.host,
    persistence: 'file',
    defaultOptIn: consent,
    captureAppLifecycleEvents: true,
    personProfiles: 'identified_only',
    preloadFeatureFlags: false,
    sendFeatureFlagEvent: false,
    disableSurveys: true,
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    rageClickConfig: { enabled: false },
    flushAt: 20,
    flushInterval: 30_000,
    errorTracking: {
      autocapture: {
        uncaughtExceptions: true,
        unhandledRejections: true,
        console: false,
        nativeCrashes: true,
        androidNdkCrashes: true,
      },
    },
    // Never on: see config.ts. A future replay decision must change this line and SESSION_REPLAY_SAMPLE_RATE together.
    enableSessionReplay: config.replaySampleRate > 0,
    before_send: (event) => {
      if (!event?.properties) return event;
      for (const k of Object.keys(event.properties)) if (!k.startsWith('$') && isBannedKey(k)) delete event.properties[k];
      return event;
    },
  });
  // TEMPORARY delivery diagnostic (debug.ts): a no-op unless __DEV__ and EXPO_PUBLIC_POSTHOG_DEBUG=true.
  runDeliveryCheck(ph);

  return {
    capture: (event, properties) => void ph.capture(event, properties),
    screen: (name, properties) => void ph.screen(name, properties),
    captureException: (error, properties) => ph.captureException(error, properties),
    addExceptionStep: (message, properties) => ph.addExceptionStep(message, properties),
    identify: (id) => ph.identify(id),
    reset: () => ph.reset(),
    flush: () => ph.flush(),
    optIn: () => void ph.optIn(),
    optOut: () => void ph.optOut(),
    register: (properties) => void ph.register(properties),
  };
}
