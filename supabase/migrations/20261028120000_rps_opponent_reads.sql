-- Rock, Paper, Scissors reads in the practice log.
--
-- Practice can now be against a mystery opponent (hidden until the match ends) or a chosen one, and in a mystery match
-- the player may lock in one read of who it is, earning Insight Points when right (src/games/rps-insight.ts). This
-- adds three nullable columns to game_practice_results — older rows and other games leave them null — and teaches
-- record_practice_game and get_my_games about them. Insight Points are the player's own, unverified like the rest
-- of practice, and never ranked. No new table; no existing data changes.

alter table public.game_practice_results
  add column opponent text check (opponent in ('mystery', 'chosen')),
  add column prediction text,
  add column insight_points integer check (insight_points between 0 and 100),
  -- A read is only made against a mystery opponent, and only names one of the game's personalities.
  add constraint game_practice_results_prediction_check
    check (prediction is null or (opponent = 'mystery' and prediction = any (game_engine.bots(game_id))));

-- As before, plus optional `opponent` ('mystery' | 'chosen'), `prediction` (a personality) and `insightPoints`.
create or replace function public.record_practice_game(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  g public.game_definitions;
begin
  select * into g from public.game_definitions where id = request ->> 'game';
  if g.id is null or not coalesce(request ->> 'bot' = any (g.bots), false) or coalesce(request ->> 'difficulty', '') not in ('easy', 'medium', 'hard')
     or coalesce(request ->> 'outcome', '') not in ('win', 'loss', 'draw')
     or jsonb_typeof(request -> 'playerScore') is distinct from 'number' or jsonb_typeof(request -> 'botScore') is distinct from 'number'
     or coalesce(request ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(request ->> 'opponent', 'mystery') not in ('mystery', 'chosen')
     or (request ->> 'prediction' is not null and (request ->> 'opponent' is distinct from 'mystery' or not request ->> 'prediction' = any (g.bots)))
     or (request ->> 'insightPoints' is not null and (jsonb_typeof(request -> 'insightPoints') <> 'number' or (request ->> 'insightPoints')::numeric not between 0 and 100)) then
    raise exception 'games:invalid_request' using errcode = 'P0001';
  end if;
  if (select count(*) from public.game_practice_results where user_id = uid and played_at > now() - interval '1 day') >= 300 then
    raise exception 'games:rate_limited' using errcode = 'P0001';
  end if;
  insert into public.game_practice_results (user_id, client_id, game_id, bot, difficulty, rules_version, player_score, bot_score, outcome, opponent, prediction, insight_points)
  values (uid, (request ->> 'id')::uuid, g.id, request ->> 'bot', request ->> 'difficulty', g.rules_version,
          (request ->> 'playerScore')::numeric::integer, (request ->> 'botScore')::numeric::integer, request ->> 'outcome',
          request ->> 'opponent', request ->> 'prediction', (request ->> 'insightPoints')::numeric::integer)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- As before; practice entries also carry `opponent`, `prediction` and `insightPoints` (null when not recorded).
create or replace function public.get_my_games() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  standing jsonb;
begin
  perform content_admin.finalize_competitions(now());
  with totals as (
    select r.user_id, sum(r.points)::integer as points, count(*) filter (where r.is_winner)::integer as wins, count(*)::integer as weeks
    from public.competition_results r group by r.user_id
  ), ranked as (select t.*, (rank() over (order by t.points desc, t.wins desc))::integer as rnk from totals t)
  select jsonb_build_object('rank', rnk, 'points', points, 'wins', wins, 'weeks', weeks, 'players', (select count(*) from totals))
  into standing from ranked where user_id = uid;
  return jsonb_build_object(
    'nickname', game_engine.nickname_of(uid),
    'standing', standing,
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('competitionId', r.competition_id, 'game', c.game_id, 'endsAt', game_engine.ms(c.ends_at),
                         'rank', r.rank, 'field', r.field_size, 'score', r.score, 'points', r.points, 'isWinner', r.is_winner) order by c.ends_at desc)
                       from (select * from public.competition_results where user_id = uid) r join public.game_competitions c on c.id = r.competition_id), '[]'::jsonb),
    'practice', coalesce((select jsonb_agg(jsonb_build_object('game', p.game_id, 'bot', p.bot, 'difficulty', p.difficulty, 'playerScore', p.player_score,
                           'botScore', p.bot_score, 'outcome', p.outcome, 'playedAt', game_engine.ms(p.played_at),
                           'opponent', p.opponent, 'prediction', p.prediction, 'insightPoints', p.insight_points) order by p.played_at desc)
                         from (select * from public.game_practice_results where user_id = uid order by played_at desc limit 30) p), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'game', m.game_id, 'bot', m.bot, 'difficulty', m.difficulty,
                          'playerScore', m.player_score, 'botScore', m.bot_score, 'outcome', game_engine.outcome(m.game_id, m.rounds), 'competitionId', m.competition_id,
                          'completedAt', game_engine.ms(m.completed_at)) order by m.completed_at desc)
                        from (select * from public.game_matches where user_id = uid and status = 'completed' order by completed_at desc limit 30) m), '[]'::jsonb));
end;
$$;
