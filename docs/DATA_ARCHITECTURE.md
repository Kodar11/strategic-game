# Data architecture

The app has three layers. Content and learner progress live in Supabase PostgreSQL. Behaviour lives in TypeScript. The device keeps only its own preferences and a queue of writes not yet saved.

| Layer | Where | What |
|---|---|---|
| **Content** | Supabase, `content_*` tables (`supabase/migrations/20261027120000_content_catalog.sql`) | Modules and lessons (titles, order, metadata), curriculum lesson material, labs (prompts, sliders, payoff tables, reveal cards), all 66 scenarios (setup, rules, formal spec, visuals, prediction, options, verdicts, feedback, explanations, takeaways, comparison settings), practice challenges and concept reviews, assessments and their items, skills, goals, and the metadata of the original lessons' predictions. |
| **Engine** | TypeScript | Game rules (`src/game/`), scenario state machines (`src/features/scenarios/engines/`), lab calculations (`LAB_ENGINES` in `src/features/lessons/curriculum/labs.ts`), solvers (`predict.solve`, `src/features/assessments/solvers.ts`), scoring, the learning-record and profile rules, and the five original lessons (`src/features/lessons/<lesson>/`), whose copy is bound to narrated audio. |
| **Learner progress** | Supabase, `learner_profiles`, `lesson_progress`, `scenario_runs`, `scenario_completions`, `challenge_drafts`, `assessment_runs`, `learning_attempts` (`…_learner_progress.sql`) | Completed lessons, a lesson's in-progress step, scenario runs (prediction, inputs, seed), finished scenarios, challenge drafts, assessment answers and scores, every learning attempt, the goal. |
| **Device** | AsyncStorage | Settings (`strategic-game/settings`: narration, motion, haptics). These are device preferences. Also the Supabase session (anonymous user token) and the sync outbox (`strategic-game/outbox`: writes not yet acknowledged). |

The learning profile is never stored. It is computed on the device from the learning record, with the same rules as before (`src/features/learning/profile.ts`).

## Content: data plus registered engines

PostgreSQL can't run TypeScript, and the app never stores code in the database. Each piece of content that needs behaviour is paired with an engine registered in the app:

- **Scenarios.** A content row joins the engine with the same `id` and `version` (`SCENARIO_ENGINES`). The engine supplies `play` (init, prompt, apply, result, log) and, for calculable predictions, `solve`. When a scenario shows a payoff matrix or game tree, the engine declares the one it plays (`visualGame` / `visualTree`). The catalog refuses content that shows a different one, so the rules on screen are always the rules applied.
- **Parameter labs.** The content holds the prompt and sliders. `LAB_ENGINES[lesson]` holds the calculation and the slider ids it reads, which must match the content's sliders.
- **Assessment items.** These are pure content. Solvers in `ASSESSMENT_SOLVERS` (`<assessment>/<item>`) back the calculable claims, and tests and `content:validate` check each solver against the option the content marks `match`.
- **Lessons.** Each lesson id must be in `LESSON_IDS` and have a component in `LESSON_COMPONENTS`. Seventeen lessons share the curriculum runner, which renders the curriculum spec and lab from the database. The five original lessons (`ORIGINAL_LESSON_IDS`) are hand-built components: their step-by-step dialogue is computed from lesson state and is word-for-word the text of the bundled narration clips (`src/features/audio/`). Their copy therefore stays in code; their metadata and prediction metadata are content.

`src/content/build.ts` turns the published content document into the catalog. Either every check passes or nothing is loaded. The checks are:

- the document schema, which is strict, so unknown fields are errors
- every lesson has an implementation, and every curriculum lesson has its spec and lab
- scenario engines exist with matching versions and matching visuals
- lab calculations exist and match their sliders
- references resolve and ids are unique
- each lesson has exactly one scenario in each slot A, B and C
- the grading rules hold: calculable items have a match, uncertain challenges have none, each transfer question has exactly one strong answer

**What changes without an app release:** any text (titles, setup, rules wording, options, feedback, explanations, takeaways, curriculum material, challenges, assessment items), lesson order and module grouping, publishing or unpublishing (`status`), new practice challenges and assessment items, new reveal, matrix or tree labs, comparison settings (`explore`), and new option ids on prediction questions.

**What needs a release:** a new game mechanic, any change to a scenario's rules (bump `version` in the content *and* in its engine), a new lesson id, new lab calculations, and changes to the original five lessons' wording or narration.

**Versions.** `version` (scenarios, challenges, assessments) is semantic. It is recorded with every run and attempt, so change it only when meaning changes. Runs saved under another version are dropped on load, as before. `revision` counts edits and drives the seed policy below.

## Loading and saving

Everything goes through three database functions, so each read is one consistent snapshot and each write is one transaction:

