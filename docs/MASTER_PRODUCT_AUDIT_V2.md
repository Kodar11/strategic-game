# Tactiqo: Master Audit V2

*Audit date: 5 November 2026. Branch `main` at `12aaf21`, clean working tree. Read-only audit: no source, SQL, schema, configuration, dependency or live data was changed. This report is the only file added (uncommitted). Regenerating typed routes rewrote the git-ignored `.expo/types/router.d.ts`; a web export was built into a temporary folder outside the repository.*

Baseline: [`MASTER_PRODUCT_AUDIT.md`](MASTER_PRODUCT_AUDIT.md) (4 Nov), then [`QUALITY_MILESTONE_2026-11-04.md`](QUALITY_MILESTONE_2026-11-04.md), [`AUTHENTICATION.md`](AUTHENTICATION.md) and [`MILESTONE_DAILY_AND_WEEKLY.md`](MILESTONE_DAILY_AND_WEEKLY.md).

## How to read this report

| Tag | Meaning |
|---|---|
| **[Run]** | Executed in this audit: tests, typecheck, lint, engine simulations, the web build, read-only requests to the live Supabase project and the live website |
| **[Live]** | A read-only observation of the production Supabase project or website |
| **[Code]** | Read and traced in the source, not executed |
| **[Judgement]** | A product or design opinion |
| **UNVERIFIED** | Could not be established here; the report says what access would settle it |

**What was executed:** `npm test`, `npx tsc --noEmit` (after regenerating typed routes), `npx expo lint`, `npx expo export -p web`, seeded balance simulations of 8 Arena games (150 seeds × 4 opponents × 3 levels per strategy), a guest walkthrough of the static web build at 360 px, an overflow sweep of 7 screens at 320 and 430 px, and read-only requests to the live Supabase project (public auth settings, table and function existence, the published catalogue).

**What was not executed, and why:**
- **No native Android or iOS run.** There is no Android SDK, emulator or device on this machine. Nothing in this report proves behaviour on a phone.
- **No Google sign-in.** The web build has no sign-in by design (`src/auth/google.web.ts`). Every authenticated path is assessed from code and the existing tests.
- **No writes to the live project.** I didn't open the Games tab against live Supabase, because `get_games_overview` finalizes competitions as a side effect. No lesson was played to completion against live, and no test account was created.
- **No access to the Supabase dashboard, Play Console, Google Cloud console or EAS.** Settings that live only there are listed in §P as manual checks.

---

## Section A — Executive verdict

**Is Tactiqo ready for public launch? No.** The app in the repository is close: content, engines and the new competitive systems are carefully built and tested. **The production system is not.** The live backend runs the *old* Daily Challenge and Game of the Week. The new versions the app now calls are not deployed. The live privacy policy describes an anonymous-account app that no longer exists. And the app has never run on a phone in any recorded audit.

| Question | Answer |
|---|---|
| Technically stable? | **In code, yes**: 1,348/1,348 tests, lint clean, typecheck clean apart from the known dead TTS function. **On devices, unknown**: there has never been a native run. |
| Trustworthy? | **Not yet.** The public privacy policy and terms contradict the app: they promise no email collection and describe anonymous accounts. Email/password sign-ups are open on the live project. |
| Content complete? | **Yes.** 22 lessons, 66 scenarios, 15 challenges, 7 checkpoints. The live catalogue is byte-identical to the repository seed. No wrong answer key found. |
| Are the 22 lessons and 23 games genuinely complete? | **Lessons yes.** Games: 23 are playable and mechanically sound. The six balance exploits are fixed or mitigated. Coalition and Power Play difficulty still don't scale, and Last Stand Easy/Normal fall to one simple rule. |
| Daily Challenge and GOTW production-ready? | **Code: nearly. Production: no.** The v2 migrations, the scheduler and the `arena-match` Edge Function are **not deployed** **[Live]**. Only **one** Daily Challenge has ever been published live (27 Oct). The v2 screens will error against the live backend. |
| Analytics and crash reporting sufficient? | **Absent.** There are zero analytics events and no crash reporting. |

**Top five risks**

1. **The live backend is a version behind the app.** Shipping the current build would show empty Daily days and error screens on leaderboards, history and ranked Arena matches.
2. **Legal mismatch.** The policy says the app "doesn't ask for your name, email" and creates "an anonymous ID". The app now stores the Google email, name and picture in Supabase Auth. Play's Data Safety form and the policy must change before release.
3. **Never run natively.** This includes Google sign-in through the browser flow, SecureStore sessions, Reanimated, audio and SVG on low-end Android.
4. **Online-only start-up.** Every launch blocks on two serial network calls (the catalogue is 317 KB of JSON). Offline, nothing opens, not even the 18 device-only games.
5. **No observability.** After launch, crashes, failed syncs and drop-off are invisible.

**Launch-readiness score: 52 / 100.** Last audit's equivalent was about 35: identity, legal pages, deletion cleanup, balance and the competitive systems all moved forward.

| Area | Weight | Score | Why |
|---|---:|---:|---|
| Content and learning design | 20 | 17 | Rigorous and complete. Lessons don't lead to games, and replay is deterministic |
| Game library | 15 | 11 | Sound engines; a few shallow or flat-difficulty games |
| Accounts, data, security | 15 | 8 | Good design and tests; email sign-ups open live; no device proof |
| Retention systems (Daily, GOTW) | 15 | 4 | Excellent code, not deployed; live Daily has been empty since 28 Oct |
| Trust, legal, support | 10 | 4 | Surfaces exist; their content is wrong for the current app |
| Reliability, performance, offline | 10 | 4 | Blocking start-up, no offline, never profiled on a device |
| Observability (analytics, crashes) | 10 | 0 | None |
| Release engineering | 5 | 4 | EAS configured; no production build or Play listing verified |

---

## Section B — Progress since the previous audit

**Baseline now [Run]:**

| Check | Result | Change |
|---|---|---|
| Branch / commit | `main` @ `12aaf21`, clean, up to date with origin | Previous: 77 uncommitted files. **Fixed**: all committed |
| `npm test` | **1,348 passed, 0 failed**, 253 suites, 54 s | +167 tests since 4 Nov (1,181) |
| `npx tsc --noEmit` | 4 errors, all in `supabase/functions/text-to-speech/index.ts` | Unchanged baseline; nothing new |
| `npx expo lint` | Clean | Unchanged |
| `npx expo export -p web` | Builds; one 4.9 MB JS bundle; 34 MB export (audio included) | Not measured before |
| Native build | **Not tested** (no SDK) | Unchanged |

**Finding-by-finding:**

