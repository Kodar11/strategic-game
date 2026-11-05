-- Daily Challenge: the SQL Editor workflow, statement by statement. Run any statement on its own (select it, then
-- Run). Every statement here is executed against the real migrations by supabase/__tests__/sql-editor.test.ts, so the
-- names and columns are the real ones. Walkthrough: docs/SQL_EDITOR_OPERATIONS.md.
--
-- Days are calendar days in Asia/Kolkata (public.competition_settings.daily_timezone). A challenge becomes visible at
-- 00:00 India time on its date. Example dates below are in the future; change them to the day you want.

-- ── 1. Write and check a manual challenge (nothing is saved) ──────────────────
-- `problems` lists everything wrong with the document; `shown` is what players see before answering (no key).
select content_admin.preview_daily_challenge($doc$
{
  "id": "bakery-price-war",
  "date": "2030-03-15",
  "version": 1,
  "status": "draft",
  "title": "The bakery price war",
  "intro": "Two bakeries on one street sell identical croissants for ₹60. Customers always buy from the cheaper one; at equal prices they split evenly. Each croissant costs ₹20 to make.",
  "prompt": "Bakery A cuts its price to ₹55. What is Bakery B's best reply if it wants the most profit this week?",
  "instructions": "Pick one answer, then say how sure you are.",
  "interaction": "choice",
  "config": {
    "options": [
      { "id": "hold", "label": "Hold at ₹60 — its loyal customers will stay" },
      { "id": "match", "label": "Match at ₹55 — split the street again" },
      { "id": "undercut", "label": "Go to ₹54 — take every customer" }
    ],
    "rules": ["Customers buy from the cheaper bakery.", "At equal prices the customers split evenly.", "Each croissant costs ₹20 to make."]
  },
  "askConfidence": true,
  "difficulty": 2,
  "format": "decision",
  "concept": "Bertrand competition",
  "minutes": 2,
  "skill": "anticipating",
  "basis": "calculable",
  "lesson": "market-competition",
  "key": {
    "evaluation": {
      "options": {
        "hold": { "verdict": "misconception", "feedback": "At ₹60 Bakery B sells nothing: every customer goes to the cheaper bakery." },
        "match": { "verdict": "defensible", "feedback": "Matching wins back half the street at ₹35 profit each — but one rupee less wins all of it at ₹34 each." },
        "undercut": { "verdict": "match", "feedback": "Right for this week: ₹34 profit on every customer beats ₹35 on half of them. That logic is exactly why the price keeps falling." }
      }
    },
    "modelAnswer": "Undercut to ₹54: all the customers at ₹34 profit each beats half of them at ₹35.",
    "explanation": [
      "With identical products and customers who always buy the cheaper one, a tiny undercut wins the whole market.",
      "Both bakeries reason the same way, so prices keep falling towards cost — the Bertrand result: two sellers can be enough for fierce competition."
    ],
    "takeaway": "When customers only compare price, matching isn't safe — the rival can always win everything with one rupee less."
  }
}
$doc$::jsonb);

-- ── 2. Schedule it as a draft (hidden from players) ──────────────────────────
-- The same document with "status": "draft". Several drafts may share a date. Re-running reports `unchanged`.
select * from content_admin.publish_daily_challenge($doc$
{
  "id": "bakery-price-war", "date": "2030-03-15", "version": 1, "status": "draft",
  "title": "The bakery price war",
  "intro": "Two bakeries on one street sell identical croissants for ₹60. Customers always buy from the cheaper one; at equal prices they split evenly. Each croissant costs ₹20 to make.",
  "prompt": "Bakery A cuts its price to ₹55. What is Bakery B's best reply if it wants the most profit this week?",
  "instructions": "Pick one answer, then say how sure you are.",
  "interaction": "choice",
  "config": {
    "options": [
      { "id": "hold", "label": "Hold at ₹60 — its loyal customers will stay" },
      { "id": "match", "label": "Match at ₹55 — split the street again" },
      { "id": "undercut", "label": "Go to ₹54 — take every customer" }
    ],
    "rules": ["Customers buy from the cheaper bakery.", "At equal prices the customers split evenly.", "Each croissant costs ₹20 to make."]
  },
  "askConfidence": true, "difficulty": 2, "format": "decision", "concept": "Bertrand competition", "minutes": 2,
  "skill": "anticipating", "basis": "calculable", "lesson": "market-competition",
  "key": {
    "evaluation": { "options": {
      "hold": { "verdict": "misconception", "feedback": "At ₹60 Bakery B sells nothing: every customer goes to the cheaper bakery." },
      "match": { "verdict": "defensible", "feedback": "Matching wins back half the street at ₹35 profit each — but one rupee less wins all of it at ₹34 each." },
      "undercut": { "verdict": "match", "feedback": "Right for this week: ₹34 profit on every customer beats ₹35 on half of them. That logic is exactly why the price keeps falling." }
    } },
    "modelAnswer": "Undercut to ₹54: all the customers at ₹34 profit each beats half of them at ₹35.",
    "explanation": ["With identical products and customers who always buy the cheaper one, a tiny undercut wins the whole market.", "Both bakeries reason the same way, so prices keep falling towards cost — the Bertrand result: two sellers can be enough for fierce competition."],
    "takeaway": "When customers only compare price, matching isn't safe — the rival can always win everything with one rupee less."
  }
}
$doc$::jsonb);

