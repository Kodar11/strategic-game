# Daily Strategic Challenge

One short strategic decision a day (1–3 minutes), the same for everyone, found on the Learn tab and through a
calendar. Three stages: **the situation** (what decision am I facing?) → **your answer** → **the result and why**
(what happened, the concept, and the takeaway). One official, ranked answer per day; unlimited practice that is never
recorded; a daily leaderboard; every past challenge kept for review.

Operating it from the SQL Editor: [SQL_EDITOR_OPERATIONS.md](SQL_EDITOR_OPERATIONS.md).

## Content: manual first, else a lesson scenario (v2)

For each date: a **manual** challenge published for it wins; otherwise the day's challenge is an **automatic** pick
from the 66 lesson scenarios (`public.daily_scenario_pool`), adapted into a standalone `choice` challenge — the
scenario's setup as the intro, its rules and payoff table / game tree / table as context, its prediction question,
its options under opaque letters in a per-date shuffled order, and its verdicts, feedback, model answer, explanation
and takeaway as the private key. The lesson scenario itself is never modified, and completing it in its lesson
doesn't remove it from the pool. The pool records each scenario's format (prediction · decision · reasoning ·
outcome analysis) and difficulty (by the reasoning it takes), assigned by reading every scenario.

Selection (`content_admin.daily_candidates`): not used in the last 30 days (`daily_cooldown_days`; if all are,
the least used is reused — a day is never left empty) → no two Hard days in a row → fewest appearances → its lesson
featured longest ago → a different format from yesterday → least recently used → a per-date hash. Usage is recorded in
`public.daily_scenario_usage` (date, scenario, version, lesson, automatic/manual) — separate from anyone's attempts.

Activation (`content_admin.ensure_daily_challenge(date)`): idempotent; a per-date advisory lock, a re-check and the
one-published-per-date unique index make concurrent calls produce one challenge. It runs from the scheduler (today
and tomorrow, every 5 minutes) and on every Daily read, so a missed job is caught up by the first visitor.

**Answer secrecy for adapted scenarios.** The key is private as for any challenge, and the challenge's source
(lesson, scenario, concept) is withheld until the day is past or the player has answered. The lesson scenarios'
options and verdicts are, however, public lesson content that ships with the app (the lessons grade them on the
device), so a player who already knows the lesson — or looks it up — knows the answer. That is inherent in reusing
lesson content; manual challenges have no such exposure.

## Scoring and the leaderboard (v2)

- **Score** (scoring version 1, stored with every attempt): match 100 · defensible 60 · depends 40 · misconception 0.
  A challenge without a single right answer (basis `uncertain`) is not scored: players are listed as taking part,
  never ranked above or below each other.
- **Calibration** (tie-break): the confidence rating as a probability (1 → 20 %, 2 → 40 %, 3 → 60 %, 4 → 80 %,
  5 → 95 %) against the outcome: 100 × (1 − (p − score/100)²). It rewards knowing how sure to be. No speed bonus, no
  timer.
- **Ranking** (`get_daily_leaderboard`): score, then calibration, then the earlier answer; identical → shared rank.
  Top 50, the caller's row, the field size; nicknames only. Built from official attempts only.
- **History** (`get_daily_history`): past challenges 20 at a time, with the concept, field size and the caller's
  result and rank.

| Piece | Where |
|---|---|
| Schema, RLS, grading, publishing | `supabase/migrations/20261027130100_daily_challenges.sql` |
| Example publishing statements (tested) | `supabase/daily/examples.sql` |
| Interaction registry (config, drafts, answers) | `src/features/daily/interactions.ts` |
| Content validation | `src/features/daily/content.ts` |
| Calendar day states, summary | `src/features/daily/day-state.ts`, `dates.ts` |
| Profile evidence rule | `src/features/daily/evidence.ts` |
| Data access | `src/data/daily.ts` (repository), `src/features/daily/store.ts` (in-memory cache), `src/data/daily-session.ts` |
| Screens | `app/daily.tsx` (calendar), `app/daily/play.tsx?date=YYYY-MM-DD` (one day) |
| Renderers | `src/features/daily/DailyInteraction.tsx`, `Calendar.tsx` |
| Tests | `supabase/__tests__/daily.test.ts`, `src/features/daily/__tests__/daily.test.ts` |

