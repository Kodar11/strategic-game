# Games, Game of the Week and friend challenges

Five replayable strategic games against bots, a weekly competition on one of them, leaderboards, a Hall of Fame, and
shareable friend challenges. All of it is separate from the lessons, scenarios, practice challenges and the learning
record: nothing here reads or writes lesson progress, and the Thinking Profile shows the game record as its own card.

| Piece | Where |
|---|---|
| Game rules, bots, difficulty (pure TypeScript, no React) | `src/games/` — `core.ts` (shared contract, randomness), `rps.ts`, `two-thirds.ts`, `split-steal.ts`, `ultimatum.ts`, `stag-hunt.ts`, `registry.ts` |
| Player-facing copy (rules, personalities, takeaways) | `src/games/catalog.ts` |
| Competition rules as displayed (week window, points, nicknames) | `src/games/competition.ts` |
| Share and invite text | `src/games/share-text.ts` |
| Server: schema, RLS, SQL engines, functions | `supabase/migrations/20261027140000_games.sql` |
| Scheduling upcoming weeks | `supabase/games/schedule.sql` |
| Data access | `src/data/games.ts` (repository), `src/features/games/store.ts` (in-memory cache), `src/data/games-session.ts` |
| Match driver (practice on device / server-run) | `src/features/games/useMatch.ts` |
| Game boards and shared UI | `src/features/games/ui/` |
| Screens | `app/(tabs)/games.tsx`, `app/games/[gameId].tsx`, `app/games/play.tsx`, `app/leaderboard.tsx`, `app/challenge/[token].tsx`, `app/nickname.tsx` |
| Tests | `src/games/__tests__/` (engines, competition rules), `supabase/__tests__/games.test.ts` (SQL parity, competition integrity, RLS, repository) |

## Navigation

