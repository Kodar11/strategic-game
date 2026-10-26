# Lesson design

Every lesson follows the same learning cycle, adapted to its subject:

**Situation → Prediction → Decision → Consequence → Discovery → Experiment → Transfer → Reflection**

Not every stage gets its own screen, and no lesson is forced into an identical template. The rules that hold everywhere:

- **Predict before the reveal.** Predictions use `PredictionPrompt` (cyan, crosshair) so they never look like a decision (blue/orange) or an explanation (amber). A prediction locks when the learner commits, and is compared with the outcome using `PredictionResult`.
- **Name a concept only after the evidence.** "Dominant strategy", "level-k", "Nash equilibrium", "focal point" and "mixed strategy" each appear on the screen *after* the learner has seen the pattern they describe.
- **Feedback is graded, not green-by-default.** `FeedbackPanel` takes a `Verdict` (`match`, `defensible`, `misconception`, `depends`). Green is reserved for answers that match the model.
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

`withDetection(rules, d)` in `src/game/incentives.ts` multiplies the penalty by the detection rate `d` and leaves the reward unchanged. This assumes companies weigh a fine by the chance of paying it. Everything else reuses the existing formulas, so the threshold becomes `d·p + r > 2`. The base payoffs and the `p + r` threshold are unchanged, and the screen labels the extension as a "what if".
