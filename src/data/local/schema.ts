import type { SqlDatabase } from './sql.ts';

/**
 * The local database's schema, as numbered migrations. `PRAGMA user_version` records the last one applied; each runs
 * in its own transaction together with the version bump, so a crash or failure mid-migration leaves the database at
 * the previous version, and the next start tries again. Migrations only ever add: an ordinary upgrade never deletes
 * local data. Never edit a released migration — append a new one.
 *
 * Every row that belongs to a person carries their Supabase user id (`user_id`), and every query filters on it.
 * Nothing here holds a token, a password or analytics data.
 *
 * - sync_queue          writes waiting for the server: progress batches, practice-game results. One row per operation,
 *                       with a stable id the server deduplicates on. `status`: pending (to send), failed (refused for
 *                       good; kept for a while for diagnosis, never resent).
 * - progress_snapshots  the last known state of each account's learner progress on this device: what the app shows
 *                       at start-up without a network. Pending operations are re-applied on top of it (changes.ts).
 * - content_cache       the published content documents (catalog, categories), validated before they are stored. The
 *                       previous version stays until a new one is fully stored (one-row upsert).
 * - game_history        practice games finished on this device, per account, with whether the server has them.
 */

export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      create table if not exists sync_queue (
        seq integer primary key autoincrement,
        id text not null unique,
        user_id text not null,
        kind text not null,
        entity_id text,
        payload text not null,
        created_at integer not null,
        attempts integer not null default 0,
        last_attempt_at integer,
        next_attempt_at integer,
        status text not null default 'pending' check (status in ('pending', 'failed')),
        last_error text
      );
      create index if not exists sync_queue_by_user on sync_queue (user_id, kind, status, seq);

      create table if not exists progress_snapshots (
        user_id text primary key,
        payload text not null,
        saved_at integer not null,
        server_loaded_at integer
      );

      create table if not exists content_cache (
        key text primary key,
        version text not null,
        revision integer not null,
        payload text not null,
        fetched_at integer not null
      );

      create table if not exists game_history (
        session_id text primary key,
        user_id text not null,
        game text not null,
        payload text not null,
        played_at integer not null,
        synced integer not null default 0
      );
      create index if not exists game_history_by_user on game_history (user_id, played_at desc);
    `,
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Bring the database up to SCHEMA_VERSION. Safe to call on every start and from several callers (idempotent). */
export async function migrate(db: SqlDatabase, migrations: readonly Migration[] = MIGRATIONS): Promise<number> {
  const row = await db.first<{ user_version: number }>('pragma user_version');
  let current = row?.user_version ?? 0;
  for (const m of migrations) {
    if (m.version <= current) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      // PRAGMA takes no bound parameters; the version is a number from this file, never input.
      await tx.exec(`pragma user_version = ${Math.trunc(m.version)}`);
    });
    current = m.version;
  }
  return current;
}
