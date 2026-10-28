-- Account deletion: a signed-in player deletes their own (anonymous) account and everything tied to it.
--
-- Every table that holds a player's data references auth.users with `on delete cascade`, and the games guards already
-- let that cascade through (competition_results_immutable, game_matches_guard). So deleting the auth.users row removes:
--   learner_profiles, lesson_progress, scenario_runs, scenario_completions, challenge_drafts, assessment_runs,
--   learning_attempts, daily_challenge_attempts, player_profiles (frees the nickname), game_challenges they created,
--   game_matches, competition_results and game_practice_results.
-- Finalized weeks keep their other players' results; ranks are not recomputed.
--
-- One reference blocked that cascade: other players' matches on a friend challenge this player created
-- (game_matches.challenge_id, `on delete restrict`). The challenge can't outlive its creator, and a challenge match
-- can't exist without its challenge (game_matches check constraint), so those matches now go with the challenge.
-- They are unranked friend games; competition matches are not affected.

alter table public.game_matches drop constraint game_matches_challenge_id_fkey;
alter table public.game_matches add constraint game_matches_challenge_id_fkey
  foreign key (challenge_id) references public.game_challenges (id) on delete cascade;

-- Takes no arguments: the account is always the caller's own, from the verified JWT (auth.uid()), so a modified
-- request can't name anyone else. Runs as the function owner, which may delete from auth.users; clients never can.
create or replace function public.delete_my_account() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'account:not_signed_in' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
  if not found then
    raise exception 'account:not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.delete_my_account() from public;
-- Supabase grants new functions to anon by default; this one needs a signed-in user.
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
