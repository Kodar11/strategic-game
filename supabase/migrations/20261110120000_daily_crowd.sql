-- The Crowd: the Daily format whose right answer depends on what everyone else picks (⅔ of the average, the lowest
-- number nobody else chose, the option the fewest picked…).
--
-- The questions ship with the app (src/daily-mix/crowd.ts) and the app picks the day's question from the date, so
-- the server stores only answers: one per player per day, a whole number 0–100 (a number, or an option's index).
-- The result is computed in the app from the distribution this returns, so a new kind of question needs no migration.
--
-- Fairness: today's distribution is never published, only how many have answered — otherwise the last players to
-- answer could read the crowd. The full distribution opens once the day is over (daily_challenge_today(), India time
-- by default). Nicknames and user ids are never returned.

create table public.crowd_answers (
  day date not null,
  question_id text not null check (char_length(question_id) between 1 and 64),
  user_id uuid not null references auth.users (id) on delete cascade,
  value int not null check (value between 0 and 100),
  created_at timestamptz not null default now(),
  primary key (day, user_id)
);

create index crowd_answers_question on public.crowd_answers (day, question_id);

-- Read and written only through the functions below.
alter table public.crowd_answers enable row level security;
revoke all on public.crowd_answers from anon, authenticated;

-- Today's answer: { "questionId": "...", "value": 0–100 }. The first answer of the day stands; a second returns it.
create or replace function public.submit_crowd_answer(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  today date := public.daily_challenge_today();
  qid text := request ->> 'questionId';
  v int;
  existing record;
begin
  if qid is null or char_length(qid) not between 1 and 64 then
    raise exception 'crowd:invalid_answer' using errcode = '22023';
  end if;
  if jsonb_typeof(request -> 'value') <> 'number' or (request ->> 'value')::numeric <> trunc((request ->> 'value')::numeric) then
    raise exception 'crowd:invalid_answer' using errcode = '22023';
  end if;
  v := (request ->> 'value')::int;
  if v not between 0 and 100 then
    raise exception 'crowd:invalid_answer' using errcode = '22023';
  end if;

  insert into public.crowd_answers (day, question_id, user_id, value) values (today, qid, uid, v)
  on conflict (day, user_id) do nothing;

  select a.question_id, a.value into existing from public.crowd_answers a where a.day = today and a.user_id = uid;
  return jsonb_build_object(
    'status', case when existing.question_id = qid and existing.value = v then 'recorded' else 'existing' end,
    'day', today, 'questionId', existing.question_id, 'value', existing.value);
end;
$$;

-- { "day": "YYYY-MM-DD", "questionId": "..." } → the caller's answer, how many answered and, once the day is over, the
-- distribution as [[value, count], …].
create or replace function public.get_crowd_result(request jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := game_engine.require_user();
  today date := public.daily_challenge_today();
  d date;
  qid text := request ->> 'questionId';
  mine int;
  n int;
  dist jsonb;
begin
  begin
    d := (request ->> 'day')::date;
  exception when others then
    raise exception 'crowd:invalid_day' using errcode = '22023';
  end;
  if d is null or d > today or qid is null then
    raise exception 'crowd:invalid_day' using errcode = '22023';
  end if;

  select a.value into mine from public.crowd_answers a where a.day = d and a.user_id = uid and a.question_id = qid;
  select count(*)::int into n from public.crowd_answers a where a.day = d and a.question_id = qid;
  if d = today then
    return jsonb_build_object('day', d, 'open', true, 'answered', n, 'mine', mine);
  end if;

  select coalesce(jsonb_agg(jsonb_build_array(value, c) order by value), '[]'::jsonb) into dist
  from (select a.value, count(*)::int as c from public.crowd_answers a where a.day = d and a.question_id = qid group by a.value) s;
  return jsonb_build_object('day', d, 'open', false, 'answered', n, 'mine', mine, 'counts', dist);
end;
$$;

revoke all on function public.submit_crowd_answer(jsonb) from public, anon;
revoke all on function public.get_crowd_result(jsonb) from public, anon;
grant execute on function public.submit_crowd_answer(jsonb) to authenticated;
grant execute on function public.get_crowd_result(jsonb) to authenticated;
