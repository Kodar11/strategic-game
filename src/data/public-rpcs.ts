/**
 * Database functions a guest (no session, the `anon` role) may call: published content and the public boards.
 * Everything else acts on the caller's own data and needs a signed-in user. The database enforces that itself
 * (grants and auth.uid()); this list only lets the app skip a pointless request and answer a guest with a sign-in
 * invitation. supabase/__tests__/auth.test.ts checks it against the real grants, so the two can't drift apart.
 */
export const PUBLIC_RPCS: ReadonlySet<string> = new Set([
  'get_published_content',
  'get_lesson_categories',
  'get_tournament_content',
  'daily_challenge_today',
  'get_games_overview',
  'get_leaderboard',
  'get_hall_of_fame',
  'get_challenge',
  'finalize_due_competitions',
  // Daily Challenge and Game of the Week boards and history (nicknames only).
  'get_daily_leaderboard',
  'get_daily_history',
  'get_competition',
  'get_competition_history',
  'get_champions_leaderboard',
]);
