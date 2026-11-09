# Product decisions log

Ideas we have already weighed, so nobody proposes them again without new evidence.

**For agents and contributors:** read this file before suggesting any new feature, mode, game or product change.

- If an idea is listed as **Rejected**, don't suggest it again. The exception is when the "Revisit if" condition has clearly come true; then say so and quote the entry.
- If it's **Postponed**, suggest it only when its trigger has been met.
- When the user rejects, postpones or reshapes an idea, add a row here in the same turn.
- Keep each row to one line. Dates are absolute (YYYY-MM-DD).

Status words: **Rejected** (not doing it) · **Postponed** (maybe later, after a trigger) · **Reshaped** (done, but differently from how it was first pitched) · **Open** (waiting for the user to decide).

---

## Rejected

| Idea | Why not | Date | Revisit if |
|---|---|---|---|
| Share cards / image cards of results | The audience shares little; not worth the build | 2026-11-08 | Analytics show players already share text results often |
| "Call your shot" (predict your own next move) | Too much for players; adds friction to every match | 2026-11-08 | — |
| Real-time multiplayer, chat, friends lists | Moderation and infrastructure cost, unproven demand. Party mode and The Crowd cover the social need | 2026-11-05 | Strong retention plus repeated requests for online play |
| LLM-generated feedback, content or opponents | Cost and accuracy risk; deterministic, tested reflections are a strength | 2026-11-05 | — |
| "Brain score", IQ-style or cognitive-benefit claims | Legal risk (FTC vs Lumosity) and off-thesis. Profiles describe habits, never ability | 2026-11-05 | — |
| Email/password or OTP sign-in | Google plus guest mode covers it; one less attack surface | 2026-11-05 | A real market without Google accounts |
| Ads | The monetization model is a freemium subscription with no ads | 2026-11-07 | — |
| A separate "Read Rush" mode | Folded into Daily as a third format instead (see Reshaped) | 2026-11-09 | — |
| The Gauntlet as its own top-level mode | Lives inside the Tournament instead (see Reshaped) | 2026-11-09 | — |
| Copying scripts, characters or scenes from films, games or Nicky Case's work | Copyright. Stories and modes are original works that are only inspired by those sources | 2026-10-30 | — |
| Mixkit stock music | Its licence excludes video games; Story music is composed in code | 2026-10-30 | — |
| "Ghost" opponents built from real players' recorded play | Too much for what it adds; the bots and The Crowd are enough | 2026-11-09 | — |
| Improving the current one-screen Host onboarding step by step | The user wants it thrown out and rebuilt from scratch as the best possible first session, not patched | 2026-11-09 | — |

## Postponed

| Idea | Why not now | Date | Trigger to revisit |
|---|---|---|---|
| "Seen on screen" movie moments in lessons (Dark Knight ferries, A Beautiful Mind, Dr. Strangelove…) | Few players would engage with it yet | 2026-11-09 | Lesson completion data shows the abstract lessons losing players |
| Paywall / billing (RevenueCat, ₹199/mo, ₹999/yr) | Decided but not built: wait for retention evidence | 2026-11-07 | D7 retention around 15% or more (see memory: monetization decision) |
| Merging the Weekly screens (Past weeks into the leaderboard; Hall of Fame vs Champions overlap) | Small cleanup; the area already feels like one place | 2026-11-09 | Next time the Games tab or leaderboards are touched |
| Illustrated rival portraits | Code-drawn cast portraits are good enough for launch | 2026-11-08 | Budget for an illustrator |
| Hindi localization | Wire i18n only when the content pipeline is stable | 2026-11-05 | Content stops changing weekly |
| Decision journal (log a real-life decision, revisit it later) | Unknown value; needs user interviews first | 2026-11-05 | Interviews show demand |
| Monthly decision report | Belongs with Pro; needs retention cohorts first | 2026-11-05 | Billing is live |
| Seeded lesson replays (re-rolled payoffs) | Needs a solver per lab; medium maintenance | 2026-11-05 | Lesson replay events show demand |
| Spaced review through Daily | Daily formats were just reshaped; check usage first | 2026-11-05 | Daily usage data |
| Sign in with Apple and an iOS launch | Android first | 2026-11-05 | Android launch is stable |
| Crash reporting SDK (Sentry) | Privacy policy must change first | 2026-11-04 | Policy updated |
| Stag Hunt variant / Split or Steal horizon change | Classic games have SQL ports for Game of the Week; rule changes ripple into the server | 2026-11-04 | A server rules-version bump is planned anyway |
| Read Rush leaderboard | Questions are generated on the device, so scores can't be verified by the server | 2026-11-09 | Server-side question generation |
| Tournament Season 2 | Mid-match resume, balance and rival mastery come first | 2026-11-09 | Those three are done |
| New classic games (Colonel Blotto, Dollar Auction) | Library size isn't the bottleneck; later, likely with Season 2 | 2026-11-09 | Season 2 planning |
| Strategy Puzzles ("find the best move" from engine positions) | Not a separate section: fold it into the Daily rotation (Challenge / Crowd / Read Rush) as a format when built | 2026-11-09 | Next time Daily formats are worked on |

