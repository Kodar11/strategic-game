/**
 * The part of the database the app talks to, in the shape `supabase gen types typescript` produces. The app reaches
 * the database only through these functions (it never selects from tables directly), so they are the whole typed
 * surface. Keep in step with supabase/migrations; regenerate the full file with
 * `npx supabase gen types typescript --project-id <ref> --schema public` when the CLI is linked.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      get_published_content: { Args: Record<string, never>; Returns: Json };
      get_lesson_categories: { Args: Record<string, never>; Returns: Json };
      get_my_progress: { Args: Record<string, never>; Returns: Json };
      apply_progress_changes: { Args: { changes: Json }; Returns: Json };
      get_daily_challenges: { Args: { request: Json }; Returns: Json };
      submit_daily_challenge: { Args: { request: Json }; Returns: Json };
      check_daily_practice: { Args: { request: Json }; Returns: Json };
      get_daily_reveal: { Args: { request: Json }; Returns: Json };
      daily_challenge_today: { Args: Record<string, never>; Returns: string };
      get_games_overview: { Args: Record<string, never>; Returns: Json };
      set_nickname: { Args: { request: Json }; Returns: Json };
      start_match: { Args: { request: Json }; Returns: Json };
      play_match_round: { Args: { request: Json }; Returns: Json };
      get_match: { Args: { request: Json }; Returns: Json };
      get_leaderboard: { Args: { request: Json }; Returns: Json };
      get_hall_of_fame: { Args: { request?: Json }; Returns: Json };
      create_challenge: { Args: { request: Json }; Returns: Json };
      get_challenge: { Args: { request: Json }; Returns: Json };
      record_practice_game: { Args: { request: Json }; Returns: Json };
      get_my_games: { Args: Record<string, never>; Returns: Json };
      delete_my_account: { Args: Record<string, never>; Returns: Json };
      finalize_due_competitions: { Args: Record<string, never>; Returns: number };
    };
    Enums: { content_status: 'draft' | 'published' };
    CompositeTypes: Record<string, never>;
  };
}
