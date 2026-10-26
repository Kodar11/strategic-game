# Lesson design

Every lesson follows the same learning cycle, adapted to its subject:

**Situation → Prediction → Decision → Consequence → Discovery → Experiment → Transfer → Reflection**

Not every stage gets its own screen, and no lesson is forced into an identical template. The rules that hold everywhere:

- **Predict before the reveal.** Predictions use `PredictionPrompt` (cyan, crosshair) so they never look like a decision (blue/orange) or an explanation (amber). Each prediction is a `PredictionAttempt` (`src/components/lesson/prediction-state.ts`) with a lifecycle of **unanswered → draft → locked → evaluated**:
  - While it is a draft, the learner can change both the answer and the confidence freely. Nothing about correctness is shown.
  - It locks only through an explicit action. That is either the step's primary button ("Lock prediction", "Submit my number", "Go there", "Run the comparison") or a "Confirm prediction" button inside the prompt, for predictions that open an experiment on the same screen.
  - Locking requires an answer **and** a confidence. A locked attempt is never edited, and locking is idempotent, so double taps can't misfire.
  - Feedback, reveals and recaps only ever read `lockedAnswer(...)`.
  - Replaying a lesson starts from fresh, empty attempts.
- **Confidence, 1–5, before every prediction is evaluated.** The scale is: 1 Just guessing, 2 Slightly, 3 Somewhat, 4 Very, 5 Extremely confident.
  - Nothing is pre-selected.
  - It is stored on the attempt it belongs to and shown back in `PredictionResult` and the locked prompt.
  - It never affects verdicts, gating or recaps.
  - Transfer questions are not predictions (they are answers checked immediately with feedback), so they don't ask for confidence. Neither do decisions such as prices, places, shots and the promise.
- **Name a concept only after the evidence.** "Dominant strategy", "level-k", "Nash equilibrium", "focal point" and "mixed strategy" each appear on the screen *after* the learner has seen the pattern they describe.
- **Feedback is graded, not green-by-default.** `FeedbackPanel` takes a `Verdict` (`match`, `defensible`, `misconception`, `depends`, `reasonable`). Green is reserved for answers that match the model.
  - `reasonable` is for a sensible prediction about something the learner couldn't know yet: the Lesson 2 crowd in round 1, or Nina's rule in Lesson 3 round 1. A miss there is never called a misconception.
  - `misconception` is kept for answers that contradict information on screen (the round-2 shared clue, the "everyone plays 0" belief) or the learner's own prediction. In Lesson 3 this is judged from the payoff table, where going to the café while unsure is a defensible hedge.
  - Every prediction's result also goes to the learning record (see [LEARNING_DATA.md](LEARNING_DATA.md)).
- **Feedback comes from state.** All learner-dependent wording lives in each lesson's `copy.ts` as pure functions of lesson state and the game engine, and is covered by `src/features/lessons/__tests__/lesson-copy.test.ts`.
- **Scripted opponents are described as scripted.** Rohan, Nina, Maya and the Lesson 2 crowd each follow a stated, fixed policy. The screens say so; nothing implies they adapted to the learner unless the model does (Maya reads past shots only).
- **Transfer questions don't name the concept.** After the learner answers, `TransferQuestion` shows what carries over from the lesson's model and where the analogy stops. A test checks that transfer prompts don't contain the concept's name.
- **Completion reflects the learner's path.** `Completion` shows a recap built from state (never a judgement of the person), one reflection question or challenge, and a hook into the next lesson.

## Lesson 1 · The Cooperation Trap (12 steps)

| # | Key | Objective | Learner action | Revealed | Insight / transition |
|---|---|---|---|---|---|
| 1 | `intro` | Situation | — | Two apps, one city, weekly simultaneous pricing | You run QuickEats against Rohan |
| 2 | `stakes` | Rules | Read | Goals (Kavya, Rohan) and all four outcomes in plain sentences | Everything needed to reason, no analysis yet |
| 3 | `predict` | Prediction | Predict Rohan's move, then pick the reason closest to yours | — | Prediction is locked |
| 4 | `decide` | Decision | Maintain or cut | Reminder of the learner's own prediction | Prediction and decision stay separate |
| 5 | `reveal` | Consequence | — | Both choices, profits, reactions, prediction vs actual; Rohan's fixed rule stated honestly | "Luck, or the numbers?" |
| 6 | `whatif` | Discovery | Set FoodKart both ways (gated) | Meera explains the actual week; counterfactual profits | Cutting pays 2 more against either choice |
| 7 | `matrix` | Concept | Reveal best replies | Dominant strategy named; feedback on the learner's earlier reason | The pattern gets its name |
| 8 | `trap` | Discovery | Respond to Rohan's "deal" | Both-maintain vs both-cut; Prisoner's Dilemma named | Promises don't change payoffs (`depends` if the learner keeps the deal) |
| 9 | `penalty` | Experiment | Predict the threshold, then move the slider | Exact regimes: p < 2 cut, p = 2 tie, p > 2 maintain; what changed vs what stayed the same | The result belongs to these numbers |
| 10 | `caveat` | Limits | Read | Kavya (customers) and Arjun (enforcement) | Better for companies ≠ better for everyone |
| 11 | `transfer` | Transfer | Coffee-shop advertising | Graded feedback + analogy | Same structure, different market |
| 12 | `done` | Reflection | — | Recap, reflection question, hook to Lesson 2 | — |

