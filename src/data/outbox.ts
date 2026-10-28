import { type ProgressChanges, isEmpty, mergeChanges } from './changes.ts';

/**
 * The write queue between the store and Supabase. The store changes immediately, as it always did; each change is
 * queued here and sent in order, one request at a time, so the database applies them in the order they happened.
 *
 * - Batches waiting together are merged and sent as one transaction (`mergeChanges`).
 * - Every write is idempotent, so a request that may or may not have arrived is simply sent again.
 * - Transient failures (offline, timeouts, 5xx) retry with backoff; nothing is lost while the app stays open, and the
 *   queue is saved so it survives a restart. It is a queue of pending writes, never a second copy of the progress:
 *   entries leave it as soon as the database has them, and it belongs to one signed-in user.
 * - A batch the database refuses outright (invalid data, permission) is dropped and reported, so one bad write can't
 *   block everything after it.
 */

export type FailureKind = 'transient' | 'permanent';

export interface OutboxStatus {
  pending: number;
  state: 'idle' | 'saving' | 'retrying' | 'error';
  /** Plain-language reason for `retrying` / `error`. */
  message: string | null;
}

export interface OutboxStorage {
  load: () => Promise<string | null>;
  save: (value: string | null) => Promise<void>;
}

export interface OutboxOptions {
  send: (changes: ProgressChanges) => Promise<void>;
  classify: (error: unknown) => { kind: FailureKind; message: string };
  storage: OutboxStorage;
  debounceMs?: number;
  /** Retry delays start here (default 1 s) and double up to `maxRetryMs` (default 30 s). */
  retryBaseMs?: number;
  maxRetryMs?: number;
  onStatus?: (status: OutboxStatus) => void;
}

export class Outbox {
  private queue: ProgressChanges[] = [];
  private owner: string | null = null;
  private inflight: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private status: OutboxStatus = { pending: 0, state: 'idle', message: null };
  private waiters: (() => void)[] = [];

  private readonly o: OutboxOptions;

  constructor(options: OutboxOptions) {
    this.o = options;
  }

  /** Load the saved queue for this user. A queue saved for anyone else is discarded. */
  async restore(owner: string): Promise<void> {
    this.owner = owner;
    try {
      const raw = await this.o.storage.load();
      const saved = raw ? (JSON.parse(raw) as { owner?: string; queue?: ProgressChanges[] }) : null;
      this.queue = saved && saved.owner === owner && Array.isArray(saved.queue) ? saved.queue : [];
    } catch {
      this.queue = [];
    }
    this.emit(this.queue.length ? 'saving' : 'idle', null);
  }

  enqueue(changes: ProgressChanges): void {
    if (isEmpty(changes)) return;
    this.queue.push(changes);
    void this.persist();
    this.emit(this.status.state === 'retrying' ? 'retrying' : 'saving', this.status.state === 'retrying' ? this.status.message : null);
    this.schedule(this.failures ? null : (this.o.debounceMs ?? 300));
  }

  /** Send everything now. Resolves once the queue is empty, or rejects-free with false if it couldn't be emptied. */
  async drain(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.queue.length) {
      const ok = await this.sendOnce();
      if (!ok && this.status.state === 'retrying') return false;
    }
    return true;
  }

  /** Cancel any scheduled send (pending changes stay queued and saved). */
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Drop every pending change and the saved copy, e.g. once the account they belong to has been deleted. */
  async clear(): Promise<void> {
    this.stop();
    this.queue = [];
    this.owner = null;
    this.failures = 0;
    await this.persist();
    this.waiters.splice(0).forEach((w) => w());
    this.status = { pending: 0, state: 'idle', message: null };
    this.o.onStatus?.(this.status);
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Resolves when the queue is next empty (for tests and orderly shutdown). */
  idle(): Promise<void> {
    return this.queue.length || this.inflight ? new Promise((r) => this.waiters.push(r)) : Promise.resolve();
  }

  private schedule(delay: number | null): void {
    if (this.timer) {
      if (delay === null) return;
      clearTimeout(this.timer);
    }
    const ms = delay ?? Math.min((this.o.retryBaseMs ?? 1000) * 2 ** (this.failures - 1), this.o.maxRetryMs ?? 30000);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sendOnce().then(() => {
        if (this.queue.length && !this.timer) this.schedule(this.failures ? null : 0);
      });
    }, ms);
  }

  /** Send the merged queue once. True when it was accepted (or refused outright and dropped). */
  private sendOnce(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    if (!this.queue.length) return Promise.resolve(true);
    this.inflight = this.attempt().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async attempt(): Promise<boolean> {
    const count = this.queue.length;
    const batch = this.queue.slice(0, count).reduce(mergeChanges);
    try {
      await this.o.send(batch);
      this.queue.splice(0, count);
      this.failures = 0;
      this.emit(this.queue.length ? 'saving' : 'idle', null);
      return true;
    } catch (e) {
      const { kind, message } = this.o.classify(e);
      if (kind === 'permanent') {
        this.queue.splice(0, count);
        this.failures = 0;
        this.emit('error', message);
        return true;
      }
      this.failures++;
      this.emit('retrying', message);
      this.schedule(null);
      return false;
    } finally {
      await this.persist();
      if (!this.queue.length) this.waiters.splice(0).forEach((w) => w());
    }
  }

  private async persist(): Promise<void> {
    try {
      await this.o.storage.save(this.queue.length && this.owner ? JSON.stringify({ owner: this.owner, queue: this.queue }) : null);
    } catch {
      // Storage is a safety net for restarts; the in-memory queue still sends.
    }
  }

  private emit(state: OutboxStatus['state'], message: string | null): void {
    // An error stays visible until something is saved successfully.
    if (state === 'saving' && this.status.state === 'error') state = 'error';
    this.status = { pending: this.queue.length, state, message: state === 'error' && !message ? this.status.message : message };
    this.o.onStatus?.(this.status);
  }
}
