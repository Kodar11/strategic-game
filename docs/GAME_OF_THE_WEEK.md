# Game of the Week

A weekly competition on one of all **23** Tactiqo games. Everyone plays the same game, opponent, difficulty and
rules; each player gets **three ranked matches** and their **best** counts; the week closes, a champion is recorded
permanently, and the next week begins. Practice stays unlimited and unranked, and nothing here touches lessons,
practice records or the learning record.

Operating it from the SQL Editor: [SQL_EDITOR_OPERATIONS.md](SQL_EDITOR_OPERATIONS.md). The classic games themselves:
[GAMES.md](GAMES.md); the Arena games: [ARENA.md](ARENA.md).

| Piece | Where |
|---|---|
| Schema, rotation, scheduling, scoring, finalization, champions | `supabase/migrations/20261105120100_game_of_the_week_v2.sql` (on top of `…_games.sql`) |
| The scheduler | `supabase/migrations/20261105120200_scheduler.sql`, registered by `supabase/scheduler.sql` |
| Arena matches on the server | `supabase/functions/arena-match/index.ts` → `src/competition/arena-handler.ts`, `arena-match.ts` |
| What the device may see of an Arena match | `src/competition/arena-views.ts` |
| Competition scoring per game | `src/competition/scoring.ts` (Arena), `game_engine.totals` (classics) |
| Names, opponents, levels for all 23 | `src/competition/catalog.ts` |
| App data | `src/data/games.ts`, `src/data/arena-competition.ts` |
| Screens | Games tab card, `app/games/play.tsx` (classic ranked), `app/games/ranked.tsx` (Arena ranked), `app/leaderboard.tsx`, `app/competitions/index.tsx`, `app/competitions/[id].tsx` |
| Tests | `supabase/__tests__/weekly.test.ts`, `games.test.ts`, `sql-editor.test.ts`; `src/competition/__tests__/` |

## Server authority for all 23 games

**The five classics** (`rps`, `two-thirds`, `split-steal`, `ultimatum`, `stag-hunt`) are played one round per call in
SQL (`game_engine.*`, exact ports of the TypeScript engines, checked move for move).

**The 18 Strategy Arena games** run in the `arena-match` Edge Function using the *same* TypeScript engines the device
uses for practice (`src/arena`) — no second implementation of any rule:

1. `start_match` (SQL) creates the ranked match — reserving the attempt — with the week's configuration and a private
   random seed.
2. Each action goes to `arena-match` with the step it answers. The function verifies the caller with Supabase Auth,
   loads the match through `public.arena_match_load` (service role only), **replays** the stored action log through
   the engine, validates the new action (`engine.validate`), applies it (the opponent moves on the server), and
   stores it through `public.arena_match_commit` (service role only), which enforces ownership, the week's deadline,
   and that this is exactly the next step (a retry of an applied step is answered as a duplicate; anything else is
   stale). When the match ends, the function computes the result, debrief and official score and commits them.
3. The device receives a **redacted view** while the match is in play: the seed is never sent, and each game's private
   information is masked (the Mole, the saboteur and its cards, the live wires and the teammate's unshared clues, the
   opponent's dice, the deck and unseen cards, the Codebreaker key of unrevealed words). Whatever the board needs for
   this turn that the engine derives from hidden data is computed on the server and *served* to the board's prompt
   helper (`servedOf` in `src/arena/core.ts`). The full state — seed included — is sent only once the match is over.

The device never submits a score, a result or a game state: only actions, which the engine must accept.

| # | Game | Engine | Competition score | Tie-break | Standard week configuration |
|---|---|---|---|---|---|
| 1 | Rock, Paper, Scissors | SQL | Match points (3 win · 1 tie · 0 loss, 12 rounds) | — | Mind Reader, Hard |
| 2 | Two-Thirds Guess | SQL | Points over 5 rounds (win + closeness) | — | Deep, Hard |
| 3 | Split or Steal | SQL | Coins over 10 rounds | — | Strategist, Hard |
| 4 | The Ultimatum | SQL | Coins kept over 6 rounds | — | Negotiator, Hard |
| 5 | Stag Hunt | SQL | Points over 8 rounds | — | Conditional Partner, Hard |
| 6 | The Cooperation Game | Arena | Points | — | Chameleon, Normal, Classic |
| 7 | The Ultimatum Game | Arena | Tokens kept | — | Deal Maker, Normal |
| 8 | The Auction House | Arena | Profit | — | Banker, Normal |
| 9 | The Market Rivals | Arena | Profit over the season | — | Opportunist, Normal |
| 10 | The Hidden Signal | Arena | Tokens | — | Investor, Normal |
| 11 | The Mole | Arena | Case points (10 for unmasking the Mole) | Evidence: how likely the accused was the Mole on the evidence gathered (%) | Deceiver, Normal |
| 12 | The Commons | Arena | Fish + dividend; 0 if the lake collapsed | Fish left in the lake | Conditional Contributor, Normal |
| 13 | The Coalition | Arena | Points from passed bills | — | Power Broker, Normal |
| 14 | The Inspector | Arena | Points | — | Calculated Inspector, Normal |
| 15 | The Traveler’s Dilemma | Arena | Credits | — | Adaptive Reasoner, Normal |
| 16 | The Saboteur | Arena | Missions + correct accusation | — | Deceptive Saboteur, Normal |
| 17 | Bluff | Arena | Points | — | Observant Challenger, Normal |
| 18 | The Defusal | Arena | 10 + fuse left if defused, else 0 | — | Methodical Analyst, Normal |
| 19 | The Power Play | Arena | Result: win 2 · draw 1 · loss 0 | Coins | Strategic Manipulator, Normal |
| 20 | The Last Stand | Arena | Team points (districts, water, line held) | — | The Planner, Normal |
| 21 | Liar’s Dice | Arena | Dice left | Fewest opponent dice left | Probability Calculator, Normal |
| 22 | The Codebreaker | Arena | Team points | — | Associative Thinker, Normal |
| 23 | The Gambit | Arena | Result: win 2 · draw 1 · loss 0 | Pieces home minus the opponent’s | Adaptive Tactician, Normal |

Why these measures: the leaderboard only compares players of the *same* game, opponent and rules, so each game keeps
its own meaning — nothing is multiplied to look comparable. Where a game's own outcome dominates its points (Power
Play and Gambit decide by influence or pieces home, not coins; a collapsed Commons loses everyone the fishery) the
result comes first. Tie-breaks exist only where they measure something real; otherwise the earlier achievement
decides. Players identical after every tie-break **share** the rank and the title. Scoring version 2 is stored with
each competition, match, result and champion; past weeks are never recalculated.

