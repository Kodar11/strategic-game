# Quality milestone — 4 November 2026

Quick wins, game balance, data consistency and trust, implemented against `MASTER_PRODUCT_AUDIT.md` (same day) and
`GAME_UX_IMPLEMENTATION.md`. Simulations are scripted players against the real engines, not people: they find
dominant strategies, they don't prove a game is fun. Win rates are Easy / Normal / Hard, standard length.

## 1. Game balance

| Game | Root cause | Change | Before → after (simulated) |
|---|---|---|---|
| Market Rivals | Conditions were the same every round, so the right price never moved; 10 was it | Shoppers' mood (price sensitivity) drawn per round and shown (Standard 0.25/0.35/0.5, Price War 0.5/0.6/0.8); Normal/Hard bot margins anchored to the round's public equilibrium instead of cost | Fixed 10 (Standard): 95/92/94 → 87/40/36. Fixed 9 (Price War): 100/100/86 → 100/24/16. Reading each round's equilibrium: 95/91/85 |
| Hidden Signal | "Most tokens wins": a believed bluff cost the investor 6, an honest stake earned them 6, so lying won relatively though honesty earned more tokens | A false pitch the investor acts on refunds 1 of the 2-token fee; the win is reaching a benchmark from the public priors (75 % of prior × payoff), draw within 2 | Always pitch: 82/70/71 → 68/57/59. Honest signalling: 28/30/27 → 65/64/64. Bluffing after building trust: 47/47 on N/H |
| Bluff | The Risk Taker bluffed every claim, so calling everything was always right | It bluffs some claims (Easy 60 %, Normal 40 %; Hard 55 % / 15 % by how often you call) | Always call vs Risk Taker: 100/96/96 → 81/50/50. Believing everything vs it: 13/18/15 |
| Last Stand | Easy lit a fire every other round; the teammate held alone | Easy: one ignition every round | Doing nothing: 100 % → 37 % held on Easy; covering the other fire still holds ~100 % |
| The Mole | Difficulty didn't touch the evidence | Hard faces a composed Mole: camera rate −8 pts (never below 56 %), nervous 60 % instead of 75 %; board and debrief show the exact rates | Exact Bayes: 77/77/77 → 77/77/61. Following the crowd: 67/67/52 |
| Coalition | Hard priced deals like Normal | Hard: prices from revealed votes (never re-offers a refused share), avoids a clear points leader, rejects a greedy bill when it has a better majority elsewhere (not in the last two rounds) | Win rates are dominated by seat weights and rotation and moved little (adaptive player ~22–25 % → ~19–21 % on Hard). The change is decision quality, covered by unit tests, not a large win-rate swing |

Classic games (rules are ported to SQL for Game of the Week, so their rules were not changed):

- **Split or Steal, Stag Hunt:** after a practice match, "What if you'd played it differently?" replays the same
  opponent and seed against Always split / Mirror / Always steal (Stag Hunt: stag / mirror / hare). Exact, because bots
  decide from history and counter-based draws. Server matches have no seed on the device, so they get no comparison.