- `get_published_content()` returns the whole published catalog in the content-document shape (`src/content/schema.ts`). It runs as SECURITY INVOKER, so RLS applies, and it leaves out rows whose parent is unpublished.
- `get_my_progress()` returns the learner's progress in the shape the store has always persisted. It goes through the store's existing sanitizers (`sanitizeProgress`), so loading rules are unchanged.
- `apply_progress_changes(changes)` applies one batch of changes atomically.

**Start-up (`src/data/session.ts`)** is online-first. It fetches the content and the anonymous session in parallel, installs the catalog, sends any writes left in the outbox, loads progress, then renders the app. On failure it shows a "Couldn't load the lessons" screen with **Try again**. There is no built-in content to fall back to. Static web export pre-renders every route from the engine registries; the pages fill in once the data loads.

**Writes (`src/data/changes.ts`, `outbox.ts`):**

- The store stays synchronous, so screens behave exactly as before.
- Each store update is diffed: new attempts, new completions, replaced in-progress records, and resets. The diff is queued.
- The outbox sends batches in order, one request at a time, merging whatever is waiting into one transaction.
- Every write is idempotent. Attempts and completions are insert-if-absent, keyed by their existing ids (`<item>@<lockedAt>`, lesson id, scenario id). In-progress state is replaced whole. A retry therefore never duplicates anything.
- Transient failures retry with backoff (1 s doubling to 30 s).
- A batch the database refuses outright is dropped and reported, so it can't block later writes.
- The queue is saved to the device and sent first on the next launch, for the same user only.
- Settings shows whether everything is saved.

**Conflicts.** One anonymous user is one install, so there is one writer.

- Attempts and completions only grow; the first record for an id wins, as in the app.
- In-progress state (lesson step, scenario run, draft, assessment run) is replaced by the latest write, deliberately, because it belongs to one device.
- The database never lets an assessment's first score change, never updates a learning record, and keeps completion order.

## Security

- The app uses only `EXPO_PUBLIC_SUPABASE_URL` and the publishable key `EXPO_PUBLIC_SUPABASE_KEY`. Both are public by design. `src/data/supabase.ts` refuses a secret or service-role key.
- **Content:** RLS lets `anon` and `authenticated` select published rows only, including options and items whose parent is published. They have no insert, update or delete grants. Only the database owner (SQL editor, service role, CLI) can change content.
- **Progress:** RLS gives every table owner-only policies (`user_id = auth.uid()`). `learning_attempts` and `scenario_completions` have no UPDATE grant at all. Signed-out (`anon`) callers can't touch progress.
- `content_admin.*` (import and validation) lives in a schema the Data API doesn't expose, and only the owner can execute it.
- These rules are tested against the real migrations in `supabase/__tests__/database.test.ts`.

## Identity: anonymous sign-in

Each install calls `signInAnonymously()` once. The session is kept in AsyncStorage and refreshed by supabase-js. This is a real Supabase Auth user (`auth.users.is_anonymous = true`). It has no name or email, and the app shows no login.

Limits:

- **Clearing app data, reinstalling or a new device starts a new anonymous user.** The old progress stays in the database but is unreachable from the app.
- The same learner on web and phone means two users.
- Anonymous users count toward Supabase's monthly active users. Supabase recommends CAPTCHA or rate limits against abuse of anonymous sign-ups.

**Later: account linking.** Supabase can link an email or OAuth identity to the anonymous user (`linkIdentity` / `updateUser`). The user id stays the same, so all rows are kept with no migration. Merging two existing users (two devices) would need a server-side merge that renumbers attempts by `lockedAt`. That isn't built.

## Seeding, editing and versioning content

- `supabase/seed/content.json` is the repository's snapshot of the content. A new database is seeded from it, tests run against it, and `scripts/curriculum-doc.ts` reads it. The app never reads it.
- `supabase/seed.sql` is generated from it (`npm run content:seed-sql`). It calls `content_admin.import_content`, which per top-level row:
  - inserts the row if it is missing
  - updates it, replacing its options or items, if the seed's `revision` is higher
  - otherwise leaves it alone

  Re-running is always safe, and it never overwrites an edit made in the database.
- **Editing in the database:** change the row, and raise `revision` too. Run `npm run content:validate` (the live content checked against this app's engines), then `npm run content:pull` to bring the edit back into the repository snapshot.
- **Shipping a change from the repository:** edit `content.json`, raise that row's `revision`, run `npm run content:seed-sql`, and run `supabase/seed.sql`.
- `content_admin.validate_content()` checks the structural rules in SQL, and `content_admin.content_counts()` gives row counts.

## Adding Daily Challenge later (not built)

The foundation is in place for a later Daily Challenge:

- Challenges are already pure content with versions (`content_challenges` plus options).
- Scenarios can be played by id outside lessons (`/scenario/[id]`).
- Attempts have stable ids and append-only storage.
- Progress writes go through one transactional function.

A daily schedule would be a new content table pointing at a challenge or scenario per date. Server-side grading would join the existing option verdicts.