-- ── 3. Publish the scheduled draft ───────────────────────────────────────────
-- Validated again, then published (as the next version). A manual challenge replaces an automatic pick for the same
-- date if nobody has answered that yet; it never replaces another manual one. It goes live at 00:00 India time.
select * from content_admin.publish_scheduled_challenge('bakery-price-war');

-- To change a challenge later: copy its document, edit it, raise "version", publish it again.
select content_admin.daily_doc_of('bakery-price-war');

-- ── 4. Preview what is stored, with its key and lifecycle ────────────────────
select content_admin.preview_daily_challenge(to_jsonb('bakery-price-war'::text));

-- ── 5. Unpublish (back to draft) — only while nobody has answered it ──────────
select content_admin.unpublish_daily_challenge('bakery-price-war');

-- ── 6. The schedule: upcoming, live and recent challenges ────────────────────
-- lifecycle: draft · scheduled (published, date ahead) · live (today) · archived (a past day).
select challenge_date, id, title, lifecycle, source, source_scenario_id, format, difficulty, attempts
from content_admin.daily_schedule
where challenge_date >= public.daily_challenge_today() - 7
order by challenge_date, lifecycle;

-- ── 7. Scenario usage: which lesson scenarios have been used, and which are cooling down ─
select scenario_id, lesson_id, title, format, difficulty, uses, automatic_uses, last_used, cooling_down, enabled
from content_admin.daily_scenario_report
order by last_used desc nulls last, scenario_id;

-- What the automatic selection would pick for a date (first row), and why.
select * from content_admin.daily_candidates(public.daily_challenge_today() + 1) limit 5;

-- Keep a scenario out of automatic selection (and bring it back).
update public.daily_scenario_pool set enabled = false, exclusion_reason = 'Needs a clearer standalone intro' where scenario_id = 'l4.c.focal-meeting';
update public.daily_scenario_pool set enabled = true, exclusion_reason = null where scenario_id = 'l4.c.focal-meeting';

-- Change the cooldown (days before a scenario can be picked again automatically).
update public.competition_settings set daily_cooldown_days = 30;

-- ── 8. Participation and the leaderboard of a day ────────────────────────────
-- Ranking: score, then calibration, then who answered first (identical → shared rank). Nicknames only in the app;
-- here, as the owner, you also see user ids.
select s.rank, coalesce(p.nickname, 'Anonymous player') as nickname, s.score, s.calibration, s.evaluation, s.submitted_at, s.field
from content_admin.daily_standings((select id from public.daily_challenges where challenge_date = public.daily_challenge_today() and status = 'published')) s
left join public.player_profiles p on p.user_id = s.user_id
order by s.rank nulls last, s.submitted_at;

select challenge_date, count(*) as players, round(avg(score), 1) as average_score
from public.daily_challenge_attempts group by challenge_date order by challenge_date desc limit 14;

-- ── 9. Health checks (expect no rows) ────────────────────────────────────────
select * from content_admin.validate_daily_challenges();
select * from content_admin.validate_scenario_pool();

-- ── 10. A missed activation: make today's challenge exist now ────────────────
-- Safe at any time: if today already has a published challenge, it is returned unchanged.
select content_admin.ensure_daily_challenge(public.daily_challenge_today());
select * from content_admin.scheduler_health;
