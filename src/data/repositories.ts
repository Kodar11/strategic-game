import { z } from 'zod';

import { buildCatalog } from '../content/build.ts';
import type { Catalog } from '../content/catalog.ts';
import { type ProgressData, sanitizeProgress } from '../store/progress-state.ts';
import type { ProgressChanges } from './changes.ts';
import { DataError, toDataError } from './errors.ts';

/**
 * Typed access to the database, one repository per concern. Screens and stores never issue queries: they call these.
 * Everything goes through three database functions (see supabase/migrations) so each read is one consistent snapshot
 * and each write is one transaction:
 * - get_published_content()        the content catalog
 * - get_my_progress()              the signed-in learner's progress
 * - apply_progress_changes(changes) one batch of progress changes
 *
 * `Rpc` is the only thing a repository needs, so tests run the repositories against the real SQL (PGlite).
 */

export type RpcName = 'get_published_content' | 'get_my_progress' | 'apply_progress_changes';

export interface Rpc {
  /** Resolve with the function's JSON result, or throw the database / network error. */
  call(fn: RpcName, args?: Record<string, unknown>): Promise<unknown>;
}

export interface ContentRepository {
  /** The published catalog, validated and joined with this app's engines. Throws a DataError otherwise. */
  fetchCatalog(): Promise<Catalog>;
}

export interface ProgressRepository {
  /** The learner's progress, sanitized exactly as the app always sanitized saved progress. Needs the catalog. */
  load(): Promise<ProgressData>;
  /** Apply one batch in one transaction. Idempotent. */
  apply(changes: ProgressChanges): Promise<{ skipped: number }>;
}

async function call(rpc: Rpc, fn: RpcName, args?: Record<string, unknown>): Promise<unknown> {
  try {
    return await rpc.call(fn, args);
  } catch (e) {
    throw toDataError(e);
  }
}

export function contentRepository(rpc: Rpc): ContentRepository {
  return {
    async fetchCatalog() {
      const doc = await call(rpc, 'get_published_content');
      const built = buildCatalog(doc);
      if (!built.ok) throw new DataError('content', built.problems.join('\n'));
      return built.catalog;
    },
  };
}

const applyResult = z.object({ ok: z.literal(true), skipped: z.number().int().nonnegative() });

export function progressRepository(rpc: Rpc): ProgressRepository {
  return {
    async load() {
      const raw = await call(rpc, 'get_my_progress');
      if (!raw || typeof raw !== 'object') throw new DataError('server', 'get_my_progress returned no object');
      return sanitizeProgress(raw);
    },
    async apply(changes) {
      const raw = await call(rpc, 'apply_progress_changes', { changes });
      const r = applyResult.safeParse(raw);
      if (!r.success) throw new DataError('server', 'apply_progress_changes returned an unexpected result');
      return { skipped: r.data.skipped };
    },
  };
}