**Verification** (`supabase/__tests__/weekly.test.ts`): for each of the 18 Arena games, three ranked matches are played
through the handler against the real migrations by a player that decides from the redacted view only; the tests
check the seed and private fields are never sent mid-match, illegal and out-of-order actions are refused, a retried
action is a duplicate, the stored score equals the score recomputed from the action log, the best of three ranks, a
fourth attempt is refused, and the leaderboard has nicknames only. The five classics are played the same way through
SQL. `src/competition/__tests__/arena-competition.test.ts` plays every Arena game at every level and variant over
many seeds from redacted views.

## Lifecycle

| State | When | What happens |
|---|---|---|
| scheduled | before Monday 00:00 IST | visible as next week; can still be replaced from the SQL Editor |
| active | Monday 00:00 → next Monday 00:00 IST | ranked matches can start; configuration locked |
| finalizing | after the end, until end + grace (15 min) | no new ranked match; one already started may finish |
| completed | finalized | results, points and champion records written once, immutable |
| cancelled | emergency only | no champion, no points; matches kept |

Activation and closing follow the stored timestamps on every request — nothing waits for a job. The scheduler
(`content_admin.run_scheduled_jobs()`, every 5 minutes) only does writes: it keeps the next weeks scheduled (manual
choices first, else rotation) and finalizes weeks past their deadline. Every app read also finalizes anything
overdue and makes sure the current week exists, so a missed job is harmless. All of it is idempotent (row locks,
advisory locks, unique week ids, insert-only results).

**Attempts.** Starting a ranked match uses an attempt — the server reserves it when it creates the match, under an
advisory lock, so a double tap or a second device can't create two. An open match is always resumed, never
duplicated; it can be resumed on any device until the deadline. A match still open at the deadline expires and
doesn't count (the attempt stays used — communicated on the confirmation before starting). Practice never uses an
attempt.

**Champions.** At finalization each player's best eligible match becomes their result (with their nickname at that
moment); the winner(s) get a row in `public.weekly_champions` with the competition number, game, configuration,
scores, how the title was decided (`score`, `secondary`, `earliest`, `unopposed` or `shared`), the runner-up's score
and the timestamps. These records are insert-only and never depend on a live query.

## Deploying

1. Apply the migrations (`supabase/README.md`).
2. Deploy the function from the repository root (it imports the shared engines from `src/`):
   ```bash
   npx supabase functions deploy arena-match
   ```
   It needs no secrets of its own: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the Edge runtime.
3. Check it answers: from the app, start a ranked match of any Arena game in a test project, or call it with a signed-in
   user's access token: `POST /functions/v1/arena-match` `{"op": "get", "matchId": "<a match id>"}`.
4. Switch the Arena games on: `update public.competition_settings set arena_server_enabled = true;`
5. Register the scheduler: run `supabase/scheduler.sql`, then verify (SQL_EDITOR_OPERATIONS.md, Part 3).

Not yet verified against a hosted project: the function's bundling of `../../../src/…` imports by the Supabase CLI.
If a CLI version refuses to bundle files outside `supabase/functions`, copy `src/arena`, `src/games/core.ts` and
`src/competition` into `supabase/functions/_shared/` and adjust the one import in `index.ts`.

## Security summary

- No client grant on any competition table; reads and writes go through SECURITY DEFINER functions. The two Arena
  persistence functions are executable by `service_role` only; the app holds only the publishable key.
- The client never sends a score, winner, result or state, and never receives a seed or hidden information before
  the match ends.
- Attempt limits, deadlines, ordering and ownership are enforced in the database in the same transaction as the
  write.
- Scheduling, cancelling and correcting are `content_admin` functions (owner only), audited.
- Remaining exposure, as before: several Google accounts per person mean more attempts per person.
