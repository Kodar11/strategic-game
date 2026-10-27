import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildCatalog } from './build.ts';
import { type Catalog, installCatalog } from './catalog.ts';

/**
 * Node-only (tests and scripts): the repository's content snapshot, `supabase/seed/content.json`. It is what a new
 * database is seeded from and what `npm run content:pull` refreshes from the live database; the app itself never
 * reads it — the app loads content from Supabase.
 */

export const SEED_PATH = fileURLToPath(new URL('../../supabase/seed/content.json', import.meta.url));

export function readSeed(): unknown {
  return JSON.parse(readFileSync(SEED_PATH, 'utf8'));
}

/** Build the catalog from the seed and install it, failing loudly if the seed doesn't pass every check. */
export function installSeedCatalog(): Catalog {
  const r = buildCatalog(readSeed());
  if (!r.ok) throw new Error(`The content seed is invalid:\n${r.problems.join('\n')}`);
  installCatalog(r.catalog);
  return r.catalog;
}
