/**
 * Tactiqo's observability layer (docs/OBSERVABILITY.md). Features use only these exports; nothing outside
 * src/observability imports the PostHog SDK (a test enforces it).
 *
 * - `track(name, props)`: a catalogued product event (events.ts). Unknown events and unlisted or unsafe properties are
 *   refused (privacy.ts).
 * - `reportError(kind, error, context, level)`: a handled failure worth a look, grouped and rate-limited.
 * - `useGameTelemetry` / `useLessonTelemetry` / `useScreenTracking`: lifecycle hooks for matches, lessons, screens.
 * - `startObservability()`: once, from the root layout.
 * - `ErrorBoundary`: the root route's error boundary. `Sensitive`: mask personal text in session replay.
 *
 * Identity and consent are not exported: they follow the auth store and the "Share usage and crash data" setting
 * (start.ts), so no feature can identify, reset or opt anyone in or out by itself. The data layer (src/data) imports
 * './api' directly, which avoids an import cycle through start.ts.
 */
export { currentScreen, errorCode, reportError, setCommonProperties, track } from './api';
export type { ErrorKind, ErrorLevel } from './core';
export type { EventName, EventProps } from './events';
export { useGameTelemetry, useLessonTelemetry, useScreenTracking, type MatchMeta, type MatchProgress } from './hooks';
export { ErrorBoundary } from './ErrorBoundary';
export { Sensitive } from './Sensitive';
export { startObservability } from './start';
