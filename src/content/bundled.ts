import seed from '@/supabase/seed/content.json';

/**
 * The starter content bundled with the app: the repository's published-content snapshot (supabase/seed/content.json,
 * refreshed from the live database with `npm run content:pull`). A fresh install with no network starts from it, so
 * the first lessons, scenarios and practice games work before anything has been downloaded. As soon as the server
 * answers, its copy is cached and used from the next start (src/data/content-cache.ts). No media is bundled here.
 */
export function bundledContent(): unknown {
  return seed;
}
