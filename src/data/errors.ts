/**
 * Errors from the data layer, in terms the app can act on and the learner can read. Database details stay in
 * `detail` (for logs during development) and never reach the screen.
 */

export type DataErrorKind = 'config' | 'network' | 'auth' | 'content' | 'refused' | 'server';

const MESSAGES: Record<DataErrorKind, string> = {
  config: 'The app isn’t connected to its database. Check the Supabase settings in .env and restart.',
  network: 'Couldn’t reach the server. Check your connection and try again.',
  auth: 'Couldn’t start a session with the server. Try again in a moment.',
  content: 'The lesson content on the server didn’t pass this app’s checks, so it wasn’t loaded.',
  refused: 'The server refused a change. Your latest answer may not have been saved.',
  server: 'The server had a problem. Try again in a moment.',
};

export class DataError extends Error {
  readonly kind: DataErrorKind;
  /** What actually went wrong, for logs. Never shown to the learner. */
  readonly detail: string;

  constructor(kind: DataErrorKind, detail = '', message: string = MESSAGES[kind]) {
    super(message);
    this.name = 'DataError';
    this.kind = kind;
    this.detail = detail;
  }

  /** Worth retrying: the same request may succeed later. */
  get transient(): boolean {
    return this.kind === 'network' || this.kind === 'auth' || this.kind === 'server';
  }
}

/** A Supabase / PostgREST error object, or anything thrown by fetch. */
interface ErrorLike {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

/**
 * Classify a failure. Postgres classes 22 (bad data), 23 (constraint), 42 (permission or unknown object) and P0 are
 * the database refusing the request: retrying won't help. Missing or expired sessions retry after sign-in refreshes.
 * Anything without a database code — no network, a timeout, a 5xx — is transient.
 */
export function toDataError(e: unknown): DataError {
  if (e instanceof DataError) return e;
  const x = (e ?? {}) as ErrorLike;
  const code = x.code ?? '';
  const detail = [code, x.message].filter(Boolean).join(': ');
  if (code === '28000' || code === 'PGRST301' || code === 'PGRST302' || x.status === 401) return new DataError('auth', detail);
  if (/^(22|23|42|P0)/.test(code) || code.startsWith('PGRST1') || code.startsWith('PGRST2')) return new DataError('refused', detail);
  if (x.status && x.status >= 500) return new DataError('server', detail);
  return new DataError('network', detail);
}
