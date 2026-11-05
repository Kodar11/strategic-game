/**
 * The narrow SQL surface the local store needs. The app implements it with expo-sqlite (database.ts); the tests with
 * Node's built-in `node:sqlite` (src/data/__tests__/node-sql.ts), so the same schema, migrations and queries run in
 * both. Values are bound, never interpolated.
 */

export type SqlValue = string | number | null;

export interface SqlConnection {
  /** Run one or more statements with no parameters (schema only — never user data). */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
}

export interface SqlDatabase extends SqlConnection {
  /**
   * Run `task` in one transaction: every statement it issues commits together or not at all. Calls are serialized
   * (see `serialized`), so nothing from outside can interleave with the transaction's statements.
   */
  transaction<T>(task: (tx: SqlConnection) => Promise<T>): Promise<T>;
}

/**
 * Wrap a raw connection so every call runs one at a time, and transactions are BEGIN … COMMIT / ROLLBACK blocks that
 * nothing else can join. One connection, one queue: the volumes here are tiny, and it rules out a whole class of
 * interleaving bugs (a write landing inside someone else's transaction, or between its statements).
 */
export function serialized(raw: SqlConnection): SqlDatabase {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };
  return {
    exec: (sql) => enqueue(() => raw.exec(sql)),
    run: (sql, params) => enqueue(() => raw.run(sql, params)),
    all: <T>(sql: string, params?: readonly SqlValue[]) => enqueue(() => raw.all<T>(sql, params)),
    first: <T>(sql: string, params?: readonly SqlValue[]) => enqueue(() => raw.first<T>(sql, params)),
    transaction: (task) =>
      enqueue(async () => {
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await task(raw);
          await raw.exec('COMMIT');
          return result;
        } catch (e) {
          await raw.exec('ROLLBACK').catch(() => undefined);
          throw e;
        }
      }),
  };
}
