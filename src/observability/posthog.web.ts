import type { ResolvedConfig } from './config';
import type { TelemetryClient } from './core';

/**
 * Web build: no telemetry (config.ts turns it off on web before this would be called). Kept as a separate file so the
 * PostHog React Native SDK is never bundled into the web build. The website will get its own setup (phase 2).
 */
export function createPostHogClient(_config: Extract<ResolvedConfig, { enabled: true }>, _consent: boolean): TelemetryClient | null {
  return null;
}
