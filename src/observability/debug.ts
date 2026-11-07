import type PostHog from 'posthog-react-native';

/**
 * TEMPORARY delivery diagnostic (PostHog "no events" investigation, 2026-11-06). Remove this file and its three call
 * sites (start.ts, posthog.ts) once events are confirmed in PostHog.
 *
 * Runs only in a development build (`__DEV__`) with `EXPO_PUBLIC_POSTHOG_DEBUG=true`, and only after the player chose
 * "Share" (the SDK doesn't exist before that). It logs each step of the pipeline to the Metro terminal with the
 * `[observability:debug]` prefix, sends one `tactiqo_debug_test` event straight through the SDK (outside the event
 * catalogue on purpose, so the catalogue snapshot is untouched) and forces a flush.
 *
 * Never logged: the API key (only its prefix and length), the distinct id, or event properties.
 */
export const DEBUG_DELIVERY =
  typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_POSTHOG_DEBUG === 'true';

export function debugLog(message: string): void {
  if (DEBUG_DELIVERY) console.info(`[observability:debug] ${message}`);
}

/** The key's shape only: enough to spot a missing, truncated or wrong-type key. */
export function describeKey(key: string | undefined): string {
  const k = key?.trim() ?? '';
  return k ? `${k.slice(0, 4)}… (${k.length} chars)` : 'missing';
}

/** An error message with anything key-like removed. */
function safeMessage(e: unknown): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return raw.replace(/ph[cx]_[A-Za-z0-9]+/g, 'ph?_[redacted]').slice(0, 300);
}

/** Listens to the SDK's own error and flush signals, then sends the test event and flushes. */
export function runDeliveryCheck(ph: PostHog): void {
  if (!DEBUG_DELIVERY) return;
  ph.on('error', (e: unknown) => debugLog(`SDK error: ${safeMessage(e)}`));
  ph.on('flush', (messages: unknown) => {
    const names = Array.isArray(messages) ? messages.map((m) => (m as { event?: string })?.event ?? '?') : [];
    debugLog(`flush delivered ${names.length} event(s): ${names.join(', ') || '(none)'}`);
  });
  void (async () => {
    try {
      await ph.ready();
      debugLog(`SDK ready; optedOut=${ph.optedOut}`);
      ph.capture('tactiqo_debug_test', { source: 'expo_debug' });
      debugLog('captured tactiqo_debug_test');
      // capture() enqueues asynchronously; give it a tick before flushing.
      await new Promise((resolve) => setTimeout(resolve, 250));
      await ph.flush();
      debugLog('flush() resolved without error (look for "flush delivered" above, and in PostHog → Activity)');
    } catch (e) {
      debugLog(`delivery check FAILED: ${safeMessage(e)}`);
    }
  })();
}
