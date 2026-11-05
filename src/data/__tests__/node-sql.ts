import { DatabaseSync } from 'node:sqlite';

import { type SqlConnection, type SqlDatabase, type SqlValue, serialized } from '../local/sql.ts';

/** The local store's SQL surface over Node's built-in SQLite, so tests run the app's real schema and queries. */
export function nodeSql(path = ':memory:'): SqlDatabase & { close(): void } {
  const db = new DatabaseSync(path);
  const p = (params?: readonly SqlValue[]) => (params ?? []) as SqlValue[];
  const raw: SqlConnection = {
    exec: async (sql) => void db.exec(sql),
    run: async (sql, params) => ({ changes: Number(db.prepare(sql).run(...p(params)).changes) }),
    all: async <T>(sql: string, params?: readonly SqlValue[]) => db.prepare(sql).all(...p(params)) as T[],
    first: async <T>(sql: string, params?: readonly SqlValue[]) => (db.prepare(sql).get(...p(params)) as T | undefined) ?? null,
  };
  return { ...serialized(raw), close: () => db.close() };
}
