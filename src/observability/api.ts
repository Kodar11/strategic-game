import { telemetry } from './core.ts';

/**
 * The calls features make (re-exported by index.ts). Kept apart from the hooks and start-up so the data layer
 * (src/data) can import it without an import cycle through start.ts.
 */
export const track: typeof telemetry.track = (name, props) => telemetry.track(name, props);
export const reportError: typeof telemetry.reportError = (kind, error, context, level) => telemetry.reportError(kind, error, context, level);
/** The normalized screen on show (for a `source` property). */
export const currentScreen = (): string | null => telemetry.currentScreen;
/** Properties sent with every event (e.g. the content revision once the catalogue is loaded). */
export const setCommonProperties: typeof telemetry.setSuperProps = (props) => telemetry.setSuperProps(props);

export { errorCode } from './core.ts';