- **Ultimatum (classic):** kept (it's in the Game of the Week rotation and match records name it), retitled
  **Quick Ultimatum**, placed after The Ultimatum Game in the library, and each setup screen links to the other.
- **Not done:** a Stag Hunt variant (three hunters, or changing hare values) and a variable Split or Steal horizon.
  Both change the rules of games the server plays, which needs a matching SQL port and a `rulesVersion` bump; left
  for a separate change.

## 2. Data inventory

| Data | Where | Persistence now | On account deletion |
|---|---|---|---|
| Lesson progress, answers, scenarios, assessments, goal | Supabase via outbox | Server (unchanged) | Server rows deleted (cascade); local cache and outbox cleared |
| Daily Challenge history | Supabase | Server (unchanged) | Deleted |
| Classic practice results | Supabase `game_practice_results` | Server, best effort: two attempts, **not queued offline** (unchanged) | Deleted |
| Game of the Week, friend challenges | Supabase | Server (unchanged) | Deleted |
| Nickname | Supabase `player_profiles` | Server; now validated for impersonation and offensive terms | Deleted (frees the name) |
| **Arena match summaries** | Supabase `arena_matches` (new) | **Server, new matches only**, via an owner-scoped, idempotent upload queue | Deleted (cascade); pending uploads cleared |
| Arena tallies, recent list, reads, setups, coach tips | AsyncStorage `tactiqo/arena-records/v1` | Device | **Now cleared** |
| Stories progress | `tactiqo/stories/v1` | Device | **Now cleared** |
| Story sound levels | `tactiqo/story-audio/v1` | Device | **Now cleared** |
| Rules seen (classic) | `strategic-game/games-seen` | Device | **Now cleared** |
| Motion, haptics, narration | `strategic-game/settings` | Device preference | Kept; intro flag reset |

Historical Arena matches are **not** back-filled: the device store isn't tied to an account (before today, deletion
left it behind, so it can hold a deleted account's history), and it keeps only the last 8 matches per game anyway.

Deletion order: pause progress sync and Arena uploads → server `delete_my_account()` → only on success clear the
outbox, the upload queue and every account-scoped key → sign out → start as a new anonymous player. On failure
nothing local changes and both queues resume. An upload already in flight either lands before the deletion (and
cascades away) or fails on the missing user: it can't recreate data. `src/data/device-data.ts` lists every key; a test
fails if a new storage key isn't listed.

## 3. Settings, legal and support

Checked on https://tactiqo.vercel.app (2026-11-04): footer links exist for `/privacy`, `/terms`, `/contact`,
`/delete-account` and `/about`. Support is email only (the address the site publishes). Settings now has
**About and support**: about text, Report a problem / Send feedback (mailto with version), Support, Privacy Policy,
Terms & Conditions, About Tactiqo, and the version (`expo-constants`; the build number comes from the installed binary
because EAS manages it remotely — on web it shows the version only). The Account card states what is on the server and
what stays on the device, and links the website's deletion page.

### Google Play Data Safety — verification checklist (nothing was submitted)

| Question | What the app does |
|---|---|
| Data collected | App activity (lesson answers, game results incl. Arena summaries), user-generated nickname (optional, public), app interactions needed for progress. No name, email, phone, location, contacts, photos, device IDs or advertising ID |
| Identifiers | A Supabase anonymous user ID and session token (on device and server) |
| Stored on Supabase | Progress, answers, Daily history, nickname, classic practice/competition/challenge results, **Arena match summaries (new)** |
| Stored only on device | Stories progress, detailed Arena tallies, rules seen, story sound levels, preferences, write queues |
| Shared with third parties | None for advertising. Processors: Supabase (database/auth), Vercel (website). Nicknames and scores are visible to other players |
| Purpose | App functionality only |
| Analytics / crash reporting | None in the app |
| Encryption in transit | HTTPS to Supabase |
| Deletion | In app (Settings → Account) and by email per the website |
| Retention | Until the account is deleted; backups not confirmed |

### Mismatches with the published policy (need an owner edit on the website)

1. The Privacy Policy and Terms are marked **drafts, not lawyer-reviewed**, with placeholders (e.g. "[Supabase
   project region]"). Terms name no governing law.
2. The policy and the deletion page don't mention **Arena match summaries** (new server data) or **Stories**; the
   deletion page says device preferences are kept but not that Arena records, story progress and sound levels are
   cleared.
3. The policy says the app has no crash-reporting SDKs — still true; adding error reporting would need a policy change.

## 4. Other fixes

- `textFaint` #64748B → #8494AA: 6.1:1 on bg, 5.7:1 on bgRaised, 4.7:1 on surface (AA). It is 4.0:1 on `surfaceHigh`;
  small `textFaint` text on that surface should move to `textMuted` (not audited one by one).
- Onboarding pillars renamed to the tabs: Learn (lessons + scenarios), Games, Stories.
- Games heading: "opponents", not "bots". Games that can end early show "Turn 3 · up to 12".
- Lesson links for Defusal and Gambit (both → Decisions Under Uncertainty); all 23 games now link a lesson.
- Nicknames: server-side refusal of brand/staff impersonation and a small offensive-terms list with digit folding;
  new refusal `nickname_not_allowed`. Existing nicknames are not re-checked.

## 5. Not done, and why

- **Crash reporting:** deferred. The policy promises no crash-reporting SDKs; a first-party error table or Sentry needs
  a policy update and a decision on where reports go.
- **Migrations are not applied** to the live Supabase project (`20261104120000_arena_match_summaries.sql`,
  `20261104120100_nickname_rules.sql`). Until they are, Arena uploads are refused and dropped, and nickname rules are
  the old ones. Apply with `supabase db push` (or the SQL editor) after review.
- **Native device testing:** not possible here (no Android SDK). Verified with unit/SQL tests and the web preview at
  320 and 360 px only.
- Classic practice results still aren't queued offline (pre-existing).