| Previous finding | Previous status | Current evidence | Current status |
|---|---|---|---|
| Anonymous-only identity | P0 | Google-only auth with browser PKCE (`src/auth/browser-sign-in.ts`), guest mode, hand-over of guest progress, owner marker. Live: `anonymous_users:false`, `google:true` **[Live]** | **Implemented, not verified** (no device sign-in recorded) |
| Email/OTP sign-up off | (new) | `config.toml` has email sign-up off, but live shows `email:true, disable_signup:false` **[Live]** | **Missing on live** |
| Daily Challenge empty live | P0 | v2 code: auto-pick from 66 scenarios, IST day, scoring, leaderboard. Live: `get_daily_history` → PGRST202, `daily_scenario_pool` → PGRST205; one published challenge, 2026-10-27 **[Live]** | **Implemented, not deployed** |
| GOTW empty live; only 5 games server-capable | P0 | v2 code: 23 games, rotation, 3 attempts, champions, Edge Function. Live: `weekly_champions` and `competition_settings` absent; `functions/v1/arena-match` → 404 **[Live]** | **Implemented, not deployed** |
| Privacy policy / terms missing | P0 | Website `/privacy` and `/terms` exist (200) but are marked **Draft**, have placeholders, describe anonymous accounts, never mention Google, and have no governing law **[Live]** | **Regressed in accuracy**: they now contradict the app |
| About / support / version in app | P1 | Settings → About and support: mailto with version, Support, Privacy, Terms, About, version string **[Run]** | **Verified (web)** |
| Open-source licences | P1 | No licences screen (`grep licen` finds nothing in `app/`, `src/`) | **Still missing** |
| Misleading "kept on this device" copy | P1 | Guest copy: "saved on this device only. Sign in with Google to keep your progress safe" **[Run]** | **Fixed** |
| Deletion leaves device keys | P1 | `clearAccountDeviceData()` clears all 8 account-scoped keys; `src/data/device-data.ts` inventory is enforced by a test; an AsyncStorage key search found no unlisted key **[Code, Run]** | **Fixed (code)**; device-unverified |
| Arena summaries device-only | P1 | `arena_matches` table exists live (anon gets 42501 = present) **[Live]**; upload queue in `src/data/arena-session.ts` | **Implemented, not verified end-to-end** |
| No offline catalogue | P1 | `startAppData()` awaits `fetchCatalog()` every launch; no cache **[Code, Run]** | **Still missing** |
| Low-contrast `textFaint` | P1 | `#8494AA` in `src/theme/tokens.ts` | **Fixed** |
| Onboarding Learn/Play/Explore vs tabs | P1 | Pillars now read Learn / Games / Stories **[Run]** | **Fixed** |
| Power Play "Turn 1 of 12" | P2 | `app/arena/play.tsx:148` shows "Round N · up to 12" for `endsEarly` games | **Fixed** |
| Reflection links (Defusal, Gambit missing) | P2 | 23/23 games link a lesson (`src/reflections`) | **Fixed** |
| Lesson → game links | P2 | No lesson screen links to any game (`grep` over `src/features/lessons`, `app/lesson`, `app/scenario`) | **Still missing** |
| Dead TTS Edge Function, `verify_jwt=false` | P2 | Still in the repo and **deployed live**: a POST returns `@supabase/server` `MISSING_CREDENTIALS` **[Live]** | **Still present** |
| Nickname profanity/impersonation | P2 | `20261104120100_nickname_rules.sql`, tested | **Implemented; live status UNVERIFIED** (I can't call `set_nickname` without writing) |
| Market fixed-price exploit | P1 | Fixed 10: Normal 39%, Hard 31% (was ~90%); Easy still 88% **[Run]** | **Fixed** (Easy is deliberately lenient) |
| Bluff always-call vs Risk Taker | P1 | 81 / 50 / 50 % (was 100 / 96 / 96) **[Run]** | **Fixed** |
| Last Stand passive Easy | P1 | Doing nothing on Easy: 37% (was 100%). But "douse the other hottest fire" wins 100% Easy and 86% Normal **[Run]** | **Fixed as reported**; new weakness found |
| Hidden Signal free pitching | P1 | Always pitch 72/62/62%; honest signalling 68/67/67% **[Run]** | **Fixed** |
| Mole Hard = Normal | P2 | Exact Bayes 75 / 75 / 65 % **[Run]** | **Fixed** (modest gradient) |
| Coalition Hard = Normal | P2 | Best strategies 17–25% at every level; no gradient **[Run]** | **Still flat** |
| Lesson wording A1 (L15.B) / A2 (L18.C) | Low | Both strings unchanged in `supabase/seed/content.json` | **Still present** |
| `strategy-detective` id vs title | P3 | Still 12 references | **Still present** (internal only) |
| Strategic profile = lesson accuracy | P1 | Unchanged; games still don't feed it | **Still missing** |
| Analytics | P1 | No events, SDK or table (`grep` for posthog/sentry/analytics_events/track) | **Still missing** |
| Crash reporting | P1 | Expo Router `ErrorBoundary` only; no global handler | **Still missing** |
| i18n | P3 | `i18next` and `react-i18next` installed, zero imports | **Still unused** |
| Responsive testing | P2 | No overflow at 320/360/430 on 7 screens (web) **[Run]**; 200% font scale and native UNVERIFIED | **Partial** |
| Native device QA | P0 | None recorded | **Still missing** |

---

## Section C — Content audit

### C.1 Inventory (resolved)

- **Lessons: 22** in 6 modules, positions 0–21, stable ids. **Scenarios: 66** (3 per lesson, ids unique). **Challenges: 15. Checkpoints: 7.** There are 17 curriculum labs; the 5 hand-built lessons have bespoke flows. **[Run]**
- Scenario skills: anticipating 25, uncertainty 20, incentives 12, coordination 9. Coordination is thin. **[Run]**
- **The live catalogue (`get_published_content`) equals `supabase/seed/content.json` in every top-level key** **[Live]**.
- **Games: 23.** 5 classic (`src/games`): Split or Steal, Rock Paper Scissors, Two-Thirds Guess, Quick Ultimatum, Stag Hunt. 18 Arena (`src/arena`): Cooperation Game, Ultimatum Game, Auction House, Market Rivals, Hidden Signal, Mole, Commons, Coalition, Inspector, Traveler's Dilemma, Saboteur, Bluff, Defusal, Power Play, Last Stand, Liar's Dice, Codebreaker, Gambit.

### C.2 Accuracy

**What protects accuracy:** every calculable answer key is checked by a solver in tests (`src/content/build.ts`, content tests). The live catalogue matches the tested seed.

**Hand-verified in this audit [Run]:**

| Scenario | What I checked | Verdict |
|---|---|---|
| L3.A | Lunchtime spot: best replies and the unique equilibrium | ✅ |
| L3.B | Penalty kick has no pure equilibrium | ✅ |
| L3.C | Co-founders: (4, 7) is the unique equilibrium; 11 < 12 | ✅ |
| L12.A | Each day 0.25 × 6 = 1.5 > 1; indifference rate 1/6 | ✅ |
| L12.B | E[bid 8] = 85/11 − 8 = −0.27; lose 2/11 | ✅ |
| L12.C | Backward induction of the strike with hazard 0.1t, cost 2, arbitration 4 → **2.666** ("about 2.7") | ✅ |
| L19.A | Minimal winning coalition | ✅ |
| L19.B | Core test: A+B = 55 < 60 → blocked | ✅ |
| L19.C | Empty core (36 > 24) | ✅ |
| L22.A | Sequential (lead → 6) and simultaneous (two equilibria) | ✅ |
| L22.B | Volunteer's dilemma: p = 1 − 0.4^(1/(n−1)) = 0.368; P(nobody) 0.253 (n=3) vs 0.333 (n=6) | ✅ |
| L22.C | EV 28 / 24 / 25.5; threshold delay 11 | ✅ |

**Still open from the last audit:**

- **A1, L15.B:** "Free information never hurts", stated unqualified. That is false in strategic settings.
- **A2, L18.C:** "the average car on offer is always worse than the price suggests" overgeneralizes the model.

Both are one-line copy fixes.

### C.3 Lesson table

Ratings are 1–5 **[Judgement]**:

- **Accuracy** comes from the solver tests plus the hand checks above.
- **UX** reflects mobile density. No overflow was found at 320 px on the matrix scenarios L2.C and L3.A.
- **Engagement and Replay** are hypotheses until real users play. Replay is deterministic in every lesson: the same run teaches nothing new.

| Lesson | Accuracy | UX | Engagement | Replay | Bugs | Recommended action |
|---|---:|---:|---:|---:|---|---|
| L1 Cooperation Trap | 5 | 4 | 4 | 2 | — | Second rival rule on replay; end with "Try it: Split or Steal" |
| L2 Strategy Detective | 5 | 4 | 4 | 2 | Id/title swap with L14 (internal) | Fresh payoff table on replay |
| L3 Finding the Best Move | 5 | 3 | 3 | 2 | — | Tap-to-mark best replies on the matrix; 3×3 still dense at 320 px |
| L4 Coordination Problem | 5 | 4 | 4 | 2 | — | Link Stag Hunt |
| L5 Predictability Trap | 5 | 4 | 4 | 3 | — | End with an RPS match against the pattern opponent |
| L6 Competing for Advantage | 5 | 4 | 3 | 2 | — | Link Market Rivals (now balanced) |
| L7 Rules of Evolution | 5 | 4 | 3 | 3 | — | Animate the population over time |
| L8 Move First, Win More | 5 | 4 | 3 | 2 | — | Let the learner play the centipede |
| L9 Threats and Credibility | 5 | 4 | 4 | 2 | — | Link Power Play |
| L10 Incentives and Hidden Actions | 5 | 3 | 4 | 2 | — | 10 min: split the lab from the scenarios; link Inspector |
| L11 Bargaining and Fairness | 5 | 4 | 4 | 2 | — | Link Ultimatum Game |
| L12 The Cost of Waiting | 5 | 3 | 3 | 2 | — | Abstract. Every scenario is an expected-value text problem with no visual (no `visual` on A/B/C). Add a cost/chance timeline visual and a concrete Indian example |
| L13 Cooperation Over Time | 5 | 4 | 4 | 3 | — | Link Cooperation Game (noisy) |
| L14 Reasoning from Beliefs | 5 | 4 | 4 | 3 | Id `strategy-detective` | Link Two-Thirds Guess |
| L15 Decisions Under Uncertainty | 4 | 4 | 3 | 2 | A1 wording | Fix A1; icon-array visual |
| L16 Signals and Secrets | 5 | 4 | 3 | 2 | — | Link Hidden Signal, Bluff |
| L17 Winning the Auction | 5 | 4 | 4 | 3 | — | Link Auction House |
| L18 Signals, Imitation and Market Quality | 4 | 4 | 3 | 2 | A2 wording | Fix A2 |
| L19 Coalitions and Power | 5 | 3 | 3 | 2 | — | Only B has a visual; A and C are text arithmetic. Add the seat chart from The Coalition game |
| L20 Politics of Voting | 5 | 4 | 4 | 2 | — | Let the learner set the agenda |
| L21 Brinkmanship | 5 | 4 | 4 | 2 | — | Link Last Stand / Power Play |
| L22 Strategic Thinking in Practice | 5 | 3 | 3 | 2 | — | No visuals on any scenario; the "Step 1: choose the model" rule reads like a worksheet. Make one case branch with consequences |

**L3, L12, L19 and L22 (requested re-checks):**

- The maths is correct in all four.
- The weakness is presentation, not accuracy. L12, L19 and L22 are almost entirely text and arithmetic, with no visual for 8 of their 9 scenarios.
- L3's 3×3 grids fit at 320 px but are information-dense.

---

## Section D — Game audit

### D.1 Balance re-test [Run]

Method: the previous audit's script (`docs/game-ux-audit/balance-v2-script.txt`) run unchanged on the current engines. 150 seeds per opponent per level, standard length. Win % shown as Easy / Normal / Hard.

| Game | Strategy | Before (4 Nov) | Now | Reading |
|---|---|---|---|---|
| Market Rivals | Fixed price 10 | 97 / 90 / 92 | **88 / 39 / 31** | Exploit closed on N/H; best reply to last prices now 85 / 44 / 19 (adaptive play is rewarded) |
| Bluff | Always call (vs Risk Taker) | 100 / 96 / 96 | **81 / 50 / 50** | Fixed |
| Hidden Signal | Always pitch | 82 / 70 / 71 | **72 / 62 / 62** | Honest signalling now **68 / 67 / 67**: no dominant strategy |
| Last Stand | Do nothing | 100 / 12 / 2 | **37 / 11 / 3** | Fixed, **but** the fixed rule "douse the other hottest fire" wins **100 / 86 / 47**, beating the adaptive player (74 / 33 / 11). Easy and Normal are solved by one rule |
| Mole | Exact Bayes | 77 / 77 / 77 | **75 / 75 / 65** | Hard is now harder; Easy = Normal |
| Coalition | Best adaptive | 28 / 20 / 23 | **25 / 16 / 20** | **Still flat**: difficulty doesn't change outcomes |
| Power Play | Honest roles | 42 / 34 / 41 | **41 / 34 / 41** | **Non-monotonic**: Hard = Easy for an honest player |
| Liar's Dice | Adaptive caller | 71 / 49 / 41 | **71 / 51 / 40** | Healthy gradient |

These are scripted strategies, not people. They find dominant strategies; they don't measure fun.

### D.2 Game table

Mechanics is measured (tests plus the derivations in the last audit). Balance comes from §D.1 where simulated. The rest are 1–5 **[Judgement]**.

"GOTW server" means: classic games run in SQL and are live on the v1 backend. Arena games run through the `arena-match` Edge Function and are blocked in production until it is deployed and `arena_server_enabled` is set (the default is `false`, a safe gate).

| Game | Mechanics | Balance | Bot quality | UX | Edu. | Replay | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Split or Steal | 5 | 3 | 3 | 4 | 4 | 3 | Sound; certain last-round steal; what-if replay added |
| Rock Paper Scissors | 5 | 4 | 4 | 4 | 4 | 4 | Good |
| Two-Thirds Guess | 5 | 4 | 4 | 4 | 5 | 4 | Good |
| Quick Ultimatum | 5 | 3 | 3 | 4 | 3 | 2 | Kept for GOTW; overlaps Ultimatum Game |
| Stag Hunt | 5 | 3 | 3 | 4 | 4 | 2 | One idea long; variant deferred (needs SQL port) |
| Cooperation Game | 5 | 4 | 4 | 4 | 5 | 4 | Flagship |
| Ultimatum Game | 5 | 4 | 3 | 4 | 4 | 4 | Generic finance personas |
| Auction House | 5 | 4 | 4 | 4 | 5 | 4 | Good |
| Market Rivals | 5 | 4 | 3 | 3 | 4 | 3 | Fixed; Easy still lenient |
| Hidden Signal | 5 | 4 | 3 | 3 | 4 | 3 | Fixed |
| Mole | 5 | 4 | 3 | 4 | 4 | 3 | Fixed (modest) |
| Commons | 5 | 4 | 4 | 4 | 5 | 4 | Not simulated this pass |
| Coalition | 5 | 2 | 2 | 3 | 4 | 3 | **Difficulty flat** |
| Inspector | 5 | 4 | 4 | 4 | 5 | 4 | Not simulated this pass |
| Traveler's Dilemma | 5 | 4 | 4 | 4 | 5 | 3 | Not simulated this pass |
| Saboteur | 5 | 4 | 4 | 3 | 4 | 4 | Not simulated this pass |
| Bluff | 5 | 4 | 3 | 4 | 4 | 4 | Fixed |
| Defusal | 5 | 4 | 3 | 3 | 3 | 4 | Puzzle; lesson link added |
| Power Play | 5 | 3 | 3 | 3 | 4 | 4 | **Hard ≈ Easy** |
| Last Stand | 5 | 2 | 3 | 4 | 3 | 3 | **One fixed rule wins Easy/Normal** |
| Liar's Dice | 5 | 4 | 4 | 4 | 4 | 4 | Good |
| Codebreaker | 5 | 4 | 3 | 4 | 3 | 4 | Keep name and terms distinct from a commercial word game |
| Gambit | 5 | 4 | 3 | 4 | 3 | 4 | Good |

- **Top five:** Cooperation Game, Auction House, Two-Thirds Guess, Liar's Dice, Inspector. They have the deepest decisions, healthy difficulty gradients where simulated, and direct lesson tie-ins.
- **Weakest five:** Coalition (flat difficulty), Last Stand (one-rule solution), Stag Hunt (single idea), Quick Ultimatum (redundant), Power Play (non-monotonic difficulty).

**Bot integrity [Code, tests]:**

- Bots decide from public history; ranked seeds are generated server-side (`game_engine.new_seed()`).
- Redacted Arena views withhold the seed and hidden state (`src/competition/arena-views.ts`, tested).
- Reflections are invariant to moving the hidden player (tested).

---

## Section D2 — Product features

### Google authentication [Code; device UNVERIFIED]

**What's good:**

- One identity, no anonymous path left. `signInAnonymously` is not called anywhere. An old anonymous session is deleted at start-up.
- PKCE browser flow by default; the native Credential Manager path is opt-in.
- Sessions are stored in SecureStore in 1,800-byte chunks. Refresh runs only in the foreground.
- `getUser()` confirms the session at start-up.
- An owner marker clears device data on any identity mismatch.
- The outbox carries a generation guard against cross-account races.
- Sign-out drains pending writes first and offers "Sign out anyway" when offline.

**Gaps:**

| # | Gap | Evidence | Severity |
|---|---|---|---|
| AU1 | **Email/password sign-ups are open on the live project.** Anyone with the public key can create a password account through the Auth API, bypassing Google. They need a confirmable inbox, since `mailer_autoconfirm:false`. That enables multi-account farming of Daily and GOTW boards | `GET /auth/v1/settings` → `"email":true, "disable_signup":false` **[Live]**; `config.toml` says off | **P1** |
| AU2 | **Never exercised on a device.** This covers browser OAuth, the `tactiqo://auth-callback` redirect, the JS-restart path (`app/auth-callback.tsx`), refresh after 1 hour, and revocation | `AUTHENTICATION.md` checklist all unticked | **P0 (release gate)** |
| AU3 | Supabase redirect allow-list, Google consent screen ("Testing" vs "Production") and `exp://**` removal are dashboard-only | — | UNVERIFIED |
| AU4 | **iOS:** App Review guideline 4.8 generally requires Sign in with Apple when an app offers only third-party login. Not implemented | `docs/AUTHENTICATION.md` "Apple sign-in isn't implemented" | P1 for iOS only |
| AU5 | Web start-up deletes the web session. `removeLegacySession()` removes `sb-<ref>-auth-token` from AsyncStorage, and on web that is the live session store (`session-storage.web.ts`) | `src/data/supabase.ts:137`, `src/auth/session-storage.web.ts` | P3 today (web has no sign-in); blocks any future web sign-in |

### Data ownership and RLS [Code, tests]

- RLS is on for every public table. Progress and Arena tables have owner policies on `auth.uid()`. Game and Daily tables have no client grants; all access goes through SECURITY DEFINER functions.
- Ranked results are computed server-side.
- **Live:** `daily_challenge_keys`, `game_competitions`, `player_profiles`, `arena_matches` and `game_definitions` all refuse anon (42501).
- **Live:** `daily_challenges` is anon-readable for published rows. Only one exists, and its answers live in the refused keys table. This is by design. **[Live]**

**Observation (P3):** several anon-callable read functions *write*:

- `get_games_overview` → `finalize_competitions` and `ensure_competitions`
- `get_daily_leaderboard` → `ensure_daily_challenge_today`
- `get_competition_history` and `get_champions_leaderboard` → `finalize_competitions`

They're idempotent, but unauthenticated traffic can drive write work, with no rate limit.

### Account deletion [Code, tests; device UNVERIFIED]

- `delete_my_account()` deletes the `auth.users` row and cascades through every user table in one transaction. A test checks the cascades from the catalogue.
- The client stops the outbox and Arena uploads first.
- Local data is cleared only after the server confirms. All 8 account-scoped keys are cleared, including the four the last audit flagged.
- A retry after a lost response reads `account:not_found` as done.
- An access token still valid after deletion can't write anything back: every insert hits the foreign key to the deleted user.
- **Residual:** the website's `/delete-account` page still describes "the anonymous account the app creates on first launch" **[Live]**.

### Daily Challenge

**Spec vs code [Code]:**

| Requirement | Code | Live |
|---|---|---|
| Hybrid source: manual overrides auto | ✅ `ensure_daily_challenge`, `publish_scheduled_challenge` | ❌ not deployed |
| Formats: prediction, decision, reasoning, outcome | ✅ check constraint, pool assignment | ❌ |
| 1 ranked attempt, unlimited practice | ✅ tested | v1 only |
| Explanations after submission | ✅ | v1 |
| History for practice | ✅ `get_daily_history` | ❌ PGRST202 |
| Asia/Kolkata | ✅ `competition_settings.daily_timezone` | ❌ v1 `daily_challenge_today()` is UTC. Today both read 2026-11-05, so it's indistinguishable without a write |
| Immutable once answered | ✅ guard v2 | v1 guard |
| No empty days | ✅ auto-pick, with recovery on read | ❌ **live has had no challenge since 2026-10-27** |

**Design issues:**

- **D-1 (P2): the leaderboard can't separate players.** Score is 100 / 60 / 40 / 0 by verdict, and the tie-break is quadratic calibration of one 5-step confidence (`content_admin.daily_score`). Every correct answer at confidence 5 scores (100, 100). On any day with more than a handful of entrants, the top rank is a large shared tie.
- **D-2 (known): answers are public.** Adapted challenges reuse public lesson scenarios, so their answers are findable in the Learn tab. Daily rankings measure honesty as much as skill.

**Recommendation:** present Daily as a habit and calibration score with a personal streak, not a competitive ranking. Or rank only manual, unpublished-content days.

### Game of the Week

**Code [Code, tests]:**

- 23 games eligible. The rotation never repeats consecutively and prefers games featured least recently.
- Manual scheduling has an append-only audit.
- The configuration locks once the week starts. 3 attempts are reserved at match creation, so abandoning a losing match doesn't help. The best attempt counts.
- Seeds are random per match and server-side. Arena games are replayed from an action log. Grace period of 15 min.
- Champions are immutable; shared titles go to full ties.
- Finished competitions are read-only.
- A weekly test plays every one of the 23 games in a ranked competition.

**Is every selectable game supported server-side?** Yes in code. **In production, the 18 Arena games are not selectable**, because the function is 404 and `arena_server_enabled` defaults to `false` (`game_engine.featurable`). That gate prevents the critical failure mode the brief warns about. **[Code, Live]**

**Risks:**

- **G-1 (P0 operational):** none of v2 is deployed (see Section B).
- **G-2 (P2):** the Edge Function imports `../../../src/competition/arena-handler.ts`. Bundling repository files outside `supabase/functions` is untested on the hosted CLI; the milestone notes a fallback. UNVERIFIED until the first deploy.
- **G-3 (P2) [Judgement]:** Power Play and Gambit score win / draw / loss as 2 / 1 / 0, with coins or home margin as the tie-break. Expect frequent shared championships. Liar's Dice and Codebreaker are luck-heavy, so three attempts reward volume as much as skill.
- **G-4 (UNVERIFIED):** whether a GOTW is scheduled live this week. I couldn't read `game_competitions` without calling a function that writes.

### Leaderboards [Code]

- Nicknames only; ranks are computed in SQL; pagination and "me" rows exist.
- Practice is never recorded on ranked boards.
- **Live nickname rules UNVERIFIED** (migration `20261104120100` status unknown).
- Multi-account abuse is bounded only by Google accounts per person, plus open email sign-up (AU1).

### Stories, profile, reflections, settings

- **Stories:** 2 stories with code-composed audio. Still **not heard by a human** (`docs/STORY_AUDIO_ASSETS.md`).
- **Profile:** still lesson-accuracy only.
- **Reflections:** 23/23 games linked to a lesson.
- **Settings:** verified on web.
- **Missing:** licences; a separate sound-effects toggle; reminders.

---

## Section E — Onboarding and first session [Run on web, 360 px]

| Step | Observed |
|---|---|
| Cold start | **No meaningful text for about 5 s.** The loading backdrop shows while `get_published_content` (2.5 s) and then `get_lesson_categories` (0.8 s) complete, in series, before anything renders |
| Welcome | "Think beyond the obvious." with Experience Tactiqo and Skip to the app. Clear |
| First decision | Share or take vs Maya, with all outcomes shown and a sealed lock-in. Strong |
| Reveal | "You Shared 0 coins VS Maya Took 5 coins": honest, with optional "Go deeper". The first emotional beat is a loss for every sharer |
| Map | Learn (22 lessons + 66 scenarios), Games (23), Stories (2), from live counts. Matches the tabs |
| Next step | "Recommended next: The Cooperation Trap", or "Explore on my own" |
| Learn tab | Start-here card, practice, a Daily card ("sign in to take part"), category filter, modules |
| Sign-in invitation | Not shown after onboarding. It appears only after the first in-app decision; "Not now" dismisses it for good. **Appropriately non-blocking** |

**Issues:**

1. **E1 (P1):** the 5-second blank-ish start on every launch, and no offline path (Section F).
2. **E2 (P2):** the first post-onboarding screen offers four competing entry points (Start here, Practice, Daily, 22 lessons) plus a category filter. "Start here" is the right first action and is visually primary. Practice and Daily can wait until lesson 1 is complete.
3. **E3 (P2):** a guest's first tap on Daily hits a sign-in wall. Let a guest *practise* today's challenge, and invite sign-in only to *rank* the attempt.
4. **E4 (P2):** after lesson 1 there is no "now try it against an opponent" bridge to Split or Steal / Cooperation Game.
5. **E5 (P3):** the Learn header says "A GAME THAT TEACHES YOU TO THINK STRATEGICALLY". The product positions itself as a learning platform; the store and website vocabulary should match.

**Recommended first session:**

1. Welcome
2. The Maya decision and reveal
3. Map (as now)
4. Lesson 1 directly (skip the Learn tab)
5. Lesson complete: "Try it live: Split or Steal against The Mirror"
6. Match result and reflection, linked back to lesson 1
7. Then the "Keep your progress safe" invitation, with the concrete reason: "1 lesson and 1 match saved only on this phone"
8. Daily practice the next day, available as a guest

---

## Section F — UI consistency, responsiveness and performance

**Design system [Code]:**

- `src/theme/tokens.ts` centralizes colours, spacing, `radius` (8/12/16/22/pill) and Inter.
- Shared UI lives in `src/components/ui` (AppText, Button, Card, ChoiceCard, MessageScreen, Segmented, Slider) and `src/components/game`.
- 96 hard-coded hex colours: almost all in illustration art (Stories art, LessonArt, portraits). Acceptable.
- 96 literal `borderRadius` values: mostly 2–5 px for markers and bars, plus some 18 / 20 / 22 for cards outside the token scale. Low priority; no rewrite warranted.
- Two Panel components remain (`parts.Panel`, `kit.Panel`).
- 10 files use ActivityIndicator directly, while the competition screens use `ScreenShell` / `useRemote`. Loading, empty and error patterns are consistent within the new competition screens, less so elsewhere.

**Responsive [Run, web]:** zero horizontal overflow at 320 and 430 px on Learn, Stories, Profile, Settings, two matrix scenarios and a Market Rivals match. Text never fell below 11 px.

**UNVERIFIED:**

- 200% font scaling. There is no `maxFontSizeMultiplier` anywhere, so large system fonts are unbounded on native.
- Android densities and the keyboard on the nickname screen.

### Performance table

| Screen | Initial load | Data load | Rendering issues | Performance issue | Severity | Evidence |
|---|---|---|---|---|---|---|
| App start (any route) | 1.9–3.0 s to content (web, local bundle, broadband) | `get_published_content` 317 KB JSON (105 KB gzip), TTFB 1.0–1.5 s, then categories 0.8 s, **in series** | Backdrop only until both finish | Blocking start-up with no cache; deep links to device-only games also wait for the catalogue | **P1** | **[Run]** resource timings; `curl` ×3; `src/data/session.ts:261-266` |
| Onboarding | Same as start | Catalogue counts | Entering animations look blank in a backgrounded tab (a web-pane artefact) | — | — | **[Run]** |
| Learn tab | Instant after start | None for guests | — | 22 cards in a ScrollView: fine at this size | — | **[Code]** |
| Games tab | UNVERIFIED (not opened against live) | `get_games_overview` (writes on read) | — | One RPC also does maintenance work | P3 | **[Code]** |
| Daily leaderboard / history, competitions, ranked Arena | UNVERIFIED | v2 RPCs are **absent live**, so they will show error states | — | — | **P0 (deploy)** | **[Live]** PGRST202 |
| Web bundle | 4.9 MB single JS file, no code-splitting | — | — | Heavy for the web demo, irrelevant to native | P3 | **[Run]** export |
| Native binary | Not built | — | — | 22 MB of bundled MP3 (505 files) inflates the APK | P3 | `du assets/audio` |

**Root cause of the start-up delay:** the catalogue is rebuilt by a SQL function on every request, with no HTTP caching. It is never stored on the device. Categories are requested only after it arrives. **Fix:**

1. Cache the last catalogue (version-stamped) in AsyncStorage and render from it immediately.
2. Revalidate in the background.
3. Fetch categories in parallel, or embed them in the catalogue.

---

## Section G — Website (tactiqo.vercel.app) [Live]

**Works well:**

- Polished dark design, consistent with the app palette.
- Clear headline and an interactive Two-Thirds demo that runs locally.
- No horizontal overflow at 360 px. Load event in about 0.7 s.
- Complete OG and Twitter metadata and image, favicon and Apple icon, `robots.txt`, `sitemap.xml`, a skip link, `lang="en"` and HSTS.

| Issue | Severity |
|---|---|
| States "**5 games** against **bots**"; the app has 23 games and its copy says "opponents" | P1 |
| App mock-ups show tabs Learn / Games / Profile, with **no Stories tab** | P2 |
| "Tactiqo isn't available to download yet." **There is no Play link** | P1 at launch |
| **Privacy Policy and Terms are "Draft", with bracketed placeholders**. They describe anonymous IDs and "doesn't ask for your name, email", never mention Google, Arena summaries or Stories, and name no governing law. `/delete-account` also describes anonymous accounts | **P0** |
| No FAQ (`/faq` and `/support` return 404; support lives at `/contact`) | P3 |
| No CSP, `X-Content-Type-Options`, `X-Frame-Options` or `Referrer-Policy` headers | P3 |
| No mention of Google sign-in, Daily Challenge or Stories | P2 |

---

## Section H — Security, privacy, backend and release

### Supabase [Live, Code]

| Item | Status |
|---|---|
| Migrations applied live | Up to `20261104120000_arena_match_summaries` (the table exists). **`20261105120000/120100/120200` not applied.** `20261104120100_nickname_rules` UNVERIFIED |
| Edge Functions | `arena-match` **not deployed** (404). `text-to-speech` **deployed and public**: a "Hello" template behind publishable-key auth. **Delete it** (and its 4 tsc errors) |
| Scheduler (pg_cron) | Not registered (it depends on the unapplied migration) |
| Auth | Google on, anonymous off, **email sign-up on** (AU1) |
| Secrets | Client refuses service-role keys; only public values ship; `.env` holds a TTS key that isn't `EXPO_PUBLIC_`, so it isn't bundled |
| Backups / PITR, rate limits, CAPTCHA, JWT expiry, redirect URLs | **UNVERIFIED**: dashboard only |

### Privacy Policy vs actual data

| Data | Collected? | Policy says |
|---|---|---|
| Google email, name, avatar (Supabase `auth.users`); email shown in Settings | **Yes** | "doesn't ask for your name, email" ❌ |
| Anonymous ID | **No longer** | "creates an anonymous ID" ❌ |
| Lesson answers, confidence, Daily answers | Yes | ✅ |
| Arena match summaries (server) | Yes | Not mentioned ❌ |
| Stories progress, story sound levels, guest progress (device) | Yes | Not mentioned ❌ |
| Ranked Arena action logs (server) | Yes (when v2 is deployed) | Not mentioned ❌ |
| Analytics / crash SDKs | None | "none" ✅ (must change when added) |
| Data region | — | "[Supabase project region]" placeholder ❌ |

### Google Play Data Safety: what the form should say

**What is collected:**

- Personal info: **email address** and **name**, collected, required for an account, not shared. Purpose: account management and app functionality.
- App activity: in-app actions (answers, game results), collected for app functionality.
- User-generated content: nickname (optional, public).
- No location, contacts, photos, device or advertising ID, analytics or crash data today.

**Handling:**

- Encrypted in transit: yes (HTTPS).
- Deletion: in-app (Settings → Account) and by email.
- Data shared: none. Supabase and Vercel are processors.

**UNVERIFIED:** what is currently declared in Play Console.

### Release engineering [Code]

**Android:**

- `com.tactiqo.app`. The only permission is `MODIFY_AUDIO_SETTINGS`.
- EAS profiles: development, preview (APK), production (AAB, `autoIncrement`, remote versioning).
- Schemes `tactiqo` and `strategicgame`.
- No `expo-updates`, so there are no OTA updates. That's fine.
- **The last preview APK was built from `957852c`, before sign-in.** No build of the current commit is recorded.

**Gaps:**

- EAS `development` env lacks the Supabase vars (per `AUTHENTICATION.md`).
- `EXPO_PUBLIC_WEB_URL` isn't set locally, so friend-challenge links use `tactiqo://`, which opens nothing for a recipient without the app. EAS value UNVERIFIED.
- There are no Android App Links (https).

**iOS:**

- `supportsTablet: true` with a portrait lock.
- No Sign in with Apple (AU4).
- The nitro Google plugin is deliberately omitted (fine for the browser path).
- Untested.

**Expo Go vs builds:** the browser OAuth redirect differs (`exp://…` vs `tactiqo://auth-callback`). Success in Expo Go proves nothing about an installed build's redirect allow-listing.

### Accessibility and i18n [Code]

- 236 `accessibilityLabel`s and 192 roles; reduced motion is supported; `hitSlop` is used in 13 places.
- No font-scale caps, and 200% scaling is untested.
- i18n is installed but not wired: zero imports, and all copy is inline literals plus the content JSON.
- **For Hindi later:** move UI strings to keyed resources, and add a `locale` dimension to `get_published_content`. Content is the bulk: about 317 KB of JSON.

---

## Section I — Analytics recommendation

**Recommendation: first-party events in Supabase, sent through the existing outbox.** It costs nothing extra, adds no new processor to disclose beyond Supabase, and works offline and idempotently. PostHog becomes worth evaluating only if you need funnel UI and passing about 10k MAU.

**Schema** (one migration):

```sql
create table analytics_events (
  id uuid primary key,               -- client-generated, idempotent
  install_id uuid not null,          -- random per install, never tied to Google profile
  user_id uuid references auth.users on delete cascade, -- null for guests
  name text not null check (name ~ '^[a-z_]{3,40}$'),
  props jsonb not null default '{}' check (pg_column_size(props) < 2048),
  client_ts timestamptz not null, server_ts timestamptz not null default now(),
  app_version text, platform text);
-- RLS: insert-only for anon+authenticated (user_id must be null or auth.uid()); no select; 13-month purge job.
```

- Guests need an insert path because there is no server identity. Use an anon-insert RPC with per-`install_id` rate limiting.
- Sign-in links `install_id` to `user_id` server-side.
- Dashboards: SQL views in the SQL editor, or free Metabase.

**Launch event set (17 events), each tied to a decision:**

| Event | Key props | Decision it enables |
|---|---|---|
| `app_open` | `is_first`, `cold_start_ms`, `catalog_ms` | Installs, DAU, start-up performance in the field |
| `onboarding_completed` / `onboarding_skipped` | step reached | Does the welcome convert? |
| `lesson_started` / `lesson_completed` | `lesson_id`, `duration_ms` | Popularity, completion |
| `lesson_exited` | `lesson_id`, `step_index` | **Where users abandon** |
| `game_started` / `game_completed` | `game_id`, `level`, `variant`, `outcome`, `rounds` | Most-played, difficulty mix |
| `game_replayed` | `game_id` | Replay value |
| `reflection_lesson_tapped` | `game_id` | Does the game → lesson loop work? |
| `daily_viewed` / `daily_submitted` | `ranked`, `format` | Daily usage |
| `gotw_match_started` / `gotw_match_completed` | `game_id`, `attempt` | GOTW participation and completion |
| `sign_in_completed` | `source` (invite, settings, gate) | Where accounts come from |
| `sync_failed` | `kind` (outbox, arena upload, start-up) | Reliability |

**Coverage:**

- This answers questions 1–13 and 15 of the brief.
- D1/D7 retention comes from `app_open` by `install_id`, by IST calendar day.
- Question 14 (features that correlate with retention) is a cohort query over the same table.

**Privacy rules:**

- Never send email, nickname, free text, seeds, hidden roles or a persona before its reveal.
- Update the privacy policy and Data Safety ("App activity: app interactions; analytics").
- Cascade on account deletion; purge after 13 months.

---

## Section J — Crash reporting recommendation

**Recommendation: Sentry, with `@sentry/react-native` and its Expo config plugin.** Crashlytics is the alternative, but it needs Firebase (`google-services.json`, extra native SDKs) and gives a weaker JS-error experience. A custom Supabase error table can't capture native crashes or symbolicate stack traces, so it isn't justified.

**What Sentry captures:**

- JS exceptions, unhandled promise rejections and React render errors (wrap the root, and report from `ErrorBoundary`).
- Native Android and iOS crashes in EAS builds.
- Release health (crash-free sessions per version).
- Breadcrumbs.
- Optional low-rate performance traces.

**What it can't capture:**

- Native crashes in **Expo Go**.
- Anything before SDK initialization.
- Silent logic errors. Report those as handled events: `sync_failed`, failed `deleteAccount`, `arena-match` 5xx.

**Minimal launch configuration** (verify package versions against the Expo SDK 57 docs before installing, per `AGENTS.md`):

| Topic | Setup |
|---|---|
| Packages and config | `npx expo install @sentry/react-native`; plugin in `app.json`; `getSentryExpoConfig` in `metro.config.js` for source maps |
| EAS | Secret `SENTRY_AUTH_TOKEN` (upload of source maps and Android mapping files at build time); `EXPO_PUBLIC_SENTRY_DSN` per environment; `environment` = development / preview / production; `release` = version + build number |
| Privacy | `sendDefaultPii: false`; `beforeSend` strips URLs' query strings, emails and request bodies; user context = Supabase UUID only (or none); no screenshots or replay |
| Alerts | New issue in production; crash-free sessions below 99.5% for a release; any `deleteAccount` failure |
| Cost | Free developer tier |

The privacy policy must change first. It currently says "no … crash-reporting SDKs".

---

## Section K — Testing gaps

**Strong today:** engine and content unit tests, solver-checked answer keys, RLS and grant tests against the real migrations in PGlite, Daily v2 (20 tests), weekly (36 tests, all 23 games), tamper tests, the auth state machine, account switching and outbox races.

**Missing:**

- Any committed E2E test. The milestone's Playwright run wasn't committed.
- Component and render tests.
- Native-device runs.
- Website tests.
- A live-deployment smoke test (does the deployed schema match what the app calls?).

| Feature | Unit | Integration (PGlite/SQL) | E2E | Native QA | Confidence |
|---|---|---|---|---|---|
| 22 lessons / 66 scenarios content | ✅ solvers | ✅ seed/publish | ❌ | ❌ | High (correctness), Low (UX) |
| 23 game engines | ✅ | ✅ (5 SQL ports, 18 via handler) | ❌ | ❌ | High (rules), Low (device UX) |
| Google sign-in | ✅ state, errors, callback | ✅ RLS/grants | ❌ | ❌ | **Low** |
| Sign-out / switch / deletion | ✅ | ✅ cascade | ❌ | ❌ | Medium |
| Daily v2 | ✅ | ✅ | Ad hoc only | ❌ | Medium (code), **None (live)** |
| GOTW v2 | ✅ | ✅ | Ad hoc only | ❌ | Medium (code), **None (live)** |
| Leaderboards | ✅ | ✅ | ❌ | ❌ | Medium |
| Stories and audio | ✅ logic | — | ❌ | ❌ (never heard) | Low |
| Onboarding | ✅ | — | Manual web | ❌ | Medium |
| Website | ❌ | — | ❌ | — | Low |

**Highest-value missing tests:**

1. A **deploy smoke script** that calls every RPC the app uses against the target project, read-only. It would have caught Section B's main gap.
2. **Maestro E2E flows** on an EAS dev build: onboarding → lesson 1 → game → sign-in → delete.
3. A **catalogue-offline start** test.
4. A **simulation regression test** asserting difficulty monotonicity per Arena game. It would flag Coalition and Power Play.

**Native QA checklist (Android low-end and mid-range):**

- [ ] Sign-in: cancel, success, returning user, second account.
- [ ] Kill and reopen the app; airplane-mode start.
- [ ] Token refresh after 1 hour.
- [ ] Delete account; sign in again to an empty account.
- [ ] Lesson 1 end to end.
- [ ] Matrices at 320 dp and 200% font.
- [ ] All 23 games: setup, one match, result, reflection.
- [ ] Ranked GOTW match: start, background, resume.
- [ ] Daily: ranked and practice.
- [ ] Both stories with audio (listen).
- [ ] Haptics and reduced motion.
- [ ] TalkBack on onboarding and a lesson.
- [ ] Back gesture inside matches.

---

## Section L — Confirmed bugs and regressions

| # | Severity | Where | Reproduction | Root cause | Impact | Fix |
|---|---|---|---|---|---|---|
| L1 | **P0** | Live Supabase | `POST /rest/v1/rpc/get_daily_history` → PGRST202; `GET /rest/v1/weekly_champions` → PGRST205; `POST /functions/v1/arena-match` → 404 | v2 migrations, scheduler and function never deployed | Current app: Daily empty (last challenge 27 Oct); leaderboards, history, champions and ranked Arena screens error | Apply the 3 migrations, deploy `arena-match`, run `supabase/scheduler.sql`, set `arena_server_enabled`, then smoke-test |
| L2 | **P0** | `/privacy`, `/terms`, `/delete-account`; in-app "By continuing, you agree…" | Read the pages | Written for the anonymous build; drafts with placeholders | Store-policy and legal exposure; misleading users | Rewrite for Google sign-in, guests, Arena, Stories, region, governing law; remove "Draft" |
| L3 | **P1** | Live Auth settings | `GET /auth/v1/settings` → `email:true, disable_signup:false` | Dashboard not aligned with `config.toml` | Accounts without Google; leaderboard farming | Dashboard → Email provider → disable sign-ups |
| L4 | **P1** | Start-up (`src/data/session.ts:261-266`) | Cold start: 2–3 s blank (web); offline → "Couldn't load" | Uncached catalogue; serial categories fetch | Slow first impression; unusable offline | Cache the catalogue; parallelize; render from cache |
| L5 | P2 | Daily ranking (`content_admin.daily_score`) | Two correct answers at confidence 5 → identical (100, 100) | Single-question scoring | Leaderboard with a mass tie at the top | Reframe Daily as personal; or use manual-only ranked days |
| L6 | P2 | Last Stand engine/bots | Strategy "douse other hottest": 100% Easy, 86% Normal | Teammate and fire dynamics are too forgiving | One rule solves the game | Rebalance; add a monotonicity sim test |
| L7 | P2 | Coalition / Power Play difficulty | §D.1 | Bot changes don't change outcomes | "Hard" is cosmetic | Rebalance or relabel |
| L8 | P2 | Website home | "five games against bots", no Stories tab, no download | Stale copy | Misrepresents the product | Update copy, screenshots and store link |
| L9 | P3 | `removeLegacySession()` on web | Any web session is deleted at start | Same key in the same store | Blocks future web sign-in | Skip on web |
| L10 | P3 | `text-to-speech` function | Deployed, public, dead | Template never removed | Attack surface; tsc noise | Delete from the project and the repo |
| L11 | P3 | L15.B, L18.C copy | See C.2 | Unchanged since last audit | Minor inaccuracy | One-line edits |
| L12 | P3 | Docs drift | `AGENTS.md` says `src/app/`; the auth doc's guest-RPC list has 8 entries vs 13 | — | Maintainer confusion | Update docs |

No regression in game rules, content or tests was found. L2 is a regression in *accuracy*: the documents didn't change, but the app did.

---

## Section M — Future product direction

| Opportunity | Problem solved | How it works | Impact | Complexity / maintenance | Free / Premium | Evidence needed first |
|---|---|---|---|---|---|---|
| **Lesson → game bridges** (immediate) | Lessons and games feel like two products | Lesson completion card: "Try it against an opponent" with a preset game, persona and level; reflection links back | High | S / none | Free | None. Build it |
| **"How you play" profile** (near-term) | The profile ignores play | Describe tendencies (opens cooperatively, calls claims, offer fairness) from Arena summaries now on the server, with the existing evidence ladder | High; the core differentiator | M / low | Basic free, history premium | Arena uploads working live |
| **Persona mastery** (near-term) | No reason to replay | "Beat The Mirror on Hard"; a persona dossier unlocked by reads | Medium-high | M / low | Hard tiers premium | Replay-rate analytics |
| **Seeded lesson replays** (near-term) | Deterministic replays | Re-roll payoffs within solver-validated ranges | Medium | M / medium (solver per lab) | Free | Lesson replay events |
| **Spaced review in Daily** (90 days) | No retrieval | Daily picks a scenario the user missed 7–21 days ago, as personal practice | Medium-high | S–M | Free | Daily usage |
| **Monthly decision report** (90 days) | Reason to stay subscribed | Behaviour plus calibration over the month, never "intelligence" | Medium | M | Premium | Retention cohorts |
| **Decision journal** (long-term) | Transfer to real life | Log a real decision, tag the concept, revisit the outcome | Unknown | M / low | Premium | Interviews first |
| **Real-world case studies** (long-term) | Abstractness (L12, L19, L22) | Branching cases with consequences | Medium | L / content-heavy | Premium | Lesson completion data |

---

## Section N — Ranked roadmap

Scores are User / Business / Complexity, each 1–10.

### Phase 1 — Must fix before public launch

| # | Task | U | B | C | Conf. | Pri | Depends | Effort |
|---|---|---:|---:|---:|---|---|---|---|
| 1 | Deploy v2: 3 migrations, `arena-match`, scheduler, `arena_server_enabled`; publish or auto-fill Daily | 9 | 10 | 3 | High | P0 | Dashboard / CLI | 0.5–1 day |
| 2 | Read-only deploy smoke script for every app RPC | 6 | 8 | 2 | High | P0 | — | 0.5 day |
| 3 | Disable email sign-ups; verify redirect URLs, consent screen in Production, remove `exp://**` | 6 | 9 | 1 | High | P0 | Dashboard | 1 hour |
| 4 | Rewrite Privacy, Terms and Delete-account pages for the current app; fill the region; remove "Draft" | 7 | 10 | 2 | High | P0 | — | 1 day |
| 5 | Build the current commit (preview AAB/APK); full native QA checklist on two Android devices | 10 | 10 | 4 | High | P0 | 1, 3 | 2–3 days |
| 6 | Play Console: Data Safety (email, name, app activity), deletion URL, listing copy | 6 | 10 | 2 | High | P0 | 4 | 0.5 day |
| 7 | Delete the `text-to-speech` function (live and repo) | 2 | 5 | 1 | High | P0 | — | 15 min |

### Phase 2 — First 30 days

| # | Task | U | B | C | Conf. | Pri | Effort |
|---|---|---:|---:|---:|---|---|---|
| 8 | Catalogue cache, parallel categories, offline start for lessons and Arena | 9 | 7 | 4 | High | P1 | 2–3 days |
| 9 | Sentry (after the policy update) | 5 | 8 | 3 | High | P1 | 1 day |
| 10 | First-party analytics (17 events) | 4 | 9 | 4 | High | P1 | 2–3 days |
| 11 | Lesson → game bridges and the first-session journey (§E) | 8 | 7 | 3 | Medium | P1 | 2 days |
| 12 | Guest Daily practice; reframe Daily ranking (L5) | 6 | 6 | 3 | Medium | P1 | 1–2 days |
| 13 | Website copy: 23 games, Stories, Play link, FAQ, security headers | 5 | 7 | 2 | High | P1 | 1 day |
| 14 | Licences screen; L15.B / L18.C copy; docs drift | 3 | 4 | 1 | High | P2 | 0.5 day |
| 15 | Font-scale caps and TalkBack pass | 5 | 4 | 3 | Medium | P2 | 1–2 days |

### Phase 3 — First 90 days

| # | Task | U | B | C | Pri |
|---|---|---:|---:|---:|---|
| 16 | "How you play" behavioural profile | 8 | 8 | 6 | P2 |
| 17 | Rebalance Last Stand, Coalition, Power Play; add a difficulty-monotonicity sim test | 6 | 5 | 5 | P2 |
| 18 | Persona mastery and replay goals | 7 | 7 | 5 | P2 |
| 19 | Spaced review via Daily | 6 | 6 | 4 | P2 |
| 20 | Visuals for L12, L19, L22; branching L22 | 6 | 5 | 6 | P2 |
| 21 | Maestro E2E suite | 4 | 6 | 5 | P2 |

### Phase 4 — Long term

Seeded lesson variants, the monthly report, case studies, Hindi (i18n wiring first), Sign in with Apple plus an iOS launch, a Stag Hunt / Split-or-Steal variant with SQL ports, and story audio on demand.

---

## Section O — Explicitly defer

- **Email/password or OTP.** There's no requirement for it; Google plus guest mode covers it.
- **Real-time multiplayer, chat, friends lists.** Moderation and infrastructure cost, with unvalidated demand.
- **LLM-generated feedback or content.** Cost and accuracy risk; the deterministic reflections are a strength.
- **Brain scores or cognitive-benefit claims.** That is legal risk (the FTC v. Lumosity precedent) and off-thesis.
- **Billing and paywall.** Not until analytics show retention, since it would add Play Billing and refund load before there's evidence.
- **Hindi localization.** Wire i18n only when the content pipeline is stable.
- **PostHog or other third-party analytics.** Only if the first-party SQL views prove insufficient.

---

## Section P — Founder action plan

**First five tasks:**

1. Supabase dashboard: turn off email sign-ups; confirm the redirect allow-list (`tactiqo://auth-callback`), the Google provider and the consent screen publishing status.
2. Apply `20261105120000`, `20261105120100` and `20261105120200`. Deploy `arena-match`, run `supabase/scheduler.sql`, set `arena_server_enabled = true`. Verify with `supabase/daily/manage.sql` and `supabase/games/manage.sql`.
3. Delete the deployed `text-to-speech` function.
4. Rewrite the Privacy Policy, Terms and Delete-account page for Google accounts, guests, Arena summaries and Stories.
5. Build a preview APK from `12aaf21` and run the native QA checklist (Section K) on a real Android phone.

**Next five tasks:**

6. Catalogue cache and offline start.
7. Sentry.
8. First-party analytics.
9. Lesson → game bridges.
10. Website copy and Play listing.

**What can safely wait:** the behaviour profile, mastery, rebalancing the three flat games, lesson visuals, i18n, iOS, billing.

**Needs external human testing:** whether onboarding and lesson 1 feel rewarding, whether story audio sounds right, and whether difficulty feels fair. Five to ten first-time players, observed.

**Needs a real Android device:**

- Google sign-in (browser flow and redirect)
- Session persistence and refresh
- Deletion
- Animations and audio
- 200% font
- TalkBack
- Low-end performance

**Needs a real iOS device (later):** everything above, plus Sign in with Apple, keychain behaviour and the iPad layout.

**Needs Supabase dashboard access:**

- Email sign-up toggle, redirect URLs, JWT expiry, rate limits / CAPTCHA
- Backups and PITR, project region (for the policy)
- Migrations, the function deploy, pg_cron
- Live nickname rules
- Whether a GOTW is scheduled this week

**Needs Play Console action:**

- Data Safety form
- Account-deletion URL
- Privacy-policy URL
- Content rating
- Target audience (13+)
- App-signing SHA-1 (only if the native sign-in path is enabled)
- Store listing copy consistent with "23 games, 22 lessons, Stories"
