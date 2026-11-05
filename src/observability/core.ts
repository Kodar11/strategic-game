import { EVENTS, type EventName, type EventProps, isSendable } from './events.ts';
import { ERROR_CONTEXT, type Primitive, cleanProps, scrubMessage } from './privacy.ts';
import type { ScreenView } from './routes.ts';

/**
 * The observability engine: product events, screens, handled errors, identity and consent. Pure TypeScript with the
 * SDK behind a small interface, so every rule here is unit-tested in Node (src/observability/__tests__).
 *
 * Guarantees:
 * - Never throws into the app and never blocks it. A broken or missing SDK means nothing is sent, nothing else.
 * - Nothing is collected without the player's explicit "Share" (consent is false until `setConsent(true)`). Before
 *   that, every call is dropped on the spot — not buffered, so nothing from before the choice is sent after it. The
 *   SDK itself is only created once consent is granted (start.ts), so no analytics id or file exists before that.
 * - After consent, calls made while the SDK is still starting are buffered (≤ 100) and sent once it is installed; if
 *   telemetry turns out to be off for the build, the buffer is dropped.
 * - Only catalogued events with clean properties are sent (events.ts, privacy.ts).
 * - Identity changes only through `setUser` and consent only through `setConsent` (identity rules below).
 */

/** The parts of the PostHog client this module uses (adapter in posthog.ts; fakes in tests). */
export interface TelemetryClient {
  capture(event: string, properties: Record<string, Primitive>): void;
  screen(name: string, properties: Record<string, Primitive>): void;
  captureException(error: Error, properties: Record<string, Primitive>): void;
  addExceptionStep(message: string, properties?: Record<string, Primitive>): void;
  identify(distinctId: string): void;
  reset(): void;
  /** Sends everything queued on the device now. Resolves when done or failed. */
  flush(): Promise<void>;
  optIn(): void;
  optOut(): void;
  register(properties: Record<string, Primitive>): void;
}

export type ErrorKind =
  | 'startup_failed'
  | 'sync_failed'
  | 'arena_upload_failed'
  | 'rpc_failed'
  | 'sign_in_failed'
  | 'delete_account_failed'
  | 'ranked_move_failed'
  | 'audio_failed'
  | 'render_error';

export type ErrorLevel = 'fatal' | 'error' | 'warning';

