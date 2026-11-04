# Tactiqo: Master Product Audit

*Audit date: 4 November 2026. Branch `main` at `d3e82c6`, plus **77 uncommitted changes** in the working tree (the game UX work from 31 October). Both were audited as they stand.*
*Scope: audit only. No source, schema, dependency or configuration file was changed. This report is the only file added. Running the web preview regenerated the git-ignored `.expo/types/router.d.ts`.*

---

## How to read this report

| Tag | Meaning |
|---|---|
| **[Run]** | Observed in this audit: test suite, typecheck, lint, scripted engine probes, or the running web app at 375 px. |
| **[Code]** | Read in the source and traced; not executed. |
| **[Prior]** | Taken from an earlier in-repo audit (`AUDIT_REPORT.md` 26 Oct, `LESSON_AUDIT.md`, `GAME_UX_AUDIT.md` / `GAME_UX_IMPLEMENTATION.md` 31 Oct), spot-checked against the current code but not fully re-run. |
| **[Judgement]** | A product or design opinion, not a measurement. |
| **[Not verified]** | Could not be established with the evidence available. |

### What was executed

- `npm test`: **1,181 tests in 222 suites, all passing** (61 s). This includes RLS and grant tests against the real migrations in PGlite. **[Run]**
- `npx tsc --noEmit` (after regenerating typed routes): **4 errors, all in `supabase/functions/text-to-speech/index.ts`**. This is the known baseline; nothing new. **[Run]**
- `npx expo lint`: no errors or warnings. **[Run]**
- Web preview at 375×812: onboarding played start to finish; Games, Profile and Learn read as rendered text; screenshots of onboarding and Games. **[Run]**
- Hand-derived checks of the payoff models and equilibria for Two-Thirds, Traveler's Dilemma, Inspector, Cooperation Game, Split or Steal, Stag Hunt, the Auction House and the onboarding dilemma, plus three lesson scenarios (lemons, value of information, rationalizability). **[Run/Code]**

### What was not executed (and why)

- **No native run on Android or iOS.** This machine has no Android SDK or device. Every UI statement below is from web at phone width, or from code.
- **No human play-testing.** Nobody outside the team has used the product. Every statement about engagement, fun or learning effect is a hypothesis.
- **Lessons were not played through in this pass.** Opening the app signs in anonymously, and lesson play writes progress to the **live** Supabase project. The prompt forbids mutating persistent data without permission, so lesson UX is assessed from code, content and the prior audits. One side effect did happen: starting the app created **one anonymous auth user** in the live project, which is the app's normal start-up behaviour.
- **Not every lesson's full text was re-read** (22 lessons, 66 scenarios, 15 challenges, 7 assessments). Mathematical accuracy is backed by solver tests that check every calculable answer key, plus targeted spot checks; see §3. A full copy read is listed as an outstanding inspection in §13.
- **Competitor facts** come from a small number of public sources (cited in §11), not hands-on use.

---

## 1. Executive summary

### Verdict in one paragraph

Tactiqo is **far beyond an MVP in content and engineering, and well short of a commercial product in business infrastructure.** The learning content (22 lessons, 66 scenarios) and the game library (23 games) are unusually rigorous. Engines are pure and tested, the maths is verified, and the copy is honest about opponents and uncertainty. However, the product **cannot yet earn ₹200/month**, for three reasons:

1. It has **no payment, analytics, account recovery, notifications, privacy policy or support surface**.
2. Its **live retention surfaces are empty today**: there is no Daily Challenge and no Game of the Week.
3. Its **only identity is an anonymous device session**, so a reinstall or a new phone loses everything a subscriber paid to build.

The strategic profile is careful and honest, but it measures **lesson answer accuracy only**. It ignores all gameplay, which is most of what a user does.

### Readiness

| Area | Readiness | One-line reason |
|---|---|---|
| Learning content | **Strong** | 22 lessons, all on one predict → decide → compare → transfer structure; answer keys checked by solvers |
| Game mechanics | **Strong** | 23 engines, seeded and pure, 1,181 tests; a few dominant strategies remain (§4) |
| Game depth and replay | **Uneven** | About a third of the games are deep; several have exploitable fixed strategies or are one idea long |
| Strategic profile | **Honest but narrow** | Rigorous evidence thresholds, but games don't feed it |
| UX/visual polish | **Good on web** | Consistent tokens and brand palette; never seen on a real device |
| Accounts and data safety | **Not launch-ready** | Anonymous only, no recovery, no cross-device use |
| Trust and legal | **Not launch-ready** | No privacy policy, terms, support, about or version screen |
| Analytics | **Absent** | Zero events; no way to answer any question in Part 9 |
| Monetization | **Absent** | No paywall, entitlement, billing or plan model |
| Release engineering | **Partial** | `eas.json` exists; never built for or run on a device in any recorded audit; 77 files uncommitted |

### Strongest areas

1. **Correctness discipline.** Rules live in pure TypeScript with solvers. The SQL ports of the classic engines are tested against the TS ones. Content can't load unless every engine, version and answer key validates (`src/content/build.ts`).
2. **Honesty as a design principle.** Opponents are described as fixed or personality-driven, never as "AI". Guesses about unknowable things are never graded as misconceptions. Reflections never invent behaviour or leak hidden roles (enforced by tests).
3. **The lesson design.** Every lesson has a concrete stake, a locked prediction with confidence, a comparison of the options not taken, a changed assumption, and a transfer case that doesn't name the concept.
4. **Data architecture.** Idempotent outbox, RLS owner-only policies tested against real migrations, server-authoritative competitive matches, and no seed ever returned to clients.

### Weakest areas

1. **Business plumbing is missing**: payments, analytics, accounts, legal and notifications.
2. **Live-ops dependency**: the Daily Challenge and Game of the Week need hand-written SQL to publish. Today both are empty in the live app.
3. **The profile ignores games**: 18 of 23 games keep results only on the device, and those results never reach the profile.
4. **Release risk**: no device run, no E2E test, and a large uncommitted change set.

### Biggest risks

- **Subscriber data loss** from anonymous-only identity. This is the main source of refund and churn risk once payment exists.
- **Launching with empty "daily" surfaces.** These are the features that create a reason to return.
- **Store rejection or a policy problem** from the missing privacy policy and Data Safety disclosures, and from misleading on-screen copy about where data lives (§10).
- **Unknown native behaviour**: Reanimated reveals, SVG markers, haptics and audio on low-end Android.

### Biggest opportunities

- **A Strategic Profile built from play.** Cooperation, retaliation, risk and bluff-calling are directly observable in the match records the reflection system already reads. No competitor has this.
- **Lesson → game → reflection → lesson loops.** The links mostly exist already; they need to become a guided path.
- **Daily content generated from the existing engines and scenario library** (seeded variants) instead of hand-written SQL.

---

## 2. Complete feature inventory

Status key: ✅ complete · 🟡 implemented, needs improvement · 🟠 partial · ⬜ placeholder/UI-only · ❌ missing · 🔴 broken/inconsistent · ❔ not verifiable here.

### 2.1 Application map **[Code, Run]**

```
First launch ──► /onboarding (Welcome → Share-or-take vs Maya → Reveal → "Learn / Play / Explore" → recommended lesson)
                    │ (skip or finish sets settings.onboarded, stored locally)
                    ▼
Tabs: Learn ─────────────── Games ──────────────── Stories ─────────── Profile
  │ resume/suggested          │ Game of the Week       │ The Crossing      │ Learning progress → /report
  │ Daily challenge → /daily  │ This week / Global /   │ Meridian          │   /report/[skill], /report/history
  │   /daily/play             │   Hall of Fame →       │ → /story/[id]     │ Growth observation
  │ Practice → /challenges    │   /leaderboard         │                   │ Recommended next + goal
  │   /challenges/[lessonId]  │ 23 games in 6 groups   │                   │ Four skill areas
  │ 22 lessons, 6 modules,    │   classic → /games/[id] → /games/play     │ Game record (server games only)
  │   categories filter       │   arena → /arena/[id] → /arena/play       │
  │   /lesson/[id]            │ Nickname → /nickname                       │
  │   /scenario/[id]          │ Friend challenge → /challenge/[token]      │
  │ Checkpoints / final       │                                            │
  │   /checkpoint/[id]        │                                            │
  └─ Settings (modal from Learn, Games, Profile): profile, goal, narration, motion, haptics, export, reset,
     sync status, progress link, replay intro, delete account
```