## Lesson 2 · The Strategy Detective (11 steps)

`intro` (simulated players stated up front) → `example` (scoring only) → `guess1` (**predict** the crowd's average, then pick) → `result1` (target, distance, prediction vs actual, and a note if the pick didn't follow from the learner's own forecast) → `guess2` (same crowd, one level deeper — stated as a simulation assumption) → `result2` (the rules didn't change, the answer did) → `types` (level-k named) → `lab` (**predict** the effect of an all-Theorist crowd, then use presets/counters) → `theory` (elimination to 0, plus how real groups actually play) → `transfer` (leaving a festival after "leave at 9:30" advice) → `done`.

## Lesson 3 · The Coordination Problem (11 steps)

`intro` → `stakes` (payoffs: shared goal, different tastes) → `pick1` (**predict** Nina, then choose) → `reveal1` (meeting result, prediction feedback that distinguishes a correct read not acted on, Nina's stated rule — all shown only after the reveal) → `matrix` (two equilibria; no dominant strategy because the best reply flips with Nina's choice) → `pick2` (shared clue; predict again) → `reveal2` → `focal` (focal point named) → `message` (explicit "what if" extension: one message; payoffs unchanged; the sender picks the equilibrium) → `transfer` (a study group split across two chat apps) → `done`.

The meetup payoffs are unchanged (8/7 café, 6/8 park, 0/0 miss).

## Lesson 4 · The Predictability Trap (10 steps)

`intro` → `first` → `series` (8 shots; Maya's read is shown after each) → `review` (her stated policy) → `compare` (**predict** which striker scores most, then run) → `mixed` (mixed strategy named; a mix is a distribution, not "always switch") → `lab` (**predict** what an 80/20 mix is worth against a keeper who knows it, then use the slider) → `caveat` (when unpredictability helps, and when consistency does — link back to Lesson 3) → `transfer` (ticket inspections where routes differ, so the best mix isn't uniform) → `done`.

## Lesson 5 · The Incentive Shift (11 steps)

`intro` → `rules` (the starting table; cutting's 2-point edge) → `proposal` (**predict** what a 1.5 reward does) → `verdict` (it narrows the gap to 0.5 but doesn't close it, and costs nothing because no one maintains; payoffs vs preferences vs information) → `designer` → `sandbox` (two levers, threshold p + r > 2, tie at exactly 2) → `enforcement` (**predict**, then stress-test the learner's own rule with imperfect detection) → `levers` (same behaviour, different bill) → `side-effects` → `transfer` (knowledge-sharing in a sales team) → `done` (a prediction challenge in an unfamiliar setting).

This replaces the earlier "run QuickEats for another week" steps, which repeated Lesson 1's decision.

### Model extension: imperfect detection

`withDetection(rules, d)` in `src/game/incentives.ts` multiplies the penalty by the detection rate `d` (a share from 0 to 1; the slider's percentage is divided by 100) and leaves the reward unchanged. This assumes companies weigh a fine by the chance of paying it. Everything else reuses the existing formulas, so the regime is decided by comparing `d·p + r` with 2:
- below 2, cutting is dominant again (stress-test answer "No");
- exactly 2 is a tie, where the model makes no prediction (answer "Can't tell");
- above 2, maintaining stays dominant (answer "Yes").

The base payoffs and the `p + r` threshold are unchanged, and the screen labels the extension as a "what if".

### Sandbox state
Whether the learner's rule works is always computed from the **current** sliders (`ruleWorks`); there is no latch.
- Continue is enabled only while maintaining is strictly dominant.
- The recap mentions the rule only if it works.
- Any actual change to the rules clears the stress-test prediction, slider and result (`changeRules`), because they belonged to the old rule.

### Lesson 4 lab phases
`mixLabPhase` runs **predict → experiment → review**:
- **Predict:** the prediction is a draft.
- **Experiment:** the prediction is locked, and the slider and simulation are available. Expected values and feedback stay hidden.
- **Review:** reached after the first simulation. Expected values and feedback on the 80% prediction are shown.
- **"Start the lab over"** returns the lab to its initial state, including a fresh prediction.

### Shared scenario data
- **Lesson 2:** the round-1 crowd (population and seed) is exported from `strategy-detective/copy.ts`. The crowd lab reuses that seed, so its "Round 1 mix" is exactly the crowd the learner played.
- **Lesson 3:** `meetupAnalysis` reports two pure-strategy equilibria and the mixed equilibrium (café 8/15 and 3/7, meeting about 50% of the time).
