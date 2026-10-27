import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite, type Transaction } from '@electric-sql/pglite';

/**
 * An in-process Postgres (PGlite) prepared like a Supabase project — `anon` and `authenticated` roles, `auth.users`
 * and `auth.uid()` reading the request's JWT claims — with the repository's migrations applied in order. Lets the
 * tests exercise the real SQL, row level security included, without a network or Docker.
 */

const ROOT = join(import.meta.dirname, '..');

const SUPABASE_SHIM = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create schema auth;
  create table auth.users (id uuid primary key, is_anonymous boolean not null default true);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

export function migrationFiles(): string[] {
  const dir = join(ROOT, 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

export function seedDocument(): unknown {
  return JSON.parse(readFileSync(join(ROOT, 'seed', 'content.json'), 'utf8'));
}

export async function createDatabase({ seed = true }: { seed?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`${file}: ${(e as Error).message}`);
    }
  }
  if (seed) {
    await importContent(db, seedDocument());
    // As seed.sql does: lessons arrive after the migrations, so their categories are assigned afterwards.
    await db.query('select content_admin.seed_lesson_categories()');
  }
  return db;
}

export async function importContent(db: PGlite | Transaction, doc: unknown): Promise<{ entity: string; id: string; action: string }[]> {
  const r = await db.query<{ entity: string; id: string; action: string }>('select * from content_admin.import_content($1::jsonb)', [JSON.stringify(doc)]);
  return r.rows;
}

export async function addUser(db: PGlite, id: string): Promise<void> {
  await db.query('insert into auth.users (id) values ($1)', [id]);
}

/** Run `fn` as a signed-in user (role `authenticated`, `auth.uid()` = id), or as `anon` when id is null. Rolled back on error. */
export async function as<T>(db: PGlite, id: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${id ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(id ? { sub: id, role: 'authenticated' } : { role: 'anon' })]);
    return fn(tx);
  });
}

/** The error message of a statement that must fail, or null if it succeeded. */
export async function failure(db: PGlite, id: string | null, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await as(db, id, (tx) => tx.query(sql, params));
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** The app's `Rpc` interface over this database, signed in as `id` — so repositories run against the real SQL. */
export function pgRpc(db: PGlite, id: string | null) {
  return {
    async call(fn: string, args?: Record<string, unknown>): Promise<unknown> {
      const names = Object.keys(args ?? {});
      const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}::jsonb`).join(', ')}) as r`;
      const r = await as(db, id, (tx) => tx.query<{ r: unknown }>(sql, names.map((n) => JSON.stringify(args![n]))));
      return r.rows[0].r;
    },
  };
}
