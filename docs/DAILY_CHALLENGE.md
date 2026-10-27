# Daily Strategic Challenge

One short strategic decision a day, found through a calendar. Three stages: **the situation** (what decision am I facing?) → **your answer** → **the result and why** (what happened, and the takeaway).

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

**Timezone: UTC.** A day is a UTC calendar date in the database (`daily_challenge_today()`), in row level security, in submission and in the app. The app takes `today` from the server, so a wrong device clock can't open a day early. For learners in India the day turns over at 05:30 local time.

**Release.** Clients can read a challenge only when `status = 'published'` **and** its date is today or earlier. Future and draft challenges are never sent to the app. A day with nothing published shows "No challenge published", which is different from a missed day.

**Official attempt.** One per learner per day (primary key `(user_id, challenge_date)`) and per challenge (unique). Only today's challenge can be answered officially. `submit_daily_challenge` is idempotent: a retry, a double tap or a second device gets the attempt already recorded (`status: "existing"`) and nothing changes. The graded result (verdict, feedback, model answer, explanation, takeaway, title) is snapshotted in the attempt, so it stays the same after any later content edit.

**Past days.** A past day without an attempt is *missed*. It opens for review ("Just show me the answer") and practice. Practice is graded by the server but never recorded, so it can never overwrite or create an official result. A completed day opens on its saved, read-only result, and you can practise it again.

**Secrecy.** Answer keys live in `daily_challenge_keys`, which has RLS on and no grant for `anon` or `authenticated`. Only SECURITY DEFINER functions read it:
- `submit_daily_challenge` grades today's official answer.
- `check_daily_practice` and `get_daily_reveal` work only for past days, or after the caller's official answer. So practice can't be used to find today's key.

`scenario` challenges are graded by the scenario's prediction options. Those are already public content and the scenario logic ships in the app, so **such challenges have no secret answer**, and the app doesn't treat them as if they did.

**Editing and versions.** `version` is the content version recorded with each attempt. Publishing a change to an existing id needs a higher version, otherwise it is refused. Every published state of a challenge and its key is appended to `daily_challenge_history`. Once anyone has answered a challenge, triggers stop these changes even when made directly in the SQL editor:
- moving its date
- changing how it is answered or graded (interaction, config, confidence, skill, basis, key) without a version bump

Text-only fixes such as typos in the intro are allowed. A challenge with attempts can't be deleted (FK `restrict`). Unpublish it instead.

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
| `date` | `YYYY-MM-DD`, a UTC day. One published challenge per date. |
| `version` | Starts at 1. Raise it to publish any change to an existing id. |
| `status` | `published` (default) or `draft`. A draft is scheduled but hidden, and several drafts may share a date. |
| `askConfidence` | Default `true`. When true, the official answer needs a 1–5 confidence rating. |
| `difficulty` | 1 Warm-up · 2 Standard (default) · 3 Tricky. |
| `skill` | `anticipating`, `incentives`, `coordination` or `uncertainty`. Optional, but the answer only counts in the Thinking Profile when it is set. |
| `basis` | `calculable` (the answer follows from what is shown) or `uncertain`. A calculable challenge needs at least one `match`. An uncertain one can have none: use `reasonable`. |
| `lesson` | Optional lesson id for "More on this". |
| `verdict` | `match`, `defensible`, `misconception`, `depends` or `reasonable`. |

**Same date already taken?** Publishing a different id on a date that already has a published challenge is refused. Nothing is replaced silently. To swap it, unpublish the old one, then publish the new one:

```sql
update public.daily_challenges set status = 'draft' where id = 'old-id';
```

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