/** Handled-error limits per app session (a launch): the same problem at most 3 times, and 50 reports in all. */
export const SAME_ERROR_LIMIT = 3;
export const SESSION_ERROR_LIMIT = 50;
const BUFFER_LIMIT = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Telemetry {
  private client: TelemetryClient | null = null;
  private status: 'pending' | 'on' | 'off' = 'pending';
  private buffer: ((c: TelemetryClient) => void)[] = [];
  /** Only an explicit "Share" sets this (src/store/settings.ts `usageConsent: 'granted'`). */
  private consent = false;
  private userId: string | null = null;
  private superProps: Record<string, Primitive> = { auth_state: 'guest' };
  private errorCounts = new Map<string, number>();
  private errorTotal = 0;
  private screenKey: string | null = null;
  private screenName: string | null = null;
  private previousScreenName: string | null = null;

  private readonly warn: (message: string) => void;

  constructor(warn: (message: string) => void = () => undefined) {
    this.warn = warn;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────────────────────────────────────

  /** The SDK is ready: apply consent and identity, then send what was buffered. */
  install(client: TelemetryClient, superProps: Record<string, Primitive> = {}): void {
    this.safely(() => {
      this.client = client;
      this.status = 'on';
      this.superProps = { ...this.superProps, ...superProps };
      this.applyConsent();
      client.register(this.superProps);
      if (this.userId) client.identify(this.userId);
      const pending = this.buffer;
      this.buffer = [];
      if (this.consent) for (const op of pending) this.safely(() => op(client));
    });
  }

  /** Telemetry is off for this launch (switched off, web, no key): forget everything buffered. */
  disable(reason: string): void {
    this.status = 'off';
    this.buffer = [];
    this.client = null;
    this.warn(`[observability] off: ${reason}`);
  }

  get active(): boolean {
    return this.status === 'on' && this.consent;
  }

  // ── Product events ───────────────────────────────────────────────────────────────────────────────────────────

  track<E extends EventName>(name: E, props?: EventProps<E>): void {
    this.safely(() => {
      if (!isSendable(name)) return this.warn(`[observability] refused event "${String(name)}"`);
      const { props: clean, dropped } = cleanProps(EVENTS[name].props, props ?? {});
      if (dropped.length) this.warn(`[observability] ${name}: dropped ${dropped.join(', ')}`);
      this.run((c) => {
        c.capture(name, clean);
        c.addExceptionStep(`event:${name}`, idsOnly(clean));
      });
    });
  }

  /** A screen view. The same screen (same ids) twice in a row is one view: re-renders and focus changes don't repeat it. */
  screen(view: ScreenView | null): void {
    this.safely(() => {
      if (!view || view.key === this.screenKey) return;
      this.screenKey = view.key;
      this.previousScreenName = this.screenName;
      this.screenName = view.screen;
      const props = { ...view.props };
      this.run((c) => {
        c.screen(view.screen, props);
        c.addExceptionStep(`screen:${view.screen}`, props);
      });
    });
  }

  /** The screen on show now, and the one before it (for `source` properties). */
  get currentScreen(): string | null {
    return this.screenName;
  }

  get previousScreen(): string | null {
    return this.previousScreenName;
  }

  // ── Handled errors ───────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Report a failure the app handled but someone should look at. Grouped by `kind` plus the error's code, so one
   * problem is one issue in PostHog whatever its message. Each problem is reported at most SAME_ERROR_LIMIT times per
   * session and SESSION_ERROR_LIMIT reports in all, so a retry loop can't flood the error budget.
   */
  reportError(kind: ErrorKind, error: unknown, context: Record<string, unknown> = {}, level: ErrorLevel = 'error'): void {
    this.safely(() => {
      const { props } = cleanProps(ERROR_CONTEXT, context);
      const code = typeof props.error_code === 'string' ? props.error_code : typeof props.refusal === 'string' ? props.refusal : 'none';
      const fingerprint = `${kind}:${code}`;
      const seen = this.errorCounts.get(fingerprint) ?? 0;
      if (seen >= SAME_ERROR_LIMIT || this.errorTotal >= SESSION_ERROR_LIMIT) return;
      this.errorCounts.set(fingerprint, seen + 1);
      this.errorTotal += 1;
      const err = normalizeError(error, kind);
      const route = this.screenName;
      this.run((c) =>
        c.captureException(err, {
          ...props,
          ...(route && !props.route ? { route } : {}),
          error_kind: kind,
          error_level: level,
          handled: true,
          $exception_fingerprint: fingerprint,
        }),
      );
    });
  }

  // ── Identity and consent ─────────────────────────────────────────────────────────────────────────────────────

  /**
   * Who is using the app: a confirmed Supabase user id, or null for a guest. Only ever called with a user the server
   * confirmed (src/data/session.ts dispatches `signedIn` / `restored` after `getUser()`).
   * - guest → user: identify (the guest's earlier events join that person).
   * - user → guest (sign-out, deletion, revoked session): reset, so the next events are a new anonymous person.
   * - user A → user B: reset, then identify B. Nothing of A follows B.
   * Calling it again with the current value does nothing.
   */
  setUser(id: string | null): void {
    this.safely(() => {
      const next = id && UUID.test(id) ? id : null;
      if (next === this.userId) return;
      const hadUser = this.userId !== null;
      this.userId = next;
      this.superProps = { ...this.superProps, auth_state: next ? 'signed_in' : 'guest' };
      const c = this.client;
      if (this.status !== 'on' || !c) return;
      if (hadUser) {
        c.reset();
        // reset() clears the opt-out choice and every registered property; put them back at once.
        this.applyConsent();
      }
      c.register(this.superProps);
      if (next) c.identify(next);
    });
  }

  /**
   * The player's "Share anonymous usage and diagnostic data" choice, kept in device settings so it survives sign-out
   * and account switches. Takes effect at once:
   * - Turning it off stops collection immediately (nothing more is sent, not even a last "opted out" event), drops
   *   anything buffered, and resets the SDK's on-device identity and properties. Events captured while consent was
   *   on and already queued may still be delivered; nothing captured after this point is.
   * - Turning it on (again) opts in, re-applies the common properties and re-identifies a signed-in player.
   */
  setConsent(allowed: boolean): void {
    this.safely(() => {
      if (allowed === this.consent) return;
      this.consent = allowed;
      const c = this.client;
      if (!allowed) {
        this.buffer = [];
        if (c && this.status === 'on') {
          c.optOut();
          c.reset();
          // reset() clears the persisted opt-out too; apply it again.
          c.optOut();
        }
        return;
      }
      if (c && this.status === 'on') {
        c.optIn();
        c.register(this.superProps);
        if (this.userId) c.identify(this.userId);
      }
    });
  }

  /**
   * Sends whatever the SDK has queued on the device, waiting at most `timeoutMs`. Used before an account deletion so
   * events already captured for that account reach PostHog before its deletion is requested. Never throws.
   */
  async flush(timeoutMs = 3000): Promise<void> {
    const c = this.client;
    if (!c || this.status !== 'on') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([c.flush().catch(() => undefined), new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)))]);
    } catch {
      // Telemetry must never break the app.
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** False once telemetry is known to be off for this build (web, switched off, no key). */
  get available(): boolean {
    return this.status !== 'off';
  }

  /** Whether the SDK has been installed for this launch (it is only created once consent is granted). */
  get installed(): boolean {
    return this.client !== null;
  }

  get consented(): boolean {
    return this.consent;
  }

  /** Add or change properties sent with every event (the content revision once it is known, for example). */
  setSuperProps(props: Record<string, Primitive>): void {
    this.safely(() => {
      this.superProps = { ...this.superProps, ...props };
      if (this.status === 'on' && this.client) this.client.register(this.superProps);
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────────────────────────────────────────

  private applyConsent(): void {
    const c = this.client;
    if (!c) return;
    if (this.consent) c.optIn();
    else c.optOut();
  }

  private run(op: (c: TelemetryClient) => void): void {
    // Without consent nothing is kept, so nothing from before the choice can be sent after it.
    if (!this.consent || this.status === 'off') return;
    if (this.status === 'pending' || !this.client) {
      if (this.buffer.length < BUFFER_LIMIT) this.buffer.push(op);
      return;
    }
    op(this.client);
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      try {
        this.warn(`[observability] internal error: ${e instanceof Error ? e.message : String(e)}`);
      } catch {
        // Nothing: telemetry must never break the app.
      }
    }
  }
}

function idsOnly(props: Record<string, Primitive>): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  for (const k of ['game_id', 'lesson_id', 'scenario_id', 'story_id', 'mode', 'outcome']) if (k in props) out[k] = props[k];
  return out;
}

/**
 * An Error that is safe to send: its own stack (for symbolication), a scrubbed one-line message, and the app's
 * DataError kind and code rather than the database detail (which is for development logs only).
 */
export function normalizeError(error: unknown, kind: ErrorKind): Error {
  if (error instanceof Error) {
    const out = new Error(scrubMessage(error.message || kind));
    out.name = error.name && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : 'Error';
    if (error.stack) out.stack = error.stack.replace(error.message, out.message);
    return out;
  }
  return new Error(scrubMessage(typeof error === 'string' ? error : kind));
}

/** The code at the start of a DataError's detail (`PGRST202: …`, `P0001: daily:not_found`), if it looks like one. */
export function errorCode(detail: string | undefined): string | undefined {
  const head = detail?.split(':')[0]?.trim();
  return head && /^[A-Z0-9]{3,10}$/.test(head) ? head : undefined;
}

/** The app's one telemetry instance. Development builds print what it refuses or drops. */
export const telemetry = new Telemetry(
  typeof __DEV__ !== 'undefined' && __DEV__ ? (m) => console.info(m) : () => undefined,
);
