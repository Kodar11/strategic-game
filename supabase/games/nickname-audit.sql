-- One-time, READ-ONLY audit of existing nicknames against the current rules.
--
-- Nicknames saved before 20261104120100_nickname_rules.sql were never checked for impersonation or offensive words,
-- and set_nickname only re-checks a name when its owner changes it. Run this in the Supabase SQL Editor (it changes
-- nothing) and review the result by hand. There is no automatic rename: a flagged name is renamed only through a
-- reviewed statement (example at the end), because renaming changes what other players see on public boards.

select p.user_id,
       p.nickname,
       game_engine.nickname_problem(p.nickname) as problem,  -- 'reserved' (impersonation) or 'not_allowed' (offensive)
       p.updated_at
from public.player_profiles p
where game_engine.nickname_problem(p.nickname) is not null
   or p.nickname !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]*$'
   or length(p.nickname) not between 3 and 20
order by problem, p.updated_at;

-- After review, rename one flagged player to a neutral placeholder they can change (example; edit the id and run
-- deliberately — the placeholder must itself pass the rules and be unique):
--
-- update public.player_profiles
--    set nickname = 'Player ' || left(replace(user_id::text, '-', ''), 8),
--        nickname_key = 'player' || left(replace(user_id::text, '-', ''), 8),
--        updated_at = now()
--  where user_id = '00000000-0000-0000-0000-000000000000';