### 2.2 Inventory

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Routing (Expo Router, typed routes) | ✅ | `app/`, 28 route files | Routes live in `app/`, not `src/app/` as AGENTS.md says |
| Onboarding | ✅ | `app/onboarding.tsx`, `src/features/onboarding/` | Played end to end **[Run]**. See §7.5 |
| 22 lessons (5 hand-built + 17 curriculum runner) | ✅ | `supabase/seed/content.json`, `src/features/lessons/` | Content loaded from Supabase |
| 66 practice scenarios | ✅ | `src/features/scenarios/` | Each lesson has slots A/B/C |
| 15 practice challenges, 7 assessments | ✅ | content.json | Checkpoints per module plus a final |
| Daily Challenge | 🔴 **live content empty** | `app/daily.tsx`, `supabase/daily/examples.sql` (3 examples) | "No challenge today" in the running app **[Run]**. Publishing is manual SQL |
| Game of the Week, weekly and global boards, Hall of Fame | 🔴 **live content empty** | `supabase/games/schedule.sql`, `app/leaderboard.tsx` | "No competition this week" **[Run]** |
| 5 classic games (server-capable) | ✅ | `src/games/` + SQL ports | Practice runs on the device; competition and challenges run on the server |
| 18 Arena games (device only) | 🟡 | `src/arena/` | Records only in AsyncStorage |
| Friend challenges via link | 🟡 | `app/challenge/[token].tsx` | Not exercised **[Not verified]** |
| Opponent read / guess the personality | ✅ | `src/games/read-rules.ts`, `ReadCard` | One read per match, locked when made |
| Repeat play (auto-play a strategy) | ✅ | `src/repeat/` | Tested |
| Post-game reflections | ✅ (4 games lack a lesson link) | `src/reflections/` | §6 |
| Stories (2 interactive narratives with audio) | 🟡 | `src/stories/`, `app/story/[storyId].tsx` | Audio never heard by a human (see memory/`STORY_AUDIO_ASSETS.md`) |
| Narration (pre-generated TTS) | 🟡 | `assets/audio/` (505 MP3s, 22 MB) | Device playback not verified |
| Strategic Thinking Profile and report | 🟡 | `src/features/learning/` | Lesson answers only (§5) |
| Learning goal | ✅ | Settings and Profile | |
| Progress sync (outbox) | ✅ | `src/data/outbox.ts`, `changes.ts` | Idempotent, with retries |
| Offline use | ❌ | `src/data/session.ts` startup | Online-first: nothing loads without a network, not even the device-only games |
| Account identity | 🟠 | Anonymous Supabase user only | No email/OAuth, recovery or cross-device use |
| Account deletion | 🟡 | `delete_my_account()` | Server side complete; device leftovers (§10) |
| Data export | ✅ | Settings → Export data | |
| Progress reset | ✅ | Settings | |
| Nickname | 🟡 | `set_nickname` | Character and reserved-word rules; no profanity filter; "tactiqo" not reserved |
| Settings: narration, reduce motion, haptics | ✅ | `app/settings.tsx` | |
| Sound effects or music toggle (separate from narration) | ❌ | | |
| Notifications and reminders | ❌ | No `expo-notifications` | |
| Streaks | 🟠 | `completionSummary()` counts a daily streak | Daily only, and no daily content is live |
| Achievements, badges, mastery | ❌ | | |
| Help, FAQ, contact, bug report, feedback | ❌ | | |
| Privacy policy, terms, about, version, licences | ❌ | Nothing in Settings | **Launch blocker** |
| Analytics | ❌ | No provider and no event code | |
| Crash reporting | ❌ | Expo Router `ErrorBoundary` only | |
| Subscription and paywall | ❌ | | |
| Localization | ⬜ | `i18next`, `react-i18next`, `expo-localization` installed, **never imported** | English only |
| Theme choice | ⬜ | `userInterfaceStyle: "dark"` only | Deliberate, and fine |
| EAS configuration | 🟡 | `eas.json` (dev/preview/production) | No recorded build |
| TTS edge function | ⬜ dead code | `supabase/functions/text-to-speech/index.ts` is the Supabase "Hello" template, with `verify_jwt = false` | Source of the 4 tsc errors |

**Unused dependencies [Run]:** `nativewind`, `tailwindcss`, `i18next`, `react-i18next`, `expo-symbols`, `expo-web-browser` and `expo-localization` (plugin only) have zero imports in `src/` or `app/`.

**Duplication [Code]:** the game library has two systems: *classic* (`src/games`, `app/games/*`, server-capable) and *Arena* (`src/arena`, `app/arena/*`, device only). They now share UI (`src/components/game/`) but differ in persistence, records and profile visibility. There are also two Ultimatum games (classic 10-coin; Arena with outside options), kept on purpose. Two panel components (`parts.Panel` and `kit.Panel`) remain.

**Naming debt [Code]:** the lesson id `strategy-detective` is titled *Reasoning from Beliefs*, while *Strategy Detective* is the title of `iterated-dominance`. This is invisible to users but a trap for maintainers and for analytics naming.

---

## 3. Lesson-by-lesson report

### 3.1 What every lesson shares **[Code, Prior]**

All 22 lessons follow the same structure:

- an introduction or lab
- three scenarios: A is the core concept, B changes one assumption, C is a transfer case that doesn't name the concept
- a locked prediction with a 1–5 confidence rating
- graded verdicts (`match`, `defensible`, `depends`, `misconception`)
- a "Compare your options" card in 39 scenarios that shows what the alternatives would have paid (expected values when the scenario is random)
- a usable takeaway

The five original lessons are hand-built with narration. The other 17 run through the curriculum runner with labs: sliders, matrices, trees and guess-before-reveal cards.

**Accuracy safeguards [Run]:** every calculable prediction has a solver, and `content:validate` plus the tests check that the content's `match` option equals the solver's answer. Transfer questions must have exactly one strong answer. This is unusually strong protection against wrong answer keys.

**Spot checks in this audit [Run]:**