## Reshaped (done, but not as first pitched)

| Pitched as | What we did instead | Why | Date |
|---|---|---|---|
| The Crowd as its own daily game | One Daily slot that rotates: a published Challenge wins; otherwise Wed/Sun are Crowd days and other days are Read Rush | Avoids running out of questions and avoids monotony; the day is never empty | 2026-11-09 |
| A full "How you play" profile | A small card on the existing Strategic Thinking Profile: one sentence and chips, with the evidence folded | The profile was already good; the default view stays glanceable | 2026-11-09 |
| The Gauntlet as a separate mode | Inside the Tournament, opening when the season is cleared | Fewer modes; it gives finished players a reason to return | 2026-11-09 |
| Merging Practice and Checkpoints into lessons | Left as is: lesson completion already offers that lesson's practice and checkpoint | Already merged in effect | 2026-11-09 |
| Locking most games for newcomers | 8 starter games shown first; the full library opens after a Tournament win or with "Show all". Nothing is locked | No dead ends from lessons, links or the Tournament | 2026-11-09 |
| Two Ultimatum games in the library | One listed (The Ultimatum Game); the quick classic is reached from its setup screen and still used by Game of the Week and the Tournament | Less clutter, no broken records or server rules | 2026-11-09 |
| Anonymous accounts | Google sign-in plus guest mode | Real accounts for Daily, the weekly game and progress sync | 2026-11-04 |
| Rebalance Market (~1 % scripted win rate) and Power Play (~7 %) | Rules kept: the low numbers come from scripted players who ignore the board. A player who reads each round wins Market 86–95 % at every level; a card-counter wins Power Play 41–47 %. A difficulty test (src/arena/__tests__/difficulty.test.ts) now guards every game | The real problems were elsewhere | 2026-11-09 |
| Mole: weaker evidence on Hard | Hard already had it (since 2026-11-04); Easy now gets clearer evidence (camera +8 points, nervous 85 %), so the levels go 90 / 79 / 62 % for exact reasoning | Easy and Normal were identical | 2026-11-09 |
| Difficulty inversions found by the new test | Ultimatum Game: Hard Investor/Banker offers capped at Normal's. Coalition: Easy bots invite you when they can. Saboteur: no loyal slips on Easy, Easy Planner/Investigator jam like Normal | For the same player, Hard was easier than Normal (or Normal than Easy) | 2026-11-09 |
| Persona mastery (audit idea) | Three stars per rival per game (beat, beat on Hard, name it in a mystery match), each opening one dossier page; device-only, nothing locked, no paywall | Simple replay goals without new games | 2026-11-09 |
| Mid-game resume | Every device match is saved after each move (seed + moves, replayed on return) for 24 h, one per game and context; Continue/Discard on the game screen; no prompt | The OS closing the app lost the match | 2026-11-09 |

## Open (waiting for the user)

| Question | Options | Raised |
|---|---|---|
| Analytics consent default | On with a disclosed opt-out (current code) or off until asked | 2026-11-05 |
| PostHog data on account deletion | Keep pseudonymous data, or delete it through an Edge Function and queue (built, not deployed) | 2026-11-05 |
| Lifetime purchase (~₹2,499) | Add or skip | 2026-11-07 |

---

The full Tournament spec, with its 44 decisions, is in the Tournament artifact linked from memory (`tournament-mode-decisions`). Big audits live in `docs/MASTER_PRODUCT_AUDIT_V2.md` (section O lists what to defer).
