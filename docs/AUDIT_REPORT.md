# Strategic Thinking Game: Product, Codebase and Learning-Experience Audit

*Audit date: 26 October 2026. Commit audited: `88f72af` ("v1 polished"), clean working tree.*
*Scope: audit and report only. No source, asset, dependency or configuration file was changed. The only file created is this report.*

---

## How to read this report

Every claim is tagged with how it was established:

| Tag | Meaning |
|---|---|
| **[Verified: code]** | Read in the source and traced from interaction → state → engine → display. |
| **[Verified: run]** | Confirmed by running something: the test suite, `tsc`, `expo lint`, or a scratch script that imported the real engine and copy modules. |
| **[Inference]** | A reasoned conclusion from the code that was not observed at runtime. |
| **[Recommendation]** | A proposal. |
| **[Evidence]** / **[Hypothesis]** | For learning-science claims: published evidence vs a plausible design bet. |

**What was executed:**
- `npm test`: **109 tests, 24 suites, all passing.**
- `npx tsc --noEmit`: no errors.
- `npx expo lint`: no warnings.
- A scratch script (kept outside the repo) imported `src/game/*` and the lessons' `copy.ts` files to check every payoff, threshold, seed and feedback string quoted below.

**What was not executed:** the app was **not** run on iOS, Android or web during this audit. Statements about animation, audio timing, layout at large text sizes and screen-reader output are therefore code-level inferences. Generated audio was not regenerated or listened to.

---

## 1. Executive summary

### Overall maturity (qualitative judgements, not measured outcomes)

| Dimension | Judgement | Why |
|---|---|---|
| **Implementation maturity** (how much is built) | **High for an MVP, about 3.5/5** | All five lessons are complete end to end. Each has a real engine, prediction → decision → consequence → concept → experiment → transfer → recap, persistence, and narration. Tests, typecheck and lint are clean. |
| **Learning effectiveness** (plausibility, not proof) | **Promising but unvalidated, about 3/5** | The design follows evidence-based patterns: predict before reveal, concepts named after the evidence, graded feedback, transfer with explicit analogy limits. But feedback is mostly pre-written per option, the "reasoning" inputs are multiple choice, replay is deterministic, nothing is retrieved later, and **no user has been tested**. |
| **Product readiness** (reliability, usability, ability to validate) | **Early, about 2.5/5** | No device QA evidence and no `eas.json`. No UI or integration tests. No local event log or data export for user studies. Completion **erases** everything the learner predicted and chose. A few on-screen statements contradict the engine (Section 5). |

**The app does not yet show that it improves strategic thinking.** It has never been tested with users, and it keeps no data that could show it.

### What the MVP can do today **[Verified: code]**
- Five self-contained lessons (`src/features/lessons/*`) sharing a shell (`LessonShell`), a step-flow hook (`useLessonFlow`), and pure game engines (`src/game/*`).
- Calculated (not hard-coded) outcomes: payoff matrices, best replies, dominance, pure Nash equilibria, two-thirds targets, mixed-strategy expected values, and incentive rules with a detection extension.
- Predictions locked before reveals, compared with outcomes (`PredictionResult`), and graded with four verdicts (`match / defensible / misconception / depends`).
- Experiments: a penalty slider (L1), a crowd lab (L2), a one-message extension (L3), a strategy comparison and a mix simulator (L4), and a two-lever policy sandbox with a detection stress test (L5).
- Transfer questions in unfamiliar settings that never name the concept, followed by "what carries over / where the analogy stops".
- Resume mid-lesson (zod-validated), completion tracking, settings (narration, reduce motion, haptics).
- 85 pre-generated narration clips with tested sync between text and audio, mute, and cleanup on navigation and backgrounding.

### Strongest aspects
1. **Logic is cleanly separated from presentation.** Engines are pure TypeScript, and learner-dependent wording lives in `copy.ts` as pure functions of state and engine. This is unusually testable for an MVP.
2. **Opponents are described honestly.** Rohan, Nina, Maya and the L2 crowd are stated, fixed policies, and the screens say so. Nothing is marketed as "AI".
3. **Pedagogical structure.** Predict-before-reveal, name-after-evidence, and "where the analogy stops" are all genuinely present, not just documented.
4. **Audio engineering.** One player, context-scoped requests, once-per-run dedupe, watchdog, stale-callback protection, tests for text drift, no secret in the app.

### Biggest learning-experience weaknesses
1. **A wrong prediction is treated as a misconception.** Missing an unknowable rule (Nina's round-1 choice, the crowd's average) is labelled "Worth a second look", the same as a reasoning error (Section 6).
2. **Reasoning is captured only as multiple choice**, and only in L1. Other lessons record *what* the learner predicted, not *why*. There is no confidence rating, so calibration can't be measured.
3. **Several reveals tell rather than let the learner discover.** For example, L1 `whatif` shows "No — cutting pays more either way" as soon as one toggle is pressed, and L4's lab reveals the answer the moment a prediction is tapped.
4. **Nothing is retained or revisited.** Completion deletes the lesson's data. There is no review, no delayed retrieval, and no interleaving across lessons.
5. **Replay is a restart, not a new problem.** All seeds and policies are fixed, so a replay reproduces the same crowd, the same Nina, and the same keeper coin for the same shots.

### Most significant technical risks
1. On-screen contradictions in Lesson 5 (tie wording, and a stale "flipped" latch). These are small to fix but damage trust in an app whose promise is that the numbers are honest.
2. There are no tests above the pure-function layer. `useLessonFlow`, gating, Back navigation and resume are untested.
3. There is no release pipeline (no `eas.json`) and no device verification record.
4. Contrast for the faint text token (`#64748B`) is 3.1–3.9:1 on the app's surfaces, below WCAG AA for small text.

### Most valuable next steps (Section 15 has detail)
1. **Correctness pass:** fix the L5 tie/latch defects, gate the L4 lab feedback, and correct the small copy inaccuracies. Add regression tests for each.
2. **Prediction quality:** separate "prediction missed" from "reasoning misconception", confirm before locking, and add a one-tap confidence rating.
3. **A minimal on-device learning record** that survives completion and can be exported, so a first user study is possible.

### What not to build yet
An LLM tutor or chat, speech recognition, accounts or backend sync, leaderboards, streaks, social features, adaptive "AI" opponents, or commissioned raster art. Each is either unvalidated, expensive, or doesn't help the learner reason better yet (Section 11, Tier 4).

---

## 2. Repository and architecture overview

```
app/                          Expo Router routes (note: AGENTS.md says src/app/ — routes actually live in app/)
  _layout.tsx                 fonts, splash, Stack, reduced-motion-aware transitions
  index.tsx                   home: resume/suggested lesson, lesson cards, start over
  lesson/[lessonId].tsx       looks up lesson, waits for hydration, mounts lesson keyed by id
  settings.tsx                narration / reduce motion / haptics toggles, reset progress
src/content/lessons.ts        lesson metadata + zod id schema, nextLesson()
src/game/                     PURE engines (no React)
  payoff-matrix.ts            best replies, strict/weak dominance, pure Nash, best-reply marks
  incentives.ts               L1/L5 pricing game, penalty/reward rules, regimes, detection, policy evaluation
  two-thirds-game.ts          L2 level-k crowd, seeded picks, scoring, best guess, elimination bound
  coordination.ts             L3 meetup game, Nina's policy
  mixed-strategy.ts           L4 keeper pattern-reader, strategies, mix simulation
  rng.ts                      seeded mulberry32, clamp, EPSILON
src/features/lessons/<lesson>/  <Lesson>.tsx (steps) + copy.ts (pure feedback text)
src/components/lesson/        LessonShell, useLessonFlow, Panels (Dialogue/Panel/FeedbackPanel),
                              PayoffMatrix, Prediction, TransferQuestion, Completion, verdict
src/components/ui/            AppText, Button, Card, ChoiceCard, Segmented, Slider, ...
src/components/characters/    cast.ts (8 characters) + Portrait.tsx (vector SVG faces)
src/components/art/SceneArt.tsx  five vector scene plates
src/features/audio/           clips.ts (source of truth), voices.ts, controller.ts, expoBackend.ts,
                              narration.ts, useNarration.tsx, reactions.ts, audio-manifest.ts (generated)
src/store/                    progress.ts (zustand + AsyncStorage persist), settings.ts
scripts/                      generate-tts.mjs, tts-lib.mjs (local, never bundled)
assets/audio/                 96 MP3s, clips.lock.json
docs/                         LESSON_DESIGN.md, AUDIO.md, ASSETS.md
```

