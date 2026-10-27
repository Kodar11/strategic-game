-- Game of the Week: schedule the current week and the next seven, rotating through the five games. Run it in the
-- SQL editor (as the project owner). Safe to re-run: an existing, unplayed week is updated to the same settings, and
-- a week that already has matches is left exactly as it is (the guard refuses changes, so it's skipped here).
--
-- Each week runs Monday 00:00 to the next Monday 00:00 in Asia/Kolkata. To feature a particular game in a particular
-- week, call content_admin.schedule_competition directly, e.g.
--   select * from content_admin.schedule_competition('2026-11-02', 'split-steal', 'retaliator', 'hard');
-- Arguments: week start (a Monday), game, opponent, difficulty (default 'hard'), attempts (default 3), winner bonus
-- (default 25, at most 50).

do $$
declare
  -- This week's Monday, in India time.
  first_monday date := date_trunc('week', (now() at time zone 'Asia/Kolkata'))::date;
  lineup text[][] := array[
    array['split-steal', 'strategist', 'hard'],
    array['rps', 'mind-reader', 'hard'],
    array['two-thirds', 'deep', 'hard'],
    array['ultimatum', 'negotiator', 'hard'],
    array['stag-hunt', 'conditional', 'hard']
  ];
  week date;
  pick integer;
begin
  for i in 0..7 loop
    week := first_monday + i * 7;
    -- Rotate by ISO week number so re-running later keeps each week's game.
    pick := (extract(week from week)::integer % 5) + 1;
    if exists (select 1 from public.game_matches m join public.game_competitions c on c.id = m.competition_id
               where c.id = 'week-' || to_char(week, 'IYYY') || '-w' || to_char(week, 'IW')) then
      continue;
    end if;
    perform content_admin.schedule_competition(week, lineup[pick][1], lineup[pick][2], lineup[pick][3]);
  end loop;
end;
$$;

select id, game_id, bot, difficulty, starts_at, ends_at, timezone, finalized_at
from public.game_competitions order by starts_at desc limit 10;
