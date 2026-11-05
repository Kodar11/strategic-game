import { type ErrorBoundaryProps, ErrorBoundary as RouterErrorBoundary } from 'expo-router';
import { useEffect } from 'react';

import { telemetry } from './core';

/**
 * The root route's error boundary: Expo Router's own recovery screen (message and "Retry"), plus one report of the
 * render error. Expo Router catches the error, so it never reaches the global handler — this is its only report, and
 * console capture is off in posthog.ts, so it isn't reported twice.
 */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => {
    telemetry.reportError('render_error', props.error, {}, 'fatal');
  }, [props.error]);
  return <RouterErrorBoundary {...props} />;
}