**Stack [Verified: code]:** Expo SDK 57 (`expo ~57.0.30`), React Native 0.86.3, React 19.2.3, Expo Router (typed routes), Reanimated 4.5, expo-audio, zustand 5, zod 4, TypeScript 6 (strict).

**Flow of one interaction (Lesson 1 decision) [Verified: code]:**
1. A tap on `ChoiceCard` calls `update({choice})` in `useLessonFlow` (`src/components/lesson/useLessonFlow.ts:45`).
2. The effect calls `saveRuntime`, which persists to AsyncStorage (`useLessonFlow.ts:33-43`, `src/store/progress.ts:43`).
3. "Lock decision" runs `StepDef.onContinue`, which calls `update({committed, rival: rivalPolicy(BASE_PRICING_GAME)})` (`CooperationTrap.tsx:236-240`). `rivalPolicy` calls `colDominance`, which returns `cut` (`incentives.ts:149`).
4. `goTo(step+1)` runs. `Reveal` reads `payoffAt` for the cell, and `predictionCheck` compares it with the locked prediction (`CooperationTrap.tsx:593-663`).
5. `NarrationScope` gets a new context, so the previous step's audio stops. Reaction clips are chosen by `pricingRevealClips` from the resolved outcome.

**Hygiene notes [Verified: code]:**
- Unused dependencies: `i18next`, `react-i18next`, `nativewind`, `tailwindcss` (no config file), `expo-symbols`, `expo-web-browser`. `expo-localization` is a config plugin but is never imported.
- `assets/fonts/SpaceMono-Regular.ttf` is unused.
- 11 orphaned MP3s and lock entries from removed lines (e.g. `l2_result_over.mp3`, `l5_result_cut.mp3`). They aren't bundled because the manifest doesn't `require` them, but they clutter the repo and the lock.
- The Expo CLI loads the local `.env` (`env: export GOOGLE_TTS_API_KEY` appears when linting). That is expected: the key isn't `EXPO_PUBLIC_`, so it isn't inlined, and a test forbids `process.env` in app code. `.env` was only ever committed empty and is now ignored.

---

## 3. Feature maturity matrix

**Assumptions for effort estimates:** one full-time developer who knows this codebase, on-device only (no new backend) unless stated. XS = hours, S = ½–1 day, M = 2–4 days, L = 1–2 weeks, XL = more than 2 weeks.

| Feature | Current status | Evidence in code | User value today | Main gap | Improvement | Effort | Dependencies |
|---|---|---|---|---|---|---|---|
| Navigation & routing | Implemented, needs stronger validation | `app/_layout.tsx`, `app/lesson/[lessonId].tsx` | High | No navigation tests; not device-verified here | Smoke E2E (Maestro) on both platforms | S | Dev build |
| Shared lesson shell (progress, gating, Back) | Implemented, needs stronger validation | `LessonShell.tsx` | High | Gating is per-step booleans with no invariant tests | Tests on `steps[].canContinue` | S | — |
| Mid-lesson resume | Implemented, needs stronger validation | `useLessonFlow.ts:16-26`, zod schemas per lesson | Medium | Untested; schema drift silently restarts the lesson | Hook tests + schema version | S | — |
| Completion tracking | Verified working (logic) | `progress.ts:51-56` | Medium | Deletes all lesson data on completion | Keep a learning record (Section 7) | S–M | — |
| Predictions before outcomes | Implemented, needs stronger validation | `Prediction.tsx`; used in all 5 lessons | High | Misses graded as misconceptions; tap-to-lock; no confidence | Section 6 fixes | S | — |
| Reasoning capture ("why") | Partially implemented | L1 `RIVAL_REASONS` only (`cooperation-trap/copy.ts:191`) | Medium | Only L1, only multiple choice | Structured reason pickers in L2–L5 | M | — |
| Decision capture & commitment | Verified working (logic) | `committed*` flags in each schema | High | — | — | — | — |
| Outcome resolution | Verified working [run] | Engines + `copy.ts` tests | High | — | — | — | — |
| Graded feedback (verdicts) | Implemented, needs stronger validation | `verdict.ts`, `Panels.tsx:115` | High | Verdict semantics misapplied to prediction misses | Add a "surprise/unknowable" path | S | — |
| Concept naming after evidence | Verified working (code) | e.g. dominant strategy only after `showBR` | High | Often *told* via a panel rather than *stated by learner* | Ask learner to state the pattern first | S per lesson | — |
| Transfer questions | Implemented, needs stronger validation | `TransferQuestion.tsx`, tested "strong=1", "no concept name" | High | One item per lesson; no delayed transfer | Paired-case transfer + review queue | M | Learning record |
| Reflection prompt | UI only or placeholder | `Completion.reflection` is display text | Low | No response captured | Optional short text or journal entry | S | Learning record |
| Completion recap | Verified working (code) | `*Recap()` functions, tested | Medium | Lost after leaving screen | Persist recap | XS | Learning record |
| Progression between lessons | Verified working (code) | `nextLesson`, `Completion` Next button | Medium | Linear only; no recommendation | Later, based on evidence | — | — |
| Replay | Partially implemented | `restart()` resets to INITIAL | Low–Med | Deterministic: same crowd, Nina, keeper coin | Seed variation / parameter variants | M | — |
| Counterfactual experiments | Implemented, needs stronger validation | L1 whatif & penalty, L2 lab, L3 message, L4 compare & lab, L5 sandbox & detection | High | Some reveal answers early; few ask to predict the effect of the change | Section 6 | S–M | — |
| Opponent behaviour | Verified working; scripted | `rivalPolicy`, `friendPolicy`, `keeperRead`, `opponentPicks` | Medium | No variety of policies | Policy library (Tier 2/3) | M–L | — |
| Learner-adaptive difficulty | Missing | — | — | — | Defer until data exists | — | Learning record, user data |
| Spaced retrieval / review | Missing | — | — | — | Review mode | M | Learning record |
| Mastery metrics / profiles | Missing | — | — | — | Minimal learning-state model first | M | — |
| Gamification (streaks, scores) | Missing (deliberately) | Transfer UI says "No score, no shaming" | — | — | Don't add yet | — | — |
| Narration (TTS, pre-generated) | Implemented, needs stronger validation | 85 clips, manifest, lock, controller tests | Medium | No device verification record; voices not judged here | Device checklist pass | S | Dev build |
| Mute & persistence | Verified working (logic) [run] | `settings.test.ts`, `narration.ts:349` | Medium | — | — | — | — |
| Voice selection by user | Missing | Voices fixed in `voices.ts` | Low | — | Defer | — | — |
| Speech recognition (STT) | **Missing entirely** | No STT code; `microphonePermission: false` in `app.json` | — | — | Do not build (Tier 4) | — | — |
| Character art | Partially implemented | Vector `Portrait.tsx`; raster slots in `cast.ts:45` empty; files listed in `docs/ASSETS.md` absent | Medium | "Illustrated" = vector fallback art | Commission only after validation | — | Artist |
| Accessibility (labels, roles, reduced motion) | Implemented, needs stronger validation | `accessibilityRole` throughout, `useMotionReduced` | Medium | Faint-text contrast; Segmented 40 pt targets; not screen-reader tested | Section 8 | S | Device |
| Tests | Implemented (logic layer only) | 109 tests, `node --test` | — | No component, hook, navigation or E2E tests | Hook + E2E smoke | M | — |
| Analytics / study export | Missing | — | — | Can't run a study | Local event log + export | S–M | — |
| Build & release (EAS) | Documented but not implemented | No `eas.json`; AGENTS.md describes EAS | — | — | `eas build` profiles | S | Expo account |

---

## 4. Lesson-by-lesson audit

### Lesson 1 · The Cooperation Trap (`src/features/lessons/cooperation-trap/`)

**Implemented [Verified: code]:** 12 steps: intro, stakes, predict (move + reason), decide, reveal, whatif, matrix, trap (promise), penalty, caveat, transfer, done. Payoffs are `BASE_PRICING_GAME` = MM (8,8), MC (3,10), CM (10,3), CC (5,5) (`incentives.ts:15`).

**Math [Verified: run]:**
- Cutting is strictly dominant for both players: 10>8 and 5>3, a 2-point edge in both columns. The unique pure Nash equilibrium is (cut, cut). (cut, cut) is Pareto-dominated by (maintain, maintain), 16 vs 10, so this is a correct Prisoner's Dilemma.
- **Penalty threshold.** With penalty *p*, cutting's edge is 2 − *p*:
  - *p* < 2: cut-dominant. Confirmed at 0, 1 and 1.5.
  - *p* = 2: tie, with **all four cells pure Nash equilibria** and `penaltyExplanation(2)` reading "8 vs 8 … 3 vs 3 … this model can't say which way a company goes". This is correct and honestly worded.
  - *p* > 2: maintain-dominant (2.5 and 5 confirmed). At step 0.5, the smallest flipping value on the slider is 2.5.