Bottom tabs (`app/(tabs)/_layout.tsx`, Expo Router's JS tabs): **Learn** (the existing home: lessons, practice,
daily challenge), **Games**, **Profile** (the existing Thinking Profile). URLs are unchanged (`/`, `/profile`); the
group adds `/games`. Lessons, scenarios, games, leaderboards and challenge links are pushed on the root stack above
the tabs, so they're full-screen and Android Back returns to the tab you came from. `unstable_settings.initialRouteName
= '(tabs)'` gives a deep-linked screen (a challenge link) a tab screen to go back to.

## The five games

Every game is a fixed-length match against one bot personality at one difficulty. Rules and payoffs are the same at
every difficulty; difficulty only changes how a bot reasons (memory, prediction quality, thresholds, noise).

| Game | Match | Scoring | Bots |
|---|---|---|---|
| Rock, Paper, Scissors | 12 rounds | win 3, tie 1, loss 0 (both sides) | Repeater, Counter, Mind Reader, Randomizer |
| Two-Thirds Guess | 5 rounds, player + 8 simulated bots | per round: 10 sole win / 5 shared win + closeness max(0, 10 − ⌊distance⌋); max 100 | Crowd Followers, Shallow, Deep, Chaos (5 of the chosen type + 1 of each other) |
| Split or Steal | 10 rounds | 5/5 · 8/0 · 0/8 · 1/1 | Cooperator, Opportunist, Retaliator, Strategist |
| The Ultimatum | 6 rounds, roles alternate (player proposes in 1, 3, 5) | split 10 coins; offers 1–9 whole coins; rejection = 0/0 | Maximizer, Fair Player, Hardliner, Negotiator |
| Stag Hunt | 8 rounds | stag+stag 5/5 · stag alone 0 vs hare 3 · hare+hare 3/3 | Cautious, Optimist, Opportunistic, Conditional Partner |

Each bot's exact policy per difficulty is documented on its function (`rpsBotMove`, `botPick`, `splitBotMove`,
`botOffer`/`botAccepts`, `stagBotMove`). Design rules every engine follows:

- **No current-turn leak.** A bot's action is computed from the revealed rounds only, before the player's move is
  looked at. Tests resolve every legal move from the same history and require the same bot action. The only
  exception is by the rules: an Ultimatum responder sees the offer.
- **Seeded, counter-based randomness.** `draw(seed, round, k)` (mulberry32 of a mixed counter) is the k-th random
  number of a round, so the same match replays exactly and the server can reproduce it.
- **Memory.** Bots remember the current match only. A rematch is a fresh encounter.
- **Explicit configuration.** Per-difficulty numbers live in config objects (`RPS_CONFIG`, `ULT_CONFIG`) or are named
  in each policy's comment.
- **No guaranteed outcomes.** Tests check no RPS difficulty wins every match, and that the best Split or Steal reply
  depends on the opponent.

## Rock, Paper, Scissors: reading the opponent

Pure logic in `src/games/rps-insight.ts`; the bot policies in `rps.ts` are unchanged (rules version 1, SQL parity).

- **Mystery opponent by default.** Practice from the game screen starts with `opponent=mystery`: the device picks one of
  the four personalities and hides it (name, badges, score bar, accessibility labels) until round 12 is played. "Choose
  a specific opponent" expands the four personalities for deliberate practice. Difficulty is chosen separately.
- **Repeat this throw.** Under the throw buttons: throws the last move once per remaining round after a short reveal
  pause (`useRepeatThrow`, `RepeatThrow`), through the match's own `play`. "Change" or any throw cancels it.
- **Read your opponent.** In a mystery match, after `RPS_INSIGHT.minRounds` rounds, one prediction that locks on submit.
  If none was made by round 12, the match pauses before the reveal (`awaitingRead`): predict now, or see the results.
  A right read earns `RPS_INSIGHT.points` Insight Points; a wrong one costs nothing. Match points never change. The
  options describe each personality at the match's difficulty (`RPS_READS`) and must stay true to `rpsBotMove`.
- **Reveal.** The result screen shows match performance (score, round-by-round) apart from insight: the read, Insight
  Points, the revealed personality and difficulty, evidence counted from the recorded throws (`ruleFit`, via
  `rpsRuleMoves`, the noise-free rule) and one takeaway.
- **Opponent history** on the game screen is derived from `get_my_games` (practice + server matches,
  `src/features/games/history.ts`). Practice logs carry `opponent` (mystery | chosen), `prediction` and
  `insightPoints` (migration `20261028120000_rps_opponent_reads.sql`); they're null for other games and older rows.

## Where a match runs

| Mode | Runs | Seed | Counts for |
|---|---|---|---|
| Practice | on the device (`usePracticeMatch`) | random, on the device | nothing; logged to the player's private history (`record_practice_game`, unverified) |
| Game of the Week | on the server, one round per call (`start_match`, `play_match_round`) | server only | the weekly leaderboard |
| Friend challenge | on the server, one round per call | server only, shared by everyone on the challenge | the challenge comparison |

Server matches use `game_engine.*` in SQL: exact ports of the TypeScript engines. `supabase/__tests__/games.test.ts`
plays every game × bot × difficulty round by round and requires the SQL to produce the same round JSON, prompts,
totals and outcomes, and `draw` to match bit for bit. **Changing a rule or a bot policy means changing both, and
bumping `rulesVersion` in the engine and `rules_version` in `game_definitions`.** The app refuses to render a server
match or challenge whose rule version it doesn't have ("Update needed"), and the server refuses to start a challenge
created under older rules.

## Game of the Week

- **Configuration** is a row in `game_competitions`: id, game, opponent and difficulty (the same for everyone),
  explicit `starts_at`/`ends_at`, `timezone` (`Asia/Kolkata`), `scoring_version`, `max_attempts`, `winner_bonus`,
  status, `finalized_at`. The app's featured game comes from `get_games_overview()`; nothing in the UI hard-codes it.
- **Week boundaries:** Monday 00:00 to the next Monday 00:00, India time (UTC+05:30, no DST), stored as UTC
  timestamps. Every eligibility check compares the database clock with those timestamps.
- **Scheduling:** `content_admin.schedule_competition(week_start, game, opponent, difficulty, attempts, bonus)` (owner
  only; refuses non-Mondays). `supabase/games/schedule.sql` schedules this week and the next seven, rotating the
  games, and is safe to re-run. Overlapping weeks are refused, and once anyone has played a week its game, opponent,
  dates and rules can't change.
- **Finalization:** `content_admin.finalize_competitions(as_of)` finalizes every scheduled week that ended at or
  before `as_of`, once: it locks the row, re-checks `finalized_at`, expires unfinished matches, and inserts results
  insert-only. It runs lazily on every overview, leaderboard, Hall of Fame and player-record read
  (`finalize_due_competitions()` is also callable), so a missed or late job is harmless. For finalization on the dot,
  schedule it with pg_cron (Dashboard → Integrations → Cron):
  ```sql
  select cron.schedule('finalize-game-of-the-week', '*/15 * * * *', $$select public.finalize_due_competitions()$$);
  ```

### Scoring policy v1

- **Eligible result:** a completed competition match, completed before the end. A round at or after the end is
  refused; an unfinished match at the end is marked expired and doesn't count.
- **Attempts:** 3 a week (configurable 1–10). Starting a match uses one, even if abandoned. An open match is resumed,
  never duplicated (advisory lock + partial unique index), so two taps can't use two attempts.
- **Weekly score:** the best completed match score (player points as each game defines them).
- **Ranking and ties:** score descending, then earliest achievement. Identical score *and* time share a rank (SQL
  `rank()`); every player sharing first place is a winner.
- **Global points per finalized week:** 10 for taking part + ⌊40 × (n − rank + 1) / n⌋ for placing in a field of n
  + the winner bonus (25 by default, at most 50). A winner earns at most 75 + bonus headroom; three mid-table weeks
  outscore one win. Practice never counts.
- **Immutability:** `competition_results` refuses updates and deletes; a finalized week's matches and configuration
  refuse changes. The one exception is deleting an account, whose cascade removes that player's rows.

## Leaderboards and Hall of Fame

- **This week** (`get_leaderboard({scope:'weekly'})`): live standings from completed matches while the week is open;
  the immutable `competition_results` once finalized. Time left, phase, field size.
- **Global** (`{scope:'global'}`): the sum of `competition_results.points` per player, with weekly wins and weeks
  played. Ties on points and wins share a rank.
- **Hall of Fame** (`get_hall_of_fame()`): every finalized week with its winner(s), winning score, runner-up score
  and field size — derived from `competition_results`, never maintained by hand.
- Top 50 per board, plus the caller's own row when they rank outside it.

## Identity

`player_profiles` holds an optional public nickname: 3–20 characters, ASCII letters, digits, single spaces and
`_ . -`, starting with a letter or digit, unique after removing case, spaces and `_ . -`, and not a reserved name
(admin, support, strategic, anonymous, …). Players without one appear as "Anonymous player". Boards and challenges
return nicknames only — never user ids, emails or match seeds; tests assert this. Renames show everywhere at once
(names are joined at read time). The ASCII-only rule is a deliberate anti-impersonation choice (no look-alike
characters); it also means names in other scripts aren't possible yet.

## Friend challenges and links

1. *Invite a friend* (game screen or result screen) calls `create_challenge`: a row with a random 20-hex token, game,
   opponent, difficulty, rule version, a private seed and a 30-day expiry (at most 20 a day per player).
2. The app shares a link through the native share sheet (`Share` on iOS/Android; Web Share API, then clipboard, then
   the text itself on web).
3. The link opens `app/challenge/[token].tsx`: game, who sent it (nickname), the score to beat once the sender has
   actually finished, and Play. Everyone gets one server-run match on the same draws; opening the link again resumes
   or shows your match. Malformed or unknown links show "Challenge not found"; expired ones offer practice instead.
4. Comparisons appear only once both results exist — the app never says a friend played when they haven't.

**Link format.** With `EXPO_PUBLIC_WEB_URL` set to where the web build is hosted, links are
`https://<host>/challenge/<token>`: anyone can open them, and the web build plays the challenge. Tokens can't be
pre-rendered, so the static host must serve `challenge/[token].html` for `/challenge/*` (a rewrite rule; game pages
are pre-rendered per game). Without it, links use
the app scheme `tactiqo://challenge/<token>` (older `strategicgame://` links still open the app), which opens the installed app and does nothing for someone
without it. Opening the installed app from an https link (Android App Links / iOS Universal Links) needs the domain
verified in `app.json` and an `assetlinks.json` / `apple-app-site-association` on the host — not set up yet.

## Security summary

- All game tables have RLS on and no client grants; every read and write is a SECURITY DEFINER function with
  explicit checks (`search_path = ''`). `game_engine` and `content_admin` aren't reachable by clients.
- The client never submits a score: it submits moves; the server resolves rounds and computes totals.
- The client never sees a competition or challenge seed, so it can't preview a bot's random choices.
- Duplicate or replayed round submissions return the match unchanged (`duplicate: true`); out-of-order ones are refused.
- Signed-out callers can read the overview, boards, Hall of Fame and a challenge; they can't play, name themselves,
  create challenges or log practice.
- Rate limits: competitive attempts per week, challenges per day (20), practice logs per day (300). Practice logs are
  explicitly unverified and never ranked.
- Remaining exposure: anonymous sign-up makes multiple identities cheap (more attempts per real person). Supabase's
  sign-up rate limits or CAPTCHA reduce this; linking accounts would remove it.
