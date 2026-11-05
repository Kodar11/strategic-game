import type { ProgressChanges } from '../changes.ts';
import type { LocalStore } from '../local/local-store.ts';
import type { OutboxEntry, OutboxStore } from '../outbox.ts';

/** The progress outbox's rows in the local store (kind `progress`), one per operation, scoped to their owner. */
export function localOutboxStore(local: () => Promise<LocalStore>): OutboxStore {
  return {
    async load(owner) {
      const ops = await (await local()).pending(owner, 'progress');
      return ops.filter((op) => op.payload && typeof op.payload === 'object').map((op): OutboxEntry => ({ id: op.id, changes: op.payload as ProgressChanges }));
    },
    append: async (owner, entry) => (await local()).enqueue(owner, { id: entry.id, kind: 'progress', payload: entry.changes }),
    remove: async (owner, ids) => (await local()).acknowledge(owner, ids),
    fail: async (owner, ids, message) => (await local()).fail(owner, ids, message),
    note: async (owner, ids, at, nextAt, message) => (await local()).noteAttempt(owner, ids, at, nextAt, message),
    clear: async (owner) => (await local()).clearQueue(owner, 'progress'),
  };
}
