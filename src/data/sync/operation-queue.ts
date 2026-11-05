import type { LocalStore, QueueKind } from '../local/local-store.ts';
import { type SyncFailure, retryDelay as defaultRetryDelay } from './retry-policy.ts';

/**
 * A persistent queue of independent operations of one kind (each sent on its own, oldest first), for one signed-in
 * user at a time. Every operation is saved to the local store before `enqueue` resolves, so it survives the app being
 * closed or killed; it leaves the store only once the server has acknowledged it, or set aside (`fail`) when the server
 * refuses it for good. The server deduplicates on the operation id, so a resend after a lost answer is harmless.
 *
 * One worker at a time (`running`), one request at a time: no unbounded concurrency, and a flapping connection can't
 * start parallel sends of the same operation.
 */

export interface OperationQueueOptions<P> {
  kind: QueueKind;
  store: () => Promise<LocalStore>;
  send: (payload: P) => Promise<void>;
  classify: (e: unknown) => SyncFailure;
  retryDelay?: (failures: number) => number;
  onAcknowledged?: (owner: string, ids: string[]) => void | Promise<void>;
  onFailed?: (owner: string, id: string, failure: SyncFailure) => void;
  onPending?: (pending: number) => void;
}

export class OperationQueue<P> {
  private owner: string | null = null;
  private generation = 0;
  private running: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private count = 0;
  private readonly o: OperationQueueOptions<P>;

  constructor(options: OperationQueueOptions<P>) {
    this.o = options;
  }

  get pending(): number {
    return this.count;
  }

  /** Start working for `owner`: their saved operations are sent in the background. */
  async restore(owner: string): Promise<void> {
    if (this.owner !== owner) {
      this.stop();
      this.generation++;
      this.failures = 0;
    }
    this.owner = owner;
    await this.refreshCount();
    if (this.count) this.schedule(0);
  }

  /** Save an operation for the current owner and send it soon. Rejects only when nobody is signed in. */
  async enqueue(id: string, payload: P, entityId: string | null = null): Promise<void> {
    const owner = this.owner;
    if (!owner) throw new Error('no signed-in owner for the queue');
    const local = await this.o.store();
    await local.enqueue(owner, { id, kind: this.o.kind, entityId, payload });
    if (owner !== this.owner) return;
    await this.refreshCount();
    if (!this.failures) this.schedule(0);
  }

  /** Send everything now. True when the queue emptied; false on a transient failure (it keeps retrying). */
  drain(): Promise<boolean> {
    this.clearTimer();
    return this.run();
  }

  /** The connection came back: send now instead of waiting out the backoff. */
  retryNow(): void {
    if (!this.owner || this.running || !this.count) return;
    this.failures = 0;
    this.clearTimer();
    this.schedule(0);
  }

  stop(): void {
    this.clearTimer();
  }

  /** Stop working for the current owner. Their saved operations stay for when they sign in again. */
  detach(): void {
    this.stop();
    this.generation++;
    this.owner = null;
    this.count = 0;
    this.o.onPending?.(0);
  }

  /** Drop the current owner's queued operations (their account was deleted, or they chose to discard them). */
  async clear(): Promise<void> {
    const owner = this.owner;
    this.detach();
    if (owner) await (await this.o.store()).clearQueue(owner, this.o.kind).catch(() => undefined);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private async refreshCount(): Promise<void> {
    const owner = this.owner;
    if (!owner) return;
    try {
      const n = (await (await this.o.store()).pending(owner, this.o.kind)).length;
      if (owner === this.owner) {
        this.count = n;
        this.o.onPending?.(n);
      }
    } catch {
      // Unreadable store: the count stays as it was.
    }
  }

  private run(): Promise<boolean> {
    this.running ??= this.work().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async work(): Promise<boolean> {
    const owner = this.owner;
    const generation = this.generation;
    if (!owner) return true;
    const local = await this.o.store();
    const ops = await local.pending(owner, this.o.kind);
    for (const op of ops) {
      if (generation !== this.generation) return true;
      try {
        await this.o.send(op.payload as P);
        await local.acknowledge(owner, [op.id]);
        this.failures = 0;
        await this.o.onAcknowledged?.(owner, [op.id]);
      } catch (e) {
        const failure = this.o.classify(e);
        if (failure.category === 'duplicate') {
          await local.acknowledge(owner, [op.id]);
          await this.o.onAcknowledged?.(owner, [op.id]);
          continue;
        }
        if (!failure.retry) {
          await local.fail(owner, [op.id], failure.category);
          this.o.onFailed?.(owner, op.id, failure);
          continue;
        }
        this.failures++;
        const wait = (this.o.retryDelay ?? defaultRetryDelay)(this.failures);
        await local.noteAttempt(owner, [op.id], Date.now(), Date.now() + wait, failure.category).catch(() => undefined);
        if (generation === this.generation) {
          await this.refreshCount();
          this.schedule(wait);
        }
        return false;
      }
    }
    if (generation === this.generation) await this.refreshCount();
    return true;
  }
}