- `rivalPolicy` breaks the tie toward `maintain` (status quo), but the tie only arises in the penalty experiment, where Rohan's move isn't used. No inconsistency on screen.
- Rohan **always cuts**. The reveal says so plainly: "one fixed rule … he would have done the same whatever you picked" (`CooperationTrap.tsx:641-644`).

**Works well:**
- Prediction and decision are separate, and the decision step reminds the learner of their prediction.
- Reason feedback is held back until best replies are shown (`reasonFeedback` at `copy.ts:220`), so it points at evidence already seen.
- The promise step grades "keep the deal" as `depends`, not wrong. That handles the repeated-game caveat well.
- The caveat step separates "better for companies" from "better for everyone".

**Weak or incomplete:**
- **The discovery is shallow.**
  - In `whatif`, `explored` starts as `['maintain']`, so one tap on "Cut" satisfies the gate.
  - The insight panel then *states* the answer ("No — cutting pays more either way") instead of asking the learner to commit to it first (`CooperationTrap.tsx:286, 317-321`).
  - In `matrix`, the dominant strategy is revealed by a button rather than found by the learner.
- **The tension between individual and group interest is told more than discovered.** The learner experiences the (cut, cut) outcome, but never tries to *sustain* cooperation and fail. The only test of that is the promise question, which is answered in the abstract.
- **Taps lock instantly.** The penalty prediction locks on first tap (`locked={!!data.penaltyGuess}`, `:462`), and so does the promise choice (`:427-428`). A mis-tap can't be undone without replaying the lesson.
- The penalty question asks for "the smallest penalty". The correct option, "Anything more than 2", is a set, not a smallest value, and on the 0.5-step slider the smallest value that works is 2.5. This is minor wording.
- **Overlap with Lesson 5.** L1 already teaches "the line sits at 2". L5's proposal prediction (reward 1.5) then becomes a recall check, not a new insight.
- Latent: `cooperationRecap` (`copy.ts:360-363`) would claim that copying the rival's predicted move "would have earned" more even when it wouldn't (predicted maintain → copying = 8 < 10). This is unreachable today because Rohan always cuts, but it would break if Rohan's policy ever varied.

**Highest-value improvements:**
1. Make the learner answer "Is there any FoodKart choice where maintaining pays more?" with a yes/no lock before the insight panel appears. **XS–S.**
2. Confirm before locking the penalty guess and the promise choice. **XS.**
3. A short "three-week" repeated variant where Rohan plays a stated policy such as tit-for-tat, to let the learner *feel* that cooperation is fragile (Tier 2). **M.**
4. Decide where threshold discovery belongs. Either keep it in L1 and turn L5's proposal into a new problem, or make L1's penalty step a prediction only. **S** (content).

### Lesson 2 · The Strategy Detective (`strategy-detective/`)

**Implemented:** 11 steps. A two-thirds-of-the-average game against 10 **simulated** players (stated on the intro screen), using level-k types, seeded picks, a crowd lab, an elimination walkthrough, a "real people" note, and a festival transfer question.

**Model [Verified: run]:**
- Round 1 crowd: `{level0:4, level1:3, level2:2, level3:1}`, seed 11. The others' picks are 51, 53, 61, 59, 33.3×3, 22.2×2, 14.8, averaging **38.3** (nearest prediction bucket: "one step", ~33). The best pick is **24.7** and the target is about 23–26 depending on the learner's pick.
  - Picking 22 or 33 ranks 3rd.
  - Picking 0 ranks 7th. This is a nice built-in lesson that "the theorist loses", but the screen never points at it explicitly.
- Round 2 is the same crowd shifted one level deeper (`shiftPopulation`). The best pick is **14.8**.
- The target includes the learner's own pick. `bestGuess` solves g = ⅔(S+g)/(n+1), giving g = 2S/(3n+1). This is correct.
- Real participants: **none.** Results are deterministic for a given guess. Replays produce the identical crowd.

