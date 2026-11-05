import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

import { reportError } from '@/src/observability/api';
import { kvStore } from './kv-store';
import { type LocalStore, sqlStore } from './local-store';
import { migrate } from './schema';
import { type SqlConnection, type SqlValue, serialized } from './sql';

/**
 * The app's local store on Android and iOS: one SQLite database (`tactiqo.db` in the app's private documents
 * directory), opened once, migrated, then shared. Opening is asynchronous and never blocks a render; concurrent
 * callers share the same opening promise, so the database is opened and migrated exactly once.
 *
 * If SQLite can't be opened or migrated (a corrupted file, a full disk), the app keeps working on the key-value store
 * instead and the failure is reported once: offline support degrades, nothing else breaks.
 */

export const DATABASE_NAME = 'tactiqo.db';

function connection(db: SQLite.SQLiteDatabase): SqlConnection {
  const bind = (params?: readonly SqlValue[]) => (params ? [...params] : []);
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params) => ({ changes: (await db.runAsync(sql, bind(params))).changes }),
    all: <T>(sql: string, params?: readonly SqlValue[]) => db.getAllAsync<T>(sql, bind(params)),
    first: <T>(sql: string, params?: readonly SqlValue[]) => db.getFirstAsync<T>(sql, bind(params)),
  };
}

let opening: Promise<LocalStore> | null = null;

async function open(): Promise<LocalStore> {
  try {
    const raw = await SQLite.openDatabaseAsync(DATABASE_NAME);
    const db = serialized(connection(raw));
    // WAL keeps reads from waiting on writes; NORMAL sync is durable across app crashes (not power loss mid-write,
    // where the last transaction may roll back — never a corrupt file).
    await db.exec('pragma journal_mode = wal; pragma synchronous = normal;');
    await migrate(db);
    return sqlStore(db);
  } catch (e) {
    reportError('local_db_failed', e, { error_code: 'open_or_migrate' });
    if (__DEV__) console.warn('[local] SQLite unavailable, using key-value storage', e);
    return kvStore(AsyncStorage);
  }
}

export function localStore(): Promise<LocalStore> {
  opening ??= open();
  return opening;
}