## Rules

**Timezone: Asia/Kolkata** (`public.competition_settings.daily_timezone`, v2; v1 used UTC). A day is that
calendar date in the database (`daily_challenge_today()`), in row level security, in submission and in the app. The
app takes `today` from the server, so a wrong device clock can't open a day early. The day turns over at 00:00 India
time (18:30 UTC).

**Release.** Clients can read a challenge only when `status = 'published'` **and** its date is today or earlier. Future and draft challenges are never sent to the app. A day with nothing published shows "No challenge published", which is different from a missed day.

**Official attempt.** One per learner per day (primary key `(user_id, challenge_date)`) and per challenge (unique). Only today's challenge can be answered officially. `submit_daily_challenge` is idempotent: a retry, a double tap or a second device gets the attempt already recorded (`status: "existing"`) and nothing changes. The graded result (verdict, feedback, model answer, explanation, takeaway, title) is snapshotted in the attempt, so it stays the same after any later content edit.

**Past days.** A past day without an attempt is *missed*. It opens for review ("Just show me the answer") and practice. Practice is graded by the server but never recorded, so it can never overwrite or create an official result. A completed day opens on its saved, read-only result, and you can practise it again.

**Secrecy.** Answer keys live in `daily_challenge_keys`, which has RLS on and no grant for `anon` or `authenticated`. Only SECURITY DEFINER functions read it:
- `submit_daily_challenge` grades today's official answer.
- `check_daily_practice` and `get_daily_reveal` work only for past days, or after the caller's official answer. So practice can't be used to find today's key.

`scenario` challenges are graded by the scenario's prediction options. Those are already public content and the scenario logic ships in the app, so **such challenges have no secret answer**, and the app doesn't treat them as if they did.

**Editing and versions.** `version` is the content version recorded with each attempt. Publishing a change to an existing id needs a higher version, otherwise it is refused. Every published state of a challenge and its key is appended to `daily_challenge_history`. Once anyone has answered a challenge, triggers stop these changes even when made directly in the SQL editor (v2 — v1 allowed text-only fixes and unpublishing):
- moving its date, or unpublishing it
- **any** change — text included — without a higher version **and** a `correction` note (the controlled correction process)

A challenge with attempts can't be deleted (FK `restrict`).

**Isolation from lessons.** Daily data lives in its own tables and its own in-memory store. It never marks lessons complete or touches scenario runs, drafts or the learning record. A progress reset in Settings leaves official daily attempts alone.

## Publishing a challenge

1. Open **Supabase → SQL Editor**.
2. Paste one statement from the template below and fill it in.
3. Run it. The result row says `inserted`, `updated` or `unchanged`. Errors list every problem in plain words, and nothing is half-published.
4. The challenge appears in the app on its date. No app release is needed.

```sql
select * from content_admin.publish_daily_challenge($challenge$
{
  "id": "lowercase-hyphenated-id",
  "date": "2026-11-02",
  "version": 1,
  "status": "published",
  "title": "Short title (≤120)",
  "intro": "The situation in two or three sentences (≤800).",
  "prompt": "The decision being asked (≤1500).",
  "instructions": "Optional one-line instruction (≤400).",
  "interaction": "choice",
  "config": { "options": [ { "id": "a", "label": "…" }, { "id": "b", "label": "…" } ] },
  "askConfidence": true,
  "difficulty": 2,
  "skill": "incentives",
  "basis": "calculable",
  "lesson": "market-competition",
  "key": {
    "evaluation": { "options": { "a": { "verdict": "match", "feedback": "…" }, "b": { "verdict": "misconception", "feedback": "…" } } },
    "modelAnswer": "One line (≤300).",
    "explanation": ["Paragraph 1", "Paragraph 2"],
    "takeaway": "One practical sentence (≤600)."
  }
}
$challenge$::jsonb);
```