**Works well:**
- The forecast-then-pick structure, plus `pickImpliedBy` follow-through feedback ("your own forecast pointed to ~X but you chose Y", `copy.ts:50-54`), is a genuinely good reasoning mechanism. It checks that the decision is consistent with the learner's own model.
- The sum → average → target arithmetic is shown.
- The theory step separates "where perfect reasoning leads" from "what real groups do". The "20s or 30s" claim is broadly consistent with Nagel (1995), whose first-round mean for p=⅔ is reported around 36 ([Nagel 1995, AER](https://extranet.parisschoolofeconomics.eu/docs/guesnerie-roger/nagel95.pdf); [summary](https://en.wikipedia.org/wiki/Guess_2/3_of_the_average)). Newspaper versions tend lower. The app gives no source.

**Weak or incorrect:**
- **Numbers disagree across screens [Verified: run].** The lab feedback says "Against the round-1 mix the best pick is **20.2**". It uses `LAB_SEED = 21`, but the learner actually played round 1 with seed 11, where the best pick was **24.7** (`copy.ts:82-85`, `StrategyDetective.tsx:56-58, 520`). The learner can see both numbers.
- **Round 2 has no prediction.** The learner is *told* the crowd went one level deeper, so the iterative step is done for them. They never practise "they will expect X, so the target will be ⅔·X".
- **The lab gate is shallow.** `labTouched` becomes true even when the learner taps the "Round 1 mix" preset that is already selected (`:313, :537`). The lab prediction also locks on first tap.
- A wrong crowd forecast is graded `misconception` (`copy.ts:58-65`). Forecasting a crowd is genuinely uncertain, so the verdict should name the *direction* of the error without labelling it a misconception (Section 6).
- **Iterative reasoning is practised only partly.** The learner models the crowd once. They are not asked to step through a level-k chain themselves before the "Five ways to reason" reveal.

**Highest-value improvements:**
1. Use one seed for round 1 and the lab baseline (or quote the round-1 result directly). **XS.**
2. Add a round-2 forecast ("they saw ~25 last time; where will their average be?"), graded with the same follow-through check. **S.**
3. A "build the chain" interaction before `types`: the learner computes ⅔ of their assumed average and then ⅔ again. **S.**
4. Seeded variation of the Instinctive picks on replay, so replay is a new crowd. **S.**

### Lesson 3 · The Coordination Problem (`coordination-problem/`)

**Implemented:** 11 steps. A meetup game with asymmetric preferences, Nina's stated policy, two rounds (no clue, then a focal clue), the payoff matrix, a focal-point concept step, a one-message "what if" extension, and a study-group transfer question.

**Math [Verified: run]:**
- `MEETUP_GAME` = café/café (8,7), park/park (6,8), mismatches (0,0).
- `meetupAnalysis` returns two pure equilibria, (café, café) and (park, park), and `rowDominance` and `colDominance` both return `none`. "No dominant strategy" is correct: the best reply flips with the other player's choice.
- **Missing nuance:** there is also a **mixed-strategy equilibrium**. Aarav goes to the café with probability 8/15 and Nina with probability 3/7, giving expected payoffs of about 3.43 and 3.73, worse for both than either pure meeting.
  - The panel title says "**2 equilibria**, no dominant strategy" (`CoordinationProblem.tsx:297`).
  - Lesson 4 then teaches mixed equilibria, so a curious learner may later spot the contradiction.
  - Fix by saying "two pure-strategy equilibria". The mixed one also makes a good optional "advanced" note: randomising when you can't coordinate is costly.
- Nina's policy (`friendPolicy`, `coordination.ts:37`): with no clue she goes to her own favourite (park); with a clue she goes to the clue (café); with a message she goes where proposed. All of these are deterministic.

**Works well:**
- Nina's rule is revealed *after* the outcome.
- `meetupFeedback` (`copy.ts:13`) separates a correct read, a read the learner didn't act on, and a miss. This is the best prediction-feedback logic in the app.
- The message step correctly shows that communication picks *which* equilibrium happens and that the sender gains. The caveat panel ("isn't magic") is good.
- L4's caveat links back to L3: being predictable helps a partner.

**Weak:**
- **Round 1 is a coin flip from the learner's point of view.** Nothing on screen lets them infer "she goes to her favourite" rather than "she accommodates me". Yet a miss can be graded `misconception` (`copy.ts:40-43`). This includes the odd case where the learner predicted the café, went to the park, *met* Nina, and was still told their thinking was a misconception. The verdict there is about inconsistency, which is fair, but the title "Worth a second look" doesn't say so.
- **There is no coordination experiment that varies anything** (payoffs, number of people, or strength of the clue). The message step is the only "what if", and its choice isn't locked, which is fine for exploring.
- One transfer item.

**Highest-value improvements:**
1. Replace "2 equilibria" with "two pure-strategy equilibria", with an optional expandable note on the mixed one. **XS.**
2. Grade the round-1 prediction as an *unknowable* read: "Reasonable guess — nothing told you her rule". Keep the misconception verdict for picks inconsistent with the learner's own prediction. **XS–S.**
3. A small "many people" coordination experiment, such as a group-size slider showing how the risk of being split grows without a focal point. This would teach a distinct insight that maps onto the transfer question (Tier 2). **M.**

### Lesson 4 · The Predictability Trap (`predictability-trap/`)

**Implemented:** 10 steps. Eight real shots against Maya's pattern-reader, a policy review, a three-strategy comparison (40 shots each, rerunnable), the mixed-strategy concept, a mix lab (slider, expected and guaranteed value, seeded 40-shot simulation with a running chart), caveats, and a ticket-inspection transfer question.

**Model [Verified: code + run]:**
- `keeperRead` (`mixed-strategy.ts:51`) reads the last 6 shots.
  - With at least 3 shots of history, it checks for a repeat or switch habit (margin ≥ 2).
  - Otherwise, a favourite side (margin ≥ 2).
  - Otherwise, a seeded coin.
- It only ever sees past shots. This is a **fixed reactive policy over history**, not an adaptive learner, and the UI calls it "Maya's stated policy". The source comment says "Adaptive keeper" (`:32`), which is acceptable internally because it reacts to history, but it shouldn't be surfaced as "adaptive AI".
- **Unpredictability is genuinely simulated, not just explained.** The learner's own eight shots are read live. The comparison results vary by seed:

  | Strategy | Goals out of 40 across 5 runs |
  |---|---|
  | Always-left | 0–2 |
  | Alternate | 1–2 |
  | Random | 16–25 |

- The mix lab math is correct:
  - E(q, k) = q(1−k) + (1−q)k.
  - The guaranteed value is min(q, 1−q), so an 80/20 mix is worth 0.20.
  - The keeper's best response to a known q is a pure dive.
- The keeper coin is seeded per shot index (`keeperCoin`, `PredictabilityTrap.tsx:128`), so replaying the same sequence gives the same saves.

**Works well:**
- This is the most genuinely interactive lesson. The learner's real behaviour is exploited, and the review shows exactly which reads caused saves.
- "A mix is a distribution, not 'always switch'" directly addresses the most common misconception.
- Short-run noise is shown against the expected value.

**Defects:**
- **The lab reveals its answer before the experiment [Verified: code].** The prediction locks on tap, and `labFb` renders immediately with the full answer ("…0.20 goals a shot") before the slider or simulation is shown (`PredictabilityTrap.tsx:443-454`). The experiment can only confirm what was already shown. By contrast, L1's penalty and L2's lab both hold feedback back until the learner has experimented.
- **A copy statement is inaccurate [Verified: run].** "once Maya has three shots of history, she dives left every time" (`copy.ts:35`). In fact, after two left shots she reads "favourite side" on shot 3 (always-L reads: coin, coin, favourite-side, repeat-habit). It should say "two".
- **The lab's goal is unstated.** The gate only requires one simulation. It never asks the learner to *find* the mix that maximises what they can count on, which is the actual insight.

**Highest-value improvements:**
1. Show `labFb` only after the first simulation, or after the learner moves the slider to 80% and simulates. **XS.**
2. Add a goal: "Find the mix that gives you the most you can count on", unlocked when q is 50%. **S.**
3. A "stronger side" variant (asymmetric scoring probabilities) so the equilibrium mix isn't 50/50. This teaches the caveat rather than stating it, and matches the transfer question (Tier 2). **M.**

### Lesson 5 · The Incentive Shift (`incentive-shift/`)

**Implemented:** 11 steps:
- the base table;
- a councillor's 1.5 reward proposal (predict, then verdict);
- the designer role;
- a two-lever sandbox (p, r);
- an enforcement stress test (detection d, effective penalty d·p);
- a lever cost comparison (p=3 vs r=3);
- side effects (Kavya, Arjun, Rohan);
- a sales-team transfer question;
- a rubbish-charge reflection.

**How it extends Lesson 1:**
- It adds a reward lever.
- It adds the designer's budget: penalties collected and rewards paid at the predicted outcome (`evaluatePolicy`, `incentives.ts:116`).
- It adds imperfect enforcement.
- It separates payoffs from preferences and information.

It is a real extension, not a repeat, except that the 2-point threshold was already discovered in L1.

**Math [Verified: run]:**
- Under the proposal, cutting's edge becomes 2 − 1.5 = 0.5. Both still cut and earn 5 each, and the council pays 0. Correct, and `proposalExplanation` says exactly that.
- The regime is cut-dominant, tie or maintain-dominant as p + r is below, equal to or above 2.
- With detection, the condition is d·p + r against 2.
- p=3 earns companies 8 each and the designer collects 0. r=3 earns them 11 each and the designer pays 6. Both correct.

**Defects:**
1. **Tie case is misstated [Verified: run].** At 50% detection, rules such as p=4, r=0 or p=3, r=0.5 give an edge of exactly 0, a tie.
   - `detectionFeedback` maps a tie to `truth='no'`, so a learner who picks "No" gets **`match`** with the text "Cutting's edge becomes 2 − 2 − 0 = 0. **Above zero, so cutting pays again.**" (`copy.ts:64-73`).
   - At the same moment the slider panel says "exactly balanced". The screen contradicts itself, and the model actually makes no prediction at a tie.
   - p = 4 is a very natural rule for a learner to choose.
   - The existing test asserts `detectionHolds(4,0) === false` (`lesson-copy.test.ts:214`) but doesn't check the wording.
2. **The "flipped" latch keeps rules that no longer work [Verified: code + run].** `flipped` becomes true the first time maintaining becomes dominant and is never cleared (`IncentiveShift.tsx:293-296`). The learner can then press **Reset rules** (`:320`) or slide back below the line and still continue. Afterwards:
   - The enforcement step "stress-tests your rule" with p = 0, r = 0.
   - The recap prints "Your final rules: penalty 0, reward 0. Your rule leans on a penalty: free while it works…" (confirmed by script).
   - The fix is to gate Continue on the *current* regime, or to snapshot the first working rule.
3. "It depends" is never `match`, even at a tie where the honest answer is "the model can't say".
4. The recap's "leans on a reward" check is `maintainReward > 0` (`copy.ts:104`), so p = 3, r = 0.5 is described as reward-led. This is minor.

**Works well:**
- The proposal is a well-chosen trap: generous-sounding but insufficient.
- The "Same behaviour, different bill" comparison is a distinct and valuable insight.
- Side effects are voiced by affected characters.
- The transfer question includes a `defensible` option with unintended consequences.

**Highest-value improvements:**
1. Fix defects 1 and 2 and add wording tests at every tie combination. **XS–S.**
2. Make the proposal prediction harder or new, since L1 already taught the line. For example, use a mixed rule (p = 1, r = 0.5) or ask about the council's budget. **S.**
3. Make the side-effect step require a prediction ("who loses under your rule?") before opening the perspectives. **S.**
4. Capture the rubbish-charge reflection as a short answer the learner can revisit. **S** (needs the learning record).

---

## 5. Game-engine and mathematical-correctness findings

**Engine quality [Verified: code + run]:**
- `payoff-matrix.ts` correctly implements best replies (with EPSILON ties), strict and weak dominance, pure Nash equilibria and best-reply marks.
- All payoffs shown on screen are read from engines. `OutcomeList`, `PayoffMatrix`, `penaltyExplanation`, `proposalExplanation` and the narration "computed" clips are generated from the same functions, and a test checks that computed clips match the screen.
- **Calculated vs hard-coded:** every outcome is calculated. The only hard-coded display numbers are illustrative: `customerSplit` (75/25), which is labelled "illustrative", and the L2 worked example (60 → 40).

**Defects, ranked:**

| # | Severity | Finding | Location |
|---|---|---|---|
| E1 | Medium | L5 tie at 50% detection described as "Above zero, so cutting pays again", graded `match` | `incentive-shift/copy.ts:64-80` |
| E2 | Medium | L5 `flipped` latch lets non-working rules reach the stress test and recap | `IncentiveShift.tsx:287-320`, `copy.ts:99-108` |
| E3 | Medium (learning) | L4 lab answer shown before the experiment | `PredictabilityTrap.tsx:443-454` |
| E4 | Low | L2 lab quotes best pick 20.2 for the "round-1 mix"; actual round 1 had 24.7 (different seeds) | `strategy-detective/copy.ts:82-85` |
| E5 | Low (conceptual) | L3 says "2 equilibria"; there are 2 pure + 1 mixed | `CoordinationProblem.tsx:297` |
| E6 | Low | L4 "three shots of history" should be two | `predictability-trap/copy.ts:35` |
| E7 | Latent | L1 recap counterfactual line assumes the rival always cuts | `cooperation-trap/copy.ts:360-363` |

**Assumptions are explicit in the UI:**
- L1: secret, simultaneous play; profit is the only goal.
- L2: a simulated crowd, and the "one step deeper" rule.
- L4: equal sides; the keeper knows the mix.
- L5: "weigh a fine by its chance", labelled as a "what if".

This is a real strength.

**UI and engine agree** everywhere except E1, E4 and E6.

---

## 6. Prediction, reasoning feedback, simulation and replay

### What is recorded
| Lesson | Predictions | Reasons | Decisions | Experiments |
|---|---|---|---|---|
| L1 | Rohan's move, penalty threshold | Multiple-choice reason (4 options) | Price, promise | Penalty value, explored columns |
| L2 | Crowd average (4 buckets), lab direction | — | Two numbers | Lab population |
| L3 | Nina ×2 | — | Place ×2, message | — |
| L4 | Comparison winner, lab value | — | 8 shots | Seeds, q |
| L5 | Proposal outcome, detection | — | Rules (p, r) | Detection |

All of this is held in lesson runtime and **deleted on completion** (`progress.ts:51-56`).

### Assessment
- **Predictions and decisions are clearly separated** (cyan prediction UI vs blue/orange decisions). Good.
- **Feedback is state-based but mostly pre-written per option.** It is personalised to the option picked and to engine numbers, not to a pattern across answers.
- **Wrong prediction vs misconception are conflated.** `predictionCheck` (L1), `averagePredictionFeedback` (L2) and `meetupFeedback` round 1 (L3) all return `misconception` for a miss, which renders as "Worth a second look" with a caution colour. In L1, predicting that Rohan maintains *is* a reasoning gap, since the table is fully visible. In L2 and L3 round 1, the information to predict correctly didn't exist. The verdict system already has `depends` and `defensible`, but they are used for answers, not for the predictability of the outcome.
- **The structural "why" is explained well** in L1 (`reasonFeedback`), L3 (best reply flips) and L5 (gap vs reward).
- **No revision.** Locked predictions can't be revised (which is correct), and there is also no "update your belief" step after evidence. Updating would be a natural place to teach belief revision.
- **No confidence.** So "incorrect prediction" can't be separated from "reasonable decision under uncertainty", and calibration can't be measured.

### Smallest changes that would materially improve reasoning feedback
1. **Add a `predictability` field per prediction:** `inferable` (the information was on screen) vs `uncertain`. Map a miss on an *uncertain* prediction to a new neutral title such as "Reasonable — the information wasn't there", and say what information *would* have made it predictable. **S.**
2. **One-tap confidence** (Unsure / Fairly sure / Very sure) on each prediction, shown back in the comparison ("You were very sure, and it went the other way"). **S.**
3. **Confirm before locking** single-tap predictions (L1 penalty and promise, L2 lab, L4 lab, L5 detection). **XS.**
4. **Reason pickers in L2–L5**, reusing the L1 pattern. One reason set per lesson, written from common misconceptions. **M** (mostly content).

### Experimentation and replay
- **Variables that recalculate:**
  - L1: p.
  - L2: population of each type.
  - L3: message.
  - L4: strategy seed, q, simulation seed.
  - L5: p, r, d.
  - All of them recalculate payoffs, regimes and best replies live, with before/after "changed" dots on the matrix (`PayoffMatrix baseline`). Good.
- **Thresholds are revealed** in L1 (p = 2), L5 (p + r = 2, d·p + r = 2) and L4 (q = 0.5). L2 reveals a trend.
- **Predict the effect of a change:** L1 penalty, L2 lab, L4 lab, L5 detection. Good, apart from L4's early reveal.
- **Comparing strategies side by side:** only L4's comparison.
- **Replay** is `restart()` back to `INITIAL` with the same seeds. **It is a restart, not a counterfactual.** Rerunning experiments *within* a step (L4 "Run again", "Simulate again") does give genuine variation.

**Recommended additional experiments (only those that teach something new):**
- L1/L5: a repeated-game toggle with opponent memory, teaching that cooperation can be sustained by the shadow of the future. This is the one major idea the app names but never lets the learner experience.
- L3: group size or clue strength, teaching how the risk of being split grows with group size.
- L4: an asymmetric striker, teaching that the equilibrium mix depends on payoffs.

---

## 7. Learning progression and personalisation

**Current evidence the app holds about a learner [Verified: code]:**
- `completed: LessonId[]`
- `runtime[id]` for lessons in progress only
- `settings`

After completion, **nothing** about the learner's reasoning survives.

**Missing:** mastery metrics, difficulty levels, recommendations, spaced review, learning profiles, scores and streaks. Scores and streaks were deliberately left out, which is appropriate.

**Minimal learning-state model (on-device, before any AI personalisation) [Recommendation]:**

```ts
// Appended on each committed prediction / transfer answer; never deleted by markComplete.
interface LearningEvent {
  id: string;             // e.g. 'l1.predict.rival'
  lesson: LessonId;
  concept: 'dominance' | 'level-k' | 'coordination' | 'mixing' | 'incentives';
  kind: 'prediction' | 'reason' | 'transfer' | 'review';
  answer: string;
  verdict: Verdict;       // from the existing copy functions
  confidence?: 1 | 2 | 3;
  inferable?: boolean;    // could it be known from what was on screen?
  at: number;             // timestamp
}
// Derived, never stored: per-concept { attempts, matches, lastSeen, calibrationGap }.
```

This is enough to:
- show a persistent "Your reasoning" page;
- schedule review by concept, using an expanding interval;
- compute calibration;
- export a JSON file for a user study.

A record of tens of events per learner is negligible in AsyncStorage size. **Effort: S–M. No backend.**

**Personalisation should wait** until there is evidence from real users of *which* reasoning patterns differ between learners. Until then, a simple rule ("review the concept whose last transfer answer was not `strong`") is a better first step than a model.

---

## 8. Narration, accessibility and visual UX

### Audio [Verified: code + run]
- **Speech recognition does not exist.** There is no STT code, and `microphonePermission: false` (`app.json:43`). All audio is pre-generated **text-to-speech narration** (Google Cloud TTS, Chirp3-HD `en-IN` voices, `voices.ts`). The app never calls a TTS API, and the key stays local.
- **Clips:**
  - 85 clips in `clips.ts`, 85 manifest entries, and all referenced files exist.
  - The lock checks for stale audio, and the test "every generated audio file is up to date" passes.
  - 11 orphaned MP3s and lock entries remain (Section 2).
- **Text sync:**
  - `screen` lines are tested to appear verbatim in the lesson source.
  - `computed` lines are generated from the same functions the screen uses.
  - `spoken` lines are hand-reviewed paraphrases (e.g. "two-thirds").
  - Narration therefore matches displayed dialogue by construction.
- **Lifecycle:**
  - One player.
  - A new step context halts the previous audio.
  - `endRun` stops audio when leaving a lesson, deferred a tick so a Strict Mode remount doesn't cut it.
  - `AppState` going to the background stops audio.
  - A watchdog fires at 45 s.
  - Mute is persisted, stops audio immediately, and doesn't replay a backlog.
  - A missing clip is skipped with one development warning.
  - All of this is covered by controller tests using a fake player. **Device behaviour is not verified in this audit.**
- **Voice fit:** each character has a written direction (e.g. Sen "calm, measured, warm"), three audition candidates, and an audition script. Whether the voices fit can't be judged without listening. The infrastructure for judging it (`npm run tts:audition`) is good.
- **Gaps:**
  - There is no narration speed control. A speed control is a plausible comprehension aid for non-native listeners, but it needs a playback-rate setting, not regenerated audio.
  - The tap-to-replay dialogue bubble has an `accessibilityHint` but no `accessibilityRole="button"` (`Panels.tsx:56-61`).
  - There is no visible "now speaking" indicator, so the learner can't tell which bubble is being read.
  - Auditioning voices in the app would add little. Mute plus a speed setting cover most needs.

### Accessibility [Verified: code; device behaviour unverified]
- **Good:**
  - Roles throughout: radio and radiogroup for choices, adjustable sliders and counters with increment and decrement actions, and a progressbar.
  - Matrix cells have full spoken labels ("You maintain and FoodKart cuts: You 3, FoodKart 10, equilibrium").
  - Equilibria and outcomes have text tags, not just colour.
  - Shot history shows "goal/save" text alongside colour.
  - Reduced motion is honoured from both the system setting and the in-app setting.
  - Touch targets are mostly 44–52 pt.
  - Fonts scale (no `allowFontScaling={false}` anywhere).
- **Issues:**
  - **Contrast:** `textFaint` `#64748B` measures 3.95:1 on the background and **3.08:1 on `surface`**. It is used for captions, axis labels and empty states (`tokens.ts:26`). Raising it to about `#8391A7` would preserve the look.
  - `Segmented` has a minimum height of 40 pt (`Segmented.tsx:64`).
  - **Large text:** fixed `lineHeight` values, the matrix's 76 pt row-header column and the two-up `Stat` rows are likely to wrap or crowd at the largest accessibility sizes on a 375 pt-wide screen. **[Inference]** This needs a device check.
  - `NumberLine` and `RunningChart` are single accessible summaries, which is appropriate.

### Visual and interaction quality (preserving the established identity)
The visual identity is preserved throughout: dark navy, blue for the learner and orange for the rival, rounded cards, Inter, and a minimal cinematic style. Small changes that would aid comprehension without changing that identity:
1. **Matrix:** add a one-line reading key above the first matrix in each lesson, saying which number is yours. The legend currently appears only after best replies are shown.
2. **Locked state:** after locking, show a small lock icon next to "Your prediction" on later steps, so the learner sees what they committed to when they revisit a step with Back.
3. **Tie state:** give the "exactly balanced" regime its own neutral visual instead of reusing the cyan info panel, so ties read as a distinct third state.
4. **Disabled Continue:** the blocked hint is good. Add a gentle pulse on the control the learner still needs to use, suppressed under reduced motion.
5. **Concept recap chips** on the completion screen, linking the five concepts across lessons to build the connected progression.

**States:**
- Lesson not found and a loading message screen exist.
- A missing clip degrades silently.
- There's an error boundary from `expo-router`.
- There is no lesson-level recovery UI if a step throws. **[Inference]** This is low risk because the engines clamp their inputs.

---

## 9. Relevant external products and learning research

| Reference | What it does | Mechanism that matters | Transfers to us | Doesn't fit | Effort / value |
|---|---|---|---|---|---|
| **Predict-before-demonstration** (Crouch, Fagen, Callan & Mazur 2004, *Am. J. Phys.*) **[Evidence]** | Students predicted classroom demonstrations before watching | Passive watching ≈ no demonstration; *predicting* significantly improved understanding ([summary](https://www.compadre.org/introphys/items/detail.cfm?ID=2329)) | Already the app's core loop. Strengthens the case for **not** revealing answers early (E3) and for comparing prediction with outcome | — | Already built; fixes XS |
| **Analogical encoding** (Gentner, Loewenstein & Thompson 2003; Loewenstein et al. 2003) **[Evidence]** | Negotiation trainees compared two cases side by side | Comparing two cases beat studying them separately for transfer; separate study was no better than no training ([JEP 2003](https://dedregentner.owlstown.net/publications/38525-learning-and-transfer-a-general-role-for-analogical-encoding); [AMLE 2003](https://business.illinois.edu/loewenstein/papers/Loewensteinetal%20AMLE03.pdf)) | **Highest-leverage idea for transfer.** A "same structure?" task: show the lesson case and a new case, and ask what is common. Directly relevant to negotiation and business transfer | Long case texts don't suit mobile; keep cases to 2–3 sentences | M / high |
| **Testing effect** (Roediger & Karpicke 2006) and **spacing** (Cepeda et al. 2006) **[Evidence]** | Retrieval practice vs restudy; distributed vs massed practice | Retrieval beats restudy at delays of days; optimal gaps grow with retention interval ([R&K](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf); [Cepeda](https://pubmed.ncbi.nlm.nih.gov/16719566/)) | A review mode with short new-scenario questions after 2 days, then 1 week, then 3 weeks | Evidence is largely verbal recall; transfer of strategic reasoning is less studied **[Hypothesis]** | M / high |
| **Productive failure** (Sinha & Kapur 2021 meta-analysis, *RER*) **[Evidence, boundary conditions]** | Problem solving before instruction | Attempting before being told improves conceptual understanding when the problem is challenging but tractable ([DOI](https://doi.org/10.3102/00346543211019105)) | Supports asking the learner to *state* the pattern (e.g. L1 whatif) before the insight panel | Needs enough prior knowledge; frustration risk on mobile | S / medium |
| **PhET simulations** (Wieman, Adams & Perkins 2008, *Science*) **[Evidence + design practice]** | Research-tested interactive simulations | Simple controls, immediate visual consequences, implicit guidance, tested with student interviews ([ref](https://jila-pfc.colorado.edu/bibcite/reference/2177)) | Their **interview-based testing process** is what this product lacks most. Also the principle that controls should invite exploration | Open sandboxes without goals; our lessons are more guided, which suits short sessions | S (process) / high |
| **Nicky Case, *The Evolution of Trust*** (2017) **[Product]** | Explorable iterated Prisoner's Dilemma based on Axelrod | Play first, then watch named policies (Copycat, Always Cheat) compete; tweak payoffs and noise; ~30 minutes ([overview](https://www.clearerthinking.org/post/evolution-of-trust-game)) | Named opponent policies with transparent rules; the repeated-game experience L1 is missing; a "noise" slider | Its cartoon identity, length, and tournament simulation at scale | M–L / high for L1 |
| **Brilliant** **[Product; vendor claims]** | Short interactive problem sets with immediate feedback | Learn by doing, scaffolded steps, ~15 min/day ([brilliant.org](https://brilliant.org/)) | Short, frequent sessions; light review sets | Its effectiveness claims are its own; avoid copying its visual style or gamification | — / reference |
| **MobLab / classroom experiments** **[Product]** | Students play economic games, then see class results | Real distributions of human play ([MobLab](https://www.moblab.com/teaching-economics-experiments)) | Later: show L2 results from real learners instead of a simulated crowd | Needs a backend and a classroom context | L / medium (defer) |
| **Duolingo half-life regression** (Settles & Meeder 2016, ACL) **[Evidence, in its domain]** | Models memory decay per item | Predicts recall and schedules review ([paper](https://preview.aclanthology.org/fix_video/P16-1174.pdf)) | Only the *idea* of per-concept decay. A fixed expanding schedule is enough at our scale | The ML model needs large data | — / defer |
| **Transfer taxonomy** (Barnett & Ceci 2002) **[Framework]** | Nine dimensions of transfer distance | Domain, context, time and so on ([ref](https://doi.org/10.1037/0033-2909.128.4.612)) | Use it to **design transfer items** along deliberately varied dimensions (domain, social context, delay) | — | XS (content) / medium |

Not chosen as primary references: leaderboard-heavy quiz apps, and LLM tutors (no evidence base specific to this kind of reasoning transfer, and costly).

---

## 10. Overlooked opportunities

Each item states the problem it solves and its evidence level.

**Better reasoning**
- **Confidence + calibration** *(problem: the app can't separate a lucky guess from a confident correct read)*. Show "you're well calibrated / overconfident on uncertain reads" across lessons. **[Hypothesis]**, grounded in forecasting practice. S.
- **"What would you need to know?"** after uncertain predictions *(problem: the L2/L3 round-1 misses teach nothing)*. Pick the missing piece of information from three options. **[Hypothesis]** S.
- **Decision quality vs outcome quality** *(problem: L4's random striker can lose a short run)*. A post-run card: "Good process, unlucky outcome", using the existing expected-vs-observed numbers. **[Hypothesis]** S.
- **"When does this not apply?"** items *(problem: learners over-apply "always cut" or "always randomise")*. One per lesson. The L4 caveat about cooperative partners already models this. **[Hypothesis]** S.

**Better simulations**
- **Named opponent policies with stated rules** (tit-for-tat, grim trigger, forgiving, always-cut) in a 5-round L1 extension. Teaches the shadow of the future. **[Evidence-adjacent]** (Axelrod; Case). L.
- **Communication and signalling with cheap talk** that might be a lie: an extension of L3's message to a mixed-motive partner. M.
- **Hidden information** (e.g. a rival's cost is unknown). A new lesson later, not a retrofit. XL.

**Better transfer**
- **Paired-case comparison** (analogical encoding, above). M.
- **A decision journal:** "Where did you see this structure this week?" Store locally and resurface it in review. **[Hypothesis]** S–M.
- **Near-miss non-examples:** a scenario that *looks* like a Prisoner's Dilemma but has a non-dominant structure. M (content).

**Better retention**
- **A cumulative challenge** after Lesson 5 that mixes all five structures and asks which game a scenario is. **[Evidence: interleaving]** M.
- **Spaced review** of transfer-style items at expanding gaps. M.

**Better personalisation**
- **Progressive hints** on the hardest steps (L2 chain, L5 sandbox): a nudge, then a structure hint, then the worked numbers. **[Hypothesis]** S–M.
- **Review driven by weak concepts** from the learning record. M.

**Better product experience**
- **Optional "go deeper" cards:** the mixed equilibrium in L3, weak dominance at the p = 2 tie, and the formal level-k definition. S each.
- **A persistent "Your reasoning" page** built from the learning record. S.
- **A narration speed setting.** S.

---

## 11. Ranked roadmap

**Scoring method:** each item is scored 1–5 for learning **Impact**, **Transfer** value, **Frequency** of use, **Effort** (5 = cheapest), **Risk** (5 = safest) and **Confidence** in the evidence. The total is out of 30.

The scores are coarse judgements made to order the work, not measurements. A difference of 1–2 points between items is noise.

### Tier 1: highest value, low complexity (all on-device)

| # | Item | I | T | F | E | R | C | Σ |
|---|---|---|---|---|---|---|---|---|
| 1.1 | Correctness fixes E1–E6 + wording regression tests | 4 | 2 | 5 | 5 | 5 | 5 | 26 |
| 1.2 | Gate L4 lab feedback; ask before revealing in L1 whatif | 4 | 3 | 4 | 5 | 5 | 4 | 25 |
| 1.3 | Separate "uncertain miss" from misconception; confirm before lock | 4 | 3 | 5 | 4 | 5 | 4 | 25 |
| 1.4 | One-tap confidence on predictions + show it in comparisons | 3 | 3 | 5 | 4 | 5 | 3 | 23 |
| 1.5 | Contrast token + Segmented target + dialogue role | 2 | 1 | 5 | 5 | 5 | 5 | 23 |

- **1.1**
  - *Problem:* on-screen contradictions.
  - *MVP:* edit three copy functions, gate Continue on the current regime in L5, unify the L2 seed, and fix two strings.
  - *Measure:* new tests for every tie combination.
  - *Effort:* S.
  - *Risk:* none.
- **1.2**
  - *Problem:* answers revealed before discovery.
  - *MVP:* conditional rendering, plus one yes/no prompt in L1.
  - *Measure:* in the user study, the share of learners who can state the dominance rule unprompted.
  - *Effort:* XS–S.
- **1.3**
  - *Problem:* learners are told they have a misconception when they actually lacked information.
  - *MVP:* an `inferable` flag on prediction copy, a new verdict title, and a confirm step.
  - *Measure:* the think-aloud reaction to feedback.
  - *Effort:* S.
- **1.4**
  - *Problem:* there's no calibration signal.
  - *MVP:* a three-chip control under `PredictionPrompt`, stored in the lesson schema.
  - *Effort:* S.
  - *Risk:* adds a tap to every prediction, so watch for friction.
- **1.5**: XS.

### Tier 2: core learning capabilities

| # | Item | I | T | F | E | R | C | Σ |
|---|---|---|---|---|---|---|---|---|
| 2.1 | Minimal learning record (survives completion) + JSON export | 3 | 3 | 5 | 4 | 4 | 4 | 23 |
| 2.2 | Paired-case transfer items (2 per lesson) | 4 | 5 | 3 | 3 | 4 | 4 | 23 |
| 2.3 | Review mode: spaced retrieval of transfer-style items | 4 | 4 | 3 | 3 | 4 | 4 | 22 |
| 2.4 | Reason pickers + "what would you need to know?" in L2–L5 | 4 | 3 | 4 | 3 | 4 | 3 | 21 |
| 2.5 | Seeded variation on replay (crowd, keeper coin, round-2 shift) | 3 | 3 | 3 | 4 | 4 | 3 | 20 |
| 2.6 | Hook/flow tests + E2E smoke + `eas.json` | 1 | 1 | 5 | 3 | 5 | 5 | 20 |
| 2.7 | Resolve the L1/L5 threshold overlap | 3 | 2 | 3 | 4 | 4 | 3 | 19 |

- **2.1**
  - *MVP:* the `LearningEvent` log from Section 7, appended from existing `onContinue` and `onCheck` handlers. Make `markComplete` stop deleting it. Add a "Your reasoning" list and an Export button in Settings.
  - *Effort:* S–M.
  - *Dependencies:* none.
  - *Risk:* schema migration of the persisted store, which is already handled by the `merge` sanitiser.
- **2.2**
  - *MVP:* reuse `TransferQuestion` with two case cards and a "what's the same?" option set.
  - *Effort:* M (mostly writing).
  - *Measure:* delayed transfer accuracy compared with single-case items in the study.
- **2.3**
  - *MVP:* a home-screen "Review (3)" card, a fixed schedule of 2, 7 and 21 days, and new items not seen in the lesson. Optionally a local notification, which is a new native capability and would need checking against SDK 57 docs.
  - *Effort:* M.
  - *Dependencies:* 2.1 and new content.
- **2.4**: M (content-heavy).
- **2.5**: S–M. Seeds already flow through the engines, so pass a per-run seed through the lesson state.
- **2.6**: M. Test `useLessonFlow` with React Native Testing Library; Maestro for flows. Both are new dev dependencies.
- **2.7**: S content decision, then M to rework the L5 proposal.

### Tier 3: advanced differentiators

| # | Item | Notes | Effort |
|---|---|---|---|
| 3.1 | Repeated Prisoner's Dilemma with named, stated opponent policies (L1 extension or Lesson 6) | Biggest missing concept; engine already supports matrices | L |
| 3.2 | Cumulative "which game is this?" challenge (interleaved) | After 2.2 content exists | M |
| 3.3 | Asymmetric striker (L4) and group-coordination (L3) experiments | Distinct insights | M each |
| 3.4 | Adaptive difficulty / hints driven by the learning record | Only after study data shows real variation | L |
| 3.5 | Cheap-talk and signalling lesson; hidden-information lesson | New content | XL |

### Tier 4: defer or reject

| Item | Why |
|---|---|
| LLM chat tutor / free-text AI grading | Needs a backend and API cost, raises privacy and moderation issues, and is unvalidated for this kind of transfer. Structured reason pickers capture most of the value. Revisit only if users' free-text reasoning proves essential. |
| Speech recognition | No learning problem it solves; adds microphone permission and privacy cost. |
| Streaks, leaderboards, social | Optimise for engagement, not reasoning. The app's "no score, no shaming" stance is sound. |
| Accounts / cloud sync | No validated need. On-device storage plus export covers a study. |
| "Adaptive AI" opponents | Would blur the honest "stated policy" design, which is a pedagogical asset. Named, stated policies (3.1) give the variety without that cost. |
| Commissioned raster character art | The vector art is coherent. Spend art budget after the learning loop is validated. |
| In-app voice auditions / voice picker | Low impact. A narration speed setting is the better small audio feature. |

**On-device vs backend:** everything in Tiers 1–3 can run on the device. Only real-crowd data (L2 with human picks), cross-device sync and LLM grading genuinely need a backend or external service, and all three are deferred.

---

## 12. Suggested implementation phases

| Phase | Contents | Duration (1 developer) | Exit criteria |
|---|---|---|---|
| **0 · Correctness & polish** | 1.1, 1.2, 1.5, plus hygiene: remove unused deps (after checking), delete orphaned MP3s and lock entries, fix the AGENTS.md route path | ~3–4 days | Tests for every tie case; no on-screen contradictions; lint, typecheck and test clean |
| **1 · Measurable reasoning** | 1.3, 1.4, 2.1, 2.6 (smoke) | ~1.5 weeks | Learning record persists after completion; JSON export works on device; E2E smoke on iOS and Android dev builds |
| **2 · First user study** | Section 13 study (5–8 users), no new features | ~1–2 weeks elapsed | Report on comprehension, transfer and friction points |
| **3 · Transfer & retention** | 2.2, 2.3, 2.4, 2.7, guided by study findings | ~3 weeks | Review mode live; paired-case items in all lessons |
| **4 · Depth** | 3.1, then 3.2 | ~3 weeks | Repeated-game experience; cumulative challenge |

---

## 13. Lightweight user-testing and measurement plan

**Goal:** find out whether learners can *explain* and *apply* the five structures, not just finish lessons.

**Keep these two things separate:**
- **Product analytics:** completion, time per step, Back presses, steps where a blocked hint was shown.
- **Learning evidence:** explanation quality, transfer to new scenarios, retention, calibration.

Completion and time spent can't show that learning happened.

**Study design (privacy-conscious, no new infrastructure beyond 2.1's export):**
1. **Participants:** 6–10 adults from the target audience. No personal data beyond an alias and a self-rated prior exposure to game theory (none, some, or formal).
2. **Pre-test (10 minutes, paper or form):** six short scenarios **not in the app**, one or two per structure, spread along Barnett & Ceci dimensions (domain and social context). For each: "What will each side do, and why?" plus a confidence rating.
3. **Session (think-aloud):** two lessons, with a facilitator observing. Note hesitations, misreadings of the matrix, reactions to feedback verdicts, and any "I was just guessing" moments.
4. **Immediate post-test:** a parallel form of the pre-test.
5. **Delayed test (7 days):** a third parallel form, sent remotely.
6. **Optional:** export the learning record JSON from the device. It contains no personal identifiers.

**Measures:**

| Measure | How |
|---|---|
| Explanation quality | Rubric 0–3: names the structure, uses payoffs against *both* opponent choices, states a limit of the model |
| Transfer | Accuracy on new scenarios (pre → post → delayed) |
| Retention | Delayed vs immediate accuracy |
| Calibration | Confidence vs accuracy (gap per confidence level) |
| Recognising when a model doesn't apply | One "looks similar but isn't" item per form |
| Change across attempts | In-app: verdicts on first vs second prediction within a lesson (L2 rounds, L3 rounds) |
| Friction | Observed hesitations, abandonments, steps needing facilitator help |

**Decision rules [Recommendation]:**
- If transfer on new scenarios doesn't improve from pre to post, prioritise 2.2 (paired cases) over everything else.
- If transfer improves but drops by the 7-day test, prioritise 2.3 (review).
- If learners misread the matrix, prioritise the matrix reading key.

**Don't build an analytics backend.** A local event log plus manual export is enough for 10 users.

---

## 14. Technical risks and unresolved questions

**Risks:**
1. **Untested flow logic.** Gating, Back, resume and replay are verified only by reading the code. A regression in `useLessonFlow` could strand learners.
2. **Persisted-state evolution.** Lesson schemas are validated on resume, but a schema change silently restarts in-progress lessons, and there is no version per lesson.
3. **Release path.** There is no `eas.json` and no record of builds on real devices. The audio note in `docs/AUDIO.md` warns that release builds bundle assets differently.
4. **Platform behaviour not observed here:** web audio needs a user gesture; the iOS silent switch is overridden by `playsInSilentMode: true`; and layout at large text sizes is unchecked.
5. **Dependency drift.** Unused packages enlarge the dependency surface. `expo-doctor` was not run in this audit.
6. **Content–engine coupling.** Copy strings that quote engine numbers are well tested for the cases tests list, but ties and edge combinations (E1) slipped through. Property-style tests over the full slider grid would close this gap.

**Unresolved questions for the team:**
- Is the target learner a general adult, a student, or a professional (business, negotiation)? This changes which transfer scenarios matter most.
- Should Lesson 1 or Lesson 5 own the threshold discovery?
- Is a sixth lesson (repeated games) preferred over deepening the existing five?
- Are local notifications acceptable for spaced review?
- Who will judge voice fit, and against which listener population (the voices are `en-IN`)?

**Not inspected in this audit:**
- Full bodies of `Portrait.tsx`, `SceneArt.tsx`, `ChoiceCard.tsx`, `Button.tsx`, `Card.tsx` and `Backdrop.tsx`. Only their accessibility-relevant lines were reviewed.
- `scripts/generate-tts.mjs` and `tts-lib.mjs` in detail. Their tests pass.
- Audio quality: no MP3s were played.
- Runtime behaviour on any platform.

---

## 15. Final recommendation

**Build next:**
1. Make every on-screen statement match the engine (Phase 0).
2. Make predictions measure reasoning: separate uncertain misses from misconceptions, add confidence, and confirm before locking.
3. Keep a minimal on-device learning record, then **test with real users before adding features.**

The current architecture of pure engines plus pure copy is well suited to all of this. No rewrite is needed.

**Defer:** AI tutors, speech recognition, accounts, gamification, adaptive opponents and new art. None of them helps the learner reason better until the core loop is shown to work with real users.

**Why:** the product's main asset is that the models are **honest and transparent**: stated opponents, calculated outcomes, explicit assumptions. The biggest gaps are (a) a few places where that honesty slips, (b) feedback that can't yet tell guessing from reasoning, and (c) no way to see whether learning lasts or transfers. Fixing those is cheap and makes every later investment measurable.

### First three concrete implementation tasks

1. **Lesson 5 and cross-lesson correctness fixes, with regression tests.** About 1–1.5 days.
   - `incentive-shift/copy.ts` `detectionFeedback`: handle the `tie` regime explicitly, with its own wording, and accept "depends" as the match at a tie.
   - `IncentiveShift.tsx`: gate the sandbox's Continue on the *current* regime, or snapshot the first working rule into state used by the later steps and the recap.
   - `PredictabilityTrap.tsx`: show `labFb` only after `simSeed !== null`.
   - Unify the L2 lab baseline seed with round 1.
   - Say "pure-strategy equilibria" in L3.
   - Fix "three shots" → "two" in L4.
   - Add tests that sweep every p and r on the 0.5 grid at detection rates 0–100% and assert that the wording agrees with `regimeFor`.

2. **Prediction verdicts and locking.** About 1.5–2 days.
   - Add an `inferable` flag to the prediction feedback functions (`predictionCheck`, `averagePredictionFeedback`, `meetupFeedback`) and a neutral verdict title for uncertain misses.
   - Add a confirm step to the single-tap locks (L1 penalty and promise, L2 lab, L4 lab, L5 detection).
   - Add a three-level confidence chip to `PredictionPrompt` and show it in `PredictionResult`.

3. **Minimal learning record plus export.** About 2–3 days.
   - Add `learningEvents` to the persisted store (sanitised in `merge`), so `markComplete` no longer erases evidence.
   - Append events from existing commit points.
   - Add a "Your reasoning" list and a JSON export in Settings.
   - This unblocks the Section 13 user study.

---

### Sources
- [Nagel 1995, *Unraveling in Guessing Games*, AER](https://extranet.parisschoolofeconomics.eu/docs/guesnerie-roger/nagel95.pdf) · [Guess ⅔ of the average (summary)](https://en.wikipedia.org/wiki/Guess_2/3_of_the_average)
- [Crouch, Fagen, Callan & Mazur 2004, *Classroom demonstrations: learning tools or entertainment?*](https://www.compadre.org/introphys/items/detail.cfm?ID=2329)
- [Gentner, Loewenstein & Thompson 2003, *Learning and transfer: a general role for analogical encoding*](https://dedregentner.owlstown.net/publications/38525-learning-and-transfer-a-general-role-for-analogical-encoding) · [Loewenstein, Thompson & Gentner 2003, AMLE](https://business.illinois.edu/loewenstein/papers/Loewensteinetal%20AMLE03.pdf)
- [Roediger & Karpicke 2006, *Test-enhanced learning*](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf) · [Cepeda et al. 2006, *Distributed practice*](https://pubmed.ncbi.nlm.nih.gov/16719566/)
- [Sinha & Kapur 2021, *Productive failure* meta-analysis (coverage)](https://www.weforum.org/stories/2021/09/students-who-productively-fail-learn-more/)
- [Wieman, Adams & Perkins 2008, *PhET: Simulations that enhance learning*](https://jila-pfc.colorado.edu/bibcite/reference/2177)
- [Nicky Case, *The Evolution of Trust* (overview)](https://www.clearerthinking.org/post/evolution-of-trust-game)
- [Brilliant](https://brilliant.org/) · [MobLab classroom experiments](https://www.moblab.com/teaching-economics-experiments)
- [Settles & Meeder 2016, *A trainable spaced repetition model*](https://preview.aclanthology.org/fix_video/P16-1174.pdf)
- [Barnett & Ceci 2002, *A taxonomy for far transfer* (summary)](https://lse.ascb.org/?p=787)