- **L18.C lemons:** at price *p* the average quality is (10+p)/2, worth 0.75(10+p). This is non-negative up to *p* = 30, so the key "30" is correct for the question asked (highest price that doesn't lose money).
- **L15.B value of information:** 2.56 − 2 = 0.56, which is less than the cost of 1, so the key "not worth it" is correct.
- **L14.B rationalizability:** B (payoff 1) is below max(3p, 3−3p) ≥ 1.5, so B is never a best response. Correct.

### 3.2 Accuracy concerns found

| # | Where | Issue | Severity | Proposed correction |
|---|---|---|---|---|
| A1 | L15.B (`l15.b.buy-information`), feedback on "more information is always better" | "Free information never hurts" is true for a **single decision-maker** (Blackwell), but false in strategic settings: information others know you hold can hurt you. A lesson series about strategy shouldn't state it unqualified. | Low–Medium | "For a single decision, free information never hurts — in games, being known to hold information can. Costly information is worth buying only if…" |
| A2 | L18.C explanation | "the average car on offer is always worse than the price suggests" generalizes this model's uniform-quality, 1.5× valuation assumptions. | Low | Add "in this market" or "when sellers know more than buyers", and keep the second sentence about signals and warranties. |
| A3 | Absolute phrasings in options ("commitment always wins Chicken", "repetition always sustains cooperation") | Checked: these are **wrong options** graded as misconceptions, which is appropriate. | — | None |

No incorrect answer key was found. **[Run]** for the three scenarios above; the remaining scenarios rely on the solver tests.

### 3.3 Lesson audit table

Scores are 1–10 **[Judgement]**. They draw on the content structure, the prior lesson audit's per-lesson findings, and the spot checks. **Engagement and replayability are hypotheses until users are tested.**

- **Accuracy** reflects the solver checks plus the issues above.
- **Interactivity** reflects the number and type of decisions and labs.
- **Replayability** reflects whether a replay gives new information. Most scenarios are seeded, so a replay of the same run is identical; randomness only enters where the model has it.

| # | Lesson | Accuracy | Depth | Interactivity | Engagement | Replayability | Main weakness | Recommended improvement |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | The Cooperation Trap | 9 | 8 | 8 | 8 | 4 | Rohan always cuts, so a replay teaches nothing new | Add a second rival rule on replay ("Rohan this time copies you") |
| 2 | Strategy Detective (dominance) | 9 | 8 | 8 | 7 | 4 | Matrix answers are fixed | Generate a fresh payoff table on replay |
| 3 | Finding the Best Move (Nash) | 9 | 8 | 7 | 6 | 4 | 3×3 matrices are dense on phones | Tap-to-mark best replies directly on the matrix |
| 4 | The Coordination Problem | 9 | 8 | 8 | 8 | 5 | Focal-point transfer depends on culture | Add a "what would your friends pick" prediction |
| 5 | The Predictability Trap | 9 | 9 | 9 | 8 | 6 | — (mix simulator is strong) | Link straight to an RPS match against the counter bot |
| 6 | Competing for Advantage (Cournot/Bertrand) | 9 | 8 | 8 | 6 | 5 | Abstract business framing | Tie to The Market Rivals game; make the rival adapt |
| 7 | Rules of Evolution (ESS) | 9 | 8 | 8 | 7 | 6 | Population dynamics shown as end states | Animate the population over time |
| 8 | Move First, Win More | 9 | 8 | 7 | 7 | 4 | Centipede is told more than played | Let the learner play the centipede against a bot |
| 9 | Threats and Credibility | 9 | 8 | 7 | 7 | 4 | C was rebuilt (v2); not yet user-tested | Watch completion of 9.C closely after launch |
| 10 | Incentives and Hidden Actions | 9 | 9 | 9 | 7 | 5 | 10-minute length | Split the lab from the scenarios |
| 11 | Bargaining and Fairness | 9 | 8 | 7 | 8 | 5 | Fairness norms vary by culture | Add a note on cross-cultural ultimatum results |
| 12 | The Cost of Waiting | 9 | 7 | 7 | 6 | 5 | Concept less familiar; all-pay is abstract | Concrete Indian example (tender bidding, queues) |
| 13 | Cooperation Over Time | 9 | 9 | 7 | 8 | 6 | Explorer deliberately off | Point to The Cooperation Game, noisy variant |
| 14 | Reasoning from Beliefs | 9 | 8 | 8 | 8 | 6 | Id says `strategy-detective` | Fix the id/title mismatch internally |
| 15 | Decisions Under Uncertainty | 8 | 8 | 7 | 6 | 5 | A1 wording; probability-heavy | A1 fix; add a frequency (icon-array) visual |
| 16 | Signals and Secrets | 9 | 8 | 7 | 7 | 5 | — | Link to The Hidden Signal and Bluff |
| 17 | Winning the Auction | 9 | 9 | 8 | 8 | 6 | — | Link to The Auction House; show the winner's curse as a distribution |
| 18 | Market Quality (lemons) | 8 | 8 | 7 | 6 | 5 | A2 wording | A2 fix |
| 19 | Coalitions and Power | 9 | 8 | 7 | 6 | 4 | Allocation steps are abstract | Seat-chart visual, as in The Coalition game |
| 20 | The Politics of Voting | 9 | 8 | 8 | 7 | 5 | Agenda-setting is counter-intuitive | Let the learner choose the agenda and see the winner change |
| 21 | Brinkmanship | 9 | 8 | 7 | 7 | 5 | — | Play "chicken" against a bot |
| 22 | Strategic Thinking in Practice | 9 | 7 | 7 | 6 | 4 | Synthesis checklist feels like a worksheet | Make it a branching case with consequences |

**Cross-cutting lesson gaps:**

- **L1 — no spaced retrieval.** Nothing brings a concept back days later. The profile records first attempts, but nothing schedules a review. **[Code]**
- **L2 — deterministic replay.** Replay repeats the same run, so the "experiment" value of replaying is low except where the model is random. **[Prior, Code]**
- **L3 — rigid lesson length.** Lessons take 8–10 minutes. With no "short session" path, there is no 2-minute daily habit unit other than the Daily Challenge, which is currently empty. **[Judgement]**

### 3.4 Lesson ↔ game ecosystem **[Code]**

- **Game → lesson:** reflections link 21 of 23 games to a lesson. Defusal and Gambit have none. Power Play → `credibility` and Last Stand → `coordination-problem` are linked in `src/reflections/library.ts`, but `REFLECTIONS.md` still lists them as unlinked (stale doc).
- **Lesson → game:** a lesson never recommends a game. The loop is one-directional.
- **Unmatched pairs:** RPS ↔ L5, Auction ↔ L17, Market ↔ L6, Commons ↔ L1, Coop Game ↔ L13 and Signal ↔ L16 are natural pairs, but only the game side links.
- **Recommendation:** add "Try it against an opponent" to each lesson's completion screen, and "Go deeper" from each game's setup screen to its lesson. This is the cheapest high-value improvement to the product's coherence.

---

## 4. Game-by-game report

### 4.1 Inventory

**There are 23 games, not 22**: 5 classic (`src/games`) and 18 Arena (`src/arena`). "The Ultimatum" (classic) and "The Ultimatum Game" (Arena) both exist. All 22 names in the brief are implemented.

| Property | Classic (5) | Arena (18) |
|---|---|---|
| Opponents | 4 per game, game-specific | 4 per game. **Auction, Market, Hidden Signal and Ultimatum Game reuse the generic Investor / Banker / Deal Maker / Opportunist**; the other 14 have game-specific personas |
| Difficulty | Easy / Normal / Hard | Easy / Normal / Hard |
| Variants | none | 1–3 (11 games have more than one) |
| Lengths | fixed rounds | short / medium / long |
| Randomness | counter-based seeded draws | same (`draw(seed, round, k)`), so it is reproducible and testable |
| Persistence | server (competition, challenges); practice results go to the server | **device only** (`tactiqo/arena-records/v1`) |
| In the Profile | yes (game record card) | **no** |

### 4.2 Mechanical correctness

Independent derivations in this audit **[Run/Code]**:

- **Two-Thirds:** target = ⅔ × mean of all 9 picks, including the player. Distance is compared as an exact integer (`|27p − 2Σ|`), so there is no float tie error. A shared win scores 5, a solo win 10, plus up to 10 closeness points. ✅
- **Traveler's Dilemma:** with a < b, the payouts are (a + R, a − R); equal claims pay the claim. R = 2 or 5. ✅ This is Basu's model.
- **Inspector:** the operator is indifferent at p = (5−2)/(5+4) = ⅓ inspections; the inspector is indifferent at q = 2/(4+3) = 2/7 cheating. The code's `equilibrium()` matches. ✅
- **Cooperation Game:** classic T5 R3 P1 S0; high-stakes T8 R5 P1 S−2. Both satisfy T > R > P > S and 2R > T + S. ✅ The noisy variant flips each side's move independently with p = 0.1.
- **Split or Steal:** 8 > 5 > 1 > 0 and 10 > 8, so this is a valid Prisoner's Dilemma. ✅ **Stag Hunt:** 5 / 3 / 0, with a break-even belief of 0.6. ✅
- **Auction House:** first price; the winner pays its bid and earns V − bid, which can be negative; seeded tie-break. ✅
- **Commons:** logistic regrowth ⌊g·L·(1 − L/C)⌋, with collapse below a threshold. ✅ Market: logit demand with an outside option at price 14; profit = units × (p − c). ✅
- **Onboarding dilemma:** 3/3, 0/5, 5/0, 1/1. Maya's move takes no input, so it can't see the player's choice. ✅

**Defects fixed in the uncommitted work [Prior]:**

- The Gambit could get stuck; it now uses a skip-turn rule.
- Defusal dealt clues that every arrangement satisfies; those are no longer dealt.
- Two-Thirds leaked the crowd's type through the display.

All are covered by tests that pass **[Run]**. **They are not committed**; see P0-5.

**Open rule-level problems (no decision made yet) [Prior, re-checked in the code]:**

| Game | Problem | Evidence |
|---|---|---|
| The Market Rivals | **A fixed price of 10 wins 91–96% at every level.** The win rule is "most profit". A dominant fixed strategy makes it shallow | `docs/game-ux-audit/balance-v2-*.txt` |
| Bluff | Always calling beats the Risk Taker about 95% of the time | Same |
| The Last Stand | Doing nothing on Easy holds 100% of the time | Same |
| The Hidden Signal | "Always pitch" is close to optimal, because a pitch costs nothing | Same; arguably correct game theory, but it makes play dull |
| The Mole | Difficulty doesn't change the evidence; exact reasoning wins 75% at all levels | Same |
| The Coalition | Hard isn't measurably harder | Same |

### 4.3 Bot intelligence

- **No cheating [Code, Run]:** opponents decide from history, not from the player's unsubmitted move. In the classic games, bot moves are computed from `history`. The onboarding Maya takes no arguments. Server matches never return the seed (RLS test passing). Hidden roles (Mole, Saboteur) never enter reflections; tests move the hidden player to another seat and require an identical reflection.
- **Difficulty is about decision quality, not multipliers [Code]:** for example, Liar's Dice Normal and Hard read the faces you bid, and Inspector Hard adapts after an unseen violation. The Coalition and The Mole are the exceptions, where difficulty barely matters.
- **Persona distinctness:** strong in the game-specific sets. It is weakest in the four games that reuse the generic financial personas, where "The Investor" in a pricing game and "The Investor" in a signalling game have no thematic reason to exist. **[Judgement]**
- **Not built:** cross-match learning (an opponent remembers you). It is reasonable to leave this for now.

### 4.4 Individual game scores

Scores are out of 10. **Mechanical correctness** is the only measured column (tests and derivations). The rest are **[Judgement]** informed by the prior audit's scorecard, the balance simulations and code reading. None reflects human play. *Overall* is not an average: it weights depth and replay for a paid product.

| # | Game | Mech. | Depth | Replay | Bots | UX | Edu. | Overall | Highest-value improvement |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Split or Steal | 10 | 5 | 5 | 7 | 7 | 7 | **6** | End-of-match "what if you'd mirrored them" comparison; variable horizon so the last-round steal isn't certain |
| 2 | Rock, Paper, Scissors | 10 | 6 | 7 | 8 | 7 | 8 | **7** | Show the pattern the counter bot exploited, after the match |
| 3 | Two-Thirds Guess | 10 | 7 | 7 | 7 | 7 | 9 | **7** | Mixed crowds (some deep, some shallow) as a variant |
| 4a | The Ultimatum (classic) | 10 | 5 | 5 | 6 | 7 | 7 | **5** | Merge into 4b as its "quick" mode, or drop from the main library |
| 4b | The Ultimatum Game | 10 | 7 | 7 | 7 | 7 | 8 | **7** | Game-specific personas instead of generic financial ones |
| 5 | Stag Hunt | 10 | 4 | 4 | 6 | 7 | 7 | **5** | Add a three-hunter variant, or noise in the signals; it's one idea long |
| 6 | The Cooperation Game | 10 | 8 | 8 | 8 | 8 | 9 | **8** | Already flagship quality; add a tournament mode against all four personas |
| 7 | The Auction House | 10 | 8 | 7 | 7 | 7 | 9 | **8** | Second-price variant to teach the contrast with L17 |
| 8 | The Market Rivals | 10 | 4 | 5 | 5 | 6 | 7 | **5** | **Decide the win rule**: a fixed price of 10 dominates |
| 9 | The Hidden Signal | 10 | 5 | 6 | 6 | 6 | 8 | **6** | A pitch cost, or bots that punish unbacked pitches |
| 10 | The Mole | 10 | 6 | 6 | 5 | 7 | 8 | **6** | Weaker evidence on Hard (decision pending) |
| 11 | The Commons | 10 | 7 | 7 | 7 | 7 | 9 | **7** | Communication rounds (cheap talk) as a variant |
| 12 | The Coalition | 10 | 7 | 6 | 5 | 6 | 8 | **6** | Make Hard bots demand more and defect from weak deals |
| 13 | The Inspector | 10 | 7 | 7 | 7 | 7 | 9 | **7** | Show the equilibrium only after the match (it does), plus a "you vs equilibrium" chart |
| 14 | The Traveler's Dilemma | 10 | 7 | 6 | 7 | 7 | 9 | **7** | Fine as is; consider a randomized bonus |
| 15 | The Saboteur | 10 | 7 | 7 | 7 | 6 | 7 | **7** | Track suspicion visually across missions |
| 16 | Bluff | 10 | 6 | 7 | 5 | 7 | 7 | **6** | Fix "always call" against the Risk Taker |
| 17 | The Defusal | 10 | 7 | 7 | 6 | 6 | 5 | **6** | Lesson link (deduction), or present it as a pure puzzle |
| 18 | The Power Play | 10 | 7 | 7 | 7 | 6 | 6 | **7** | Clarify "Turn 1 of 12" (games end earlier) |
| 19 | The Last Stand | 10 | 7 | 7 | 6 | 7 | 6 | **7** | Easy shouldn't be passively winnable |
| 20 | Liar's Dice | 10 | 8 | 8 | 8 | 7 | 8 | **8** | Already strong after the bot fix |
| 21 | The Codebreaker | 10 | 7 | 7 | 6 | 7 | 6 | **6** | Word-association clue game: differentiate the theme and visuals |
| 22 | The Gambit | 10 | 8 | 8 | 7 | 8 | 6 | **7** | Lesson link (expected value vs outcome); "good decision vs lucky" debrief |

**Too shallow or repetitive for a paid library as they stand:** Stag Hunt, The Ultimatum (classic), The Market Rivals (dominant strategy), and The Hidden Signal (near-dominant strategy). Split or Steal is borderline: it's the canonical PD and worth keeping, but it needs a twist.

**Name and IP note [Judgement]:** most games use public-domain or academic structures (Liar's Dice, Bluff, PD, Ultimatum). The Codebreaker's mechanics resemble a well-known commercial party word game. Mechanics similarity is generally fine, but keep its name, terminology (e.g. no "spymaster"/"assassin") and visuals clearly your own.

### 4.5 Library experience **[Run, Code]**

- **Works:** six strategy groups with a filter row; each card has a question-style hook ("When is a confident claim worth challenging?"); every game appears exactly once (tested).
- **Missing on cards:** estimated duration, difficulty, how many times played, best result, and "new" or "recommended" markers. A first-time user facing 23 games gets no "start here".
- **Copy inconsistency:** the header reads "23 strategic games against **bots** with personalities", while the in-game vocabulary was changed to "opponent".
- **Recommendation:** a "Start here" row (3 games, chosen by the user's completed lessons), plus duration chips. Don't add more navigation.

---

## 5. Strategic profile and personal report

### 5.1 What it is **[Code, Run]**

- **Data source:** *calculable first attempts* at lesson, scenario, challenge and assessment questions, plus qualifying Daily Challenge answers. Retries, replays and unknowable-outcome guesses never count (`evidence-policy.ts`).
- **Dimensions:** four skill areas (anticipating others, incentives, coordination, uncertain outcomes), plus confidence calibration, learning after feedback, transfer and trend.
- **Evidence ladder:** `none → activity → tentative (≥2) → established (≥5)`; percentages only from 10 answers; trends need two 28-day windows with 5 or more answers each; a change is described only at a gap of 20–25 points or more. These are well-reasoned thresholds.
- **Stored:** never. It is recomputed on the device from the learning record.
- **Empty state [Run]:** "Getting started · 0 / 22 lessons · Recommended next: The Cooperation Trap · Areas: Not explored yet". This is clear and honest.

### 5.2 Assessment

| Requirement from the brief | Status |
|---|---|
| Evidence behind each insight | ✅ answers are listed per area |
| Reasonable sample sizes | ✅ explicit thresholds |
| Uncertainty indicated | ✅ the tentative and established wording |
| Observed vs inferred distinguished | ✅ "a description of answers, not of ability" |
| Cooperation, risk, negotiation, adaptation, bluff-calling tendencies | ❌ **not measured at all.** Games are kept out "on purpose" |
| Game behaviour in the profile | ❌ only the server game record card (points, weeks); the 18 Arena games are invisible |
| History over time | 🟡 trend and series charts exist, but need weeks of data |

**Verdict:** the profile is **meaningful and trustworthy, but it is a quiz-accuracy report, not a "strategic profile".** The product promise ("how you approach decisions") is carried by the games, and none of that reaches the profile.

### 5.3 Recommendation: a behaviour layer built from play

Add a second, clearly labelled section, "How you play", with each tendency computed from **many matches across several games**. Use the same evidence ladder (e.g. tentative from 3 matches in 2 or more games):

| Tendency | Observable from existing records |
|---|---|
| Opens cooperatively | First move in Split or Steal, Cooperation Game, Stag Hunt |
| Forgives after a betrayal | Cooperation after a delivered defection (reflection rule `coop-after-defection` already detects it) |
| Calls claims | Challenge rate in Bluff, Liar's Dice, Power Play |
| Risk appetite | Gambit risky moves; Last Stand; auction bids relative to estimate |
| Fairness in offers | Ultimatum offer share |
| Reads opponents | Read accuracy (already stored in Arena records) |

Constraints:

- **Describe behaviour; don't diagnose personality.** "You opened cooperatively in 9 of 11 matches", not "You are a trusting person".
- Hidden information stays out, as the reflections already guarantee.
- **Prerequisite:** move Arena match summaries to the server (P1-7), or compute this layer on the device only.

---

## 6. Post-game reflection

**Coverage [Code, Run tests]:** all 23 games have 4–6 evidence-based rules plus a general fallback (`src/reflections/registry.ts`). Selection is deterministic, with session-only rotation. Tests run 7,400+ real matches and check that every rule fires in real play.

The brief's requirements:

| Requirement | Status |
|---|---|
| Based on actual match events | ✅ `when(record)` returns the evidence; with no evidence, the general fallback is used |
| Hidden roles and private info protected | ✅ test-enforced invariance under moving the hidden player |
| No optimal moves or bot formulas | ✅ banned-word test ("optimal", "best move", "should have", "mistake", "bot", "policy") |
| Concise | ✅ ≤ 2 sentences, ≤ 240 characters, one question |
| Results-screen hierarchy (result → thought → explore → replay) | ✅ after the uncommitted Phase 5 reorder |
| Lesson links | 🟡 21/23. **Missing: Defusal, Gambit** (checked in `src/reflections/library.ts`). `REFLECTIONS.md` is stale: it still lists Power Play and Last Stand as unlinked |
| No contradictory replays | 🟡 recency resets on app restart, so a returning user can see the same thought twice in a row. Harmless, but slightly undermines the "personal" feel |

**Gap:** reflections are per match only. No reflection ever says "across your last five matches…". That is the bridge to §5.3.

---

## 7. UX/UI report

### 7.1 Visual identity **[Code, Run]**

- **Brand palette:** `src/theme/tokens.ts` defines the exact brand palette (#081220, #0F2A44, #2563EB, #F97316, #FDBA74, #94A3B8, #E2E8F0, #22D3EE) with semantic roles: blue = you, orange = rival, amber = insight, cyan = secondary.
- **Consistency:** Inter throughout, and a single spacing and radius scale.
- **What the screenshots show:** onboarding, the decision and reveal screens, and the Games tab look coherent, calm and premium-leaning. The vector cast, scene art and game glyphs are distinctive.
- **Contrast:** `textFaint` (#64748B) is about 3.1–3.9:1 on the surfaces, below WCAG AA for small text, and is used in 56 places **[Prior; count Run]**. Lift it to about #8A99AE, or restrict it to ≥ 18 px text.

### 7.2 Navigation

- **Tabs:** Learn, Games, Stories, Profile; Settings is a modal reachable from three tabs.
- **Model mismatch [Run]:** onboarding introduces **Learn / Play / Explore**, where "Explore" means the 66 scenarios inside Learn. It never mentions **Stories**, which has its own tab. A new user's mental model doesn't match the tab bar. Either align the onboarding cards with the tabs, or make "Explore" the Stories tab.
- **Leaving a match:** `LeaveGuard` covers Android Back for active matches. Arena and practice matches are lost on reload; there is no match recovery (stated, accepted earlier).
- **Learn tab length:** the Learn home is long, with all modules expanded. The category filter helps.

### 7.3 Mobile responsiveness **[Prior Run at 360/320, Run at 375]**

The prior pass measured every game at 360×640: all primary actions are within the first screen, and there's no horizontal overflow at 320 in the six games checked. This audit saw no overflow at 375. **Not checked:** 430 px, landscape (portrait is locked, which is fine), font scaling at 200%, and keyboard overlap on the nickname screen on a real device.

### 7.4 Animation

- **Reduced motion:** a shared reveal system (`useRevealStep`, `CountUp`, `SealedPair`) shows everything at once when reduced motion is on (tested).
- **Weakness:** on web, entering animations make screens briefly blank, and the Games tab rendered a blank band before the cards appeared **[Run]**. Check native frame timing on a low-end Android device.

### 7.5 Onboarding **[Run]**

| Step in the brief | Observed |
|---|---|
| Welcome and curiosity | "Think beyond the obvious." One action, plus "Skip to the app" |
| First meaningful decision | Share or take against Maya, with all four outcomes shown, a sealed choice and an explicit lock |
| Outcome and discovery | Correct numbers. "Why did Maya take? Taking pays her more whatever you do". "Go deeper" is optional |
| Learn / Play / Explore | Shown, built from the live catalogue counts (22 / 23 / 66) |
| Recommended next action | One lesson, or "Explore on my own" |
| Skippable; not repeated | ✅ local `onboarded` flag; replayable from Settings |
| No forced registration | ✅ anonymous |
| No unsupported personal judgement | ✅ "That's one of the ideas behind strategic thinking", not "you are too trusting" |

**Issues:**

1. Maya always takes, so every sharer's first experience is "you got 0". That is pedagogically correct, but the emotional first beat is a loss. A/B test framing it as "most people share here — here's why that's risky", **only once analytics exist**.
2. The Stories omission noted in §7.2.
3. Onboarding needs the network: the catalogue must load first.

---

## 8. Settings and account report

### Present **[Code]**

Profile (nickname, edit), learning goal, narration, reduce motion, haptics, export data, reset progress, sync status, a link to progress, replay intro, and delete account with confirmation and error handling.

### Missing, with priority

| Missing | Why it matters | Priority |
|---|---|---|
| Privacy policy, terms of service | Play Store and App Store require a privacy policy for apps that collect data (this app stores answers and a nickname on a server); expected by Indian users under the DPDP Act | **P0** |
| About, app version, open-source licences | Support and debugging; licence attribution for bundled fonts and assets | P1 |
| Contact support, report a bug, send feedback | No route from user to team; critical in the first 90 days | **P1** |
| Account linking (email, Google, Apple) | Without it, paid progress is lost on a new phone (§10) | **P0 before charging** |
| Sign out / switch account | Only meaningful after linking | P2 |
| Notifications and reminder time | Retention lever (§12) | P2 |
| Sound effects toggle separate from narration | Story music and SFX vs voice | P3 |
| Language | Infrastructure installed but unused; Hindi could matter for the Indian market, but content volume is large | P3 |

**Copy defect (P1):** the Account section says *"Your account is anonymous and kept on this device."* Progress, answers, Daily history and nickname are stored in **Supabase**, as the deletion dialog itself says. Change it to: "Your account is anonymous. Your progress is saved to our server and linked to this install."

---

## 9. Analytics architecture

### 9.1 Existing infrastructure **[Run]**

**There is none.** There is no PostHog, Firebase, Amplitude, Sentry or custom event table. A search for analytics or tracking calls in `src/` and `app/` finds only test helpers. `ONBOARDING.md` itself notes this. However, Supabase already holds **behavioural ground truth** that can answer some questions with SQL and no client change:

- `learning_attempts` (timestamped, per item)
- `lesson_progress`, `scenario_completions`, `assessment_runs`
- `daily_challenge_attempts`, `game_matches`, `game_practice_results`, `competition_results`
- `auth.users.created_at` / `last_sign_in_at` for anonymous users

**What it cannot answer:** screen views, abandonment points inside a lesson, Arena play (device-only), session counts, onboarding drop-off, and anything about the paywall.

### 9.2 Recommendation: the minimal reliable stack

**Option A (recommended to start): first-party events in Supabase.**

- Add an `analytics_events` table: `id`, `user_id`, `install_id`, `name`, `props jsonb`, `client_ts`, `server_ts`, `app_version`, `content_version`.
- Insert-only RLS (`user_id = auth.uid()`), with no select for clients.
- Send through the **existing outbox**, which already gives idempotency, offline queueing and retries.
- No new vendor, no third-party data transfer, and cost included in the current plan.
- Dashboards: Supabase SQL plus Metabase or Grafana (free), or a scheduled export.

**Option B (later, if product analytics UI is needed): PostHog** (EU or US cloud, free tier, React Native SDK). Evaluate it on privacy disclosure and cost when monthly active users exceed about 10k. Don't add both at launch.

**Rules:**

- Never send hidden game information (bot persona before reveal, unrevealed cards or dice, roles, seeds), raw free text, or payment data.
- Persona ids are sent **only after the reveal**.
- Respect a consent toggle in Settings.

### 9.3 Event taxonomy (priority-ordered)

| Tier | Events | Key props |
|---|---|---|
| **Launch** | `app_opened` (with `is_first_open`), `session_started` | app_version, platform, install_id |
| Launch | `onboarding_started`, `onboarding_step_completed`, `onboarding_completed`, `onboarding_skipped`, `first_decision_made` | step, choice (share/take: not sensitive), duration_ms |
| Launch | `lesson_opened`, `lesson_step_viewed`, `lesson_completed`, `lesson_abandoned` (fired on exit before completion) | lesson_id, step_index, content_revision, duration_ms |
| Launch | `scenario_prediction_locked`, `scenario_completed` | scenario_id, version, verdict, confidence |
| Launch | `game_opened`, `game_started`, `game_completed`, `game_abandoned`, `game_replayed` | game_id, system (classic/arena), level, variant, length, rounds_played, outcome, duration_ms |
| Launch | `reflection_viewed`, `explore_idea_opened`, `reflection_lesson_link_tapped` | game_id, rule_id |
| Launch | `daily_opened`, `daily_submitted` | day, interaction_type |
| Launch | `profile_opened`, `report_opened`, `area_opened` | evidence level |
| Launch | `error_shown` (startup failure, sync error) | kind |
| Paywall | `paywall_viewed`, `plan_selected`, `checkout_started`, `purchase_completed`, `purchase_failed`, `purchase_restored`, `subscription_cancelled`, `subscription_expired` | placement, plan_id, price_tier. **Source of truth for revenue is the store or RevenueCat webhooks, not the client** |
| Later | `story_chapter_completed`, `challenge_link_shared/opened`, `nickname_set`, `notification_opened` | |

The brief's `app_installed` isn't reliably observable without an attribution SDK. Use first open instead. Defer `acquisition_source` until a campaign exists (Play Install Referrer later).

### 9.4 Funnels

| Funnel | Steps | Decision it informs |
|---|---|---|
| First value | first open → onboarding started → first decision → onboarding completed or skipped → first lesson/game started → first completion (within 24 h) | Is onboarding converting? Is the recommended lesson the right first step? |
| Learning | lesson opened → step 3 → prediction locked → completed → next lesson within 7 days | Which lessons lose people, and at which step (needs `lesson_step_viewed`) |
| Game | game opened → started → round 3 → completed → replayed or other game | Setup friction; games that lose players early; replay value |
| Retention | day-0 session → D1 → D7 → D30 (calendar-day, by install cohort, in IST) | Whether there is a habit at all |
| Monetization | value moment (e.g. lesson 3 done) → paywall → checkout → purchase → month-2 renewal | Paywall placement, free-tier generosity |

### 9.5 Dashboards (first version)

- **Executive:** DAU / WAU / MAU, new installs, D1/D7/D30 (calendar, IST), sessions per user, lessons and games completed.
- **Learning:** completion and abandonment by lesson and step, median duration, prediction verdict mix, lesson → game click-through.
- **Games:** starts and completions by game, replay rate, median duration, level distribution, abandonment round.
- **Retention:** cohort triangle, return frequency, Daily participation.
- **Revenue (once billing exists):** conversion, MRR/ARR, ARPPU, churn and refunds, from store webhooks.

### 9.6 Quality notes

- Use `install_id` plus the Supabase `user_id`. Anonymous ids reset on reinstall, so **retention will be understated** until account linking exists.
- Store `client_ts` and `server_ts`; compute days in **Asia/Kolkata**.
- Retain raw events for 13 months.
- Disclose analytics in the privacy policy, and add an opt-out.

---

## 10. Technical and security report

| # | Finding | Evidence | Severity |
|---|---|---|---|
| T1 | **Anonymous-only identity.** A reinstall, cleared data or new device creates a new user; the old progress is unreachable. Once people pay, this is data loss of a paid product. | `DATA_ARCHITECTURE.md` "Identity"; `ensureUser()` | **P0 before monetization** |
| T2 | **No offline mode.** Startup fetches the catalogue and the session before rendering; on failure the whole app shows "Couldn't load the lessons", including the 18 device-only games. The catalogue is not cached. | `src/data/session.ts`, `app/_layout.tsx:66` | P1 (high for Indian mobile networks) |
| T3 | **Account deletion leaves device data.** It clears progress, games and daily caches, but not `tactiqo/arena-records/v1` (Arena game records and reads), `tactiqo/stories/v1`, `tactiqo/story-audio/v1` or `strategic-game/games-seen`. The dialog promises "game records" are deleted. | `src/data/session.ts:102-127` | P1 (trust and privacy) |
| T4 | Misleading "kept on this device" copy | §8 | P1 |
| T5 | **Never run on a native device** in any recorded audit; no E2E tests; Reanimated, SVG markers and audio unverified on Android | memory baseline; `GAME_UX_IMPLEMENTATION.md` checklist | **P0 release blocker** |
| T6 | **77 uncommitted files**, including engine rule fixes (Gambit, Defusal) and new tests; one disk failure or stray `git checkout` loses them | `git status` | **P0 process** |
| T7 | Dead TTS edge function with `verify_jwt = false` (a "Hello" template). Not harmful now, but any future code there would be public. It's also the source of the only tsc errors | `supabase/config.toml`, `functions/text-to-speech/index.ts` | P2 |
| T8 | Anonymous sign-up abuse: no CAPTCHA or rate limit configured in the repo (the Supabase dashboard may have defaults) | `DATA_ARCHITECTURE.md` notes the risk | P2 [Not verified in the dashboard] |
| T9 | Nicknames: no profanity or impersonation filter ("tactiqo", "Tactiqo_Team" allowed) on public leaderboards | `set_nickname` | P2 |
| T10 | No crash reporting; the root `ErrorBoundary` shows an error but nobody learns of it | `app/_layout.tsx` | P1 |
| T11 | Unused dependencies (7) increase install size and audit surface | §2 | P3 |
| T12 | 22 MB of bundled audio (505 MP3s) | `assets/audio` | P3. Consider on-demand download for stories |
| T13 | Arena results never reach the server, so they can't feed analytics, the profile or cross-device use | `src/features/arena/records.ts` | P1 (with §5.3) |

**Verified as good [Run tests, Code]:**

- Only publishable keys are in the client, and `supabase.ts` refuses secret keys.
- RLS is owner-only on all progress tables; there are no client grants on game tables.
- Server matches never return a seed; `delete_my_account()` is SECURITY DEFINER, uses the caller's JWT only, and is revoked from `anon`.
- Writes are idempotent; the outbox persists across launches.
- Zod validates all persisted state.
- `.env` holds only public keys plus a TTS key that isn't `EXPO_PUBLIC_`, so it isn't bundled.

**Progress-loss scenarios:**

| Scenario | Outcome |
|---|---|
| App killed mid-lesson | Safe: the step is saved per interaction |
| Network lost mid-lesson | Safe: queued in the outbox |
| Session expiry | supabase-js refreshes it; long-offline expiry is untested **[Not verified]** |
| Arena or practice match interrupted | **Lost**; accepted earlier, but painful in 10–18-round games |
| Server match interrupted | Resumable |

---

## 11. Competitor benchmarking

**Confirmed from public sources:**

- **Brilliant:** monthly and annual Premium, plus a family plan. Its own site lists US web prices of $30/month and $240/year (checked August 2026). The free tier gives limited access to daily problems and introductory courses, including the first chapter of any course. ([pricing](https://brilliant.org/help/pricing-and-plans/how-much-does-brilliant-premium-cost/), [free vs Premium](https://brilliant.org/help/pricing-and-plans/what-s-the-difference-between-free-and-premium), [is Brilliant worth it](https://brilliant.org/resources/choosing-brilliant/is-brilliant-worth-it/))
- **Elevate:** personalized daily workouts that adapt in difficulty, a streak calendar, weekly reports, and a free tier (22 of 35 games) with a 7-day trial. Reviews complain about cancellation and renewals. ([App Store](https://apps.apple.com/in/app/id875063456))
- **Lumosity:** paid the FTC $2M in 2016 over unsupported cognitive-benefit claims, and must now have competent scientific evidence before making such claims. ([FTC](https://www.ftc.gov/node/44800), [TechCrunch](https://techcrunch.com/2016/01/06/lumosity-brain-training-app-maker-to-pay-2-million-settlement-to-ftc/amp/))

I didn't confirm details of Brilliant's streaks or leagues or Lumosity's current features. The table below marks those cells as interpretation.

| Category | Tactiqo | Brilliant | Elevate | Lumosity |
|---|---|---|---|---|
| Interactive learning | **Strong**: predictions, labs, transfer | Strong (core product) | Light, skills drills | Minimal |
| Game variety | **23 strategic, multi-round games**: unique | Puzzles | 35 games (confirmed) | Many short games (interpretation) |
| Personalization | Goal plus next-step rule | Course paths (interpretation) | Adaptive workouts (confirmed) | Adaptive (interpretation) |
| Progress tracking | Careful profile (lesson-only) | Course progress | Weekly reports (confirmed) | Performance index (interpretation) |
| Retention systems | Daily (empty), weekly (empty), no reminders | Daily problems (confirmed), streaks (interpretation) | Streak calendar (confirmed) | Daily workout (interpretation) |
| Onboarding | Excellent first decision | — | — | — |
| Visual polish | Good, consistent | Very high | High | High |
| Subscription value | **Not yet sellable** | Clear | Clear | Clear |
| Analytics maturity | None | Mature (assumed) | Mature (assumed) | Mature (assumed) |

**Already better:** strategic games with personalities; honesty about uncertainty and evidence; transfer-based lessons. **Competitors do better:** habit systems, reminders, adaptive daily sessions, account and payment plumbing, polish at scale. **Irrelevant to the positioning:** reaction-speed and memory drills, and cognitive-score "brain age" indexes. **The Lumosity case is a direct warning:** Tactiqo must never claim it improves intelligence, cognition, ADHD or work performance; current in-app copy doesn't.

---

## 12. Premium value assessment (₹200/month)

₹200/month (about ₹2,400/year) is cheap next to Brilliant's US pricing, but Indian users compare against free YouTube and free games. **The product today offers roughly 3–4 hours of lesson content (22 × 8–10 min), 66 scenarios and 23 games.** That's a strong one-time library, but subscriptions are paid for **ongoing** value.

**What prevents payment today:**

1. Nothing is paywalled, and nothing could be: there's no billing.
2. There is no recurring new content. Daily and weekly are empty, and publishing them is manual SQL.
3. Progress isn't safe (anonymous-only).
4. The "personal strategic report" doesn't use the most personal data (gameplay).
5. There are no reminders and no reason to return on day 2.

**What would justify ₹200/month** (feature opportunities):

| Feature | Problem solved | Target | Impact hypothesis | Complexity | Free / Premium | When |
|---|---|---|---|---|---|---|
| Account linking (Google/email) | Data loss | Everyone | Prerequisite for any paid trust | M | Free | **Now** |
| Auto-generated Daily Challenge (seeded variants of scenarios and games) | Empty daily surface | Habit seekers | D7 retention +; daily reason to open | M | Free daily; archive Premium | **Now** |
| Automated Game of the Week schedule | Empty weekly surface | Competitive players | Weekly return | S | Free | **Now** |
| "How you play" behavioural profile (§5.3) | Profile ignores play | Core audience | The key differentiator; makes the report worth revisiting | L | Basic free, full history Premium | 30–90 days |
| Monthly personal strategic report | Reason to stay subscribed | Paying users | Churn reduction | M | Premium | 90 days |
| Lesson ↔ game paths ("courses" of lesson + 2 games + reflection) | Isolated content | Learners | Completion, perceived depth | M | First module free | 30 days |
| Game mastery (beat each persona on Hard; persona dossier) | Replay purpose | Gamers | Replay rate | M | Premium (Easy/Normal free) | 30–90 days |
| Gentle reminders (opt-in, no streak shaming) | No day-2 trigger | Everyone | D1/D7 | S | Free | 30 days |
| New lessons or modules each month | Content runs out | Learners | Renewal | L (ongoing) | Premium | 90 days+ |
| Offline lessons | Network fragility | Commuters | Usage in transit | M | Premium perk | 90 days |
| Real-time multiplayer | Novelty | — | Unvalidated; high cost and moderation | XL | — | **Not yet** |
| Community, chat, forums | — | — | Moderation burden | XL | — | **Not yet** |
| Leaderboards beyond the current ones | — | Few | Already exists | — | — | No |

**Suggested free/premium split [Judgement]:**

- **Free:** module 1 (3 lessons), 6 games on all levels, the daily challenge, and the basic profile.
- **Premium:** all modules, all 23 games on Hard and all variants, full profile history and the monthly report, the daily archive, and offline access.
- **Annual plan:** about ₹1,499–1,799.

---

## 13. Complete prioritized backlog

Impact is 1–10. Effort is S (≤ 2 days), M (≤ 1 week), L (≤ 3 weeks) or XL.

### P0 — Critical / release blockers

| # | Item | User | Biz | Effort | Conf. | Depends on |
|---|---|---:|---:|---|---|---|
| P0-1 | Privacy policy and terms (hosted), linked in Settings and store listings; Play Data Safety form | 6 | 10 | S | High | Legal text |
| P0-2 | Native device QA pass: Android low-end plus one iOS device; all 23 games, 3 lessons, both stories, delete account (`GAME_UX_IMPLEMENTATION.md` checklist) | 9 | 9 | M | High | Dev build |
| P0-3 | Live content pipeline: a scheduled Daily Challenge and Game of the Week (generate from engines, or pre-load 60+ days) so neither surface is empty at launch | 8 | 9 | M | High | — |
| P0-4 | Account linking (Google, plus email OTP) before any paid launch, with restore on a new device | 8 | 10 | M | High | Supabase `linkIdentity` |
| P0-5 | Review and commit the 77 uncommitted files (game UX work and fixes) | 7 | 8 | S | High | Owner review |

### P1 — Essential

| # | Item | User | Biz | Effort | Conf. |
|---|---|---:|---:|---|---|
| P1-1 | First-party analytics (§9.2 option A) with the launch-tier events | 3 | 10 | M | High |
| P1-2 | Crash and error reporting (Sentry free tier, or log to the analytics table) | 6 | 8 | S | High |
| P1-3 | Billing: Google Play Billing (and StoreKit) with entitlements on the server; paywall | 2 | 10 | L | Medium |
| P1-4 | Fix the Account copy ("kept on this device") and make deletion clear all `tactiqo/*` and `strategic-game/*` device keys | 7 | 7 | S | High |
| P1-5 | Offline: cache the last good catalogue and start from it; device-only games always available | 8 | 7 | M | High |
| P1-6 | Decide and fix the dominant strategies: Market Rivals win rule, Bluff always-call, Last Stand Easy, Hidden Signal pitch cost, Mole Hard evidence | 7 | 6 | M | Medium |
| P1-7 | Arena match summaries to the server (insert-only, after the match; no hidden data) | 5 | 8 | M | High |
| P1-8 | Support surface: About, version, licences, "Report a problem" (mailto or form), FAQ | 6 | 7 | S | High |
| P1-9 | Lesson → game links on every lesson completion; game setup → lesson | 7 | 7 | S | High |
| P1-10 | Contrast fix for `textFaint` | 5 | 3 | S | High |

### P2 — High-value improvements

| # | Item | User | Biz | Effort | Conf. |
|---|---|---:|---:|---|---|
| P2-1 | "How you play" behavioural profile (§5.3) | 9 | 9 | L | Medium |
| P2-2 | Opt-in reminders with a chosen time; a streak that forgives (e.g. 2 freeze days a week) | 6 | 8 | M | Medium |
| P2-3 | Library: duration and difficulty chips, "Start here" row, "Played / best" | 6 | 6 | S | High |
| P2-4 | Game-specific personas for Auction, Market, Signal and Ultimatum Game | 5 | 4 | M | Medium |
| P2-5 | Deepen or merge shallow games: Stag Hunt (three hunters/noise), classic Ultimatum (fold into 4b), Split or Steal (uncertain horizon) | 6 | 5 | M | Medium |
| P2-6 | Lesson replay variation (new seeds or tables on replay) | 6 | 5 | M | Medium |
| P2-7 | Spaced review: re-ask 3 earlier calculable items in the Daily Challenge | 7 | 6 | M | Medium |
| P2-8 | Align onboarding cards with the tabs; mention Stories | 4 | 4 | S | High |
| P2-9 | Content wording fixes A1 and A2 | 3 | 2 | S | High |
| P2-10 | Remove the dead TTS function (clears the tsc baseline); nickname profanity and impersonation list; anonymous sign-up rate limit or CAPTCHA | 3 | 5 | S | High |
| P2-11 | Match recovery for Arena and practice (save state per round) | 6 | 4 | M | Medium |
| P2-12 | Lesson links for Defusal and Gambit (EV vs outcome); update the stale `REFLECTIONS.md` table | 4 | 3 | S | High |

### P3 — Future enhancements

- Monthly personal report.
- Premium courses and new modules.
- Offline content download.
- Hindi localization (wire up the installed i18next first).
- Tournament mode against all four personas.
- Persona dossiers and mastery.
- Remove unused dependencies.
- On-demand audio packs.
- Fix the lesson id/title mismatch.

### P4 — Optional or don't build yet

- Real-time multiplayer.
- Chat or community.
- LLM tutor.
- Global leaderboards beyond the current ones.
- Cosmetic avatars or shop.
- "Brain score" indexes.
- A light theme.
- Commissioned raster art.

### Outstanding inspections (this audit did not complete them)

1. Full copy read of all 22 lessons and 66 scenarios on a device. This needs a throwaway Supabase project or your permission to write test progress to the live one.
2. Native device behaviour (P0-2).
3. Supabase dashboard settings: auth rate limits, CAPTCHA, backups, PITR.
4. The friend-challenge and server-match flows end to end.
5. Story audio quality, which needs human ears.
6. 430 px and 200% font-scale layouts.

---

## 14. Recommended execution roadmap

**Before public launch (about 3–4 weeks):**

- P0-1 to P0-5
- P1-1, P1-2, P1-4, P1-5, P1-8, P1-9, P1-10
- P2-8, P2-9, P2-10

Launch **free** (or free with "Premium coming"). This gathers the retention data that should decide paywall placement.

**First 30 days after launch:**

- P1-3 billing and paywall, placed after the first module.
- P1-6 balance decisions.
- P1-7 Arena summaries to the server.
- P2-2 reminders.
- P2-3 library cards.
- Watch the onboarding → first-completion and lesson step-abandonment funnels weekly.

**First 90 days:**

- P2-1 behavioural profile.
- P2-7 spaced review in the Daily Challenge.
- P2-5 shallow-game rework.
- P2-4 personas.
- P2-6 replay variation.
- Monthly report (P3).
- First new module.

**Longer term:** Hindi, courses, tournaments, offline packs, and only then any social or multiplayer features, if the data shows demand.

---

## 15. Final verdict

1. **Complete product or MVP?** In content and engineering it is well past MVP. As a *business* product it is still pre-launch: it has no accounts, payments, analytics, legal pages or live daily content.
2. **Genuinely strong:**
   - The maths and correctness discipline.
   - The lesson design (predict → compare → transfer).
   - The onboarding decision.
   - The Cooperation Game, Auction House, Liar's Dice, Two-Thirds and Inspector.
   - Reflection rules that never invent behaviour.
   - RLS and data-safety engineering.
3. **Too shallow or repetitive:**
   - Stag Hunt.
   - The Ultimatum (classic).
   - The Market Rivals (a fixed price wins).
   - The Hidden Signal (always pitch).
   - Split or Steal is borderline.
   - Bluff and The Last Stand need their exploits closed.
4. **Lessons needing substantial work:** none is wrong. The weakest experiences are L12 *The Cost of Waiting*, L19 *Coalitions*, L22 *Strategic Practice* (worksheet-like) and L3 *Best Move* (dense matrices on phones). Replay is deterministic across the board.
5. **Is the strategic profile meaningful?** It is honest and statistically careful, but it measures quiz accuracy in four areas, not *strategic behaviour*. Making it meaningful means feeding it gameplay.
6. **Premium quality?** The look and the writing are close. The missing trust and continuity layer (accounts, support, legal, reminders, live content) isn't.
7. **Is analytics sufficient?** No: there is none. Server tables can give rough lesson and Daily counts, but nothing about sessions, drop-off, Arena play or onboarding.
8. **What stops ₹200/month:** no billing; empty recurring content; progress that a new phone erases; and a profile that ignores the most personal data.
9. **Ten highest-value improvements:**
   1. Account linking.
   2. A live daily and weekly content pipeline.
   3. First-party analytics.
   4. A native device QA pass.
   5. Privacy, terms and support surface.
   6. A behavioural "How you play" profile.
   7. Lesson ↔ game paths.
   8. Billing with a module-1-free paywall.
   9. Fix the dominant game strategies.
   10. Offline catalogue cache.
10. **Do NOT build yet:**
    - Real-time multiplayer.
    - Chat or community.
    - An LLM tutor.
    - Cognitive or "brain score" claims or indexes (see the Lumosity FTC case).
    - More games: 23 is enough. Deepen the weak ones instead.
    - Leaderboard expansion.
    - Cosmetic economies.