Three complete, runnable examples, one per interaction type, are in `supabase/daily/examples.sql`. The test suite runs them against the real migrations.

| Field | Notes |
|---|---|
| `id` | Stable, never reused. Lowercase words joined by hyphens. |
| `date` | `YYYY-MM-DD`, an India-time day. One published challenge per date. |
| `version` | Starts at 1. Raise it to publish any change to an existing id. |
| `status` | `published` (default) or `draft`. A draft is scheduled but hidden, and several drafts may share a date. |
| `askConfidence` | Default `true`. When true, the official answer needs a 1–5 confidence rating. |
| `difficulty` | 1 Easy · 2 Medium (default) · 3 Hard. |
| `skill` | `anticipating`, `incentives`, `coordination` or `uncertainty`. Optional, but the answer only counts in the Thinking Profile when it is set. |
| `basis` | `calculable` (the answer follows from what is shown) or `uncertain`. A calculable challenge needs at least one `match`. An uncertain one can have none: use `reasonable`. |
| `lesson` | Optional lesson id for "More on this". |
| `verdict` | `match`, `defensible`, `misconception`, `depends` or `reasonable`. |

**Same date already taken?** A manual challenge replaces an *automatic* pick for its date if nobody has answered it
yet (the pick goes back to draft and its usage is marked superseded). A second manual challenge for a date is refused
— nothing manual is replaced silently. To swap a manual one nobody has answered:

```sql
select content_admin.unpublish_daily_challenge('old-id');
```

v2 adds optional fields — `format`, `concept`, `minutes`, `sourceScenario`, `correction`, and for `choice`
`config.rules` and `config.visual` — documented in [SQL_EDITOR_OPERATIONS.md](SQL_EDITOR_OPERATIONS.md).

**Health check:** `select * from content_admin.validate_daily_challenges();` should return no rows. A row means a published scenario challenge points at a scenario version that isn't published any more, or a challenge has lost its key.

## Interaction types

Each type is registered in `src/features/daily/interactions.ts` and in the database's checks. The database stores configuration only, never code. There is no `eval` and no code is loaded from Supabase.

| Type | Config | Answer sent | Graded by | Reuses |
|---|---|---|---|---|
| `choice` | `options: [{id, label}]` (2–6) | `{option}` | private verdict + feedback per option | `PredictionPrompt`, `ConfidenceScale` |
| `number` | `min, max, step, initial, unit?, minLabel?, maxLabel?` (≤1000 steps) | `{value}` (snapped to the grid) | private bands `[{min, max, verdict, feedback}]`; every slider value must be covered | `Slider`, `ConfidenceScale` |
| `scenario` | `scenario, version` (must match the app's engine) | `{option, seed, inputs}` | the scenario's public prediction options | the scenario's own engine (`play`), `Decision`, payoff visuals, result stats |

For every type the app:
- checks the config with a strict schema
- holds the learner's input as a local draft
- builds the answer only once the draft is complete (`complete`)
- shows the server's result

A challenge the app can't run gets a clear, retryable message on that day. That covers an unknown type, an invalid config, or a scenario this app version doesn't have or plays at another version. It is never replaced with other content.

**Limitations.** A new kind of interaction, such as allocations or multi-round negotiations with custom rules, needs an app release: add an engine and a renderer here, and the type in the database checks. Custom simulations need their rules in TypeScript first, as a registered scenario engine. Content edits within an existing type don't need a release.

## Thinking Profile

A daily answer counts as profile evidence only when all of these hold (`dailyEvidence`):
- it is a `choice` or `number` challenge, so it is graded on the server and not a replay of a lesson scenario already in the learning record
- it has a `skill`
- it was rated for confidence

It then counts as one first attempt for:
- the skill areas
- the confidence comparison
- the insights
- the trend

As everywhere in the profile, only `calculable` answers are judged. Daily answers never count toward lesson completion, first tries/practice, transfer or the next-step challenge counts.
